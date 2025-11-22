# E2B RFC/OWASP Auditor (rfc-refactor)

> **Chat‑driven API auditor running inside an E2B sandbox, using MCP tools, Groq, and a self‑growing Memgraph spec graph to check HTTP APIs against RFCs + OWASP Top 10.**

This project is built for the **“Build MCP Agents – with Docker, Groq, and E2B”** hackathon.

It demonstrates how to:

- Run an HTTP API **inside an E2B sandbox**.
- Probe it from within the sandbox and capture real HTTP traffic.
- **Sanitize** all data that leaves the sandbox (no raw secrets or PII leak).
- Use **MCP tools** (Perplexity MCP via E2B's Docker Hub MCP + Memgraph MCP) to discover and store relevant **RFCs & OWASP Top 10** entries.
- Use **Groq** to analyse compliance and suggest fixes.
- Grow a **Memgraph knowledge graph** of standards over time (GraphRAG‑lite).
- Interact with everything through a **single chat interface**.

---

## 1. What this project does

From the judge’s perspective, this is what you see:

1. Open the web app.
2. You land on a **chat view** with a button: **“Run audit on sample API”**.
3. Clicking the button sends a chat message that triggers an audit inside an **E2B sandbox**:
   - A sample **Express REST API** is started inside the sandbox.
   - The app probes several endpoints (some compliant, some intentionally flawed).
   - The sandbox captures HTTP requests & responses and sanitizes them.
   - Using MCP + Groq, it analyses the behaviour against **RFC HTTP specs** and **OWASP Top 10:2021**.
   - It builds/updates a **Memgraph graph** of the RFCs and OWASP categories it touched.
4. The chat responds with:
   - A human‑readable summary of each endpoint:
     - **What’s wrong** (e.g. PII leak, insecure CORS, stack traces in responses).
     - **Which RFC sections / OWASP categories** apply.
   - Optionally, a table + simple graph visualisation of the consulted specs.
5. You can then ask follow‑up questions like:
   - “Why is `/cors-wildcard` flagged?”
   - “Which RFCs are involved in error handling here?”
   - “How would you refactor this endpoint to be compliant?”

Everything happens **via chat**. There’s no separate “API vs agent” UX – it’s one coherent agent experience.

---

## 2. Why it matters (hackathon alignment)

This project is intentionally designed to showcase the hackathon themes:

- ✅ **E2B sandbox** is the execution environment – the API only runs inside it.
- ✅ **MCP tools via Docker MCP Toolkit**:
  - **Perplexity MCP** for live RFC/OWASP discovery and explanations.
  - **Memgraph MCP** to store and query a graph of standards.
- ✅ **Groq** is the LLM engine:
  - Analyses HTTP behaviour + standards context.
  - Produces structured compliance reports and refactor suggestions.
- ✅ **Real‑world utility**:
  - Runtime behaviour, not just static code.
  - Growing knowledge graph that gets smarter with usage.
- ✅ **Security aware**:
  - E2B sandbox as an enclave.
  - All outbound data passes through a **PII‑scrubbing egress guard**.

---

## 3. High‑level architecture

At a glance:

```txt
User Browser
   |
   v
Next.js app (apps/web)
   - Chat UI + "Run audit" button
   - POST /api/chat (single backend endpoint)
   |
   v
Chat Orchestrator (/api/chat)
   - If latest user message = "run audit":
       -> runAuditOnSampleApi() from auditor-core
   - Else:
       -> groqChat() for general questions
   |
   v
packages/auditor-core
   - e2bClient: spins up an E2B sandbox
   - sample-api (inside sandbox): Express REST API
   - probeHttp: fetches endpoints, captures RawHttpExchange[]
   - sanitizeHttp: Raw -> SanitizedHttpExchange[] (@redactpii/node)
   - mcpClient: calls MCP Gateway (Perplexity + Memgraph MCP)
   - graphContext: builds/queries Memgraph spec graph
   - groqClient: calls Groq (wrapped in aspect/egress guard)
   - auditEngine: orchestrates full audit -> ComplianceReport
   |
   v
E2B Built-in MCP Gateway
   - Perplexity MCP (via Docker Hub MCP - live RFC/OWASP discovery)
   - Memgraph MCP (Cypher access to Memgraph)
   |
   v
Memgraph DB
   - Growing graph of RFC, Section, OWASP, Concept nodes
```

More detail is in **`ARCHITECTURE.md`**.

---

## 4. Key concepts

### 4.1 E2B sandbox as a secure enclave

Inside E2B we run:

- The **sample API** (Express server bound to `localhost`).
- The **HTTP probe** (using `fetch`).
- The **aspect‑wrapped MCP + Groq clients**.

Only **sanitized summaries** of HTTP exchanges are allowed to leave the sandbox.

### 4.2 Aspect‑based egress guard

All outbound network calls from the sandbox go through an **aspect layer** that:

- Wraps the MCP client and Groq client.
- Uses `@redactpii/node` to strip PII and secrets.
- Injects a system prompt so Groq always acts as an RFC/OWASP‑aware auditor.

This makes the sandbox a **safe boundary** between potentially sensitive APIs and external tools.

### 4.3 Self‑growing spec graph (GraphRAG‑lite)

Memgraph starts essentially empty.

For each audit / question:

1. The system asks **Perplexity MCP** which RFCs and OWASP entries are relevant.
2. It fetches key details for those specs (titles, sections, relationships).
3. It **upserts** them into Memgraph via **Memgraph MCP**.
4. Future audits:
   - Query Memgraph for existing related specs.
   - Ask Perplexity MCP again to fill in gaps and discover newer versions.

Over time, this yields a **graph of standards** that:

- Is always rooted in live docs (via MCP).
- Becomes richer the more you use the tool.

---

## 5. Repo layout

```txt
.
├─ apps/
│  └─ web/                 # Next.js app: chat UI + /api/chat
├─ packages/
│  ├─ auditor-core/        # E2B, probes, aspects, MCP/LLM clients, audit engine
│  └─ sample-api/          # Express REST API with flawed + golden endpoints
└─ docker/
   ├─ docker-compose.yml   # app + Memgraph + Memgraph MCP + Perplexity MCP + MCP Gateway
   ├─ Dockerfile.app       # dev image for app service
   └─ memgraph-init/       # (optional) helper scripts if needed later
```

Additional docs in the repo:

- `ARCHITECTURE.md` – deeper architecture details.
- `DECISIONS.md` – frozen design/scope decisions.
- `AGENTS.md` – how coding/runtime agents are structured.
- `CODING_AGENT_PROMPT.md` – prompt for code‑generation agents.

---

## 6. Running the project (for judges)

### 6.1 Prerequisites

- **Docker** and **Docker Compose**.
- **Node.js 20+** and **pnpm**.
- Access to:
  - A **Groq API key**.
  - A **Perplexity MCP** container / credentials (via Docker MCP Toolkit).
  - A **Memgraph MCP** container connected to a Memgraph DB.

> The repo’s `docker/docker-compose.yml` is set up to run the required services. You will need to add your actual image names and environment variables for Perplexity MCP, Memgraph MCP, and the MCP Gateway according to your environment.

### 6.2 Option 1 – GitHub Codespaces / VS Code Dev Container

This repo includes a `.devcontainer/devcontainer.json` that wires everything together.

1. Open the repo in **GitHub Codespaces** or VS Code’s **“Reopen in Container”**.
2. Wait for the dev container to build.
3. Docker Compose will bring up:
   - `app` (Next.js dev server),
   - `memgraph`,
   - `memgraph-mcp`.
4. In the `app` service, run:
   ```bash
   pnpm install
   pnpm dev:web
   ```
5. Open the forwarded port (default: `http://localhost:3000`).
6. You should now see the chat UI.

### 6.3 Option 2 – Local machine (Docker)

1. Clone the repo:
   ```bash
   git clone <this-repo-url>
   cd <repo-root>
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```
3. Start Docker services (this runs the app automatically):
   ```bash
   docker compose -f docker/docker-compose.yml up
   ```
4. Open `http://localhost:3000` in your browser.

> **Note:** Docker Compose installs dependencies and starts the Next.js dev server automatically.

### 6.4 Option 3 – Local machine (without Docker)

1. Clone the repo and install dependencies:
   ```bash
   git clone <this-repo-url>
   cd <repo-root>
   pnpm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```
3. Start the Next.js app:
   ```bash
   pnpm dev:web
   ```
4. Open `http://localhost:3000` in your browser.

> **Note:** You'll need Memgraph running separately for graph features.

### 6.5 Required Environment Variables

Create a `.env.local` file in the project root with the following variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `E2B_API_KEY` | **Yes** | API key for E2B sandbox execution |
| `GROQ_API_KEY` | **Yes** | API key for Groq LLM calls |
| `PERPLEXITY_API_KEY` | **Yes** | API key for Perplexity MCP spec discovery |
| `MEMGRAPH_HOST` | No | Memgraph hostname (default: `localhost`) |
| `MEMGRAPH_PORT` | No | Memgraph port (default: `7687`) |

**Important**: If these variables are not set, the system will fail:
- Missing `GROQ_API_KEY` → LLM calls will error
- Missing `E2B_API_KEY` → Sandbox creation will fail
- Missing `PERPLEXITY_API_KEY` → Spec discovery will not work
- Missing `MEMGRAPH_HOST` → Graph queries will fail silently

See `.env.example` for a template.

---

## 7. How to demo (judge flow)

Once the app is running:

1. Open the app in your browser.
2. Click **“Run audit on sample API”**.
3. Wait for the agent to:
   - Spin up the sandbox.
   - Probe the internal sample API.
   - Run compliance analysis.
4. Observe the response:
   - Chat message summarising each endpoint.
   - Optional table and/or graph of RFC/OWASP context.
5. Ask follow‑up questions, for example:
   - “Which RFC sections did you rely on for these findings?”
   - “Show me how to refactor `/cors-wildcard` to be compliant.”
   - “Why is returning stack traces a problem?”

This is enough to evaluate:

- **Technical quality** – sandbox orchestration, MCP usage, spec reasoning.
- **Innovation** – self‑growing spec graph, egress‑guarded tools.
- **Overall impression** – a coherent, useful agent rather than a toy demo.

---

## 8. Limitations (current hackathon scope)

To keep this feasible within the hackathon window, some choices are intentional:

- Only the **bundled sample API** is audited.
- No arbitrary external URLs or user‑uploaded APIs (can be added later).
- Memgraph runs a **small but growing** spec graph, not a full IETF mirror.
- Only **Perplexity MCP** and **Memgraph MCP** are used as MCP tools.
- Only **Groq** is used as the LLM.

These trade‑offs keep the demo focused while still showcasing:

- E2B + Docker MCP Toolkit + MCP tools,
- Groq for spec‑aware reasoning,
- A realistic security story,
- A path to a more general RFC/OWASP auditor in future.

---

## 9. Future directions

After the hackathon, this project can evolve into:

- Auditing **user‑supplied APIs** (with strong privacy controls).
- Supporting more protocols (GraphQL, gRPC, WebSockets).
- Ingesting and linking a much larger corpus of standards into Memgraph.
- Adding a richer **GraphRAG** stack on top of Memgraph AI Toolkit.
- Exposing the aspect/egress guard as a reusable package for other E2B agents.

For now, the focus is delivering a **high‑signal, end‑to‑end demo** that highlights how E2B + MCP + Groq + Memgraph can be combined into an actually useful, spec‑aware agent.

