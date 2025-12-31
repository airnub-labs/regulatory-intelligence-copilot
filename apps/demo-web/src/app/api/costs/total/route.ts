/**
 * Total Cost API
 *
 * Get total cost for a specific scope and time range
 *
 * POST /api/costs/total
 * {
 *   "scope": "tenant",
 *   "scopeId": "acme-corp",
 *   "startTime": "2024-01-01T00:00:00Z",
 *   "endTime": "2024-01-31T23:59:59Z"
 * }
 *
 * Response:
 * {
 *   "scope": "tenant",
 *   "scopeId": "acme-corp",
 *   "totalCostUsd": 234.56,
 *   "startTime": "2024-01-01T00:00:00Z",
 *   "endTime": "2024-01-31T23:59:59Z"
 * }
 */

import { NextResponse } from 'next/server';
import { getCostTrackingServiceIfInitialized } from '@reg-copilot/reg-intel-observability';

interface TotalCostRequest {
  scope: 'platform' | 'tenant' | 'user' | 'task' | 'conversation';
  scopeId?: string;
  startTime?: string;
  endTime?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const costService = getCostTrackingServiceIfInitialized();

    if (!costService || !costService.hasStorage()) {
      return NextResponse.json(
        { error: 'Cost tracking storage not initialized' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as TotalCostRequest;

    if (!body.scope) {
      return NextResponse.json({ error: 'scope is required' }, { status: 400 });
    }

    // Parse date strings
    const startTime = body.startTime ? new Date(body.startTime) : undefined;
    const endTime = body.endTime ? new Date(body.endTime) : undefined;

    const totalCostUsd = await costService.getTotalCost(
      body.scope,
      body.scopeId,
      startTime,
      endTime
    );

    return NextResponse.json({
      scope: body.scope,
      scopeId: body.scopeId,
      totalCostUsd,
      startTime: body.startTime,
      endTime: body.endTime,
    });
  } catch (error) {
    console.error('Total cost API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
