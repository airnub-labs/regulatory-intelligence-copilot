# Node.js 24 LTS – Support Rationale

> **Decision:** The Regulatory Intelligence Copilot must support **Node.js 24 LTS as the minimum baseline** for all core services.
>
> **Status:** Proposed → Adopted (once CI and devcontainers are updated).

## Why Node 24 (and not 20/22) is Our Baseline

Node 24 has just entered **LTS** and brings several concrete advantages for a security‑sensitive, EU‑focused SaaS like this project. These are not just "nice new syntax"; they materially improve **security**, **performance**, and **operability**.

---

## 1. Production‑ready Permission Model

Node 24 ships with a **mature, production‑oriented permission model**:

- Stable `--permission` flag (not `--experimental-permission`).
- Fine‑grained control over:
  - File system (read/write paths).
  - Environment variables.
  - Network access (host/port level).
  - Child processes.

**Why we care:**

- We run **agent code, MCP tools, and sandboxes** that touch sensitive regulatory and user context.
- We want to lock down each runtime so that:
  - Agents cannot read arbitrary files or secrets.
  - MCP clients cannot call arbitrary external hosts.
  - A compromised dependency has a **small blast radius**.

Node 20’s permission model is still experimental; Node 22 only recently stabilised it. Node 24 is our **first clean chance** to adopt a stable permission model as a hard requirement, not a best‑effort.

---

## 2. New V8 Engine (13.6) – Safer & Faster

Node 24 includes **V8 13.6**, which brings:

- **`RegExp.escape()`** – a standard, safe way to escape user‑controlled strings for regexes.
- Better performance on string, regex, and general JS workloads.
- Improved WebAssembly support (see below).

**Why we care:**

- We parse and transform lots of **legal text, case law summaries, and user queries**.
- We want fewer ad‑hoc helper utilities and less reliance on legacy regex escape functions.
- Better baseline performance directly improves tail latency for chat and agent calls.

---

## 3. Async Context Improvements – Cheaper Per‑Request Context

Node 24 improves **AsyncLocalStorage** and async context handling (via `AsyncContextFrame` under the hood).

**Why we care:**

- We need **per‑request / per‑tenant context** across:
  - Agent orchestration.
  - LLM router calls.
  - Graph and MCP calls.
- Async context is how modern APM, logging, and multi‑tenant tagging work. Older implementations can be noticeably expensive at scale.

Node 24’s implementation reduces overhead and GC pressure, making it safer to use ALS heavily in production.

---

## 4. Modern HTTP & Fetch Stack (Undici 7 + Strict Parsing)

Node 24 ships with a recent **Undici** version and a hardened HTTP parser:

- Modern `fetch()` and HTTP client behaviour.
- Stricter HTTP parsing via newer `llhttp` versions.

**Why we care:**

- We call many **external services** (MCP tools, LLM providers, legal content APIs).
- A hardened HTTP stack reduces exposure to:
  - Request smuggling.
  - Header parsing edge cases.
- Using the built‑in client more means **fewer third‑party HTTP libraries**, reducing supply‑chain risk.

---

## 5. npm 11 Bundled – Better Supply Chain Defaults

Node 24 comes with **npm 11** by default.

**Why we care:**

- We operate a **multi‑package monorepo** (apps + packages + MCP tools).
- npm 11 offers:
  - Improved lockfile handling.
  - Better performance with many workspaces.
  - Incremental security improvements around integrity checks.

We could manually upgrade npm on older Node, but standardising on Node 24 means all devcontainers, CI runners, and local setups converge on the same, newer baseline without extra manual steps.

---

## 6. WebAssembly Memory64 & Float16 – Headroom for Heavy Analysis

Node 24’s V8 upgrade unlocks:

- **WebAssembly Memory64** – WASM modules can use >4GB memory.
- **`Float16Array`** – more compact numeric representation for ML/analytics.

**Why we care:**

- Future work may include:
  - Local ML models for ranking / risk scoring.
  - Heavy graph algorithms for regulatory impact analysis.
- We want the option to embed these in **WASM workers** inside Node without hitting the old 4GB ceiling or needing separate services.

---

## 7. Test Runner Improvements – Faster, Safer CI

Node’s built‑in `node:test` runner is significantly improved in 24:

- Better async test handling.
- Faster execution of large suites.

**Why we care:**

- We rely heavily on **spec‑style tests** for:
  - Graph schema invariants.
  - Timeline engine behaviour.
  - LLM router and agent wiring.
- Faster, more reliable built‑in tests make it realistic to:
  - Run a full suite on every PR.
  - Keep the repo healthy while iterating rapidly.

---

## 8. Crypto & TLS Stack Refresh (OpenSSL 3.5)

Node 24 ships with a newer **OpenSSL 3.x** series and crypto updates.

**Why we care:**

- We handle **personal and sensitive data** for EU clients.
- We need a modern TLS stack and crypto primitives as a baseline.
- Staying on older Node versions increases the likelihood of:
  - Accumulated CVEs in outdated TLS/cipher suites.
  - Extra maintenance to keep crypto secure.

---

## 9. LTS Timing – Stable Enough, New Enough

Node 24 has **just turned LTS**, which means:

- We get a **long support window** aligned with our roadmap.
- We avoid adopting a short‑lived current release.
- We are early enough to benefit from:
  - Modern features (permissions, V8, HTTP, crypto).
  - Without being on a trailing line (like 20) that will age out sooner.

This is the right moment to standardise on Node 24 as the **minimum supported runtime** for:

- Production deployments.
- CI pipelines.
- Devcontainers / Codespaces.

---

## Summary Decision

We require **Node.js 24 LTS** as the minimum supported version because it gives us:

- A **stable permission model** to sandbox agents and MCP tools.
- A **modern, secure runtime** for HTTP, crypto, and async context.
- A **performance baseline** that can handle complex graph/ML workloads.
- A convenient, secure bundling of npm for our multi‑package repo.

Older LTS lines (20, early 22) either:

- Lack a stable permission model,
- Have older V8/crypto stacks,
- Or require extra manual upgrades (npm, HTTP clients) to approximate what 24 gives by default.

From this point on:

- **All new services and packages MUST target Node 24 LTS or higher.**
- CI and devcontainers should be updated to use Node 24.
- Any future Node upgrade decisions should be recorded as new entries in `docs/governance/decisions/archive/decisions_v_0_2.md` or a subsequent versioned decisions doc.

