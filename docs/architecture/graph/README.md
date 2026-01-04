# Graph

Authoritative specifications for the regulatory rules graph. These documents cover the schema, change detection, algorithms, and special jurisdiction handling.

---

## Primary Entry Points

### Current Specification (v0.6)

- **[`regulatory-graph_current_v0.6.md`](./regulatory-graph_current_v0.6.md)** — Canonical entry point for the current graph schema, change detection, and modeling conventions. Start here.

### Future Proposals (v0.7+)

- **[`regulatory-graph_proposals_v0.7+.md`](./regulatory-graph_proposals_v0.7+.md)** — Proposed enhancements for future releases (RegulatoryBody, AssetClass, MeansTest, TaxYear, UK/EU extensions). Not yet implemented.

---

## Detailed Specifications

### Schema

- [`schema_v_0_6.md`](./schema_v_0_6.md) — Complete node/edge property definitions for v0.6.
- [`schema_changelog_v_0_6.md`](./schema_changelog_v_0_6.md) — Schema evolution history.

### Change Detection

- [`change_detection_v_0_6.md`](./change_detection_v_0_6.md) — Detailed change detection specification.

### Algorithms

- [`algorithms_v_0_1.md`](./algorithms_v_0_1.md) — Optional graph algorithms (Leiden community detection, centrality).

### Special Jurisdictions

- [`special_jurisdictions_modelling_v_0_1.md`](./special_jurisdictions_modelling_v_0_1.md) — Modeling guidance for NI, IM, CTA, Gibraltar, Andorra.

### Seed Data

- [`seed_ni_uk_ie_eu.txt`](./seed_ni_uk_ie_eu.txt) — Initial seeding data for IE/UK/NI/IM/EU and CTA.

---

## Historical Documents

The following documents are retained for historical reference:

- [`REGULATORY_GRAPH_REVIEW.md`](./REGULATORY_GRAPH_REVIEW.md) — Original gap analysis (2025-12-28). Consolidated into proposals doc.
- [`REGULATORY_GRAPH_FUTURE_ENHANCEMENTS.md`](./REGULATORY_GRAPH_FUTURE_ENHANCEMENTS.md) — Post-implementation review (2025-12-29). Consolidated into proposals doc.

---

## Archives

- [`archive/`](./archive/) — Prior schema versions (v0.1–v0.4), changelog history, and earlier change detection notes.
- [`docs/archive/graph/`](../../archive/graph/) — Implementation records for tier enhancements (Penalty, LegalEntity, TaxCredit).
