# DECISIONS

> Architectural & product decisions for the **regulatory-intelligence-copilot** fork.
>
> Legacy decisions from the original `rfc-refactor` (HTTP/RFC/OWASP auditor) are **not** carried forward unless explicitly restated here.
>
> This v0.2 update reflects: jurisdiction‑neutral prompts, prompt aspects, provider‑agnostic LLM routing, direct Memgraph access, WebSocket graph streaming, and a reusable engine/demo-app split.

---

## D-001 – Pivot from HTTP/RFC Auditor → Regulatory Intelligence Copilot

**Status:** Accepted (unchanged)  
**Date:** 2025-11-24

### Context

The original project focused on:
- Running sample HTTP APIs inside E2B.
- Probing them for RFC/OWASP compliance.
- Surfacing API-level findings.

This was valuable for the hackathon but not aligned with the long-term opportunity Alan cares about: **regulatory interaction intelligence** (tax, welfare, pensions, CGT, EU rules) for self-employed and single-director companies.

### Decision

The fork (`regulatory-intelligence-copilot`) **drops the HTTP/API audit scope** and instead becomes a:

> **Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.**

The new core domain is:
- Irish tax, social welfare, pensions, CGT and their interactions.
- EU regulations and case law that affect Ireland.
- Later: extensible to other jurisdictions and sectors.

### Consequences

- Remove/ignore HTTP probe code, OWASP/RFC-specific logic, and API audit UI.
- Retain and reuse infra components that are agnostic (Next.js app, E2B, MCP gateway, Memgraph, redaction layer).
- All new work targets regulatory graph + agents, not HTTP endpoints.

---

## D-002 – Chat-First UX, Single `/api/chat` Endpoint

**Status:** Accepted (clarified)

### Context

The original project had both a chat and a separate “audit” flow. This added complexity without real value for the new domain.

### Decision

- The product is **chat-first**.
- There is a single backend HTTP API: `POST /api/chat`.
- All capabilities (regulatory questions, scenarios, explanations) flow through this chat endpoint.
- UI “buttons” (e.g. "Check my PRSI" or "Analyse this scenario") simply **prefill chat prompts**, they do not call separate business APIs.

### Consequences

- Frontend focuses on one coherent user flow.
- No dedicated "Run Audit" button or separate audit pages.
- Any future flow (scenario wizard, checklists) should ultimately delegate to `/api/chat`.

---

## D-003 – Graph-First Reasoning with Memgraph

**Status:** Accepted (updated for v0.2 schema)

### Context

Naïve RAG over PDFs/statutes is poor at:
- Capturing cross-references between rules.
- Explaining mutual exclusions and side effects.
- Handling time-based constraints and cross-jurisdiction interactions.

### Decision

- **Memgraph** is the primary source of truth for regulatory rules and relationships.
- The system models (see graph schema specs):
  - Statutes, sections, benefits, reliefs, conditions, timelines, case law, guidance, EU instruments.
  - Jurisdictions, profile tags, and cross-border relationships.
  - Edges such as `CITES`, `REFERENCES`, `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `IMPLEMENTED_BY`, `INTERPRETS`, `APPLIES_TO`, etc.
- LLMs do **not** own the rules; they explain what the graph (and linked documents) say.

### Consequences

- All ingestion jobs must conform to the latest graph schema (e.g. `graph_schema_v0_2.md`).
- Agents must use standard GraphClient query patterns instead of ad-hoc Cypher in random places.
- Graph is **rule/relationship-only**, not user-specific data.

---

## D-004 – E2B Sandbox & MCP: Optional Isolation for External/Untrusted Work

**Status:** Supersedes old D-004

### Context

The earlier decision required "all heavy logic" to run inside an E2B sandbox via Docker MCP. That’s too restrictive for a long-lived SaaS-style product and complicates reuse in other Next.js/Supabase apps.

### Decision

- **Core engine and API** (Compliance Engine, `/api/chat`, GraphClient, LlmRouter) run as normal Node/Next.js services.
- **E2B sandboxes + MCP gateway** are used selectively for:
  - Untrusted code execution.
  - Heavy ingestion/transform jobs.
  - Prototyping or experiments that need hard isolation.
- External legal/search APIs should be accessed via MCP tools where practical, but that is an implementation detail, not a hard architectural constraint for all logic.

### Consequences

- Local dev and deployment are simpler: the main app can run without E2B/MCP.
- When higher isolation is required (e.g. running user-supplied code or POCs), E2B can be used as an execution backend behind the same engine interfaces.
- Future multi-tenant SaaS versions can choose per-tenant whether to use E2B isolation for specific workloads.

---

## D-005 – Egress Guard & Privacy

**Status:** Accepted (unchanged, but aligned with LLM router)

### Context

Questions will often contain personal and financial details. These must not be sent unfiltered to external LLMs or search MCPs, especially for EU/GDPR-conscious tenants.

### Decision

- A dedicated **egress guard** module is mandatory for all outbound payloads that may leave the app’s trust boundary (e.g. remote LLMs, external MCP tools).
- It must:
  - Redact obvious PII (names, addresses, PPSNs, IBANs, emails, phones).
  - Bucket or obfuscate financial amounts where feasible.
  - Strip unnecessary narrative details, focusing prompts on rules and relationships.
- Only graph-safe identifiers (rule IDs, node IDs, profile tags) and abstracted scenario data may be sent to external LLMs/tools.
- For tenants with `allowRemoteEgress = false`, **no personal scenario data** is sent out; all LLM work must use local/OSS models.

### Consequences

- Prompts become more abstract, but privacy is respected.
- Redaction logic is centralised and testable.
- Egress guard needs to integrate with the LlmRouter to enforce tenant policy.

---

## D-006 – LLM Role: Explainer, Not Authority

**Status:** Accepted (unchanged)

### Context

LLMs can hallucinate or oversimplify legal rules. They must not be treated as authoritative sources of law or personalised advice.

### Decision

- LLMs (OpenAI, Groq, OSS, etc.) are used to:
  - Summarise graph-derived rules.
  - Explain interactions and trade-offs.
  - Help rank or structure retrieved content.
- They are **not** allowed to:
  - Invent new rules.
  - Override what the graph/official sources say.
  - Present outputs as legal/tax/welfare advice.

All prompts must:
- Emphasise that the tool is a **research assistant**.
- Ask the model to highlight uncertainty and edge cases.

### Consequences

- All agent prompts must be audited for safety wording.
- Answers must consistently include non-advice disclaimers.

---

## D-007 – Domain Agents + Global Regulatory Agent

**Status:** Accepted (clarified for jurisdiction-neutral core)

### Context

The regulatory space is too broad for a single monolithic agent, but users want a single entry point. Personas like "single director company" matter, but we also want a global expert that can span domains and jurisdictions.

### Decision

- Implement **domain-specific agents** (see `AGENTS.md`), e.g.:
  - Single-Director Company (IE) social safety net.
  - Welfare Benefits (IE).
  - CGT & Investments (IE).
  - R&D Tax Credit (IE).
  - EU Law / Cross-Border Coordination.
- Implement a **GlobalRegulatoryComplianceAgent** that:
  - Is the default entry point.
  - Orchestrates domain agents as needed.
  - Merges their outputs into a coherent response.
- Core system prompts are **jurisdiction-neutral**; country specifics are introduced either by:
  - Agent selection (e.g. IE-specific agent).
  - Prompt aspects that inject jurisdiction context.

### Consequences

- Orchestrator must include simple intent routing (“which agent(s) should handle this?”) based on persona, jurisdictions, and question.
- Agents share common utilities (GraphClient, TimelineEngine, LlmRouter, egress guard, prompt aspects) to avoid duplication.

---

## D-008 – Timeline Engine as a First-Class Component

**Status:** Accepted (unchanged)

### Context

Many rules depend on time:
- Lookback windows for contributions.
- Lock-in periods for reliefs.
- Deadlines and effective dates.

Scattering date math across agents is error-prone and hard to explain.

### Decision

- A dedicated **Timeline Engine** module (see `timeline_engine_v0_1.md`) provides pure functions like:
  - `computeLookbackRange`
  - `isWithinLookback`
  - `computeLockInEnd`
  - `isLockInActive`
- It consumes `:Timeline` nodes and related edges from the graph and returns both machine results and human-readable descriptions.

### Consequences

- All time-based reasoning flows through the engine.
- LLMs get structured timeline inputs instead of raw date strings.
- Easier to extend later (recurring deadlines, jurisdiction-specific calendars, etc.).

---

## D-009 – Initial Jurisdiction & Scope (Ireland-First, EU-Aware)

**Status:** Accepted (clarified)

### Context

The architecture is globally extensible, but implementation time and data availability are limited. Alan’s immediate pain and advantage are in the Irish and EU context.

### Decision

- Initial focus:
  - Jurisdiction: **Ireland**, plus relevant EU law.
  - Personas: self-employed, single-director company, investors (CGT), small advisors.
  - Domains: tax, social welfare, pensions, CGT, R&D credits, EU social security coordination.
- The graph schema is explicitly cross-jurisdiction-capable (countries, EU, special cases like Isle of Man, Malta) so that:
  - Cross-border social security and tax interactions can be modelled.
  - Future agents can support other EU/EAA jurisdictions.

### Consequences

- Early ingestion jobs and tests are opinionated about Irish statutes and bodies (Revenue, DSP, Pensions Authority, TAC, etc.), but the schema and engine are not hardwired to IE.
- Adding new countries later is primarily a **data + agents** task, not a deep architectural change.

---

## D-010 – Data Ingestion Strategy (Static + On-Demand Enrichment)

**Status:** Accepted (extended)

### Context

Regulations change slowly, but guidance and case law can update frequently. It is impractical to model *everything* upfront.

### Decision

- Use a **hybrid ingestion approach**:
  - Seed the graph with a **curated subset** of high-value rules (core statutes & benefits for target personas).
  - Allow **on-demand enrichment**:
    - When agents detect gaps, they can call external search MCPs.
    - The system parses results into nodes/edges and upserts them into Memgraph.
- During chat conversations, when new authoritative sources (statutes, guidance, cases) are referenced and validated, the graph should be **incrementally upserted** so that the knowledge graph is a living, growing asset.
- Do **not** store user-specific data in the graph.

### Consequences

- The graph grows over time based on real questions and new cases.
- Early versions may be sparse; that’s acceptable as long as uncertainty is surfaced.
- The ingestion pipeline must be able to run both batch jobs and small incremental upserts triggered from agent workflows.

---

## D-011 – Non-Advice Positioning & Safety Language

**Status:** Accepted (unchanged)

### Context

Output from LLMs can be misinterpreted as advice. The product must avoid this legally and ethically.

### Decision

- The project is explicitly positioned as:

> "Regulatory research copilot" – not legal, tax, or welfare advice.

- All user-facing surfaces (README, UI, responses) must:
  - Include clear disclaimers.
  - Encourage users to consult qualified professionals and official sources.

### Consequences

- UI copy and answer templates must be kept in sync with this stance.
- Any future features that look like "decision engines" must be framed as scenario explorers, not definitive advice.

---

## D-012 – Legacy Code Handling from `rfc-refactor`

**Status:** Accepted (clarified)

### Context

The original repo contains working integrations (E2B, MCP gateway, Memgraph connection, chat plumbing) mingled with HTTP audit-specific logic.

### Decision

- **Keep** (as long as they are infra-agnostic):
  - E2B integration and sandbox utilities (optional now, not mandatory for all workloads).
  - MCP gateway wiring.
  - Memgraph connectivity (to be wrapped in the new GraphClient abstraction).
  - Chat UI and `/api/chat` plumbing.
  - Generic redaction or logging utilities that are not HTTP-specific.
- **Remove or archive**:
  - Sample HTTP API and probe runners.
  - OWASP and RFC-specific models, types, and hardcoded rules.
  - Audit report components and HTTP transcript visualisation.

### Consequences

- The codebase is cleaner and aligned to the new mission.
- Some early functionality is lost (API auditing) but that is *intended*.

---

## D-013 – Tech Stack Boundaries

**Status:** Accepted (clarified)

### Context

The original project used TypeScript, Next.js, E2B, Docker + MCP, and Memgraph. We want to simplify where possible but not churn the entire stack.

### Decision

- **Keep**:
  - TypeScript as the primary language.
  - Next.js (App Router) for the web app.
  - Memgraph as the graph database.
  - Docker + MCP for external tool access and certain ingestion flows.
- **Optional**:
  - E2B for sandbox execution of untrusted or heavy workloads.
- Avoid introducing new core infra (e.g. additional databases, heavyweight frameworks) until the current architecture is stable.

### Consequences

- Implementation remains consistent with Alan’s existing tooling and skills.
- Future changes (e.g. separate worker services, alternative graph stores) can build on this baseline via the abstractions (GraphClient, LlmClient).

---

## D-014 – Jurisdiction-Neutral Core Prompts & Dynamic Profile Tags

**Status:** Accepted

### Context

The initial implementation had Ireland-centric prompts and hardcoded profile tags (e.g. `PROFILE_SINGLE_DIRECTOR_IE`). The new architecture should support multiple jurisdictions without rewriting core prompts.

### Decision

- Core system prompts (`REGULATORY_COPILOT_SYSTEM_PROMPT`, `GLOBAL_SYSTEM_PROMPT`, `/api/chat` SYSTEM_PROMPT) are **jurisdiction-neutral**.
- Jurisdiction and persona context are injected via:
  - Prompt aspects (`jurisdictionAspect`, `profileContextAspect`).
  - Dynamic profile tags constructed from persona + jurisdiction, e.g. `PROFILE_SINGLE_DIRECTOR_IE`, `PROFILE_SINGLE_DIRECTOR_MT`.
- Country-specific details live in:
  - Jurisdiction-specific agents (e.g. `SingleDirector_IE_SocialSafetyNet_Agent`).
  - Localised data in the graph.

### Consequences

- Adding a new jurisdiction usually means adding data and agents, not rewriting system prompts.
- Old hardcoded profile tags must be replaced with dynamic `getProfileTagId()` calls.

---

## D-015 – Prompt Aspects as the Only Way to Build System Prompts

**Status:** Accepted

### Context

Hand-building system prompts in multiple places leads to drift, missing disclaimers, and inconsistent jurisdiction handling.

### Decision

- All LLM calls must build their system prompts through the **prompt aspect** mechanism (e.g. `buildPromptWithAspects`, `createPromptBuilder`).
- The default aspect pipeline must include at least:
  - Jurisdiction context.
  - Agent context.
  - Profile/persona context.
  - Safety and non-advice disclaimers.

### Consequences

- Direct string concatenation of system prompts in agents and route handlers is **prohibited**.
- Any new concerns (e.g. additional safety checks, experiment flags) are added as new aspects rather than edits scattered around the codebase.

---

## D-016 – Provider-Agnostic LLM Router with Per-Tenant & Per-Task Policies

**Status:** Accepted

### Context

Larger EU customers may require:
- Local-only models for sensitive data.
- Different models for main chat vs background guard tasks.
- The ability to change providers without code changes.

### Decision

- The system uses a **provider-agnostic LlmRouter** that implements `LlmClient` and:
  - Supports multiple backends (OpenAI via Responses API, Groq, local/OSS HTTP endpoints, etc.).
  - Resolves provider/model based on **tenant + task** rather than hardcoded choices.
- A `TenantLlmPolicy` defines, per tenant:
  - Default provider/model.
  - Whether remote egress is allowed.
  - Overrides for specific tasks (e.g. `"egress-guard"`, `"pii-sanitizer"`, `"main-chat"`).

### Consequences

- Application and agent code specify **tasks**, not concrete models.
- Model/provider changes are handled in config/DB, not via redeploying code.
- It becomes straightforward to run everything on local models for some tenants while others use OpenAI/Groq.

---

## D-017 – OpenAI Responses API, Not Legacy Chat Completions

**Status:** Accepted

### Context

OpenAI is moving toward the **Responses API** as the unified interface for text, tools, and multimodal interactions. Legacy `/v1/chat/completions` is still available but no longer the preferred path.

### Decision

- When the `openai` provider is selected, the system must use **OpenAI’s Responses API** (`/v1/responses`), not legacy chat completions.
- Any existing code using `/v1/chat/completions` must be migrated.

### Consequences

- We gain access to newer models and capabilities without re-architecting later.
- The OpenAI backend implementation (`OpenAiResponsesClient`) can be reused in other projects.

---

## D-018 – Direct Memgraph GraphClient for Core Queries (No Memgraph MCP in Hot Path)

**Status:** Accepted

### Context

The original design leaned heavily on Memgraph MCP. While useful for LLM tool-calling, it adds overhead for core app queries and complicates streaming.

### Decision

- Core app code (Compliance Engine, agents, REST/WS endpoints) must use a **typed GraphClient** that talks directly to Memgraph via Bolt/HTTP.
- Memgraph MCP may still exist for:
  - Specific LLM tool-calling scenarios.
  - Experiments or POCs.
- But it is **not** the primary path for production graph queries.

### Consequences

- Lower latency, simpler error handling, easier typing.
- Graph streaming and patch generation can work directly from Memgraph without MCP indirection.

---

## D-019 – WebSocket Graph Streaming with Incremental Patches

**Status:** Accepted

### Context

The regulatory graph can become large. Polling full snapshots is inefficient and doesn’t reflect real-time changes well.

### Decision

- The UI loads an initial subgraph via REST (e.g. `GET /api/graph`).
- A WebSocket endpoint provides **incremental graph patches** (add/update/remove nodes/edges).
- Only deltas are sent over WS; full graph snapshots must **not** be pushed repeatedly.

### Consequences

- Graph visualisation remains responsive as the dataset grows.
- Backend must provide a patch format and maintain minimal state needed to generate patches.
- For debugging, an opt-in "full snapshot" endpoint is kept, but not used for normal live updates.

---

## D-020 – Engine + Demo App Split for Reuse

**Status:** Accepted

### Context

Alan has another Next.js/Supabase SaaS platform that needs to consume this functionality without reimplementing everything.

### Decision

- The repo is structured as:
  - `apps/demo-web` – reference Next.js app (chat UI + graph UI).
  - `packages/reg-intel-core` – Compliance Engine, agents, orchestrator.
  - `packages/reg-intel-graph` – GraphClient and Memgraph implementation.
  - `packages/reg-intel-llm` – LlmRouter, providers, egress guard integration.
  - `packages/reg-intel-prompts` – prompt aspects and base system prompts.
  - `packages/reg-intel-next-adapter` – helpers to mount the engine in any Next.js app.

### Consequences

- Other projects can import engine packages and mount their own `/api/reg-intel` endpoint.
- The demo app becomes a consumer of the engine, not the engine itself.
- This supports long-term reuse and cleaner separation of concerns.

---

## D-021 – Aspect-based graph ingress guard for Memgraph (normative)

**Status:** Accepted
**Date:** 2025-11-25

### Context

The global Memgraph instance stores only schema‑approved nodes and relationships representing public regulatory rules. It must never contain user/tenant data, PII, or scenario‑specific text. To enforce these constraints consistently across all write paths, we need a centralized mechanism that validates and filters all incoming data before it reaches the database.

### Decision

- All writes to the global Memgraph instance must go through a dedicated
  `GraphWriteService` that applies an ordered chain of **Graph Ingress
  Aspects**.
- Baseline aspects (schema validation, property whitelisting, static PII /
  tenant checks) are non‑removable and encode the guarantees from
  `data_privacy_and_architecture_boundaries_v_0_1.md` and
  `graph_ingress_guard_v_0_1.md`.
- Custom aspects (e.g. audit tagging, source annotation, future local LLM
  classification) may be configured via a registry+config mechanism, but may
  not weaken or bypass the baseline invariants.
- No component is allowed to issue raw Cypher write statements (`CREATE`,
  `MERGE`, `SET` on new nodes/relationships) directly against Memgraph outside
  the GraphWriteService.

See `docs/specs/graph_ingress_guard_v_0_1.md` for the detailed design of the
aspect pattern and the baseline/custom aspect split.

### Consequences

- All graph write operations must be channeled through GraphWriteService.
- Schema changes require updating both the schema spec and the ingress guard configuration.
- Privacy and data classification guarantees are enforced at the code level, not just by policy.
- Custom ingestion workflows can add domain‑specific metadata without compromising baseline protections.

---

These decisions define the **current desired state** of the `regulatory-intelligence-copilot` architecture. New ADRs/decisions should be appended here with incremental IDs (D-022, D-023, …) as the system evolves.

