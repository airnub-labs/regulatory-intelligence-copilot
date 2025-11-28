# Safety guards

Ingress and egress guardrails for graph access and outbound calls.

- **data_privacy_and_architecture_boundaries_v_0_1.md** (in the architecture root) – What can and cannot enter the shared graph; PII boundaries.
- **graph_ingress_guard_v_0_1.md** – Ingress guard and ingress-aspect pipeline for all graph writes.
- **egress_guard_v_0_2.md** – Outbound guard and egress-aspect pipeline for all LLM/MCP/HTTP calls.

Consult these documents whenever graph writes, LLM calls, or external integrations are involved.
