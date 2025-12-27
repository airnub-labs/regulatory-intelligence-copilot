# Observability Stack Setup

This directory contains the OpenTelemetry (OTEL) observability stack configuration for the Regulatory Intelligence Copilot application.

## Overview

The observability stack provides comprehensive monitoring through three pillars of observability:

- **Logs**: Application logs sent via Pino → OTEL Collector
- **Traces**: Distributed traces showing request flows
- **Metrics**: Performance metrics and counters

## Architecture

```
Application (Next.js + Scripts)
    ↓ OTLP/HTTP (port 4318)
OpenTelemetry Collector
    ├→ Logs → Console + File
    ├→ Traces → Jaeger
    └→ Metrics → Prometheus
```

## Quick Start

### 1. Start the Observability Stack

```bash
# From the project root
cd docker
docker compose up -d otel-collector jaeger prometheus
```

### 2. Configure Application to Send Telemetry

Set these environment variables in your `.env.local` file:

```bash
# Enable OTEL log exporter
OTEL_LOGS_ENABLED=true

# OTEL Collector endpoints
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:4318/v1/logs

# Service identification
OTEL_SERVICE_NAME=@reg-copilot/demo-web
OTEL_SERVICE_VERSION=0.1.0

# Trace sampling (1.0 = 100%, 0.1 = 10%)
OTEL_TRACES_SAMPLING_RATIO=1.0
OTEL_TRACES_ALWAYS_SAMPLE_ERRORS=true

# Logging configuration
LOG_LEVEL=info
LOG_SAFE_PAYLOADS=true
```

### 3. Update Application Code

**For Next.js (already configured in `apps/demo-web/instrumentation.ts`):**

```typescript
await initObservability({
  serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/demo-web',
  serviceVersion: process.env.npm_package_version,
  environment: process.env.NODE_ENV,
  traceExporter: {
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  },
  metricsExporter: {
    url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  },
  logsExporter: {
    enabled: process.env.OTEL_LOGS_ENABLED === 'true',
    url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
    useBatchProcessor: true, // Recommended for production
  },
  traceSampling: {
    parentBasedRatio: Number(process.env.OTEL_TRACES_SAMPLING_RATIO) || 1.0,
    alwaysSampleErrors: process.env.OTEL_TRACES_ALWAYS_SAMPLE_ERRORS !== 'false',
  },
});
```

**For Scripts (update `scripts/observability.ts`):**

Add `logsExporter` configuration to the `bootstrapObservability` function.

### 4. Start Your Application

```bash
pnpm dev
```

### 5. Access Observability UIs

Once everything is running, access:

- **Jaeger UI** (Traces): http://localhost:16686
- **Prometheus** (Metrics): http://localhost:9090
- **OTEL Collector Health**: http://localhost:13133/health
- **OTEL Collector zPages**: http://localhost:55679/debug/tracez

## Services

### OpenTelemetry Collector

The OTEL Collector receives telemetry from your application and exports it to various backends.

**Ports:**
- `4317`: OTLP gRPC receiver
- `4318`: OTLP HTTP receiver (used by application)
- `8888`: Prometheus self-monitoring
- `8889`: Application metrics exporter (scraped by Prometheus)
- `13133`: Health check endpoint
- `55679`: zPages debugging UI

**Configuration**: `otel-collector-config.yaml`

### Jaeger

Jaeger provides distributed tracing visualization.

**Ports:**
- `16686`: Jaeger UI
- `14268`: Jaeger collector

**Access**: http://localhost:16686

### Prometheus

Prometheus scrapes and stores metrics.

**Ports:**
- `9090`: Prometheus UI and API

**Configuration**: `prometheus.yml`

**Access**: http://localhost:9090

## Verification

### Check if Telemetry is Flowing

1. **Check OTEL Collector logs:**
   ```bash
   docker logs reg-copilot-otel-collector
   ```

2. **Check collector health:**
   ```bash
   curl http://localhost:13133/health
   ```

3. **View traces in Jaeger:**
   - Open http://localhost:16686
   - Select service: `@reg-copilot/demo-web`
   - Click "Find Traces"

4. **View metrics in Prometheus:**
   - Open http://localhost:9090
   - Query: `{service_name="@reg-copilot/demo-web"}`

### Test Logs Export

Run a script and verify logs appear in collector output:

```bash
# Run a script that uses observability
pnpm seed:graph

# Check collector logs
docker logs reg-copilot-otel-collector --tail 100
```

You should see log entries in the collector output.

## Configuration Details

### Log Levels

The application respects the `LOG_LEVEL` environment variable:

- `trace`: Most verbose
- `debug`: Debug information
- `info`: General information (default)
- `warn`: Warnings
- `error`: Errors only
- `fatal`: Fatal errors only

### Trace Sampling

Control trace sampling with `OTEL_TRACES_SAMPLING_RATIO`:

- `1.0`: Sample 100% of traces (development)
- `0.1`: Sample 10% of traces (production with high traffic)
- `0.01`: Sample 1% of traces (production with very high traffic)

**Note**: Errors are always sampled when `OTEL_TRACES_ALWAYS_SAMPLE_ERRORS=true`

### Performance Tuning

#### Development

```yaml
# In otel-collector-config.yaml
processors:
  batch:
    timeout: 1s
    send_batch_size: 100

exporters:
  debug:
    verbosity: detailed
```

#### Production

```yaml
processors:
  batch:
    timeout: 5s
    send_batch_size: 1000
  memory_limiter:
    limit_mib: 2048
    spike_limit_mib: 512

exporters:
  # Remove debug exporter
  # Use otlphttp to forward to production backend
  otlphttp:
    endpoint: "https://your-backend.com/v1/traces"
```

## Troubleshooting

### Logs Not Appearing

1. Check that `OTEL_LOGS_ENABLED=true` in your environment
2. Verify OTEL collector is running: `docker ps | grep otel-collector`
3. Check collector logs: `docker logs reg-copilot-otel-collector`
4. Ensure the endpoint is correct: `http://localhost:4318/v1/logs`

### Traces Not Appearing in Jaeger

1. Check Jaeger is running: `docker ps | grep jaeger`
2. Verify traces are being sent: Check collector logs
3. Ensure sampling ratio isn't too low: Set `OTEL_TRACES_SAMPLING_RATIO=1.0`
4. Trigger a request and wait a few seconds for export

### High Memory Usage

1. Reduce batch sizes in `otel-collector-config.yaml`
2. Lower memory limits in `memory_limiter` processor
3. Reduce trace sampling ratio
4. Disable debug exporter in production

### Collector Won't Start

1. Check config syntax: `docker compose config`
2. Ensure ports aren't in use: `netstat -an | grep 4318`
3. Check Docker logs: `docker logs reg-copilot-otel-collector`

## Production Deployment

### Recommended Changes for Production

1. **Disable Debug Exporters**:
   - Remove `debug` exporter from pipelines
   - Use structured exporters (OTLP, Datadog, etc.)

2. **Add Persistent Storage**:
   - Configure remote write for Prometheus
   - Use managed Jaeger backend (e.g., Jaeger on Kubernetes)

3. **Secure Endpoints**:
   - Add authentication to OTLP endpoints
   - Use TLS for all connections
   - Set CORS restrictions

4. **Scale the Collector**:
   - Run multiple collector instances
   - Use load balancer in front
   - Adjust memory limits based on traffic

5. **Configure Alerting**:
   - Add Prometheus alerting rules
   - Set up Alertmanager
   - Configure notifications (Slack, PagerDuty, etc.)

### Example Production Config

```yaml
# Production OTEL Collector config
processors:
  memory_limiter:
    limit_mib: 2048
    spike_limit_mib: 512
  batch:
    timeout: 10s
    send_batch_size: 1000

exporters:
  otlphttp:
    endpoint: "https://api.yourdomain.com/v1/traces"
    headers:
      authorization: "Bearer ${env:OTEL_API_KEY}"
    compression: gzip
```

## Additional Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [OTEL Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review collector logs for errors
3. Consult the OpenTelemetry documentation
4. Open an issue in the project repository
