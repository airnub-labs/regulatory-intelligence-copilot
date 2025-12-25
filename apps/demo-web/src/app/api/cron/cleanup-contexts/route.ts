import { NextRequest, NextResponse } from 'next/server';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { executionContextManager } from '@/lib/server/conversations';
import { cleanupExecutionContexts } from '@/lib/jobs/cleanupExecutionContexts';

const logger = createLogger('CronCleanupContextsRoute');

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for cleanup

/**
 * Cron job endpoint for cleaning up expired execution contexts
 *
 * This endpoint is called by Vercel Cron (or similar scheduler) to
 * terminate E2B sandboxes that have exceeded their TTL.
 *
 * Security: Requires CRON_SECRET in Authorization header
 * Schedule: Runs hourly (configured in vercel.json)
 *
 * @example
 * curl -X POST https://your-app.vercel.app/api/cron/cleanup-contexts \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  const tenantId = 'system';
  const userId = 'cron';

  return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.cron.cleanup-contexts',
        { 'app.route': '/api/cron/cleanup-contexts', 'app.tenant.id': tenantId, 'app.user.id': userId },
        async () => {
          // Verify CRON_SECRET
          const cronSecret = process.env.CRON_SECRET;
          if (!cronSecret) {
            logger.error({ tenantId, userId }, 'CRON_SECRET not configured');
            return NextResponse.json(
              { error: 'Cron endpoint not configured' },
              { status: 500 }
            );
          }

          const authHeader = request.headers.get('authorization');
          const providedSecret = authHeader?.replace('Bearer ', '');

          if (providedSecret !== cronSecret) {
            logger.warn({ tenantId, userId }, 'Unauthorized request');
            return NextResponse.json(
              { error: 'Unauthorized' },
              { status: 401 }
            );
          }

          // Check if ExecutionContextManager is available
          if (!executionContextManager) {
            logger.info({ tenantId, userId }, 'ExecutionContextManager not configured (E2B disabled)');
            return NextResponse.json({
              message: 'Execution context cleanup skipped - E2B not configured',
              cleaned: 0,
              errors: 0,
            });
          }

          try {
            // Run cleanup with default limit of 50 contexts per run
            const result = await cleanupExecutionContexts(executionContextManager);

            return NextResponse.json({
              message: 'Cleanup completed successfully',
              cleaned: result.cleaned,
              errors: result.errors,
              ...(result.errorDetails && { errorDetails: result.errorDetails }),
            });
          } catch (error) {
            logger.error({ err: error, tenantId, userId }, 'Cleanup failed');
            return NextResponse.json(
              {
                error: 'Cleanup failed',
                details: error instanceof Error ? error.message : 'Unknown error',
              },
              { status: 500 }
            );
          }
        },
      ),
  );
}

/**
 * GET handler for health check / manual trigger info
 */
export async function GET() {
  return requestContext.run(
    { tenantId: 'system', userId: 'cron' },
    () =>
      withSpan(
        'api.cron.cleanup-contexts.info',
        { 'app.route': '/api/cron/cleanup-contexts', 'app.tenant.id': 'system', 'app.user.id': 'cron' },
        () =>
          NextResponse.json({
            endpoint: '/api/cron/cleanup-contexts',
            method: 'POST',
            description: 'Cleans up expired E2B execution contexts',
            schedule: 'Every hour (0 * * * *)',
            authentication: 'Bearer token with CRON_SECRET',
            executionContextEnabled: !!executionContextManager,
          }),
      ),
  );
}
