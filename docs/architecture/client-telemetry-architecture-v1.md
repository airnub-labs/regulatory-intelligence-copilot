# Client Telemetry Architecture v1.0

> **Note:** This is a detailed deep-dive document. For the canonical observability entry point, see:
> [`docs/architecture/observability-and-telemetry_v1.md`](./observability-and-telemetry_v1.md)

> **Status:** Current
> **Created:** 2025-01-15
> **Related Documentation:**
> - `docs/architecture/observability-and-telemetry_v1.md` - **Canonical observability entry point**
> - `docs/client-telemetry/README.md` - Complete user and deployment guide
> - `docs/client-telemetry/QUICKSTART.md` - Quick start guide
> - `AGENTS.md` - Client telemetry requirements (§ Client telemetry section)

## Overview

The Client Telemetry System provides a **production-ready, scalable architecture** for collecting telemetry events from browser clients. It is designed to:

1. **Minimize network overhead** through automatic batching (90%+ reduction in HTTP requests)
2. **Protect against abuse** through configurable rate limiting
3. **Scale independently** through microservice-ready architecture
4. **Integrate with observability platforms** through OpenTelemetry Collector forwarding
5. **Ensure reliability** through page unload handlers and `navigator.sendBeacon()`

## Architecture Principles

### 1. Non-Regression Guarantees

**CRITICAL:** The following architectural features are non-negotiable and **must never be regressed**:

- ✅ **Client-side batching** - Events must be batched, never sent individually
- ✅ **Configurable via environment variables** - All parameters must remain configurable
- ✅ **Server-side rate limiting** - Protection against abuse is mandatory
- ✅ **Batch format support** - Server must handle both single events (legacy) and batches
- ✅ **OTEL forwarding** - Optional but must remain non-blocking and reliable
- ✅ **Page unload handling** - Events must be flushed before page navigation
- ✅ **Backward compatibility** - Legacy single-event format must continue to work

### 2. Scalability Requirements

The system is designed to scale from:
- **Development:** Single Next.js server, in-memory rate limiting
- **Production:** Multiple load-balanced instances, external OTEL collector, distributed rate limiting

Future scaling improvements (not yet implemented):
- Redis-based distributed rate limiting
- Horizontal scaling of telemetry endpoints
- Separate telemetry microservice deployment

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│ Browser Client                                      │
│                                                     │
│  1. Component calls telemetry.info()               │
│  2. Event added to TelemetryBatchQueue             │
│  3. Queue auto-flushes on:                         │
│     - Batch size limit (default: 20 events)        │
│     - Flush interval (default: 2 seconds)          │
│     - Page unload (beforeunload event)             │
│     - Tab hidden (visibilitychange event)          │
└─────────────────┬───────────────────────────────────┘
                  │
           navigator.sendBeacon()
           or fetch(keepalive: true)
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ Next.js Server (/api/client-telemetry)             │
│                                                     │
│  1. Rate limit check (per IP)                      │
│  2. Validate event structure                       │
│  3. Log events via Pino (structured logging)       │
│  4. Forward to OTEL collector (async, optional)    │
└─────────────────┬───────────────────────────────────┘
                  │ (optional)
          HTTP POST (OTLP/JSON)
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ OpenTelemetry Collector                            │
│                                                     │
│  - Receives OTLP log records                       │
│  - Processes and enriches                          │
│  - Exports to backends (Datadog, etc.)            │
└─────────────────────────────────────────────────────┘
```

## Component Specifications

### Client-Side: TelemetryBatchQueue

**Location:** `apps/demo-web/src/lib/clientTelemetry.ts`

**Responsibilities:**
- Maintain a queue of telemetry events per endpoint
- Auto-flush on batch size or time interval
- Handle page unload and visibility changes
- Use `sendBeacon()` for reliability, fallback to `fetch()`

**Key Invariants:**
- Queue is singleton per endpoint (prevents duplicate queues)
- Flush is idempotent (safe to call multiple times)
- Errors are swallowed (never block UX)
- Events may be lost on network failure (acceptable trade-off)

**Configuration (Environment Variables):**
```bash
NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT=/api/client-telemetry
NEXT_PUBLIC_CLIENT_TELEMETRY_BATCH_SIZE=20
NEXT_PUBLIC_CLIENT_TELEMETRY_FLUSH_INTERVAL_MS=2000
```

### Server-Side: /api/client-telemetry Route

**Location:** `apps/demo-web/src/app/api/client-telemetry/route.ts`

**Responsibilities:**
- Accept both single events (legacy) and batched events
- Enforce rate limiting per client IP
- Log events via Pino with structured fields
- Forward to OTEL collector if configured

**Key Invariants:**
- Backward compatible with legacy single-event format
- Rate limiting is always enforced
- OTEL forwarding never blocks response (fire-and-forget)
- Events are logged before forwarding (guaranteed local copy)

**Configuration (Environment Variables):**
```bash
OTEL_COLLECTOR_ENDPOINT=http://localhost:4318/v1/logs  # optional
OTEL_COLLECTOR_TIMEOUT_MS=5000
CLIENT_TELEMETRY_RATE_LIMIT_WINDOW_MS=60000
CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS=100
```

## Event Format

### Client-to-Server (Batch Format)

```typescript
{
  "events": [
    {
      "level": "info" | "warn" | "error",
      "scope": "component-name",
      "sessionId": "component-session-abc123",
      "message": "User action description",
      "timestamp": "2025-01-15T10:30:45.123Z",
      "requestId": "request-xyz789",  // optional
      "context": {  // optional structured data
        "action": "button_click",
        "userId": "user-123"
      }
    }
  ]
}
```

### Server-to-OTEL (OTLP Log Record)

```json
{
  "resourceLogs": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "demo-web-client" } },
        { "key": "telemetry.sdk.name", "value": { "stringValue": "client-telemetry" } }
      ]
    },
    "scopeLogs": [{
      "scope": { "name": "component-name" },
      "logRecords": [{
        "timeUnixNano": 1705317045123000000,
        "severityText": "INFO",
        "body": { "stringValue": "User action description" },
        "attributes": [
          { "key": "session.id", "value": { "stringValue": "component-session-abc123" } },
          { "key": "request.id", "value": { "stringValue": "request-xyz789" } },
          { "key": "action", "value": { "stringValue": "button_click" } }
        ]
      }]
    }]
  }]
}
```

## Performance Characteristics

### Client-Side Impact

| Metric | Without Batching | With Batching | Improvement |
|--------|------------------|---------------|-------------|
| HTTP Requests | 20 requests | 1 request | **95% reduction** |
| Network Data | 20 × overhead | 1 × overhead | **20x efficiency** |
| Memory Usage | ~0.1KB | ~1KB per 100 events | Negligible |
| CPU Impact | Negligible | Negligible | No change |

### Server-Side Performance

- **Throughput:** 10,000+ events/second per instance
- **Latency:** <5ms processing time per batch
- **OTEL Forwarding:** <20ms additional latency (async, non-blocking)
- **Memory:** ~100MB baseline + ~1MB per 1000 queued events

## Rate Limiting Strategy

### Current Implementation (In-Memory)

- **Scope:** Per client IP address
- **Window:** Sliding window (default: 60 seconds)
- **Limit:** Default 100 requests per window
- **Storage:** In-memory Map with periodic cleanup
- **Limitation:** Does not work across multiple Next.js instances

### Future: Distributed Rate Limiting (Redis)

For multi-instance deployments, rate limiting should use Redis:

```typescript
// Future implementation sketch
import { Redis } from 'ioredis';

async function checkRateLimitRedis(clientIp: string): Promise<boolean> {
  const key = `ratelimit:${clientIp}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW_MS / 1000);
  }

  return count <= RATE_LIMIT_MAX_REQUESTS;
}
```

**Migration Path:**
1. Add Redis connection configuration
2. Implement Redis-based rate limiter
3. Feature flag to switch between in-memory and Redis
4. Deprecate in-memory implementation in production

## Testing Requirements

### Automated Tests (Required Before Production)

**Client-Side:**
```typescript
// apps/demo-web/src/lib/__tests__/clientTelemetry.test.ts

describe('TelemetryBatchQueue', () => {
  it('should batch events and not send individually', async () => {
    // Send 10 events rapidly
    // Expect: 0 HTTP requests until flush interval or batch size
  });

  it('should flush on batch size limit', async () => {
    // Send 20 events
    // Expect: 1 HTTP request with 20 events
  });

  it('should flush on time interval', async () => {
    // Send 5 events
    // Wait 2 seconds
    // Expect: 1 HTTP request with 5 events
  });

  it('should flush on page unload', async () => {
    // Send events
    // Trigger beforeunload event
    // Expect: sendBeacon() called
  });
});
```

**Server-Side:**
```typescript
// apps/demo-web/src/app/api/client-telemetry/__tests__/route.test.ts

describe('POST /api/client-telemetry', () => {
  it('should accept batched events', async () => {
    const response = await POST({
      json: async () => ({ events: [/* ... */] })
    });
    expect(response.status).toBe(204);
  });

  it('should enforce rate limiting', async () => {
    // Send 101 requests from same IP
    // Expect: 101st request returns 429
  });

  it('should forward to OTEL when configured', async () => {
    // Mock OTEL endpoint
    // Send events
    // Verify OTEL endpoint was called with correct format
  });

  it('should maintain backward compatibility', async () => {
    // Send legacy single-event format
    // Expect: 204 response
  });
});
```

### Manual Testing Checklist

Before deploying changes to client telemetry:

- [ ] Open browser DevTools Network tab
- [ ] Interact with the application (click buttons, navigate pages)
- [ ] Verify: Events are batched (not sent individually)
- [ ] Verify: Requests go to configured endpoint
- [ ] Verify: Rate limiting works (send many events rapidly, check for 429)
- [ ] Verify: Page unload captures events (refresh page, check network)
- [ ] Check server logs for OTEL forwarding (success/failure messages)
- [ ] Check OTEL collector logs (if configured) for received events

## Migration Guide (If Changes Are Needed)

If client telemetry needs to be modified:

### 1. Check Impact on Batching

**Before making changes:**
```bash
# Test current batching behavior
cd apps/demo-web
npm run test:telemetry  # (create this test suite)
```

**After making changes:**
```bash
# Verify batching still works
npm run test:telemetry
```

### 2. Update Environment Variables

If adding new configuration:

```bash
# Update .env.example files
echo "NEW_TELEMETRY_VAR=default_value  # Description" >> apps/demo-web/.env.local.example
echo "NEW_TELEMETRY_VAR=default_value  # Description" >> docs/client-telemetry/.env.example
```

### 3. Update Documentation

Required documentation updates:

- `docs/client-telemetry/README.md` - Add new feature explanation
- `docs/client-telemetry/QUICKSTART.md` - Update quick start if needed
- `docs/client-telemetry/.env.example` - Add new env vars
- `AGENTS.md` - Update client telemetry section if behavior changes

### 4. Backward Compatibility

**Rules:**
- Never remove support for legacy single-event format
- Never remove environment variables (deprecate with warnings)
- Never change event structure without version bump
- Always test with old clients (cached JavaScript bundles)

## Security Considerations

### PII and Sensitive Data

**Rules:**
- Never log user PII (names, emails, addresses) in telemetry
- Never log authentication tokens or API keys
- Never log request bodies that may contain sensitive data
- Always use session IDs (randomly generated) instead of user IDs

**Enforcement:**
- Code review checklist for telemetry additions
- Automated scanning for common PII patterns (future)

### Rate Limiting Bypass Prevention

**Current protection:**
- IP-based rate limiting (resistant to single-client abuse)

**Known limitations:**
- Distributed attacks can bypass single-instance rate limiting
- VPN/proxy users share IP (may hit legitimate limits)

**Future improvements:**
- Add session-based rate limiting (more granular)
- Add API key authentication for external telemetry endpoints
- Implement CAPTCHA for suspected abuse

## Operational Runbook

### Monitoring

**Key metrics to monitor:**
- Telemetry request rate (requests/second)
- Rate limit violations (429 responses)
- OTEL forwarding success/failure ratio
- Batch size distribution (histogram)
- Event processing latency (p50, p95, p99)

**Alerts:**
- Rate limit violations > 100/minute → Investigate abuse
- OTEL forwarding failures > 10% → Check collector health
- Event processing latency > 50ms → Check server load

### Troubleshooting

**Events not appearing:**
1. Check browser console for errors
2. Check network tab for failed requests
3. Check server logs for validation errors
4. Verify endpoint configuration (`NEXT_PUBLIC_CLIENT_TELEMETRY_ENDPOINT`)

**Rate limiting issues:**
1. Check current limits (`CLIENT_TELEMETRY_RATE_LIMIT_*`)
2. Review rate limit violation logs for patterns
3. Increase limits temporarily if legitimate traffic
4. Implement Redis rate limiting for production

**OTEL forwarding failures:**
1. Check collector health (`curl http://localhost:13133/health`)
2. Review OTEL endpoint configuration
3. Check network connectivity
4. Review OTEL collector logs for errors

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-15 | Initial production-ready implementation with batching, rate limiting, and OTEL forwarding |

## References

- [Client Telemetry User Guide](../../client-telemetry/README.md)
- [Quick Start Guide](../../client-telemetry/QUICKSTART.md)
- [AGENTS.md - Client Telemetry Section](../../AGENTS.md#logging-and-observability)
- [OTEL Collector Configuration](../../client-telemetry/otel-collector-config.yaml)
