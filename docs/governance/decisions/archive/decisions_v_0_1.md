# DECISIONS

> Architectural & product decisions for the **regulatory-intelligence-copilot** fork.
>
> Legacy decisions from the original `rfc-refactor` (HTTP/RFC/OWASP auditor) are **not** carried forward unless explicitly restated here.

---

## D-001 – Pivot from HTTP/RFC Auditor → Regulatory Intelligence Copilot

**Status:** Accepted  
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

**Status:** Accepted

### Context

The original project had both a chat and a separate “audit” flow. This added complexity without real value for the new domain.

### Decision

- The product is **chat-first**.
- There is a single backend HTTP API: `POST /api/chat`.
- All capabilities (regulatory questions, scenarios, explanations) flow through this chat endpoint.

### Consequences

- Frontend focuses on one coherent user flow.
- No dedicated “Run Audit” button or separate audit pages.
- If needed, UI buttons simply prefill chat prompts rather than hit separate APIs.

---

## D-003 – Graph-First Reasoning with Memgraph

**Status:** Accepted

### Context

Naïve RAG over PDFs/statutes is poor at:
- Capturing cross-references between rules.
- Explaining mutual exclusions and side effects.
- Handling time-based constraints.

### Decision

- **Memgraph** is the primary source of truth for regulatory rules and relationships.
- The system models:
  - Statutes, sections, benefits, reliefs, conditions, timelines, case law, guidance, EU instruments.
  - Edges for `CITES`, `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `IMPLEMENTED_BY`, `INTERPRETS`, etc.
- LLMs do **not** own the rules; they explain what the graph says.

### Consequences

- All ingestion jobs must conform to **`graph_schema_v0_1.md`**.
- Agents must use standard query patterns (see graph schema spec).
- Graph is rule/relationship-only, not user-specific data.

---

## D-004 – E2B Sandbox + MCP Gateway as Isolation Boundary

**Status:** Accepted

### Context

The original hackathon work already used E2B sandboxes and MCP. For a regulatory tool dealing with personal & financial details, isolation and egress control are even more important.

### Decision

- All heavy logic (agents, graph queries, ingestion helpers) runs **inside an E2B sandbox**.
- All network calls from the sandbox go through a **Docker MCP gateway**:
  - `memgraph-mcp` for graph access.
  - `llm-groq-mcp` for LLM calls.
  - `legal-search-mcp` and similar tools for external documents.
- No direct outbound HTTP from sandbox code.

### Consequences

- The sandbox runtime becomes the main execution environment for agents.
- Local development wiring is slightly more complex (Docker + MCP gateway + Memgraph), but security and clarity improve.

---

## D-005 – Egress Guard & Privacy

**Status:** Accepted

### Context

Questions will often contain personal and financial details. These must not be sent unfiltered to external LLMs or search MCPs.

### Decision

- A dedicated **egress guard** module is mandatory for all outbound payloads.
- It must:
  - Redact obvious PII (names, addresses, PPSNs, IBANs, emails, phones).
  - Bucket or obfuscate financial amounts where feasible.
  - Strip unnecessary narrative details, focusing prompts on rules and relationships.
- Only graph-safe identifiers (rule IDs, node IDs, profile tags) and abstracted scenario data may leave the sandbox.

### Consequences

- Some prompts become more abstract, but privacy is respected.
- Redaction logic is centralised and testable (`packages/egress-guard`).

---

## D-006 – LLM Role: Explainer, Not Authority

**Status:** Accepted

### Context

LLMs are powerful but can hallucinate or oversimplify legal rules. They must not be treated as authoritative sources of law or personalised advice.

### Decision

- LLMs (Groq-hosted or others) are used to:
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

**Status:** Accepted

### Context

The regulatory space is too broad for a single monolithic agent, but users want a single entry point. Alan also wants personas like "single director company" and "self-employed welfare" baked into the system.

### Decision

- Implement **domain-specific agents** (see `AGENTS.md`), e.g.:
  - Single-Director Company (IE)
  - Welfare Benefits (IE)
  - CGT & Investments (IE)
  - R&D Tax Credit (IE)
  - EU Law Agent
- Implement a **GlobalRegulatoryComplianceAgent** that:
  - Is the default entry point.
  - Orchestrates domain agents as needed.
  - Merges their outputs into a coherent response.

### Consequences

- The orchestrator must include simple intent routing (“which agent(s) should handle this?”).
- Agents share common utilities (graph client, timeline engine, egress guard) to avoid duplication.

---

## D-008 – Timeline Engine as a First-Class Component

**Status:** Accepted

### Context

Many rules depend on time:
- Lookback windows for contributions.
- Lock-in periods for reliefs.
- Deadlines and effective dates.

Scattering date math across agents is error-prone and hard to explain.

### Decision

- A dedicated **Timeline Engine** module is introduced (see `timeline_engine_v0_1.md`).
- It provides pure functions like:
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

## D-009 – Initial Jurisdiction & Scope

**Status:** Accepted

### Context

The architecture is globally extensible, but implementation time and data availability are limited. Alan’s immediate pain and advantage are in the Irish context.

### Decision

- Initial focus:
  - Jurisdiction: **Ireland**, plus relevant EU law.
  - Personas: self-employed, single-director company, investors (CGT), small advisors.
  - Domains: tax, social welfare, pensions, CGT, R&D credits, EU social security coordination.
- Other jurisdictions may be added later via new node labels, profile tags, and agents.

### Consequences

- Ingestion jobs and tests can be opinionated about Irish statutes and bodies (Revenue, DSP, Pensions Authority, TAC, etc.).
- Code should not hardcode Ireland everywhere; it should allow adding `jurisdiction` as a dimension.

---

## D-010 – Data Ingestion Strategy (Static + On-Demand Enrichment)

**Status:** Accepted

### Context

Regulations change slowly, but guidance and case law can update frequently. It is impractical to model *everything* upfront.

### Decision

- Use a **hybrid ingestion approach**:
  - Seed the graph with a **curated subset** of high-value rules (core statutes & benefits for target personas).
  - Allow **on-demand enrichment**:
    - When agents detect gaps, they call `legal-search-mcp`.
    - The sandbox parses results into nodes/edges and upserts them into Memgraph.
- Do **not** store user-specific data in the graph.

### Consequences

- The graph grows over time based on real questions.
- Early versions may be sparse; that’s acceptable as long as uncertainty is surfaced.

---

## D-011 – Non-Advice Positioning & Safety Language

**Status:** Accepted

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
- Any future features that look like “decision engines” must be framed as scenario explorers, not definitive advice.

---

## D-012 – Legacy Code Handling from `rfc-refactor`

**Status:** Accepted

### Context

The original repo contains working integrations (E2B, MCP gateway, Memgraph connection, chat plumbing) mingled with HTTP audit-specific logic.

### Decision

- **Keep**:
  - E2B integration and sandbox utilities.
  - MCP gateway wiring.
  - Memgraph client wrappers.
  - Chat UI and `/api/chat` plumbing.
  - Any generic redaction or logging utilities that are not HTTP-specific.
- **Remove or archive**:
  - Sample HTTP API and probe runners.
  - OWASP and RFC-specific models, types, and hardcoded rules.
  - Audit report components and HTTP transcript visualisation.

### Consequences

- The codebase is cleaner and aligned to the new mission.
- Some early functionality is lost (API auditing) but that is *intended*.

---

## D-013 – Tech Stack Boundaries

**Status:** Accepted

### Context

The original project used TypeScript, Next.js, E2B, and Docker + MCP. We want to simplify where possible but not churn the entire stack.

### Decision

- **Keep**:
  - TypeScript as the primary language.
  - Next.js (App Router) for the web app.
  - E2B for sandbox execution.
  - Docker + MCP for external tool access.
  - Memgraph as the graph database.
- Avoid introducing new core infra (e.g. additional databases, heavy graph frameworks) in v0.1.

### Consequences

- Implementation remains consistent with Alan’s existing tooling and skills.
- Future changes (e.g. adding a separate worker service) can build on this baseline.

---

These decisions define the **desired state** of the forked repo. New ADRs/decisions should be appended here with incremental IDs (D-014, D-015, …) as the system evolves.

