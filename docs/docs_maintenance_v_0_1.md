# Docs Maintenance & Naming Conventions (v0.1)

**Status:** v0.1 (canonical)

This guide defines how documentation under `docs/` is organised, named, versioned, and maintained. Coding agents **must read this file before adding, renaming, or archiving documentation.**

## 1. Domain Layout

Documentation is organised by long-lived domains. Do not add new top-level domains without human maintainer approval.

- `architecture/` – system and runtime design, schemas, engines, and guards.
- `governance/` – decisions, roadmap, migrations, and product specifications.
- `development/` – local development guidance, implementation plans, and engineering artefacts.
- `api/` – API references, operational runbooks, and related guides.

## 2. File Naming Rules

Let directories carry context; filenames should stay short, descriptive, and avoid repeating the directory name.

- Prefer `snake_case` for filenames.
- Common patterns:
  - `<doc_type>_v_<major>_<minor>.md` (e.g., `spec_v_0_6.md`, `concept_v_0_6.md`).
  - `<base>_<doc_type>_v_<major>_<minor>.md` when a base term adds clarity (e.g., `graph_ingress_guidelines_v_0_2.md`).
- Typical `doc_type` values: `spec`, `concept`, `overview`, `integration`, `changelog`, `seed`, `guidelines`, `rationale`, `checklist`.
- Avoid repeating directory context (e.g., prefer `schema_v_0_6.md` over `graph_schema_v_0_6.md` when inside `graph/`).

## 3. Versioning & Archival

- Keep **one current version** of each topic in its parent folder.
- Move superseded versions into an `archive/` sibling directory. Use the same naming pattern (e.g., `archive/spec_v_0_3.md`).
- Do **not** create `versions/` directories.
- When replacing a document, **archive by default** instead of deleting. Only delete when explicitly instructed by a human maintainer.

## 4. Agent Expectations

- Before editing docs, review this guide and any relevant `README.md` files in the target directory.
- When adding or renaming docs:
  - Follow the naming patterns above and keep filenames directory-aware.
  - Update cross-references in `README.md`, `docs/README.md`, `AGENTS.md`, `PROMPT.md`, and any linked docs.
- When superseding content:
  - Move the previous version to the appropriate `archive/` directory.
  - Update references to point to the new filename/version.
- Default to **archiving instead of deleting**. Deletions require explicit human direction.

Adhering to these conventions keeps the docs tree consistent and discoverable for both humans and coding agents.
