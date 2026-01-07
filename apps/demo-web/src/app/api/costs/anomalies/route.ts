/**
 * Cost Anomaly Detection API
 *
 * Analyze recent spending for anomalies and patterns
 *
 * POST /api/costs/anomalies
 * {
 *   "hoursBack": 24,
 *   "scope": "platform",
 *   "scopeId": null
 * }
 *
 * Response:
 * {
 *   "buckets": [
 *     { "timestamp": "2024-01-01T10:00:00Z", "costUsd": 12.34, "requestCount": 56 }
 *   ],
 *   "stats": {
 *     "mean": 10.5,
 *     "stdDev": 2.3,
 *     "min": 5.2,
 *     "max": 18.7,
 *     "trend": "increasing"
 *   },
 *   "anomalies": [
 *     {
 *       "detected": true,
 *       "type": "spike",
 *       "severity": "warning",
 *       "zScore": 2.8,
 *       "currentValue": 18.7,
 *       "expectedValue": 10.5,
 *       "message": "Spending spike detected..."
 *     }
 *   ]
 * }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import {
  getCostTrackingServiceIfInitialized,
  createAnomalyDetectionService,
} from '@reg-copilot/reg-intel-observability';
import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';

interface AnomalyRequest {
  hoursBack?: number;
  scope?: string;
  scopeId?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    await getTenantContext(session);

    const costService = getCostTrackingServiceIfInitialized();

    if (!costService || !costService.hasStorage()) {
      return NextResponse.json(
        { error: 'Cost tracking storage not initialized' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as AnomalyRequest;
    const hoursBack = body.hoursBack ?? 24;
    const scope = body.scope ?? 'platform';
    const scopeId = body.scopeId;

    // Get the storage provider from the service
    const storage = costService.getStorage();
    if (!storage) {
      return NextResponse.json(
        { error: 'Cost storage not available' },
        { status: 503 }
      );
    }

    // Create anomaly detection service
    const anomalyService = createAnomalyDetectionService(storage);

    // Analyze recent spending
    const analysis = await anomalyService.analyzeRecent(hoursBack, scope, scopeId);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Anomaly detection API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
