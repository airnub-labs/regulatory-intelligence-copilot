# Logging framework status review

## Implemented pieces
- The shared observability package provides the Pino-backed logger with trace/request context mixins plus payload hashing helpers, keeping logging consistent and structured across packages.【F:packages/reg-intel-observability/src/logger.ts†L1-L94】
- OpenTelemetry setup is available through `initObservability`, wiring OTLP exporters, samplers, and instrumentations (HTTP, Undici, optional FS/Next) with AsyncLocalStorage context management.【F:packages/reg-intel-observability/src/tracing.ts†L1-L188】
- The demo Next.js app is the only entrypoint that initializes the observability SDK at runtime, reading OTEL endpoints and sampling config during `instrumentation.ts` registration.【F:apps/demo-web/instrumentation.ts†L1-L28】
- Core orchestration code consumes the shared logger and span helper APIs, so in-process flows can emit structured logs and traces once initialization occurs.【F:packages/reg-intel-core/src/orchestrator/complianceEngine.ts†L12-L43】

## Gaps and partial wiring
- Graph seeding and maintenance scripts still rely on `console.log` rather than the shared logger or span helpers, so they bypass structured logging and tracing entirely.【F:scripts/seed-graph.ts†L53-L110】
- Client-side graph visualisation continues to log directly to the browser console instead of routing through the observability wrapper, leaving those events out of the structured pipeline.【F:apps/demo-web/src/components/GraphVisualization.tsx†L395-L438】
- No other apps or scripts call `initObservability`; only the demo web app registers it, meaning non-Next entrypoints run without exporting traces/metrics unless manually wired.【F:apps/demo-web/instrumentation.ts†L1-L28】【F:scripts/seed-graph.ts†L53-L110】

## Conclusion
The logging/tracing framework is implemented and used in core libraries and the demo web app, but it is **not fully wired across the repo**. Operational scripts and client-side components still bypass the shared logger, and observability initialization is confined to the Next.js instrumentation hook. Expanding `initObservability` usage (or adding lightweight structured logging) to scripts and other runtimes is needed to make coverage complete.
