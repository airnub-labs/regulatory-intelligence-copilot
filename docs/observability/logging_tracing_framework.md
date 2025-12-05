# Logging and tracing framework proposal (Node 24 / Next.js)

This plan focuses on end-to-end request correlation for the `/api/chat` entrypoint in `apps/demo-web/src/app/api/chat/route.ts` and the orchestrator in `packages/reg-intel-core/src/orchestrator/complianceEngine.ts`, with coverage for graph access, LLM routing, MCP/E2B calls, and conversation stores.

## Goals
- Correlate every chat request from ingress to response, including LLM calls, egress guard decisions, graph/timeline queries, and MCP gateway calls.
- Emit structured logs that always carry `trace_id`, `span_id`, `tenantId`, `conversationId`, `userId`, and `agentId` when available.
- Provide distributed traces across packages and services (Next.js API routes, core engine, graph/LLM clients, E2B MCP gateway).
- Keep zero-PPII logging posture; redact message bodies by default and rely on existing egress guard sanitization for payload mirrors.

## Recommended stack
- **Tracing & metrics:** OpenTelemetry SDK for Node 24 (`@opentelemetry/sdk-node`) with the built-in **AsyncLocalStorage context manager**. Use **OTLP/HTTP exporter** into an OpenTelemetry Collector. Enable instrumentations for `http`, `fetch/undici`, `next`, and `@opentelemetry/instrumentation-graphql` only if the stack adds GraphQL later; today the focus is on REST + MCP.
- **Logging:** **Pino** with a lightweight wrapper that reads the active OpenTelemetry context to enrich log entries with `trace_id`/`span_id`. Pino’s speed and first-party tooling (`pino-pretty` locally, transport to Loki/Datadog/Splunk in production) make it a common pairing with OTEL in Node 24/Next.js runtimes.
- **Propagation:** W3C Trace Context headers (`traceparent`/`tracestate`) on inbound Next.js requests; propagate via outbound fetch/Undici/HTTP clients to cover external LLMs, E2B MCP gateway, Supabase, and Memgraph/Neo4j driver.
- **Metrics:** Use OTEL metrics (up/down counters, histograms) alongside traces; reuse the same OTLP exporter. This keeps one vendor-neutral pipeline and avoids dual instrumentation.

## Integration blueprint
### 1) Shared observability package
Create a new workspace package (e.g., `packages/reg-intel-observability`) that exposes:
- `initObservability(options)` to configure `NodeSDK` with OTLP exporters, resource attributes (service.name, service.version, deployment.environment), and instrumentations (`HttpInstrumentation`, `UndiciInstrumentation`, `NextInstrumentation`, `@opentelemetry/instrumentation-fs` optional, etc.).
- `createLogger(scope, staticBindings)` returning a Pino logger pre-wired with OTEL correlation IDs from the current context plus static bindings like `component: 'compliance-engine'`.
- `withSpan(name, attributes, fn)` helper that starts a child span around async functions, forwarding return values and errors. This keeps manual spans consistent across packages.
- A small `requestContext` helper that stores `tenantId`, `conversationId`, `userId`, `agentId`, and `conversationId` inside OTEL span attributes and a secondary `AsyncLocalStorage` store for logging fallbacks.

### 2) Next.js entrypoint instrumentation (apps/demo-web)
- Add `instrumentation.ts` in `apps/demo-web` to initialize OTEL on the server runtime; Next.js 15/16 supports per-app instrumentation without custom servers.
- In `/api/chat` (`apps/demo-web/src/app/api/chat/route.ts`), wrap the POST handler with `withSpan('api.chat', {...headers/tenant})` and set span attributes for `tenantId`, `conversationId`, and authenticated `userId` extracted before calling `createChatRouteHandler`.
- Inject `traceparent` into the forwarded `Request` object so downstream fetch calls (LLM router, Supabase, MCP gateway) continue the trace. The OTEL HTTP/Undici instrumentations will handle most propagation automatically.

### 3) Core engine spans (packages/reg-intel-core)
Instrument the main orchestration stages in `ComplianceEngine`:
- `withSpan('compliance.route', {agentId, tenantId, conversationId})` around the top-level `streamChat`/`chat` invocation.
- Nested spans for:
  - `compliance.conversation.load` / `save` when using `ConversationContextStore` and `ConversationStore`.
  - `compliance.graph.query` for `GraphClient` calls (Memgraph/Neo4j driver) with query text hashed, not logged raw, to avoid sensitive content.
  - `compliance.timeline.evaluate` for timeline engine operations.
  - `compliance.llm.stream` around `llmRouter.streamChat` or `llmClient.chat`, tagging provider/model/task and the egress guard mode; record token counts if available.
  - `compliance.egress.guard` for redaction decisions (counts + types only, not raw payloads).
  - `compliance.concept-capture` when handling `ToolStreamChunk` outputs.
- Emit structured logs at **info** level on span boundaries (start/finish) and **warn/error** on failures, always enriched with trace IDs and the context bindings above.

### 4) Graph and external calls
- **Memgraph/Neo4j:** Wrap `neo4j-driver` sessions in `withSpan('db.memgraph.query', {database, type:'cypher'})` and inject the OTEL context via driver’s `session.run` wrapper. Use OTEL semantic conventions for database spans.
- **Supabase/Postgres:** If Supabase JS client is used, rely on `UndiciInstrumentation` for HTTP spans and add manual spans for significant mutations in conversation stores.
- **E2B MCP gateway & other HTTP APIs:** Rely on OTEL HTTP/Undici auto-instrumentation for outbound calls; add logical spans around gateway interactions to attach the MCP tool name, sandbox ID, and policy outcomes.
- **LLM providers through router:** The router already normalizes streams; wrap the provider calls with spans carrying `requestedMode`/`effectiveMode` and provider/model identifiers. Propagate `traceparent` into provider requests where allowed.

### 5) Logging conventions
- Default logger level via `LOG_LEVEL` env; pretty-print only in `NODE_ENV=development`.
- Common fields: `timestamp`, `level`, `component`, `trace_id`, `span_id`, `tenantId`, `conversationId`, `userId`, `agentId`, `requestId` (when present), `message`.
- Never log full prompts or user messages; log **hashes** or truncated previews gated behind a `LOG_SAFE_PAYLOADS=true` dev flag. Continue using `sanitizeTextForEgress` for any echoed text.
- Provide child loggers per package/component (`reg-intel-core`, `reg-intel-llm`, `reg-intel-graph`, `reg-intel-conversations`, `reg-intel-next-adapter`) via `createLogger('component-name')` to keep output searchable.

### 6) Deployment & operations
- Ship OTLP to a collector (Jaeger/Tempo/Datadog) and logs to the same observability backend via Pino transport. Keep sampling configurable (e.g., parent-based trace ID ratio) with overrides to always sample error spans.
- Add health/diagnostic endpoints or CLI flags to dump the active OTEL configuration for debugging miswired deployments.
- Document runbooks: how to view a single conversation trace, how to correlate log lines to spans, and how to enable debug logging for one tenant.

## Why this stack
- **OpenTelemetry** is the dominant, vendor-neutral choice for tracing and metrics in Node/Next, with first-class AsyncLocalStorage support in Node 24 and broad ecosystem instrumentations.
- **Pino** is the de facto structured logger for high-throughput Node services and integrates cleanly with OTEL correlation IDs via small hooks—no heavyweight agent required.
- The approach keeps the existing architecture (Next.js API → Next adapter → core engine → graph/LLM/timeline/egress guard) intact while adding observability hooks at clear seams without leaking PII.
