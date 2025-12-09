/**
 * Unit tests for Tool Registry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolRegistry,
  createToolRegistry,
  type ToolRegistryConfig,
} from '../tools/toolRegistry.js';
import type { E2BSandbox } from '../tools/codeExecutionTools.js';

// =============================================================================
// Mock E2B Sandbox
// =============================================================================

function createMockSandbox(sandboxId: string = 'test-sandbox-123'): E2BSandbox {
  return {
    sandboxId,
    runCode: vi.fn().mockResolvedValue({
      logs: { stdout: ['test output'], stderr: [] },
      results: [],
      exitCode: 0,
    }),
    kill: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Tool Registry Tests
// =============================================================================

describe('ToolRegistry', () => {
  describe('constructor and registration', () => {
    it('should create registry without sandbox', () => {
      const registry = new ToolRegistry();
      expect(registry.getToolNames()).toEqual([]);
    });

    it('should register code execution tools when sandbox provided', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      expect(registry.hasTool('run_code')).toBe(true);
      expect(registry.hasTool('run_analysis')).toBe(true);
      expect(registry.getToolNames()).toContain('run_code');
      expect(registry.getToolNames()).toContain('run_analysis');
    });

    it('should not register tools when enableCodeExecution is false', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({
        sandbox,
        enableCodeExecution: false,
      });

      expect(registry.hasTool('run_code')).toBe(false);
      expect(registry.hasTool('run_analysis')).toBe(false);
    });

    it('should log registration with logger', () => {
      const logger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox, logger });

      expect(logger.info).toHaveBeenCalledWith(
        '[ToolRegistry] Code execution tools registered',
        expect.objectContaining({
          sandboxId: 'test-sandbox-123',
        })
      );
    });

    it('should log when tools not registered', () => {
      const logger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      const registry = new ToolRegistry({ logger });

      expect(logger.info).toHaveBeenCalledWith(
        '[ToolRegistry] Code execution tools NOT registered',
        expect.objectContaining({
          hasSandbox: false,
        })
      );
    });
  });

  describe('getTools', () => {
    it('should return empty object when no tools registered', () => {
      const registry = new ToolRegistry();
      const tools = registry.getTools();

      expect(Object.keys(tools)).toHaveLength(0);
    });

    it('should return tools in Vercel AI SDK format', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });
      const tools = registry.getTools();

      expect(tools).toHaveProperty('run_code');
      expect(tools).toHaveProperty('run_analysis');

      expect(tools.run_code).toHaveProperty('description');
      expect(tools.run_code).toHaveProperty('parameters');
      expect(tools.run_code).toHaveProperty('execute');
      expect(typeof tools.run_code.execute).toBe('function');
    });
  });

  describe('getTool', () => {
    it('should get specific tool by name', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      const tool = registry.getTool('run_code');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('run_code');
      expect(tool?.schema).toBeDefined();
      expect(tool?.execute).toBeDefined();
    });

    it('should return undefined for non-existent tool', () => {
      const registry = new ToolRegistry();
      const tool = registry.getTool('nonexistent');

      expect(tool).toBeUndefined();
    });
  });

  describe('hasTool', () => {
    it('should return true for registered tools', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      expect(registry.hasTool('run_code')).toBe(true);
      expect(registry.hasTool('run_analysis')).toBe(true);
    });

    it('should return false for non-registered tools', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      expect(registry.hasTool('nonexistent')).toBe(false);
    });
  });

  describe('getToolNames', () => {
    it('should return empty array when no tools', () => {
      const registry = new ToolRegistry();
      expect(registry.getToolNames()).toEqual([]);
    });

    it('should return all tool names', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      const names = registry.getToolNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('run_code');
      expect(names).toContain('run_analysis');
    });
  });

  describe('executeTool', () => {
    it('should execute run_code tool', async () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      const result = await registry.executeTool('run_code', {
        language: 'python',
        code: 'print("hello")',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(sandbox.runCode).toHaveBeenCalled();
    });

    it('should execute run_analysis tool', async () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      const result = await registry.executeTool('run_analysis', {
        analysisType: 'tax_calculation',
        parameters: { income: 50000 },
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(sandbox.runCode).toHaveBeenCalled();
    });

    it('should throw error for non-existent tool', async () => {
      const registry = new ToolRegistry();

      await expect(
        registry.executeTool('nonexistent', {})
      ).rejects.toThrow('Tool not found: nonexistent');
    });

    it('should log tool execution', async () => {
      const logger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox, logger });

      await registry.executeTool('run_code', {
        language: 'python',
        code: 'print("test")',
      });

      expect(logger.info).toHaveBeenCalledWith(
        '[ToolRegistry] Executing tool',
        expect.objectContaining({
          name: 'run_code',
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        '[ToolRegistry] Tool execution completed',
        expect.objectContaining({
          name: 'run_code',
          success: true,
        })
      );
    });

    it('should handle sandbox connection errors', async () => {
      const logger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      const sandbox: E2BSandbox = {
        sandboxId: 'test-sandbox',
        runCode: vi.fn().mockRejectedValue(new Error('Connection failed')),
        kill: vi.fn(),
      };

      const registry = new ToolRegistry({ sandbox, logger });

      const result = await registry.executeTool('run_code', {
        language: 'python',
        code: 'print("test")',
      });

      // executeCode catches sandbox errors and returns them in the result
      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection failed');

      expect(logger.info).toHaveBeenCalledWith(
        '[ToolRegistry] Tool execution completed',
        expect.objectContaining({
          name: 'run_code',
          success: true, // Tool executed successfully, even though code failed
        })
      );
    });
  });

  describe('updateSandbox', () => {
    it('should update sandbox and re-register tools', () => {
      const logger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      const registry = new ToolRegistry({ logger });
      expect(registry.hasTool('run_code')).toBe(false);

      const sandbox = createMockSandbox('new-sandbox-456');
      registry.updateSandbox(sandbox);

      expect(registry.hasTool('run_code')).toBe(true);
      expect(registry.hasTool('run_analysis')).toBe(true);

      expect(logger.info).toHaveBeenCalledWith(
        '[ToolRegistry] Sandbox updated',
        expect.objectContaining({
          sandboxId: 'new-sandbox-456',
          hadTools: false,
          hasTools: true,
        })
      );
    });

    it('should clear tools when sandbox set to undefined', () => {
      const sandbox = createMockSandbox();
      const registry = new ToolRegistry({ sandbox });

      expect(registry.hasTool('run_code')).toBe(true);

      registry.updateSandbox(undefined);

      expect(registry.hasTool('run_code')).toBe(false);
      expect(registry.getToolNames()).toEqual([]);
    });

    it('should replace existing sandbox', () => {
      const sandbox1 = createMockSandbox('sandbox-1');
      const registry = new ToolRegistry({ sandbox: sandbox1 });

      const sandbox2 = createMockSandbox('sandbox-2');
      registry.updateSandbox(sandbox2);

      // Tools should still be registered
      expect(registry.hasTool('run_code')).toBe(true);

      // Should use new sandbox
      const tools = registry.getTools();
      expect(tools.run_code).toBeDefined();
    });
  });

  describe('createToolRegistry factory', () => {
    it('should create registry with no config', () => {
      const registry = createToolRegistry();
      expect(registry).toBeInstanceOf(ToolRegistry);
      expect(registry.getToolNames()).toEqual([]);
    });

    it('should create registry with sandbox', () => {
      const sandbox = createMockSandbox();
      const registry = createToolRegistry({ sandbox });

      expect(registry).toBeInstanceOf(ToolRegistry);
      expect(registry.hasTool('run_code')).toBe(true);
    });
  });
});
