# Logging and tracing framework proposal (Node 24 / Next.js)

This plan focuses on end-to-end request correlation for the `/api/chat` entrypoint in `apps/demo-web/src/app/api/chat/route.ts` and the orchestrator in `packages/reg-intel-core/src/orchestrator/complianceEngine.ts`, with coverage for graph access, LLM routing, MCP/E2B calls, and conversation stores.

## Existing documentation to anchor tracing/logging design
- **Async context as a first-class primitive:** Node 24 is already justified in the stack because its improved AsyncLocalStorage underpins per-request/tenant context for APM and logging across agents, LLM router calls, graph/MCP access, and more. This provides the propagation substrate that the span-aware logger/tracer should reuse instead of bespoke context stores. 【F:docs/node_24_lts_rationale.md†L52-L64】
- **Safety guard context already carries audit IDs:** Both ingress and egress guard contracts include `tenantId`/`userId` fields that are explicitly earmarked for logging/telemetry but never sent to providers. Spans and log bindings should read/write these IDs so policy decisions and payload sanitisation are traceable without leaking PII. 【F:docs/specs/safety-guards/graph_ingress_guard_v_0_1.md†L88-L111】【F:docs/specs/safety-guards/egress_guard_v_0_3.md†L62-L116】
- **Operational guidance assumes structured log levels:** The local development guide already documents enabling debug-level logging via `LOG_LEVEL`, so the proposed Pino wrapper should honour this env var and maintain parity with existing guidance. 【F:docs/LOCAL_DEVELOPMENT.md†L889-L895】


## Goals
- Correlate every chat request from ingress to response, including LLM calls, egress guard decisions, graph/timeline queries, and MCP gateway calls.
- Emit structured logs that always carry `trace_id`, `span_id`, `tenantId`, `conversationId`, `userId`, and `agentId` when available.
- Provide distributed traces across packages and services (Next.js API routes, core engine, graph/LLM clients, E2B MCP gateway).
- Keep zero-PPII logging posture; redact message bodies by default and rely on existing egress guard sanitization for payload mirrors.
- Persist trace linkage data everywhere conversation state is stored: `trace_id`, `root_span_id`, and `root_span_name` must be written to conversation rows, message rows, and conversation context rows on every write path so downstream runbooks can pivot from the database to the trace view.
 - Persist trace linkage data everywhere conversation state is stored: `trace_id`, `root_span_id`, and `root_span_name` must be written to conversation rows, message rows, and conversation context rows on every write path so downstream runbooks can pivot from the database to the trace view. Treat this as a **hard contract**—any new persistence layer or helper that saves chat artifacts needs the same fields so new coding agents cannot regress the linkage.

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
- When saving conversations/messages/context snapshots, lift the `trace_id`, `root_span_id`, and `root_span_name` from the active **root span** (not child spans) and persist them alongside the data. Background jobs must thread the parent trace instead of generating new trace IDs to keep the linkage intact.

### 3a) Persistence guardrails (do not skip)
- **Tables in scope:** `copilot_internal.conversations`, `copilot_internal.conversation_messages`, `copilot_internal.conversation_contexts`, and any new table that stores message/conversation derived state (e.g., summaries or scenario results).
- **Fields required:** `trace_id`, `root_span_id`, `root_span_name` columns plus the `traceId` field inside message `metadata` JSON blobs; keep the relational and JSON values consistent.
- **Source of truth:** The IDs must come from the **root span** created at `/api/chat` (or any new entrypoint). Do not generate a fresh span before writing.
- **Code review checklist:** refuse changes that insert/update rows without setting the trace columns; ask for explicit OTEL context plumbing for background jobs and migrations; add tests/docs using the [trace runbook](./trace_runbook.md) to verify the linkage.

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

## Runbooks

### Enable debug logs for a single tenant
- Set `LOG_LEVEL=debug` on the service instance receiving the tenant's traffic.
- Inject the tenant bindings into the request context early (e.g., in the Next.js route handler) so every log line includes `tenantId` and is filterable downstream.
- For payload-heavy flows, keep `LOG_SAFE_PAYLOADS=false` unless developing locally to avoid leaking conversation content.

### View a single conversation trace
- Capture the `trace_id` from the `/api/chat` entrypoint logs or the diagnostic dump, then search for that trace in your APM backend.
- The OTLP exporter targets are configurable via `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`; confirm the correct collector URL via the observability CLI below.
- If the trace is missing, temporarily lower sampling with `OTEL_TRACES_SAMPLING_RATIO=1` or enable `OTEL_TRACES_ALWAYS_SAMPLE_ERRORS=true` to force capture while debugging.

### Correlate logs to spans in the backend
- Every log entry includes `trace_id`/`span_id` so you can pivot from a Loki/Datadog/Splunk query directly into your tracing UI.
- Every environment exposes `GET /api/observability` to return the active OTEL exporter URLs, sampling policy, and instrumentation list without needing shell access.
- The `reg-intel-observability` CLI (`pnpm --filter @reg-copilot/reg-intel-observability exec reg-intel-observability diagnostics`) prints the same data locally, which helps confirm the backend is receiving data.
- When spans are dropped due to sampling, set `OTEL_TRACES_SAMPLING_RATIO` to a higher parent-based ratio or enable error overrides to ensure failures stay visible.

## Why this stack
- **OpenTelemetry** is the dominant, vendor-neutral choice for tracing and metrics in Node/Next, with first-class AsyncLocalStorage support in Node 24 and broad ecosystem instrumentations.
- **Pino** is the de facto structured logger for high-throughput Node services and integrates cleanly with OTEL correlation IDs via small hooks—no heavyweight agent required.
- The approach keeps the existing architecture (Next.js API → Next adapter → core engine → graph/LLM/timeline/egress guard) intact while adding observability hooks at clear seams without leaking PII.
