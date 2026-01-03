import type {
  ExecutionContext,
  ExecutionContextLogger,
  ExecutionContextStore,
  CreateExecutionContextInput,
  GetExecutionContextByPathInput,
} from '../executionContextStores.js';

/**
 * Test-only in-memory execution context store used for unit tests.
 * This implementation mirrors the Supabase store semantics but avoids
 * being part of the runtime exports to prevent production fallback usage.
 */
export class TestExecutionContextStore implements ExecutionContextStore {
  private contexts = new Map<string, ExecutionContext>();
  private pathIndex = new Map<string, string>(); // pathKey -> contextId

  constructor(private logger?: ExecutionContextLogger) {}

  private getPathKey(input: GetExecutionContextByPathInput): string {
    return `${input.tenantId}:${input.conversationId}:${input.pathId}`;
  }

  async createContext(input: CreateExecutionContextInput): Promise<ExecutionContext> {
    const pathKey = this.getPathKey(input);

    // Check if context already exists for this path (prevents race condition)
    const existingContextId = this.pathIndex.get(pathKey);
    if (existingContextId) {
      const existingContext = this.contexts.get(existingContextId);
      if (existingContext && !existingContext.terminatedAt) {
        throw new Error(
          `Execution context already exists for path: ${input.pathId} (contextId: ${existingContextId})`
        );
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const ttl = input.ttlMinutes ?? 30;

    const context: ExecutionContext = {
      id,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      pathId: input.pathId,
      sandboxId: input.sandboxId,
      sandboxStatus: 'creating',
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + ttl * 60 * 1000),
    };

    this.contexts.set(id, context);
    this.pathIndex.set(pathKey, id);

    this.logger?.info('[TestExecutionContextStore] Created context', {
      contextId: id,
      pathId: input.pathId,
      sandboxId: input.sandboxId,
      ttlMinutes: ttl,
    });

    return context;
  }

  async getContextByPath(input: GetExecutionContextByPathInput): Promise<ExecutionContext | null> {
    const pathKey = this.getPathKey(input);
    const contextId = this.pathIndex.get(pathKey);

    if (!contextId) {
      return null;
    }

    const context = this.contexts.get(contextId);

    // Filter out terminated contexts (match Supabase behavior)
    if (context && context.terminatedAt) {
      return null;
    }

    return context ?? null;
  }

  async touchContext(contextId: string, ttlMinutes: number = 30): Promise<void> {
    const context = this.contexts.get(contextId);

    if (!context) {
      throw new Error(`Execution context not found: ${contextId}`);
    }

    if (context.terminatedAt) {
      throw new Error(`Execution context is terminated: ${contextId}`);
    }

    const now = new Date();
    context.lastUsedAt = now;
    context.expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    this.logger?.info('[TestExecutionContextStore] Touched context', {
      contextId,
      newExpiresAt: context.expiresAt.toISOString(),
    });
  }

  async updateStatus(
    contextId: string,
    status: ExecutionContext['sandboxStatus'],
    errorMessage?: string
  ): Promise<void> {
    const context = this.contexts.get(contextId);

    if (!context) {
      throw new Error(`Execution context not found: ${contextId}`);
    }

    context.sandboxStatus = status;
    if (errorMessage) {
      context.errorMessage = errorMessage;
    }

    this.logger?.info('[TestExecutionContextStore] Updated status', {
      contextId,
      status,
      errorMessage,
    });
  }

  async terminateContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);

    if (!context) {
      throw new Error(`Execution context not found: ${contextId}`);
    }

    context.terminatedAt = new Date();
    context.sandboxStatus = 'terminated';

    this.logger?.info('[TestExecutionContextStore] Terminated context', {
      contextId,
      pathId: context.pathId,
    });
  }

  async getExpiredContexts(limit: number = 50): Promise<ExecutionContext[]> {
    const now = new Date();
    const expired: ExecutionContext[] = [];

    for (const context of this.contexts.values()) {
      if (!context.terminatedAt && context.expiresAt < now) {
        expired.push(context);

        if (expired.length >= limit) {
          break;
        }
      }
    }

    return expired;
  }

  async isReady(): Promise<boolean> {
    return true;
  }

  // Test helpers
  clear(): void {
    this.contexts.clear();
    this.pathIndex.clear();
  }

  size(): number {
    return this.contexts.size;
  }
}
