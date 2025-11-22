# E2B RFC/OWASP Auditor – Key Decisions

This document captures the **frozen decisions** for the hackathon implementation so coding agents can execute without re‑debating scope.

---

## 1. Core Product & Scope

1. **Primary identity**
   - The project is **first and foremost**:
     - An *RFC + OWASP Top 10 auditor for HTTP APIs*,
     - Powered by an **E2B sandbox** and **MCP tools**,
     - With a **self‑growing spec graph** in Memgraph.
   - The **Aspect/Egress Shell** (around MCP/LLM) is the *engine* that makes this safe and reusable.

2. **Protocols supported**
   - Only **HTTP REST** endpoints are supported for this hackathon.
   - No GraphQL/WebSockets for now, but design should not block them in future.

3. **Target API for audits**
   - The hackathon demo targets the **bundled sample API** (`packages/sample-api`) running **inside the E2B sandbox**.
   - User‑supplied external URLs are not in scope for this weekend.

---

## 2. User Experience & API Surface

4. **Single chat‑centric flow**
   - There is only **one HTTP endpoint** on the backend: `POST /api/chat`.
   - The UI is a **chat interface** with an additional "Run Audit" button.
   - Pressing "Run Audit" **injects a synthetic user message** (e.g. `__RUN_SAMPLE_AUDIT__`) into the chat, and then calls `/api/chat`.
   - The server uses the latest user message to decide whether to:
     - Run the full audit pipeline (`runAuditOnSampleApi()`), or
     - Answer a general question via `groqChat()`.

5. **No separate /api/audit or /api/refactor routes**
   - All functionality (audit, explanation, refactors) is mediated via `/api/chat`.

6. **UI scope**
   - Minimal but polished Next.js + shadcn UI:
     - Chat history (user + assistant messages).
     - "Run audit" button (chat macro).
     - Optional per‑audit details below the chat:
       - Endpoint table with RFC/OWASP findings.
       - Optional mini graph view of consulted RFCs/OWASP categories.
   - No login/auth, no user accounts.

---

## 3. E2B & Sandbox Behaviour

7. **Sandbox as secure enclave**
   - The E2B sandbox runs:
     - The **sample API** (Express server bound to localhost).
     - The **HTTP probe** client.
     - The **aspect‑wrapped MCP and Groq clients**.
   - **Raw HTTP transcripts** (requests + responses) **never** leave the sandbox.

8. **Outbound network restrictions**
   - Application code inside the sandbox **must not** call arbitrary external URLs.
   - Outbound network calls are allowed **only** to:
     - The **MCP Gateway** (Docker MCP Toolkit gateway), and
     - The **Groq LLM API**.
   - Every outbound call passes through the **egress guard** aspects.

---

## 4. HTTP Probing and Sanitization

9. **HTTP probe implementation**
   - Use **native `fetch`** (Node 20+) inside the sandbox to probe endpoints.
   - Build a custom `RawHttpExchange` object (no HAR/third‑party libs).

10. **Sanitization library**
   - Use **`@redactpii/node`** as the **only** PII scrubber.
   - Expose it via a small helper module (`egressGuard.ts`) so the rest of the code does not use it directly.

11. **Sanitized HTTP exchange shape**
   - `SanitizedHttpExchange` must:
     - Preserve method, HTTP version, status code, status text.
     - Preserve header **names** and high‑level semantics.
     - Remove or heavily redact header **values** that may contain secrets or PII (`Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, etc.).
     - Normalize paths (e.g. `/user/123` → `/user/{id}`).
     - Optionally include:
       - `bodyKind` (json/text/html/binary/unknown).
       - A scrubbed, truncated `bodyPreview` processed through `@redactpii/node`.

12. **Sanitization boundary**
   - `RawHttpExchange` exists **only inside** the E2B sandbox.
   - Any data leaving the sandbox (to MCPs/LLMs) must be derived from `SanitizedHttpExchange` or other already‑scrubbed structures.

---

## 5. Aspect Layer & Egress Guard

13. **Aspect mechanism**
   - Implement a minimal **homegrown aspect/middleware** mechanism:
     - `applyAspects<Req, Res>(base, aspects[])`.
   - Do **not** add external AOP/interceptor libraries (e.g. kaop-ts, AspectJS).

14. **Where aspects apply**
   - Wrap both:
     - The **MCP client** (`mcpCall`), and
     - The **Groq client** (`groqChat`) with aspects.

15. **Aspects for MCP client**
   - **Mandatory** aspects:
     - `mcpSanitizationAspect` – runs `@redactpii/node` via `egressGuard` over outbound payloads.
   - **Optional** aspects (nice to have):
     - `mcpLoggingAspect` – logs tool name and timing without dumping full payloads.

16. **Aspects for Groq client**
   - **Mandatory** aspects:
     - `llmSystemPromptAspect` – injects base system prompt describing:
       - The model as an RFC/OWASP compliance auditor.
       - That it will only see sanitized HTTP summaries and spec data.
       - That it should use RFC and OWASP as ground truth.
     - `llmSanitizationAspect` – applies `@redactpii/node` to outbound messages.
   - Optionally sanitize inbound text before returning to the caller.

17. **Egress guard story**
   - The egress guard (aspects + PII scrubber) is a **headline feature**:
     - No raw secrets or PII are ever sent to Perplexity MCP, Memgraph MCP, or Groq.
     - This demonstrates E2B as a secure agent runtime.

---

## 6. MCP & LLM Choices

18. **MCP tools in scope**
   - Use exactly **two** MCP servers behind the MCP Gateway:
     - **Perplexity MCP** – research / reasoning about RFCs & OWASP.
     - **Memgraph MCP** – Cypher queries against Memgraph DB.
   - **No** Browserbase MCP or other extra tools for this hackathon.

19. **LLM provider**
   - Use **Groq** as the **only** LLM backend.
   - No OpenAI/Anthropic fallbacks.

20. **Groq usage**
   - Groq is used for:
     - Interpreting HTTP probes + spec/graph context.
     - Generating structured `ComplianceReport` objects.
     - Answering user questions in chat.
     - Providing **suggested refactors** for the sample API endpoints.

---

## 7. Memgraph & GraphRAG‑Lite

21. **Memgraph persistence**
   - Run Memgraph in Docker with a **persistent volume** (`memgraph_data`).
   - The graph should survive container restarts.

22. **No hardcoded RFC data**
   - Do **not** pre‑seed Memgraph with a fixed list of RFCs or OWASP entries.
   - The DB may start fully empty or contain only a trivial root node.

23. **Dynamic spec discovery**
   - On each audit / question:
     - Use **Perplexity MCP** to discover relevant RFC IDs and OWASP entries.
     - Use Perplexity MCP again to fetch titles, key sections, and relationships.
     - Upsert this data into Memgraph via **Memgraph MCP**.

24. **Graph usage pattern (GraphRAG‑lite)**
   - Before calling Groq for analysis:
     - Query Memgraph for already‑known RFCs, sections, and OWASP nodes relevant to the current case.
   - After Perplexity identifies new specs, **upsert** them into Memgraph again.
   - This produces a growing RDF/OWASP graph that future audits can reuse.

25. **OWASP version awareness**
   - OWASP nodes must include a `version` property (e.g. 2017, 2021, 2025).
   - The system must be able to:
     - Represent multiple versions of OWASP Top Ten.
     - Add edges like `(:OWASP {version:"2025"})-[:SUPERSEDES]->(:OWASP {version:"2021"})`.

26. **Future GraphRAG frameworks**
   - Do **not** integrate heavy GraphRAG frameworks (Microsoft GraphRAG, LangGraph, etc.) for this hackathon.
   - The design must allow plugging them in later without massive rewrites.

---

## 8. Sample API & Findings

27. **Sample API endpoints**
   - Implement at least 5 endpoints:
     - 1 **golden** (fully compliant & safe): `GET /health-perfect`.
     - 4 **intentionally flawed** endpoints (PII leaks, stack traces, injection, CORS misconfig, etc.).

28. **Audit expectations**
   - The audit should:
     - Correctly identify issues in flawed endpoints.
     - Reference relevant RFCs and OWASP categories.
     - Recognize the golden endpoint as compliant.

29. **Refactor support**
   - Provide at least one example of **code refactor** instructions for the sample API, generated by Groq using the same spec/graph context.
   - General “upload arbitrary code” refactor is **out of scope** for this hackathon.

---

## 9. Dev Environment & Tooling

30. **Monorepo layout**
   - Use a simple monorepo:
     - `apps/web` (Next.js app).
     - `packages/auditor-core` (core TS library).
     - `packages/sample-api` (Express server).

31. **Dev container**
   - Provide `.devcontainer/devcontainer.json` using `docker/docker-compose.yml`.
   - `docker-compose.yml` must define:
     - `app` service.
     - `memgraph` service with persistent volume.
     - `memgraph-mcp` service.
   - Perplexity MCP is provided through E2B's built-in Docker Hub MCP support (no local fallback).

32. **Dependencies**
   - Use:
     - `next`, `react`, `react-dom`, Tailwind, shadcn/ui, etc. for UI.
     - `express` (or similar) for sample API.
     - `@redactpii/node` for PII sanitization.
     - `@e2b/sdk` (or current E2B Node SDK) for sandbox management.
   - Avoid:
     - AOP libs, HAR libs, heavy GraphRAG libs.

---

## 10. Out‑of‑Scope (for Hackathon)

33. **Explicitly out of scope**
   - Arbitrary external API auditing (user‑specified URLs).
   - Full GraphRAG pipelines with ingestion of large external corpora.
   - Browser automation (Browserbase MCP, Playwright, etc.).
   - Authentication / multi‑tenant user management.
   - Full test automation suite beyond a few focused examples.

These decisions should be treated as **constraints** for all coding agents and contributors until after the hackathon. Changes to this document should be treated as scope changes and made consciously, not accidentally.

