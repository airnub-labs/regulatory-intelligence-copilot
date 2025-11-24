# MIGRATION_PLAN

## Overview

This plan describes how to fork and transform the existing `rfc-refactor` repository from an HTTP API/RFC auditor into a **Regulatory Intelligence Copilot** for Irish tax, welfare, pensions, CGT, and EU law.

We will:

- **Preserve**: working infrastructure (Next.js app, E2B sandbox integration, MCP gateway, Memgraph graph backend, basic chat flow, sanitisation/egress guard).
- **Remove**: legacy API-auditing-specific logic (sample API, probe runners, OWASP/RFC hardcoding, audit UI).
- **Add**: regulatory domain agents, legal/regulatory graph schema, timeline and mutual exclusion logic, and a foundation for change tracking & notifications.

This is a **clean business-logic pivot**: keep the plumbing, replace the purpose.

---

## 1. Repository Setup & Renaming

1. **Fork `airnub-labs/rfc-refactor`** into a new repo (e.g. `reg-intel-copilot` or similar).
2. Update base metadata:
   - `package.json` name/description.
   - Repo README to reflect the new concept.
   - Any references to "RFCRefactor" or "API auditor" → new product name.
3. Keep the existing monorepo structure if it’s already set up (apps/, packages/, etc.). We will re-use:
   - The Next.js chat app.
   - Any existing shared libraries that are infra-focused (E2B client, MCP gateway wrapper, Memgraph client, sanitiser).

---

## 2. Preserve Core Infrastructure

### 2.1 Next.js Chat App

**Keep**:

- The chat-based UX (single conversation stream rather than a complex dashboard).
- The main API route (e.g. `/api/chat`) that:
  - Receives user messages.
  - Calls backend orchestration.
  - Streams responses back to the UI.

**Change**:

- Remove any code paths that trigger a "run audit" or special HTTP probe mode.
- Rename UI labels so everything is about **questions** and **explanations**, not "audits".

### 2.2 E2B Sandbox & MCP Gateway

**Keep**:

- E2B client integration and sandbox configuration.
- The MCP gateway pattern:
  - E2B sandbox is the place that can call MCP tools (including Memgraph MCP).
  - Outbound calls to external services go via MCP endpoints.

**New focus**:

- Instead of running HTTP probes and test requests, the sandbox will:
  - Run ingestion/maintenance jobs (parsing PDF/HTML law texts into graph nodes).
  - Run scenario calculators that work with regulatory rules and timelines.

### 2.3 Memgraph

**Keep**:

- Memgraph as the main graph store (via its MCP server or direct driver).
- The idea of a **graph context** that the LLM reasons over.

**Change**:

- Replace OWASP/RFC node types with **law/regulation/benefit/condition/timeline** node types.
- Replace edges like "relates_to_RFC" with edges like `CITES`, `EXCLUDES`, `REQUIRES`, `LOOKBACK_WINDOW`, etc.

### 2.4 Sanitisation / Egress Guard

**Keep**:

- Any aspect or interceptor that strips or masks PII before sending to external LLMs/MCP.

**Change**:

- Ensure sanitisation is oriented around **personal & financial data** (names, addresses, PPSNs, exact amounts), not HTTP headers.

---

## 3. Remove Legacy API-Auditing Code

### 3.1 Sample API & Probes

Remove:

- `sample-api` or equivalent test HTTP server.
- HTTP probe runner modules (curl/wrk wrappers, probe orchestrators).
- Any TypeScript types and enums for HTTP findings, OWASP categories, etc.

### 3.2 OWASP & RFC Specific Logic

Remove or archive:

- Modules that:
  - Fetch OWASP Top 10 data.
  - Map findings to OWASP categories.
  - Fetch or hardcode RFCs and HTTP spec sections.
- Audit-specific orchestration functions (e.g. `runAudit`, `analyzeCompliance`) that assume HTTP endpoints.

### 3.3 UI Components for Audits

Remove or refactor:

- Audit report tables/cards.
- UI that lists endpoints, vulnerabilities, headers.
- Button labels like "Run Audit", "View HTTP Transcript".

Replace with:

- A single chat view that shows:
  - Question.
  - Answer.
  - Optional "rule references" section.

---

## 4. Introduce Regulatory Domain & Agent Layer

### 4.1 Add `AGENTS.md`

Use the AGENTS spec we defined (in canvas) as the source of truth.

Agents to implement first:

- `GlobalRegulatoryComplianceAgent`
- `SingleDirector_IE_SocialSafetyNet_Agent`
- Optionally `IE_CGT_Investor_Agent` if you want CGT early.

### 4.2 Backend Orchestration Changes

In the backend (e.g. `apps/web/app/api/chat/route.ts` or similar):

1. **Replace audit intent detection** with:
   - A simple classifier/heuristic that decides which agent(s) to invoke:
     - If user mentions "director", "company", "corporation tax" → SingleDirector agent.
     - If they mention "Jobseeker", "Illness Benefit", "PRSI" → Welfare agent.
     - If they mention "CGT", "capital gains", "shares" → CGT agent.
     - Otherwise → Global agent.
2. **Call the agent runner**:
   - Agent gets:
     - User question.
     - Sanitised profile (if any).
     - Access to Memgraph via a graph client.
     - Access to MCP tools (legal search, etc.).
3. Agent returns:
   - Answer text.
   - List of cited nodes/sections.
   - Optional follow-up queries.

### 4.3 Agent Runner Implementation

Create a `packages/compliance-core` (or rename `auditor-core`) with:

- `agents/GlobalRegulatoryComplianceAgent.ts`
- `agents/SingleDirector_IE_SocialSafetyNet_Agent.ts`
- etc.

Each agent should:

- Accept a structured `AgentContext` (graph client, mcp client, user profile, time zone).
- Run graph queries to find relevant rules.
- Optionally call external MCP tools to discover new rules.
- Use an LLM (Groq) with a strongly constrained prompt to:
  - Explain rules.
  - Summarise graph paths.
- Guarantee they never treat output as legal/tax advice.

---

## 5. Knowledge Graph Schema & Ingestion

### 5.1 Schema Design

Define an initial schema, for example:

**Node labels**

- `:Statute` (e.g. Taxes Consolidation Act 1997)
- `:Section` (e.g. s.81, s.766)
- `:Benefit` (e.g. Jobseeker's Benefit)
- `:Relief` (e.g. R&D tax credit)
- `:Condition` (eligibility constraints)
- `:Timeline` (windows, deadlines, periods)
- `:Case` (TAC or court decision)
- `:Guidance` (Revenue manuals, DSP guidance)
- `:EURegulation` / `:EUDirective`

**Edge types**

- `CITES` / `REFERENCES`
- `EXCLUDES` / `MUTUALLY_EXCLUSIVE_WITH`
- `REQUIRES`
- `LIMITED_BY`
- `LOOKBACK_WINDOW` (with properties `days`, `months`)
- `LOCKS_IN_FOR_PERIOD` (with properties `years`, `months`)
- `IMPLEMENTED_BY` (EU → Irish law)
- `INTERPRETS` / `NARROWS` / `EXPANDS` (Case → Section/Benefit)

### 5.2 Initial Data Load

Implement a one-off ingestion pipeline in the E2B sandbox:

- Sources (for MVP):
  - TCA sections relevant to:
    - Corporation tax rates for small companies.
    - CGT basic rules.
    - R&D credit section(s).
  - Key Social Welfare acts for core benefits.
- Parse these into nodes/edges and upsert via Memgraph queries.

### 5.3 On-Demand Enrichment

Re-use the original "discover & upsert" pattern:

- When an agent encounters a question for which the graph is sparse:
  - Use a legal MCP tool / LLM to fetch or infer relevant sections/cases.
  - Upsert new nodes/edges.
- Over time, the graph grows richer, exactly like the RFC graph did, but with law.

---

## 6. Timeline, Mutual Exclusion & Dependency Logic

### 6.1 Timeline Engine

Implement a small timeline helper module in `compliance-core`:

- Functions to:
  - Add/subtract years/months/days from dates.
  - Check if a date falls within a range.
- Integrate with graph:
  - Given a `:Timeline` node, compute concrete dates relative to `today`.

Agents use this to:

- Answer “when is this due?” questions.
- Analyse “if I wait N months, do new options open?” scenarios.

### 6.2 Mutual Exclusions & Lock-Ins

Agents must:

- Query for `EXCLUDES` and `MUTUALLY_EXCLUSIVE_WITH` edges relevant to the current context.
- Check for `LOCKS_IN_FOR_PERIOD` edges before suggesting that two reliefs can coexist.

The LLM prompt should:

- Explicitly instruct: "Always check for exclusion and lock-in edges and mention them if present."

### 6.3 Cross-Rule Dependencies

Use `REQUIRES`, `LIMITED_BY`, and `IMPLEMENTED_BY` edges to:

- Express that certain benefits require specific PRSI classes, income types, or previous contributions.
- Express that certain domestic rules depend on EU rules.

Agents must:

- Traverse these dependencies and include them in explanations.

---

## 7. MCP Tools & Change Tracking

### 7.1 MCP Tooling

Reconfigure the MCP layer to point at:

- A legal/knowledge search MCP (or generic search MCP configured for gov.ie, revenue.ie, eur-lex.europa.eu, etc.).
- The Memgraph MCP server for graph queries.

### 7.2 Change Detection & Notifications

Add a simple skeleton for change tracking:

- Periodic job (can be run via E2B or external) that:
  - Calls MCP search for new:
    - Revenue eBriefs.
    - TAC decisions.
    - Pensions Authority updates.
    - DSP/gov.ie welfare updates.
    - EU regulations/judgments.
  - Parses references to sections/benefits.
  - Upserts `:Update` / `:Case` / `:Guidance` nodes and edges.
- Maintain a mapping from **user profiles** to relevant nodes.
- For now, store "notifications" in a simple table or JSON file with:
  - userId, ruleNodeId, summary.

UI can later surface these notifications as "There’s been a change that might affect you".

---

## 8. Frontend UX Adjustments

### 8.1 Chat-First UX

Keep the chat page as the primary surface:

- Simplify:
  - No separate "audit" page.
  - Single input box + message list.
- Enhance:
  - Show "Agent" used in each answer (e.g. Global vs Single Director).
  - Show "Key rules referenced" as a small list under each answer.

### 8.2 Optional Profile Capture

Optionally add a minimal profile form:

- Jurisdiction (fixed to Ireland initially).
- Person type (self-employed / single director / PAYE only / investor).
- Rough age band.

This helps agents tailor graph queries, but keep it optional and clearly documented for privacy.

---

## 9. Testing & Hardening

### 9.1 Unit Tests

Add tests for:

- Graph query helpers.
- Timeline calculations.
- Mutual exclusion and lock-in detection logic.

### 9.2 E2B & MCP Integration Tests

- Verify the sandbox can:
  - Connect to Memgraph MCP.
  - Run graph queries.
  - Call legal search MCPs safely (with sanitisation).

### 9.3 Safety & Non-Advice Compliance

- Bake guardrails into prompts and tests:
  - Check that outputs include disclaimers when giving anything that looks like advice.
  - Confirm that PII is redacted before hitting external tools.

---

## 10. Rollout Strategy

1. **Phase 1 – Minimal Vertical Slice**
   - Implement Global + SingleDirector_IE agent on top of a small subset of tax + welfare rules.
   - Basic chat + graph queries working end-to-end.

2. **Phase 2 – Enrich Graph & Add CGT**
   - Ingest more statutes and benefits.
   - Implement CGT/Investor agent with timing logic.

3. **Phase 3 – Notifications & Advisors**
   - Basic change tracking + notifications.
   - Advisor-focused features (multiple client profiles, saved cases, etc.).

This plan lets you refactor the `rfc-refactor` infrastructure into a powerful regulatory intelligence platform while staying grounded in what already works: E2B + MCP + Memgraph + chat-first UX.

