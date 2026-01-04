/**
 * Quota Error Handling - Phase 3
 *
 * Provides standardized HTTP 429 error responses for quota exceeded scenarios.
 * Used by API routes to return consistent error formats when quotas are breached.
 */

export interface QuotaDetails {
  scope: 'platform' | 'tenant' | 'user';
  scopeId: string;
  resourceType: 'llm' | 'e2b' | 'all';
  limitUsd: number;
  currentSpendUsd: number;
  estimatedCostUsd?: number;
  remainingUsd: number;
  period: 'day' | 'week' | 'month';
  utilizationPercent: number;
}

export interface QuotaExceededError {
  error: 'quota_exceeded';
  message: string;
  resourceType: 'llm' | 'e2b';
  quotaDetails?: QuotaDetails;
  retryAfter?: number; // seconds until quota resets
}

/**
 * Create HTTP 429 Response for quota exceeded
 *
 * @param resourceType - Type of resource that exceeded quota (llm or e2b)
 * @param message - Human-readable error message
 * @param quotaDetails - Optional detailed quota information
 * @param retryAfter - Optional retry-after duration in seconds
 */
export function createQuotaExceededResponse(
  resourceType: 'llm' | 'e2b',
  message: string,
  quotaDetails?: QuotaDetails,
  retryAfter?: number
): Response {
  const errorBody: QuotaExceededError = {
    error: 'quota_exceeded',
    message,
    resourceType,
    quotaDetails,
    retryAfter,
  };

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add Retry-After header if provided (in seconds)
  if (retryAfter) {
    headers['Retry-After'] = String(retryAfter);
  }

  return new Response(JSON.stringify(errorBody, null, 2), {
    status: 429,
    headers,
  });
}

/**
 * Create SSE stream error response for quota exceeded
 * Used when quota is exceeded during streaming responses
 *
 * @param resourceType - Type of resource that exceeded quota
 * @param message - Human-readable error message
 * @param quotaDetails - Optional detailed quota information
 */
export function createQuotaExceededStreamResponse(
  resourceType: 'llm' | 'e2b',
  message: string,
  quotaDetails?: QuotaDetails
): Response {
  const encoder = new TextEncoder();
  const errorData: QuotaExceededError = {
    error: 'quota_exceeded',
    message,
    resourceType,
    quotaDetails,
  };

  const stream = new ReadableStream({
    start(controller) {
      // Send error event
      const errorChunk = `event: error\ndata: ${JSON.stringify(errorData)}\n\n`;
      controller.enqueue(encoder.encode(errorChunk));

      // Send done event
      const doneChunk = `event: done\ndata: ${JSON.stringify({ status: 'quota_exceeded' })}\n\n`;
      controller.enqueue(encoder.encode(doneChunk));

      controller.close();
    },
  });

  return new Response(stream, {
    status: 429,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

/**
 * Calculate retry-after duration based on quota period
 *
 * @param period - Quota reset period
 * @returns Seconds until next quota period
 */
export function calculateRetryAfter(period: 'day' | 'week' | 'month'): number {
  const now = new Date();

  switch (period) {
    case 'day': {
      // Seconds until next day (midnight UTC)
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
    }

    case 'week': {
      // Seconds until next week (next Monday 00:00 UTC)
      const nextMonday = new Date(now);
      nextMonday.setUTCDate(nextMonday.getUTCDate() + ((7 - nextMonday.getUTCDay() + 1) % 7 || 7));
      nextMonday.setUTCHours(0, 0, 0, 0);
      return Math.floor((nextMonday.getTime() - now.getTime()) / 1000);
    }

    case 'month': {
      // Seconds until next month (1st day of next month 00:00 UTC)
      const nextMonth = new Date(now);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
      nextMonth.setUTCHours(0, 0, 0, 0);
      return Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
    }

    default:
      // Default to 24 hours
      return 86400;
  }
}
