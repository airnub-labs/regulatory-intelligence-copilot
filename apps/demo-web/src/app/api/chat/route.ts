/**
 * Chat API endpoint for Regulatory Intelligence Copilot
 *
 * Handles conversational queries about tax, welfare, pensions, and regulatory compliance.
 * Uses provider-agnostic ComplianceEngine via Next.js adapter.
 */

import { createChatRouteHandler } from '@reg-copilot/reg-intel-next-adapter';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import type { ConversationEventHub, ConversationListEventHub } from '@reg-copilot/reg-intel-conversations';
import { context, propagation, trace } from '@opentelemetry/api';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import {
  conversationContextStore,
  conversationEventHub,
  conversationListEventHub,
  conversationStore,
  executionContextManager,
} from '@/lib/server/conversations';
import { policyStore } from '@/lib/server/llm';
import { checkLLMQuotaBeforeRequest } from '@/lib/costTracking';
import { createQuotaExceededStreamResponse, calculateRetryAfter } from '@/lib/quotaErrors';
import { getCostEstimationService } from '@/lib/costEstimation';
import { getLLMCostEstimateFallback } from '@reg-copilot/reg-intel-observability';

// Force dynamic rendering to avoid build-time initialization
export const dynamic = 'force-dynamic';

const logger = createLogger('ChatRoute');

const handler = createChatRouteHandler({
  conversationStore,
  conversationContextStore,
  eventHub: conversationEventHub as unknown as ConversationEventHub,
  conversationListEventHub: conversationListEventHub as unknown as ConversationListEventHub,
  executionContextManager,
  policyStore,
});

const headerSetter = {
  set(carrier: Headers, key: string, value: string) {
    carrier.set(key, value);
  },
};

export async function POST(request: Request) {
  try {
    // Get and verify tenant context
    const session = await getServerSession(authOptions);
    const { userId, tenantId } = await getTenantContext(session);

    const headers = new Headers(request.headers);
    headers.set('x-user-id', userId);

  // PRE-REQUEST QUOTA CHECK (Phase 3)
  // Check LLM quota BEFORE processing chat request
  // This provides fast failure with proper HTTP 429 response instead of failing mid-stream

  // Get cost estimate (database or fallback)
  const costEstimator = getCostEstimationService();
  let estimatedCost: number;

  if (costEstimator) {
    // Use service (will query database and fallback to ENUM if unavailable)
    estimatedCost = await costEstimator.getLLMCostEstimate({
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229', // TODO: Get from actual model being used
      operationType: 'chat',
      confidenceLevel: 'conservative',
    });
  } else {
    // Service not initialized - use fallback ENUM directly
    logger.info('Cost estimation service not initialized, using fallback ENUM constant for quota check');
    estimatedCost = getLLMCostEstimateFallback(
      'anthropic',
      'claude-3-sonnet-20240229',
      'chat',
      'conservative'
    );
  }

  const quotaCheck = await checkLLMQuotaBeforeRequest(tenantId, estimatedCost);

  if (!quotaCheck.allowed) {
    logger.warn({
      tenantId,
      userId,
      reason: quotaCheck.reason,
    }, 'Chat request denied due to LLM quota exceeded');

    const retryAfter = quotaCheck.quotaDetails?.period
      ? calculateRetryAfter(quotaCheck.quotaDetails.period)
      : undefined;

    return createQuotaExceededStreamResponse(
      'llm',
      quotaCheck.reason || 'LLM quota exceeded. Please try again later.',
      quotaCheck.quotaDetails,
      retryAfter,
    );
  }

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      logger.error({ error, tenantId, userId }, 'Failed to parse request body');
      const message = error instanceof Error ? error.message : 'Invalid request body';
      return new Response(message, { status: 400 });
    }

    const normalizedBody = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const conversationId = typeof normalizedBody.conversationId === 'string' ? normalizedBody.conversationId : undefined;

    const spanAttributes = {
      'app.tenant.id': tenantId,
      'app.user.id': userId,
      ...(conversationId ? { 'app.conversation.id': conversationId } : {}),
    };

    return requestContext.run(
      { tenantId, conversationId, userId },
    () =>
      withSpan('api.chat', spanAttributes, () => {
        const activeSpan = trace.getActiveSpan();
        const activeSpanContext = activeSpan?.spanContext();
        const traceContext =
          activeSpanContext && trace.isSpanContextValid(activeSpanContext)
            ? {
                traceId: activeSpanContext.traceId,
                rootSpanId: activeSpanContext.spanId,
                rootSpanName: 'name' in (activeSpan ?? {})
                  ? (activeSpan as { name?: string }).name
                  : undefined,
              }
            : undefined;

        const serializedBody = JSON.stringify({ ...normalizedBody, tenantId, traceContext });
        propagation.inject(context.active(), headers, headerSetter);

        if (!headers.has('traceparent') && activeSpanContext) {
          headers.set('traceparent', `00-${activeSpanContext.traceId}-${activeSpanContext.spanId}-01`);
        }

        return handler(
          new Request(request.url, {
            method: request.method,
            headers,
            body: serializedBody,
          }),
        );
      }),
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Chat request failed';
    logger.error({ error }, 'Chat request failed');
    return new Response(
      errorMessage,
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
