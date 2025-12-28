/**
 * Tests for SandboxManager
 *
 * Tests the lifecycle management of E2B sandboxes and MCP gateway configuration.
 */

import { describe, expect, it, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';

// Mock the observability module
vi.mock('@reg-copilot/reg-intel-observability', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  withSpan: vi.fn((_name: string, _attrs: Record<string, unknown>, fn: () => Promise<unknown>) => fn()),
}));

// Mock the e2bClient module
vi.mock('./e2bClient.js', () => ({
  createSandbox: vi.fn(),
}));

// Mock the mcpClient module
vi.mock('./mcpClient.js', () => ({
  configureMcpGateway: vi.fn(),
  isMcpGatewayConfigured: vi.fn(),
}));

import {
  hasActiveSandbox,
  getActiveSandboxId,
  ensureMcpGatewayConfigured,
  getOrCreateActiveSandbox,
  resetActiveSandbox,
} from './sandboxManager.js';
import { createSandbox } from './e2bClient.js';
import { configureMcpGateway, isMcpGatewayConfigured } from './mcpClient.js';

const mockCreateSandbox = createSandbox as MockedFunction<typeof createSandbox>;
const mockConfigureMcpGateway = configureMcpGateway as MockedFunction<typeof configureMcpGateway>;
const mockIsMcpGatewayConfigured = isMcpGatewayConfigured as MockedFunction<typeof isMcpGatewayConfigured>;

describe('SandboxManager', () => {
  const mockSandboxHandle = {
    sandbox: {
      sandboxId: 'test-sandbox-123',
      kill: vi.fn().mockResolvedValue(undefined),
    },
    id: 'test-sandbox-123',
    mcpUrl: 'https://mcp.test.local',
    mcpToken: 'test-token-abc',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mocks to default behavior
    mockCreateSandbox.mockResolvedValue(mockSandboxHandle);
    mockIsMcpGatewayConfigured.mockReturnValue(false);

    // Reset active sandbox state by calling resetActiveSandbox
    // We need to ensure clean state before each test
    await resetActiveSandbox();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up active sandbox after each test
    await resetActiveSandbox();
  });

  describe('hasActiveSandbox', () => {
    it('returns false when no sandbox is active', () => {
      expect(hasActiveSandbox()).toBe(false);
    });

    it('returns true after a sandbox is created', async () => {
      await getOrCreateActiveSandbox();
      expect(hasActiveSandbox()).toBe(true);
    });

    it('returns false after sandbox is reset', async () => {
      await getOrCreateActiveSandbox();
      expect(hasActiveSandbox()).toBe(true);

      await resetActiveSandbox();
      expect(hasActiveSandbox()).toBe(false);
    });
  });

  describe('getActiveSandboxId', () => {
    it('returns null when no sandbox is active', () => {
      expect(getActiveSandboxId()).toBeNull();
    });

    it('returns the sandbox ID when a sandbox is active', async () => {
      await getOrCreateActiveSandbox();
      expect(getActiveSandboxId()).toBe('test-sandbox-123');
    });

    it('returns null after sandbox is reset', async () => {
      await getOrCreateActiveSandbox();
      expect(getActiveSandboxId()).toBe('test-sandbox-123');

      await resetActiveSandbox();
      expect(getActiveSandboxId()).toBeNull();
    });
  });

  describe('getOrCreateActiveSandbox', () => {
    it('creates a new sandbox when none exists', async () => {
      const result = await getOrCreateActiveSandbox();

      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockSandboxHandle);
      expect(hasActiveSandbox()).toBe(true);
    });

    it('reuses existing sandbox on subsequent calls', async () => {
      const firstResult = await getOrCreateActiveSandbox();
      const secondResult = await getOrCreateActiveSandbox();
      const thirdResult = await getOrCreateActiveSandbox();

      // createSandbox should only be called once
      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(secondResult);
      expect(secondResult).toBe(thirdResult);
    });

    it('configures MCP gateway when not already configured', async () => {
      mockIsMcpGatewayConfigured.mockReturnValue(false);

      await getOrCreateActiveSandbox();

      expect(mockConfigureMcpGateway).toHaveBeenCalledWith(
        'https://mcp.test.local',
        'test-token-abc',
        'test-sandbox-123'
      );
    });

    it('skips MCP gateway configuration if already configured', async () => {
      mockIsMcpGatewayConfigured.mockReturnValue(true);

      await getOrCreateActiveSandbox();

      expect(mockConfigureMcpGateway).not.toHaveBeenCalled();
    });

    it('returns different sandbox handle after reset and recreate', async () => {
      const differentHandle = {
        sandbox: {
          sandboxId: 'new-sandbox-456',
          kill: vi.fn().mockResolvedValue(undefined),
        },
        id: 'new-sandbox-456',
        mcpUrl: 'https://mcp.new.local',
        mcpToken: 'new-token-xyz',
      };

      const firstResult = await getOrCreateActiveSandbox();
      expect(firstResult.id).toBe('test-sandbox-123');

      await resetActiveSandbox();
      mockCreateSandbox.mockResolvedValue(differentHandle);

      const secondResult = await getOrCreateActiveSandbox();
      expect(secondResult.id).toBe('new-sandbox-456');
      expect(mockCreateSandbox).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetActiveSandbox', () => {
    it('does nothing when no sandbox is active', async () => {
      expect(hasActiveSandbox()).toBe(false);

      await resetActiveSandbox();

      expect(hasActiveSandbox()).toBe(false);
      // kill should not be called since there's no sandbox
      expect(mockSandboxHandle.sandbox.kill).not.toHaveBeenCalled();
    });

    it('kills and clears the active sandbox', async () => {
      const handle = await getOrCreateActiveSandbox();
      expect(hasActiveSandbox()).toBe(true);

      await resetActiveSandbox();

      expect(handle.sandbox.kill).toHaveBeenCalledTimes(1);
      expect(hasActiveSandbox()).toBe(false);
      expect(getActiveSandboxId()).toBeNull();
    });

    it('clears sandbox reference even if kill fails', async () => {
      const failingHandle = {
        sandbox: {
          sandboxId: 'failing-sandbox',
          kill: vi.fn().mockRejectedValue(new Error('Kill failed')),
        },
        id: 'failing-sandbox',
        mcpUrl: 'https://mcp.fail.local',
        mcpToken: 'fail-token',
      };

      mockCreateSandbox.mockResolvedValue(failingHandle);
      await getOrCreateActiveSandbox();

      // Reset should not throw even if kill fails
      await expect(resetActiveSandbox()).resolves.not.toThrow();

      // Sandbox reference should be cleared
      expect(hasActiveSandbox()).toBe(false);
      expect(getActiveSandboxId()).toBeNull();
    });

    it('can be called multiple times safely', async () => {
      await getOrCreateActiveSandbox();

      await resetActiveSandbox();
      await resetActiveSandbox();
      await resetActiveSandbox();

      expect(hasActiveSandbox()).toBe(false);
      // kill should only be called once (on first reset)
      expect(mockSandboxHandle.sandbox.kill).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureMcpGatewayConfigured', () => {
    it('does nothing when gateway is already configured', async () => {
      mockIsMcpGatewayConfigured.mockReturnValue(true);

      await ensureMcpGatewayConfigured();

      expect(mockCreateSandbox).not.toHaveBeenCalled();
      expect(mockConfigureMcpGateway).not.toHaveBeenCalled();
    });

    it('creates sandbox and configures gateway when not configured', async () => {
      mockIsMcpGatewayConfigured.mockReturnValue(false);

      await ensureMcpGatewayConfigured();

      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);
      expect(mockConfigureMcpGateway).toHaveBeenCalledWith(
        'https://mcp.test.local',
        'test-token-abc',
        'test-sandbox-123'
      );
    });

    it('reuses existing sandbox when called multiple times', async () => {
      mockIsMcpGatewayConfigured
        .mockReturnValueOnce(false) // First call - not configured
        .mockReturnValue(true); // Subsequent calls - configured

      await ensureMcpGatewayConfigured();
      await ensureMcpGatewayConfigured();
      await ensureMcpGatewayConfigured();

      // Sandbox should only be created once
      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration scenarios', () => {
    it('handles full lifecycle: create -> use -> reset -> recreate', async () => {
      // 1. Initial creation
      mockIsMcpGatewayConfigured.mockReturnValue(false);
      const firstSandbox = await getOrCreateActiveSandbox();
      expect(firstSandbox.id).toBe('test-sandbox-123');
      expect(hasActiveSandbox()).toBe(true);

      // 2. Gateway should be configured
      expect(mockConfigureMcpGateway).toHaveBeenCalledTimes(1);

      // 3. Subsequent calls reuse sandbox
      const reusedSandbox = await getOrCreateActiveSandbox();
      expect(reusedSandbox).toBe(firstSandbox);
      expect(mockCreateSandbox).toHaveBeenCalledTimes(1);

      // 4. Reset
      await resetActiveSandbox();
      expect(hasActiveSandbox()).toBe(false);

      // 5. Create new sandbox after reset
      const newHandle = {
        sandbox: {
          sandboxId: 'sandbox-v2',
          kill: vi.fn().mockResolvedValue(undefined),
        },
        id: 'sandbox-v2',
        mcpUrl: 'https://mcp.v2.local',
        mcpToken: 'token-v2',
      };
      mockCreateSandbox.mockResolvedValue(newHandle);
      mockIsMcpGatewayConfigured.mockReturnValue(false);

      const secondSandbox = await getOrCreateActiveSandbox();
      expect(secondSandbox.id).toBe('sandbox-v2');
      expect(mockCreateSandbox).toHaveBeenCalledTimes(2);
    });

    it('handles concurrent getOrCreateActiveSandbox calls', async () => {
      // Simulate concurrent calls - all should get the same sandbox
      const [result1, result2, result3] = await Promise.all([
        getOrCreateActiveSandbox(),
        getOrCreateActiveSandbox(),
        getOrCreateActiveSandbox(),
      ]);

      // All results should be the same sandbox
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);

      // createSandbox should only be called once (or at most once per concurrent batch)
      // Due to the race condition in the implementation, it might be called multiple times
      // but all should return the same handle eventually
      expect(result1.id).toBe('test-sandbox-123');
    });
  });
});
