/**
 * Code Execution Tools for E2B Sandbox Integration
 *
 * Provides tools for executing code and running analyses in isolated E2B sandboxes.
 * These tools are integrated with the execution context manager to ensure
 * per-path sandbox isolation.
 *
 * ## Sanitization Modes
 *
 * Sandbox output sanitization can be configured independently:
 *
 * - **calculation** (default): Conservative sanitization, avoids false positives
 *   on regulatory references and version numbers
 * - **chat**: Full sanitization (same as LLM chat)
 * - **off**: No sanitization (for trusted/internal use)
 *
 * ```typescript
 * // Default: calculation mode (conservative)
 * const result = await executeCode(input, sandbox);
 *
 * // Disable sanitization for this execution
 * const result = await executeCode(input, sandbox, logger, { sanitization: 'off' });
 *
 * // Use full chat-level sanitization
 * const result = await executeCode(input, sandbox, logger, { sanitization: 'chat' });
 * ```
 */

import { z } from 'zod';
import {
  sanitizeTextForEgress,
  sanitizeObjectForEgress,
  type SanitizationContext,
  type SanitizationOptions,
} from '../egressGuard.js';

// =============================================================================
// E2B Sandbox Interface (Duck-typed to avoid hard dependency)
// =============================================================================

/**
 * Minimal E2B Sandbox interface for code execution
 * This allows us to work with E2B without a hard dependency on @e2b/code-interpreter
 */
export interface E2BSandbox {
  sandboxId: string;
  runCode(code: string, options?: { language?: string }): Promise<E2BExecutionResult>;
  kill(): Promise<void>;
}

export interface E2BExecutionResult {
  logs: {
    stdout: string[];
    stderr: string[];
  };
  results: unknown[];
  exitCode?: number;
  error?: unknown;
}

// =============================================================================
// Execution Options
// =============================================================================

/**
 * Options for code execution
 */
export interface CodeExecutionOptions {
  /**
   * Sanitization mode for output:
   * - 'calculation': Conservative sanitization (default) - avoids false positives
   * - 'chat': Full sanitization
   * - 'strict': Aggressive sanitization
   * - 'off': No sanitization
   */
  sanitization?: SanitizationContext;

  /**
   * Additional sanitization options
   */
  sanitizationOptions?: Omit<SanitizationOptions, 'context'>;
}

// =============================================================================
// Tool Schemas
// =============================================================================

/**
 * Schema for run_code tool
 * Executes arbitrary code in the sandboxed environment
 */
export const runCodeToolSchema = z.object({
  language: z
    .enum(['python', 'javascript', 'typescript', 'bash', 'sh'])
    .describe('Programming language for code execution'),
  code: z
    .string()
    .min(1)
    .describe('Code to execute in the sandbox'),
  description: z
    .string()
    .optional()
    .describe('Optional description of what this code does (for logging)'),
  timeout: z
    .number()
    .min(1000)
    .max(600000)
    .optional()
    .describe('Execution timeout in milliseconds (default: 60000, max: 600000)'),
});

export type RunCodeInput = z.infer<typeof runCodeToolSchema>;

/**
 * Schema for run_analysis tool
 * Executes predefined or custom analysis code
 */
export const runAnalysisToolSchema = z.object({
  analysisType: z
    .enum(['tax_calculation', 'compliance_check', 'data_analysis', 'custom'])
    .describe('Type of analysis to run'),
  parameters: z
    .record(z.unknown())
    .describe('Analysis parameters (passed to analysis code as JSON)'),
  code: z
    .string()
    .optional()
    .describe('Optional custom code to run (required if analysisType is "custom")'),
  outputFormat: z
    .enum(['json', 'text', 'csv'])
    .optional()
    .describe('Expected output format (defaults to "json")'),
});

export type RunAnalysisInput = z.infer<typeof runAnalysisToolSchema>;

// =============================================================================
// Tool Result Types
// =============================================================================

export interface CodeExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  executionTimeMs?: number;
  sandboxId?: string;
  /** Indicates which sanitization mode was used */
  sanitizationMode?: SanitizationContext;
}

export interface AnalysisExecutionResult extends CodeExecutionResult {
  result?: unknown;
  parsedOutput?: unknown;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create sanitization options for sandbox output
 */
function getSanitizationOptions(execOptions?: CodeExecutionOptions): SanitizationOptions {
  const context = execOptions?.sanitization ?? 'calculation';
  return {
    context,
    ...execOptions?.sanitizationOptions,
  };
}

/**
 * Conditionally sanitize text based on options
 */
function sanitizeOutput(text: string, options: SanitizationOptions): string {
  if (options.context === 'off') {
    return text;
  }
  return sanitizeTextForEgress(text, options);
}

/**
 * Conditionally sanitize object based on options
 */
function sanitizeOutputObject<T>(obj: T, options: SanitizationOptions): T {
  if (options.context === 'off') {
    return obj;
  }
  return sanitizeObjectForEgress(obj, options);
}

// =============================================================================
// Tool Implementations
// =============================================================================

/**
 * Execute code in E2B sandbox
 *
 * @param input - Code execution input
 * @param sandbox - E2B sandbox instance
 * @param logger - Optional logger
 * @param execOptions - Execution options including sanitization mode
 */
export async function executeCode(
  input: RunCodeInput,
  sandbox: E2BSandbox,
  logger?: { info?: (msg: string, meta?: unknown) => void; error?: (msg: string, meta?: unknown) => void },
  execOptions?: CodeExecutionOptions
): Promise<CodeExecutionResult> {
  const startTime = Date.now();
  const sanitizationOpts = getSanitizationOptions(execOptions);

  try {
    logger?.info?.('[executeCode] Starting code execution', {
      language: input.language,
      sandboxId: sandbox.sandboxId,
      description: input.description,
      sanitizationMode: sanitizationOpts.context,
    });

    const result = await sandbox.runCode(input.code, {
      language: input.language,
    });

    const executionTimeMs = Date.now() - startTime;
    const rawStdout = result.logs.stdout.join('\n');
    const rawStderr = result.logs.stderr.join('\n');
    const exitCode = result.exitCode ?? 0;
    const success = exitCode === 0 && !result.error;

    // Sanitize all output based on configured mode
    const stdout = sanitizeOutput(rawStdout, sanitizationOpts);
    const stderr = sanitizeOutput(rawStderr, sanitizationOpts);

    logger?.info?.('[executeCode] Code execution completed', {
      sandboxId: sandbox.sandboxId,
      exitCode,
      success,
      executionTimeMs,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
      sanitizationMode: sanitizationOpts.context,
    });

    return {
      success,
      stdout,
      stderr,
      exitCode,
      error: result.error ? sanitizeOutput(String(result.error), sanitizationOpts) : undefined,
      executionTimeMs,
      sandboxId: sandbox.sandboxId,
      sanitizationMode: sanitizationOpts.context,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    logger?.error?.('[executeCode] Code execution failed', {
      sandboxId: sandbox.sandboxId,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs,
    });

    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: sanitizeOutput(error instanceof Error ? error.message : String(error), sanitizationOpts),
      executionTimeMs,
      sandboxId: sandbox.sandboxId,
      sanitizationMode: sanitizationOpts.context,
    };
  }
}

/**
 * Execute analysis in E2B sandbox
 *
 * @param input - Analysis input
 * @param sandbox - E2B sandbox instance
 * @param logger - Optional logger
 * @param execOptions - Execution options including sanitization mode
 */
export async function executeAnalysis(
  input: RunAnalysisInput,
  sandbox: E2BSandbox,
  logger?: { info?: (msg: string, meta?: unknown) => void; error?: (msg: string, meta?: unknown) => void },
  execOptions?: CodeExecutionOptions
): Promise<AnalysisExecutionResult> {
  const startTime = Date.now();
  const outputFormat = input.outputFormat ?? 'json';
  const sanitizationOpts = getSanitizationOptions(execOptions);

  try {
    logger?.info?.('[executeAnalysis] Starting analysis execution', {
      analysisType: input.analysisType,
      sandboxId: sandbox.sandboxId,
      hasCustomCode: !!input.code,
      sanitizationMode: sanitizationOpts.context,
    });

    // Generate or use provided code
    const code = input.code ?? generateAnalysisCode(input.analysisType, input.parameters, outputFormat);

    if (!code) {
      throw new Error(`No code provided and no template available for analysis type: ${input.analysisType}`);
    }

    // Execute with Python (default for analyses)
    const result = await sandbox.runCode(code, { language: 'python' });

    const executionTimeMs = Date.now() - startTime;
    const rawStdout = result.logs.stdout.join('\n');
    const rawStderr = result.logs.stderr.join('\n');
    const exitCode = result.exitCode ?? 0;
    const success = exitCode === 0 && !result.error;

    // Sanitize all output based on configured mode
    const stdout = sanitizeOutput(rawStdout, sanitizationOpts);
    const stderr = sanitizeOutput(rawStderr, sanitizationOpts);

    // Parse output if JSON format expected
    let parsedOutput: unknown;
    if (outputFormat === 'json' && stdout) {
      try {
        const parsed = JSON.parse(stdout);
        // Sanitize parsed output
        parsedOutput = sanitizeOutputObject(parsed, sanitizationOpts);
      } catch (parseError) {
        logger?.error?.('[executeAnalysis] Failed to parse JSON output', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
      }
    }

    // Sanitize results array if present
    const sanitizedResults = result.results?.length
      ? sanitizeOutputObject(result.results, sanitizationOpts)
      : result.results;

    logger?.info?.('[executeAnalysis] Analysis execution completed', {
      sandboxId: sandbox.sandboxId,
      exitCode,
      success,
      executionTimeMs,
      hasResults: !!result.results?.length,
      hasParsedOutput: !!parsedOutput,
      sanitizationMode: sanitizationOpts.context,
    });

    return {
      success,
      stdout,
      stderr,
      exitCode,
      error: result.error ? sanitizeOutput(String(result.error), sanitizationOpts) : undefined,
      executionTimeMs,
      sandboxId: sandbox.sandboxId,
      result: sanitizedResults,
      parsedOutput,
      sanitizationMode: sanitizationOpts.context,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    logger?.error?.('[executeAnalysis] Analysis execution failed', {
      sandboxId: sandbox.sandboxId,
      analysisType: input.analysisType,
      error: error instanceof Error ? error.message : String(error),
      executionTimeMs,
    });

    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: 1,
      error: sanitizeOutput(error instanceof Error ? error.message : String(error), sanitizationOpts),
      executionTimeMs,
      sandboxId: sandbox.sandboxId,
      sanitizationMode: sanitizationOpts.context,
    };
  }
}

/**
 * Generate analysis code based on type
 * This provides templates for common analysis patterns
 */
function generateAnalysisCode(
  type: string,
  params: Record<string, unknown>,
  outputFormat: 'json' | 'text' | 'csv'
): string | null {
  const paramsJson = JSON.stringify(params, null, 2);

  switch (type) {
    case 'tax_calculation':
      return `
import json
import sys

params = ${paramsJson}

def calculate_tax(parameters):
    """
    Calculate tax based on provided parameters.
    Expected parameters:
      - income: Total income amount
      - jurisdiction: Tax jurisdiction code
      - deductions: List of deduction amounts
    """
    income = parameters.get('income', 0)
    jurisdiction = parameters.get('jurisdiction', 'US')
    deductions = parameters.get('deductions', [])

    # Simple progressive tax calculation (example)
    total_deductions = sum(deductions)
    taxable_income = max(0, income - total_deductions)

    # Progressive brackets (simplified example)
    if taxable_income <= 10000:
        tax = taxable_income * 0.10
    elif taxable_income <= 50000:
        tax = 1000 + (taxable_income - 10000) * 0.15
    else:
        tax = 7000 + (taxable_income - 50000) * 0.25

    return {
        'jurisdiction': jurisdiction,
        'income': income,
        'total_deductions': total_deductions,
        'taxable_income': taxable_income,
        'tax_owed': tax,
        'effective_rate': (tax / income * 100) if income > 0 else 0
    }

try:
    result = calculate_tax(params)
    ${outputFormat === 'json' ? "print(json.dumps(result, indent=2))" : "print(result)"}
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

    case 'compliance_check':
      return `
import json
import sys

params = ${paramsJson}

def check_compliance(parameters):
    """
    Perform compliance check based on parameters.
    Expected parameters:
      - jurisdiction: Regulatory jurisdiction
      - entity_type: Type of entity (corporation, llc, etc)
      - requirements: List of requirement IDs to check
    """
    jurisdiction = parameters.get('jurisdiction', 'US')
    entity_type = parameters.get('entity_type', 'corporation')
    requirements = parameters.get('requirements', [])

    # Mock compliance check (replace with actual logic)
    results = []
    for req_id in requirements:
        results.append({
            'requirement_id': req_id,
            'status': 'compliant',  # or 'non_compliant', 'pending'
            'notes': f'Check passed for {req_id}'
        })

    return {
        'jurisdiction': jurisdiction,
        'entity_type': entity_type,
        'total_requirements': len(requirements),
        'compliant_count': len([r for r in results if r['status'] == 'compliant']),
        'results': results
    }

try:
    result = check_compliance(params)
    ${outputFormat === 'json' ? "print(json.dumps(result, indent=2))" : "print(result)"}
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

    case 'data_analysis':
      return `
import json
import sys

params = ${paramsJson}

def analyze_data(parameters):
    """
    Perform data analysis based on parameters.
    Expected parameters:
      - dataset: Data to analyze (array of objects)
      - analysis_type: Type of analysis (summary, statistics, etc)
    """
    dataset = parameters.get('dataset', [])
    analysis_type = parameters.get('analysis_type', 'summary')

    if not dataset:
        return {'error': 'No dataset provided'}

    # Basic statistical analysis
    if isinstance(dataset[0], (int, float)):
        values = dataset
    elif isinstance(dataset[0], dict) and 'value' in dataset[0]:
        values = [item['value'] for item in dataset if 'value' in item]
    else:
        return {'error': 'Unsupported dataset format'}

    return {
        'analysis_type': analysis_type,
        'count': len(values),
        'min': min(values) if values else None,
        'max': max(values) if values else None,
        'mean': sum(values) / len(values) if values else None,
        'sum': sum(values) if values else None,
    }

try:
    result = analyze_data(params)
    ${outputFormat === 'json' ? "print(json.dumps(result, indent=2))" : "print(result)"}
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

    case 'custom':
      // Custom analysis requires code to be provided
      return null;

    default:
      return null;
  }
}
