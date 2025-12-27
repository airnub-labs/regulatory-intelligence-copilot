# Client Telemetry - Quick Start Guide

Get up and running with client telemetry and OpenTelemetry Collector in 5 minutes.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ and npm
- Running Next.js application (`apps/demo-web`)

## Option 1: Basic Setup (No OTEL Collector)

The system works out of the box! No configuration needed.

```bash
# From the project root
cd apps/demo-web

# Run the Next.js app
npm run dev
```

**What you get:**
- Automatic event batching on the client
- Events sent every 2 seconds or when 20 events accumulate
- Events logged via Pino on the server
- Rate limiting (100 requests/minute per IP)

**View logs:**
```bash
# Terminal where `npm run dev` is running
```

## Option 2: With OpenTelemetry Collector (Recommended)

### Step 1: Start the OTEL Collector

```bash
# Navigate to the client-telemetry docs
cd docs/client-telemetry

# Start all services (OTEL collector, Prometheus, Grafana, Jaeger)
docker-compose up -d

# Verify services are running
docker-compose ps
```

**Services started:**
- OTEL Collector: http://localhost:4318 (HTTP), http://localhost:4317 (gRPC)
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3003 (username: `admin`, password: `admin`)
- Jaeger UI: http://localhost:16686
- Health Check: http://localhost:13133/health

### Step 2: Configure Next.js to Forward Events

```bash
# From apps/demo-web directory
cd ../../apps/demo-web

# Create or update .env.local
cat >> .env.local << 'EOF'
# Client Telemetry Configuration
OTEL_COLLECTOR_ENDPOINT=http://localhost:4318/v1/logs
OTEL_COLLECTOR_TIMEOUT_MS=5000
CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=100
CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS=60000
EOF
```

### Step 3: Start Next.js Application

```bash
# Still in apps/demo-web
npm run dev
```

### Step 4: Verify Everything Works

#### Test Event Flow

Open your browser to http://localhost:3000 and interact with the app. Then check:

**1. OTEL Collector Logs:**
```bash
# In docs/client-telemetry directory
docker-compose logs -f otel-collector
```

You should see logs like:
```
LogRecord #0
Timestamp: 2024-01-15 10:30:45
SeverityText: INFO
Body: User clicked button
Attributes:
     -> session.id: Str(my-component-session-abc123)
     -> action: Str(button_click)
```

**2. Grafana Dashboard:**

1. Open http://localhost:3003
2. Login with `admin`/`admin`
3. Go to "Explore"
4. Select "Loki" or "Prometheus" data source
5. Query for client telemetry logs

**3. Prometheus Metrics:**

1. Open http://localhost:9090
2. Go to "Graph"
3. Query: `otelcol_receiver_accepted_log_records`
4. You should see metrics for received log records

**4. Health Check:**
```bash
curl http://localhost:13133/health
# Should return: {"status":"Server available"}
```

## Configuration Reference

### Environment Variables

Create `apps/demo-web/.env.local`:

```bash
# ============================================================================
# CLIENT TELEMETRY CONFIGURATION
# ============================================================================

# --- Client-Side (NEXT_PUBLIC_ prefix required) ---

# Telemetry endpoint (default: /api/client-telemetry)
# Change this to point to external telemetry service in production
NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT=/api/client-telemetry

# Maximum events per batch before auto-flush (default: 20)
# Higher = fewer requests but more delay
NEXT_PUBLIC_CLIENT_TELEMETRY_BATCH_SIZE=20

# Flush interval in milliseconds (default: 2000 = 2 seconds)
# Higher = fewer requests but more delay
NEXT_PUBLIC_CLIENT_TELEMETRY_FLUSH_INTERVAL_MS=2000

# --- Server-Side ---

# OpenTelemetry Collector endpoint (optional)
# When set, events are forwarded to OTEL collector
OTEL_COLLECTOR_ENDPOINT=http://localhost:4318/v1/logs

# OTEL collector request timeout (default: 5000ms)
OTEL_COLLECTOR_TIMEOUT_MS=5000

# Rate limiting: window size in ms (default: 60000 = 1 minute)
CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS=60000

# Rate limiting: max requests per window per IP (default: 100)
CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=100
```

## Testing Client Telemetry

### Manual Test

Create a test page:

```typescript
// apps/demo-web/src/app/telemetry-test/page.tsx
'use client';

import { useClientTelemetry } from '@/lib/clientTelemetry';
import { useState } from 'react';

export default function TelemetryTestPage() {
  const telemetry = useClientTelemetry('telemetry-test');
  const [eventCount, setEventCount] = useState(0);

  const sendEvent = (level: 'info' | 'warn' | 'error') => {
    const count = eventCount + 1;
    setEventCount(count);

    telemetry[level](
      {
        eventNumber: count,
        timestamp: new Date().toISOString(),
        userAction: 'manual_test',
      },
      `Test ${level} event #${count}`
    );
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Client Telemetry Test</h1>

      <p className="mb-4">Events sent: {eventCount}</p>

      <div className="space-x-4">
        <button
          onClick={() => sendEvent('info')}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Send Info
        </button>

        <button
          onClick={() => sendEvent('warn')}
          className="px-4 py-2 bg-yellow-500 text-white rounded"
        >
          Send Warning
        </button>

        <button
          onClick={() => sendEvent('error')}
          className="px-4 py-2 bg-red-500 text-white rounded"
        >
          Send Error
        </button>

        <button
          onClick={() => telemetry.flush()}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Flush Now
        </button>
      </div>

      <div className="mt-8 p-4 bg-gray-100 rounded">
        <h2 className="font-bold mb-2">What to check:</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>Next.js console: Should see Pino logs</li>
          <li>OTEL Collector logs: `docker-compose logs -f otel-collector`</li>
          <li>Prometheus metrics: http://localhost:9090</li>
          <li>Grafana: http://localhost:3003</li>
        </ul>
      </div>
    </div>
  );
}
```

Visit http://localhost:3000/telemetry-test and click the buttons.

### Automated Test

```bash
# Test the telemetry endpoint directly
curl -X POST http://localhost:3000/api/client-telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "level": "info",
        "scope": "test",
        "sessionId": "test-session-123",
        "message": "Test event from curl",
        "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'",
        "context": {
          "test": true
        }
      }
    ]
  }'

# Should return 204 No Content
```

## Stopping Services

```bash
# Stop all services
cd docs/client-telemetry
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Next Steps

1. **Add More Telemetry**: Instrument your components using `useClientTelemetry()`
2. **Configure Exporters**: Edit `otel-collector-config.yaml` to send data to Datadog, Elasticsearch, etc.
3. **Set Up Alerting**: Configure Prometheus alerting rules
4. **Deploy to Production**: Follow the production deployment guide in README.md

## Troubleshooting

### Events not appearing in OTEL Collector

**Check 1:** Is the collector running?
```bash
curl http://localhost:13133/health
```

**Check 2:** Is the endpoint configured?
```bash
grep OTEL_COLLECTOR_ENDPOINT apps/demo-web/.env.local
```

**Check 3:** Check Next.js logs for errors:
```bash
# In the terminal where npm run dev is running
# Look for lines containing "OTEL collector"
```

**Check 4:** Check OTEL collector logs:
```bash
docker-compose logs otel-collector | grep -i error
```

### Rate Limiting Issues

If you're hitting rate limits during testing:

```bash
# Increase the limit temporarily
echo "CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=1000" >> apps/demo-web/.env.local

# Restart Next.js
```

### Docker Services Won't Start

**Check ports are available:**
```bash
# Check if ports are in use
lsof -i :4317  # OTLP gRPC
lsof -i :4318  # OTLP HTTP
lsof -i :9090  # Prometheus
lsof -i :3003  # Grafana
```

**Stop conflicting services or change ports in docker-compose.yml**

### High Memory Usage

If OTEL collector uses too much memory:

Edit `otel-collector-config.yaml`:
```yaml
processors:
  memory_limiter:
    limit_mib: 256  # Reduce from 512
    spike_limit_mib: 64  # Reduce from 128
```

Then restart:
```bash
docker-compose restart otel-collector
```

## Support

For more details, see:
- [Complete Documentation](./README.md)
- [OTEL Collector Config](./otel-collector-config.yaml)
- [Docker Compose Setup](./docker-compose.yml)

For issues:
- Check logs: `docker-compose logs`
- Check health: `curl http://localhost:13133/health`
- Open an issue in the project repository
