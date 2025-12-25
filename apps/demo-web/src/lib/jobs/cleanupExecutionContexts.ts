import 'server-only';

import type { ExecutionContextManager, CleanupResult } from '@reg-copilot/reg-intel-conversations';
import { withSpan } from '@reg-copilot/reg-intel-observability';

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
      console.info('[cleanup-job] Starting execution context cleanup', { limit });

      const startTime = Date.now();
      const result = await manager.cleanupExpired(limit);
      const durationMs = Date.now() - startTime;

      console.info('[cleanup-job] Cleanup completed', {
        cleaned: result.cleaned,
        errors: result.errors,
        durationMs,
      });

      if (result.errors > 0 && result.errorDetails) {
        console.warn('[cleanup-job] Cleanup had errors', {
          errorCount: result.errors,
          details: result.errorDetails,
        });
      }

      return result;
    }
  );
}
