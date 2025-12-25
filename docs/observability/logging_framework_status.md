# Logging framework status review

## Implemented pieces
- The shared observability package provides the Pino-backed logger with trace/request context mixins plus payload hashing helpers, keeping logging consistent and structured across packages.【F:packages/reg-intel-observability/src/logger.ts†L1-L94】
- OpenTelemetry setup is available through `initObservability`, wiring OTLP exporters, samplers, and instrumentations (HTTP, Undici, optional FS/Next) with AsyncLocalStorage context management.【F:packages/reg-intel-observability/src/tracing.ts†L1-L188】
- The demo Next.js app initializes the observability SDK at runtime, reading OTEL endpoints and sampling config during `instrumentation.ts` registration.【F:apps/demo-web/instrumentation.ts†L1-L28】
- Core orchestration code consumes the shared logger and span helper APIs, so in-process flows can emit structured logs and traces once initialization occurs.【F:packages/reg-intel-core/src/orchestrator/complianceEngine.ts†L12-L43】

## Current wiring and remaining gaps
- Graph seeding and maintenance scripts run inside `runWithScriptObservability`, initialising OTEL exporters and emitting structured logs through Pino rather than raw `console.log` output.【F:scripts/observability.ts†L1-L151】【F:scripts/seed-graph.ts†L1-L115】
- Client-side graph visualisation routes lifecycle telemetry (initial load, SSE stream) through the `/api/client-telemetry` sink instead of browser-only console calls, so those events land in the structured logging pipeline.【F:apps/demo-web/src/components/GraphVisualization.tsx†L110-L162】【F:apps/demo-web/src/components/GraphVisualization.tsx†L240-L315】
- Observability initialisation is available for both the Next.js runtime and Node.js scripts; the demo app registers it via `instrumentation.ts`, and scripts bootstrap it through the shared helper before execution.【F:apps/demo-web/instrumentation.ts†L1-L28】【F:scripts/observability.ts†L104-L151】
- Remaining work: any new runtime entrypoints (edge handlers, bespoke tooling) need to adopt the same `initObservability`/`runWithScriptObservability` bootstrap, and client components beyond the graph visualiser should continue using the `/api/client-telemetry` sink for structured logging.
