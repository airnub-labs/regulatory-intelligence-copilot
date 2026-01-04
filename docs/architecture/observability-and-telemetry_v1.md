# Observability and Telemetry

> **Status:** Fully Implemented
> **Version:** 1.0
> **Last Updated:** 2025-01-04
>
> **Related Documentation:**
> - `docs/observability/trace_runbook.md` - Trace lookup procedures
> - `docs/observability/SCALABILITY_REVIEW.md` - Detailed scalability analysis
> - `docs/testing/client-telemetry-test-requirements.md` - Test requirements

## Overview

This is the **canonical reference** for the Regulatory Intelligence Copilot observability and telemetry system. It covers:

- Client-side telemetry (browser → API → OTEL)
- Server-side instrumentation (spans, traces, metrics)
- Logging infrastructure (Pino, OTEL Collector, Loki)
- Tracing infrastructure (OpenTelemetry, Jaeger)
- Local observability stack (docker-compose)
- Environment configuration

The system is designed to scale independently of the application, using the OTEL Collector as a decoupled aggregation layer.

---

## Architecture Overview

### End-to-End Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Browser Client                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Components → TelemetryBatchQueue → sendBeacon/fetch                  │   │
│  │   • Auto-batch (20 events or 2s)                                     │   │
│  │   • Page unload flush                                                │   │
│  │   • Visibility change flush                                          │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ POST /api/client-telemetry
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Next.js Application Instances                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ • Pino Logger (async I/O, dual-write: stdout + OTEL)                 │   │
│  │ • OTEL SDK (traces, metrics, logs via BatchProcessor)               │   │
│  │ • Request context propagation (W3C Trace Context)                   │   │
│  │ • Business metrics (agent selection, graph queries, LLM tokens)     │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ OTLP/HTTP (port 4318)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OTEL Collector                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Receivers: OTLP/HTTP (:4318), OTLP/gRPC (:4317)                     │   │
│  │ Processors: memory_limiter, batch, resource, attributes             │   │
│  │ Exporters: Loki (logs), Jaeger (traces), Prometheus (metrics)       │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
        ┌───────────┐           ┌───────────┐           ┌───────────┐
        │   Loki    │           │Prometheus │           │  Jaeger   │
        │  (:3100)  │           │  (:9090)  │           │ (:16686)  │
        └─────┬─────┘           └─────┬─────┘           └─────┬─────┘
              │                       │                       │
              └───────────────────────┴───────────────────────┘
                                      │
                                      ▼
                            ┌───────────────────┐
                            │      Grafana      │
                            │     (:3200)       │
                            │  Unified Dashboard│
                            └───────────────────┘
```

### Data Flow Summary

| Signal | Source | Transport | Collector Pipeline | Backend | Visualization |
|--------|--------|-----------|-------------------|---------|---------------|
| **Logs** | Pino → OTEL Transport | OTLP/HTTP | memory_limiter → batch → loki | Loki | Grafana |
| **Traces** | OTEL SDK auto-instrumentation | OTLP/HTTP | memory_limiter → batch → jaeger | Jaeger | Jaeger UI / Grafana |
| **Metrics** | OTEL SDK + Business Metrics | OTLP/HTTP | memory_limiter → batch → prometheus | Prometheus | Grafana |

---

## Client Telemetry

### Implementation Status: Fully Implemented

**Location:** `apps/demo-web/src/lib/clientTelemetry.ts`

The client telemetry system provides production-ready event collection with automatic batching, rate limiting, and OTEL integration.

### Event Flow

1. Component calls `telemetry.info()`, `telemetry.warn()`, or `telemetry.error()`
2. Event added to `TelemetryBatchQueue`
3. Queue auto-flushes on:
   - Batch size limit (default: 20 events)
   - Flush interval (default: 2 seconds)
   - Page unload (`beforeunload` event)
   - Tab hidden (`visibilitychange` event)
4. Events sent via `navigator.sendBeacon()` (fallback: `fetch` with `keepalive`)

### Event Format

```typescript
interface TelemetryEvent {
  level: 'info' | 'warn' | 'error';
  scope: string;              // Component name
  sessionId: string;          // Unique per component instance
  message: string;
  timestamp: string;          // ISO 8601
  requestId?: string;         // Optional request correlation
  context?: Record<string, unknown>;  // Custom metadata
}
```

### Batch Payload (Client to Server)

```json
{
  "events": [
    {
      "level": "info",
      "scope": "graph-visualization",
      "sessionId": "graph-visualization-session-abc123",
      "message": "User clicked node",
      "timestamp": "2025-01-04T10:30:45.123Z",
      "context": { "nodeId": "node-xyz", "action": "expand" }
    }
  ]
}
```

### Usage

```typescript
import { useClientTelemetry } from '@/lib/clientTelemetry';

function MyComponent() {
  const telemetry = useClientTelemetry('my-component');

  const handleAction = () => {
    telemetry.info({ action: 'button_click' }, 'User clicked button');
  };

  return <button onClick={handleAction}>Click Me</button>;
}
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT` | `/api/client-telemetry` | Telemetry endpoint URL |
| `NEXT_PUBLIC_CLIENT_TELEMETRY_BATCH_SIZE` | `20` | Max events per batch |
| `NEXT_PUBLIC_CLIENT_TELEMETRY_FLUSH_INTERVAL_MS` | `2000` | Flush interval (ms) |

### Non-Regression Guarantees

The following features are non-negotiable and **must never be regressed**:

- Client-side batching (events must be batched, never sent individually)
- Configurable via environment variables
- Server-side rate limiting
- Batch format support (server handles both single events and batches)
- OTEL forwarding (optional, non-blocking)
- Page unload handling (events flushed before navigation)
- Backward compatibility (legacy single-event format must work)

See `docs/testing/client-telemetry-test-requirements.md` for mandatory test requirements.

---

## Telemetry Ingestion API

### Implementation Status: Fully Implemented

**Location:** `apps/demo-web/src/app/api/client-telemetry/route.ts`

### Endpoint

```
POST /api/client-telemetry
```

### Request Handling

1. **Authentication check** - Requires valid session
2. **Rate limit check** - Per client IP (100 requests/min default)
3. **Payload validation** - Validates event structure
4. **Local logging** - Events logged via Pino with structured fields
5. **OTEL forwarding** - Async, non-blocking forward to OTEL Collector (if configured)

### Response Codes

| Status | Meaning |
|--------|---------|
| `204` | Events accepted |
| `400` | Invalid payload or no valid events |
| `401` | Unauthorized (no session) |
| `429` | Rate limit exceeded |

### Rate Limiting

**Implementation:** Redis-backed distributed rate limiting with transparent failover

The rate limiter uses the `TransparentRateLimiter` pattern:
- **Primary:** Redis/Upstash for distributed rate limiting across multiple instances
- **Fallback:** `AllowAllRateLimiter` (fail-open) when Redis unavailable

| Configuration | Default | Environment Variable |
|---------------|---------|---------------------|
| Window | 60 seconds | `CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS` |
| Max requests | 100 | `CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS` |
| Enable Redis | `true` | `ENABLE_RATE_LIMITER_REDIS` |

**Implementation files:**
- `apps/demo-web/src/lib/rateLimiter.ts` - Factory and configuration
- `packages/reg-intel-cache/src/transparentRateLimiter.ts` - Core implementation

See `docs/architecture/caching-and-storage_failover_v1.md` for the transparent failover pattern.

### OTEL Forwarding Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `OTEL_COLLECTOR_ENDPOINT` | (disabled) | OTEL Collector logs endpoint |
| `OTEL_COLLECTOR_TIMEOUT_MS` | `5000` | Forward request timeout |

When `OTEL_COLLECTOR_ENDPOINT` is set, events are converted to OTLP format and forwarded:

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "demo-web-client" } }
      ]
    },
    "scopeLogs": [{
      "scope": { "name": "graph-visualization" },
      "logRecords": [{
        "timeUnixNano": 1704365445123000000,
        "severityText": "INFO",
        "body": { "stringValue": "User clicked node" }
      }]
    }]
  }]
}
```

---

## Server-Side Instrumentation

### Implementation Status: Fully Implemented

**Packages:**
- `packages/reg-intel-observability` - Shared observability utilities
- `apps/demo-web/instrumentation.ts` - Next.js OTEL initialization

### OTEL SDK Initialization

The SDK is initialized in `apps/demo-web/instrumentation.ts`:

```typescript
await initObservability({
  serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/demo-web',
  serviceVersion: process.env.npm_package_version,
  environment: process.env.NODE_ENV,
  traceExporter: { url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT },
  metricsExporter: { url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT },
  logsExporter: {
    enabled: process.env.OTEL_LOGS_ENABLED === 'true',
    url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
    useBatchProcessor: process.env.NODE_ENV === 'production',
  },
  traceSampling: {
    parentBasedRatio: Number(process.env.OTEL_TRACES_SAMPLING_RATIO) || 1.0,
    alwaysSampleErrors: process.env.OTEL_TRACES_ALWAYS_SAMPLE_ERRORS !== 'false',
  },
});
```

### Instrumented Flows

| Flow | Span Name | Attributes |
|------|-----------|------------|
| API Chat | `api.chat` | `tenant_id`, `conversation_id`, `user_id` |
| Compliance Engine | `compliance.route` | `agent_id`, `tenant_id`, `conversation_id` |
| Conversation Load/Save | `compliance.conversation.load/save` | `conversation_id` |
| Graph Queries | `compliance.graph.query` | `operation`, `query_type`, `success` |
| LLM Streaming | `compliance.llm.stream` | `provider`, `model`, `mode` |
| Egress Guard | `compliance.egress.guard` | `action`, `blocked_count` |
| Execution Context | `execution_context.get_or_create` | `tenant_id`, `conversation_id`, `path_id` |

### Using `withSpan`

```typescript
import { withSpan } from '@reg-copilot/reg-intel-observability';

const result = await withSpan(
  'my-operation',
  { 'custom.attribute': 'value' },
  async () => {
    // Your async code here
    return someResult;
  }
);
```

### Trace Persistence Contract

**Critical:** Trace identifiers must be persisted to enable trace lookup from database records.

| Table | Required Fields |
|-------|-----------------|
| `copilot_internal.conversations` | `trace_id`, `root_span_id`, `root_span_name` |
| `copilot_internal.conversation_messages` | `trace_id`, `root_span_id`, `root_span_name` |
| `copilot_internal.conversation_contexts` | `trace_id` |

See `docs/observability/trace_runbook.md` for trace lookup procedures.

---

## Logging

### Implementation Status: Fully Implemented

**Location:** `packages/reg-intel-observability/src/logger.ts`

### Logger Features

- **Async I/O:** `pino.destination({ sync: false })` - Never blocks event loop
- **Dual-write:** Logs to stdout AND OTEL Collector when enabled
- **OTEL Correlation:** Automatic `trace_id` and `span_id` injection
- **Request Context:** `tenantId`, `conversationId`, `userId`, `agentId` via AsyncLocalStorage
- **PII Sanitization:** Payload hashing and redaction patterns
- **Graceful Shutdown:** `flushLoggers()` ensures no log loss

### Log Structure

```json
{
  "level": "info",
  "timestamp": "2025-01-04T10:30:45.123Z",
  "message": "Processing request",
  "scope": "compliance-engine",
  "component": "ComplianceEngine",
  "trace_id": "abc123def456...",
  "span_id": "789ghi...",
  "tenantId": "tenant-123",
  "conversationId": "conv-456"
}
```

### Usage

```typescript
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('my-component');

logger.info({ userId: '123' }, 'User action completed');
logger.error({ err: new Error('Something failed') }, 'Operation failed');
```

### Payload Logging

```typescript
import { formatPayloadForLog } from '@reg-copilot/reg-intel-observability';

// Always log hashed payloads (safe for all environments)
const { payloadHash, payloadPreview } = formatPayloadForLog(sensitiveData);
logger.info({ payloadHash }, 'Processed request');

// payloadPreview only included when LOG_SAFE_PAYLOADS=true
```

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level (trace, debug, info, warn, error, fatal) |
| `LOG_SAFE_PAYLOADS` | `false` | Log sanitized payload previews |

---

## Metrics

### Implementation Status: Fully Implemented

**Location:** `packages/reg-intel-observability/src/businessMetrics.ts`

### Available Metrics

| Metric Name | Type | Description |
|-------------|------|-------------|
| `regintel.agent.selection.total` | Counter | Agent selections by type |
| `regintel.graph.query.duration` | Histogram | Graph query latency (ms) |
| `regintel.graph.query.total` | Counter | Graph queries by operation |
| `regintel.llm.tokens.total` | Counter | LLM tokens consumed |
| `regintel.llm.request.duration` | Histogram | LLM request latency (ms) |
| `regintel.egressguard.scan.total` | Counter | Egress guard scans |
| `regintel.egressguard.block.total` | Counter | PII/sensitive data blocks |
| `regintel.ui.branch.create.total` | Counter | Branch creations |
| `regintel.ui.merge.execute.total` | Counter | Merge operations |

### Usage

```typescript
import { recordGraphQuery } from '@reg-copilot/reg-intel-observability';

async function runQuery(query: string) {
  const startTime = Date.now();
  let success = true;

  try {
    return await executeQuery(query);
  } catch (error) {
    success = false;
    throw error;
  } finally {
    recordGraphQuery(Date.now() - startTime, {
      operation: 'read',
      queryType: 'cypher',
      success,
    });
  }
}
```

---

## Local Observability Stack

### Quick Start

```bash
cd docker
docker compose up -d
```

### Services

| Service | Port | Purpose | URL |
|---------|------|---------|-----|
| OTEL Collector | 4317, 4318 | Telemetry aggregation | - |
| Jaeger | 16686 | Trace visualization | http://localhost:16686 |
| Prometheus | 9090 | Metrics storage | http://localhost:9090 |
| Loki | 3100 | Log aggregation | - |
| Grafana | 3200 | Unified dashboard | http://localhost:3200 |
| Redis | 6379 | Distributed rate limiting | - |

**Grafana credentials:** admin / admin (change on first login)

### Verify Services

```bash
# OTEL Collector health
curl http://localhost:13133/health

# Loki ready
curl http://localhost:3100/ready

# Prometheus healthy
curl http://localhost:9090/-/healthy
```

### View Data

1. **Grafana Dashboard:** http://localhost:3200/d/reg-copilot-observability
2. **Jaeger Traces:** http://localhost:16686 → Select service `@reg-copilot/demo-web`
3. **Prometheus Metrics:** http://localhost:9090 → Query `regintel_*`

### Log Queries (Loki via Grafana)

```logql
# All logs from the service
{service_name="regulatory-intelligence-copilot"}

# Filter by severity
{service_name="regulatory-intelligence-copilot"} | severity="error"

# Search for text
{service_name="regulatory-intelligence-copilot"} |= "GraphClient"

# Count logs per minute by severity
sum by (severity) (count_over_time({service_name="regulatory-intelligence-copilot"}[1m]))
```

---

## Configuration Reference

### Required Environment Variables (Production)

```bash
# Service identification
OTEL_SERVICE_NAME=@reg-copilot/demo-web

# Enable logs export
OTEL_LOGS_ENABLED=true

# OTEL Collector endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

### Recommended Environment Variables (Production)

```bash
# Trace sampling (10% to reduce costs, errors always sampled)
OTEL_TRACES_SAMPLING_RATIO=0.1
OTEL_TRACES_ALWAYS_SAMPLE_ERRORS=true

# Logging
LOG_LEVEL=info
LOG_SAFE_PAYLOADS=false  # Never log payloads in production
```

### All Observability Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_SERVICE_NAME` | `@reg-copilot/demo-web` | Service name in traces |
| `OTEL_SERVICE_VERSION` | `npm_package_version` | Service version |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | - | Base OTEL Collector endpoint |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | - | Traces endpoint (overrides base) |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | - | Metrics endpoint (overrides base) |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | - | Logs endpoint (overrides base) |
| `OTEL_LOGS_ENABLED` | `false` | Enable OTLP log export |
| `OTEL_TRACES_SAMPLING_RATIO` | `1.0` | Trace sampling ratio (0.0-1.0) |
| `OTEL_TRACES_ALWAYS_SAMPLE_ERRORS` | `true` | Always sample error traces |
| `LOG_LEVEL` | `info` | Pino log level |
| `LOG_SAFE_PAYLOADS` | `false` | Log sanitized payloads |
| `OTEL_COLLECTOR_ENDPOINT` | - | Client telemetry OTEL forward endpoint |
| `OTEL_COLLECTOR_TIMEOUT_MS` | `5000` | Client telemetry forward timeout |
| `CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |

---

## Troubleshooting

### No Telemetry Arriving

1. **Check OTEL Collector is running:**
   ```bash
   docker logs reg-copilot-otel-collector
   curl http://localhost:13133/health
   ```

2. **Verify endpoint configuration:**
   ```bash
   grep OTEL apps/demo-web/.env.local
   ```

3. **Check application logs for export errors:**
   ```bash
   # Look for OTEL-related errors in Next.js output
   ```

4. **Test collector directly:**
   ```bash
   curl -X POST http://localhost:4318/v1/logs \
     -H "Content-Type: application/json" \
     -d '{"resourceLogs":[]}'
   ```

### Rate Limit Issues

1. **Check current limits:**
   ```bash
   echo $CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS
   ```

2. **Review violation logs:**
   ```bash
   # Look for "rate limit exceeded" in logs
   ```

3. **Increase temporarily for debugging:**
   ```bash
   CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=1000
   ```

### Logs Not Appearing in Loki

1. **Check Loki exporter in collector:**
   ```bash
   docker logs reg-copilot-otel-collector | grep -i loki
   ```

2. **Verify Loki is receiving data:**
   ```bash
   curl http://localhost:3100/loki/api/v1/labels
   ```

3. **Check OTEL Collector config has Loki exporter enabled:**
   ```yaml
   # docker/otel-collector-config.yaml
   exporters:
     loki:
       endpoint: "http://loki:3100/loki/api/v1/push"
   ```

### High Memory Usage

1. **Reduce Loki retention:** Edit `docker/loki-config.yaml`
2. **Increase OTEL Collector memory limit:** Edit processor settings
3. **Lower trace sampling ratio:** `OTEL_TRACES_SAMPLING_RATIO=0.1`

### Traces Missing in Jaeger

1. **Check sampling ratio isn't too low**
2. **Verify Jaeger exporter in collector config**
3. **Trigger a request and wait for export batch (1s default)**

---

## Edge Runtime Limitations

**Important:** The OTEL SDK cannot run on Edge Runtime due to Node.js API dependencies.

Routes using Edge Runtime have **no observability**. Recommendations:

1. **Use Node.js runtime for all API routes** (current default)
2. **Use Edge only for static/public routes**
3. **If Edge is required:** Add manual `console.log` JSON logging

```typescript
// Force Node.js runtime for observability
export const runtime = 'nodejs';
```

See `docs/observability/SCALABILITY_REVIEW.md` (Section 8) for detailed Edge Runtime analysis.

---

## Future Work

The following items are **not yet implemented**:

1. **UI metrics integration**
   - `regintel.ui.breadcrumb.navigate.total` - Pending UI component
   - `regintel.ui.path.switch.total` - Pending UI component

2. **Edge Runtime observability**
   - Lightweight Edge-compatible telemetry
   - Waiting for OTEL community Edge support (expected 2025-2026)

3. **Advanced alerting**
   - Prometheus alerting rules
   - Alertmanager integration
   - PagerDuty/Slack notifications

---

## References

### Implementation Files

- Client telemetry: `apps/demo-web/src/lib/clientTelemetry.ts`
- Telemetry API route: `apps/demo-web/src/app/api/client-telemetry/route.ts`
- Logger: `packages/reg-intel-observability/src/logger.ts`
- Tracing: `packages/reg-intel-observability/src/tracing.ts`
- Business metrics: `packages/reg-intel-observability/src/businessMetrics.ts`
- OTEL initialization: `apps/demo-web/instrumentation.ts`

### Configuration Files

- Docker Compose: `docker/docker-compose.yml`
- OTEL Collector config: `docker/otel-collector-config.yaml`
- Production OTEL config: `docker/otel-collector-config.production.yaml`
- Loki config: `docker/loki-config.yaml`
- Prometheus config: `docker/prometheus.yml`
- Grafana dashboards: `docker/grafana/provisioning/dashboards/`

### Related Documentation

- Trace runbook: `docs/observability/trace_runbook.md`
- Scalability review: `docs/observability/SCALABILITY_REVIEW.md`
- Test requirements: `docs/testing/client-telemetry-test-requirements.md`
- Docker observability: `docker/OBSERVABILITY.md`
- Production deployment: `docker/PRODUCTION_DEPLOYMENT.md`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-04 | Initial consolidated document from multiple sources |

**Consolidated from:**
- `docs/architecture/client-telemetry-architecture-v1.md`
- `docs/architecture/OBSERVABILITY_LOKI_SETUP.md`
- `docs/observability/logging_tracing_framework.md`
- `docs/observability/logging_framework_status.md`
- `docs/client-telemetry/README.md`
- `docs/client-telemetry/QUICKSTART.md`
- `docker/OBSERVABILITY.md`
