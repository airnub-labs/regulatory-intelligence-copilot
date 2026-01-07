/**
 * Quota Management API
 *
 * GET /api/costs/quotas?scope=tenant&scopeId=acme-corp
 * Get quota status for a scope
 *
 * POST /api/costs/quotas
 * Set or update a quota
 * {
 *   "scope": "tenant",
 *   "scopeId": "acme-corp",
 *   "limitUsd": 1000,
 *   "period": "month",
 *   "warningThreshold": 0.8
 * }
 *
 * DELETE /api/costs/quotas?scope=tenant&scopeId=acme-corp
 * Reset a quota
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getCostTrackingServiceIfInitialized } from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';

interface SetQuotaRequest {
  scope: 'platform' | 'tenant' | 'user';
  scopeId?: string;
  limitUsd: number;
  period: 'hour' | 'day' | 'week' | 'month';
  warningThreshold?: number;
}

/**
 * GET - Get quota status
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    const costService = getCostTrackingServiceIfInitialized();

    if (!costService || !costService.hasQuotas()) {
      return NextResponse.json(
        { error: 'Quota management not initialized' },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') as 'platform' | 'tenant' | 'user' | null;
    const scopeId = url.searchParams.get('scopeId') || undefined;

    if (!scope) {
      return NextResponse.json({ error: 'scope parameter is required' }, { status: 400 });
    }

    const quota = await costService.getQuota(scope, scopeId);

    if (!quota) {
      return NextResponse.json({ error: 'Quota not found' }, { status: 404 });
    }

    return NextResponse.json(quota);
  } catch (error) {
    console.error('Get quota API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - Set or update quota
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    const costService = getCostTrackingServiceIfInitialized();

    if (!costService || !costService.hasQuotas()) {
      return NextResponse.json(
        { error: 'Quota management not initialized' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as SetQuotaRequest;

    if (!body.scope || !body.limitUsd || !body.period) {
      return NextResponse.json(
        { error: 'scope, limitUsd, and period are required' },
        { status: 400 }
      );
    }

    const quota = await costService.setQuota(
      body.scope,
      body.scopeId,
      body.limitUsd,
      body.period,
      body.warningThreshold
    );

    return NextResponse.json(quota);
  } catch (error) {
    console.error('Set quota API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Reset quota
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId, role } = await getTenantContext(session);

    const costService = getCostTrackingServiceIfInitialized();

    if (!costService || !costService.hasQuotas()) {
      return NextResponse.json(
        { error: 'Quota management not initialized' },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') as 'platform' | 'tenant' | 'user' | null;
    const scopeId = url.searchParams.get('scopeId') || undefined;

    if (!scope) {
      return NextResponse.json({ error: 'scope parameter is required' }, { status: 400 });
    }

    await costService.resetQuota(scope, scopeId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset quota API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
