# Guards

Specifications for controlling data ingress and egress to the regulatory graph.

## Ingress Guards

- `graph_ingress_v_0_1.md` – Policies and workflow for validating writes to Memgraph.

## Egress Guards

- `egress_guard_v_0_3.md` – **Current spec** (✅ Fully Implemented). Aspect-based egress guard with PII sanitization, mode support (enforce/report-only/off), and defense-in-depth protection at all egress points.
- `egress_v_0_2.md` – Superseded by v0_3. Historical reference only.

## Implementation Status

| Guard | Status | Notes |
|-------|--------|-------|
| Graph Ingress Guard v0.1 | ✅ Implemented | All graph writes via GraphWriteService |
| Egress Guard v0.3 | ✅ Fully Implemented | End-to-end PII protection (2025-12-24) |

See `egress_guard_v_0_3.md` Section 9 for detailed implementation status.
