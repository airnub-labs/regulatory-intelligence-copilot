# @reg-copilot/reg-intel-cache

This package provides reusable factories for the cache-centric primitives used across the repo:

- **Key/value clients** for short-lived data caches (LLM responses, validation sessions, etc.)
- **Pub/Sub pairs** for the Redis conversation event hub abstraction
- **Sliding-window rate limiter** for client telemetry throttling

## Supported backends

All facilities share the same backend resolver (`resolveRedisBackend`) so every consumer can run against the currently supported Redis providers:

- **Standard Redis (ioredis)** – covers long-lived deployments that expect TCP Redis URLs (`redis://` or `rediss://`), _and_ is now the default whenever `REDIS_URL` is set but the provider is ambiguous (including most HTTPS/TLS URLs).
- **Upstash Redis** – available when the URL targets Upstash (`upstash.io`) and `@upstash/redis` is installed. You can still force this backend via `CACHE_PROVIDER=upstash` / `EVENT_HUB_PROVIDER=upstash` / `RATE_LIMIT_PROVIDER=upstash` for components that should keep using the REST client and `@upstash/ratelimit`.

Optional provider overrides (`CACHE_PROVIDER`, `EVENT_HUB_PROVIDER`, `RATE_LIMIT_PROVIDER`) let you pick either backend explicitly per component while still using the same helpers (`createKeyValueClient`, `createPubSubClientPair`, `createRateLimiter`).

## Current in-repo usages

The existing cache surfaces now route through these factories:

- **LLM/cache warming** – `apps/demo-web/src/lib/server/llm.ts` uses `createKeyValueClient` for inference result caching.
- **Auth validation cache** – `apps/demo-web/src/lib/auth/distributedValidationCache.ts` now resolves its key/value client via `resolveRedisBackend` and `createKeyValueClient`.
- **Client telemetry rate limits** – `apps/demo-web/src/lib/rateLimiter.ts` delegates to `createRateLimiter`, which maps to ioredis or Upstash based on the resolved backend.
- **Conversation event hub** – `apps/demo-web/src/lib/server/conversations.ts` builds pub/sub clients through `createPubSubClientPair`, keeping Redis as the default transport while allowing Supabase selection upstream.

These entry points match the legacy Upstash-first implementations and the direct ioredis consumers documented in `docs/architecture/redis_first_caching_rate_limiting_implementation_plan_agent_ready.md`, so the shared package now covers all previously used cache stores via a single provider abstraction.
