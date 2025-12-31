# Insidious Bug Patterns - Critical Issues to Watch For

**Last Updated:** 2025-12-31
**Status:** Active - This document is continuously updated as new patterns are discovered

## Overview

This document catalogs **critical but hidden bugs** discovered in the codebase. These patterns are insidious because they:
- Don't throw errors or fail fast
- Only manifest under specific conditions (load, network issues, time, concurrent access)
- Are difficult to detect in development and code review
- Can cause production outages, data corruption, or security breaches

**All developers and AI coding agents MUST review this document before making changes.**

---

## Table of Contents

**Part I: Hanging Request Bugs**
1. [Missing Status Case Handlers](#pattern-1-missing-status-case-handlers-in-promise-based-callbacks)
2. [Network Operations Without Timeout](#pattern-2-network-operations-without-timeout-protection)
3. [Async Iteration Without Abort Signal](#pattern-3-async-iteration-without-abort-signal-handler)
4. [SSE/WebSocket Cleanup Race Conditions](#pattern-4-ssewebsocket-cleanup-race-conditions)
5. [Unbounded Database Queries](#pattern-5-unbounded-database-queries)

**Part II: Memory Leaks**
6. [Unbounded Map/Object Growth in Singletons](#pattern-6-unbounded-mapobject-growth-in-singletons)
7. [Event Listeners Never Removed](#pattern-7-event-listeners-never-removed)
8. [Interval Timers Never Cleared](#pattern-8-interval-timers-never-cleared)

**Part III: Security Vulnerabilities**
9. [Cypher/SQL Injection](#pattern-9-cyphersql-injection)
10. [Missing Input Validation](#pattern-10-missing-input-validation)
11. [Secrets in Logs](#pattern-11-secrets-in-logs)

**Part IV: Concurrency Bugs**
12. [Race Conditions in Shared State](#pattern-12-race-conditions-in-shared-state)
13. [Order-Dependent Initialization](#pattern-13-order-dependent-initialization)

**Part V: Type Coercion & Data Bugs**
14. [Missing Radix in parseInt()](#pattern-14-missing-radix-in-parseint)
15. [Date/Timezone Confusion](#pattern-15-datetimezone-confusion)
16. [Truthy/Falsy Gotchas](#pattern-16-truthyfalsy-gotchas)

**Part VI: Silent Failures**
17. [Empty Catch Blocks](#pattern-17-empty-catch-blocks)
18. [Missing Error Propagation](#pattern-18-missing-error-propagation)

---

# Part I: Hanging Request Bugs

## Pattern 1: Missing Status Case Handlers in Promise-Based Callbacks

### Severity: CRITICAL
### Status: FIXED (Commit 2d75696)

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
      // Missing: timeout protection
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

- [ ] `new Promise((resolve, reject) => { ... })` with callbacks
- [ ] Callback handlers using `if/else if` chains for status values
- [ ] Missing `else` clause as default case
- [ ] No timeout protection around the promise
- [ ] No `settled` flag to prevent race conditions

### Testing Approach

```typescript
test('should reject when channel is closed', async () => {
  const mockChannel = { subscribe: (cb) => cb('CLOSED') };
  await expect(subscribeToChannel(mockChannel)).rejects.toThrow('closed');
});

test('should timeout after 30 seconds', async () => {
  const mockChannel = { subscribe: () => {} }; // Never calls callback
  await expect(subscribeToChannel(mockChannel)).rejects.toThrow('timeout');
}, 35000);

test('should handle unexpected status values', async () => {
  const mockChannel = { subscribe: (cb) => cb('UNKNOWN_STATUS') };
  await expect(subscribeToChannel(mockChannel)).rejects.toThrow('Unexpected');
});
```

---

## Pattern 2: Network Operations Without Timeout Protection

### Severity: CRITICAL
### Status: FIXED (Commit 8425932)

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

---

## Pattern 3: Async Iteration Without Abort Signal Handler

### Severity: CRITICAL
### Status: FIXED (Commit 8425932)

### The Bug

`for await` loops that iterate async generators without checking request abort signals will continue running even after clients disconnect.

### Real Example (FIXED)

**File:** `packages/reg-intel-next-adapter/src/index.ts:904-996` (before fix)

```typescript
// ❌ BUGGY CODE - No abort handler
const stream = new ReadableStream({
  async start(controller) {
    for await (const chunk of complianceEngine.handleChatStream({...})) {
      // This loop continues even if request is aborted!
      controller.enqueue(chunk);
    }
  }
});
```

**What Happens:**
1. Client disconnects or cancels request
2. `for await` loop continues iterating
3. LLM continues generating tokens
4. Database queries continue executing
5. Resources are consumed for a disconnected client

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

---

## Pattern 4: SSE/WebSocket Cleanup Race Conditions

### Severity: HIGH
### Status: FIXED (Commit 8425932)

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
5. Memory leak + resource exhaustion

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
  }
});
```

---

## Pattern 5: Unbounded Database Queries

### Severity: HIGH
### Status: FIXED (Commit 8425932)

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
  RETURN n, collect(enrichedRel) AS enrichedRels, collect(m) AS related
  // Missing: LIMIT clause - can return millions of rows!
`;
```

### The Fix

```typescript
// ✅ FIXED CODE - Add reasonable LIMIT
const query = `
  ...
  RETURN n, collect(enrichedRel) AS enrichedRels, collect(m) AS related
  LIMIT 1000  // Prevent unbounded result sets
`;
```

---

# Part II: Memory Leaks

## Pattern 6: Unbounded Map/Object Growth in Singletons

### Severity: HIGH
### Status: ACTIVE BUG - Needs immediate fix

### The Bug

Singleton objects with Maps or Records that grow indefinitely without cleanup will cause memory leaks and eventual OOM crashes in long-running production servers.

### Real Example (CURRENT BUG)

**File:** `apps/demo-web/src/lib/metrics/businessMetrics.ts:38-48, 73-74, 125-126`

```typescript
// ❌ CURRENT BUG - Unbounded growth
class BusinessMetrics {
  private apiCallsByHour: Record<string, number> = {}  // New key EVERY hour!
  private peakHours: Record<string, number> = {}        // Never cleaned up!
  private userActivity: Map<string, UserActivity> = new Map()  // Grows forever!
  private apiCalls: Record<string, ApiCallRecord> = {}  // One per endpoint!

  recordApiCall(endpoint: string) {
    const hour = new Date().toISOString().slice(0, 13); // "2025-12-31T05"
    this.apiCallsByHour[hour] = (this.apiCallsByHour[hour] || 0) + 1;
    // ↑ Creates new key every hour, never pruned
  }

  recordUserActivity(userId: string) {
    this.userActivity.set(userId, { ... });
    // ↑ Grows with every unique user, NEVER cleared
  }
}
```

**What Happens:**
1. Server runs for months
2. `apiCallsByHour` creates 720 keys per month (24 hours × 30 days)
3. `userActivity` grows to 100k+ entries for active sites
4. Each entry is ~500 bytes
5. After 6 months: 50MB+ leak
6. After 1 year: OOM crash

**Also Affected:**
- `apps/demo-web/src/lib/metrics/systemMetrics.ts:51-67` - Same pattern
- `apps/demo-web/src/lib/clientTelemetry.ts:245` - Global Map never pruned

### The Fix

```typescript
// ✅ RECOMMENDED FIX - Add cleanup and bounds
const MAX_HOUR_KEYS = 168; // Keep last 7 days
const MAX_USER_ENTRIES = 10000; // Limit concurrent users

recordApiCall(endpoint: string) {
  const hour = new Date().toISOString().slice(0, 13);
  this.apiCallsByHour[hour] = (this.apiCallsByHour[hour] || 0) + 1;

  // Prune old hours
  const hours = Object.keys(this.apiCallsByHour).sort();
  if (hours.length > MAX_HOUR_KEYS) {
    const toDelete = hours.slice(0, hours.length - MAX_HOUR_KEYS);
    toDelete.forEach(h => delete this.apiCallsByHour[h]);
  }
}

recordUserActivity(userId: string) {
  // Use LRU cache instead of unbounded Map
  if (this.userActivity.size >= MAX_USER_ENTRIES) {
    const firstKey = this.userActivity.keys().next().value;
    this.userActivity.delete(firstKey);
  }
  this.userActivity.set(userId, { ... });
}
```

### Detection Checklist

- [ ] Singleton classes with `Map<string, any>` fields
- [ ] Records/objects where keys are time-based (hours, days, etc.)
- [ ] Maps keyed by user IDs or session IDs
- [ ] No cleanup logic or `delete` calls
- [ ] No max size limits

### Testing Approach

```typescript
test('should prune old hour keys', () => {
  const metrics = new BusinessMetrics();

  // Record calls for 200 hours
  for (let i = 0; i < 200; i++) {
    const hour = new Date(Date.now() - i * 3600000).toISOString().slice(0, 13);
    metrics.recordApiCallForHour(hour);
  }

  // Should only keep last 168 hours
  expect(Object.keys(metrics.getApiCallsByHour()).length).toBeLessThanOrEqual(168);
});
```

---

## Pattern 7: Event Listeners Never Removed

### Severity: MEDIUM
### Status: MOSTLY FIXED - Verify all useEffect cleanups

### The Bug

Event listeners registered without cleanup in long-lived components cause memory leaks.

### Good Example (CORRECT)

**File:** `apps/demo-web/src/components/GraphVisualization.tsx:160-173`

```typescript
// ✅ CORRECT - Listener IS cleaned up
useEffect(() => {
  const updateDimensions = () => { ... };
  window.addEventListener('resize', updateDimensions);

  return () => window.removeEventListener('resize', updateDimensions);
  // ↑ Cleanup function properly removes listener
}, []);
```

### Detection Checklist

- [ ] `addEventListener` without corresponding `removeEventListener`
- [ ] `useEffect` without cleanup return function
- [ ] Global event listeners in components

---

## Pattern 8: Interval Timers Never Cleared

### Severity: MEDIUM
### Status: CURRENT BUG in clientTelemetry

### The Bug

`setInterval` timers that run forever without cleanup.

### Real Example (CURRENT BUG)

**File:** `apps/demo-web/src/lib/clientTelemetry.ts:245, 157`

```typescript
// ❌ PARTIAL BUG - Map never pruned
const batchQueues = new Map<string, TelemetryBatchQueue>();

function getOrCreateQueue(endpoint: string): TelemetryBatchQueue {
  let queue = batchQueues.get(endpoint);
  if (!queue) {
    queue = {
      events: [],
      timer: setInterval(() => flushBatch(endpoint), 5000),
      // ↑ Timer runs forever, even if endpoint stops being used
    };
    batchQueues.set(endpoint, queue);
    // ↑ Map never cleared, timers never stopped for old endpoints
  }
  return queue;
}
```

**What Happens:**
1. New endpoint used → new timer created
2. Endpoint stops being used
3. Timer keeps running every 5 seconds
4. After months: hundreds of timers running
5. CPU usage creeps up

### The Fix

```typescript
// ✅ RECOMMENDED FIX - Add cleanup
const ENDPOINT_IDLE_TIMEOUT = 3600000; // 1 hour

function pruneIdleQueues() {
  const now = Date.now();
  for (const [endpoint, queue] of batchQueues.entries()) {
    if (now - queue.lastUsed > ENDPOINT_IDLE_TIMEOUT) {
      clearInterval(queue.timer);
      batchQueues.delete(endpoint);
    }
  }
}

// Run cleanup periodically
setInterval(pruneIdleQueues, 600000); // Every 10 minutes
```

---

# Part III: Security Vulnerabilities

## Pattern 9: Cypher/SQL Injection

### Severity: MEDIUM (Defense in depth issue)
### Status: PARTIAL - escapeCypher() used but pattern is fragile

### The Bug

Using string interpolation for database queries makes it easy to forget escaping, leading to injection vulnerabilities.

### Real Example (CURRENT PATTERN)

**File:** `packages/reg-intel-core/src/graph/graphClient.ts:209-210`

```typescript
// ⚠️ FRAGILE PATTERN - Easy to forget escaping
const query = `
  MATCH (p:ProfileTag {id: '${escapeCypher(profileId)}'})
  MATCH (j:Jurisdiction {id: '${escapeCypher(jurisdictionId)}'})
  ...
`;
```

**Issue:**
- Must remember to use `escapeCypher()` every time
- No TypeScript protection against forgetting
- If developer uses `${profileId}` instead, injection possible

**Better Pattern:**

```typescript
// ✅ SAFER - Use parameterized queries
const query = `
  MATCH (p:ProfileTag {id: $profileId})
  MATCH (j:Jurisdiction {id: $jurisdictionId})
  ...
`;

const result = await runMemgraphQuery(query, {
  profileId,
  jurisdictionId,
});
```

### CRITICAL VULNERABILITY (CURRENT)

**File:** `packages/reg-intel-graph/src/graphWriteService.ts:273-274, 281, 283`

```typescript
// ❌ CRITICAL BUG - Node label inserted WITHOUT escaping!
const cypher = `MERGE (n:${nodeLabel} {id: $id}) SET n += {${propString}}`;
                         ↑ No validation or escaping!
```

**Exploit:**
```typescript
const nodeLabel = "Benefit) DETACH DELETE (n) //";
// Resulting query: MERGE (n:Benefit) DETACH DELETE (n) // {id: $id}) SET n += {...}
// ↑ Deletes all nodes!
```

**Fix:**

```typescript
// ✅ FIXED - Validate against whitelist
const ALLOWED_LABELS = ['Benefit', 'Relief', 'Section', 'Jurisdiction', 'ProfileTag'];

if (!ALLOWED_LABELS.includes(nodeLabel)) {
  throw new Error(`Invalid node label: ${nodeLabel}`);
}

const cypher = `MERGE (n:${nodeLabel} {id: $id}) SET n += {${propString}}`;
```

### Detection Checklist

- [ ] String interpolation in database queries
- [ ] No escaping function used
- [ ] User input in query strings
- [ ] Node labels or property names from user input
- [ ] Missing whitelist validation

---

## Pattern 10: Missing Input Validation

### Severity: MEDIUM
### Status: CURRENT GAPS

### The Bug

Accepting user input without validation can lead to crashes, injection, or data corruption.

### Real Example (CURRENT BUG)

**File:** `apps/demo-web/src/app/api/conversations/[id]/messages/[messageId]/route.ts:193-200`

```typescript
// ❌ NO VALIDATION - User can inject any metadata
const updatedMetadata = {
  ...existingMetadata,
  ...body.metadata,  // ← User-controlled, no validation!
  updatedAt: new Date().toISOString(),
  updatedBy: userId,
};
```

**Risks:**
- User could inject HTML/JS that gets rendered client-side
- Could override `updatedBy` if object spread order changed
- Could inject internal fields like `__proto__`

**Fix:**

```typescript
// ✅ FIXED - Validate against whitelist
const ALLOWED_METADATA_KEYS = [
  'agentUsed',
  'jurisdictions',
  'uncertaintyLevel',
  'referencedNodes',
];

const validatedMetadata = {};
for (const key of Object.keys(body.metadata || {})) {
  if (ALLOWED_METADATA_KEYS.includes(key)) {
    validatedMetadata[key] = body.metadata[key];
  }
}

const updatedMetadata = {
  ...existingMetadata,
  ...validatedMetadata,
  updatedAt: new Date().toISOString(),
  updatedBy: userId, // Always last to prevent override
};
```

### Another Example (CURRENT BUG)

**File:** `apps/demo-web/src/app/page.tsx:112, apps/demo-web/src/components/GraphVisualization.tsx:447`

```typescript
// ❌ NO TRY-CATCH - Will crash if JSON is invalid
return JSON.parse(value);
const data = JSON.parse(event.data);
```

**Fix:**

```typescript
// ✅ FIXED - Wrap in try-catch
try {
  return JSON.parse(value);
} catch {
  return null; // or default value
}
```

---

## Pattern 11: Secrets in Logs

### Severity: LOW
### Status: NO CURRENT ISSUES FOUND

### The Bug

Logging request bodies, headers, or error messages that contain secrets.

### Good Example (CORRECT)

The codebase correctly avoids this in most places. Continue to:
- Never log request bodies in auth endpoints
- Sanitize error messages before logging
- Use redaction in observability stack

---

# Part IV: Concurrency Bugs

## Pattern 12: Race Conditions in Shared State

### Severity: MEDIUM
### Status: CURRENT BUG - Multiple locations

### The Bug

Async methods that modify shared Maps/objects without locking can cause race conditions when multiple requests execute concurrently.

### Real Example (CURRENT BUG)

**File:** `packages/reg-intel-conversations/src/executionContextStores.ts:169-170, 195-196`

```typescript
// ❌ CURRENT BUG - No synchronization
class InMemoryExecutionContextStore {
  private contexts = new Map<string, ExecutionContext>();
  private pathIndex = new Map<string, string>(); // pathKey -> contextId

  async createContext(input: CreateExecutionContextInput): Promise<ExecutionContext> {
    const id = randomUUID();
    const context = { id, ...input, createdAt: new Date() };

    // RACE: Two requests could interleave here
    this.contexts.set(id, context);          // ← Request A writes
    this.pathIndex.set(pathKey, id);         // ← Request B writes different id
    // Result: pathIndex points to wrong context!

    return context;
  }
}
```

**What Happens:**
1. Request A calls `createContext()` for path "/foo"
2. Request B calls `createContext()` for path "/foo" (same path)
3. Both create different context IDs
4. Both write to `pathIndex` - last write wins
5. One context is orphaned, the other can't be found

**Also Affected:**
- `packages/reg-intel-conversations/src/pathStores.ts:94-96` - Same issue with path operations
- `packages/reg-intel-graph/src/graphChangeDetector.ts:137-140` - Polling modifies Maps concurrently with subscribe/unsubscribe

### The Fix

**Option 1: Use a mutex/lock**

```typescript
// ✅ BETTER - Use async-mutex library
import { Mutex } from 'async-mutex';

class InMemoryExecutionContextStore {
  private mutex = new Mutex();

  async createContext(input: CreateExecutionContextInput): Promise<ExecutionContext> {
    return await this.mutex.runExclusive(async () => {
      // Only one request can execute this block at a time
      const id = randomUUID();
      const context = { id, ...input, createdAt: new Date() };
      this.contexts.set(id, context);
      this.pathIndex.set(pathKey, id);
      return context;
    });
  }
}
```

**Option 2: Check before write**

```typescript
// ✅ ALTERNATIVE - Check and fail if already exists
async createContext(input: CreateExecutionContextInput): Promise<ExecutionContext> {
  const pathKey = this.getPathKey(input);
  const existing = this.pathIndex.get(pathKey);

  if (existing) {
    throw new Error(`Context already exists for path: ${pathKey}`);
  }

  const id = randomUUID();
  const context = { id, ...input, createdAt: new Date() };
  this.contexts.set(id, context);
  this.pathIndex.set(pathKey, id);
  return context;
}
```

### Detection Checklist

- [ ] Async methods modifying shared Maps/objects
- [ ] Multiple write operations without atomic guarantee
- [ ] No mutex or lock usage
- [ ] Methods that read-then-write (check-then-act pattern)

---

## Pattern 13: Order-Dependent Initialization

### Severity: LOW
### Status: NO CURRENT ISSUES FOUND

### The Bug

Modules that depend on initialization order can fail if loaded in different order.

**Prevention:**
- Use lazy initialization
- Check for undefined before use
- Document initialization requirements

---

# Part V: Type Coercion & Data Bugs

## Pattern 14: Missing Radix in parseInt()

### Severity: LOW
### Status: CURRENT BUG

### The Bug

`parseInt()` without radix parameter can parse strings as octal in older environments or when the string has leading zeros.

### Real Example (CURRENT BUG)

**File:** `scripts/update-implementation-state.ts:401, 409`

```typescript
// ❌ CURRENT BUG - No radix parameter
updateTests(state, 'unit', parseInt(args[1]), parseInt(args[2]), args[3]);
updateTests(state, 'integration', parseInt(args[1]), parseInt(args[2]));
```

**What Happens:**
```javascript
parseInt("08")   // Could return 0 in strict mode (octal)
parseInt("08", 10)  // Always returns 8 (decimal)
```

**Fix:**

```typescript
// ✅ FIXED - Always specify radix
updateTests(state, 'unit', parseInt(args[1], 10), parseInt(args[2], 10), args[3]);
```

### Detection Checklist

- [ ] `parseInt()` without second parameter
- [ ] `parseFloat()` on user input without validation

---

## Pattern 15: Date/Timezone Confusion

### Severity: LOW-MEDIUM
### Status: CURRENT BUG

### The Bug

Using `new Date()` without explicit UTC conversion causes timezone bugs, especially in aggregations.

### Real Example (CURRENT BUG)

**File:** `apps/demo-web/src/lib/metrics/businessMetrics.ts:73`

```typescript
// ❌ CURRENT BUG - Local timezone used
recordApiCall(endpoint: string) {
  const hour = new Date().toISOString().slice(0, 13); // "2025-12-31T05"
  this.apiCallsByHour[hour] = (this.apiCallsByHour[hour] || 0) + 1;
}
```

**What Happens:**
1. Server in EST creates key "2025-12-31T05" (EST = UTC-5)
2. Daylight saving time begins → server clock jumps forward
3. Same wall-clock time now creates key with different hour
4. Data appears to have gaps
5. Aggregations are corrupted

**Fix:**

```typescript
// ✅ FIXED - Always use UTC
recordApiCall(endpoint: string) {
  const now = new Date();
  const hour = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}`;
  // Or simpler: use a library like date-fns with UTC methods
  this.apiCallsByHour[hour] = (this.apiCallsByHour[hour] || 0) + 1;
}
```

### Detection Checklist

- [ ] `new Date()` used for aggregation keys
- [ ] Date comparisons without timezone consideration
- [ ] `.toISOString().slice()` pattern for time bucketing
- [ ] Missing UTC in date operations

---

## Pattern 16: Truthy/Falsy Gotchas

### Severity: LOW
### Status: NO CURRENT CRITICAL ISSUES

### The Bug

JavaScript's truthy/falsy behavior can cause bugs when checking for values.

**Common Gotchas:**

```typescript
// ❌ WRONG - 0 is falsy!
if (count) { ... }  // Doesn't run when count is 0

// ✅ CORRECT
if (count !== undefined) { ... }

// ❌ WRONG - Empty string is falsy!
if (name) { ... }

// ✅ CORRECT
if (name !== undefined && name !== null) { ... }
```

---

# Part VI: Silent Failures

## Pattern 17: Empty Catch Blocks

### Severity: MEDIUM
### Status: CURRENT BUGS - Multiple locations

### The Bug

Catch blocks without error logging make debugging impossible.

### Real Example (CURRENT BUG)

**File:** `apps/demo-web/src/lib/clientTelemetry.ts:236-238`

```typescript
// ❌ CURRENT BUG - Error swallowed silently
try {
  await sendTelemetry(events);
} catch {
  // Swallow errors - NO LOGGING!
}
```

**What Happens:**
- Telemetry silently stops working
- No log to debug
- No metric to alert on
- Impossible to diagnose

**Fix:**

```typescript
// ✅ FIXED - Log the error
try {
  await sendTelemetry(events);
} catch (error) {
  logger.warn({ err: error }, 'Failed to send telemetry (non-critical)');
  // Consider: Increment failure metric for alerting
}
```

**Also Affected:**
- `packages/reg-intel-next-adapter/src/index.ts:485` - Empty catch in `send()`
- Many other locations with `catch { }` or `catch (error) { }`

### Detection Checklist

- [ ] `catch { }` with no statements
- [ ] `catch (error) { }` with no logging
- [ ] `catch` with only a comment
- [ ] `.catch(() => {})` on promises

---

## Pattern 18: Missing Error Propagation

### Severity: LOW
### Status: VARIES

### The Bug

Catching errors but not propagating them to caller, causing silent failures.

### Example

```typescript
// ❌ WRONG - Error caught but caller doesn't know
async function updateRecord(id: string) {
  try {
    await db.update(id);
  } catch (error) {
    logger.error({ err: error }, 'Update failed');
    // Error not re-thrown - caller thinks it succeeded!
  }
}

// ✅ CORRECT - Re-throw or return error
async function updateRecord(id: string) {
  try {
    await db.update(id);
  } catch (error) {
    logger.error({ err: error }, 'Update failed');
    throw error; // Propagate to caller
  }
}
```

---

# Summary of Active Bugs by Severity

## CRITICAL (Immediate Action Required)
- None - All critical hanging request bugs have been fixed

## HIGH (Fix in Next Sprint)
1. **Unbounded Map growth in metrics classes** - Will cause OOM in production
2. **Cypher injection in nodeLabel** - Could allow arbitrary query execution

## MEDIUM (Fix Soon)
3. **Race conditions in shared state** - Can cause data corruption
4. **Empty catch blocks** - Makes debugging impossible
5. **Unbounded interval timers** - CPU usage creep

## LOW (Technical Debt)
6. **Missing radix in parseInt()** - Edge case bugs
7. **Date/timezone issues** - DST bugs in aggregations
8. **Missing input validation** - Defense in depth

---

# Quick Reference: Bug Detection Commands

```bash
# Find unbounded Maps in singletons
rg "private.*Map<string" --type ts | rg -v "WeakMap"

# Find parseInt without radix
rg "parseInt\([^,)]+\)" --type ts

# Find empty catch blocks
rg "catch\s*\{?\s*\}?" --type ts

# Find fetch without signal
rg "await fetch\(" --type ts | rg -v "signal:"

# Find promises without timeout
rg "new Promise\(" --type ts | rg -v "setTimeout|Promise.race"

# Find event listeners without cleanup
rg "addEventListener" --type ts | rg -v "removeEventListener"

# Find database queries without LIMIT
rg "MATCH.*RETURN" --type ts | rg -v "LIMIT"
```

---

# Automated Checks

Consider adding these to CI/CD:

```typescript
// eslint rules to add
{
  "no-empty": ["error", { "allowEmptyCatch": false }],
  "radix": "error",
  "@typescript-eslint/no-floating-promises": "error",
}
```

---

**When in doubt, always prefer:**
- ✅ Fail fast over silent failure
- ✅ Explicit over implicit
- ✅ Defensive over trusting
- ✅ Bounded over unbounded
- ✅ Logged over silent
