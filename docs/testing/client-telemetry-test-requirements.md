# Client Telemetry Test Requirements

> **Status:** Mandatory
> **Applies to:** All changes affecting client telemetry system
> **Related:**
> - `docs/architecture/client-telemetry-architecture-v1.md`
> - `docs/client-telemetry/README.md`
> - `AGENTS.md` (Client telemetry section)

## Purpose

This document defines **mandatory test requirements** for the client telemetry system. These tests ensure that production-ready scalability features **never regress**.

**Non-negotiable rule:** Any changes to the following files require passing all tests in this document:

- `apps/demo-web/src/lib/clientTelemetry.ts`
- `apps/demo-web/src/app/api/client-telemetry/route.ts`
- Any code that creates or sends telemetry events

## Test Suite Structure

```
apps/demo-web/
├── src/
│   ├── lib/
│   │   ├── clientTelemetry.ts
│   │   └── __tests__/
│   │       └── clientTelemetry.test.ts      # Client-side batching tests
│   └── app/
│       └── api/
│           └── client-telemetry/
│               ├── route.ts
│               └── __tests__/
│                   └── route.test.ts         # Server-side tests
└── e2e/
    └── client-telemetry.spec.ts              # End-to-end integration tests
```

## Required Test Categories

### 1. Client-Side Batching Tests

**File:** `apps/demo-web/src/lib/__tests__/clientTelemetry.test.ts`

#### Test 1.1: Events Are Batched (Not Sent Individually)

**Why:** This is the core scalability feature - never regress to individual sends.

```typescript
describe('TelemetryBatchQueue - Batching', () => {
  beforeEach(() => {
    // Mock fetch and sendBeacon
    global.fetch = jest.fn();
    global.navigator.sendBeacon = jest.fn(() => true);
  });

  it('should NOT send events individually', async () => {
    const telemetry = createClientTelemetry('test', {
      maxBatchSize: 20,
      flushIntervalMs: 5000, // Long interval to test batching
    });

    // Send 10 events rapidly
    for (let i = 0; i < 10; i++) {
      telemetry.info({ index: i }, `Event ${i}`);
    }

    // Immediately check: NO network requests yet
    expect(global.fetch).not.toHaveBeenCalled();
    expect(global.navigator.sendBeacon).not.toHaveBeenCalled();

    // Events are queued, not sent individually
  });

  it('should batch events into a single request', async () => {
    const telemetry = createClientTelemetry('test', {
      maxBatchSize: 20,
      flushIntervalMs: 5000,
    });

    // Send 10 events
    for (let i = 0; i < 10; i++) {
      telemetry.info({ index: i }, `Event ${i}`);
    }

    // Manually flush
    await telemetry.flush();

    // Verify: Exactly ONE request with ALL 10 events
    expect(global.navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const blob = (global.navigator.sendBeacon as jest.Mock).mock.calls[0][1];
    const payload = JSON.parse(await blob.text());

    expect(payload.events).toHaveLength(10);
    expect(payload.events[0].message).toBe('Event 0');
    expect(payload.events[9].message).toBe('Event 9');
  });
});
```

**Failure Scenario:** If this test fails, it means events are being sent individually (regression to pre-batching behavior).

#### Test 1.2: Auto-Flush on Batch Size

```typescript
it('should auto-flush when batch size is reached', async () => {
  const telemetry = createClientTelemetry('test', {
    maxBatchSize: 5, // Small size for testing
    flushIntervalMs: 60000, // Long interval
  });

  // Send exactly 5 events
  for (let i = 0; i < 5; i++) {
    telemetry.info({ index: i }, `Event ${i}`);
  }

  // Wait for async flush
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify: Auto-flushed
  expect(global.navigator.sendBeacon).toHaveBeenCalledTimes(1);

  const blob = (global.navigator.sendBeacon as jest.Mock).mock.calls[0][1];
  const payload = JSON.parse(await blob.text());
  expect(payload.events).toHaveLength(5);
});
```

#### Test 1.3: Auto-Flush on Time Interval

```typescript
it('should auto-flush after time interval', async () => {
  jest.useFakeTimers();

  const telemetry = createClientTelemetry('test', {
    maxBatchSize: 20,
    flushIntervalMs: 2000, // 2 seconds
  });

  // Send 3 events (below batch size)
  telemetry.info({}, 'Event 1');
  telemetry.info({}, 'Event 2');
  telemetry.info({}, 'Event 3');

  // No flush yet
  expect(global.navigator.sendBeacon).not.toHaveBeenCalled();

  // Fast-forward time by 2 seconds
  jest.advanceTimersByTime(2000);

  // Wait for async operations
  await Promise.resolve();

  // Verify: Auto-flushed after interval
  expect(global.navigator.sendBeacon).toHaveBeenCalledTimes(1);

  const blob = (global.navigator.sendBeacon as jest.Mock).mock.calls[0][1];
  const payload = JSON.parse(await blob.text());
  expect(payload.events).toHaveLength(3);

  jest.useRealTimers();
});
```

#### Test 1.4: Page Unload Flush

```typescript
it('should flush on page unload (beforeunload)', () => {
  const telemetry = createClientTelemetry('test');

  // Send events
  telemetry.info({}, 'Event before unload');

  // Trigger beforeunload event
  const event = new Event('beforeunload');
  window.dispatchEvent(event);

  // Verify: sendBeacon was called (synchronous flush)
  expect(global.navigator.sendBeacon).toHaveBeenCalled();
});

it('should flush on visibility change to hidden', () => {
  const telemetry = createClientTelemetry('test');

  // Send events
  telemetry.info({}, 'Event before hide');

  // Simulate tab hidden
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    writable: true,
  });

  const event = new Event('visibilitychange');
  document.dispatchEvent(event);

  // Verify: sendBeacon was called
  expect(global.navigator.sendBeacon).toHaveBeenCalled();
});
```

### 2. Server-Side Tests

**File:** `apps/demo-web/src/app/api/client-telemetry/__tests__/route.test.ts`

#### Test 2.1: Accept Batched Events

```typescript
describe('POST /api/client-telemetry - Batch Support', () => {
  it('should accept and process batched events', async () => {
    const mockRequest = {
      json: async () => ({
        events: [
          {
            level: 'info',
            scope: 'test',
            sessionId: 'session-123',
            message: 'Event 1',
            timestamp: new Date().toISOString(),
          },
          {
            level: 'warn',
            scope: 'test',
            sessionId: 'session-123',
            message: 'Event 2',
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      headers: new Headers(),
    } as unknown as Request;

    const response = await POST(mockRequest);

    expect(response.status).toBe(204);
  });

  it('should reject invalid batch format', async () => {
    const mockRequest = {
      json: async () => ({
        events: [
          {
            // Missing required fields
            level: 'info',
            // missing message, scope, etc.
          },
        ],
      }),
      headers: new Headers(),
    } as unknown as Request;

    const response = await POST(mockRequest);

    expect(response.status).toBe(400);
  });
});
```

#### Test 2.2: Rate Limiting

```typescript
describe('POST /api/client-telemetry - Rate Limiting', () => {
  it('should enforce rate limit per IP', async () => {
    const clientIp = '192.168.1.100';

    const createRequest = () => ({
      json: async () => ({
        events: [
          {
            level: 'info',
            scope: 'test',
            sessionId: 'session-123',
            message: 'Test event',
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      headers: new Headers({
        'x-forwarded-for': clientIp,
      }),
    } as unknown as Request);

    // Send RATE_LIMIT_MAX_REQUESTS (e.g., 100) requests
    const maxRequests = parseInt(
      process.env.CLIENT_TELEMETRY_RATE_LIMIT_MAX_REQUESTS || '100'
    );

    for (let i = 0; i < maxRequests; i++) {
      const response = await POST(createRequest());
      expect(response.status).toBe(204);
    }

    // Next request should be rate limited
    const response = await POST(createRequest());
    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body.error).toContain('Rate limit exceeded');
  });

  it('should reset rate limit after window expires', async () => {
    // This test requires advancing time or using a shorter window
    // Implementation depends on test framework
  });
});
```

#### Test 2.3: OTEL Forwarding

```typescript
describe('POST /api/client-telemetry - OTEL Forwarding', () => {
  beforeEach(() => {
    // Mock fetch for OTEL endpoint
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      } as Response)
    );
  });

  it('should forward events to OTEL collector when configured', async () => {
    // Set OTEL endpoint
    process.env.OTEL_COLLECTOR_ENDPOINT = 'http://localhost:4318/v1/logs';

    const mockRequest = {
      json: async () => ({
        events: [
          {
            level: 'info',
            scope: 'test',
            sessionId: 'session-123',
            message: 'Test event',
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      headers: new Headers(),
    } as unknown as Request;

    const response = await POST(mockRequest);

    expect(response.status).toBe(204);

    // Verify OTEL forwarding was called
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4318/v1/logs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );

    // Verify OTLP format
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.resourceLogs).toBeDefined();
    expect(body.resourceLogs[0].scopeLogs).toBeDefined();
  });

  it('should not forward when OTEL endpoint is not configured', async () => {
    delete process.env.OTEL_COLLECTOR_ENDPOINT;

    const mockRequest = {
      json: async () => ({
        events: [
          {
            level: 'info',
            scope: 'test',
            sessionId: 'session-123',
            message: 'Test event',
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      headers: new Headers(),
    } as unknown as Request;

    const response = await POST(mockRequest);

    expect(response.status).toBe(204);

    // OTEL forwarding should NOT have been called
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

#### Test 2.4: Backward Compatibility

```typescript
describe('POST /api/client-telemetry - Backward Compatibility', () => {
  it('should accept legacy single-event format', async () => {
    const mockRequest = {
      json: async () => ({
        // Legacy format (no "events" array)
        level: 'info',
        scope: 'test',
        sessionId: 'session-123',
        message: 'Legacy event',
        timestamp: new Date().toISOString(),
      }),
      headers: new Headers(),
    } as unknown as Request;

    const response = await POST(mockRequest);

    expect(response.status).toBe(204);
  });
});
```

### 3. End-to-End Integration Tests

**File:** `apps/demo-web/e2e/client-telemetry.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Client Telemetry E2E', () => {
  test('should batch telemetry events in real browser', async ({ page }) => {
    // Monitor network requests
    const requests: Request[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/client-telemetry')) {
        requests.push(request);
      }
    });

    // Navigate to page
    await page.goto('/');

    // Perform actions that generate telemetry
    await page.click('button#test-action-1');
    await page.click('button#test-action-2');
    await page.click('button#test-action-3');

    // Wait for batch flush interval (2 seconds)
    await page.waitForTimeout(2500);

    // Verify: Events were batched (only 1 request)
    expect(requests.length).toBeLessThanOrEqual(1);

    if (requests.length > 0) {
      const requestBody = await requests[0].postDataJSON();
      expect(requestBody.events).toBeDefined();
      expect(requestBody.events.length).toBeGreaterThan(0);
    }
  });

  test('should flush telemetry on page unload', async ({ page }) => {
    let telemetryFlushed = false;

    page.on('request', request => {
      if (request.url().includes('/api/client-telemetry')) {
        telemetryFlushed = true;
      }
    });

    await page.goto('/');

    // Generate telemetry events
    await page.click('button#test-action');

    // Navigate away (triggers beforeunload)
    await page.goto('/other-page');

    // Verify telemetry was flushed
    expect(telemetryFlushed).toBe(true);
  });
});
```

## Running the Tests

### Local Development

```bash
# Run all client telemetry tests
cd apps/demo-web

# Unit tests
pnpm test -- clientTelemetry
pnpm test -- route.test.ts

# E2E tests
pnpm test:e2e -- client-telemetry.spec.ts
```

### CI/CD Pipeline

**Required in CI:**
```yaml
# .github/workflows/test.yml (example)
name: Test Client Telemetry

on: [push, pull_request]

jobs:
  test-client-telemetry:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Run client telemetry unit tests
        run: pnpm test -- --testPathPattern=clientTelemetry

      - name: Run server route tests
        run: pnpm test -- --testPathPattern=client-telemetry/route

      - name: Run E2E tests
        run: pnpm test:e2e -- client-telemetry.spec.ts

      # Fail if any test fails
      - name: Check test results
        if: failure()
        run: |
          echo "Client telemetry tests FAILED. Do not merge."
          exit 1
```

## Regression Detection Checklist

Before merging any PR that touches client telemetry:

### Automated Checks
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E tests pass
- [ ] No TypeScript errors in telemetry files
- [ ] No ESLint warnings in telemetry files

### Manual Verification
- [ ] Open browser DevTools Network tab
- [ ] Send multiple telemetry events
- [ ] Verify events are batched (not individual requests)
- [ ] Verify batch size matches configuration
- [ ] Refresh page and check network for beforeunload flush
- [ ] Check server logs for OTEL forwarding (if configured)
- [ ] Send 101 rapid requests, verify 429 response on 101st

### Documentation Updates
- [ ] Update `docs/client-telemetry/README.md` if behavior changed
- [ ] Update `docs/architecture/client-telemetry-architecture-v1.md` if architecture changed
- [ ] Update `AGENTS.md` if requirements changed
- [ ] Update `.env.example` files if new env vars added

## Known Limitations & Future Tests

### Not Yet Covered
- **Redis rate limiting:** When implemented, add tests for distributed rate limiting
- **Telemetry microservice:** When deployed separately, add service boundary tests
- **Error scenarios:** Network failures, OTEL collector downtime
- **Load testing:** High-volume stress tests (1000+ events/second)

### Future Test Additions
1. **Chaos engineering:** Test behavior under adverse conditions
2. **Performance benchmarks:** Automated performance regression tests
3. **Security tests:** PII leakage detection, injection attacks
4. **Compliance tests:** GDPR data retention, right to erasure

## Failure Response

### If Tests Fail in CI

**DO NOT MERGE** until:
1. Root cause is identified
2. Fix is implemented and verified
3. All tests pass
4. Manual verification completed

### If Production Regression Detected

**Immediate Response:**
1. Roll back to previous version
2. Review recent changes to telemetry code
3. Run full test suite locally
4. Create hotfix branch
5. Deploy fix with expedited review

### Escalation

If telemetry regression cannot be quickly resolved:
1. Disable client telemetry temporarily (feature flag)
2. Investigate offline
3. Create detailed incident report
4. Update test suite to prevent future occurrence

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-15 | Initial test requirements for v1.0 client telemetry |

## References

- [Client Telemetry Architecture](../architecture/client-telemetry-architecture-v1.md)
- [AGENTS.md - Client Telemetry Section](../../AGENTS.md#logging-and-observability)
- [Client Telemetry User Guide](../client-telemetry/README.md)
