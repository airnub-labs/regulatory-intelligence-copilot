# Documentation restructure proposal

## Context

Before this reorganisation, high-level design docs lived under `docs/` and detailed specs under `docs/specs/`, duplicating many topics (graph schema, timeline engine, conversation context, scenario engine, safety guards) across both trees. This plan defined the domain-first layout used to merge those materials so architecture narratives, specs, changelogs, and older versions sit side by side. The follow-up simplification collapses the domains so most technical content now lives under **architecture/** and strategic/product material under **governance/**.

## Organising principles

1. **Domain-first grouping** – Place all documents for a domain under a single folder with a short README explaining how to navigate it.
2. **Single home per topic** – Avoid parallel `docs/` and `docs/specs/` folders for the same topic; keep latest docs at the folder root and park historical versions inside `versions/` or `archive/` subfolders.
3. **Consistent naming** – Use noun-based folder names and `_v_*` suffixes for versioned files to align with existing conventions.
4. **Entry-point README** – Each domain folder should start with a README that lists the current canonical files and where to find older revisions.

## Proposed target structure

```
docs/
  architecture/                 # Architecture overviews & diagrams, graph, engines, privacy/guardrails, concepts, development notes
    concept/                    # Core concept definitions (brought up from deep graph paths)
    graph/                      # Graph model, schema, algorithms, seeding guidance
    engines/                    # Timeline engine
    conversation-context/       # Concept capture and ConversationContext specs
    change-detection/           # Change detection specs and archives
    safety-guards/              # Ingress and egress guard designs
    development/                # Local dev guides, lint rules, node integration rationale
  governance/                   # ADRs, decision logs, roadmap, phase plans, product specs
    product/                    # User-facing specs (eligibility explorer, scenario engine)
  api/                          # API references (unchanged)
```

### Example file placement

- **architecture/** – `architecture_v_0_6.md`, `architecture_diagrams_v_0_6.md`, previous versions under `architecture/versions/`.
- **governance/** – `decisions/` contents, `roadmap/` contents, `phases/` plans, and migration plans. Add a short README that clarifies the lifecycle (decision → roadmap → phase plan).
- **graph/** – Move `docs/architecture/concept/`, `docs/architecture/graph/graph-schema/`, `docs/architecture/graph/graph_algorithms_v_0_1.md`, `docs/architecture/graph/graph_seed_ni_uk_ie_eu.txt`, and `docs/architecture/graph/special_jurisdictions_modelling_v_0_1.md`. Keep `versions/` subfolders inside this tree for historical schemas and concepts.
- **engines/** – Keep the Timeline Engine spec here; move conversation context and change detection into their own top-level architecture folders.
- **privacy & guards** – Keep `data_privacy_and_architecture_boundaries_v_0_1.md` at the architecture root and collect ingress/egress guard specs under `docs/architecture/safety-guards/`.
- **product/** – Place `eligibility_explorer_spec_v_0_1.md`, scenario engine concepts, and any UX/product-oriented specs here. Add a `product/README.md` that points back to graph and timeline dependencies.
- **development/** – Consolidate `LOCAL_DEVELOPMENT.md`, `eslint_rules.md`, `node_24_lts_integration_checklist.md`, and `node_24_lts_rationale.md` to give contributors a single entry point for setup and tooling.

## Migration steps (completed)

1. Create the new domain folders and add a minimal README to each that lists the canonical current files and where to find historical versions.
2. Move existing files from `docs/specs/` into the corresponding domain folders above, preserving `versions/` subfolders to keep history intact.
3. Update cross-links inside documents (e.g., architecture v0.6, agent specs, roadmap) to point to the new paths.
4. Simplify `docs/specs/README.md` into a short redirect note (or remove after updating links) once all files are rehomed.
5. Update `docs/README.md` to reflect the domain-first layout and remove references to the old parallel trees.
6. Leave stubs in `docs/specs/` temporarily only if needed for external references, with clear pointers to the new locations; remove them once downstream links are updated.

## Expected outcomes

- Readers can browse by domain and immediately see the latest spec, changelog, and historical context in one place.
- Reduced duplication between `docs/` and `docs/specs/` and clearer ownership of each topic.
- Easier onboarding for contributors, who get a single entry point per area (architecture, graph, engines, safety, product, development).
