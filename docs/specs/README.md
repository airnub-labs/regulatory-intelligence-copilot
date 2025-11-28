# Specs folder layout

The specs directory is organised by family to make the latest documents easy to find while keeping older versions available for reference.

- **graph-schema/** – Schema specs and changelogs for the regulatory graph. The newest schema and changelog live in the folder root; older versions are under `versions/`.
- **concept/** – Conceptual overview of the copilot and its rule graph. Latest spec at the top level, earlier versions in `versions/`.
- **timeline-engine/** – Timeline engine specifications. Keep the current version in the folder root and move prior releases into `versions/`.
- **safety-guards/** – Guardrail specs for graph ingress and outbound egress.
- **conversation-context/** – Conversation context and concept-capture specifications.
- Other standalone specs remain in this directory when they are not part of a specific family.

Within each family, use the `versions/` (or `archive/`) subfolder for legacy documents so the newest spec and changelog are easy to locate.
