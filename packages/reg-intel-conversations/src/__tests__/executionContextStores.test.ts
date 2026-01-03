/**
 * Unit tests for Execution Context Stores
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { type ExecutionContext, type CreateExecutionContextInput } from '../executionContextStores.js';
import { TestExecutionContextStore } from './testExecutionContextStore.js';

describe('TestExecutionContextStore', () => {
  let store: TestExecutionContextStore;

  beforeEach(() => {
    store = new TestExecutionContextStore();
  });

  describe('createContext', () => {
    it('should create a new execution context with default TTL', async () => {
      const input: CreateExecutionContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      };

      const context = await store.createContext(input);

      expect(context.id).toBeDefined();
      expect(context.tenantId).toBe(input.tenantId);
      expect(context.conversationId).toBe(input.conversationId);
      expect(context.pathId).toBe(input.pathId);
      expect(context.sandboxId).toBe(input.sandboxId);
      expect(context.sandboxStatus).toBe('creating');
      expect(context.createdAt).toBeInstanceOf(Date);
      expect(context.lastUsedAt).toBeInstanceOf(Date);
      expect(context.expiresAt).toBeInstanceOf(Date);

      // Check TTL is approximately 30 minutes (within 1 second tolerance)
      const ttlMs = context.expiresAt.getTime() - context.createdAt.getTime();
      expect(ttlMs).toBeGreaterThanOrEqual(30 * 60 * 1000 - 1000);
      expect(ttlMs).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
    });

    it('should create a new execution context with custom TTL', async () => {
      const input: CreateExecutionContextInput = {
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
        ttlMinutes: 60,
      };

      const context = await store.createContext(input);

      // Check TTL is approximately 60 minutes
      const ttlMs = context.expiresAt.getTime() - context.createdAt.getTime();
      expect(ttlMs).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
      expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
    });
  });

  describe('getContextByPath', () => {
    it('should retrieve context by path', async () => {
      const created = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      const retrieved = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      });

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.sandboxId).toBe('sb_123');
    });

    it('should return null if context does not exist', async () => {
      const retrieved = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'nonexistent',
      });

      expect(retrieved).toBeNull();
    });

    it('should return null if context has different tenant', async () => {
      await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      const retrieved = await store.getContextByPath({
        tenantId: 'tenant-2',
        conversationId: 'conv-1',
        pathId: 'path-1',
      });

      expect(retrieved).toBeNull();
    });
  });

  describe('touchContext', () => {
    it('should update lastUsedAt and extend expiry', async () => {
      const context = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      const originalLastUsed = context.lastUsedAt.getTime();
      const originalExpiry = context.expiresAt.getTime();

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await store.touchContext(context.id, 45);

      const updated = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      });

      expect(updated).not.toBeNull();
      expect(updated!.lastUsedAt.getTime()).toBeGreaterThan(originalLastUsed);
      expect(updated!.expiresAt.getTime()).toBeGreaterThan(originalExpiry);

      // Check new TTL is approximately 45 minutes from now
      const newTtlMs = updated!.expiresAt.getTime() - updated!.lastUsedAt.getTime();
      expect(newTtlMs).toBeGreaterThanOrEqual(45 * 60 * 1000 - 1000);
      expect(newTtlMs).toBeLessThanOrEqual(45 * 60 * 1000 + 1000);
    });

    it('should throw error if context not found', async () => {
      await expect(store.touchContext('nonexistent')).rejects.toThrow('Execution context not found');
    });

    it('should throw error if context is terminated', async () => {
      const context = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      await store.terminateContext(context.id);

      await expect(store.touchContext(context.id)).rejects.toThrow('Execution context is terminated');
    });
  });

  describe('updateStatus', () => {
    it('should update sandbox status', async () => {
      const context = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      await store.updateStatus(context.id, 'ready');

      const updated = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      });

      expect(updated?.sandboxStatus).toBe('ready');
    });

    it('should update status with error message', async () => {
      const context = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      await store.updateStatus(context.id, 'error', 'Sandbox creation failed');

      const updated = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      });

      expect(updated?.sandboxStatus).toBe('error');
      expect(updated?.errorMessage).toBe('Sandbox creation failed');
    });

    it('should throw error if context not found', async () => {
      await expect(store.updateStatus('nonexistent', 'ready')).rejects.toThrow(
        'Execution context not found'
      );
    });
  });

  describe('terminateContext', () => {
    it('should terminate context', async () => {
      const context = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      await store.terminateContext(context.id);

      const updated = await store.getContextByPath({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
      });

      // getContextByPath should return null for terminated contexts
      expect(updated).toBeNull();
    });

    it('should throw error if context not found', async () => {
      await expect(store.terminateContext('nonexistent')).rejects.toThrow(
        'Execution context not found'
      );
    });
  });

  describe('getExpiredContexts', () => {
    it('should return expired contexts', async () => {
      // Create context with very short TTL
      const expiredContext = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-expired',
        sandboxId: 'sb_expired',
        ttlMinutes: 0.001, // ~4 seconds
      });

      // Create context with normal TTL
      await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-active',
        sandboxId: 'sb_active',
      });

      // Wait for first context to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      const expired = await store.getExpiredContexts();

      expect(expired.length).toBe(1);
      expect(expired[0].id).toBe(expiredContext.id);
    });

    it('should not return terminated contexts', async () => {
      // Create expired context
      const context = await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
        ttlMinutes: 0.001,
      });

      // Terminate it
      await store.terminateContext(context.id);

      // Wait for expiry time to pass
      await new Promise(resolve => setTimeout(resolve, 100));

      const expired = await store.getExpiredContexts();

      // Should not include terminated context
      expect(expired.length).toBe(0);
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

      const expired = await store.getExpiredContexts(2);

      expect(expired.length).toBe(2);
    });

    it('should return empty array if no expired contexts', async () => {
      await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      const expired = await store.getExpiredContexts();

      expect(expired).toEqual([]);
    });
  });

  describe('isReady', () => {
    it('should return true', async () => {
      const ready = await store.isReady();
      expect(ready).toBe(true);
    });
  });

  describe('test helpers', () => {
    it('should clear all contexts', async () => {
      await store.createContext({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        pathId: 'path-1',
        sandboxId: 'sb_123',
      });

      expect(store.size()).toBe(1);

      store.clear();

      expect(store.size()).toBe(0);
    });
  });
});
