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

# GraphRAG Tests (Memgraph data validation)
pnpm test:graph:all                      # Run GraphRAG validation + integration tests
pnpm test:graph:validation               # Validate graph seed data alignment
pnpm test:graph:integration              # Validate GraphRAG end-to-end flow

# E2E Tests (Playwright - full-stack integration)
pnpm test:e2e                            # Run all E2E tests (headless)
pnpm test:e2e:ui                         # Run E2E tests with UI (interactive)
pnpm test:e2e:headed                     # Run E2E tests with browser visible
pnpm test:e2e:install                    # Install Playwright browsers
pnpm test:all                            # Run both GraphRAG + E2E tests

# Infrastructure Setup
pnpm setup:indices          # Create Memgraph indices (run before seeding)
pnpm seed:graph:realistic   # Seed realistic Irish tax regulatory data (aligned with Supabase)
pnpm seed:jurisdictions     # Seed special jurisdictions (IE/UK/NI/EU)
pnpm seed:all               # Run all seeding scripts (realistic + jurisdictions)
pnpm seed:all:legacy        # Legacy seed (original unrealistic data)
supabase db reset           # Reset Supabase DB, run migrations + seed realistic data

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

### Database Schema Organization

The Postgres database uses domain-driven schema organization for separation of concerns:

#### Active Schemas (In Use)

- **`copilot_core`** - Core application tables (conversations, tenants, users, personas)
  - 16 tables with Row Level Security (RLS)
  - Primary operational data
  - Tenant-scoped access control

- **`copilot_billing`** - Cost tracking and quotas (LLM costs, E2B costs, pricing, quotas)
  - 7 tables for financial records
  - Separated for SOC2 compliance
  - Independent backup/retention policies

- **`copilot_audit`** - Compliance and audit logs (permission changes, compaction ops, session sync)
  - 3 tables with append-only pattern
  - 7-year retention for compliance
  - Immutable audit trail

- **`copilot_analytics`** - Business intelligence and metrics
  - 1 table (slow_query_log) + 26 analytical views
  - Cost summaries, usage analytics, quota status
  - Read-only views aggregate from billing/core schemas

- **`public`** - PostgREST API surface (8 views)
  - Exposes tenant-scoped views via Supabase client
  - All queries respect RLS policies

#### Future-Use Schemas (Reserved for Scaling)

These schemas exist but are **not actively used yet**. They're part of the scaling roadmap:

- **`copilot_events`** - Event sourcing infrastructure (**Target: 1M+ users**)
  - For immutable event log of all state changes
  - Enables temporal queries, CQRS pattern, event-driven architecture
  - Will contain: events table (partitioned by month), event snapshots, subscriptions
  - **Status:** Empty - staged for future event-driven migration

- **`copilot_archive`** - Cold data storage (**Target: 500K+ users or 1TB+ DB**)
  - For moving inactive data to cheaper storage
  - Keeps hot database lean for performance
  - Will contain: archived conversations, messages, cost records, audit logs
  - Can be backed by S3/GCS via foreign data wrappers
  - **Status:** Empty - staged for future data archival

See `supabase/migrations/20260113000001_add_future_schemas.sql` for detailed documentation on when and how to activate these schemas.

### Data Flow

1. User → `/api/chat` (SSE streaming)
2. → `ComplianceEngine` orchestrates agents
3. → Agents query Memgraph via `GraphClient` (read-only)
4. → LLM calls via `LlmRouter` with egress guard
5. → Responses include `referencedNodes` for graph highlighting

### Realistic Seed Data

The repository includes comprehensive realistic seed data demonstrating the platform's multi-tenant architecture:

**Supabase (Postgres):**
- 3 tenants: DataTech (enterprise), Emerald Tax (pro), Seán (personal)
- 19 users across 3 tiers (12 enterprise, 6 pro, 1 personal)
- 10 platform admin users (global 24/7 support)
- 11 conversations with 62 messages showing realistic Irish tax queries
- Conversation branching (45% have alternate paths)
- Full cost tracking (LLM + E2B costs, quota management)

**Memgraph (Graph DB):**
- 38 regulatory nodes (6 reliefs, 12 sections, 8 timelines, 6 profiles)
- ~30 relationships connecting concepts
- 100% alignment with Supabase conversations (every regulatory concept referenced in conversations has corresponding graph nodes)

**Key Documentation:**
- Seed data structure: `supabase/seed/realistic_seed/README.md`
- Alignment mapping: `docs/seed-data-alignment.md`
- Graph seed script: `scripts/seed-graph-realistic.ts`

**Seeding both databases:**
```bash
# 1. Seed Supabase (Postgres)
supabase db reset  # Runs migrations + realistic seed data

# 2. Seed Memgraph (Graph DB)
pnpm seed:all      # Realistic Irish tax data + special jurisdictions
```

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

### Two Separate Environment Configurations

**1. Repository Scripts (Root Level)**

Files: `.env` and `.env.local` (repository root)

All graph seeding and infrastructure scripts automatically load from:
- `.env.local` (local overrides - NOT in git) - **HIGHEST PRIORITY**
- `.env` (defaults - committed to git)

Setup:
```bash
# One-time: Copy example to .env.local
cp .env.example .env.local

# Edit with your local settings
# For local Memgraph: MEMGRAPH_URI=bolt://localhost:7687
# For remote: MEMGRAPH_URI=bolt+ssc://host:7687 + credentials
```

Required variables for scripts:
- `MEMGRAPH_URI` - Memgraph connection (default: bolt://localhost:7687)
- `MEMGRAPH_USERNAME` - Optional auth username
- `MEMGRAPH_PASSWORD` - Optional auth password

**2. Web Application**

File: `apps/demo-web/.env.local` (NOT in git)

Required for web app:
- At least one LLM provider API key (GROQ_API_KEY, OPENAI_API_KEY)
- MEMGRAPH_URI (default: bolt://localhost:7687)
- Supabase configuration
- NEXTAUTH_SECRET

See `docs/development/ENVIRONMENT_LOADING.md` for complete documentation.

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
# Required - Start Memgraph (graph database)
docker compose -f docker/docker-compose.yml up -d memgraph memgraph-mcp

# Optional (observability)
docker compose -f docker/docker-compose.yml up -d otel-collector jaeger prometheus loki grafana redis
```

- Memgraph Lab UI: `http://localhost:7444`
- Jaeger traces: `http://localhost:16686`
- Grafana dashboards: `http://localhost:3200`

---

## Local Supabase CLI

Supabase CLI is used for local development. Key commands:

```bash
supabase status      # Check if Supabase is running and get connection details
supabase start       # Start local Supabase (first run takes 5-10 minutes)
supabase stop        # Stop Supabase
supabase db reset    # Reset DB, run all migrations, and seed data
```

After `supabase start`, access:

- Supabase Studio: `http://localhost:54323`
- API URL: `http://localhost:54321`
- Database: `postgresql://postgres:postgres@localhost:54322/postgres`

For detailed setup including demo user configuration, see [docs/development/local/LOCAL_DEVELOPMENT.md](docs/development/local/LOCAL_DEVELOPMENT.md).

---

## Key Documentation

- `docs/architecture/architecture_v_0_7.md` - High-level architecture
- `docs/governance/decisions/decisions_v_0_6.md` - ADRs
- `docs/governance/roadmap/roadmap_v_0_6.md` - Implementation roadmap
- `docs/specs/graph-schema/graph_schema_v_0_6.md` - Graph schema
