# E2B RFC/OWASP Auditor

> **Chat-driven API auditor that uses E2B sandboxes and MCP servers to audit HTTP APIs against RFCs and OWASP Top 10 - without baking any of this complexity into the application itself.**

---

## For Hackathon Judges

### The Problem We Solve

Building an API security auditor typically requires:
- **Hardcoding security rules** that quickly become outdated
- **Managing complex infrastructure** for safe code execution
- **Building custom integrations** for knowledge bases and graph databases
- **Handling PII/secret sanitization** to prevent data leaks

### How E2B + MCP Eliminates This Complexity

| Traditional Approach | Our Approach with E2B + MCP |
|---------------------|----------------------------|
| Hardcode OWASP rules → maintain forever | **MCP Perplexity** fetches latest OWASP/RFC specs on demand |
| Build custom sandboxing → months of work | **E2B Sandbox** provides secure execution in one API call |
| Write Memgraph driver code → handle connections, queries | **MCP Memgraph** exposes Cypher via standard MCP protocol |
| Build egress filtering → complex middleware | **E2B's MCP Gateway** centralizes all external calls |

**Result:** Our entire codebase focuses on the audit logic, not infrastructure.

### Verify It's Real (Not Faked)

Every audit finding includes a **"View Source"** link that takes you directly to the vulnerable code in GitHub:

```
/user-leaky → View Source → e2bClient.ts#L171-L186
```

Click any finding to see the actual code being audited. This proves the LLM is analyzing real endpoints, not hallucinating issues.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  └── Chat UI + Graph Visualization                          │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js API Route (/api/chat)                              │
│  └── Orchestrates audit or answers questions                │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  E2B Sandbox                                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Sample API (Express)                               │    │
│  │  └── 5 endpoints with intentional vulnerabilities   │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  HTTP Probe → Sanitizer → Analysis                  │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  E2B MCP Gateway (built-in)                         │    │
│  │  ├── Perplexity MCP → Live RFC/OWASP lookup        │    │
│  │  └── Memgraph MCP → Knowledge graph storage         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Groq LLM (compound-beta)                                   │
│  └── Analyzes sanitized exchanges + specs → findings        │
└─────────────────────────────────────────────────────────────┘
```

### Why This Architecture Matters

1. **E2B Sandbox** - The API runs in complete isolation. No risk of malicious code affecting the host. The sandbox includes a built-in MCP gateway, so we don't manage any MCP server infrastructure.

2. **MCP Perplexity** - Instead of hardcoding "OWASP A01 is Broken Access Control", we ask Perplexity at runtime. The knowledge is always current.

3. **MCP Memgraph** - The specs we discover get stored in a graph. Over time, this builds a knowledge base of RFC→OWASP relationships without us writing graph driver code.

4. **Groq** - Fast inference for analyzing the HTTP exchanges against the discovered specs.

---

## Key Features

### Real-time Graph Population

As you chat about RFC or OWASP topics, the knowledge graph grows:

1. Ask "What is RFC 7231?"
2. The response mentions RFC 7231, 7230, 7232
3. These specs are automatically added to Memgraph
4. The graph visualization updates in real-time

### Live Chat on Graph Page

The `/graph` page includes a chat sidebar. Ask questions while watching the graph populate - this demonstrates the real-time nature of the system.

### No Hardcoded Data

Check these files to verify:
- `packages/auditor-core/src/config/dynamicOwaspFetcher.ts` - OWASP categories fetched from Perplexity MCP
- `packages/auditor-core/src/graphContext.ts` - RFC/OWASP extraction from live responses
- `EMPTY_CATEGORIES` and `EMPTY_FALLBACK_CATEGORIES` - defaults are empty arrays, not hardcoded lists

### Source Code Verification

Each audit finding links to the exact lines in the codebase:

| Endpoint | Issue | Source |
|----------|-------|--------|
| `/user-leaky` | PII Exposure | [e2bClient.ts#L171-L186](packages/auditor-core/src/e2bClient.ts#L171-L186) |
| `/debug-error` | Stack Trace Leak | [e2bClient.ts#L188-L209](packages/auditor-core/src/e2bClient.ts#L188-L209) |
| `/items-injection` | SQL Injection | [e2bClient.ts#L211-L231](packages/auditor-core/src/e2bClient.ts#L211-L231) |
| `/cors-wildcard` | CORS Misconfiguration | [e2bClient.ts#L233-L255](packages/auditor-core/src/e2bClient.ts#L233-L255) |

---

## Running the Demo

### Prerequisites

- **GitHub Codespaces** (recommended) or Docker + Node.js 20+
- API keys for: `E2B_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`

### Option 1: GitHub Codespaces (Easiest)

1. Add secrets to GitHub Settings → Codespaces → Secrets:
   - `E2B_API_KEY`
   - `GROQ_API_KEY`
   - `PERPLEXITY_API_KEY`

2. Click **Code** → **Codespaces** → **Create codespace on main**

3. Wait for the container to build (~2-3 minutes)

4. The app starts automatically at port 3000

### Option 2: Local Docker

```bash
git clone https://github.com/airnub-labs/rfc-refactor
cd rfc-refactor
cp .env.example .env.local
# Edit .env.local with your API keys
docker compose -f docker/docker-compose.yml up
```

Open http://localhost:3000

---

## Demo Flow for Judges

### 1. Run an Audit (2 minutes)

1. Open the app
2. Click **"Run Audit"**
3. Watch the audit run:
   - Sandbox creation
   - Endpoint probing
   - Spec discovery via MCP
   - Compliance analysis
4. View the results with **"View Source"** links

### 2. Test the Graph Population (1 minute)

1. Click **"View Graph"** in the header
2. In the chat sidebar, ask: "What is RFC 7231?"
3. Watch the graph add RFC 7231 node
4. Ask: "How does OWASP A03 relate to injection?"
5. Watch OWASP node appear

### 3. Verify Source Links (30 seconds)

1. In the audit results, click **"View Source"** on any finding
2. Verify the GitHub code matches the issue description
3. This proves findings are real, not hallucinated

---

## Technical Highlights

### Complexity Avoided

| What We Didn't Build | Why |
|---------------------|-----|
| Custom sandboxing solution | E2B provides this |
| Perplexity API integration | MCP server handles it |
| Memgraph driver/connection pooling | MCP server handles it |
| MCP server hosting | E2B's built-in gateway |
| OWASP/RFC knowledge base | Fetched live via MCP |

### Security Features

- **PII Sanitization**: `@redactpii/node` + regex patterns strip sensitive data before egress
- **Cypher Injection Prevention**: All graph queries use proper escaping and ID validation
- **Header Filtering**: Sensitive headers (Authorization, Cookie, etc.) removed from probes

### Code Quality

- TypeScript throughout
- Aspect-oriented design for cross-cutting concerns (sanitization, logging)
- Clean separation: `auditor-core` package is framework-agnostic

---

## Project Structure

```
apps/web/                    # Next.js app
  src/app/
    page.tsx                 # Chat UI with audit results
    graph/page.tsx           # Graph visualization with chat sidebar
    api/chat/route.ts        # Main API endpoint
    api/graph/route.ts       # Graph data endpoint

packages/auditor-core/       # Core audit logic
  src/
    auditEngine.ts           # Orchestration
    e2bClient.ts             # E2B sandbox + sample API (L158-255)
    graphContext.ts          # Spec discovery + Memgraph upsert
    groqClient.ts            # LLM analysis + source location mapping
    mcpClient.ts             # MCP gateway client
    sanitizeHttp.ts          # HTTP exchange sanitization
    config/
      dynamicOwaspFetcher.ts # Live OWASP fetching via MCP
```

---

## What Makes This Different

1. **No hardcoded rules** - All security knowledge is fetched live
2. **Zero infrastructure management** - E2B + MCP handles everything
3. **Verifiable results** - Source links prove findings are real
4. **Growing knowledge base** - Graph builds as you use it
5. **Real HTTP analysis** - Actual requests/responses, not static code

This demonstrates how E2B sandboxes and MCP servers can eliminate months of infrastructure work, letting developers focus on the actual problem they're solving.

---

## Links

- **Repository**: https://github.com/airnub-labs/rfc-refactor
- **E2B Documentation**: https://e2b.dev/docs
- **MCP Specification**: https://modelcontextprotocol.io

---

Built for the **"Build MCP Agents – with Docker, Groq, and E2B"** hackathon.
