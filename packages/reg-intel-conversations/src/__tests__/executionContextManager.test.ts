/**
 * Unit tests for ExecutionContextManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutionContextManager,
  type ExecutionContextManagerConfig,
  type E2BSandbox,
  type E2BClient,
  type GetOrCreateContextInput,
} from '../executionContextManager.js';
import { type ExecutionContext, type ExecutionContextStore } from '../executionContextStores.js';
import { TestExecutionContextStore } from './testExecutionContextStore.js';

describe('ExecutionContextManager', () => {
  let manager: ExecutionContextManager;
  let store: ExecutionContextStore;
  let mockE2BClient: E2BClient;
  let mockSandbox: E2BSandbox;

  beforeEach(() => {
    // Create in-memory store
    store = new TestExecutionContextStore();

    // Create mock sandbox
    mockSandbox = {
      sandboxId: 'sb_test_123',
      kill: vi.fn().mockResolvedValue(undefined),
      runCode: vi.fn().mockResolvedValue({
        exitCode: 0,
        logs: { stdout: [], stderr: [] },
        results: [],
      }),
    };

    // Create mock E2B client
    mockE2BClient = {
      create: vi.fn().mockResolvedValue(mockSandbox),
      reconnect: vi.fn().mockResolvedValue(mockSandbox),
    };

    // Create manager
    const config: ExecutionContextManagerConfig = {
      store,
      e2bClient: mockE2BClient,
      e2bApiKey: 'test-api-key',
      defaultTtlMinutes: 30,
      sandboxTimeoutMs: 600_000,
    };

    manager = new ExecutionContextManager(config);
  });

  describe('getOrCreateContext', () => {
    it('should create new context and sandbox when none exists', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      const result = await manager.getOrCreateContext(input);

      expect(result.wasCreated).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context.sandboxId).toBe('sb_test_123');
      expect(result.context.sandboxStatus).toBe('ready');
      expect(result.sandbox).toBe(mockSandbox);
      expect(mockE2BClient.create).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        timeout: 600_000,
      });
    });

    it('should reuse existing context and sandbox from cache', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // First call creates
      const firstResult = await manager.getOrCreateContext(input);
      expect(firstResult.wasCreated).toBe(true);

      // Second call reuses
      const secondResult = await manager.getOrCreateContext(input);
      expect(secondResult.wasCreated).toBe(false);
      expect(secondResult.context.id).toBe(firstResult.context.id);
      expect(secondResult.sandbox).toBe(mockSandbox);

      // Should only create once
      expect(mockE2BClient.create).toHaveBeenCalledTimes(1);
    });

    it('should reconnect to sandbox when context exists but sandbox not in cache', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // Pre-create a context in store
      const existingContext = await store.createContext({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pathId: input.pathId,
        sandboxId: 'sb_existing',
      });
      await store.updateStatus(existingContext.id, 'ready');

      // Get or create should reconnect
      const result = await manager.getOrCreateContext(input);

      expect(result.wasCreated).toBe(false);
      expect(mockE2BClient.reconnect).toHaveBeenCalledWith('sb_existing', {
        apiKey: 'test-api-key',
      });
    });

    it('should create new context when reconnect fails', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // Pre-create a context
      const existingContext = await store.createContext({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pathId: input.pathId,
        sandboxId: 'sb_dead',
      });
      await store.updateStatus(existingContext.id, 'ready');

      // Mock reconnect to fail
      mockE2BClient.reconnect = vi.fn().mockRejectedValue(new Error('Sandbox not found'));

      // Get or create should create new context
      const result = await manager.getOrCreateContext(input);

      expect(result.wasCreated).toBe(true);
      expect(mockE2BClient.create).toHaveBeenCalled();

      // Old context should be marked as terminated
      const oldContext = await store.getContextByPath(input);
      // It should not return the old one (new one created)
      expect(oldContext?.id).not.toBe(existingContext.id);
    });

    it('should extend TTL on each access', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // Create context
      const firstResult = await manager.getOrCreateContext(input);
      const firstExpiry = firstResult.context.expiresAt.getTime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      // Access again
      const secondResult = await manager.getOrCreateContext(input);
      const secondExpiry = secondResult.context.expiresAt.getTime();

      // Expiry should be extended
      expect(secondExpiry).toBeGreaterThan(firstExpiry);
    });

    it('should create new context if existing context is terminated', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // Pre-create and terminate a context
      const existingContext = await store.createContext({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        pathId: input.pathId,
        sandboxId: 'sb_terminated',
      });
      await store.terminateContext(existingContext.id);

      // Get or create should create new context
      const result = await manager.getOrCreateContext(input);

      expect(result.wasCreated).toBe(true);
      expect(mockE2BClient.create).toHaveBeenCalled();
    });
  });

  describe('getContextByPath', () => {
    it('should get existing context by path', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // Create context
      await manager.getOrCreateContext(input);

      // Get context
      const context = await manager.getContextByPath(input);
      expect(context).not.toBeNull();
      expect(context?.pathId).toBe('path-1');
    });

    it('should return null if context does not exist', async () => {
      const context = await manager.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'nonexistent',
      });

      expect(context).toBeNull();
    });
  });

  describe('terminateContext', () => {
    it('should terminate context and kill sandbox', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // Create context
      const { context } = await manager.getOrCreateContext(input);

      // Terminate
      await manager.terminateContext(context.id);

      // Sandbox should be killed
      expect(mockSandbox.kill).toHaveBeenCalled();

      // Context should be marked as terminated
      const retrieved = await manager.getContextByPath(input);
      expect(retrieved).toBeNull(); // Terminated contexts return null
    });

    it('should handle sandbox kill errors gracefully', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      // Create context
      const { context } = await manager.getOrCreateContext(input);

      // Mock kill to fail
      mockSandbox.kill = vi.fn().mockRejectedValue(new Error('Kill failed'));

      // Terminate should still succeed
      await expect(manager.terminateContext(context.id)).resolves.not.toThrow();

      // Context should still be marked as terminated
      const retrieved = await manager.getContextByPath(input);
      expect(retrieved).toBeNull();
    });

    it('should terminate context even if sandbox not in cache', async () => {
      // Pre-create context in store only
      const context = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_nocache',
      });

      // Terminate should succeed
      await expect(manager.terminateContext(context.id)).resolves.not.toThrow();

      // Context should be marked as terminated
      const retrieved = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      });
      expect(retrieved).toBeNull();
    });
  });

  describe('cleanupExpired', () => {
    it('should cleanup expired contexts', async () => {
      // Create expired context
      const expiredContext = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-expired',
        sandboxId: 'sb_expired',
        ttlMinutes: 0.001, // Very short TTL
      });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup
      const result = await manager.cleanupExpired();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);

      // Context should be terminated
      const retrieved = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-expired',
      });
      expect(retrieved).toBeNull();
    });

    it('should respect limit parameter', async () => {
      // Create 3 expired contexts
      for (let i = 0; i < 3; i++) {
        await store.createContext({
          tenantId: 'tenant-1',
          conversationId: 'conv-1',
          pathId: `path-${i}`,
          sandboxId: `sb_${i}`,
          ttlMinutes: 0.001,
        });
      }

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup with limit
      const result = await manager.cleanupExpired(2);

      expect(result.cleaned).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('should handle cleanup errors', async () => {
      // Create expired context
      const expiredContext = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-error',
        sandboxId: 'sb_error',
        ttlMinutes: 0.001,
      });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mock store to throw error on terminate
      const originalTerminate = store.terminateContext;
      store.terminateContext = vi.fn().mockRejectedValue(new Error('Terminate failed'));

      // Cleanup should handle error
      const result = await manager.cleanupExpired();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails).toBeDefined();
      expect(result.errorDetails?.[0].error).toBe('Terminate failed');

      // Restore original
      store.terminateContext = originalTerminate;
    });

    it('should return zero results when no expired contexts', async () => {
      // Create active context
      await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-active',
        sandboxId: 'sb_active',
      });

      // Cleanup
      const result = await manager.cleanupExpired();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return active sandbox statistics', async () => {
      const input1: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      const input2: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-2',
      };

      // Create two contexts
      await manager.getOrCreateContext(input1);
      await manager.getOrCreateContext(input2);

      // Get stats
      const stats = manager.getStats();

      expect(stats.activeSandboxes).toBe(2);
      expect(stats.cachedContextIds).toHaveLength(2);
    });

    it('should return empty stats when no active sandboxes', async () => {
      const stats = manager.getStats();

      expect(stats.activeSandboxes).toBe(0);
      expect(stats.cachedContextIds).toEqual([]);
    });
  });

  describe('isHealthy', () => {
    it('should return true when store is ready', async () => {
      const healthy = await manager.isHealthy();
      expect(healthy).toBe(true);
    });

    it('should return false when store is not ready', async () => {
      // Mock store to be not ready
      store.isReady = vi.fn().mockResolvedValue(false);

      const healthy = await manager.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return false when health check throws error', async () => {
      // Mock store to throw error
      store.isReady = vi.fn().mockRejectedValue(new Error('Store error'));

      const healthy = await manager.isHealthy();
      expect(healthy).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should kill all active sandboxes', async () => {
      // Create two contexts
      const input1: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      const input2: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-2',
      };

      await manager.getOrCreateContext(input1);

      // Create second sandbox mock
      const mockSandbox2: E2BSandbox = {
        sandboxId: 'sb_test_456',
        kill: vi.fn().mockResolvedValue(undefined),
        runCode: vi.fn().mockResolvedValue({
          exitCode: 0,
          logs: { stdout: [], stderr: [] },
          results: [],
        }),
      };

      // Update mock to return second sandbox
      mockE2BClient.create = vi.fn().mockResolvedValue(mockSandbox2);
      await manager.getOrCreateContext(input2);

      // Shutdown
      await manager.shutdown();

      // Both sandboxes should be killed
      expect(mockSandbox.kill).toHaveBeenCalled();
      expect(mockSandbox2.kill).toHaveBeenCalled();

      // Stats should show no active sandboxes
      const stats = manager.getStats();
      expect(stats.activeSandboxes).toBe(0);
    });

    it('should handle kill errors during shutdown', async () => {
      // Create context
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      await manager.getOrCreateContext(input);

      // Mock kill to fail
      mockSandbox.kill = vi.fn().mockRejectedValue(new Error('Kill failed'));

      // Shutdown should not throw
      await expect(manager.shutdown()).resolves.not.toThrow();

      // Stats should still show no active sandboxes
      const stats = manager.getStats();
      expect(stats.activeSandboxes).toBe(0);
    });
  });

  describe('updateResourceUsage', () => {
    it('should update resource usage (currently just logs)', async () => {
      const input: GetOrCreateContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      };

      const { context } = await manager.getOrCreateContext(input);

      // Should not throw
      await expect(
        manager.updateResourceUsage(context.id, { cpu: 0.5, memory: 100 })
      ).resolves.not.toThrow();
    });
  });
});
