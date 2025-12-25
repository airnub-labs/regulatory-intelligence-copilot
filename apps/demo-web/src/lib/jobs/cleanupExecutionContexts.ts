import 'server-only';

import type { ExecutionContextManager, CleanupResult } from '@reg-copilot/reg-intel-conversations';
import { withSpan, createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('CleanupExecutionContexts');

/**
 * Cleanup job for expired execution contexts
 *
 * This function is called by the cron job endpoint to clean up E2B sandboxes
 * that have exceeded their TTL. Each sandbox has a default TTL of 30 minutes,
 * extended on each use. Expired sandboxes are terminated to free resources.
 *
 * @param manager - The ExecutionContextManager instance
 * @param limit - Maximum number of contexts to clean per run (default: 50)
 * @returns Cleanup statistics including cleaned count and errors
 */
export async function cleanupExecutionContexts(
  manager: ExecutionContextManager,
  limit: number = 50
): Promise<CleanupResult> {
  return withSpan(
    'cron.cleanup_execution_contexts',
    { 'cleanup.limit': limit },
    async () => {
      logger.info({ limit }, 'Starting execution context cleanup');

      const startTime = Date.now();
      const result = await manager.cleanupExpired(limit);
      const durationMs = Date.now() - startTime;

      logger.info(
        { cleaned: result.cleaned, errors: result.errors, durationMs },
        'Cleanup completed'
      );

      if (result.errors > 0 && result.errorDetails) {
        logger.warn(
          { errorCount: result.errors, details: result.errorDetails },
          'Cleanup had errors'
        );
      }

      return result;
    }
  );
}
