# E2B RFC/OWASP Auditor – Architecture

> **Goal:** A chat‑driven agent that runs inside an E2B sandbox, audits HTTP APIs for RFC + OWASP Top 10:2021 (and future) compliance, and gets smarter over time by building a Memgraph‑backed spec graph via MCP.

---

## 1. High‑Level Overview

The system is a **single chat‑centric web app** that:

1. Runs in a **Next.js** front‑end (`apps/web`) with a single chat UI.
2. Talks to a single backend endpoint: **`POST /api/chat`**.
3. Uses an **auditor core library** (`packages/auditor-core`) that:
   - Spins up **E2B sandboxes** per audit.
   - Runs a **sample REST API** inside the sandbox (`packages/sample-api`).
   - Probes that API via HTTP to collect **Raw HTTP Exchanges**.
   - Sanitizes them with **@redactpii/node**, producing **Sanitized HTTP Exchanges**.
   - Calls MCP tools (Perplexity MCP + Memgraph MCP) via a centralized **MCP Gateway**.
   - Uses **Groq** as the LLM, wrapped in an **aspect layer** for system prompts and sanitization.
   - Builds and queries a **Memgraph graph DB** of RFCs, sections, and OWASP categories over time (GraphRAG‑lite).

The entire user experience is **one coherent conversation**. Pressing “Run Audit” simply injects a special chat message that triggers the audit pipeline – no separate flows.

---

## 2. Codebase Structure

```txt
.
├─ apps/
│  └─ web/                 # Next.js app (chat UI + /api/chat)
├─ packages/
│  ├─ auditor-core/        # E2B control, HTTP probes, aspects, MCP & LLM clients
│  └─ sample-api/          # Express REST API with intentionally flawed endpoints
└─ docker/
   ├─ docker-compose.yml   # Memgraph, Memgraph MCP, Perplexity MCP, MCP Gateway, app
   ├─ Dockerfile.app       # Dev runtime for app service
   └─ memgraph-init/       # (Optional) tiny seed scripts if ever needed
```

### 2.1 `apps/web`

- **UI**: Chat‑first interface plus a “Run audit on sample API” button.
- **API Routes**:
  - `POST /api/chat` – the **only** backend HTTP API.

Responsibilities:

- Maintain the chat history on the client.
- When user presses **Run Audit**, insert a synthetic user message (e.g. `__RUN_SAMPLE_AUDIT__`) and send all messages to `/api/chat`.
- Render:
  - Assistant responses as chat bubbles.
  - Optional structured views (endpoint table, RFC/OWASP summary, small graph visualization) derived from any structured JSON returned from `/api/chat`.

### 2.2 `packages/sample-api`

- Simple **Express** server designed to expose common issues:
  - `GET /health-perfect` – an intentionally **compliant** endpoint.
  - `GET /user-leaky` – leaks PII or sensitive info in response.
  - `GET /debug-error` – exposes stack traces / debug info.
  - `POST /items-injection` – vulnerable to injection / bad validation.
  - `GET /cors-wildcard` – misconfigured CORS / dangerous headers.

This service is **only** run inside the E2B sandbox, bound to `localhost`.

### 2.3 `packages/auditor-core`

Key modules:

- `e2bClient.ts`
  - Functions to create and manage an **E2B sandbox**.
  - Ensures the sandbox can reach the **MCP Gateway** and **Groq API**.

- `probeHttp.ts`
  - Runs in the sandbox, using native `fetch` to call `sample-api` endpoints.
  - Produces `RawHttpExchange` objects:
    ```ts
    type RawHttpExchange = {
      request: {
        method: string;
        url: string;
        httpVersion: string;
        headers: Record<string, string>;
        body: string;
      };
      response: {
        httpVersion: string;
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string>;
        body: string;
      };
    };
    ```

- `sanitizeHttp.ts`
  - Converts `RawHttpExchange` → `SanitizedHttpExchange`.
  - Uses **@redactpii/node** through a small `egressGuard` helper.
  - Drops or masks sensitive headers (`Authorization`, `Cookie`, etc.).
  - Normalizes URLs (`/user/123` → `/user/{id}`).
  - Optionally includes a short, scrubbed `bodyPreview` and `bodyKind`.

- `aspects/applyAspects.ts`
  - Generic aspect / middleware engine:
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

- `aspects/egressGuard.ts`
  - Wraps `@redactpii/node` for outbound text sanitization.
  - Exposes functions like `sanitizeTextForEgress(text: string)`.

- `mcpClient.ts`
  - Low‑level MCP client to talk to the **MCP Gateway** from within the sandbox.
  - Exposes an aspect‑wrapped `mcpCall`:
    - `mcpSanitizationAspect`
      - Runs `sanitizeTextForEgress` on any string content in `params`.
      - Ensures only sanitized data ever leaves the sandbox to MCP.
    - `mcpLoggingAspect` (optional)
      - Logs toolName and basic timing (no raw payloads).

- `groqClient.ts`
  - Low‑level HTTP client to call **Groq**.
  - Aspect‑wrapped `groqChat`:
    - `llmSystemPromptAspect`
      - Prepends a fixed system prompt describing the model’s role as RFC/OWASP compliance auditor, always seeing **sanitized** data.
    - `llmSanitizationAspect`
      - Runs `sanitizeTextForEgress` on outbound messages.
      - Optionally scrubs inbound text before passing back to callers.

- `graphContext.ts`
  - Uses `mcpCall` to talk to **Memgraph MCP**.
  - Responsibility:
    - `discoverAndUpsertSpecs`:
      - Asks Perplexity MCP which RFCs/OWASP entries are relevant to the current audit or user question.
      - Fetches details (titles, sections, relationships) via Perplexity MCP.
      - Upserts those specs into **Memgraph** via `memgraph.run_query`.
    - `fetchGraphContextForFindings`:
      - Queries Memgraph for RFCs, sections, and OWASP nodes relevant to the current findings.
      - Returns a small graph structure for:
        - LLM context (GraphRAG‑lite).
        - Optional UI visualization.

- `auditEngine.ts`
  - High‑level orchestration for audits:

    ```ts
    async function runAuditOnSampleApi(): Promise<ComplianceReport> {
      // 1. Spin up E2B sandbox + sample-api inside it
      // 2. Probe endpoints → RawHttpExchange[]
      // 3. Sanitize → SanitizedHttpExchange[]
      // 4. Discover & upsert specs via Perplexity + Memgraph MCP
      // 5. Fetch graph context from Memgraph
      // 6. Call Groq with probes + spec details + graph context
      // 7. Return structured ComplianceReport for the UI & chat
    }
    ```

  - `ComplianceReport` includes:
    - Per‑endpoint summary (status, main issues, RFC/OWASP references).
    - Overall API health.
    - Suggested improvements.

---

## 3. E2B Sandbox and Network Boundaries

The E2B sandbox is treated as a **secure inner enclave**:

- Inside sandbox:
  - `sample-api` server bound to `localhost`.
  - HTTP probes using `fetch` to localhost.
  - Full, **raw** HTTP data is visible here only.

- Egress from sandbox:
  - **Only** to:
    - The **MCP Gateway** (for MCP tools: Perplexity, Memgraph).
    - The **Groq LLM API**.
  - All egress passes through the **aspect layer** with `egressGuard`.
  - No direct outbound HTTP to arbitrary Internet endpoints from application code.

This models an E2B‑style secure agent that can work with sensitive inputs but **never leaks raw secrets** to external tools.

---

## 4. MCP Topology

Outside the sandbox, Docker runs an MCP ecosystem:

```txt
+------------------------------+
|         MCP Gateway          |
| (Docker MCP Toolkit instance)|
+-------+----------------------+
        | exposes tools:
        |  - perplexity_mcp
        |  - memgraph_mcp
        v
+---------------------+   +---------------------+
|   Perplexity MCP    |   |    Memgraph MCP    |
|  (Docker container) |   |  (Docker container) |
+---------------------+   +---------------------+
                            |
                            v
                     +--------------+
                     |  Memgraph DB |
                     | (memgraph   |
                     |  container) |
                     +--------------+
```

### 4.1 Perplexity MCP

- Provides tools to:
  - Identify relevant RFC IDs and OWASP categories from HTTP transcripts / user questions.
  - Fetch short excerpts / explanations from live sources.
- Always called with **sanitized** context.
- Acts as the **freshness oracle** to mitigate model‑cutoff issues.

### 4.2 Memgraph MCP

- Provides tools to:
  - Run Cypher queries (`run_query`).
  - Introspect schema (`get_schema`) if needed.
- Used to build a **growing knowledge graph** of:
  - RFC nodes + sections.
  - OWASP category nodes (with version awareness).
  - Edges: `RELATES_TO_OWASP`, `HAS_SECTION`, `CITES`, `SUPERSEDES`, etc.

---

## 5. Self‑Growing Spec Graph (GraphRAG‑Lite)

Instead of hardcoding RFC data into Memgraph, the system:

1. Starts with an **empty (or nearly empty)** Memgraph instance.
2. On each audit or user question:
   - Calls Perplexity MCP to **discover** relevant RFCs and OWASP entries.
   - Uses Perplexity MCP again to fetch **titles, key sections, and relationships**.
   - Upserts those into Memgraph via `memgraph.run_query`.
3. On subsequent audits:
   - Queries Memgraph first for existing relevant specs and relationships.
   - Asks Perplexity MCP again to **fill gaps / add new versions** (e.g. future OWASP Top 10 releases).
   - Updates Memgraph accordingly.

This produces a **long‑lived, ever‑growing RFC/OWASP graph** that:

- Becomes richer over time as more audits are run.
- Always stays aligned with **current** documentation because every new discovery is MCP‑backed from live sources.
- Provides structured context for Groq (GraphRAG‑style) and optional visualization in the UI.

---

## 6. Chat‑Centric Flow

There is a **single user flow** via chat:

1. User interacts with the chat UI.
2. Front‑end calls `POST /api/chat` with the full message history.
3. The server examines the latest user message:
   - If it contains the special intent token (e.g. `__RUN_SAMPLE_AUDIT__`), the server:
     - Calls `runAuditOnSampleApi()`.
     - Converts the resulting `ComplianceReport` into:
       - An assistant chat message (summary).
       - Optional structured payload (for UI visuals).
   - Otherwise, the message is treated as a **general question**:
     - The server calls `groqChat()` with the chat history and (optionally) a subset of the latest graph/spec context.

All user interactions – including the audit – appear as **one coherent conversation**.

---

## 7. Dev Container & Docker

A `.devcontainer/devcontainer.json` and `docker/docker-compose.yml` provide:

- Out‑of‑the‑box GitHub Codespaces / VS Code dev environment.
- Docker Compose services:
  - `app` – dev runtime for `apps/web` + local Node tooling.
  - `memgraph` – Memgraph DB with a persistent volume.
  - `memgraph-mcp` – Memgraph MCP Server container.

The dev container attaches to the `app` service and forwards relevant ports (Next.js, etc.) so the whole demo runs with minimal setup. Perplexity MCP is provided through E2B's built-in Docker Hub MCP support.

---

## 8. Extension Points (Post‑Hackathon)

The architecture is intentionally minimal but extensible:

- Swap the in‑sandbox graph abstraction to a **full Memgraph GraphRAG pipeline** using Memgraph AI Toolkit.
- Add support for **arbitrary user‑supplied APIs** (with careful egress and privacy controls).
- Extend the **aspect layer** to wrap more outbound traffic types (e.g., any HTTP client), or add richer guardrails (prompt injection protection, stricter schemas).
- Grow the Memgraph knowledge graph to include other standards (e.g. OAuth2, OpenID Connect, JWT best practices).

For the hackathon, the focus remains on:

- **E2B sandbox isolation + egress guard**,
- **MCP‑driven live spec discovery**,
- **Self‑growing RFC/OWASP graph in Memgraph**, and
- **Chat‑centric, one‑click API audits.**

