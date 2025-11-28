# Node 24 LTS – Integration Checklist

This document tracks which specs/docs must explicitly assume **Node.js 24 LTS as the minimum runtime** and reference its key features (permission model, ALS, HTTP stack, crypto, etc.).

## Documents that should reference Node 24 LTS

1. **High-level architecture & decisions**
   - `docs/architecture_v_0_2.md`
     - State that all backend services and CLI tools are expected to run on **Node 24 LTS or higher**.
     - Mention that we rely on:
       - The **permission model** (`--permission`) for sandboxing agents/MCP tools.
       - Modern **AsyncLocalStorage** for per-request context.
       - The built-in **fetch/HTTP client** for outbound calls where possible.
   
   - `docs/decisions_v_0_2.md`
     - Add a decision entry referencing `node_24_lts_rationale.md`, e.g.:
       - *D-00X: Node.js 24 LTS is the minimum supported runtime for all services, based on the rationale in `docs/architecture/runtime/node_24_lts_rationale.md`.*

2. **Roadmap & migration**
   - `docs/governance/roadmap/archive/roadmap_v_0_2.md`
     - Add tasks to:
       - Update **CI** to use Node 24 LTS in all workflows.
       - Update **devcontainers / Codespaces** to Node 24 LTS.
       - Deprecate Node 20/22 support if mentioned anywhere.
   
   - `docs/governance/migrations/migration_plan_v_0_2.md`
     - Add a short section:
       - *“Runtime Migration”* describing:
         - Upgrading local dev to Node 24.
         - Ensuring test suite passes on Node 24.
         - Enabling permission model flags in non-prod first, then prod.

3. **Developer-facing entry points**
   - `README.md`
     - In *Getting Started* / *Prerequisites*:
       - Change `Node 20+` or generic `Node LTS` to **`Node.js 24 LTS or newer`**.
       - Optionally link to `docs/architecture/runtime/node_24_lts_rationale.md` as the rationale.
   
   - `AGENTS.md`
     - If it mentions runtime assumptions, clarify that agents are designed with Node 24 features (permission model, ALS) in mind.

4. **Dev environment & tooling**
   - `.nvmrc` / `.node-version` (if present)
     - Set to the chosen **24.x** version.
   - `devcontainer.json` or `.devcontainer/*`
     - Update any `NODE_VERSION` / image tags to Node 24.
   - CI workflows (e.g. `.github/workflows/*.yml`)
     - Update `setup-node` / `actions/setup-node` to use Node 24.

5. **Security / platform notes**
   - `docs/architecture/runtime/node_24_lts_rationale.md`
     - Already present; treat as the canonical explanation.
   - If there's a `SECURITY.md` or `PLATFORM.md` later:
     - Explicitly tie our **sandboxing and permission model** requirements to Node 24.

## Quick summary for maintainers

When you:
- Add a new backend package or service, assume **Node 24 LTS minimum**.
- Change CI or devcontainer images, point them to **Node 24**.
- Write new docs for runtime assumptions, link back to `docs/architecture/runtime/node_24_lts_rationale.md`.

Once the above docs are updated, the repo will consistently reflect Node 24 as the baseline.

