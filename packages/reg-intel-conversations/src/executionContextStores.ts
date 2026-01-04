/**
 * Execution Context Stores - E2B Per-Path Sandbox Management
 *
 * This module provides storage and lifecycle management for E2B execution contexts,
 * enabling per-path sandboxes with lazy creation, TTL-based expiry, and cleanup.
 *
 * Architecture:
 * - Each (tenantId, conversationId, pathId) tuple gets its own execution context
 * - Contexts are lazily created when code execution is needed
 * - TTL-based lifecycle with automatic expiry and cleanup
 * - Branch isolation: new branches get fresh contexts
 * - Merge cleanup: source path contexts are terminated
 *
 * References:
 * - docs/architecture/architecture_v_0_7.md
 * - docs/architecture/execution-context/spec_v_0_1.md
 */

// Import SupabaseLikeClient from conversationStores to avoid duplication
import type { SupabaseLikeClient } from './conversationStores.js';
import { createLogger, withSpan } from '@reg-copilot/reg-intel-observability';
import {
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_SQL_TABLE,
} from '@opentelemetry/semantic-conventions';

const logger = createLogger('ExecutionContextStore');

/**
 * Execution context represents a running E2B sandbox for a specific conversation path
 */
export interface ExecutionContext {
  /** Unique identifier for this execution context */
  id: string;

  /** Tenant this context belongs to */
  tenantId: string;

  /** Conversation this context belongs to */
  conversationId: string;

  /** Path within the conversation (branches have different paths) */
  pathId: string;

  /** E2B sandbox identifier (for reconnection) */
  sandboxId: string;

  /** Current status of the sandbox */
  sandboxStatus: 'creating' | 'ready' | 'error' | 'terminated';

  /** When this context was created */
  createdAt: Date;

  /** Last time this context was used (updated on each tool call) */
  lastUsedAt: Date;

  /** When this context will expire (TTL-based) */
  expiresAt: Date;

  /** When this context was terminated (if applicable) */
  terminatedAt?: Date | null;

  /** Error message if status is 'error' */
  errorMessage?: string | null;

  /** Resource usage metrics (CPU, memory, etc.) */
  resourceUsage?: Record<string, unknown>;
}

/**
 * Input for creating a new execution context
 */
export interface CreateExecutionContextInput {
  /** Tenant ID */
  tenantId: string;

  /** Conversation ID */
  conversationId: string;

  /** Path ID within the conversation */
  pathId: string;

  /** E2B sandbox ID */
  sandboxId: string;

  /** TTL in minutes (default: 30) */
  ttlMinutes?: number;
}

/**
 * Input for getting execution context by path
 */
export interface GetExecutionContextByPathInput {
  /** Tenant ID */
  tenantId: string;

  /** Conversation ID */
  conversationId: string;

  /** Path ID */
  pathId: string;
}

/**
 * Logger interface for execution context operations
 */
export interface ExecutionContextLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(meta: Record<string, unknown>, message?: string): void;
}

/**
 * Store interface for execution context persistence
 */
export interface ExecutionContextStore {
  /**
   * Create a new execution context for a path
   */
  createContext(input: CreateExecutionContextInput): Promise<ExecutionContext>;

  /**
   * Get execution context by path
   * Returns null if no context exists for this path
   */
  getContextByPath(input: GetExecutionContextByPathInput): Promise<ExecutionContext | null>;

  /**
   * Update last used timestamp and extend TTL
   * This is called on every tool execution to keep the sandbox alive
   */
  touchContext(contextId: string, ttlMinutes?: number): Promise<void>;

  /**
   * Update sandbox status
   */
  updateStatus(
    contextId: string,
    status: ExecutionContext['sandboxStatus'],
    errorMessage?: string
  ): Promise<void>;

  /**
   * Terminate context (soft delete by setting terminated_at)
   * This marks the sandbox for cleanup but doesn't remove the record
   */
  terminateContext(contextId: string): Promise<void>;

  /**
   * Get expired contexts for cleanup job
   * Returns contexts where expires_at < now() and terminated_at is null
   */
  getExpiredContexts(limit?: number): Promise<ExecutionContext[]>;

  /**
   * Health check - verify store is operational
   */
  isReady(): Promise<boolean>;
}

/**
 * Supabase implementation of ExecutionContextStore
 * Used in production
 */
export class SupabaseExecutionContextStore implements ExecutionContextStore {
  constructor(
    private supabase: SupabaseLikeClient,
    private logger?: ExecutionContextLogger
  ) {}

  /**
   * Wrap database operations with OpenTelemetry instrumentation and debug logging
   */
  private wrapOperation<T>(
    input: { operation: string; table: string; tenantId: string; contextId?: string },
    fn: () => Promise<T>
  ): Promise<T> {
    return withSpan(
      'db.supabase.execution_context_operation',
      {
        [SEMATTRS_DB_SYSTEM]: 'postgresql',
        [SEMATTRS_DB_NAME]: 'supabase',
        [SEMATTRS_DB_OPERATION]: input.operation,
        [SEMATTRS_DB_SQL_TABLE]: input.table,
        'app.tenant.id': input.tenantId,
        ...(input.contextId ? { 'app.execution_context.id': input.contextId } : {}),
      },
      async () => {
        logger.debug(
          {
            operation: input.operation,
            table: input.table,
            tenantId: input.tenantId,
            contextId: input.contextId,
          },
          `DB ${input.operation.toUpperCase()} on ${input.table}`
        );
        return fn();
      }
    );
  }

  private mapRow(row: any): ExecutionContext {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      conversationId: row.conversation_id,
      pathId: row.path_id,
      sandboxId: row.sandbox_id,
      sandboxStatus: row.sandbox_status,
      createdAt: new Date(row.created_at),
      lastUsedAt: new Date(row.last_used_at),
      expiresAt: new Date(row.expires_at),
      terminatedAt: row.terminated_at ? new Date(row.terminated_at) : null,
      errorMessage: row.error_message,
      resourceUsage: row.resource_usage,
    };
  }

  async createContext(input: CreateExecutionContextInput): Promise<ExecutionContext> {
    const ttl = input.ttlMinutes ?? 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 60 * 1000);

    return this.wrapOperation(
      {
        operation: 'insert',
        table: 'execution_contexts',
        tenantId: input.tenantId,
      },
      async () => {
        // Try to insert directly - let the database enforce uniqueness
        // This is more robust for multi-instance deployments than check-then-insert
        const { data, error } = await this.supabase
          .from('execution_contexts')
          .insert({
            tenant_id: input.tenantId,
            conversation_id: input.conversationId,
            path_id: input.pathId,
            sandbox_id: input.sandboxId,
            sandbox_status: 'creating',
            expires_at: expiresAt.toISOString(),
          })
          .select()
          .single();

        if (error) {
          // Check if this is a unique constraint violation (PostgreSQL error code 23505)
          // This can happen in multi-instance deployments when two instances try to create concurrently
          if (error.code === '23505' || error.message?.includes('duplicate key')) {
            this.logger?.warn('[SupabaseExecutionContextStore] Concurrent creation detected, fetching existing context', {
              pathId: input.pathId,
              error: error.message,
            });

            // Another instance won the race - fetch the existing context
            const existing = await this.getContextByPath({
              tenantId: input.tenantId,
              conversationId: input.conversationId,
              pathId: input.pathId,
            });

            if (existing) {
              this.logger?.info('[SupabaseExecutionContextStore] Using context created by concurrent request', {
                contextId: existing.id,
                pathId: input.pathId,
                sandboxId: existing.sandboxId,
              });
              return existing;
            }

            // This shouldn't happen - constraint violation but no existing context found
            // Possible if context was terminated between insert attempt and fetch
            this.logger?.error('[SupabaseExecutionContextStore] Constraint violation but no existing context found', {
              pathId: input.pathId,
              error: error.message,
            });
          }

          // Not a constraint violation, or couldn't recover - throw error
          this.logger?.error('[SupabaseExecutionContextStore] Failed to create context', {
            error: error.message,
            code: error.code,
            pathId: input.pathId,
          });
          throw new Error(`Failed to create execution context: ${error.message}`);
        }

        const context = this.mapRow(data);

        this.logger?.info('[SupabaseExecutionContextStore] Created context', {
          contextId: context.id,
          pathId: input.pathId,
          sandboxId: input.sandboxId,
          ttlMinutes: ttl,
        });

        return context;
      }
    );
  }

  async getContextByPath(input: GetExecutionContextByPathInput): Promise<ExecutionContext | null> {
    return this.wrapOperation(
      {
        operation: 'select',
        table: 'execution_contexts',
        tenantId: input.tenantId,
      },
      async () => {
        const { data, error } = await this.supabase
          .from('execution_contexts')
          .select('*')
          .eq('tenant_id', input.tenantId)
          .eq('conversation_id', input.conversationId)
          .eq('path_id', input.pathId)
          .is('terminated_at', null) // Only get non-terminated contexts
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // No rows returned - this is expected
            return null;
          }

          this.logger?.error('[SupabaseExecutionContextStore] Failed to get context by path', {
            error: error.message,
            pathId: input.pathId,
          });
          throw new Error(`Failed to get execution context: ${error.message}`);
        }

        return data ? this.mapRow(data) : null;
      }
    );
  }

  async touchContext(contextId: string, ttlMinutes: number = 30): Promise<void> {
    if (!this.supabase.rpc) {
      throw new Error('Supabase client does not support RPC operations');
    }

    const { error } = await this.supabase.rpc('touch_execution_context', {
      p_context_id: contextId,
      p_ttl_minutes: ttlMinutes,
    });

    if (error) {
      this.logger?.error('[SupabaseExecutionContextStore] Failed to touch context', {
        error: error.message,
        contextId,
      });
      throw new Error(`Failed to touch execution context: ${error.message}`);
    }

    this.logger?.info('[SupabaseExecutionContextStore] Touched context', {
      contextId,
      ttlMinutes,
    });
  }

  async updateStatus(
    contextId: string,
    status: ExecutionContext['sandboxStatus'],
    errorMessage?: string
  ): Promise<void> {
    // Note: We don't have tenantId here, so we'll use a placeholder for the wrapper
    return this.wrapOperation(
      {
        operation: 'update',
        table: 'execution_contexts',
        tenantId: 'unknown', // contextId-based operations don't have tenantId available
        contextId,
      },
      async () => {
        const updateData: any = { sandbox_status: status };
        if (errorMessage !== undefined) {
          updateData.error_message = errorMessage;
        }

        const { error } = await this.supabase
          .from('execution_contexts')
          .update(updateData)
          .eq('id', contextId);

        if (error) {
          this.logger?.error('[SupabaseExecutionContextStore] Failed to update status', {
            error: error.message,
            contextId,
            status,
          });
          throw new Error(`Failed to update execution context status: ${error.message}`);
        }

        this.logger?.info('[SupabaseExecutionContextStore] Updated status', {
          contextId,
          status,
          errorMessage,
        });
      }
    );
  }

  async terminateContext(contextId: string): Promise<void> {
    return this.wrapOperation(
      {
        operation: 'update',
        table: 'execution_contexts',
        tenantId: 'unknown', // contextId-based operations don't have tenantId available
        contextId,
      },
      async () => {
        const { error } = await this.supabase
          .from('execution_contexts')
          .update({
            terminated_at: new Date().toISOString(),
            sandbox_status: 'terminated',
          })
          .eq('id', contextId);

        if (error) {
          this.logger?.error('[SupabaseExecutionContextStore] Failed to terminate context', {
            error: error.message,
            contextId,
          });
          throw new Error(`Failed to terminate execution context: ${error.message}`);
        }

        this.logger?.info('[SupabaseExecutionContextStore] Terminated context', {
          contextId,
        });
      }
    );
  }

  async getExpiredContexts(limit: number = 50): Promise<ExecutionContext[]> {
    if (!this.supabase.rpc) {
      throw new Error('Supabase client does not support RPC operations');
    }

    const { data, error } = await this.supabase.rpc('get_expired_execution_contexts', {
      p_limit: limit,
    });

    if (error) {
      this.logger?.error('[SupabaseExecutionContextStore] Failed to get expired contexts', {
        error: error.message,
      });
      throw new Error(`Failed to get expired execution contexts: ${error.message}`);
    }

    return (data ?? []).map((row: any) => this.mapRow(row));
  }

  async isReady(): Promise<boolean> {
    try {
      // Simple health check: query for count
      const { error } = await this.supabase
        .from('execution_contexts')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      return !error;
    } catch (error) {
      this.logger?.error('[SupabaseExecutionContextStore] Health check failed', {
        error,
      });
      return false;
    }
  }
}
