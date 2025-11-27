import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  profileType?: string;
  jurisdictions?: string[];
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  const store: RequestContext = {
    correlationId: context.correlationId || randomUUID(),
    tenantId: context.tenantId,
    profileType: context.profileType,
    jurisdictions: context.jurisdictions,
  };

  return requestContextStorage.run(store, fn);
}

export function getContext(): Partial<RequestContext> {
  return requestContextStorage.getStore() ?? {};
}
