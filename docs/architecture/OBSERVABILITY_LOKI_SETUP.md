# Loki & Grafana Observability Setup

This document describes the production-ready log aggregation setup using Grafana Loki integrated with the OpenTelemetry Collector.

## Overview

The observability stack now includes:

- **Loki**: Log aggregation and storage
- **Grafana**: Unified dashboard for logs, metrics, and traces
- **Prometheus**: Metrics storage (existing)
- **Jaeger**: Distributed tracing (existing)
- **OTEL Collector**: Telemetry pipeline (existing)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Instances                       │
│  (Next.js, Scripts, Background Workers)                        │
└────────┬─────────────────────────────────────────┬──────────────┘
         │                                         │
         │ Pino Logs                               │ OTLP/HTTP
         │ (structured JSON)                       │ (traces, metrics, logs)
         │                                         │
         ▼                                         ▼
┌────────────────────────────────────────────────────────────────┐
│                    OpenTelemetry Collector                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Receivers:  OTLP/HTTP (4318), OTLP/gRPC (4317)          │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ Processors: batch, memory_limiter, resource, attributes  │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ Exporters:                                               │ │
│  │  - Loki (logs) ✅ NEW                                    │ │
│  │  - Prometheus (metrics)                                  │ │
│  │  - Jaeger (traces)                                       │ │
│  │  - File (backup)                                         │ │
│  │  - Debug (console)                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
└────┬───────────────┬───────────────┬──────────────┬────────────┘
     │               │               │              │
     │ Logs          │ Metrics       │ Traces       │ Backup
     ▼               ▼               ▼              ▼
┌─────────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐
│  Loki   │    │Prometheus│    │ Jaeger  │    │   File   │
│  :3100  │    │  :9090   │    │ :16686  │    │  System  │
└────┬────┘    └────┬─────┘    └────┬────┘    └──────────┘
     │              │               │
     └──────────────┴───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │    Grafana    │
            │     :3200     │
            │               │
            │ Unified View: │
            │ - Logs        │
            │ - Metrics     │
            │ - Traces      │
            │ - Dashboards  │
            └───────────────┘
```

## Quick Start

### 1. Start the Observability Stack

```bash
cd docker
docker-compose up -d
```

This starts:
- OTEL Collector (ports 4317, 4318)
- Loki (port 3100)
- Grafana (port 3200)
- Prometheus (port 9090)
- Jaeger (port 16686)
- Redis (port 6379)
- Memgraph (ports 7687, 7444)

### 2. Access Grafana

Open http://localhost:3200

**Default credentials:**
- Username: `admin`
- Password: `admin` (change on first login)

**To customize credentials:**
```bash
export GRAFANA_ADMIN_USER=yourusername
export GRAFANA_ADMIN_PASSWORD=yourpassword
docker-compose up -d grafana
```

### 3. View the Observability Dashboard

The dashboard is automatically provisioned:
- Navigate to **Dashboards** → **Observability** → **Regulatory Intelligence - Observability Overview**

Or access directly: http://localhost:3200/d/reg-copilot-observability

## What You Can Do Now

### Log Queries with Loki

Loki uses LogQL (similar to PromQL) for querying logs.

**Basic queries:**

```logql
# All logs from a service
{service_name="regulatory-intelligence-copilot"}

# Filter by severity
{service_name="regulatory-intelligence-copilot"} | severity="error"

# Search for text
{service_name="regulatory-intelligence-copilot"} |= "GraphClient"

# Regex search
{service_name="regulatory-intelligence-copilot"} |~ "error|ERROR"

# JSON field extraction
{service_name="regulatory-intelligence-copilot"} | json | user_id="12345"

# Combine filters
{service_name="regulatory-intelligence-copilot"}
  | severity="error"
  | component="graph-client"
```

**Time-based queries:**

```logql
# Count logs per minute
sum by (severity) (count_over_time({service_name="regulatory-intelligence-copilot"}[1m]))

# Rate of errors
rate({service_name="regulatory-intelligence-copilot", severity="error"}[5m])

# Top 10 log producers
topk(10, sum by (component) (count_over_time({service_name="regulatory-intelligence-copilot"}[1h])))
```

### Trace Correlation

**From logs to traces:**
1. In Grafana Logs view, find a log entry with a `trace_id`
2. Click the trace icon next to the trace ID
3. View the full distributed trace in Jaeger

**From traces to logs:**
1. In Jaeger UI, view a trace
2. Click "Logs for this trace" button
3. See all logs related to that trace

### Cross-Service Queries

**Find all errors across all instances:**

```logql
{service_name=~".*"} | severity="error"
```

**Query specific time range:**

```logql
{service_name="regulatory-intelligence-copilot"}
  | json
  | duration > 1000  # Logs where duration > 1000ms
```

### Alerting on Log Patterns

**Create alerts in Grafana:**

1. Go to **Alerting** → **Alert rules** → **New alert rule**
2. Set query:
   ```logql
   sum(rate({severity="error"}[5m])) > 0.1
   ```
3. Configure notification channels (Slack, Email, PagerDuty, etc.)

**Example alert: High error rate**

```yaml
# Alert if error rate exceeds 5 errors/minute
expr: |
  sum(rate({service_name="regulatory-intelligence-copilot", severity="error"}[1m])) > 5
for: 5m
annotations:
  summary: High error rate detected
  description: Error rate is {{ $value }} errors/minute
```

## Data Retention

**Current settings:**

- **Logs (Loki)**: 7 days (168 hours)
- **Metrics (Prometheus)**: 15 days (default)
- **Traces (Jaeger)**: In-memory (restart clears)
- **File backups**: 7 days, 100MB rotation

**To change Loki retention:**

Edit `docker/loki-config.yaml`:

```yaml
limits_config:
  retention_period: 720h  # 30 days
```

Then restart:
```bash
docker-compose restart loki
```

## Production Deployment

### Environment Variables

```bash
# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<strong-password>

# Redis
REDIS_PASSWORD=<strong-password>

# OTEL Collector
OTEL_LOG_LEVEL=info
```

### Resource Limits

**For production, update docker-compose.yml:**

```yaml
services:
  loki:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M

  grafana:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
```

### Persistent Storage

**Volumes are already configured:**

```yaml
volumes:
  loki_data:        # Loki chunks and indexes
  grafana_data:     # Grafana dashboards and config
  prometheus_data:  # Prometheus metrics
```

**To backup:**

```bash
# Backup Loki data
docker run --rm \
  -v docker_loki_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/loki-backup.tar.gz /data

# Backup Grafana data
docker run --rm \
  -v docker_grafana_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/grafana-backup.tar.gz /data
```

### High Availability

**For production HA:**

1. **Run multiple Loki instances** with a load balancer
2. **Use cloud storage** (S3, GCS) instead of filesystem
3. **Configure Loki with microservices mode**

Example cloud storage config:

```yaml
# loki-config.yaml
storage_config:
  aws:
    s3: s3://us-east-1/my-loki-bucket
    sse_encryption: true
  index_queries_cache_config:
    redis:
      endpoint: redis:6379
      password: ${REDIS_PASSWORD}
```

## Performance Tuning

### Loki Query Performance

**Add indexes for frequently queried labels:**

Edit `docker/loki-config.yaml`:

```yaml
limits_config:
  # Increase query parallelism
  max_query_parallelism: 64

  # Increase result limits
  max_entries_limit_per_query: 50000
```

### OTEL Collector Performance

**Increase batch size for high throughput:**

Edit `docker/otel-collector-config.yaml`:

```yaml
processors:
  batch:
    timeout: 5s
    send_batch_size: 1000
    send_batch_max_size: 5000

exporters:
  loki:
    sending_queue:
      num_consumers: 20
      queue_size: 5000
```

## Monitoring the Observability Stack

### Check Service Health

```bash
# OTEL Collector
curl http://localhost:13133/health

# Loki
curl http://localhost:3100/ready

# Prometheus
curl http://localhost:9090/-/healthy

# Jaeger
curl http://localhost:16686/
```

### View OTEL Collector Metrics

Open http://localhost:8888/metrics

Key metrics:
- `otelcol_receiver_accepted_log_records` - Logs received
- `otelcol_exporter_sent_log_records` - Logs sent to Loki
- `otelcol_exporter_queue_size` - Current queue size

### Loki Metrics

Open http://localhost:3100/metrics

Key metrics:
- `loki_ingester_streams_created_total` - Number of log streams
- `loki_ingester_chunks_flushed_total` - Chunks persisted
- `loki_request_duration_seconds` - Query performance

## Troubleshooting

### Logs Not Appearing in Loki

1. **Check OTEL Collector is running:**
   ```bash
   docker logs reg-copilot-otel-collector
   ```

2. **Verify Loki exporter is configured:**
   ```bash
   docker exec reg-copilot-otel-collector \
     wget -qO- http://localhost:8888/debug/servicez
   ```

3. **Check Loki is receiving data:**
   ```bash
   curl http://localhost:3100/loki/api/v1/labels
   ```

4. **Verify application is sending logs:**
   ```bash
   # In your application
   curl http://localhost:4318/v1/logs -X POST
   ```

### High Memory Usage

1. **Reduce retention period** (see Data Retention above)
2. **Increase chunk flush interval** in `loki-config.yaml`:
   ```yaml
   ingester:
     chunk_idle_period: 1m  # Flush more frequently
   ```
3. **Add memory limits** to docker-compose.yml

### Query Timeouts

1. **Split time range** into smaller chunks
2. **Add label filters** to reduce cardinality
3. **Increase timeout** in `loki-config.yaml`:
   ```yaml
   limits_config:
     query_timeout: 5m
   ```

## Next Steps

1. **Create custom dashboards** for your specific use cases
2. **Set up alerting** for critical log patterns
3. **Configure log sampling** for high-volume environments
4. **Integrate with incident management** (PagerDuty, Opsgenie)
5. **Export metrics to cloud** (Datadog, CloudWatch, Azure Monitor)

## References

- [Grafana Loki Documentation](https://grafana.com/docs/loki/latest/)
- [LogQL Query Language](https://grafana.com/docs/loki/latest/logql/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Grafana Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)

## Support

For issues or questions:
- Check logs: `docker-compose logs -f <service>`
- View OTEL debug endpoint: http://localhost:55679/debug/tracez
- Review Grafana logs: `docker logs reg-copilot-grafana`
