/**
 * Execution Context Helpers for Next.js Applications
 *
 * Provides utilities for creating and managing ExecutionContextManager
 * in Next.js API routes and applications.
 */

import {
  ExecutionContextManager,
  SupabaseExecutionContextStore,
  type ExecutionContextStore,
  type E2BClient,
  type E2BQuotaCheckCallback,
} from '@reg-copilot/reg-intel-conversations';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@reg-copilot/reg-intel-observability';

// Import E2B Sandbox type - use dynamic import to avoid hard dependency
type E2BSandboxType = {
  sandboxId: string;
  runCode: (code: string, opts?: { language?: 'python' | 'javascript' | 'typescript' | 'bash' | 'r' }) => Promise<{
    error?: string;
    logs?: { stdout?: string[]; stderr?: string[] };
    results?: unknown[];
  }>;
  kill: () => Promise<void>;
};

type E2BSandboxConstructor = {
  create: (opts?: { apiKey?: string; timeoutMs?: number }) => Promise<E2BSandboxType>;
  reconnect: (sandboxId: string, opts?: { apiKey?: string }) => Promise<E2BSandboxType>;
};

const executionContextLogger = createLogger('ExecutionContextAdapter');

/**
 * E2B client adapter that wraps the @e2b/code-interpreter Sandbox class
 */
export class E2BSandboxClient implements E2BClient {
  constructor(
    private apiKey?: string,
    private sandboxConstructor?: E2BSandboxConstructor
  ) {}

  private async getSandboxConstructor(): Promise<E2BSandboxConstructor> {
    if (this.sandboxConstructor) {
      return this.sandboxConstructor;
    }

    // For now, throw error - actual implementation should be provided by application
    throw new Error(
      'E2B Sandbox constructor not provided. Pass it to E2BSandboxClient constructor or ensure @e2b/code-interpreter is available.'
    );
  }

  async create(opts?: { apiKey?: string; timeout?: number }) {
    const apiKey = opts?.apiKey ?? this.apiKey ?? process.env.E2B_API_KEY;
    const timeout = opts?.timeout ?? 600000; // 10 minutes default

    const Sandbox = await this.getSandboxConstructor();
    const sandbox = await Sandbox.create({
      apiKey,
      timeoutMs: timeout,
    });

    return {
      sandboxId: sandbox.sandboxId,
      async runCode(code: string, opts?: { language?: string }) {
        // Map language to E2B execution
        const language = opts?.language ?? 'python';
        const result = await sandbox.runCode(code, { language } as { language: 'python' | 'javascript' | 'typescript' | 'bash' | 'r' });

        return {
          exitCode: result.error ? 1 : 0,
          logs: {
            stdout: result.logs?.stdout ?? [],
            stderr: result.logs?.stderr ?? [],
          },
          results: result.results,
        };
      },
      async kill() {
        await sandbox.kill();
      },
    };
  }

  async reconnect(sandboxId: string, opts?: { apiKey?: string }) {
    const apiKey = opts?.apiKey ?? this.apiKey ?? process.env.E2B_API_KEY;

    const Sandbox = await this.getSandboxConstructor();
    const sandbox = await Sandbox.reconnect(sandboxId, { apiKey });

    return {
      sandboxId: sandbox.sandboxId,
      async runCode(code: string, opts?: { language?: string }) {
        const language = opts?.language ?? 'python';
        const result = await sandbox.runCode(code, { language } as { language: 'python' | 'javascript' | 'typescript' | 'bash' | 'r' });

        return {
          exitCode: result.error ? 1 : 0,
          logs: {
            stdout: result.logs?.stdout ?? [],
            stderr: result.logs?.stderr ?? [],
          },
          results: result.results,
        };
      },
      async kill() {
        await sandbox.kill();
      },
    };
  }
}

/**
 * Configuration for creating execution context manager
 */
export interface ExecutionContextConfig {
  /** Custom execution context store (e.g., cached wrapper) */
  store?: ExecutionContextStore;

  /** Supabase client used when a custom store is not provided */
  supabaseClient?: SupabaseClient;

  /** E2B API key */
  e2bApiKey?: string;

  /** Default TTL in minutes (default: 30) */
  defaultTtlMinutes?: number;

  /** Sandbox timeout in milliseconds (default: 600000 = 10 min) */
  sandboxTimeoutMs?: number;

  /** Enable logging */
  enableLogging?: boolean;

  /**
   * Optional quota check callback for E2B sandbox creation (Phase 3)
   * If provided, will be called before creating new sandboxes to enforce quota limits
   */
  quotaCheckCallback?: E2BQuotaCheckCallback;
}

/**
 * Resolve execution context store based on configuration
 */
function resolveExecutionContextStore(config: ExecutionContextConfig): ExecutionContextStore {
  if (config.store) {
    return config.store;
  }

  if (config.supabaseClient) {
    return new SupabaseExecutionContextStore(config.supabaseClient);
  }

  throw new Error(
    'Supabase client required for execution context store. Provide supabaseClient or a custom store.'
  );
}

/**
 * Create ExecutionContextManager with sensible defaults
 *
 * @example
 * ```typescript
 * // In Next.js API route
 * const manager = createExecutionContextManager({
 *   supabaseClient: createClient(url, key),
 *   e2bApiKey: process.env.E2B_API_KEY,
 * });
 *
 * const handler = createChatRouteHandler({
 *   executionContextManager: manager,
 * });
 * ```
 */
export function createExecutionContextManager(
  config: ExecutionContextConfig = {}
): ExecutionContextManager {
  const store = resolveExecutionContextStore(config);
  const e2bClient = new E2BSandboxClient(config.e2bApiKey);

  const logger = config.enableLogging
    ? executionContextLogger.child({ feature: 'manager' })
    : undefined;

  return new ExecutionContextManager({
    store,
    e2bClient,
    e2bApiKey: config.e2bApiKey,
    defaultTtlMinutes: config.defaultTtlMinutes,
    sandboxTimeoutMs: config.sandboxTimeoutMs,
    logger,
    quotaCheckCallback: config.quotaCheckCallback,
  });
}

/**
 * Singleton execution context manager for application-wide use
 *
 * @example
 * ```typescript
 * // In app initialization
 * initializeExecutionContextManager({
 *   supabaseClient: getSupabaseClient(),
 *   e2bApiKey: process.env.E2B_API_KEY,
 * });
 *
 * // In API routes
 * const manager = getExecutionContextManager();
 * ```
 */
let singletonManager: ExecutionContextManager | null = null;

/**
 * Initialize the singleton execution context manager
 */
export function initializeExecutionContextManager(config: ExecutionContextConfig): void {
  if (singletonManager) {
    executionContextLogger.warn('Manager already initialized, replacing existing instance');
  }
  singletonManager = createExecutionContextManager(config);
}

/**
 * Get the singleton execution context manager
 *
 * @throws Error if manager not initialized
 */
export function getExecutionContextManager(): ExecutionContextManager {
  if (!singletonManager) {
    throw new Error(
      'ExecutionContextManager not initialized. Call initializeExecutionContextManager() first.'
    );
  }
  return singletonManager;
}

/**
 * Get the singleton execution context manager (safe version)
 * Returns undefined if not initialized
 */
export function getExecutionContextManagerSafe(): ExecutionContextManager | undefined {
  return singletonManager ?? undefined;
}

/**
 * Check if execution context manager is initialized
 */
export function isExecutionContextManagerInitialized(): boolean {
  return singletonManager !== null;
}

/**
 * Shutdown the singleton execution context manager
 * Useful for graceful application shutdown
 */
export async function shutdownExecutionContextManager(): Promise<void> {
  if (singletonManager) {
    await singletonManager.shutdown();
    singletonManager = null;
  }
}
