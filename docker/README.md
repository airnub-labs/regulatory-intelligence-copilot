# Docker Observability Stack

This directory contains the complete observability stack configuration for the Regulatory Intelligence Copilot.

## 🚀 Quick Start

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes all data)
docker compose down -v
```

## 📊 Services & Ports

| Service | Port | Purpose | URL |
|---------|------|---------|-----|
| **Grafana** | 3200 | Unified observability dashboard | http://localhost:3200 |
| **Loki** | 3100 | Log aggregation and storage | http://localhost:3100 |
| **Prometheus** | 9090 | Metrics storage and querying | http://localhost:9090 |
| **Jaeger** | 16686 | Distributed tracing UI | http://localhost:16686 |
| **OTEL Collector** | 4318 (HTTP)<br>4317 (gRPC) | Telemetry pipeline | http://localhost:13133/health |
| **Memgraph** | 7687 (Bolt)<br>7444 (Lab) | Graph database | http://localhost:7444 |
| **Redis** | 6379 | Caching and rate limiting | - |

## 🔐 Default Credentials

**Grafana:**
- Username: `admin`
- Password: `admin` (change on first login)

**Redis:**
- Password: `devpassword` (set via `REDIS_PASSWORD` env var)

## 📁 Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Service definitions and networking |
| `otel-collector-config.yaml` | OTEL Collector pipeline configuration |
| `loki-config.yaml` | Loki storage and retention settings |
| `prometheus.yml` | Prometheus scrape targets |
| `grafana/provisioning/` | Auto-configured datasources and dashboards |

## 🔍 Observability Stack Architecture

```
Application → OTEL Collector → {
    Logs → Loki → Grafana
    Traces → Jaeger → Grafana
    Metrics → Prometheus → Grafana
}
```

## 📖 Features

### ✅ Production-Ready Log Aggregation (Loki)

- **Persistent storage**: Logs survive container restarts
- **Cross-instance search**: Query logs from all instances in one place
- **7-day retention**: Configurable in `loki-config.yaml`
- **Structured JSON logs**: Full context preserved
- **Trace correlation**: Click from logs to traces

### ✅ Distributed Tracing (Jaeger)

- **OTLP native**: Direct integration with OTEL Collector
- **Service map**: Visualize service dependencies
- **Span details**: Full context and timing

### ✅ Metrics & Business Intelligence (Prometheus)

- **System metrics**: CPU, memory, request rates
- **Business metrics**: Agent selections, graph queries, LLM tokens
- **Custom dashboards**: Pre-configured Grafana dashboards

### ✅ Unified Dashboard (Grafana)

- **Pre-provisioned datasources**: Loki, Prometheus, Jaeger
- **Auto-loaded dashboards**: Observability overview
- **Trace correlation**: Jump between logs, metrics, and traces
- **Alerting**: Configure alerts on log patterns and metrics

## 🚦 Health Checks

```bash
# Check all services
docker compose ps

# Individual health checks
curl http://localhost:13133/health     # OTEL Collector
curl http://localhost:3100/ready       # Loki
curl http://localhost:9090/-/healthy   # Prometheus
curl http://localhost:3200/api/health  # Grafana
curl http://localhost:16686/           # Jaeger
```

## 🔧 Common Operations

### View Service Logs

```bash
docker compose logs -f otel-collector
docker compose logs -f loki
docker compose logs -f grafana
```

### Restart a Service

```bash
docker compose restart loki
docker compose restart grafana
```

### Update Configuration

```bash
# After editing configuration files
docker compose up -d --force-recreate <service>

# Example: reload OTEL Collector config
docker compose up -d --force-recreate otel-collector
```

### Backup Data

```bash
# Backup Loki data
docker run --rm \
  -v docker_loki_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/loki-backup-$(date +%Y%m%d).tar.gz /data

# Backup Grafana data
docker run --rm \
  -v docker_grafana_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/grafana-backup-$(date +%Y%m%d).tar.gz /data
```

### Clear All Data

```bash
# ⚠️ WARNING: This deletes all logs, metrics, and traces
docker compose down -v
docker compose up -d
```

## 📈 Grafana Dashboards

### Pre-configured Dashboards

1. **Observability Overview** (`reg-copilot-observability`)
   - Application logs with filtering
   - HTTP request rate and latency
   - Business metrics (agent selections, graph queries)
   - Log volume by severity

### Creating Custom Dashboards

1. Open Grafana: http://localhost:3200
2. Go to **Dashboards** → **New** → **New Dashboard**
3. Add panels with queries:

**Example LogQL query (Loki):**
```logql
{service_name="regulatory-intelligence-copilot"} | severity="error"
```

**Example PromQL query (Prometheus):**
```promql
rate(http_server_duration_count[5m])
```

## 🔒 Production Deployment

### Environment Variables

Create a `.env` file:

```bash
# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<strong-password>

# Redis
REDIS_PASSWORD=<strong-password>

# OTEL
OTEL_LOG_LEVEL=info
```

### Resource Limits

For production, add resource limits to `docker-compose.yml`:

```yaml
services:
  loki:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### External Storage

For production, consider:
- **Loki**: S3, GCS, or Azure Blob Storage
- **Prometheus**: Remote write to cloud providers
- **Grafana**: External database (PostgreSQL, MySQL)

See `../docs/architecture/OBSERVABILITY_LOKI_SETUP.md` for details.

## 🐛 Troubleshooting

### Logs not appearing in Loki

1. Check OTEL Collector is running: `docker compose logs otel-collector`
2. Verify Loki health: `curl http://localhost:3100/ready`
3. Check application is sending logs to `:4318/v1/logs`

### Grafana can't connect to datasources

1. Ensure all services are running: `docker compose ps`
2. Check network connectivity: `docker compose exec grafana ping loki`
3. Restart Grafana: `docker compose restart grafana`

### High memory usage

1. Reduce Loki retention in `loki-config.yaml`:
   ```yaml
   limits_config:
     retention_period: 72h  # 3 days instead of 7
   ```
2. Add memory limits to services
3. Clear old data: `docker compose restart loki`

## 📚 Documentation

- [Full Observability Setup Guide](../docs/architecture/OBSERVABILITY_LOKI_SETUP.md)
- [Business Metrics Documentation](../docs/architecture/BUSINESS_METRICS.md)
- [OTEL Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)

## 🎯 Next Steps

1. ✅ Start the stack: `docker compose up -d`
2. ✅ Access Grafana: http://localhost:3200 (admin/admin)
3. ✅ View the pre-configured dashboard
4. ✅ Run your application and generate logs
5. ✅ Explore logs in Grafana Explore
6. ✅ Set up alerts for critical patterns

## 💡 Tips

- Use **Grafana Explore** for ad-hoc log queries
- Create **saved searches** for frequent queries
- Set up **alerts** for error spikes
- Use **trace correlation** to debug issues across services
- Configure **retention policies** based on your needs
- Export **dashboards** as JSON for version control
