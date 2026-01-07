# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **IMPORTANT:** Before making changes to agents, prompts, or core architecture, you MUST read [`AGENTS.md`](./AGENTS.md) - the authoritative specification for agent behavior, repository rules, fault-tolerance patterns, and architectural constraints.

---

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev              # Start all apps/packages in watch mode
pnpm dev:web          # Start only demo-web (localhost:3000)

# Build & Quality
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm type-check       # Type check all packages

# Testing
pnpm --filter demo-web test              # Run all tests in demo-web
pnpm --filter demo-web test -- --run <filename>  # Run specific test file

# Infrastructure Setup
pnpm setup:indices    # Create Memgraph indices (run before seeding)
pnpm seed:graph       # Seed Irish regulatory data
pnpm seed:jurisdictions  # Seed special jurisdictions (IE/UK/NI/EU)
pnpm seed:all         # Run all seeding scripts

# Utilities
pnpm test:quotas      # Test quota enforcement
pnpm cost:analyze     # Cost tracking analysis
```

### Required Pre-Commit Checks

After making any code changes, run these commands and fix all issues before pushing:

```bash
pnpm lint      # Must pass
pnpm build     # Must pass
pnpm dev       # Must run without errors
```

---

## Architecture Overview

**Regulatory Intelligence Copilot** is a chat-first, graph-backed regulatory research platform for exploring tax, social welfare, pensions, and EU rules.

### Monorepo Structure

```text
apps/
  demo-web/                    # Next.js 16 web app (React 19, Tailwind v4)

packages/
  reg-intel-core/              # ComplianceEngine, agents, orchestration
  reg-intel-graph/             # GraphClient, GraphWriteService, ingress guard
  reg-intel-llm/               # LLM router, providers, egress guard
  reg-intel-prompts/           # Prompt aspects system
  reg-intel-conversations/     # Conversation persistence, paths, auth
  reg-intel-cache/             # Redis caching with transparent failover
  reg-intel-next-adapter/      # Next.js integration helpers
  reg-intel-observability/     # Pino logging, OpenTelemetry
  reg-intel-ui/                # Reusable React components

docker/                        # Docker Compose for Memgraph, Redis, observability
supabase/                      # Database migrations
scripts/                       # Graph seeding, testing utilities
docs/                          # Architecture specs, ADRs, roadmap
```

### Key Technologies

- **Framework:** Next.js 16, React 19, Vercel AI SDK v5
- **Graph DB:** Memgraph Community (bolt://localhost:7687)
- **App DB:** Supabase/Postgres with RLS
- **Cache:** Redis with transparent failover
- **LLM:** Provider-agnostic via LlmRouter (OpenAI, Groq, Anthropic, Google)
- **Logging:** Pino with OpenTelemetry

### Data Flow

1. User → `/api/chat` (SSE streaming)
2. → `ComplianceEngine` orchestrates agents
3. → Agents query Memgraph via `GraphClient` (read-only)
4. → LLM calls via `LlmRouter` with egress guard
5. → Responses include `referencedNodes` for graph highlighting

---

## Critical Architectural Rules

### TypeScript Strict Mode

**NEVER** disable or bypass TypeScript checking:

- No `strict: false`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`
- No changing types to `any` to bypass errors
- No `skipLibCheck: true`
- Fix the root cause of all type errors

### Transparent Failover Pattern

All cache/rate limiter factories MUST return non-nullable instances:

```typescript
// CORRECT: Factory never returns null
const cache = getCache();  // Always returns Cache instance
const value = await cache.get(key);  // Returns null for miss OR Redis down

// PROHIBITED patterns:
// - Factories returning null (getCache(): Cache | null)
// - Null checks in app code (if (cache) { ... })
// - Different types based on Redis availability
```

### Pino Logger API

Object FIRST, message SECOND:

```typescript
// CORRECT
logger.info({ userId, tenantId }, 'User logged in');

// WRONG - breaks structured logging
logger.info('User logged in', { userId, tenantId });
```

### Package Organization

Reusable code goes in packages, NOT in `apps/demo-web/`:

- UI components → `packages/reg-intel-ui/`
- Domain logic → `packages/reg-intel-core/`
- Graph operations → `packages/reg-intel-graph/`
- LLM integrations → `packages/reg-intel-llm/`

Import from packages:

```typescript
// CORRECT
import { scrollToMessage } from '@reg-copilot/reg-intel-ui';

// WRONG
import { scrollToMessage } from '@/lib/utils';
```

### Graph Access Rules

- All agents use **read-only** `GraphClient` to query Memgraph
- All writes go through `GraphWriteService` + Graph Ingress Guard
- Memgraph is **PII-free** and **tenant-agnostic** - no user data stored there
- Never call `session.run()` directly

### LLM Router Rules

- Never call LLM providers directly - always use `LlmRouter`
- Route determines model/provider based on tenant/task policies
- All outbound calls flow through Egress Guard

---

## Environment Configuration

Two separate `.env` files:

1. **Root `.env`** - For repository scripts (graph seeding)
2. **`apps/demo-web/.env.local`** - For the web application

Required for web app:

- At least one LLM provider API key (GROQ_API_KEY, OPENAI_API_KEY)
- MEMGRAPH_URI (default: bolt://localhost:7687)
- Supabase configuration
- NEXTAUTH_SECRET

---

## Conversation Path System

The path system enables "time travel" - editing any message creates a branch while preserving the original conversation.

### Critical Invariants (Must Never Regress)

1. **Original Path Preservation:** Editing message N must preserve ALL messages after N on the original path
2. **Path Isolation:** Switching paths returns ONLY messages from the active path
3. **No Message Loss:** Branch creation NEVER deletes original path messages

### Required Test Suites

```bash
pnpm --filter demo-web test -- --run edit-previous-message.test.tsx
pnpm --filter demo-web test -- --run path-system-integration.test.tsx
pnpm --filter demo-web test -- --run two-question-flow.test.tsx
```

---

## Agent Architecture (v0.6)

Agents are **jurisdiction-neutral**, **graph-first**, and **engine-centric**.

### Agent Interface

```typescript
interface AgentChatResponse {
  answer: string;
  referencedNodes: string[];  // Memgraph IDs used in reasoning
  jurisdictions: string[];
  uncertaintyLevel: 'low' | 'medium' | 'high';
  disclaimerKey: string;
  agentId: string;
}
```

### Agent Requirements

- Use `GraphClient` (read-only) for graph queries
- Use Timeline Engine for time-based logic
- Use prompt aspects system for system prompts
- Populate `referencedNodes` with graph IDs used
- Rely on `capture_concepts` tool for concept capture (don't implement own)
- Set appropriate `uncertaintyLevel` and `disclaimerKey`

### Primary Agents

- `global_regulatory_copilot` - Main orchestrator, chat entry point
- Expert agents for specific domains (IE social welfare, CGT, etc.)
- Scenario/what-if agents for alternative path evaluation

---

## Code Removal Discipline

Never remove code that appears unused without verification:

1. Search for related documentation
2. Check for "staged for future" comments
3. Look for related issues/PRs
4. Ask before removing if unclear

Code may be intentionally staged for future integration.

---

## Client Telemetry

Uses batching queue (20 events or 2 seconds):

- Never regress to individual `fetch()` calls
- `navigator.sendBeacon()` for reliable delivery
- Rate limiting on server endpoint

---

## Docker Services

```bash
# Required
docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp

# Optional (observability)
docker compose -f docker/docker-compose.yml up -d otel-collector jaeger prometheus loki grafana redis
```

- Memgraph Lab UI: `http://localhost:7444`
- Jaeger traces: `http://localhost:16686`
- Grafana dashboards: `http://localhost:3200`

---

## Key Documentation

- `docs/architecture/architecture_v_0_7.md` - High-level architecture
- `docs/governance/decisions/decisions_v_0_6.md` - ADRs
- `docs/governance/roadmap/roadmap_v_0_6.md` - Implementation roadmap
- `docs/specs/graph-schema/graph_schema_v_0_6.md` - Graph schema
