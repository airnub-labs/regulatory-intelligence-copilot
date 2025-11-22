# E2B RFC/OWASP Auditor - Hackathon Demo Script

## Video Structure (3-5 minutes)

---

## Setup Before Recording

**Terminal Layout (recommended):**
- **Left pane**: App logs (`pnpm dev` output from `apps/web`)
- **Right pane**: Browser with app at `localhost:3000`

Or use split screen with browser on top, terminal on bottom.

---

## INTRO (30 seconds)

**[SCREEN: Browser - App landing page with chat interface visible]**

> "Building secure API auditing tools usually takes months—sandboxing, knowledge bases, ensuring no data leaks. We built one in a weekend using E2B and MCP."

> "This is the E2B RFC/OWASP Auditor—a chat-driven security scanner that finds compliance violations and vulnerabilities, with findings you can actually verify in source code."

---

## THE PROBLEM (20 seconds)

**[SCREEN: Stay on app or show quick slide]**

> "Traditional API auditors have three problems:
> 1. Hardcoded rules that get outdated immediately
> 2. Can't safely test live APIs without leaking sensitive data to LLMs
> 3. No way to verify if findings are real or AI hallucinations"

---

## THE DEMO (2-3 minutes)

### Step 1: Launch the Audit

**[SCREEN: Browser - Click "Run Audit" button]**

> "One click triggers a full security audit."

**[SCREEN: Switch to Terminal - Watch logs appear]**

```
[Audit] Starting audit on sample API...
[Audit] Creating E2B sandbox...
[E2B] Sandbox created: sbx_abc123def456
[E2B] MCP Gateway URL: https://mcp.e2b.dev/v1/...
[E2B] MCP Token available: yes
[Audit] Configuring E2B MCP gateway...
[MCP] Gateway configured - Perplexity and Memgraph tools available
```

> "E2B instantly spins up a secure sandbox. Notice the MCP Gateway—that's our single point of egress for all external calls. Perplexity for spec discovery, Memgraph for our knowledge graph."

---

### Step 2: Show API Startup & Probing

**[SCREEN: Terminal - Continue watching logs]**

```
[Audit] Starting sample API in sandbox...
Sample API running on port 3001
[Audit] Probing API endpoints...
[Probe] Testing 5 endpoints inside sandbox...
[Probe]   → GET /health-perfect
[Probe]   → GET /user-leaky
[Probe]   → GET /debug-error
[Probe]   → POST /items-injection
[Probe]   → GET /cors-wildcard
[Audit] Collected 5 HTTP exchanges
```

> "The sample API with intentional vulnerabilities is now running inside the sandbox. We probe five endpoints—one compliant, four with different security issues. All HTTP traffic stays inside the sandbox."

---

### Step 3: Show Sanitization (Key Security Feature)

**[SCREEN: Terminal - Watch sanitization logs]**

```
[Audit] Sanitizing HTTP exchanges...
[Sanitize] Processing 5 exchanges through egress guard...
[Sanitize] Redacting PII: SSNs, credit cards, API keys, passwords, emails...
[Sanitize] 5 exchanges sanitized - safe for external APIs
```

> "This is critical—before anything leaves the sandbox, our two-layer egress guard sanitizes all PII. Credit card numbers like 4111-1111-1111-1111, SSNs, API keys—all redacted. The raw data never reaches Perplexity or Groq."

---

### Step 4: Show Spec Discovery via MCP

**[SCREEN: Terminal - Watch Perplexity MCP call]**

```
[Audit] Discovering relevant specs via MCP...
[MCP] Calling Perplexity (spec discovery)...
[MCP] Perplexity (spec discovery) completed in 2341ms
[Audit] Discovered 8 relevant specs
```

> "Now Perplexity discovers which RFCs and OWASP categories are relevant. These aren't hardcoded—they're fetched fresh. RFC 7231 for HTTP semantics, OWASP A01 for access control, A03 for injection..."

---

### Step 5: Show Knowledge Graph Updates

**[SCREEN: Terminal - Watch Memgraph upserts]**

```
[Graph] Upserting 8 specs to Memgraph knowledge graph...
[Graph]   → Upserting RFC node: RFC7231
[MCP] Calling Memgraph (knowledge graph)...
[MCP] Memgraph (knowledge graph) completed in 45ms
[Graph]   → Upserting RFC node: RFC7230
[MCP] Calling Memgraph (knowledge graph)...
[MCP] Memgraph (knowledge graph) completed in 38ms
[Graph]   → Upserting OWASP node: A01:2021
[MCP] Calling Memgraph (knowledge graph)...
[MCP] Memgraph (knowledge graph) completed in 42ms
[Graph]   → Upserting OWASP node: A03:2021
...
```

> "Watch the graph being built in real-time. Each RFC and OWASP category becomes a node in Memgraph. The graph started empty—it's growing smarter with each audit."

---

### Step 6: Show LLM Analysis

**[SCREEN: Terminal - Watch Groq analysis]**

```
[Audit] Fetching graph context from Memgraph...
[Graph] Querying Memgraph for related specs and relationships...
[Audit] Analyzing compliance with Groq...
[Groq] Sending sanitized data to LLM for compliance analysis...
[Groq] Model: compound-beta | Endpoints: 5 | Specs: 8
[Groq] Analysis complete - parsing compliance report...
[Audit] Audit complete!
[Audit] Cleaning up sandbox...
```

> "The LLM receives only sanitized data plus graph context. It analyzes against 8 different specs and produces a structured compliance report."

---

### Step 7: Review Findings in UI

**[SCREEN: Switch to Browser - Show audit report panel]**

> "Now look at the results."

**[SCREEN: Browser - Point to specific findings with cursor]**

> "Each endpoint has a severity badge:
> - `/user-leaky` is **CRITICAL**—it's exposing SSNs and credit card numbers. That's OWASP A01: Broken Access Control.
> - `/debug-error` is **HIGH**—stack traces leak internal paths and database URLs. OWASP A05: Security Misconfiguration.
> - `/items-injection` shows SQL injection risk. OWASP A03.
> - `/cors-wildcard` has misconfigured CORS allowing credentials with wildcard origins."

**[SCREEN: Browser - Hover over RFC/OWASP references]**

> "Every finding links to specific standards—RFC 7231 Section 6.5, OWASP A01:2021. Not generic warnings—precise compliance violations."

---

### Step 8: Prove Verifiability (KEY MOMENT)

**[SCREEN: Browser - Click "View Source" on the /user-leaky finding]**

> "Here's what makes this different from other AI auditors..."

**[SCREEN: GitHub opens to exact line of vulnerable code]**

> "Click 'View Source' and you jump to the exact vulnerable code. Lines 171-186—there's the endpoint returning unfiltered user data with SSN and credit card fields."

> "This isn't AI guessing—it's analyzing real code you can verify yourself. No hallucinations."

---

### Step 9: Explore the Knowledge Graph

**[SCREEN: Browser - Click "View Graph" or navigate to graph page]**

> "Now let's see what the system learned."

**[SCREEN: Browser - Show force-directed graph visualization]**

> "This graph started completely empty. During the audit, Perplexity discovered RFC 7231, 7230, 9110, OWASP A01, A03, A05—and they're now stored in Memgraph with relationships."

**[SCREEN: Browser - Hover over nodes to show connections]**

> "See how RFC 9110 supersedes RFC 7231? The graph captures these relationships. Each audit makes the system smarter—no hardcoded knowledge base to maintain."

---

### Step 10: Ask Follow-up Questions

**[SCREEN: Browser - Type in chat: "How should I fix the CORS vulnerability?"]**

> "Because the graph persists, I can ask follow-up questions."

**[SCREEN: Browser - Show streaming response]**

> "The LLM now has graph context—it knows exactly which specs were violated and gives targeted remediation advice based on the actual standards."

---

## TECHNICAL HIGHLIGHTS (45 seconds)

**[SCREEN: Split view or VS Code showing key files]**

> "Three technical achievements we're proud of:"

**[SCREEN: Show `packages/auditor-core/src/aspects/egressGuard.ts` briefly]**

> "**1. Zero PII Leaks** - Two-layer egress guard. Layer one: ML-based PII detection with @redactpii/node. Layer two: regex patterns for API keys, JWTs, database URLs. All wrapped in an aspect-oriented pattern—no external AOP library needed."

**[SCREEN: Show terminal log or `graphContext.ts`]**

> "**2. Self-Growing Intelligence** - Specs are discovered live via Perplexity MCP and stored in Memgraph. RFC 7231 isn't in our codebase—it's fetched dynamically and persists for future audits."

**[SCREEN: Show `auditEngine.ts` briefly—highlight how short it is]**

> "**3. ~600 lines of core logic** - E2B's sandbox and MCP Gateway eliminated months of infrastructure work. This file orchestrates the entire 7-step audit pipeline in under 70 lines."

---

## CLOSING (15 seconds)

**[SCREEN: Browser - App with completed audit visible]**

> "E2B let us focus on the actual problem—API security—instead of building infrastructure."

> "Fresh specs from Perplexity, persistent knowledge in Memgraph, verified findings linked to source code, and zero data leaks."

> "Thanks for watching!"

---

## Pre-Recording Checklist

- [ ] Run `docker compose up -d` (Memgraph + MCP server)
- [ ] Run `pnpm dev` from `apps/web` in visible terminal
- [ ] Clear terminal before recording for clean logs
- [ ] Clear browser localStorage if you want empty graph
- [ ] Open GitHub repo in separate tab for "View Source" demo
- [ ] Test full flow once—ensure all endpoints respond
- [ ] Set terminal font size large enough to read on video (14-16pt)

## Screen Summary

| Timestamp | Screen | What's Shown |
|-----------|--------|--------------|
| 0:00-0:30 | Browser | App landing page |
| 0:30-0:50 | Browser/Slide | Problem statement |
| 0:50-1:00 | Browser | Click "Run Audit" |
| 1:00-1:20 | **Terminal** | Sandbox creation, MCP gateway config |
| 1:20-1:40 | **Terminal** | Endpoint probing list |
| 1:40-2:00 | **Terminal** | Sanitization logs (PII redaction) |
| 2:00-2:20 | **Terminal** | Perplexity spec discovery |
| 2:20-2:40 | **Terminal** | Memgraph upserts (graph building) |
| 2:40-3:00 | **Terminal** | Groq analysis completion |
| 3:00-3:30 | Browser | Audit report panel, severity badges |
| 3:30-3:50 | **GitHub** | View Source → vulnerable code |
| 3:50-4:20 | Browser | Knowledge graph visualization |
| 4:20-4:40 | Browser | Follow-up question in chat |
| 4:40-5:10 | VS Code/Split | Technical highlights code snippets |
| 5:10-5:30 | Browser | Closing with completed audit |

---

## Key Talking Points

- **"Weekend build"** vs "months of work"
- **"E2B + MCP = batteries included"** - no infra to manage
- **"Verifiable, not hallucinated"** - View Source proves it
- **"Self-growing knowledge graph"** - starts empty, learns
- **"Zero PII leaks"** - aspect-oriented egress guard
- **"~600 lines"** - proof of E2B's value prop
