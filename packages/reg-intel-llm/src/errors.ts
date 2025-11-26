/**
 * Error classes for @reg-copilot/reg-intel-llm
 */

/**
 * Base error class for compliance operations
 */
export class ComplianceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ComplianceError';
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
