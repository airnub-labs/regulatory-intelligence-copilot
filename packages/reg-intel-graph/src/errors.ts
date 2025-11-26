/**
 * Error classes for @reg-copilot/reg-intel-graph
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
 * Error thrown when graph operations fail
 */
export class GraphError extends ComplianceError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GraphError';
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
