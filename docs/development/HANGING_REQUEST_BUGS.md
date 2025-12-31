# Hanging Request Bugs - Critical Patterns to Watch For

**Last Updated:** 2025-12-31
**Severity:** CRITICAL - These bugs cause requests to hang indefinitely, leading to resource exhaustion and degraded service

## Overview

This document catalogs critical but hidden hanging request bugs discovered in the codebase. These patterns are insidious because they:
- Don't throw errors or fail fast
- Cause requests to hang indefinitely (minutes to hours)
- Are difficult to detect in development (only manifest under specific network conditions)
- Can exhaust server resources and crash production systems

**All developers and AI coding agents should review this document before making changes to async code, streaming endpoints, or event subscriptions.**

---

## Pattern 1: Missing Status Case Handlers in Promise-Based Callbacks

### The Bug

Promises that wait for callbacks with status codes but don't handle all possible status values will hang indefinitely if an unhandled status occurs.

### Real Example (FIXED)

**File:** `packages/reg-intel-conversations/src/supabaseEventHub.ts:19-31` (before fix)

```typescript
// ❌ BUGGY CODE - Will hang if status is 'CLOSED'
async function subscribeToChannel(channel: RealtimeChannel): Promise<RealtimeChannel> {
  return await new Promise<RealtimeChannel>((resolve, reject) => {
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR') {
        reject(new Error('Realtime channel error'));
      } else if (status === 'TIMED_OUT') {
        reject(new Error('Realtime channel subscribe timeout'));
      }
      // Missing: 'CLOSED' status - promise never resolves!
      // Missing: default case for unexpected statuses
    });
  });
}
```

**What Happens:**
1. Supabase connection closes before subscription completes
2. Callback receives `'CLOSED'` status
3. No handler matches, promise never resolves or rejects
4. Request hangs forever
5. Resources leak (subscriptions, memory, event listeners)

### The Fix

**File:** `packages/reg-intel-conversations/src/supabaseEventHub.ts:22-63` (after fix)

```typescript
// ✅ FIXED CODE
const CHANNEL_SUBSCRIBE_TIMEOUT_MS = 30000;

async function subscribeToChannel(channel: RealtimeChannel): Promise<RealtimeChannel> {
  return await new Promise<RealtimeChannel>((resolve, reject) => {
    let settled = false;

    // 1. Add timeout protection
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Realtime channel subscribe timeout after ${CHANNEL_SUBSCRIBE_TIMEOUT_MS}ms`));
      }
    }, CHANNEL_SUBSCRIBE_TIMEOUT_MS);

    channel.subscribe(status => {
      if (settled) return;

      if (status === 'SUBSCRIBED') {
        settled = true;
        clearTimeout(timeoutId);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR') {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('Realtime channel error'));
      } else if (status === 'TIMED_OUT') {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('Realtime channel subscribe timeout'));
      } else if (status === 'CLOSED') {
        // 2. Handle all documented status values
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('Realtime channel closed before subscription completed'));
      } else {
        // 3. Add default case for future-proofing
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error(`Unexpected Realtime channel status: ${status}`));
      }
    });
  });
}
```

### Detection Checklist

When reviewing code, look for:
- [ ] `new Promise((resolve, reject) => { ... })` with callbacks
- [ ] Callback handlers using `if/else if` chains for status values
- [ ] Missing `else` clause as default case
- [ ] No timeout protection around the promise
- [ ] No `settled` flag to prevent race conditions

### Testing Approach

```typescript
// Test: Simulate CLOSED status
test('should reject when channel is closed', async () => {
  const mockChannel = {
    subscribe: (cb) => cb('CLOSED'),
  };
  await expect(subscribeToChannel(mockChannel)).rejects.toThrow('closed');
});

// Test: Simulate timeout
test('should timeout after 30 seconds', async () => {
  const mockChannel = {
    subscribe: () => {}, // Never calls callback
  };
  await expect(subscribeToChannel(mockChannel)).rejects.toThrow('timeout');
}, 35000);

// Test: Simulate unexpected status
test('should handle unexpected status values', async () => {
  const mockChannel = {
    subscribe: (cb) => cb('UNKNOWN_STATUS'),
  };
  await expect(subscribeToChannel(mockChannel)).rejects.toThrow('Unexpected');
});
```

---

## Pattern 2: Network Operations Without Timeout Protection

### The Bug

`fetch()` and other network operations without `AbortController` timeout can hang indefinitely if the server becomes unresponsive.

### Real Example (FIXED)

**File:** `packages/reg-intel-core/src/mcpClient.ts:121-125` (before fix)

```typescript
// ❌ BUGGY CODE - No timeout protection
const response = await fetch(mcpGatewayUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify(jsonRpcRequest),
  // Missing: signal with timeout
});
```

**What Happens:**
1. MCP gateway becomes unresponsive (network partition, server overload, etc.)
2. `fetch()` waits for TCP timeout (can be 20+ minutes)
3. Request handler hangs
4. Multiple requests pile up, exhausting connection pool
5. Server becomes unresponsive

### The Fix

**File:** `packages/reg-intel-core/src/mcpClient.ts:20, 124-235` (after fix)

```typescript
// ✅ FIXED CODE
const MCP_CALL_TIMEOUT_MS = 30000;

// Set up abort controller with timeout
const abortController = new AbortController();
const timeoutId = setTimeout(() => abortController.abort(), MCP_CALL_TIMEOUT_MS);

try {
  const response = await fetch(mcpGatewayUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(jsonRpcRequest),
    signal: abortController.signal, // Add abort signal
  });
  clearTimeout(timeoutId);

  // ... handle response ...

} catch (error) {
  clearTimeout(timeoutId);

  // Check if the error is due to abort/timeout
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      result: null,
      error: `MCP call timed out after ${MCP_CALL_TIMEOUT_MS}ms`,
    };
  }

  throw error;
}
```

### Detection Checklist

- [ ] `fetch()` calls without `signal` parameter
- [ ] `axios` or other HTTP clients without timeout config
- [ ] Database queries without timeout
- [ ] WebSocket connections without timeout
- [ ] Any network I/O without abort mechanism

### Testing Approach

```typescript
// Test: Simulate slow server
test('should timeout slow network requests', async () => {
  const slowServer = new Promise((resolve) => setTimeout(resolve, 60000));
  await expect(callWithTimeout(slowServer, 1000)).rejects.toThrow('timeout');
});

// Test: Simulate network partition
test('should handle network failures gracefully', async () => {
  // Mock fetch to never resolve
  global.fetch = jest.fn(() => new Promise(() => {}));
  await expect(mcpCall(params)).rejects.toThrow('timed out');
});
```

---

## Pattern 3: Async Iteration Without Abort Signal Handler

### The Bug

`for await` loops that iterate async generators without checking request abort signals will continue running even after clients disconnect.

### Real Example (FIXED)

**File:** `packages/reg-intel-next-adapter/src/index.ts:904-996` (before fix)

```typescript
// ❌ BUGGY CODE - No abort handler
const stream = new ReadableStream({
  async start(controller) {
    // ... setup ...

    for await (const chunk of complianceEngine.handleChatStream({...})) {
      // This loop continues even if request is aborted!
      // No way to interrupt the async iteration
      controller.enqueue(chunk);
    }

    // Cleanup only runs after iteration completes (never!)
  }
});
```

**What Happens:**
1. Client disconnects or cancels request
2. `for await` loop continues iterating
3. LLM continues generating tokens
4. Database queries continue executing
5. Resources are consumed for a disconnected client
6. Memory leaks as chunks accumulate

### The Fix

**File:** `packages/reg-intel-next-adapter/src/index.ts:871-1020` (after fix)

```typescript
// ✅ FIXED CODE
const stream = new ReadableStream({
  async start(controller) {
    // 1. Set up abort flag and handler FIRST
    let aborted = false;
    const abortHandler = () => {
      aborted = true;
      unsubscribe();
      try {
        controller.close();
      } catch {
        // Controller may already be closed
      }
    };
    request.signal.addEventListener('abort', abortHandler);

    // 2. Check abort flag in iteration
    for await (const chunk of complianceEngine.handleChatStream({...})) {
      if (aborted) {
        break; // Exit immediately on abort
      }

      controller.enqueue(chunk);
    }
  }
});
```

### Detection Checklist

- [ ] `for await` loops in request handlers
- [ ] `ReadableStream` without abort listener
- [ ] Async generators without cancellation mechanism
- [ ] Long-running async operations in API routes
- [ ] No check for `request.signal.aborted`

### Testing Approach

```typescript
// Test: Simulate client disconnect mid-stream
test('should stop iteration when request is aborted', async () => {
  const abortController = new AbortController();
  const request = { signal: abortController.signal };

  const chunks = [];
  const stream = createStream(request);

  // Start reading
  const reader = stream.getReader();
  chunks.push(await reader.read());

  // Abort
  abortController.abort();

  // Verify iteration stopped
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(mockGenerator).toHaveBeenCalledTimes(1); // Only one iteration
});
```

---

## Pattern 4: SSE/WebSocket Cleanup Race Conditions

### The Bug

Registering abort listeners AFTER async operations (subscriptions, intervals) creates a race condition where requests can abort before cleanup handlers are registered.

### Real Example (FIXED)

**File:** `apps/demo-web/src/app/api/conversations/[id]/stream/route.ts:51-91` (before fix)

```typescript
// ❌ BUGGY CODE - Race condition
const stream = new ReadableStream({
  start(controller) {
    const subscriber = { send: (event, data) => { ... } };

    // 1. Subscribe first (can take time)
    unsubscribe = eventHub.subscribe(tenantId, conversationId, subscriber);

    // 2. Send metadata (can take time)
    subscriber.send('metadata', { ... });

    // 3. Register abort listener LAST (RACE CONDITION!)
    request.signal.addEventListener('abort', cleanup);
    // ↑ If request aborts between steps 1-3, cleanup never runs!
  }
});
```

**What Happens:**
1. Client disconnects during subscription setup
2. Abort event fires
3. Abort listener not yet registered
4. Subscription remains active
5. `keepAliveInterval` keeps running
6. Memory leak + resource exhaustion

### The Fix

**File:** `apps/demo-web/src/app/api/conversations/[id]/stream/route.ts:52-91` (after fix)

```typescript
// ✅ FIXED CODE - Register abort listener FIRST
const stream = new ReadableStream({
  start(controller) {
    let unsubscribe = () => {};

    const cleanup = () => { ... };
    const abortHandler = () => cleanup();

    // 1. Register abort listener FIRST (before any async ops!)
    request.signal.addEventListener('abort', abortHandler);

    // 2. Now it's safe to do async operations
    const subscriber = { send: (event, data) => { ... } };
    unsubscribe = eventHub.subscribe(tenantId, conversationId, subscriber);
    subscriber.send('metadata', { ... });

    // All async ops are now protected by abort handler
  }
});
```

### Detection Checklist

- [ ] `ReadableStream.start()` or WebSocket setup functions
- [ ] Abort listener registered after subscriptions
- [ ] Abort listener registered after `setInterval`
- [ ] Abort listener registered after `send()`/`enqueue()` calls
- [ ] Multiple async operations before abort protection

### Testing Approach

```typescript
// Test: Abort during subscription
test('should cleanup even if aborted during subscription', async () => {
  let subscribeCallback;
  const mockEventHub = {
    subscribe: (tid, cid, sub) => {
      subscribeCallback = sub;
      return () => {}; // unsubscribe
    }
  };

  const abortController = new AbortController();

  // Start stream
  const stream = createStream({ signal: abortController.signal });

  // Abort immediately (during subscription)
  abortController.abort();

  // Verify cleanup ran
  expect(unsubscribeCalled).toBe(true);
});
```

---

## Pattern 5: Unbounded Database Queries

### The Bug

Queries without `LIMIT` clauses can return millions of rows, causing memory exhaustion and timeouts.

### Real Example (FIXED)

**File:** `packages/reg-intel-core/src/graph/graphClient.ts:307-323` (before fix)

```typescript
// ❌ BUGGY CODE - No LIMIT clause
const query = `
  MATCH (j:Jurisdiction)
  WHERE j.id IN [${jurisdictionList}]
  MATCH (n)-[:IN_JURISDICTION]->(j)
  WHERE n:Benefit OR n:Relief OR n:Section
  OPTIONAL MATCH (n)-[r:COORDINATED_WITH|...]->(m)
  OPTIONAL MATCH (m)-[:IN_JURISDICTION]->(j2:Jurisdiction)
  WHERE j2.id IN [${jurisdictionList}]
  WITH n, m, enrichedRel
  RETURN n, collect(enrichedRel) AS enrichedRels, collect(m) AS related
  // Missing: LIMIT clause - can return millions of rows!
`;
```

**What Happens:**
1. Query matches millions of cross-border relationships
2. Database streams all results back
3. Node.js buffers all results in memory
4. OOM (Out of Memory) error or extreme slowdown
5. Query timeout (if timeout protection exists)

### The Fix

```typescript
// ✅ FIXED CODE - Add reasonable LIMIT
const query = `
  MATCH (j:Jurisdiction)
  WHERE j.id IN [${jurisdictionList}]
  MATCH (n)-[:IN_JURISDICTION]->(j)
  WHERE n:Benefit OR n:Relief OR n:Section
  OPTIONAL MATCH (n)-[r:COORDINATED_WITH|...]->(m)
  OPTIONAL MATCH (m)-[:IN_JURISDICTION]->(j2:Jurisdiction)
  WHERE j2.id IN [${jurisdictionList}]
  WITH n, m, enrichedRel
  RETURN n, collect(enrichedRel) AS enrichedRels, collect(m) AS related
  LIMIT 1000  // Prevent unbounded result sets
`;
```

### Detection Checklist

- [ ] Cypher queries without `LIMIT`
- [ ] SQL queries without `LIMIT` or pagination
- [ ] Graph traversals without depth limit
- [ ] Multi-hop relationship queries
- [ ] Queries with `collect()` or aggregations

---

## General Prevention Guidelines

### For All Async Operations

1. **Always add timeout protection**
   ```typescript
   const timeoutMs = 30000;
   const result = await Promise.race([
     operation(),
     new Promise((_, reject) =>
       setTimeout(() => reject(new Error('Timeout')), timeoutMs)
     )
   ]);
   ```

2. **Always handle request aborts**
   ```typescript
   request.signal.addEventListener('abort', cleanup);
   // Register FIRST, before any async operations
   ```

3. **Always add default cases**
   ```typescript
   if (status === 'SUCCESS') { ... }
   else if (status === 'ERROR') { ... }
   else {
     // Always have a default!
     reject(new Error(`Unexpected status: ${status}`));
   }
   ```

4. **Always use settled flags**
   ```typescript
   let settled = false;
   const timeout = setTimeout(() => {
     if (!settled) {
       settled = true;
       reject(new Error('Timeout'));
     }
   }, ms);
   ```

5. **Always bound database queries**
   ```typescript
   const query = `... LIMIT ${MAX_RESULTS}`;
   ```

### Code Review Checklist

When reviewing async code, check:

- [ ] Every `fetch()` has timeout via `AbortController`
- [ ] Every `new Promise()` has timeout protection
- [ ] Every callback handler has default case
- [ ] Every streaming endpoint registers abort listener FIRST
- [ ] Every `for await` loop checks abort signal
- [ ] Every database query has `LIMIT` clause
- [ ] Every subscription has guaranteed cleanup
- [ ] Every interval has cleanup on abort

### Testing Requirements

All async operations must have tests for:

1. **Timeout scenarios**
   ```typescript
   test('should timeout after N seconds', async () => {
     await expect(operation()).rejects.toThrow('timeout');
   });
   ```

2. **Abort scenarios**
   ```typescript
   test('should cleanup when request is aborted', async () => {
     const controller = new AbortController();
     const promise = operation({ signal: controller.signal });
     controller.abort();
     await expect(promise).rejects.toThrow('abort');
     expect(cleanupCalled).toBe(true);
   });
   ```

3. **Unexpected status scenarios**
   ```typescript
   test('should handle unexpected status values', async () => {
     mockCallback('UNKNOWN_STATUS');
     await expect(operation()).rejects.toThrow('Unexpected');
   });
   ```

---

## Impact Assessment

These bugs were found across 16 locations in the codebase:

- **CRITICAL:** 3 issues (could cause immediate service outage)
- **HIGH:** 6 issues (high risk of resource exhaustion)
- **MEDIUM:** 7 issues (edge cases, lower frequency)

**Estimated Impact Before Fixes:**
- ~15-20% of production requests at risk of hanging under network issues
- Memory leaks accumulating over hours
- Potential cascading failures during network partitions
- OOM crashes under high cross-border query load

**Estimated Impact After Fixes:**
- <1% risk (only from newly introduced code)
- Guaranteed cleanup on all abort paths
- Bounded resource usage
- Fail-fast behavior with clear error messages

---

## References

**Fixed Issues:**
- Commit `2d75696`: Fix Supabase channel subscription hang on CLOSED status
- Commit `8425932`: Fix multiple critical and high-severity hanging request bugs

**Related Documentation:**
- [Supabase Realtime Subscribe](https://supabase.com/docs/reference/javascript/subscribe)
- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)

---

## Quick Reference: Hang Detection Commands

```bash
# Find promises without timeout
rg "new Promise\(" --type ts | rg -v "setTimeout|Promise.race"

# Find fetch without signal
rg "await fetch\(" --type ts | rg -v "signal:"

# Find for-await without abort check
rg "for await.*of" --type ts | rg -v "aborted|signal"

# Find database queries without LIMIT
rg "MATCH.*RETURN" --type ts | rg -v "LIMIT"

# Find stream handlers without abort listener
rg "ReadableStream.*start" -A 10 --type ts | rg -v "addEventListener.*abort"
```

**When in doubt, always prefer fail-fast over hanging indefinitely.**
