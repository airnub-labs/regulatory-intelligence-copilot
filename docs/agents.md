# AI Coding Agent Guidelines

**Last Updated:** 2025-12-31

This document contains critical information for AI coding agents working on this codebase. **Read this document before making any code changes.**

---

## 🚨 Critical: Hidden Bug Patterns to Watch For

**Before you write any code, you MUST read:**

### [📖 Insidious Bug Patterns Guide](./development/INSIDIOUS_BUGS.md)

This comprehensive document catalogs **18 critical bug patterns** discovered in the codebase. These bugs:
- Don't throw errors or fail fast
- Only manifest under specific conditions (load, network issues, time, concurrent access)
- Are difficult to detect in development and code review
- Can cause production outages, data corruption, or security breaches

**Bug Categories Documented:**

**Part I: Hanging Request Bugs** (5 patterns - ALL FIXED)
1. ✅ Missing status case handlers in promise-based callbacks
2. ✅ Network operations without timeout protection
3. ✅ Async iteration without abort signal handlers
4. ✅ SSE/WebSocket cleanup race conditions
5. ✅ Unbounded database queries

**Part II: Memory Leaks** (3 patterns - ACTIVE BUGS)
6. ⚠️ Unbounded Map/Object growth in singletons
7. ✅ Event listeners never removed
8. ⚠️ Interval timers never cleared

**Part III: Security Vulnerabilities** (3 patterns - NEEDS REVIEW)
9. ⚠️ Cypher/SQL injection
10. ⚠️ Missing input validation
11. ✅ Secrets in logs

**Part IV: Concurrency Bugs** (2 patterns - ACTIVE BUGS)
12. ⚠️ Race conditions in shared state
13. ✅ Order-dependent initialization

**Part V: Type Coercion & Data Bugs** (3 patterns - MINOR BUGS)
14. ⚠️ Missing radix in parseInt()
15. ⚠️ Date/timezone confusion
16. ✅ Truthy/falsy gotchas

**Part VI: Silent Failures** (2 patterns - ACTIVE BUGS)
17. ⚠️ Empty catch blocks
18. ⚠️ Missing error propagation

---

## Pre-Flight Checklist for Code Changes

Before committing any code, verify:

### For Any Async Operation

- [ ] Has timeout protection (use `AbortController` + timeout)
- [ ] Has error handling (try-catch with proper cleanup)
- [ ] Has cleanup guarantee (try-finally or settled flag)
- [ ] Handles all possible status/state values
- [ ] Has default case in status handlers

### For API Route Handlers

- [ ] Registers abort listener FIRST (before any async operations)
- [ ] Checks `request.signal.aborted` in loops
- [ ] Has timeout on all network calls (fetch, database, etc.)
- [ ] Cleans up subscriptions/intervals on abort
- [ ] Uses try-catch for `controller.enqueue()` and `controller.close()`

### For Database Queries

- [ ] Has `LIMIT` clause on all SELECT/MATCH queries
- [ ] Has timeout on query execution
- [ ] Uses indexed columns in WHERE clauses
- [ ] Avoids unbounded graph traversals (use max depth)

### For Event Subscriptions

- [ ] Returns unsubscribe function
- [ ] Calls unsubscribe on request abort
- [ ] Doesn't leave orphaned subscriptions
- [ ] Has error handling in subscription callbacks

### For Streaming Endpoints (SSE/WebSocket)

- [ ] Abort listener registered FIRST in `start()` function
- [ ] Keep-alive interval cleared on abort
- [ ] Subscription unsubscribed on abort
- [ ] Controller closed in try-catch
- [ ] No race conditions between setup and abort

---

## Testing Requirements

All async operations MUST have tests for:

1. **Timeout Behavior**
   ```typescript
   test('should timeout after 30 seconds', async () => {
     await expect(operation()).rejects.toThrow('timeout');
   }, 35000);
   ```

2. **Abort Behavior**
   ```typescript
   test('should cleanup when aborted', async () => {
     const controller = new AbortController();
     const promise = operation({ signal: controller.signal });
     controller.abort();
     await expect(promise).rejects.toThrow();
     expect(cleanupCalled).toBe(true);
   });
   ```

3. **Error Cases**
   ```typescript
   test('should handle unexpected status', async () => {
     mockCallback('UNKNOWN_STATUS');
     await expect(operation()).rejects.toThrow('Unexpected');
   });
   ```

---

## Architecture Overview

### Tech Stack

- **Runtime:** Node.js 24+
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript 5.9+
- **LLM:** Anthropic Claude (via @anthropic-ai/sdk)
- **Graph Database:** Memgraph (via MCP)
- **Conversation Store:** Supabase Postgres
- **Event Bus:** Supabase Realtime / Upstash Redis
- **Observability:** OpenTelemetry

### Key Packages

- `packages/reg-intel-core` - Core LLM and graph client logic
- `packages/reg-intel-conversations` - Conversation persistence and SSE
- `packages/reg-intel-next-adapter` - Next.js route handlers
- `packages/reg-intel-graph` - Graph schema and change detection
- `packages/reg-intel-llm` - LLM router and policy enforcement
- `packages/reg-intel-prompts` - Prompt templates and aspects

### Critical Paths

**Chat Request Flow:**
1. Client → `/api/chat` (Next.js route)
2. → `createChatRouteHandler()` (reg-intel-next-adapter)
3. → `complianceEngine.handleChatStream()` (reg-intel-core)
4. → LLM streaming + graph queries
5. → SSE back to client

**Graph Query Flow:**
1. Agent decides to query graph
2. → `graphClient.getRulesForProfileAndJurisdiction()` (reg-intel-core)
3. → `callMemgraphMcp()` → MCP Gateway → Memgraph
4. → Parse Cypher results into GraphContext
5. → Return to LLM for inclusion in context

**Event Broadcasting:**
1. Server event occurs (new message, metadata update)
2. → `eventHub.broadcast()` (reg-intel-conversations)
3. → Supabase Realtime or Redis pub/sub
4. → All subscribed Next.js instances receive event
5. → Forward to connected SSE clients

---

## Common Gotchas

### 1. Event Hub Subscription Leaks

**Problem:** Forgetting to call the `unsubscribe()` function returned by `eventHub.subscribe()`

**Solution:**
```typescript
// ✅ CORRECT
const stream = new ReadableStream({
  start(controller) {
    let unsubscribe = () => {};

    request.signal.addEventListener('abort', () => {
      unsubscribe(); // Always call this!
      controller.close();
    });

    unsubscribe = eventHub.subscribe(tenantId, conversationId, subscriber);
  }
});
```

### 2. Cypher Injection

**Problem:** String interpolation in Cypher queries

**Solution:** Use the `escapeCypher()` function
```typescript
// ❌ VULNERABLE
const query = `MATCH (n {id: '${userId}'}) RETURN n`;

// ✅ SAFE
const query = `MATCH (n {id: '${escapeCypher(userId)}'}) RETURN n`;
```

### 3. MCP Gateway Configuration

**Problem:** `callMemgraphMcp()` fails with "MCP gateway not configured"

**Solution:** Ensure sandbox is active before making graph queries
```typescript
if (hasActiveSandbox() && getMcpGatewayUrl()) {
  const result = await callMemgraphMcp(query);
} else {
  // Fallback or error
}
```

### 4. OpenTelemetry Context Loss

**Problem:** Trace context lost across async boundaries

**Solution:** Use `withSpan()` wrapper
```typescript
await withSpan('operation-name', async (span) => {
  span.setAttribute('custom.attribute', value);
  return await operation();
});
```

---

## Code Style Guidelines

### TypeScript

- Use strict mode (`tsconfig.json` has `strict: true`)
- Prefer `interface` over `type` for object shapes
- Use `unknown` instead of `any`
- Always specify return types for public functions

### Error Handling

```typescript
// ✅ GOOD - Specific error types
if (!conversationId) {
  return new Response('Missing conversationId', { status: 400 });
}

try {
  await operation();
} catch (error) {
  if (error instanceof SpecificError) {
    // Handle specific error
  } else {
    // Re-throw or handle generically
    throw error;
  }
}
```

### Logging

```typescript
// Use structured logging
logger.info({ tenantId, userId, conversationId }, 'Starting operation');
logger.error({ err: error, context }, 'Operation failed');
```

---

## Repository Structure

```
.
├── apps/
│   └── demo-web/          # Next.js application
│       └── src/
│           └── app/
│               └── api/   # API route handlers
├── packages/
│   ├── reg-intel-core/           # Core LLM & graph client
│   ├── reg-intel-conversations/  # Conversation persistence & SSE
│   ├── reg-intel-next-adapter/   # Next.js adapters
│   ├── reg-intel-graph/          # Graph schema & change detection
│   ├── reg-intel-llm/            # LLM router & policies
│   ├── reg-intel-prompts/        # Prompt engineering
│   ├── reg-intel-ui/             # React components
│   └── reg-intel-observability/  # OpenTelemetry setup
├── docs/
│   ├── agents.md                        # This file
│   └── development/
│       └── HANGING_REQUEST_BUGS.md     # Critical bug patterns
└── scripts/                # Utility scripts
```

---

## Deployment & Environment

### Required Environment Variables

**LLM:**
- `ANTHROPIC_API_KEY` - Claude API key

**Graph Database:**
- `MEMGRAPH_URI` - Memgraph connection string
- `MEMGRAPH_USERNAME` - Memgraph user
- `MEMGRAPH_PASSWORD` - Memgraph password

**Conversation Store:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)

**Event Bus (choose one):**
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (preferred)
- OR use Supabase Realtime (via `SUPABASE_URL` + `SUPABASE_ANON_KEY`)

**MCP Gateway:**
- `E2B_API_KEY` - E2B API key for sandbox provisioning
- MCP gateway URL/token provided by active sandbox at runtime

### Build & Deploy

```bash
# Install dependencies
pnpm install

# Type check
pnpm run type-check

# Build all packages
pnpm run build

# Run development server
cd apps/demo-web && pnpm run dev
```

---

## Getting Help

### Documentation

- `/docs/development/` - Development guides
- `/docs/architecture/` - Architecture decision records
- `/packages/*/README.md` - Package-specific documentation

### Key Contacts

Check `package.json` files for maintainer information.

---

## Final Reminders

1. **Read [HANGING_REQUEST_BUGS.md](./development/HANGING_REQUEST_BUGS.md) before touching async code**
2. Always add timeout protection to network operations
3. Always register abort listeners FIRST in streaming endpoints
4. Always add `LIMIT` clauses to database queries
5. Always test timeout and abort scenarios

**When in doubt, fail fast. Never hang indefinitely.**
