# PROMPT.md – Implement the E2B RFC/OWASP Auditor

You are a coding agent working on a hackathon project called the **E2B RFC/OWASP Auditor**.

Your job is to implement the code **strictly following** the architecture and decisions already defined in this repository.

---

## 0. Read This First (Hard Requirements)

Before writing any code, you **must** fully read and internalise:

- `ARCHITECTURE.md`
- `DECISIONS.md`
- `AGENTS.md`

Treat them as **non‑negotiable constraints**. If anything in this prompt conflicts with those documents, **the documents win**.

Do **not** introduce features or dependencies marked as out of scope in `DECISIONS.md`.

---

## 1. High‑Level Goal

Implement a **chat‑centric** web app that:

1. Uses a **Next.js** front‑end with a single chat interface and a “Run audit” button.
2. Calls a single backend endpoint: **`POST /api/chat`**.
3. For audit requests, spins up an **E2B sandbox** that:
   - Runs a sample REST API (Express) inside the sandbox.
   - Probes its endpoints using native `fetch`.
   - Sanitizes HTTP transcripts with **`@redactpii/node`**.
   - Uses MCP tools (Perplexity MCP + Memgraph MCP) via an **MCP Gateway**.
   - Calls **Groq** as the LLM, wrapped in an **aspect/egress guard layer**.
   - Builds and queries a **self‑growing Memgraph graph** of RFCs and OWASP entries over time.

All user interactions – including running the audit – happen via the **chat**.

---

## 2. Repo Layout & Tooling

You are working in a monorepo with this intended structure:

```txt
.
├─ apps/
│  └─ web/                 # Next.js app (chat UI + /api/chat)
├─ packages/
│  ├─ auditor-core/        # E2B, HTTP probes, aspects, MCP & LLM clients, audit engine
│  └─ sample-api/          # Express REST API with intentional flaws + one golden endpoint
└─ docker/
   ├─ docker-compose.yml   # memgraph, memgraph-mcp, app (Perplexity via E2B)
   ├─ Dockerfile.app       # dev runtime for app
   └─ memgraph-init/       # optional tiny scripts (if needed later)
```

You may assume a Node 20+ environment with pnpm/npm and TypeScript.

The repo should also contain a `.devcontainer/devcontainer.json` that uses `docker/docker-compose.yml` to bring up all services in Codespaces/VS Code.

Follow any existing tooling conventions in the repo (e.g. ESLint, tsconfig, pnpm workspaces).

---

## 3. Implementation Order

Implement in this order to minimise thrash and surface area:

1. **Sample API** (`packages/sample-api`)
2. **Aspect Layer & Egress Guard** (`packages/auditor-core/aspects`)
3. **E2B Sandbox Control & HTTP Probing** (`e2bClient.ts`, `probeHttp.ts`)
4. **Sanitization** (`sanitizeHttp.ts`, `egressGuard.ts` usage)
5. **MCP Client & Graph Context** (`mcpClient.ts`, `graphContext.ts`)
6. **Groq Client & Audit Engine** (`groqClient.ts`, `auditEngine.ts`)
7. **Next.js Chat API & UI** (`/api/chat`, chat components, “Run audit” button)

Do not move on to later steps until the earlier ones are reasonably sketched out and type‑checked.

---

## 4. Detailed Tasks

### 4.1 `packages/sample-api` – Express REST API

Implement a small Express server with endpoints that demonstrate:

- `GET /health-perfect`
  - A **fully compliant**, secure endpoint with:
    - Correct HTTP semantics (status codes, headers).
    - No PII leaks.
    - No stack traces or debug info.

- `GET /user-leaky`
  - Returns user data with **excessive PII** or internal fields.

- `GET /debug-error`
  - Intentionally throws an error and returns a response with a stack trace / internal error details.

- `POST /items-injection`
  - Accepts JSON and naively interpolates user input into some data structure or query (simulate injection risk).

- `GET /cors-wildcard`
  - Misconfigured CORS headers (e.g., `Access-Control-Allow-Origin: *` with credentials or sensitive origins).

This server will run **inside the E2B sandbox** on `localhost`.

### 4.2 `packages/auditor-core/aspects` – Aspect Layer & Egress Guard

Implement:

- `applyAspects.ts`
  - Generic middleware engine:
    ```ts
    export type Aspect<Req, Res> = (
      req: Req,
      next: (req: Req) => Promise<Res>
    ) => Promise<Res>;

    export function applyAspects<Req, Res>(
      base: (req: Req) => Promise<Res>,
      aspects: Aspect<Req, Res>[]
    ): (req: Req) => Promise<Res>;
    ```

- `egressGuard.ts`
  - Wraps **`@redactpii/node`**.
  - Exposes helpers:
    - `sanitizeTextForEgress(text: string): string`.

- `mcpClient.ts`
  - Implements a low‑level MCP client to call the **MCP Gateway**.
  - Expose `mcpCall({ toolName, params })`.
  - Wrap `mcpCall` with aspects:
    - `mcpSanitizationAspect` → applies `sanitizeTextForEgress` to outbound text.
    - `mcpLoggingAspect` (optional, minimal logging, no full payload dumping).

- `groqClient.ts`
  - Implements a minimal Groq HTTP client (use env vars for API key & base URL).
  - Expose `groqChat({ messages, ... })` wrapped with:
    - `llmSystemPromptAspect` → prepend a system prompt describing the model as an RFC/OWASP auditor and emphasising that all inputs are sanitized.
    - `llmSanitizationAspect` → sanitize outbound content.

**Do NOT** add external AOP libraries; use only this homegrown aspect system.

### 4.3 `e2bClient.ts` & `probeHttp.ts` – Sandbox & Probing

- `e2bClient.ts`:
  - Use the current E2B Node SDK to:
    - Create a sandbox.
    - Upload/launch the `sample-api` server inside the sandbox.
    - Provide a way to run Node code inside the sandbox (for probing).

- `probeHttp.ts`:
  - Inside the sandbox, use **native `fetch`** to call `sample-api` endpoints:
    - `/health-perfect`, `/user-leaky`, `/debug-error`, `/items-injection`, `/cors-wildcard`.
  - For each call, construct a `RawHttpExchange` object with:
    - `request.{method,url,httpVersion,headers,body}`
    - `response.{httpVersion,statusCode,statusMessage,headers,body}`

No HAR or third‑party tracing libraries.

### 4.4 `sanitizeHttp.ts` – Sanitization

Implement `sanitizeHttp.ts` to convert `RawHttpExchange[]` → `SanitizedHttpExchange[]`:

- Remove or mask sensitive headers (Authorization, Cookie, Set-Cookie, X-Api-Key, etc.).
- Normalize URLs by templating path segments that look like IDs.
- Use `sanitizeTextForEgress` on:
  - Any header values you keep.
  - A `bodyPreview` field (short, truncated, safe).
- Preserve enough structure for the LLM+MCP to reason about RFC/OWASP.

Ensure that *only* `SanitizedHttpExchange` or derivatives ever go into MCP/LLM calls.

### 4.5 `mcpClient.ts` & `graphContext.ts` – MCP & Memgraph Graph

Enhance `mcpClient.ts` to:

- Support calling **Perplexity MCP** and **Memgraph MCP** via the MCP Gateway.
- Handle basic tool invocation structure (tool name, arguments, results).

Implement `graphContext.ts`:

- `discoverAndUpsertSpecs(context)`:
  - Use Perplexity MCP to discover **relevant RFCs and OWASP entries** based on:
    - Sanitized HTTP exchanges.
    - Optional user question text.
  - Use Perplexity MCP again to fetch details for those specs (titles, section IDs, relationships).
  - Upsert these into Memgraph via Memgraph MCP using Cypher (e.g., `MERGE` RFC/OWASP nodes and their edges).

- `fetchGraphContextForFindings(specs)`:
  - Use Memgraph MCP to run Cypher queries that:
    - Retrieve RFC, Section, OWASP, and Concept nodes that relate to the current findings.
  - Return a normalized `GraphContext` object suitable for both:
    - LLM context (GraphRAG‑lite).
    - Optional UI visualization.

Memgraph starts empty (or near empty). Do not pre‑seed large RFC lists.

### 4.6 `auditEngine.ts` – Orchestration

Implement `runAuditOnSampleApi()` in `auditEngine.ts` to:

1. Create an E2B sandbox.
2. Launch the `sample-api` server inside the sandbox.
3. Call `probeSampleApi()` to get `RawHttpExchange[]`.
4. Sanitize to `SanitizedHttpExchange[]`.
5. Call `discoverAndUpsertSpecs()` to populate/extend Memgraph.
6. Call `fetchGraphContextForFindings()` to get a `GraphContext`.
7. Call `analyzeComplianceWithGroq()` (in `groqClient` or a dedicated module) with:
   - `probes: SanitizedHttpExchange[]`
   - `specs: EnrichedSpec[]`
   - `graphContext: GraphContext`
8. Return a `ComplianceReport` object summarising:
   - Per‑endpoint issues and severities.
   - Referenced RFCs and OWASP categories.
   - Suggested improvements.

### 4.7 `apps/web` – Chat API & UI

- Implement `POST /api/chat`:
  - Accept full chat history (user + assistant messages).
  - Inspect the **last user message**:
    - If it matches the "run audit" intent (e.g. contains a special token or fixed phrase):
      - Call `runAuditOnSampleApi()`.
      - Convert `ComplianceReport` into:
        - An assistant message summarising findings.
        - Optional `report` field for UI.
    - Else:
      - Call `groqChat()` with the chat history (and optionally recent `GraphContext`) for general Q&A.

- Implement the React chat UI:
  - A simple message list and input.
  - A "Run audit" button that **does not** call `/api/audit`; it injects a chat message instead.
  - Optionally display:
    - A table of endpoints with findings.
    - A small graph view (e.g. using a simple force‑directed or node‑link layout) based on `GraphContext`.

---

## 5. Constraints & Guardrails

While coding, you **must** obey these constraints:

1. **Do not introduce out‑of‑scope dependencies**:
   - No AOP libs, HAR libs, heavy GraphRAG frameworks, or browser automation.
2. **Do not bypass the egress guard**:
   - All outbound calls to MCP and Groq must go through the aspect‑wrapped clients.
3. **Do not leak `RawHttpExchange` outside the sandbox**.
4. **Do not add extra API routes** beyond `/api/chat` for app functionality.
5. **Do not hardcode large RFC/OWASP datasets** into Memgraph.

If you encounter ambiguity, prefer solutions that:

- Keep the architecture consistent with `ARCHITECTURE.md`.
- Keep the scope inside `DECISIONS.md`.
- Respect the agent responsibilities in `AGENTS.md`.

---

## 6. What “Done” Looks Like

The implementation is considered successful when:

- `pnpm dev` (or equivalent) in the dev container brings up:
  - Next.js app at `http://localhost:3000`.
  - Supporting services via Docker Compose (Memgraph, Memgraph MCP, Perplexity MCP, MCP Gateway).
- A user can:
  - Open the app in a browser.
  - See a chat interface.
  - Click “Run audit on sample API”.
  - Receive a chat response with:
    - A human‑readable summary of issues per endpoint.
    - References to specific RFCs and OWASP Top 10:2021 (and any newer ones discovered).
  - Optionally see a small visualization of the relevant spec graph.
- Subsequent audits or questions cause Memgraph to grow with more RFC/OWASP nodes and relationships, and Groq uses that context for richer explanations.

Follow this prompt and the referenced documents closely. Avoid creative reinterpretation; the goal is a **precise implementation** of an already‑agreed design.
