/**
 * Utility functions for event hub infrastructure
 */

/**
 * Generate a unique instance identifier
 *
 * Used to identify the server instance that published an event,
 * allowing receivers to filter out events they published themselves.
 *
 * @returns A unique instance ID in the format `instance-{timestamp}-{random}`
 */
export function generateInstanceId(): string {
  return `instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
