# Production Deployment Guide - Observability Stack

This guide covers deploying the OTEL Collector and observability stack to production.

## Quick Start

### Development (Default)

```bash
docker compose up -d
```

Uses `otel-collector-config.yaml` (dev config).

### Production

```bash
# Set required environment variables first (see below)
export LOKI_ENDPOINT="https://loki.yourdomain.com/loki/api/v1/push"
export LOKI_API_KEY="your-api-key"
# ... (set other variables)

# Start with production config
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

Uses `otel-collector-config.production.yaml` (production-tuned config).

---

## Configuration Differences

| Feature | Development | Production |
|---------|------------|------------|
| Memory limit | 512MB | 2GB |
| Batch size | 100 | 2000 |
| Batch timeout | 1s | 5s |
| Queue workers | 10 | 20 |
| Queue size | 1000 | 5000 |
| Debug exporters | ✅ Enabled | ❌ Disabled |
| File exporters | ✅ Enabled | ❌ Disabled |
| Tail sampling | ❌ Disabled | ✅ Enabled (5% + errors) |
| Queue persistence | ❌ In-memory | ✅ Disk-backed |
| Resource limits | None | CPU/Memory capped |
| Debug endpoints | ✅ Exposed | ❌ Disabled |

---

## Required Environment Variables

### For OTEL Collector

```bash
# Log backend (Loki)
export LOKI_ENDPOINT="https://loki.yourdomain.com/loki/api/v1/push"
export LOKI_API_KEY="your-loki-api-key"

# Trace backend (Jaeger or other OTLP endpoint)
export TRACES_ENDPOINT="https://traces.yourdomain.com:4317"
export TRACES_API_KEY="your-traces-api-key"

# Metrics backend (Prometheus remote write)
export PROMETHEUS_REMOTE_WRITE_ENDPOINT="https://prometheus.yourdomain.com/api/v1/write"
export PROMETHEUS_API_KEY="your-prometheus-api-key"

# Deployment metadata
export AWS_REGION="us-east-1"
export CLUSTER_NAME="prod-cluster"

# CORS allowed origins (your app domains)
export ALLOWED_ORIGIN_1="https://app.yourdomain.com"
export ALLOWED_ORIGIN_2="https://api.yourdomain.com"
```

### For Grafana

```bash
# Admin credentials
export GRAFANA_ADMIN_USER="admin"
export GRAFANA_ADMIN_PASSWORD="strong-random-password"

# Security
export GF_SECURITY_SECRET_KEY="random-secret-key-for-cookies"

# Public URL
export GRAFANA_ROOT_URL="https://grafana.yourdomain.com"

# SMTP for alerting (optional)
export GF_SMTP_ENABLED="true"
export GF_SMTP_HOST="smtp.gmail.com:587"
export GF_SMTP_USER="your-email@gmail.com"
export GF_SMTP_PASSWORD="your-app-password"
export GF_SMTP_FROM_ADDRESS="grafana@yourdomain.com"
```

---

## Resource Requirements

### Minimum (Low Traffic)

- **CPU**: 4 cores total
- **RAM**: 8GB total
- **Disk**: 50GB (logs + metrics retention)

### Recommended (Production)

- **CPU**: 8-12 cores total
- **RAM**: 16GB total
- **Disk**: 200GB+ (SSD recommended)

### Per-Service Breakdown

| Service | CPU (cores) | RAM (GB) | Disk (GB) |
|---------|-------------|----------|-----------|
| OTEL Collector | 2-4 | 2-4 | 10 (queue storage) |
| Jaeger | 1-2 | 1-2 | 20 (traces) |
| Prometheus | 1-2 | 2-4 | 50-100 (metrics) |
| Loki | 1-2 | 1-2 | 50-100 (logs) |
| Grafana | 0.5-1 | 0.5-1 | 5 (dashboards) |
| Redis | 0.5-1 | 0.5-1 | 5 (cache) |

---

## Deployment Steps

### 1. Prepare Environment

```bash
# Clone repository
git clone https://github.com/yourusername/regulatory-intelligence-copilot.git
cd regulatory-intelligence-copilot/docker

# Copy environment template
cp .env.example .env

# Edit .env with your production values
nano .env
```

### 2. Configure Secrets

**DO NOT** commit secrets to git. Use environment variables or a secrets manager.

#### Option A: Environment Variables

```bash
# Load from .env file
set -a
source .env
set +a
```

#### Option B: Secrets Manager (Recommended)

```bash
# AWS Secrets Manager
export LOKI_API_KEY=$(aws secretsmanager get-secret-value --secret-id loki-api-key --query SecretString --output text)

# HashiCorp Vault
export LOKI_API_KEY=$(vault kv get -field=api_key secret/loki)
```

### 3. Validate Configuration

```bash
# Test OTEL Collector config
docker run --rm \
  -v $(pwd)/otel-collector-config.production.yaml:/etc/otel-collector-config.yaml \
  otel/opentelemetry-collector-contrib:latest \
  --config=/etc/otel-collector-config.yaml \
  --dry-run

# Should output: "configuration validated successfully"
```

### 4. Deploy Stack

```bash
# Pull latest images
docker compose -f docker-compose.yml -f docker-compose.production.yml pull

# Start services
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d

# Check health
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
```

### 5. Verify Deployment

```bash
# Check OTEL Collector health
curl http://localhost:13133/health
# Should return: {"status": "Server available"}

# Check Prometheus
curl http://localhost:9090/-/healthy
# Should return: Prometheus is Healthy.

# Check Loki
curl http://localhost:3100/ready
# Should return: ready

# Check Grafana
curl http://localhost:3200/api/health
# Should return: {"database": "ok"}
```

### 6. Configure Application

Update your Next.js app to point to the OTEL Collector:

```bash
# .env.production
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=@reg-copilot/demo-web
OTEL_LOGS_ENABLED=true
OTEL_TRACES_SAMPLING_RATIO=0.1
```

---

## Monitoring the Stack

### OTEL Collector Self-Monitoring

```bash
# View collector metrics
curl http://localhost:8888/metrics | grep otelcol

# Key metrics to watch:
# - otelcol_processor_batch_batch_send_size_sum
# - otelcol_exporter_queue_size
# - otelcol_exporter_send_failed_spans
# - otelcol_receiver_accepted_spans
```

### Set Alerts

Configure alerts in Grafana for:

1. **Memory usage > 80%**
   ```promql
   (otelcol_process_memory_rss / 2147483648) > 0.8
   ```

2. **Exporter failures > 5**
   ```promql
   rate(otelcol_exporter_send_failed_spans[5m]) > 5
   ```

3. **Queue size > 80% capacity**
   ```promql
   (otelcol_exporter_queue_size / 5000) > 0.8
   ```

4. **Batch send latency > 10s**
   ```promql
   otelcol_processor_batch_batch_send_duration_bucket > 10000
   ```

---

## Scaling Guidelines

### Horizontal Scaling

When to scale:

- CPU usage consistently > 70%
- Memory usage consistently > 80%
- Queue size frequently hits 80% capacity
- Exporter send latency > 5s

How to scale:

```bash
# Run multiple collector instances behind a load balancer
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --scale otel-collector=3
```

Configure load balancer (nginx example):

```nginx
upstream otel_collector {
    least_conn;
    server localhost:4318;
    server localhost:4319;
    server localhost:4320;
}

server {
    listen 80;
    location / {
        proxy_pass http://otel_collector;
    }
}
```

### Vertical Scaling

Adjust resource limits in `docker-compose.production.yml`:

```yaml
services:
  otel-collector:
    deploy:
      resources:
        limits:
          cpus: '8'      # Increase from 4
          memory: 8192M  # Increase from 4096M
```

Update OTEL config memory_limiter:

```yaml
processors:
  memory_limiter:
    limit_mib: 6144      # 75% of 8GB
    spike_limit_mib: 1024
```

---

## Troubleshooting

### Collector Running Out of Memory

**Symptom**: Collector crashes or restarts frequently.

**Fix**:
1. Check memory usage: `docker stats reg-copilot-otel-collector`
2. Increase memory limit in `docker-compose.production.yml`
3. Adjust `memory_limiter` in OTEL config
4. Enable more aggressive tail sampling (reduce sampling percentage)

### High Exporter Failure Rate

**Symptom**: `otelcol_exporter_send_failed_spans` is high.

**Fix**:
1. Check backend connectivity: `curl $TRACES_ENDPOINT`
2. Verify API keys are correct
3. Increase retry window in OTEL config
4. Check backend capacity (is it overloaded?)

### Logs Not Appearing in Loki

**Symptom**: Grafana shows no logs from application.

**Debug**:
```bash
# Check collector is receiving logs
curl http://localhost:8888/metrics | grep otelcol_receiver_accepted_log_records

# Check Loki is receiving logs
curl http://localhost:3100/metrics | grep loki_ingester_samples_per_second

# Check application is sending logs
# (set OTEL_LOGS_ENABLED=true in Next.js)
```

### Queue Filling Up

**Symptom**: `otelcol_exporter_queue_size` approaching `queue_size` limit.

**Fix**:
1. Increase `queue_size` in OTEL config
2. Increase `num_consumers` (parallel workers)
3. Check if backend is slow (increase capacity)
4. Enable file_storage for persistence

---

## Cost Optimization

### 1. Reduce Trace Volume

Use tail sampling to keep only interesting traces:

```yaml
# In otel-collector-config.production.yaml
tail_sampling:
  policies:
    - name: errors-policy
      type: status_code
      status_code: [ERROR]  # Keep all errors
    - name: latency-policy
      type: latency
      latency:
        threshold_ms: 1000   # Keep slow requests
    - name: probabilistic-policy
      type: probabilistic
      probabilistic:
        sampling_percentage: 5.0  # Sample 5% of normal traffic
```

### 2. Drop Debug Logs

```yaml
filter/drop_debug_logs:
  logs:
    log_record:
      - 'severity_number < SEVERITY_NUMBER_INFO'
```

### 3. Drop Health Check Spans

```yaml
filter/drop_health_checks:
  traces:
    span:
      - 'attributes["http.target"] == "/health"'
```

### 4. Use Compression

Ensure all exporters use gzip:

```yaml
exporters:
  otlp/traces:
    compression: gzip
```

### 5. Adjust Retention

Reduce retention in backends:

- Prometheus: 15 days (default: 15d)
- Loki: 7 days (default: 30d)
- Jaeger: 3 days (default: 7d)

---

## Security Checklist

- [ ] Use HTTPS/TLS for all external connections
- [ ] Store API keys in secrets manager (not in config files)
- [ ] Restrict CORS to actual production domains
- [ ] Disable debug endpoints (pprof, zpages)
- [ ] Run containers as non-root user
- [ ] Use network policies to isolate services
- [ ] Enable authentication on Grafana
- [ ] Use strong passwords (min 16 chars, random)
- [ ] Enable audit logging in Grafana
- [ ] Regularly rotate API keys (every 90 days)

---

## Backup and Disaster Recovery

### Data to Backup

1. **Grafana dashboards** (`grafana_data` volume)
2. **Prometheus data** (`prometheus_data` volume) - if critical
3. **OTEL Collector queues** (`otel_file_storage` volume)

### Backup Script

```bash
#!/bin/bash
# backup-observability.sh

BACKUP_DIR=/backups/observability/$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# Backup Grafana dashboards
docker cp reg-copilot-grafana:/var/lib/grafana $BACKUP_DIR/grafana

# Backup Prometheus data (optional, large)
# docker cp reg-copilot-prometheus:/prometheus $BACKUP_DIR/prometheus

echo "Backup completed: $BACKUP_DIR"
```

### Restore Process

```bash
# Stop services
docker compose -f docker-compose.yml -f docker-compose.production.yml down

# Restore Grafana
docker cp $BACKUP_DIR/grafana/. reg-copilot-grafana:/var/lib/grafana

# Restart services
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

---

## Production Checklist

Before going live:

- [ ] All environment variables set correctly
- [ ] Secrets stored in secrets manager
- [ ] TLS certificates configured
- [ ] Resource limits set appropriately
- [ ] Alerts configured in Grafana
- [ ] Backup script tested
- [ ] Health checks passing
- [ ] Load testing completed
- [ ] Security review completed
- [ ] Monitoring dashboard accessible
- [ ] On-call rotation defined
- [ ] Runbook documented

---

## Support

For issues or questions:

1. Check this guide first
2. Review SCALABILITY_REVIEW.md
3. Check OTEL Collector logs: `docker logs reg-copilot-otel-collector`
4. Open an issue on GitHub

**Logs location**:
- OTEL Collector: `docker logs reg-copilot-otel-collector`
- Prometheus: `docker logs reg-copilot-prometheus`
- Loki: `docker logs reg-copilot-loki`
- Grafana: `docker logs reg-copilot-grafana`
