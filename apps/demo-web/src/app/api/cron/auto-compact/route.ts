/**
 * Auto-Compaction Cron Endpoint
 *
 * Trigger automatic compaction of conversations via cron job.
 *
 * Security: Requires CRON_SECRET environment variable to authenticate requests.
 *
 * Usage:
 * - Vercel Cron: Configure in vercel.json
 * - GitHub Actions: Schedule with cron syntax
 * - Manual: POST with Authorization header
 *
 * Example vercel.json:
 * ```json
 * {
 *   "crons": [{
 *     "path": "/api/cron/auto-compact",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAutoCompactionJob, type AutoCompactionJobConfig } from '@/lib/jobs/autoCompactionJob';
import { conversationStore } from '@/lib/server/conversations';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('AutoCompactionCron');

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('Authorization');

    if (cronSecret) {
      const providedSecret = authHeader?.replace('Bearer ', '');

      if (!providedSecret || providedSecret !== cronSecret) {
        logger.warn('Unauthorized auto-compaction cron request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      logger.warn('CRON_SECRET not configured - cron endpoint is unprotected');
    }

    // Parse request body for custom configuration (optional)
    let customConfig: Partial<AutoCompactionJobConfig> = {};
    try {
      const body = await request.json();
      customConfig = body.config || {};
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Default configuration
    const config: AutoCompactionJobConfig = {
      tokenThreshold: customConfig.tokenThreshold || 100_000,
      targetTokenRatio: customConfig.targetTokenRatio || 0.8,
      strategy: customConfig.strategy || 'sliding_window',
      batchSize: customConfig.batchSize || 100,
      model: customConfig.model || 'gpt-4',
      createSnapshots: customConfig.createSnapshots ?? true,
      dryRun: customConfig.dryRun ?? false,
    };

    logger.info(
      {
        config,
      },
      'Starting auto-compaction cron job'
    );

    // Run compaction job
    const result = await runAutoCompactionJob(conversationStore, config);

    logger.info(
      {
        processed: result.processedConversations,
        compacted: result.compactedConversations,
        tokensSaved: result.totalTokensSaved,
        errors: result.errors,
        durationMs: result.durationMs,
      },
      'Auto-compaction cron job completed'
    );

    return NextResponse.json(
      {
        success: true,
        result: {
          processedConversations: result.processedConversations,
          compactedConversations: result.compactedConversations,
          totalTokensSaved: result.totalTokensSaved,
          totalMessagesRemoved: result.totalMessagesRemoved,
          errors: result.errors,
          durationMs: result.durationMs,
          // Don't return full details in response (could be large)
          sampleDetails: result.details.slice(0, 5),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Auto-compaction cron job failed'
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Support GET for health checks
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cron/auto-compact',
    method: 'POST',
    description: 'Automatic conversation compaction cron job',
    authentication: process.env.CRON_SECRET ? 'required' : 'not configured',
    status: 'ready',
  });
}
