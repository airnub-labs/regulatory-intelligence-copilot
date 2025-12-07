/**
 * Custom error classes for the Regulatory Intelligence Copilot
 *
 * Usage:
 * ```typescript
 * throw new SandboxError('Failed to create sandbox', { cause: originalError });
 * ```
 */

/**
 * Base error class for all compliance errors
 */
export class ComplianceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ComplianceError';
  }
}

/**
 * Error thrown when E2B sandbox operations fail
 */
export class SandboxError extends ComplianceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SandboxError';
  }
}

/**
 * Error thrown when MCP gateway calls fail
 */
export class McpError extends ComplianceError {
  public readonly toolName?: string;

  constructor(message: string, toolName?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'McpError';
    this.toolName = toolName;
  }
}

/**
 * Error thrown when LLM calls fail
 */
export class LlmError extends ComplianceError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmError';
    this.statusCode = statusCode;
  }
}

/**
 * Error thrown when graph operations fail
 */
export class GraphError extends ComplianceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GraphError';
  }
}

/**
 * Error thrown when agent operations fail
 */
export class AgentError extends ComplianceError {
  public readonly agentId?: string;

  constructor(message: string, agentId?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AgentError';
    this.agentId = agentId;
  }
}

/**
 * Type guard to check if an error is a ComplianceError
 */
export function isComplianceError(error: unknown): error is ComplianceError {
  return error instanceof ComplianceError;
}

/**
 * Extract a user-friendly error message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
