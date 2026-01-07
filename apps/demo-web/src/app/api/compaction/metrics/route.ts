/**
 * Compaction Metrics API
 *
 * GET /api/compaction/metrics
 *
 * Query params:
 * - timeRange: '24h' | '7d' | '30d' | 'all' (default: '7d')
 *
 * Returns aggregated compaction metrics, strategy breakdown, and recent operations
 * for the authenticated user's current tenant.
 *
 * SECURITY: Tenant-scoped - users only see metrics for their own tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
import { createInfrastructureServiceClient } from '@/lib/supabase/infrastructureServiceClient';

interface CompactionMetricsResponse {
  totalOperations: number;
  totalTokensSaved: number;
  totalMessagesRemoved: number;
  averageCompressionRatio: number;
  averageDurationMs: number;
  totalCostUsd: number;
  operationsUsingLlm: number;
  successRate: number;
  strategyBreakdown: {
    strategy: string;
    operations: number;
    tokensSaved: number;
    avgCompressionRatio: number;
  }[];
  recentOperations: {
    id: string;
    conversationId: string | null;
    timestamp: string;
    strategy: string;
    tokensSaved: number;
    compressionRatio: number;
    durationMs: number | null;
    success: boolean;
  }[];
}

function getTimeRangeStart(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: Get user's tenant context
    const { userId, tenantId } = await getTenantContext(session);
    if (!tenantId) {
      return NextResponse.json({ error: 'No active tenant' }, { status: 400 });
    }

    // Use infrastructure client with copilot_internal schema for analytics functions
    const supabase = createInfrastructureServiceClient('CompactionMetrics', {
      db: { schema: 'copilot_internal' }
    });

    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '7d';

    const startTime = getTimeRangeStart(timeRange);
    const endTime = new Date();

    // Fetch aggregated metrics for THIS tenant only
    const { data: metricsData, error: metricsError } = await supabase.rpc(
      'get_compaction_metrics',
      {
        p_start_time: startTime?.toISOString() || null,
        p_end_time: endTime.toISOString(),
        p_tenant_id: tenantId, // Always scope to user's tenant
      }
    );

    if (metricsError) {
      console.error('Error fetching compaction metrics:', metricsError);
      // Fall back to empty data if function doesn't exist yet
      if (metricsError.code === '42883' || metricsError.message.includes('does not exist')) {
        return NextResponse.json(getExampleData());
      }
      return NextResponse.json(
        { error: 'Failed to fetch metrics', details: metricsError.message },
        { status: 500 }
      );
    }

    // Fetch strategy breakdown for THIS tenant only
    const { data: strategyData, error: strategyError } = await supabase.rpc(
      'get_compaction_strategy_breakdown',
      {
        p_start_time: startTime?.toISOString() || null,
        p_end_time: endTime.toISOString(),
        p_tenant_id: tenantId, // Always scope to user's tenant
      }
    );

    if (strategyError) {
      console.error('Error fetching strategy breakdown:', strategyError);
    }

    // Fetch recent operations for THIS tenant only
    const { data: recentData, error: recentError } = await supabase.rpc(
      'get_recent_compaction_operations',
      {
        p_limit: 10,
        p_tenant_id: tenantId, // Always scope to user's tenant
      }
    );

    if (recentError) {
      console.error('Error fetching recent operations:', recentError);
    }

    // Build response
    const metrics = metricsData?.[0] || {};
    const totalOps = Number(metrics.total_operations) || 0;
    const successfulOps = Number(metrics.successful_operations) || 0;

    const response: CompactionMetricsResponse = {
      totalOperations: totalOps,
      totalTokensSaved: Number(metrics.total_tokens_saved) || 0,
      totalMessagesRemoved: Number(metrics.total_messages_removed) || 0,
      averageCompressionRatio: Number(metrics.avg_compression_ratio) || 1,
      averageDurationMs: Math.round(Number(metrics.avg_duration_ms) || 0),
      totalCostUsd: Number(metrics.total_cost_usd) || 0,
      operationsUsingLlm: Number(metrics.operations_using_llm) || 0,
      successRate: totalOps > 0 ? (successfulOps / totalOps) * 100 : 100,
      strategyBreakdown: (strategyData || []).map((s: Record<string, unknown>) => ({
        strategy: String(s.strategy),
        operations: Number(s.operations) || 0,
        tokensSaved: Number(s.tokens_saved) || 0,
        avgCompressionRatio: Number(s.avg_compression_ratio) || 1,
      })),
      recentOperations: (recentData || []).map((op: Record<string, unknown>) => ({
        id: String(op.id),
        conversationId: op.conversation_id ? String(op.conversation_id) : null,
        timestamp: String(op.timestamp),
        strategy: String(op.strategy),
        tokensSaved: Number(op.tokens_saved) || 0,
        compressionRatio: Number(op.compression_ratio) || 1,
        durationMs: op.duration_ms ? Number(op.duration_ms) : null,
        success: Boolean(op.success),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Compaction metrics error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Returns example data when Supabase is not available or has no data.
 * This allows the dashboard to display something useful during development.
 */
function getExampleData(): CompactionMetricsResponse {
  return {
    totalOperations: 0,
    totalTokensSaved: 0,
    totalMessagesRemoved: 0,
    averageCompressionRatio: 1,
    averageDurationMs: 0,
    totalCostUsd: 0,
    operationsUsingLlm: 0,
    successRate: 100,
    strategyBreakdown: [],
    recentOperations: [],
  };
}
