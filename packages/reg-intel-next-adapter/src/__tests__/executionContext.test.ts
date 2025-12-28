/**
 * Tests for Execution Context Adapter
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  E2BSandboxClient,
  createExecutionContextManager,
  initializeExecutionContextManager,
  getExecutionContextManager,
  getExecutionContextManagerSafe,
  isExecutionContextManagerInitialized,
  shutdownExecutionContextManager,
} from '../executionContext.js';

describe('E2BSandboxClient', () => {
  describe('create', () => {
    it('creates a sandbox using the provided constructor', async () => {
      const mockSandbox = {
        sandboxId: 'sandbox-123',
        runCode: vi.fn().mockResolvedValue({
          error: undefined,
          logs: { stdout: ['Hello'], stderr: [] },
          results: [42],
        }),
        kill: vi.fn().mockResolvedValue(undefined),
      };

      const mockConstructor = {
        create: vi.fn().mockResolvedValue(mockSandbox),
        reconnect: vi.fn(),
      };

      const client = new E2BSandboxClient('api-key-123', mockConstructor);
      const sandbox = await client.create({ timeout: 30000 });

      expect(mockConstructor.create).toHaveBeenCalledWith({
        apiKey: 'api-key-123',
        timeoutMs: 30000,
      });

      expect(sandbox.sandboxId).toBe('sandbox-123');

      // Test runCode
      const result = await sandbox.runCode('print("hello")', { language: 'python' });
      expect(result).toEqual({
        exitCode: 0,
        logs: { stdout: ['Hello'], stderr: [] },
        results: [42],
      });

      // Test kill
      await sandbox.kill();
      expect(mockSandbox.kill).toHaveBeenCalled();
    });

    it('uses E2B_API_KEY environment variable if apiKey not provided', async () => {
      const originalEnv = process.env.E2B_API_KEY;
      process.env.E2B_API_KEY = 'env-api-key';

      const mockSandbox = {
        sandboxId: 'sandbox-456',
        runCode: vi.fn().mockResolvedValue({ logs: { stdout: [], stderr: [] } }),
        kill: vi.fn(),
      };

      const mockConstructor = {
        create: vi.fn().mockResolvedValue(mockSandbox),
        reconnect: vi.fn(),
      };

      const client = new E2BSandboxClient(undefined, mockConstructor);
      await client.create();

      expect(mockConstructor.create).toHaveBeenCalledWith({
        apiKey: 'env-api-key',
        timeoutMs: 600000,
      });

      process.env.E2B_API_KEY = originalEnv;
    });

    it('sets exitCode to 1 when sandbox returns error', async () => {
      const mockSandbox = {
        sandboxId: 'sandbox-error',
        runCode: vi.fn().mockResolvedValue({
          error: 'SyntaxError: invalid syntax',
          logs: { stdout: [], stderr: ['Error occurred'] },
          results: [],
        }),
        kill: vi.fn(),
      };

      const mockConstructor = {
        create: vi.fn().mockResolvedValue(mockSandbox),
        reconnect: vi.fn(),
      };

      const client = new E2BSandboxClient('api-key-123', mockConstructor);
      const sandbox = await client.create();
      const result = await sandbox.runCode('invalid code', { language: 'python' });

      expect(result.exitCode).toBe(1);
      expect(result.logs.stderr).toContain('Error occurred');
    });

    it('throws error if no sandbox constructor provided', async () => {
      const client = new E2BSandboxClient('api-key-123');

      await expect(client.create()).rejects.toThrow(
        'E2B Sandbox constructor not provided'
      );
    });
  });

  describe('reconnect', () => {
    it('reconnects to an existing sandbox', async () => {
      const mockSandbox = {
        sandboxId: 'sandbox-reconnected',
        runCode: vi.fn().mockResolvedValue({
          logs: { stdout: ['Reconnected'], stderr: [] },
          results: [],
        }),
        kill: vi.fn(),
      };

      const mockConstructor = {
        create: vi.fn(),
        reconnect: vi.fn().mockResolvedValue(mockSandbox),
      };

      const client = new E2BSandboxClient('api-key-123', mockConstructor);
      const sandbox = await client.reconnect('sandbox-existing-123', { apiKey: 'override-key' });

      expect(mockConstructor.reconnect).toHaveBeenCalledWith('sandbox-existing-123', {
        apiKey: 'override-key',
      });

      expect(sandbox.sandboxId).toBe('sandbox-reconnected');

      const result = await sandbox.runCode('print("test")', { language: 'python' });
      expect(result.exitCode).toBe(0);
      expect(result.logs.stdout).toContain('Reconnected');
    });

    it('uses client apiKey if not provided in opts', async () => {
      const mockSandbox = {
        sandboxId: 'sandbox-reconnected',
        runCode: vi.fn().mockResolvedValue({ logs: { stdout: [], stderr: [] } }),
        kill: vi.fn(),
      };

      const mockConstructor = {
        create: vi.fn(),
        reconnect: vi.fn().mockResolvedValue(mockSandbox),
      };

      const client = new E2BSandboxClient('client-api-key', mockConstructor);
      await client.reconnect('sandbox-123');

      expect(mockConstructor.reconnect).toHaveBeenCalledWith('sandbox-123', {
        apiKey: 'client-api-key',
      });
    });
  });
});

describe('createExecutionContextManager', () => {
  it('creates manager with memory store by default', () => {
    const manager = createExecutionContextManager({
      e2bApiKey: 'test-key',
    });

    expect(manager).toBeDefined();
  });

  it('creates manager with in-memory store when mode is memory', () => {
    const manager = createExecutionContextManager({
      mode: 'memory',
      e2bApiKey: 'test-key',
    });

    expect(manager).toBeDefined();
  });

  it('creates manager with supabase store when mode is supabase', () => {
    const mockSupabaseClient = {
      from: vi.fn(),
      auth: { getSession: vi.fn() },
    };

    const manager = createExecutionContextManager({
      mode: 'supabase',
      supabaseClient: mockSupabaseClient as any,
      e2bApiKey: 'test-key',
    });

    expect(manager).toBeDefined();
  });

  it('throws error if supabase mode without client', () => {
    expect(() => {
      createExecutionContextManager({
        mode: 'supabase',
        e2bApiKey: 'test-key',
      });
    }).toThrow('Supabase client required for supabase execution context store');
  });

  it('auto-selects supabase store when client is provided', () => {
    const mockSupabaseClient = {
      from: vi.fn(),
      auth: { getSession: vi.fn() },
    };

    const manager = createExecutionContextManager({
      mode: 'auto',
      supabaseClient: mockSupabaseClient as any,
      e2bApiKey: 'test-key',
    });

    expect(manager).toBeDefined();
  });

  it('applies custom configuration parameters', () => {
    const manager = createExecutionContextManager({
      mode: 'memory',
      e2bApiKey: 'custom-key',
      defaultTtlMinutes: 60,
      sandboxTimeoutMs: 120000,
      enableLogging: true,
    });

    expect(manager).toBeDefined();
  });
});

describe('Singleton ExecutionContextManager', () => {
  // Reset singleton state before each test
  beforeEach(async () => {
    await shutdownExecutionContextManager();
  });

  afterEach(async () => {
    await shutdownExecutionContextManager();
  });

  describe('initializeExecutionContextManager', () => {
    it('initializes singleton manager', () => {
      expect(isExecutionContextManagerInitialized()).toBe(false);

      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'test-key',
      });

      expect(isExecutionContextManagerInitialized()).toBe(true);
    });

    it('warns and replaces existing instance on re-initialization', () => {
      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'first-key',
      });

      const first = getExecutionContextManager();

      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'second-key',
      });

      const second = getExecutionContextManager();

      // Should be different instances
      expect(first).not.toBe(second);
    });
  });

  describe('getExecutionContextManager', () => {
    it('returns initialized manager', () => {
      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'test-key',
      });

      const manager = getExecutionContextManager();
      expect(manager).toBeDefined();
    });

    it('throws error if not initialized', () => {
      expect(() => getExecutionContextManager()).toThrow(
        'ExecutionContextManager not initialized'
      );
    });
  });

  describe('getExecutionContextManagerSafe', () => {
    it('returns manager if initialized', () => {
      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'test-key',
      });

      const manager = getExecutionContextManagerSafe();
      expect(manager).toBeDefined();
    });

    it('returns undefined if not initialized', () => {
      const manager = getExecutionContextManagerSafe();
      expect(manager).toBeUndefined();
    });
  });

  describe('shutdownExecutionContextManager', () => {
    it('shuts down and clears singleton', async () => {
      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'test-key',
      });

      expect(isExecutionContextManagerInitialized()).toBe(true);

      await shutdownExecutionContextManager();

      expect(isExecutionContextManagerInitialized()).toBe(false);
    });

    it('does nothing if manager not initialized', async () => {
      await expect(shutdownExecutionContextManager()).resolves.not.toThrow();
      expect(isExecutionContextManagerInitialized()).toBe(false);
    });
  });

  describe('isExecutionContextManagerInitialized', () => {
    it('returns true when initialized', () => {
      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'test-key',
      });

      expect(isExecutionContextManagerInitialized()).toBe(true);
    });

    it('returns false when not initialized', () => {
      expect(isExecutionContextManagerInitialized()).toBe(false);
    });

    it('returns false after shutdown', async () => {
      initializeExecutionContextManager({
        mode: 'memory',
        e2bApiKey: 'test-key',
      });

      await shutdownExecutionContextManager();

      expect(isExecutionContextManagerInitialized()).toBe(false);
    });
  });
});
