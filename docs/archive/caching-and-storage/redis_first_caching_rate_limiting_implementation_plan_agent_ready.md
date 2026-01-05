# Redis‑first Caching & Rate Limiting (Upstash optional, via a single Redis config)

> **Repo:** `airnub-labs/regulatory-intelligence-copilot`
>
> **Goal:** Keep all caching + rate limiting behavior working exactly as today, but make the backend **transparent**:
>
> - If a **standard Redis** connection is configured (`REDIS_URL`), use it **by default**.
> - Keep **Upstash** support (existing `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) as an optional backend.
> - Preserve all existing env flags and per-component enablement semantics from `docs/development/CACHE_CONTROL.md`.
> - If desired, allow an explicit override to choose backend (without breaking auto-detect).
>
---

## 0) What exists today (quick inventory)

### Upstash dependencies / usages

1. **Client telemetry rate limiting**
   - Uses `@upstash/ratelimit` + `@upstash/redis` REST client.
   - Logic is wrapped in `RedisRateLimiter` with `RateLimiter.check()`.
   - Fallback: **in-memory** if disabled or Redis not configured.
   - *Fail open* on Redis errors.

2. **Event hub (SSE distribution across instances)**
   - `RedisConversationEventHub` + `RedisConversationListEventHub`.
   - Uses `@upstash/redis` for publish & subscribe (cast to `any` for `.subscribe()` TS issues).
   - Fallback: Supabase Realtime (or dev-only behavior).

3. **Caching decorators (RedisLikeClient)**
   - `CachingPolicyStore`, `CachingConversationConfigStore`, `CachingConversationStore`, etc.
   - These stores expect a minimal Redis-like interface: `get`, `setex`, `del`.
   - Current wiring often instantiates Upstash `Redis` client directly in app code.

### Direct Redis (ioredis) usage today

- **Auth session distributed validation cache** uses `ioredis` (dynamic import) with `REDIS_URL`.

### Current problem

- Two Redis client stacks exist (Upstash REST client vs ioredis).
- Backend selection is duplicated & inconsistent:
  - Some modules only check Upstash envs, ignoring `REDIS_URL`.
  - In many places, Upstash envs are prioritized over `REDIS_URL`.
- Rate limiting is tied to Upstash’s library; it doesn’t natively support ioredis.

---

## 1) Target end state (acceptance criteria)

### Functional

- ✅ All caches that work today still work (same keys/TTLs/behavior).
- ✅ Event hub works with either:
  - Upstash, **or**
  - direct Redis (`REDIS_URL`).
- ✅ Rate limiting works with either:
  - Upstash (`@upstash/ratelimit`), **or**
  - direct Redis (equivalent limiter behavior).
- ✅ No component needs to know whether backend is Upstash or Redis.
- ✅ Existing flags and env vars continue to work.
- ✅ Documentation remains accurate and aligned with behavior.

### Configuration

- Default selection is **automatic**:
  - If `REDIS_URL` is set, use direct Redis.
  - Else if Upstash vars set, use Upstash.
  - Else: no redis backend.
- Optional explicit override allowed (without removing current envs):
  - e.g. `CACHE_BACKEND=redis|upstash|auto`.
  - e.g. `RATE_LIMIT_BACKEND=redis|upstash|auto`.
  - e.g. `EVENT_HUB_BACKEND=redis|upstash|auto`.

### Reliability

- Fallback behavior preserved:
  - Rate limiter: fail open, or fallback to memory.
  - Caches: treat errors as cache-miss.
  - Event hub: fallback to Supabase.

---

## 2) Implementation plan (step-by-step)

> **Packaging choice:** implement the shared abstraction as **`@reg-copilot/reg-intel-cache`** (generic cache abstraction, not platform-specific).

### ### Step 1 — Introduce a shared cache backend module (`@reg-copilot/reg-intel-cache`)

Create a single shared module/package that resolves configuration and returns clients.

Suggested location (pick one):
- `apps/demo-web/src/lib/server/redis/` (app-local)
- or `packages/reg-intel-cache/` (preferred if reused across packages)

#### 1.1 Define common interfaces

Create `RedisKeyValueClient` for caches:

- `get(key): Promise<string | null>`
- `setex(key, ttlSeconds, value): Promise<void>`
- `del(key): Promise<void>`
- optional: `ping(): Promise<string>`

Create `RedisPubSubClient` for event hubs:

- `publish(channel, message): Promise<number | void>`
- `subscribe(channel, handler(message)): Promise<void>`
- `unsubscribe(channel): Promise<void>`
- `ping(): Promise<string>` (optional)

Create `RateLimiter` interface already exists (`check(id)`), keep it.

#### 1.2 Create backend config resolver

Create `resolveRedisBackend()` that reads env and returns:

- `{ backend: 'redis', url, password? }`
- `{ backend: 'upstash', url, token }`
- `null`

**Resolution rules (Redis-first):**

- If a provider override exists for the component (`CACHE_PROVIDER`, `EVENT_HUB_PROVIDER`, `RATE_LIMIT_PROVIDER`), honor it.
- Otherwise infer provider from `REDIS_URL` scheme:
  - `redis://` or `rediss://` → `redis` (ioredis)
  - `https://` → `upstash` (Upstash REST)
- If `REDIS_URL` is not set → no backend.

> This keeps the default behavior "**use Redis by default when a Redis URL is configured**" while still supporting Upstash via the **single** `REDIS_URL` entrypoint.

**Back-compat for secrets:**

- Accept `REDIS_PASSWORD` **or** `REDIS_TOKEN` for direct Redis auth.

#### 1.3 Build client factories

- `getKeyValueClient(): RedisKeyValueClient | null`
- `getPubSubClientPair(): { pub: RedisPubSubClient, sub: RedisPubSubClient } | null`

Implementation details:

- For **direct Redis**, use `ioredis`.
  - One singleton for key/value.
  - For pub/sub, create a second client via `.duplicate()` or separate instance.

- For **Upstash**, use `@upstash/redis`.
  - Key/value: wrap Upstash client.
  - Pub/sub:
    - If Upstash client supports `.subscribe`, wrap it.
    - Else keep current behavior (cast) but isolate it inside wrapper.

**Important:** Cache components only need key/value. Event hubs use pub/sub.

---

### Step 2 — Refactor all cache wiring to use shared factory

Find all places where code does `new Redis({ url, token })` or creates ioredis directly for caching.

Refactor:

- Replace inline client creation with:
  - `const redis = (ENABLE_REDIS_CACHING && FEATURE_FLAG) ? getKeyValueClient() : null;`

Apply to:

- Policy store cache wiring.
- Conversation config cache wiring.
- Conversation store cache wiring.
- Any other caching decorators expecting RedisLikeClient.

**Non-breaking:** Keep TTLs and key namespaces unchanged.

---

### Step 3 — Unify event hub to use shared pub/sub clients

#### 3.1 Create a `createConversationEventHub()` factory

- If `(ENABLE_REDIS_CACHING && ENABLE_REDIS_EVENT_HUBS)` and pub/sub backend exists:
  - Return Redis-backed event hubs.
- Else:
  - Return Supabase-backed event hubs.

#### 3.2 Make Redis event hub backend-agnostic

Option A (cleaner):

- Implement new `IORedisConversationEventHub` using ioredis subscribe semantics.
- Keep existing `RedisConversationEventHub` as Upstash implementation.
- The factory chooses which class to construct based on backend.

Option B (single class):

- Create a `RedisPubSubClient` wrapper for both backends and make the event hub depend on that.

Either option is fine—prefer Option B if it reduces duplication.

**Ensure:** health check (`ping`) works for both.

---

### Step 4 — Rate limiter: support Redis and Upstash under one interface

This is the only “non-trivial” part because `@upstash/ratelimit` is Upstash-centric.

#### 4.1 Keep Upstash path as-is

- If backend resolved as `upstash`, keep using:
  - `new Ratelimit({ redis: new UpstashRedis(...) })`

#### 4.2 Add a direct-Redis rate limiter implementation

Implement `RedisSlidingWindowRateLimiter` (ioredis-backed) with the same `RateLimiter.check(id)` signature.

Requirements:

- Equivalent sliding window semantics (best-effort parity).
- Same window and limit as today.
- Same key prefix (do not break observability).
- Fail open on Redis errors.

Implementation approach (recommended): **Lua script**

- Store a Lua script in code that:
  - Uses a sorted set (or fixed buckets) per key.
  - Prunes old entries beyond window.
  - Adds current timestamp.
  - Returns count and whether allowed.

Pseudo:

- Key: `copilot:ratelimit:telemetry:{id}`
- Window: e.g. 60s
- Limit: e.g. 30

Return allowed boolean.

#### 4.3 Factory selection

In `getRateLimiter()`:

- If Redis globally disabled or rate limiter flag disabled → return memory limiter.
- Else resolve backend:
  - `redis` → return `RedisSlidingWindowRateLimiter(ioredis client)`
  - `upstash` → return existing Upstash limiter
  - `null` → return memory limiter

Keep existing behavior:

- If Redis errors: log + allow.

---

### Step 5 — Eliminate remaining ad-hoc Redis client creation

- Replace auth validation cache direct `ioredis` init with `getKeyValueClient()` where possible.
  - If the validation cache depends on Redis features beyond key/value, keep it separate but still reuse shared config resolution.
  - Ensure semantics remain identical (5-minute TTL, same keys).

Goal: one config resolver + consistent logs.

---

### Step 6 — Add observability + debug logging (minimal)

At startup (or first use), log **once**:

- chosen backend: `redis|upstash|none`
- which features are enabled (based on flags):
  - caching enabled
  - event hubs enabled
  - rate limiting enabled

Do not log secrets.

---

## 3) Environment variables (preserve + extend)

### Existing vars (must remain supported)

- Global kill switch: `ENABLE_REDIS_CACHING`
- Redis connection (single source of truth):
  - `REDIS_URL`
  - `REDIS_PASSWORD` (preferred)
  - `REDIS_TOKEN` (accepted for backward compatibility)

- Feature flags already documented in `CACHE_CONTROL.md`:
  - `ENABLE_RATE_LIMITER_REDIS`
  - `ENABLE_REDIS_EVENT_HUBS`
  - `ENABLE_CONVERSATION_CONFIG_CACHE`
  - `ENABLE_CONVERSATION_STORE_CACHE`
  - `ENABLE_LLM_POLICY_CACHE`
  - etc.

> **Note:** We intentionally **remove legacy `UPSTASH_REDIS_REST_*` variables**. Upstash remains supported by setting `REDIS_URL` to the Upstash HTTPS endpoint and providing `REDIS_PASSWORD/REDIS_TOKEN`.

### Optional provider overrides (no `auto`)

By default, the system uses **standard Redis** when `REDIS_URL` is a `redis://`/`rediss://` URL.

If you want to force Upstash explicitly (or avoid any ambiguity), add these optional overrides:

- `CACHE_PROVIDER=redis|upstash`
- `EVENT_HUB_PROVIDER=redis|upstash`
- `RATE_LIMIT_PROVIDER=redis|upstash`

Defaults:
- `CACHE_PROVIDER=redis`
- `EVENT_HUB_PROVIDER=redis`
- `RATE_LIMIT_PROVIDER=redis`

If a provider is forced that is incompatible with the URL scheme, fail fast with a clear error at startup.

Add *optional* env vars (defaults to `auto`):

- `CACHE_BACKEND=auto|redis|upstash`
- `EVENT_HUB_BACKEND=auto|redis|upstash`
- `RATE_LIMIT_BACKEND=auto|redis|upstash`

If not set, auto-detect applies.

---

## 4) Documentation update tasks (keep docs aligned)

Update these files:

- `docs/development/CACHE_CONTROL.md`
- `docs/development/REDIS_CACHING_ARCHITECTURE.md`
- `docs/development/REDIS_CACHING_CONVENTIONS.md`

### Required doc updates

1. **Single Redis config (no legacy Upstash env vars)**
   - Replace mentions of `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` with:
     - `REDIS_URL` (supports `redis://` and Upstash `https://`)
     - `REDIS_PASSWORD` (preferred) / `REDIS_TOKEN` (alias)

2. **Provider selection**
   - Default: standard Redis (`redis://` / `rediss://`).
   - Upstash: `https://` URL + token/password.
   - Optional overrides (no `auto`): `CACHE_PROVIDER`, `EVENT_HUB_PROVIDER`, `RATE_LIMIT_PROVIDER`.

3. **Single shared factory**
   - Add a short section: “Cache Backend Factory” describing where it lives (`@reg-copilot/reg-intel-cache`) and what it returns.

4. **Rate limiting note**
   - Document that:
     - Upstash uses `@upstash/ratelimit`.
     - Standard Redis uses an equivalent ioredis + Lua limiter.

5. **Event hub note**
   - Document that event hub uses pub/sub:
     - ioredis for standard Redis deployments.
     - Upstash client for Upstash deployments.

---

## 5) Work breakdown (agent-friendly checklist) (agent-friendly checklist)

### A) Code changes

- [ ] Add shared backend resolver + client factories.
- [ ] Refactor cache wiring to use `getKeyValueClient()`.
- [ ] Refactor event hubs to use `getPubSubClientPair()`.
- [ ] Implement Redis sliding window limiter for ioredis.
- [ ] Update rate limiter factory to choose backend.
- [ ] Remove/replace ad-hoc Upstash/ioredis instantiations where redundant.

### B) Tests

- [ ] Unit tests for backend resolver:
  - redis-first precedence
  - upstash fallback
  - none
  - overrides
- [ ] Cache decorator integration tests:
  - works with ioredis
  - works with upstash (mock)
  - no backend
- [ ] Rate limiter tests:
  - consistent allow/deny within window
  - reset after window
  - fail-open behavior
- [ ] Event hub tests:
  - publish/subscribe delivery
  - fallback to Supabase if disabled

### C) Docs

- [ ] Update `CACHE_CONTROL.md` with backend resolution + overrides.
- [ ] Update `REDIS_CACHING_ARCHITECTURE.md` to reflect dual backend.
- [ ] Update `REDIS_CACHING_CONVENTIONS.md` to reflect unified factory + reduced divergence.

---

## 6) Risks & mitigations

1. **`@upstash/ratelimit` does not support ioredis directly**
   - Mitigation: implement Lua-based limiter for direct Redis.

2. **Upstash pub/sub typings are awkward**
   - Mitigation: hide casts in wrapper and keep event hub interface stable.

3. **Serverless connection reuse**
   - Mitigation: singleton clients with safe lazy connect; ensure no connection storm.

4. **Behavior drift in limiter**
   - Mitigation: keep same parameters; add tests; document minor semantic differences if unavoidable.

---

## 7) Definition of Done

- [ ] With only `REDIS_URL` set, caches + event hub + rate limiting use direct Redis.
- [ ] With only Upstash vars set, behavior matches current implementation.
- [ ] With neither set, fallback behavior is unchanged.
- [ ] All feature flags continue to work.
- [ ] Docs reflect true behavior and env precedence.

