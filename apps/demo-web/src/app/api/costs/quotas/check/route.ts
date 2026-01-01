/**
 * Quota Check API
 *
 * Check if a request would exceed quota limits
 *
 * POST /api/costs/quotas/check
 * {
 *   "scope": "tenant",
 *   "scopeId": "acme-corp",
 *   "estimatedCostUsd": 0.05
 * }
 *
 * Response:
 * {
 *   "allowed": true,
 *   "quota": {
 *     "id": "...",
 *     "scope": "tenant",
 *     "scopeId": "acme-corp",
 *     "limitUsd": 1000,
 *     "period": "month",
 *     "currentSpendUsd": 234.56,
 *     "periodStart": "2024-01-01T00:00:00Z",
 *     "periodEnd": "2024-02-01T00:00:00Z",
 *     "isExceeded": false,
 *     "warningThreshold": 0.8,
 *     "warningExceeded": false
 *   },
 *   "remainingBudgetUsd": 765.44
 * }
 */

import { NextResponse } from 'next/server';
import {
  getCostTrackingServiceIfInitialized,
  type QuotaCheckRequest,
} from '@reg-copilot/reg-intel-observability';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const costService = getCostTrackingServiceIfInitialized();

    if (!costService || !costService.hasQuotas()) {
      return NextResponse.json(
        { error: 'Quota management not initialized' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as QuotaCheckRequest;

    if (!body.scope || body.estimatedCostUsd === undefined) {
      return NextResponse.json(
        { error: 'scope and estimatedCostUsd are required' },
        { status: 400 }
      );
    }

    const result = await costService.checkQuota(body);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Quota check API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
