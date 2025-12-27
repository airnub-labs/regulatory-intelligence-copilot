/**
 * Execution Context Manager - E2B Sandbox Lifecycle Management
 *
 * This module manages the lifecycle of E2B sandboxes for conversation paths,
 * including lazy creation, reuse, TTL extension, and cleanup.
 *
 * Architecture:
 * - Lazy Creation: Sandboxes created on-demand when code execution is needed
 * - Reuse: Same path reuses its sandbox across multiple tool calls
 * - TTL Extension: Each use extends the sandbox TTL (default 30 min)
 * - Cleanup: Expired sandboxes are automatically terminated by cleanup job
 * - Isolation: Each path gets its own isolated sandbox
 *
 * References:
 * - docs/architecture/architecture_v_0_7.md
 * - docs/architecture/execution-context/spec_v_0_1.md
 */

import { createLogger, withSpan } from '@reg-copilot/reg-intel-observability';
import type {
  ExecutionContextStore,
  ExecutionContext,
  ExecutionContextLogger,
} from './executionContextStores.js';

/**
 * Minimal E2B Sandbox interface for type safety
 * The actual implementation will come from @e2b/code-interpreter
 */
export interface E2BSandbox {
  /** Unique sandbox identifier */
  sandboxId: string;

  /** Kill the sandbox and clean up resources */
  kill(): Promise<void>;

  /** Execute code in the sandbox */
  runCode(code: string, opts?: { language?: string }): Promise<{
    exitCode?: number;
    logs: { stdout: string[]; stderr: string[] };
    results?: unknown[];
  }>;
}

/**
 * E2B client interface for creating and reconnecting to sandboxes
 */
export interface E2BClient {
  /** Create a new sandbox */
  create(opts?: { apiKey?: string; timeout?: number }): Promise<E2BSandbox>;

  /** Reconnect to an existing sandbox */
  reconnect(sandboxId: string, opts?: { apiKey?: string }): Promise<E2BSandbox>;
}

/**
 * Configuration for ExecutionContextManager
 */
export interface ExecutionContextManagerConfig {
  /** Storage backend for execution contexts */
  store: ExecutionContextStore;

  /** E2B client for sandbox management */
  e2bClient: E2BClient;

  /** E2B API key (optional if client already configured) */
  e2bApiKey?: string;

  /** Default TTL in minutes (default: 30) */
  defaultTtlMinutes?: number;

  /** Sandbox timeout in milliseconds (default: 600000 = 10 min) */
  sandboxTimeoutMs?: number;

  /** Logger for execution context operations */
  logger?: ExecutionContextLogger;
}

/**
 * Input for getting or creating execution context
 */
export interface GetOrCreateContextInput {
  /** Tenant ID */
  tenantId: string;

  /** Conversation ID */
  conversationId: string;

  /** Path ID */
  pathId: string;
}

/**
 * Result of getting or creating execution context
 */
export interface GetOrCreateContextResult {
  /** The execution context record */
  context: ExecutionContext;

  /** The E2B sandbox instance */
  sandbox: E2BSandbox;

  /** Whether this context was newly created */
  wasCreated: boolean;
}

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  /** Number of contexts cleaned up */
  cleaned: number;

  /** Number of errors encountered */
  errors: number;

  /** Error details */
  errorDetails?: Array<{ contextId: string; error: string }>;
}

/**
 * Manages E2B sandbox lifecycle for conversation paths
 */
export class ExecutionContextManager {
  private activeSandboxes = new Map<string, E2BSandbox>(); // contextId -> Sandbox
  private readonly defaultTtl: number;
  private readonly sandboxTimeout: number;
  private logger: ExecutionContextLogger;

  constructor(private config: ExecutionContextManagerConfig) {
    this.defaultTtl = config.defaultTtlMinutes ?? 30;
    this.sandboxTimeout = config.sandboxTimeoutMs ?? 600_000; // 10 minutes
    this.logger = config.logger ?? createLogger('ExecutionContextManager');
  }

  /**
   * Get or create execution context for a path.
   * This is the main entry point for code execution tools.
   *
   * Behavior:
   * - If context exists and is valid: return existing sandbox
   * - If context exists but is terminated: create new context
   * - If no context exists: create new context + sandbox
   * - Always extends TTL on access
   */
  async getOrCreateContext(input: GetOrCreateContextInput): Promise<GetOrCreateContextResult> {
    return withSpan(
      'execution_context.get_or_create',
      {
        'execution_context.tenant_id': input.tenantId,
        'execution_context.conversation_id': input.conversationId,
        'execution_context.path_id': input.pathId,
      },
      async () => {
        this.logger.info('Getting or creating context', {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          pathId: input.pathId,
        });

        this.logger.debug({
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          pathId: input.pathId,
          activeSandboxCount: this.activeSandboxes.size,
        }, 'Checking for existing execution context');

        // Try to get existing context
        let context = await this.config.store.getContextByPath(input);

    // If context was terminated, treat as non-existent
    if (context && context.terminatedAt) {
      this.logger.info('Context was terminated, creating new one', {
        contextId: context.id,
        pathId: input.pathId,
      });
      context = null;
    }

    if (context) {
      this.logger.debug({
        contextId: context.id,
        sandboxId: context.sandboxId,
        sandboxStatus: context.sandboxStatus,
        expiresAt: context.expiresAt,
      }, 'Found existing execution context');

      // Extend TTL by touching
      await this.config.store.touchContext(context.id, this.defaultTtl);

      this.logger.debug({
        contextId: context.id,
        ttlMinutes: this.defaultTtl,
      }, 'Extended execution context TTL');

      // Get or reconnect to sandbox
      let sandbox = this.activeSandboxes.get(context.id);

      if (!sandbox) {
        // Sandbox not in memory, try to reconnect
        this.logger.info('Reconnecting to sandbox', {
          contextId: context.id,
          sandboxId: context.sandboxId,
        });

        this.logger.debug({
          contextId: context.id,
          sandboxId: context.sandboxId,
        }, 'Sandbox not in cache, attempting reconnect');

        try {
          sandbox = await this.config.e2bClient.reconnect(context.sandboxId, {
            apiKey: this.config.e2bApiKey,
          });

          this.activeSandboxes.set(context.id, sandbox);

          this.logger.info('Reconnected to sandbox', {
            contextId: context.id,
            sandboxId: context.sandboxId,
          });

          this.logger.debug({
            contextId: context.id,
            sandboxId: context.sandboxId,
          }, 'Successfully reconnected to sandbox');
        } catch (error) {
          // Reconnection failed - sandbox might have been killed
          this.logger.error('Failed to reconnect to sandbox', {
            contextId: context.id,
            sandboxId: context.sandboxId,
            error,
          });

          this.logger.debug({
            contextId: context.id,
            sandboxId: context.sandboxId,
            error: error instanceof Error ? error.message : String(error),
          }, 'Reconnection failed, marking context as terminated');

          // Mark context as terminated and create new one
          await this.config.store.terminateContext(context.id);
          context = null;
        }
      } else {
        this.logger.debug({
          contextId: context.id,
          sandboxId: context.sandboxId,
        }, 'Sandbox found in cache, reusing');
      }

      if (context && sandbox) {
        this.logger.debug({
          contextId: context.id,
          sandboxId: context.sandboxId,
          wasCreated: false,
        }, 'Returning existing execution context');

        return {
          context,
          sandbox,
          wasCreated: false,
        };
      }
    }

    // Create new sandbox
    this.logger.info('Creating new sandbox', {
      pathId: input.pathId,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
    });

    this.logger.debug({
      pathId: input.pathId,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      timeout: this.sandboxTimeout,
      ttl: this.defaultTtl,
    }, 'Initiating E2B sandbox creation');

    const sandbox = await this.config.e2bClient.create({
      apiKey: this.config.e2bApiKey,
      timeout: this.sandboxTimeout,
    });

    this.logger.debug({
      sandboxId: sandbox.sandboxId,
    }, 'E2B sandbox created, creating execution context record');

    // Create execution context record
    const newContext = await this.config.store.createContext({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      pathId: input.pathId,
      sandboxId: sandbox.sandboxId,
      ttlMinutes: this.defaultTtl,
    });

    this.logger.debug({
      contextId: newContext.id,
      sandboxId: sandbox.sandboxId,
    }, 'Execution context record created, marking as ready');

    // Mark as ready
    await this.config.store.updateStatus(newContext.id, 'ready');
    newContext.sandboxStatus = 'ready';

    // Cache sandbox
    this.activeSandboxes.set(newContext.id, sandbox);

    this.logger.debug({
      contextId: newContext.id,
      sandboxId: sandbox.sandboxId,
      cachedSandboxCount: this.activeSandboxes.size,
    }, 'Sandbox cached in memory');

        this.logger.info('Created new context', {
          contextId: newContext.id,
          pathId: input.pathId,
          sandboxId: sandbox.sandboxId,
          ttlMinutes: this.defaultTtl,
        });

        this.logger.debug({
          contextId: newContext.id,
          sandboxId: sandbox.sandboxId,
          wasCreated: true,
        }, 'Returning new execution context');

        return {
          context: newContext,
          sandbox,
          wasCreated: true,
        };
      }
    );
  }

  /**
   * Get execution context by path (if exists)
   * This is useful for cleanup operations like merge
   * Returns null if no context exists for the path
   */
  async getContextByPath(input: {
    tenantId: string;
    conversationId: string;
    pathId: string;
  }): Promise<ExecutionContext | null> {
    return this.config.store.getContextByPath(input);
  }

  /**
   * Terminate execution context and kill sandbox
   * This is called when:
   * - Path is merged (source path cleanup)
   * - Manual cleanup requested
   * - Cleanup job finds expired context
   */
  async terminateContext(contextId: string): Promise<void> {
    this.logger.info('Terminating context', {
      contextId,
    });

    this.logger.debug({
      contextId,
      cachedSandboxCount: this.activeSandboxes.size,
      isInCache: this.activeSandboxes.has(contextId),
    }, 'Starting context termination');

    // Get sandbox from cache
    const sandbox = this.activeSandboxes.get(contextId);

    if (sandbox) {
      this.logger.debug({
        contextId,
        sandboxId: sandbox.sandboxId,
      }, 'Sandbox found in cache, killing');

      try {
        // Kill the sandbox
        await sandbox.kill();

        this.logger.info('Sandbox killed', {
          contextId,
          sandboxId: sandbox.sandboxId,
        });

        this.logger.debug({
          contextId,
          sandboxId: sandbox.sandboxId,
        }, 'Sandbox killed successfully');
      } catch (error) {
        this.logger.error('Failed to kill sandbox', {
          contextId,
          error,
        });

        this.logger.debug({
          contextId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Sandbox kill failed, continuing with termination');
        // Continue with context termination even if sandbox kill fails
      }

      // Remove from cache
      this.activeSandboxes.delete(contextId);

      this.logger.debug({
        contextId,
        cachedSandboxCount: this.activeSandboxes.size,
      }, 'Sandbox removed from cache');
    } else {
      this.logger.debug({
        contextId,
      }, 'Sandbox not in cache, only marking as terminated in database');
    }

    // Mark context as terminated in database
    await this.config.store.terminateContext(contextId);

    this.logger.info('Context terminated', {
      contextId,
    });

    this.logger.debug({
      contextId,
    }, 'Context termination complete');
  }

  /**
   * Cleanup expired contexts
   * This is called by the cleanup job (runs every 15 minutes)
   *
   * Process:
   * 1. Get expired contexts from store
   * 2. Terminate each context (kill sandbox + mark terminated)
   * 3. Return cleanup statistics
   */
  async cleanupExpired(limit: number = 50): Promise<CleanupResult> {
    this.logger.info('Starting execution context cleanup', { limit });

    const expired = await this.config.store.getExpiredContexts(limit);

    if (expired.length === 0) {
      this.logger.info('No expired execution contexts found');
      return { cleaned: 0, errors: 0 };
    }

    this.logger.info('Found expired execution contexts', {
      count: expired.length,
    });

    let cleaned = 0;
    let errors = 0;
    const errorDetails: Array<{ contextId: string; error: string }> = [];

    for (const context of expired) {
      try {
        await this.terminateContext(context.id);
        cleaned++;
      } catch (error) {
        errors++;
        const errorMessage = error instanceof Error ? error.message : String(error);

        errorDetails.push({
          contextId: context.id,
          error: errorMessage,
        });

        this.logger.error('Failed to cleanup execution context', {
          contextId: context.id,
          pathId: context.pathId,
          error: errorMessage,
        });
      }
    }

    this.logger.info('Execution context cleanup completed', {
      cleaned,
      errors,
      total: expired.length,
    });

    return {
      cleaned,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    };
  }

  /**
   * Update resource usage for a context
   * This can be called after code execution to track metrics
   */
  async updateResourceUsage(
    contextId: string,
    usage: Record<string, unknown>
  ): Promise<void> {
    // Note: This would require adding a method to ExecutionContextStore
    // For now, just log it
    this.logger.info('Resource usage update', {
      contextId,
      usage,
    });
  }

  /**
   * Get statistics about active sandboxes
   * Useful for monitoring and debugging
   */
  getStats(): {
    activeSandboxes: number;
    cachedContextIds: string[];
  } {
    return {
      activeSandboxes: this.activeSandboxes.size,
      cachedContextIds: Array.from(this.activeSandboxes.keys()),
    };
  }

  /**
   * Health check - verify manager is operational
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Check if store is ready
      const storeReady = await this.config.store.isReady();

      if (!storeReady) {
        this.logger.error('ExecutionContextManager store not ready');
        return false;
      }

      // Could add E2B client health check here if needed

      return true;
    } catch (error) {
      this.logger.error('ExecutionContextManager health check failed', { error });
      return false;
    }
  }

  /**
   * Shutdown - cleanup all active sandboxes
   * This should be called on application shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down execution contexts', {
      activeSandboxes: this.activeSandboxes.size,
    });

    const killPromises: Promise<void>[] = [];

    for (const [contextId, sandbox] of this.activeSandboxes.entries()) {
      killPromises.push(
        (async () => {
          try {
            await sandbox.kill();
            this.logger.info('Killed sandbox during shutdown', {
              contextId,
              sandboxId: sandbox.sandboxId,
            });
          } catch (error) {
            this.logger.error('Failed to kill sandbox during shutdown', {
              contextId,
              error,
            });
          }
        })()
      );
    }

    await Promise.all(killPromises);
    this.activeSandboxes.clear();

    this.logger.info('Execution context shutdown complete');
  }
}
