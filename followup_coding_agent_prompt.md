# FOLLOWUP_CODING_AGENT_PROMPT.md – Align Chat UI & /api/chat with Groq AI SDK + MCP Gateway

You are a coding agent running **after** an initial implementation of the E2B RFC/OWASP Auditor.

The repo already roughly follows:
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `AGENTS.md`
- `CODING_AGENT_PROMPT.md`

Your task is to **refine and align** the existing implementation with the updated design, specifically:

1. Use a **Groq‑compatible chat UI based on the Vercel AI SDK** for Next.js.
2. Implement a **single `/api/chat` route** that:
   - Uses the AI SDK for normal chat.
   - Branches into the **audit pipeline** when the user triggers the "Run audit" action.
3. Ensure all MCP calls go through an **E2B MCP Gateway** with:
   - **Perplexity MCP** coming from **Docker Hub**.
   - A **custom Memgraph MCP** (built or configured under E2B/custom MCP setup).
4. Do **not** reinvent the UI or chat plumbing; reuse standard patterns.

Treat this as a **surgical follow‑up**: adjust and improve the existing implementation instead of rewriting everything.

---

## 0. Read / Inspect Before Changing Code

Before making changes, you **must**:

1. Re‑read:
   - `ARCHITECTURE.md`
   - `DECISIONS.md`
   - `AGENTS.md`
   - `CODING_AGENT_PROMPT.md`
2. Inspect the current code in:
   - `apps/web` (chat UI, API routes).
   - `packages/auditor-core` (especially `auditEngine`, MCP client, Groq client).
   - `docker/` and `.devcontainer/` (MCP Gateway + MCP containers).

Your job is to **bring the code closer to those documents plus the new Groq/AI SDK UI plan**, with minimal disruption.

---

## 1. Chat UI: Switch to Vercel AI SDK Pattern

### Goal

Ensure the frontend chat experience in `apps/web` uses **Vercel AI SDK** (`ai/react`) with a Groq‑compatible pattern, instead of a custom chat loop.

### Tasks

1. **Install / Confirm Dependencies**
   - Ensure `apps/web` has:
     - `ai` (Vercel AI SDK)
     - `@ai-sdk/groq`
   - If they’re already installed, leave them; otherwise add them with the project’s package manager.

2. **Use `useChat` on the client**
   - Locate the main chat component (e.g. `components/chat.tsx` or similar).
   - Replace any custom manual chat state management (local state + fetch) with the AI SDK hook:
     - `const { messages, input, handleInputChange, handleSubmit, append } = useChat({ api: '/api/chat' });`
   - The component should:
     - Render `messages` as bubbles.
     - Use `handleInputChange` and `handleSubmit` for the chat input form.

3. **Add the "Run audit" button as a chat macro**
   - Inside the same chat UI, add a button labelled something like **"Run audit on sample API"**.
   - Its `onClick` handler should **not** call another HTTP route.
   - Instead, it should call `append({ role: 'user', content: '__RUN_SAMPLE_AUDIT__' })` (or another clearly identifiable token).
   - This ensures everything still goes through `/api/chat`.

4. **Keep UI Minimal**
   - Do not spend time on heavy styling or advanced chat features.
   - Keep the layout simple: message list, input field, send button, and a "Run audit" button.
   - If the repo already uses shadcn UI components, you may wrap the AI SDK‑based chat in those components, but **do not** build a new chat framework.

---

## 2. Backend: `/api/chat` Route Using AI SDK + Audit Branching

### Goal

Make sure the **only** backend chat endpoint is `POST /api/chat`, and that it:

- Uses **AI SDK server helpers** and **Groq** for normal chat.
- Detects the audit token (e.g. `__RUN_SAMPLE_AUDIT__`) and triggers `runAuditOnSampleApi()` from `auditor-core`.

### Tasks

1. **Locate `/api/chat` route**
   - In a Next.js app router, this is likely under `apps/web/app/api/chat/route.ts` (or similar).
   - If the route is somewhere else or named differently, align it to `/api/chat` if feasible without breaking things.

2. **Implement audit vs chat branching**
   - Parse the request body as the AI SDK message format.
   - Determine the **latest user message**.
   - If that message content contains the special audit token (e.g. `__RUN_SAMPLE_AUDIT__`):
     - Call `runAuditOnSampleApi()` from `packages/auditor-core`.
     - Convert the resulting `ComplianceReport` into a **single assistant message string**.
     - Return it in the format expected by the AI SDK / `useChat` client.
   - Otherwise (no audit token present):
     - Use AI SDK + Groq for normal chat, e.g.:
       - `streamText({ model: groq('...'), messages })`.
       - Return the stream via `result.toAIStreamResponse()`.

3. **Keep the API surface unified**
   - Remove or deprecate any extra routes like `/api/audit` or `/api/refactor` if they exist.
   - All interaction should go through `/api/chat`.

4. **Do not break the auditor core**
   - Ensure `runAuditOnSampleApi()` and the rest of `auditor-core` remain unchanged, aside from any function signature updates needed for better typing.
   - The `/api/chat` route should be a thin orchestrator: decide branch → call core → format response.

---

## 3. MCP Wiring: E2B MCP Gateway + Perplexity MCP (Docker Hub) + Custom Memgraph MCP

### Goal

Ensure MCP usage matches the design:

- All MCP calls go through an **E2B MCP Gateway**.
- **Perplexity MCP** is fetched from **Docker Hub** via the Docker MCP Toolkit configuration.
- The **Memgraph MCP** is a custom MCP server image, also wired into the gateway.

### Tasks

1. **Inspect MCP client code**
   - Open `packages/auditor-core/mcpClient.ts` (or equivalent module).
   - Confirm that all MCP calls use E2B's built-in gateway (configured via `configureMcpGateway()`) and specify tools like `perplexity.perplexity_ask` and `memgraph_mcp.run_query`.

2. **Remove any direct external API calls**
   - If you find direct HTTP requests to Perplexity, Memgraph, or similar external services **outside** of the MCP client:
     - Refactor them so that all such interactions are done via `mcpCall()` and the MCP Gateway.

3. **Align environment variables**
   - Ensure there are clear env vars such as:
     - `E2B_API_KEY` (required - E2B provides the MCP gateway)
     - `PERPLEXITY_API_KEY` (for E2B's Docker Hub MCP)
     - `MEMGRAPH_HOST`, `MEMGRAPH_PORT` (for Memgraph connection)
   - The names should be:
     - Consistent across code and docker/devcontainer configuration.
     - Documented in `.env.example` or similar.

4. **Respect the egress guard aspects**
   - Ensure `mcpCall()` is wrapped with the sanitization aspects described in `DECISIONS.md`.
   - Do not introduce a new MCP client that bypasses these aspects.

---

## 4. Clean‑up & Consistency

### Goal

Simplify and align the implementation so it is easy for hackathon judges to understand and run.

### Tasks

1. **Remove unused / experimental chat components**
   - If there are multiple chat UIs or experimental components, keep the one built on **AI SDK** + Groq.
   - Update imports/routes accordingly.

2. **Update or confirm README alignment**
   - Skim `README.md` and make sure:
     - It refers to **one chat UI** at `/` (or a documented route).
     - It describes `/api/chat` as the only backend endpoint for the app.
     - It still correctly references E2B, MCP Gateway, Perplexity MCP, Memgraph MCP, and Groq.
   - Do not rewrite the README completely; only fix obvious mismatches.

3. **Keep scope within DECISIONS.md**
   - Do not add new major features or dependencies (e.g., other MCPs, extra flows).
   - Focus on:
     - Solid chat wiring.
     - Correct MCP usage.
     - Minimal and understandable code.

---

## 5. What Success Looks Like (Post‑Refinement)

After you apply this follow‑up prompt, the repo should:

1. Start via the documented commands (`docker compose ...`, `pnpm dev`, etc.).
2. Show a single, clean **chat UI** that:
   - Uses `useChat()` from the Vercel AI SDK.
   - Talks only to `/api/chat`.
   - Has a "Run audit on sample API" button that triggers the audit through a synthetic chat message.
3. Have a `/api/chat` route that:
   - Uses **Groq + AI SDK** for normal conversational turns.
   - Detects the audit command and calls `runAuditOnSampleApi()` for the full E2B/MCP/Memgraph/Groq pipeline.
4. Ensure MCP usage:
   - Goes through a single E2B MCP Gateway endpoint.
   - Uses Perplexity MCP from Docker Hub and a custom Memgraph MCP.
   - Never bypasses the egress guard.

If you need to choose between feature expansion and alignment with docs, **always choose alignment and simplification**.

