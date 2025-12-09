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

import { withSpan } from '@reg-copilot/reg-intel-observability';
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

  constructor(private config: ExecutionContextManagerConfig) {
    this.defaultTtl = config.defaultTtlMinutes ?? 30;
    this.sandboxTimeout = config.sandboxTimeoutMs ?? 600_000; // 10 minutes
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
        this.config.logger?.info('[ExecutionContextManager] Getting or creating context', {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          pathId: input.pathId,
        });

        // Try to get existing context
        let context = await this.config.store.getContextByPath(input);

    // If context was terminated, treat as non-existent
    if (context && context.terminatedAt) {
      this.config.logger?.info('[ExecutionContextManager] Context was terminated, creating new one', {
        contextId: context.id,
        pathId: input.pathId,
      });
      context = null;
    }

    if (context) {
      // Extend TTL by touching
      await this.config.store.touchContext(context.id, this.defaultTtl);

      // Get or reconnect to sandbox
      let sandbox = this.activeSandboxes.get(context.id);

      if (!sandbox) {
        // Sandbox not in memory, try to reconnect
        this.config.logger?.info('[ExecutionContextManager] Reconnecting to sandbox', {
          contextId: context.id,
          sandboxId: context.sandboxId,
        });

        try {
          sandbox = await this.config.e2bClient.reconnect(context.sandboxId, {
            apiKey: this.config.e2bApiKey,
          });

          this.activeSandboxes.set(context.id, sandbox);

          this.config.logger?.info('[ExecutionContextManager] Reconnected to sandbox', {
            contextId: context.id,
            sandboxId: context.sandboxId,
          });
        } catch (error) {
          // Reconnection failed - sandbox might have been killed
          this.config.logger?.error('[ExecutionContextManager] Failed to reconnect to sandbox', {
            contextId: context.id,
            sandboxId: context.sandboxId,
            error,
          });

          // Mark context as terminated and create new one
          await this.config.store.terminateContext(context.id);
          context = null;
        }
      }

      if (context && sandbox) {
        return {
          context,
          sandbox,
          wasCreated: false,
        };
      }
    }

    // Create new sandbox
    this.config.logger?.info('[ExecutionContextManager] Creating new sandbox', {
      pathId: input.pathId,
    });

    const sandbox = await this.config.e2bClient.create({
      apiKey: this.config.e2bApiKey,
      timeout: this.sandboxTimeout,
    });

    // Create execution context record
    const newContext = await this.config.store.createContext({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      pathId: input.pathId,
      sandboxId: sandbox.sandboxId,
      ttlMinutes: this.defaultTtl,
    });

    // Mark as ready
    await this.config.store.updateStatus(newContext.id, 'ready');
    newContext.sandboxStatus = 'ready';

    // Cache sandbox
    this.activeSandboxes.set(newContext.id, sandbox);

        this.config.logger?.info('[ExecutionContextManager] Created new context', {
          contextId: newContext.id,
          pathId: input.pathId,
          sandboxId: sandbox.sandboxId,
          ttlMinutes: this.defaultTtl,
        });

        return {
          context: newContext,
          sandbox,
          wasCreated: true,
        };
      }
    );
  }

  /**
   * Terminate execution context and kill sandbox
   * This is called when:
   * - Path is merged (source path cleanup)
   * - Manual cleanup requested
   * - Cleanup job finds expired context
   */
  async terminateContext(contextId: string): Promise<void> {
    this.config.logger?.info('[ExecutionContextManager] Terminating context', {
      contextId,
    });

    // Get sandbox from cache
    const sandbox = this.activeSandboxes.get(contextId);

    if (sandbox) {
      try {
        // Kill the sandbox
        await sandbox.kill();

        this.config.logger?.info('[ExecutionContextManager] Sandbox killed', {
          contextId,
          sandboxId: sandbox.sandboxId,
        });
      } catch (error) {
        this.config.logger?.error('[ExecutionContextManager] Failed to kill sandbox', {
          contextId,
          error,
        });
        // Continue with context termination even if sandbox kill fails
      }

      // Remove from cache
      this.activeSandboxes.delete(contextId);
    }

    // Mark context as terminated in database
    await this.config.store.terminateContext(contextId);

    this.config.logger?.info('[ExecutionContextManager] Context terminated', {
      contextId,
    });
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
    this.config.logger?.info('[ExecutionContextManager] Starting cleanup', { limit });

    const expired = await this.config.store.getExpiredContexts(limit);

    if (expired.length === 0) {
      this.config.logger?.info('[ExecutionContextManager] No expired contexts found');
      return { cleaned: 0, errors: 0 };
    }

    this.config.logger?.info('[ExecutionContextManager] Found expired contexts', {
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

        this.config.logger?.error('[ExecutionContextManager] Failed to cleanup context', {
          contextId: context.id,
          pathId: context.pathId,
          error: errorMessage,
        });
      }
    }

    this.config.logger?.info('[ExecutionContextManager] Cleanup completed', {
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
    this.config.logger?.info('[ExecutionContextManager] Resource usage update', {
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
        this.config.logger?.error('[ExecutionContextManager] Store not ready');
        return false;
      }

      // Could add E2B client health check here if needed

      return true;
    } catch (error) {
      this.config.logger?.error('[ExecutionContextManager] Health check failed', { error });
      return false;
    }
  }

  /**
   * Shutdown - cleanup all active sandboxes
   * This should be called on application shutdown
   */
  async shutdown(): Promise<void> {
    this.config.logger?.info('[ExecutionContextManager] Shutting down', {
      activeSandboxes: this.activeSandboxes.size,
    });

    const killPromises: Promise<void>[] = [];

    for (const [contextId, sandbox] of this.activeSandboxes.entries()) {
      killPromises.push(
        (async () => {
          try {
            await sandbox.kill();
            this.config.logger?.info('[ExecutionContextManager] Killed sandbox during shutdown', {
              contextId,
              sandboxId: sandbox.sandboxId,
            });
          } catch (error) {
            this.config.logger?.error('[ExecutionContextManager] Failed to kill sandbox during shutdown', {
              contextId,
              error,
            });
          }
        })()
      );
    }

    await Promise.all(killPromises);
    this.activeSandboxes.clear();

    this.config.logger?.info('[ExecutionContextManager] Shutdown complete');
  }
}
