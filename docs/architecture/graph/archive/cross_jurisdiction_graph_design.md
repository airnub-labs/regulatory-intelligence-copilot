# Cross-Jurisdiction Graph Design – Regulatory Intelligence Copilot

> **Goal:** Support reasoning across multiple jurisdictions (e.g. Ireland, other EU member states, Isle of Man, Malta) including intersections, mutual exclusions, coordination rules and conflicts – without assuming any single country is always the “primary”.

This document extends `schema_v_0_1.md` with patterns for multi-jurisdiction modelling.

---

## 1. Design Principles

1. **Jurisdiction-neutral core**  
   The graph must work no matter which jurisdiction is the user’s home, company registration, or work location. No hard-coded “primary = IE”.

2. **Static law vs dynamic scenario**  
   - The graph stores **rules and relationships**, not user-specific data.
   - User context (residency, company location, work state, etc.) lives in the sandbox and is used to filter the graph.

3. **Explicit cross-jurisdiction links**  
   Cross-border interactions are first-class edges (e.g. coordination, conflicts, treaties), not implied by LLM guesswork alone.

4. **Symmetry & directionality**  
   Relationships should work from either side (IE → MT and MT → IE) but allow direction where law is asymmetric (e.g. one-sided exemptions).

5. **Explainable precedence**  
   Where EU law or treaties override local rules, this should be visible in the graph via specific edge types (e.g. `OVERRIDES`, `IMPLEMENTED_BY`).

---

## 2. Jurisdiction Modelling

We introduce a dedicated `:Jurisdiction` node and align existing nodes to it.

### 2.1 `:Jurisdiction` Nodes

Examples:

- `(:Jurisdiction { id: "IE", name: "Ireland", type: "COUNTRY" })`
- `(:Jurisdiction { id: "MT", name: "Malta", type: "COUNTRY" })`
- `(:Jurisdiction { id: "IM", name: "Isle of Man", type: "CROWN_DEPENDENCY" })`
- `(:Jurisdiction { id: "EU", name: "European Union", type: "SUPRANATIONAL" })`

### 2.2 `IN_JURISDICTION` Relationships

Every rule-like node connects to exactly one jurisdiction:

- `(:Statute)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:Section)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:Benefit)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:Relief)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:Guidance)-[:IN_JURISDICTION]->(:Jurisdiction)`
- `(:Case)-[:IN_JURISDICTION]->(:Jurisdiction)`

This complements (or replaces) the plain `jurisdiction` string property; queries should prefer the relationship.

**Benefits:**
- Easy to filter rules by jurisdiction or sets of jurisdictions.
- Easy to attach metadata or properties at jurisdiction level (e.g. EU member status).

---

## 3. Cross-Jurisdiction Relationship Types

We extend the graph with relationship types that explicitly model cross-country interactions.

### 3.1 Coordination & Social Security

For social security coordination (e.g. EC 883/2004, bilateral agreements):

- `(:Section|:Benefit|:Relief)-[:COORDINATED_WITH { basis: "EU883/2004" | "BILATERAL_TREATY" }]->(:Section|:Benefit|:Relief)`

Use cases:
- Irish PRSI rules coordinated with another EU state’s contribution rules.
- Isle of Man social security agreements linked to Irish or UK rules.

### 3.2 Treaty Links (Tax & Social Security)

For double taxation agreements and social security treaties:

- `(:Section|:Relief)-[:TREATY_LINKED_TO { treaty_id, description }]->(:Section|:Relief)`
- `(:Statute)-[:TREATY_LINKED_TO]->(:Statute)` (for higher-level links)

This lets agents say:
- “Your Irish tax rules here are linked by treaty to these Maltese rules.”

### 3.3 EU Implementation & Supremacy

We already have:

- `(:EURegulation|:EUDirective)-[:IMPLEMENTED_BY]->(:Section)`

For conflicts or overrides, add:

- `(:EURegulation|:EUDirective)-[:OVERRIDES]->(:Section)`

Properties can include:

- `scope: "TAX" | "SOCIAL_SECURITY" | "EMPLOYMENT"`.
- `notes: string` – free-text explanation.

### 3.4 Cross-Border Mutual Exclusions & Conflicts

We reuse `EXCLUDES` and `MUTUALLY_EXCLUSIVE_WITH` across jurisdictions, with optional metadata:

- `(:Benefit)-[:EXCLUDES { reason: "COORDINATION_RULE", controller: "EU" }]->(:Benefit)`
- `(:Relief)-[:MUTUALLY_EXCLUSIVE_WITH { scope: "CROSS_BORDER", basis: "TREATY" }]->(:Relief)`

Examples:
- Claiming a particular benefit in Country A excludes a parallel benefit in Country B.
- Certain reliefs cannot both be claimed if tax residency is split.

These edges are **symmetric in meaning**, but may be modelled as two directed edges or treated as undirected by query conventions.

### 3.5 Cross-Jurisdiction Equivalence & Analogy

To help the LLM explain things using analogies:

- `(:Benefit|:Relief)-[:EQUIVALENT_TO { confidence: float }]->(:Benefit|:Relief)`

Example:
- Irish Jobseeker’s Benefit (Self-Employed) is roughly equivalent in function to a specific Maltese unemployment benefit.

The LLM can use this to say:
- “This Maltese benefit is similar in role to the Irish X benefit, but with these differences…”

---

## 4. User Context vs Graph

The graph stays **user-independent**. User context is an input to the agent runtime and influences queries.

### 4.1 User Context Structure (Sandbox Only)

Example shape (TypeScript-ish):

```ts
interface JurisdictionalContext {
  residence: string[];        // e.g. ["IE"]
  company_incorporation: string[]; // e.g. ["IE", "MT"]
  work_locations: string[];   // e.g. ["IE", "MT", "IM"]
  social_security_payments: string[]; // where contributions are currently made
  tax_residency_flags: Record<string, boolean>; // e.g. { IE: true, MT: false }
}
```

The context never gets written to Memgraph. It drives **which slices of the graph** get pulled.

### 4.2 Jurisdiction Selection Logic

Given a question and `JurisdictionalContext`, the orchestrator decides:

1. **Primary set** – where the user is resident / incorporated / insured.
2. **Secondary set** – other jurisdictions mentioned in the question or context.
3. Always include **EU** where relevant.

Agents then query:

```cypher
MATCH (j:Jurisdiction)
WHERE j.id IN $primaryOrSecondaryJurisdictions
MATCH (n)-[:IN_JURISDICTION]->(j)
// then expand via cross-border edges
```

This works regardless of which jurisdiction is considered “home”.

---

## 5. Cross-Jurisdiction Query Patterns

### 5.1 Local Rules + Cross-Border Links

Given a set of jurisdictions `{IE, MT, EU}`:

```cypher
MATCH (j:Jurisdiction)
WHERE j.id IN $jurisdictions
MATCH (n)-[:IN_JURISDICTION]->(j)

OPTIONAL MATCH (n)-[r:COORDINATED_WITH|TREATY_LINKED_TO|EXCLUDES|MUTUALLY_EXCLUSIVE_WITH|EQUIVALENT_TO]->(m)
OPTIONAL MATCH (m)-[:IN_JURISDICTION]->(j2:Jurisdiction)
WHERE j2.id IN $jurisdictions

RETURN n, collect(DISTINCT r) AS rels, collect(DISTINCT m) AS neighbours;
```

The agent then summarises this subgraph and passes it to the LLM.

### 5.2 Finding Cross-Border Mutual Exclusions

```cypher
MATCH (j1:Jurisdiction {id: $jurisA})
MATCH (j2:Jurisdiction {id: $jurisB})
MATCH (n)-[:IN_JURISDICTION]->(j1)
MATCH (m)-[:IN_JURISDICTION]->(j2)
MATCH (n)-[r:EXCLUDES|MUTUALLY_EXCLUSIVE_WITH]->(m)
RETURN n, r, m;
```

Used for:
- Explaining when claiming a benefit/relief in one country will block something in another.

### 5.3 Social Security Coordination Example

```cypher
MATCH (n:Section)-[:IN_JURISDICTION]->(:Jurisdiction {id: "IE"})
WHERE n.id = $prsiSectionId
OPTIONAL MATCH (n)-[r:COORDINATED_WITH]->(m:Section)
OPTIONAL MATCH (m)-[:IN_JURISDICTION]->(j:Jurisdiction)
RETURN n, r, m, j;
```

Then the agent can ask the LLM to explain:
- How Irish PRSI coordination works with Maltese or Isle of Man contributions.

---

## 6. Handling Timelines Across Jurisdictions

The `Timeline` engine stays jurisdiction-agnostic, but:

- Different rules can have different timelines per jurisdiction.
- Cross-border edges can point to different `:Timeline` nodes.

Example:

- Irish CGT relief: `(:Relief {jurisdiction: "IE"})-[:LOCKS_IN_FOR_PERIOD]->(:Timeline {window_years: 4})`
- Maltese equivalent relief: `(:Relief {jurisdiction: "MT"})-[:LOCKS_IN_FOR_PERIOD]->(:Timeline {window_years: 3})`
- `(:Relief_IE)-[:EQUIVALENT_TO]->(:Relief_MT)`

The agent can:

1. Compute both lock-in periods using the timeline engine.
2. Ask the LLM to explain how they differ for the user’s scenario.

---

## 7. Isle of Man & Malta Specific Considerations

### 7.1 Isle of Man (IM)

- Not in the EU, but has tax and social security links with the UK and possibly relevant arrangements impacting Irish residents.
- Use `COORDINATED_WITH` / `TREATY_LINKED_TO` edges for:
  - Social security agreements.
  - Double tax treaty (if applicable via UK or directly).

### 7.2 Malta (MT)

- EU member state.
- Often relevant in:
  - Company incorporation / residency planning.
  - Double taxation treaty with Ireland.
- Model:
  - Maltese statutes and benefits with `IN_JURISDICTION -> MT`.
  - EU regs as usual with `IN_JURISDICTION -> EU` and `IMPLEMENTED_BY` edges into both IE and MT.

---

## 8. LLM Prompting Considerations

When passing a cross-border subgraph to the LLM, agents should:

- Include explicit jurisdiction labels for each node.
- Explicitly mention:
  - Where the user is resident.
  - Where the company is incorporated.
  - Where work is performed.
- Ask the LLM to:
  - Identify which rules *appear* to govern which aspect (tax, social security, etc.).
  - Highlight where EU/treaty rules might override local rules.
  - Clearly flag uncertainties and advise the user to verify with local professionals.

Example directive:

> "You are given a set of rules from multiple jurisdictions (Ireland, Malta, Isle of Man, EU). Do **not** assume that one country always takes priority. Instead, explain which rules **appear** to apply in which dimension (tax, social security, etc.), and point out where EU regulations or treaties might take precedence. Always emphasise uncertainty and recommend confirmation with qualified professionals in each relevant country."

---

## 9. Summary

By introducing explicit `:Jurisdiction` nodes and cross-border relationship types like `COORDINATED_WITH`, `TREATY_LINKED_TO`, `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, and `EQUIVALENT_TO`, the graph can:

- Represent complex cross-country interactions.
- Reason about mutual exclusions and treaty-based coordination.
- Avoid hardcoding any one country as the “primary”.
- Support richer, cross-border agents for Ireland, other EU countries, Isle of Man, Malta, and beyond.

All of this remains compatible with the existing Memgraph + E2B + MCP architecture and can be introduced incrementally as new jurisdictions and rule sets are added.

