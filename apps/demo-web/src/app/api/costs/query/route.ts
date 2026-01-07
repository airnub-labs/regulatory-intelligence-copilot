/**
 * Cost Query API
 *
 * Query detailed LLM cost records with filtering and sorting
 *
 * POST /api/costs/query
 * {
 *   "startTime": "2024-01-01T00:00:00Z",
 *   "endTime": "2024-01-31T23:59:59Z",
 *   "groupBy": ["tenant", "task"],
 *   "tenantIds": ["acme-corp"],
 *   "limit": 100,
 *   "sortBy": "cost_desc"
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
import type { ExtendedSession } from '@/types/auth';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
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

    const records = await costService.queryCosts(body);

    return NextResponse.json({
      records,
      count: records.length,
    });
  } catch (error) {
    console.error('Cost query API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
