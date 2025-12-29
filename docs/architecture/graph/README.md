# Graph

Authoritative specifications for the regulatory rules graph. These documents cover the schema, changelog, algorithms, change detection, seeding, and special jurisdiction handling. Historical material lives in `archive/`.

## Current Version: v0.7

The v0.7 schema introduces comprehensive regulatory modelling with support for obligations, thresholds, rates, authorities, forms, and contributions. See the changelog for full details.

## Key Files

### Schema & Changelog (Current)

- `schema_v_0_7.md` – **Current schema specification** with all node and relationship definitions
- `schema_changelog_v_0_7.md` – Detailed changelog documenting v0.7 additions and migration guide
- `schema_v_0_7_implementation_guide.md` – Step-by-step implementation guide for coding agents

### Supporting Documentation

- `algorithms_v_0_1.md` – Algorithmic guidance over the graph (Leiden, centrality)
- `change_detection_v_0_6.md` – Change detection design
- `special_jurisdictions_modelling_v_0_1.md` – Modelling guidance for NI/UK/IE/EU/IM/CTA

### Seed Data

- `seed_ni_uk_ie_eu.txt` – Initial seeding data for NI/UK/IE/EU

### Previous Versions

- `schema_v_0_6.md` and `schema_changelog_v_0_6.md` – v0.6 with Concept layer
- `archive/` – Prior schema versions and changelog history

## v0.7 Highlights

### New Node Types

| Node | Purpose | Priority |
|------|---------|----------|
| `:Obligation` | Filing, registration, payment requirements | HIGH |
| `:Threshold` | Quantitative limits and eligibility thresholds | HIGH |
| `:Rate` | Tax rates, contribution rates, benefit rates | HIGH |
| `:Authority` | Regulatory bodies and agencies | MEDIUM |
| `:Form` | Official forms and returns | MEDIUM |
| `:Contribution` | PRSI, pension contributions | MEDIUM |
| `:Disqualification` | Events preventing benefit access | MEDIUM |

### New Relationship Types

| Relationship | Purpose |
|--------------|---------|
| `SUPERSEDES` | Tracks how rules/rates/thresholds change over time |
| `TRIGGERS` / `UNLOCKS` | Models cascading eligibility |
| `STACKS_WITH` | Benefits/reliefs that can be combined |
| `COUNTS_TOWARDS` | Contributions counting towards conditions |
| `HAS_THRESHOLD` / `HAS_RATE` | Links to quantitative values |

### Why v0.7 Matters

- **Complete compliance picture**: Models what you MUST do, not just what you CAN get
- **Quantitative queries**: Compare thresholds and rates across jurisdictions
- **Historical tracking**: See how rules evolve over time with `SUPERSEDES`
- **Practical guidance**: Link to forms, authorities, and deadlines
- **Trust & provenance**: Track where information comes from

## Quick Start for Implementers

1. Read `schema_v_0_7.md` for the full specification
2. Follow `schema_v_0_7_implementation_guide.md` for step-by-step instructions
3. Update Graph Ingress Guard whitelists first
4. Add TypeScript interfaces, then upsert methods
5. Create seed data for core authorities and thresholds
