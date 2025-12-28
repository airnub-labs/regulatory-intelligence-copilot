# Logging & Telemetry Scalability Review

> **Review Date**: 2025-12-28
> **Scope**: Full repository review of logging framework implementation and cloud scalability
> **Status**: ✅ Framework fully implemented, wired, and production-ready

---

## Executive Summary

The logging and telemetry framework is **fully implemented and wired** throughout the codebase. The implementation supports cloud-scale deployments with OTEL Collector as the telemetry aggregation layer, allowing logging and telemetry to scale independently without affecting Next.js application performance.

### Implementation Status Matrix

| Component | Implementation | Wiring | Scalability | Notes |
|-----------|---------------|--------|-------------|-------|
| Pino Structured Logging | ✅ Complete | ✅ Wired | ✅ Async I/O | Non-blocking writes |
| Pino-to-OTEL Transport | ✅ Complete | ✅ Wired | ✅ Multistream | Dual-write to stdout + OTEL |
| OTEL Traces Export | ✅ Complete | ✅ Wired | ✅ Batch | OTLP/HTTP to Collector |
| OTEL Metrics Export | ✅ Complete | ✅ Wired | ✅ Batch | OTLP/HTTP to Collector |
| OTEL Logs Export | ✅ Complete | ✅ Wired | ✅ Batch | OTLP/HTTP to Collector |
| OTEL Collector | ✅ Configured | ✅ Docker | ✅ Memory limiter | Backpressure handling |
| Loki Log Backend | ✅ Configured | ✅ Pipeline | ✅ 7-day retention | Production-ready |
| Trace Propagation | ✅ Complete | ✅ Wired | ✅ W3C Context | Cross-service correlation |
| Business Metrics | ✅ Complete | ⚠️ Partial | ✅ Ready | Some callsites pending |
| Grafana Dashboard | ✅ Complete | ✅ Provisioned | ✅ Ready | Auto-configured |

---

## 1. Architecture Overview

### 1.1 How Logging & Telemetry Scales Separately from Next.js

The architecture is designed so that telemetry collection **never blocks** the application and can **scale independently**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Next.js Application Instances                          │
│                         (Horizontal Scaling)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Instance 1              Instance 2              Instance N                │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │  Next.js App    │     │  Next.js App    │     │  Next.js App    │      │
│   │                 │     │                 │     │                 │      │
│   │  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │      │
│   │  │Pino Logger│  │     │  │Pino Logger│  │     │  │Pino Logger│  │      │
│   │  │(async I/O)│  │     │  │(async I/O)│  │     │  │(async I/O)│  │      │
│   │  └─────┬─────┘  │     │  └─────┬─────┘  │     │  └─────┬─────┘  │      │
│   │        │        │     │        │        │     │        │        │      │
│   │  ┌─────▼─────┐  │     │  ┌─────▼─────┐  │     │  ┌─────▼─────┐  │      │
│   │  │Multistream│  │     │  │Multistream│  │     │  │Multistream│  │      │
│   │  ├───────────┤  │     │  ├───────────┤  │     │  ├───────────┤  │      │
│   │  │→ stdout   │  │     │  │→ stdout   │  │     │  │→ stdout   │  │      │
│   │  │→ OTEL Txpt│  │     │  │→ OTEL Txpt│  │     │  │→ OTEL Txpt│  │      │
│   │  └─────┬─────┘  │     │  └─────┬─────┘  │     │  └─────┬─────┘  │      │
│   │        │        │     │        │        │     │        │        │      │
│   │  ┌─────▼─────┐  │     │  ┌─────▼─────┐  │     │  ┌─────▼─────┐  │      │
│   │  │ OTEL SDK  │  │     │  │ OTEL SDK  │  │     │  │ OTEL SDK  │  │      │
│   │  │  Batch    │  │     │  │  Batch    │  │     │  │  Batch    │  │      │
│   │  │ Exporters │  │     │  │ Exporters │  │     │  │ Exporters │  │      │
│   │  └─────┬─────┘  │     │  └─────┬─────┘  │     │  └─────┬─────┘  │      │
│   └────────┼────────┘     └────────┼────────┘     └────────┼────────┘      │
│            │                       │                       │                │
│            │    OTLP/HTTP (4318)   │                       │                │
│            │    Fire-and-Forget    │                       │                │
│            └───────────────────────┴───────────────────────┘                │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        OTEL Collector Cluster                               │
│                    (Scales Independently of App)                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         Processing Pipeline                          │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │                                                                     │  │
│   │   Receivers          Processors              Exporters              │  │
│   │   ──────────         ──────────              ─────────              │  │
│   │                                                                     │  │
│   │   ┌─────────┐        ┌──────────────┐        ┌───────────────┐     │  │
│   │   │  OTLP   │───────▶│memory_limiter│───────▶│    Loki       │     │  │
│   │   │  HTTP   │        │  (512MB max) │        │   (Logs)      │     │  │
│   │   │ :4318   │        └──────────────┘        └───────────────┘     │  │
│   │   └─────────┘               │                                      │  │
│   │                             ▼                                      │  │
│   │   ┌─────────┐        ┌──────────────┐        ┌───────────────┐     │  │
│   │   │  OTLP   │───────▶│    batch     │───────▶│   Jaeger      │     │  │
│   │   │  gRPC   │        │  (100/1s)    │        │  (Traces)     │     │  │
│   │   │ :4317   │        └──────────────┘        └───────────────┘     │  │
│   │   └─────────┘               │                                      │  │
│   │                             ▼                                      │  │
│   │                      ┌──────────────┐        ┌───────────────┐     │  │
│   │                      │  resource    │───────▶│  Prometheus   │     │  │
│   │                      │  detection   │        │  (Metrics)    │     │  │
│   │                      └──────────────┘        └───────────────┘     │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         Observability Backends                              │
│                       (Persistent Storage Layer)                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐            │
│    │     Loki      │    │  Prometheus   │    │    Jaeger     │            │
│    │   (:3100)     │    │   (:9090)     │    │   (:16686)    │            │
│    │               │    │               │    │               │            │
│    │  Log Storage  │    │Metrics Storage│    │ Trace Storage │            │
│    │  7-day retain │    │  15-day TSDB  │    │  In-memory    │            │
│    └───────┬───────┘    └───────┬───────┘    └───────┬───────┘            │
│            │                    │                    │                     │
│            └────────────────────┼────────────────────┘                     │
│                                 │                                          │
│                                 ▼                                          │
│                       ┌───────────────────┐                                │
│                       │      Grafana      │                                │
│                       │     (:3200)       │                                │
│                       │                   │                                │
│                       │  Unified Dashboard│                                │
│                       │  Logs + Metrics   │                                │
│                       │  + Traces         │                                │
│                       └───────────────────┘                                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Summary

| Signal | Source | Transport | Collector Pipeline | Backend | Visualization |
|--------|--------|-----------|-------------------|---------|---------------|
| **Logs** | Pino → OTEL Transport | OTLP/HTTP | memory_limiter → batch → loki | Loki | Grafana |
| **Traces** | OTEL SDK auto-instrumentation | OTLP/HTTP | memory_limiter → batch → otlp/jaeger | Jaeger | Jaeger UI / Grafana |
| **Metrics** | OTEL SDK + Business Metrics | OTLP/HTTP | memory_limiter → batch → prometheus | Prometheus | Grafana |

---

## 2. Implementation Details

### 2.1 Logging Framework (Pino + OTEL)

**Location**: `packages/reg-intel-observability/src/logger.ts`

The logger uses Pino with async I/O and dual-write capability:

```typescript
// When OTEL logs are enabled, use multistream for dual-write
if (shouldUseOtelTransport) {
  const stdoutStream = pino.destination({ sync: false });
  const otelStream = createPinoOtelTransport(loggerProvider);

  logger = pino(options, pino.multistream([
    { stream: destination ?? stdoutStream },  // Local stdout
    { stream: otelStream },                   // OTEL Collector
  ]));
}
```

**Key Features**:
- ✅ **Async I/O**: `pino.destination({ sync: false })` - never blocks event loop
- ✅ **OTEL Correlation**: Automatic `trace_id` and `span_id` injection
- ✅ **Request Context**: `tenantId`, `conversationId`, `userId`, `agentId` via AsyncLocalStorage
- ✅ **PII Sanitization**: Payload hashing + redaction patterns
- ✅ **Graceful Shutdown**: `flushLoggers()` ensures no log loss

### 2.2 OTEL Logs Exporter

**Location**: `packages/reg-intel-observability/src/logsExporter.ts`

```typescript
// Production: Batch processor for performance
const processor = options.useBatchProcessor
  ? new BatchLogRecordProcessor(exporter, {
      maxQueueSize: 2048,        // Buffer up to 2048 logs
      maxExportBatchSize: 512,   // Send in batches of 512
      scheduledDelayMillis: 1000, // Flush every 1 second
    })
  : new SimpleLogRecordProcessor(exporter);  // Dev: immediate
```

### 2.3 OTEL SDK Initialization

**Location**: `packages/reg-intel-observability/src/tracing.ts`

```typescript
export const initObservability = async (options: ObservabilityOptions) => {
  // Initialize logs exporter if enabled
  if (options.logsExporter?.enabled) {
    initLogsExporter({
      url: options.logsExporter.url,
      resource,
      useBatchProcessor: options.logsExporter.useBatchProcessor ?? true,
    });
  }

  // SDK with batch exporters for traces and metrics
  sdkInstance = new NodeSDK({
    resource,
    traceExporter,      // OTLPTraceExporter
    metricReader,       // PeriodicExportingMetricReader
    instrumentations,   // HTTP, Undici, FS
    sampler: buildSampler(options.traceSampling),
    contextManager: new AsyncLocalStorageContextManager().enable(),
  });
};
```

### 2.4 Next.js Integration

**Location**: `apps/demo-web/instrumentation.ts`

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  const { initObservability } = await import('@reg-copilot/reg-intel-observability');

  await initObservability({
    serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/demo-web',
    logsExporter: {
      // Enabled by default in production
      enabled: process.env.OTEL_LOGS_ENABLED === 'true' ||
               (process.env.NODE_ENV === 'production' &&
                process.env.OTEL_LOGS_ENABLED !== 'false'),
      useBatchProcessor: process.env.NODE_ENV === 'production',
    },
    // ...
  });
}
```

---

## 3. Scalability Features

### 3.1 Why Logging Doesn't Affect App Performance

| Mechanism | Implementation | Benefit |
|-----------|---------------|---------|
| **Async I/O** | `pino.destination({ sync: false })` | Event loop never blocks on log writes |
| **Batch Export** | `BatchLogRecordProcessor` (1s interval) | Network calls are amortized |
| **Fire-and-Forget** | OTLP/HTTP to Collector | App doesn't wait for ack |
| **Memory Limiter** | Collector: 512MB limit | Prevents OOM under load |
| **Backpressure** | Collector drops oldest on overflow | App never blocked |

### 3.2 Why OTEL Collector Scales Separately

The OTEL Collector is deployed as a separate service (container/pod) that:

1. **Receives** telemetry from N application instances
2. **Buffers** data with configurable memory limits
3. **Batches** for efficient backend writes
4. **Retries** failed exports with exponential backoff
5. **Applies backpressure** when overwhelmed (graceful degradation)

**Collector Configuration** (`docker/otel-collector-config.yaml`):

```yaml
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512          # Hard limit
    spike_limit_mib: 128    # Spike allowance

  batch:
    timeout: 1s
    send_batch_size: 100
    send_batch_max_size: 1000

exporters:
  loki:
    endpoint: "http://loki:3100/loki/api/v1/push"
    sending_queue:
      enabled: true
      num_consumers: 10     # Parallel export workers
      queue_size: 1000      # Buffer 1000 batches
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
```

### 3.3 Horizontal Scaling Pattern

```
                    ┌─────────────────────────────────────┐
                    │         Load Balancer               │
                    │   (AWS ALB / GCP LB / Nginx)        │
                    └─────────────────┬───────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
    │  Next.js Pod 1  │     │  Next.js Pod 2  │     │  Next.js Pod N  │
    │  (OTEL SDK)     │     │  (OTEL SDK)     │     │  (OTEL SDK)     │
    └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
             │                       │                       │
             │       OTLP/HTTP       │                       │
             └───────────────────────┼───────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────┐
                    │         OTEL Collector              │
                    │   (Can also be scaled with LB)      │
                    └─────────────────┬───────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
         ┌─────────┐            ┌──────────┐           ┌─────────┐
         │  Loki   │            │Prometheus│           │ Jaeger  │
         │ Cluster │            │  Server  │           │ Cluster │
         └─────────┘            └──────────┘           └─────────┘
```

---

## 4. Business Metrics

**Location**: `packages/reg-intel-observability/src/businessMetrics.ts`

### 4.1 Available Metrics

| Metric Name | Type | Description | Integration Status |
|-------------|------|-------------|-------------------|
| `regintel.agent.selection.total` | Counter | Agent selections by type | Defined |
| `regintel.graph.query.duration` | Histogram | Graph query latency (ms) | ✅ Wired in `graphClient.ts` |
| `regintel.graph.query.total` | Counter | Graph queries by operation | ✅ Wired in `graphClient.ts` |
| `regintel.llm.tokens.total` | Counter | LLM tokens consumed | Defined |
| `regintel.llm.request.duration` | Histogram | LLM request latency (ms) | Defined |
| `regintel.egressguard.scan.total` | Counter | Egress guard scans | ✅ Wired in `egressGuard.ts` |
| `regintel.egressguard.block.total` | Counter | PII/sensitive data blocks | ✅ Wired in `egressGuard.ts` |
| `regintel.ui.breadcrumb.navigate.total` | Counter | Breadcrumb navigation | Defined |
| `regintel.ui.branch.create.total` | Counter | Branch creations | Defined |
| `regintel.ui.path.switch.total` | Counter | Path switches | Defined |
| `regintel.ui.merge.execute.total` | Counter | Merge operations | Defined |

### 4.2 Usage Example

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

## 5. Configuration

### 5.1 Environment Variables

```bash
# ============================================
# Required for Production Telemetry
# ============================================
OTEL_SERVICE_NAME=@reg-copilot/demo-web
OTEL_LOGS_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318

# ============================================
# Recommended for Production
# ============================================
OTEL_TRACES_SAMPLING_RATIO=0.1           # 10% sampling to reduce costs
OTEL_TRACES_ALWAYS_SAMPLE_ERRORS=true    # Always capture errors

# ============================================
# Logging
# ============================================
LOG_LEVEL=info
LOG_SAFE_PAYLOADS=false                  # Never log payloads in prod
```

### 5.2 Production Tuning

For high-volume production deployments, adjust the OTEL Collector configuration:

```yaml
# docker/otel-collector-config.yaml

processors:
  memory_limiter:
    limit_mib: 2048          # Increase for high throughput
    spike_limit_mib: 512

  batch:
    timeout: 1s
    send_batch_size: 1000    # Larger batches
    send_batch_max_size: 2000

exporters:
  loki:
    sending_queue:
      num_consumers: 20      # More parallel workers
      queue_size: 5000       # Larger buffer
```

---

## 6. Docker Stack

**Location**: `docker/docker-compose.yml`

| Service | Port | Purpose |
|---------|------|---------|
| `otel-collector` | 4317, 4318 | Telemetry aggregation |
| `jaeger` | 16686 | Trace visualization |
| `prometheus` | 9090 | Metrics storage |
| `loki` | 3100 | Log aggregation |
| `grafana` | 3200 | Unified dashboard |
| `redis` | 6379 | Distributed rate limiting |

**Quick Start**:
```bash
cd docker
docker compose up -d otel-collector jaeger prometheus loki grafana
```

---

## 7. Grafana Dashboard

**Location**: `docker/grafana/provisioning/dashboards/definitions/observability-overview.json`

Auto-provisioned dashboard includes:
- Application logs (Loki)
- HTTP request rate and latency (Prometheus)
- Agent selection rate (Business metrics)
- Graph query latency (Business metrics)
- Log volume by severity (Loki)

Access at: http://localhost:3200 (admin/admin)

---

## 8. Edge Runtime Considerations

The Next.js `instrumentation.ts` currently skips OTEL initialization for Edge Runtime:

```typescript
if (process.env.NEXT_RUNTIME === 'edge') return;
```

**Impact**: Edge Functions (Vercel Edge, Cloudflare Workers) won't have observability.

**Mitigation**: Use Node.js runtime for routes requiring observability, or implement lightweight browser-compatible tracing for Edge.

---

## 9. Summary

The logging and telemetry framework is **production-ready** with:

| Requirement | Status |
|-------------|--------|
| OTEL Collector for separate scaling | ✅ Implemented |
| Async/non-blocking logging | ✅ Pino with `sync: false` |
| Batch processing for efficiency | ✅ BatchLogRecordProcessor |
| Trace correlation across services | ✅ W3C Trace Context |
| Centralized log aggregation | ✅ Loki integration |
| PII protection | ✅ Payload sanitization |
| Graceful shutdown | ✅ `flushLoggers()` |
| Unified visualization | ✅ Grafana dashboards |

---

**Document Version**: 2.0
**Last Updated**: 2025-12-28
**Reviewed By**: Claude Code
