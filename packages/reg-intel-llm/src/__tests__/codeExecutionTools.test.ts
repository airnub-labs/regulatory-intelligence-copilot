/**
 * Unit tests for Code Execution Tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  executeCode,
  executeAnalysis,
  runCodeToolSchema,
  runAnalysisToolSchema,
  type E2BSandbox,
  type E2BExecutionResult,
  type RunCodeInput,
  type RunAnalysisInput,
} from '../tools/codeExecutionTools.js';

// =============================================================================
// Mock E2B Sandbox
// =============================================================================

function createMockSandbox(mockResult?: Partial<E2BExecutionResult>): E2BSandbox {
  const defaultResult: E2BExecutionResult = {
    logs: {
      stdout: mockResult?.logs?.stdout ?? ['Hello World'],
      stderr: mockResult?.logs?.stderr ?? [],
    },
    results: mockResult?.results ?? [],
    exitCode: mockResult?.exitCode ?? 0,
    error: mockResult?.error,
  };

  return {
    sandboxId: 'test-sandbox-123',
    runCode: vi.fn().mockResolvedValue(defaultResult),
    kill: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Tool Schemas', () => {
  describe('runCodeToolSchema', () => {
    it('should validate valid input', () => {
      const input = {
        language: 'python',
        code: 'print("hello")',
      };

      const result = runCodeToolSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with optional fields', () => {
      const input = {
        language: 'javascript',
        code: 'console.log("hello")',
        description: 'Test code',
        timeout: 30000,
      };

      const result = runCodeToolSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid language', () => {
      const input = {
        language: 'rust',
        code: 'fn main() {}',
      };

      const result = runCodeToolSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty code', () => {
      const input = {
        language: 'python',
        code: '',
      };

      const result = runCodeToolSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject timeout outside valid range', () => {
      const input = {
        language: 'python',
        code: 'print("hello")',
        timeout: 700000, // Exceeds max
      };

      const result = runCodeToolSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('runAnalysisToolSchema', () => {
    it('should validate valid input', () => {
      const input = {
        analysisType: 'tax_calculation',
        parameters: { income: 50000, deductions: [5000] },
      };

      const result = runAnalysisToolSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with custom code', () => {
      const input = {
        analysisType: 'custom',
        parameters: {},
        code: 'print("custom analysis")',
        outputFormat: 'json',
      };

      const result = runAnalysisToolSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should allow omitting outputFormat', () => {
      const input = {
        analysisType: 'data_analysis',
        parameters: { dataset: [1, 2, 3] },
      };

      const result = runAnalysisToolSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.outputFormat).toBeUndefined();
      }
    });
  });
});

// =============================================================================
// executeCode Tests
// =============================================================================

describe('executeCode', () => {
  it('should execute Python code successfully', async () => {
    const sandbox = createMockSandbox({
      logs: { stdout: ['Hello World'], stderr: [] },
      exitCode: 0,
    });

    const input: RunCodeInput = {
      language: 'python',
      code: 'print("Hello World")',
    };

    const result = await executeCode(input, sandbox);

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('Hello World');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.sandboxId).toBe('test-sandbox-123');
    expect(sandbox.runCode).toHaveBeenCalledWith('print("Hello World")', {
      language: 'python',
    });
  });

  it('should execute JavaScript code successfully', async () => {
    const sandbox = createMockSandbox({
      logs: { stdout: ['42'], stderr: [] },
      exitCode: 0,
    });

    const input: RunCodeInput = {
      language: 'javascript',
      code: 'console.log(42)',
    };

    const result = await executeCode(input, sandbox);

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('42');
    expect(sandbox.runCode).toHaveBeenCalledWith('console.log(42)', {
      language: 'javascript',
    });
  });

  it('should handle execution errors', async () => {
    const sandbox = createMockSandbox({
      logs: { stdout: [], stderr: ['ValueError: test error'] },
      exitCode: 1,
    });

    const input: RunCodeInput = {
      language: 'python',
      code: 'raise ValueError("test error")',
    };

    const result = await executeCode(input, sandbox);

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('ValueError');
    expect(result.exitCode).toBe(1);
  });

  it('should handle sandbox errors', async () => {
    const sandbox: E2BSandbox = {
      sandboxId: 'test-sandbox-123',
      runCode: vi.fn().mockRejectedValue(new Error('Sandbox connection failed')),
      kill: vi.fn(),
    };

    const input: RunCodeInput = {
      language: 'python',
      code: 'print("test")',
    };

    const result = await executeCode(input, sandbox);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Sandbox connection failed');
    expect(result.exitCode).toBe(1);
  });

  it('should handle E2B error field', async () => {
    const sandbox = createMockSandbox({
      logs: { stdout: [], stderr: [] },
      exitCode: 0,
      error: 'Execution timeout',
    });

    const input: RunCodeInput = {
      language: 'python',
      code: 'import time; time.sleep(100)',
    };

    const result = await executeCode(input, sandbox);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Execution timeout');
  });

  it('should log execution with logger', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const sandbox = createMockSandbox();
    const input: RunCodeInput = {
      language: 'python',
      code: 'print("test")',
      description: 'Test execution',
    };

    await executeCode(input, sandbox, logger);

    expect(logger.info).toHaveBeenCalledWith(
      '[executeCode] Starting code execution',
      expect.objectContaining({
        language: 'python',
        description: 'Test execution',
      })
    );

    expect(logger.info).toHaveBeenCalledWith(
      '[executeCode] Code execution completed',
      expect.objectContaining({
        success: true,
        exitCode: 0,
      })
    );
  });
});

// =============================================================================
// executeAnalysis Tests
// =============================================================================

describe('executeAnalysis', () => {
  it('should execute tax calculation analysis', async () => {
    const sandbox = createMockSandbox({
      logs: {
        stdout: [JSON.stringify({
          jurisdiction: 'US',
          income: 50000,
          tax_owed: 5750,
          effective_rate: 11.5,
        })],
        stderr: [],
      },
      exitCode: 0,
    });

    const input: RunAnalysisInput = {
      analysisType: 'tax_calculation',
      parameters: { income: 50000, jurisdiction: 'US', deductions: [2000] },
    };

    const result = await executeAnalysis(input, sandbox);

    expect(result.success).toBe(true);
    expect(result.parsedOutput).toBeDefined();
    expect(result.parsedOutput).toHaveProperty('tax_owed');
    expect(sandbox.runCode).toHaveBeenCalled();
  });

  it('should execute compliance check analysis', async () => {
    const sandbox = createMockSandbox({
      logs: {
        stdout: [JSON.stringify({
          jurisdiction: 'US',
          entity_type: 'corporation',
          compliant_count: 3,
        })],
        stderr: [],
      },
      exitCode: 0,
    });

    const input: RunAnalysisInput = {
      analysisType: 'compliance_check',
      parameters: {
        jurisdiction: 'US',
        entity_type: 'corporation',
        requirements: ['req-1', 'req-2', 'req-3'],
      },
    };

    const result = await executeAnalysis(input, sandbox);

    expect(result.success).toBe(true);
    expect(result.parsedOutput).toHaveProperty('compliant_count', 3);
  });

  it('should execute data analysis', async () => {
    const sandbox = createMockSandbox({
      logs: {
        stdout: [JSON.stringify({
          count: 5,
          min: 10,
          max: 50,
          mean: 30,
          sum: 150,
        })],
        stderr: [],
      },
      exitCode: 0,
    });

    const input: RunAnalysisInput = {
      analysisType: 'data_analysis',
      parameters: {
        dataset: [10, 20, 30, 40, 50],
        analysis_type: 'summary',
      },
    };

    const result = await executeAnalysis(input, sandbox);

    expect(result.success).toBe(true);
    expect(result.parsedOutput).toHaveProperty('mean', 30);
  });

  it('should execute custom analysis code', async () => {
    const sandbox = createMockSandbox({
      logs: {
        stdout: [JSON.stringify({ custom: 'result' })],
        stderr: [],
      },
      exitCode: 0,
    });

    const input: RunAnalysisInput = {
      analysisType: 'custom',
      parameters: {},
      code: 'print(\'{"custom": "result"}\')',
    };

    const result = await executeAnalysis(input, sandbox);

    expect(result.success).toBe(true);
    expect(result.parsedOutput).toEqual({ custom: 'result' });
  });

  it('should handle JSON parsing errors gracefully', async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const sandbox = createMockSandbox({
      logs: {
        stdout: ['invalid json {'],
        stderr: [],
      },
      exitCode: 0,
    });

    const input: RunAnalysisInput = {
      analysisType: 'tax_calculation',
      parameters: { income: 50000 },
    };

    const result = await executeAnalysis(input, sandbox, logger);

    expect(result.success).toBe(true);
    expect(result.parsedOutput).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      '[executeAnalysis] Failed to parse JSON output',
      expect.any(Object)
    );
  });

  it('should handle analysis errors', async () => {
    const sandbox = createMockSandbox({
      logs: {
        stdout: [],
        stderr: ['Error: Invalid parameters'],
      },
      exitCode: 1,
    });

    const input: RunAnalysisInput = {
      analysisType: 'tax_calculation',
      parameters: {},
    };

    const result = await executeAnalysis(input, sandbox);

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('Invalid parameters');
  });

  it('should handle text output format', async () => {
    const sandbox = createMockSandbox({
      logs: {
        stdout: ['Tax owed: $5750'],
        stderr: [],
      },
      exitCode: 0,
    });

    const input: RunAnalysisInput = {
      analysisType: 'tax_calculation',
      parameters: { income: 50000 },
      outputFormat: 'text',
    };

    const result = await executeAnalysis(input, sandbox);

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('Tax owed: $5750');
    expect(result.parsedOutput).toBeUndefined(); // No JSON parsing for text format
  });

  it('should throw error for custom analysis without code', async () => {
    const sandbox = createMockSandbox();

    const input: RunAnalysisInput = {
      analysisType: 'custom',
      parameters: {},
      // No code provided
    };

    const result = await executeAnalysis(input, sandbox);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No code provided');
  });
});
