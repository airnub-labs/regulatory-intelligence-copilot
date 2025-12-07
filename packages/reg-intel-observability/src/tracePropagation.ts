import { context, propagation, type TextMapSetter } from '@opentelemetry/api';

const headerSetter: TextMapSetter<Headers> = {
  set(carrier, key, value) {
    carrier.set(key, value);
  },
};

export function injectTraceContextHeaders(headers: Headers): Headers {
  propagation.inject(context.active(), headers, headerSetter);
  return headers;
}

export function createTracingFetch(baseFetch: typeof fetch = fetch) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = injectTraceContextHeaders(new Headers(init?.headers));
    return baseFetch(input as RequestInfo, { ...init, headers });
  };
}
