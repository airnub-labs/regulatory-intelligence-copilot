/**
 * Cost Aggregation API
 *
 * Get aggregated cost metrics across multiple dimensions
 *
 * POST /api/costs/aggregate
 * {
 *   "startTime": "2024-01-01T00:00:00Z",
 *   "endTime": "2024-01-31T23:59:59Z",
 *   "groupBy": ["tenant"],
 *   "limit": 10,
 *   "sortBy": "cost_desc"
 * }
 *
 * Response:
 * {
 *   "aggregates": [
 *     {
 *       "dimension": "tenantId",
 *       "value": "acme-corp",
 *       "totalCostUsd": 234.56,
 *       "requestCount": 1234,
 *       "totalTokens": 567890,
 *       "avgCostPerRequest": 0.19,
 *       "firstRequest": "2024-01-01T10:23:45Z",
 *       "lastRequest": "2024-01-31T18:45:12Z"
 *     }
 *   ],
 *   "count": 1
 * }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import {
  getCostTrackingServiceIfInitialized,
  type CostAggregateQuery,
} from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const { userId, tenantId, role } = await getTenantContext(session);

    const costService = getCostTrackingServiceIfInitialized();

    if (!costService || !costService.hasStorage()) {
      return NextResponse.json(
        { error: 'Cost tracking storage not initialized' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as CostAggregateQuery;

    // Parse date strings to Date objects if provided
    if (body.startTime && typeof body.startTime === 'string') {
      body.startTime = new Date(body.startTime);
    }
    if (body.endTime && typeof body.endTime === 'string') {
      body.endTime = new Date(body.endTime);
    }

    const aggregates = await costService.getAggregatedCosts(body);

    return NextResponse.json({
      aggregates,
      count: aggregates.length,
    });
  } catch (error) {
    console.error('Cost aggregation API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
