import { AsyncLocalStorage } from 'node:async_hooks';
import { Span, trace } from '@opentelemetry/api';

export interface RequestContextValues {
  tenantId?: string;
  conversationId?: string;
  userId?: string;
  agentId?: string;
  requestId?: string;
}

const attributeMap: Record<keyof RequestContextValues, string> = {
  tenantId: 'app.tenant.id',
  conversationId: 'app.conversation.id',
  userId: 'app.user.id',
  agentId: 'app.agent.id',
  requestId: 'app.request.id',
};

const requestContextStorage = new AsyncLocalStorage<RequestContextValues>();

const setSpanAttributes = (span: Span | undefined, values: Partial<RequestContextValues>) => {
  if (!span) return;

  Object.entries(values).forEach(([key, value]) => {
    if (value) {
      span.setAttribute(attributeMap[key as keyof RequestContextValues], value);
    }
  });
};

const mergeWithStore = (values: RequestContextValues) => ({
  ...(requestContextStorage.getStore() ?? {}),
  ...values,
});

export const requestContext = {
  run<T>(values: RequestContextValues, fn: () => T | Promise<T>): T | Promise<T> {
    const merged = mergeWithStore(values);
    setSpanAttributes(trace.getActiveSpan(), values);

    return requestContextStorage.run(merged, fn);
  },
  set(values: RequestContextValues): void {
    const merged = mergeWithStore(values);
    setSpanAttributes(trace.getActiveSpan(), values);
    requestContextStorage.enterWith(merged);
  },
  get(): RequestContextValues {
    return requestContextStorage.getStore() ?? {};
  },
  applyToSpan(span: Span | undefined): void {
    setSpanAttributes(span, requestContextStorage.getStore() ?? {});
  },
};
