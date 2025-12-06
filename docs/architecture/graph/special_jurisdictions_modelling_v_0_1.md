# Special Jurisdictions Modelling – UK / IE / NI / IM / GI / AD (v0.1)

> **Status:** Current. This document records the *design decisions* for modelling
> complex European–adjacent jurisdictions and regimes in the regulatory
> intelligence graph.
>
> It is intended to be **architecture‑level guidance** so that future schema and
> code changes remain compatible with these special cases.

## 1. Goals

We need to support a set of non‑trivial, real‑world cross‑border and
post‑Brexit arrangements in the regulatory graph, including:

- Ireland (IE)
- United Kingdom (UK)
- Northern Ireland (NI)
- Isle of Man (IM)
- European Union (EU)
- Gibraltar (GI)
- Andorra (AD)

Key goals:

1. Correctly model **constitutional reality** (who is actually part of which
   state / supranational entity).
2. Correctly model **regulatory reality** (who applies which rules in which
   domains: goods, VAT, social security, mobility, etc.).
3. Allow the engine and agents to answer:
   - Cross‑border residence/work/company questions (IE ↔ NI ↔ GB ↔ IM).
   - Goods / VAT / customs questions under NI’s special regime.
   - CTA (Common Travel Area) mobility/rights questions.
   - Edge cases like Gibraltar and Andorra.
4. Do this **without hard‑coding special cases** into the engine. Everything
   should be derivable from the graph and profile context.

---

## 2. Core Modelling Concepts

We standardise on four core node types for jurisdictional modelling:

- `Jurisdiction` – a state‑level or supranational authority with its own
  legislative and administrative power.
- `Region` – a geographically or legally distinct part of a jurisdiction where
  specific regimes may apply (e.g. Northern Ireland).
- `Agreement` – a treaty, protocol, or framework that binds multiple
  jurisdictions or defines cooperation.
- `Regime` – a **rule‑set** derived from one or more agreements, applicable to
  certain jurisdictions or regions within specific domains (goods, mobility,
  social security, customs, etc.).

We also have existing domain node types such as:

- `Rule`, `Benefit`, `Obligation`, `Timeline`, etc.

### 2.1 Jurisdictions

For special relationships we care about, we model at least:

- `IE` – Ireland (`Jurisdiction`)
- `UK` – United Kingdom (`Jurisdiction`)
- `IM` – Isle of Man (`Jurisdiction`, crown dependency)
- `EU` – European Union (`Jurisdiction`, supranational)
- `GI` – Gibraltar (`Jurisdiction`, British Overseas Territory)
- `AD` – Andorra (`Jurisdiction`, independent state)

These are **top‑level** jurisdiction nodes.

### 2.2 Regions

We introduce `Region` nodes for cases where a part of a jurisdiction has
special regimes that differ from the rest of the state.

- `NI` – Northern Ireland (`Region`), with:
  - `(:Region {code:'NI'})-[:PART_OF]->(:Jurisdiction {code:'UK'})`

We may later add other regions (e.g. Scotland, Wales, etc.) if needed for
specific regime modelling, but **only when required**.

### 2.3 Agreements

`Agreement` nodes capture treaties, protocols, and frameworks, e.g.:

- `CTA` – Common Travel Area.
- `NI_PROTOCOL` – Ireland/Northern Ireland Protocol.
- `WINDSOR_FRAMEWORK` – Windsor Framework adjusting NI Protocol.
- `EU_UK_TCA` – EU–UK Trade and Cooperation Agreement.
- `ANDORRA_EU_CUSTOMS_UNION` – customs union arrangements for Andorra.
- `UK_EU_GIBRALTAR_PROTOCOL` – bespoke agreement for Gibraltar (future).

Agreements connect to parties and regimes, and may have timelines.

### 2.4 Regimes

`Regime` nodes capture the **actual rule‑sets** that agreements give rise to.
They are the key bridge between legal text and practical applicability.

Examples:

- `CTA_MOBILITY_RIGHTS` – rights to live and work across CTA.
- `NI_EU_GOODS_REGIME` – EU‑linked goods/customs/VAT regime in Northern Ireland.
- `AD_EU_INDUSTRIAL_CUSTOMS` – Andorra–EU customs union regime for industrial products.
- `GIBRALTAR_SCHENGEN_BORDER` – Gibraltar border regime (future modelling).

Regimes can be attached to:

- Jurisdictions (applies to whole country).
- Regions (applies only to a part of a country).
- Rules/Benefits that are **available via** a regime.

---

## 3. Northern Ireland Design Decision

### 3.1 Region vs Jurisdiction

**Decision:** Northern Ireland is modelled as a **Region**, not a full
Jurisdiction.

Rationale:

- Constitutionally, NI is part of the UK.
- Regulatory reality: NI is in the UK’s customs territory but applies certain
  **EU single‑market rules for goods** via the NI Protocol / Windsor Framework.
- We want to capture UK membership while still modelling EU‑linked rules
  **without pretending NI is an independent state or a member of the EU**.

Concrete modelling:

```cypher
MERGE (uk:Jurisdiction {code:'UK'})
MERGE (ni:Region {code:'NI'})
MERGE (ni)-[:PART_OF]->(uk)
```

### 3.2 NI Goods Regime

We represent the EU‑linked goods rules via a `Regime` node attached to NI and
coordinated with EU law:

```cypher
MERGE (niProt:Agreement {code:'NI_PROTOCOL'})
MERGE (wf:Agreement {code:'WINDSOR_FRAMEWORK'})
MERGE (niGoods:Regime {code:'NI_EU_GOODS_REGIME'})

MERGE (niProt)-[:ESTABLISHES_REGIME]->(niGoods)
MERGE (niGoods)-[:COORDINATED_WITH]->(eu:Jurisdiction {code:'EU'})
MERGE (niGoods)-[:IMPLEMENTED_VIA]->(wf)
MERGE (ni:Region {code:'NI'})-[:SUBJECT_TO_REGIME]->(niGoods)
```

Benefits/Rules that depend on NI’s special status (e.g. VAT treatment, goods
origin, customs flows) link via `AVAILABLE_VIA_REGIME` or similar edges.

This allows queries such as:

- "Show all regions where EU goods rules apply but that are not in the EU."
- "Explain why a goods rule applies differently in NI vs GB main island."

All without changing the fundamental fact that NI is **part of UK**.

---

## 4. Common Travel Area (CTA) & Social Security Coordination

### 4.1 CTA as Agreement + Regime

We treat the Common Travel Area as an `Agreement` that establishes one or more
`Regime` nodes.

Example:

```cypher
MERGE (cta:Agreement {code:'CTA'})
MERGE (ie:Jurisdiction {code:'IE'})
MERGE (uk:Jurisdiction {code:'UK'})
MERGE (im:Jurisdiction {code:'IM'})

MERGE (ie)-[:PARTY_TO]->(cta)
MERGE (uk)-[:PARTY_TO]->(cta)
MERGE (im)-[:PARTY_TO]->(cta)

MERGE (ctaReg:Regime {code:'CTA_MOBILITY_RIGHTS'})
MERGE (cta)-[:ESTABLISHES_REGIME]->(ctaReg)

MERGE (ie)-[:SUBJECT_TO_REGIME]->(ctaReg)
MERGE (uk)-[:SUBJECT_TO_REGIME]->(ctaReg)
MERGE (im)-[:SUBJECT_TO_REGIME]->(ctaReg)
```

Mobility/benefit rules that flow from CTA can then be attached:

```cypher
MERGE (ctaWork:Benefit {code:'CTA_RIGHT_TO_LIVE_AND_WORK'})
MERGE (ctaWork)-[:AVAILABLE_VIA_REGIME]->(ctaReg)
MERGE (ctaWork)-[:IN_JURISDICTION]->(ie)
MERGE (ctaWork)-[:IN_JURISDICTION]->(uk)
MERGE (ctaWork)-[:IN_JURISDICTION]->(im)
```

### 4.2 Social Security Coordination Rule

We can also model high‑level social security coordination between IE and UK in
CTA/bilateral context as a `Rule`:

```cypher
MERGE (ssCoord:Rule {code:'IE_UK_SOCIAL_SECURITY_COORDINATION'})
MERGE (ssCoord)-[:APPLIES_BETWEEN]->(ie)
MERGE (ssCoord)-[:APPLIES_BETWEEN]->(uk)
MERGE (ssCoord)-[:RELATED_TO_AGREEMENT]->(cta)
```

Agents can then:

- Pull this rule when a user has `residenceJurisdiction = 'IE'` and
  `workJurisdiction = 'UK'` (or vice versa).
- Combine it with Timeline nodes (e.g. when certain rules came into force).

---

## 5. Gibraltar (GI)

Gibraltar is modelled as its **own Jurisdiction** (not part of UK), with
bespoke agreements and regimes.

### 5.1 Jurisdiction

```cypher
MERGE (gi:Jurisdiction {code:'GI'})
  ON CREATE SET gi.name = 'Gibraltar',
                gi.kind = 'british_overseas_territory';
```

### 5.2 Agreements & Regimes (Future)

We anticipate:

- An `Agreement` node for the EU–UK (or Spain–UK–EU) agreement on Gibraltar.
- `Regime` nodes for:
  - Border/mobility (Schengen‑style border treatment).
  - Customs/tax alignment regimes.

Example pattern:

```cypher
MERGE (gibProt:Agreement {code:'UK_EU_GIBRALTAR_PROTOCOL'})
MERGE (gibBorder:Regime {code:'GIBRALTAR_SCHENGEN_BORDER'})

MERGE (gibProt)-[:ESTABLISHES_REGIME]->(gibBorder)
MERGE (gi)-[:SUBJECT_TO_REGIME]->(gibBorder)
MERGE (gibBorder)-[:COORDINATED_WITH]->(eu)
```

This mirrors the NI pattern without conflating GI with UK/EU membership. The
engine can still answer questions like "why is the border experience in
Gibraltar different from a standard non‑EU country?".

---

## 6. Andorra (AD)

Andorra is also its own `Jurisdiction` with special EU customs/tax
relationships.

### 6.1 Jurisdiction

```cypher
MERGE (ad:Jurisdiction {code:'AD'})
  ON CREATE SET ad.name = 'Andorra',
                ad.kind = 'sovereign_state';
```

### 6.2 Customs Union / Tax Regimes

We model the customs union for industrial products and other agreements via
`Agreement` and `Regime` nodes:

```cypher
MERGE (adCustoms:Agreement {code:'ANDORRA_EU_CUSTOMS_UNION'})
MERGE (adReg:Regime {code:'AD_EU_INDUSTRIAL_CUSTOMS'})

MERGE (ad)-[:PARTY_TO]->(adCustoms)
MERGE (adCustoms)-[:ESTABLISHES_REGIME]->(adReg)
MERGE (adReg)-[:COORDINATED_WITH]->(eu)
MERGE (ad)-[:SUBJECT_TO_REGIME]->(adReg)
```

VAT/indirect tax peculiarities (e.g. low rates) can be captured as Rules and
linked to this regime.

---

## 7. Profile & Agent Implications

### 7.1 Profile Modelling

To leverage this graph, the **user profile** should distinguish:

- `residenceJurisdiction` – where the person lives.
- `workJurisdiction` – where they are employed/self‑employed.
- `companyJurisdiction` – where their company is registered.
- `regions` – any special regions applicable (e.g. `['NI']`).
- `jurisdictions` – derived list of all relevant jurisdictions for the session
  (e.g. `['IE', 'UK', 'EU']`).

Agents and prompt aspects should encode this context clearly into their system
prompts and graph queries.

### 7.2 Global & Expert Agents

- The **Global Regulatory Copilot** operates over whatever set of jurisdictions
  and regions is present in the profile, and pulls relevant Agreements/Regimes.
- Specialised agents (e.g. CTA / cross‑border social security agent) can:
  - Focus on `CTA` + `IE_UK_SOCIAL_SECURITY_COORDINATION` + NI/IM.
  - Explain rights and coordination when a user lives on one side of the
    border and works on the other.

Because the logic lives in the graph, agents do **not** need hard‑coded

```ts
if (jurisdiction === 'NI') { /* special case */ }
```

blocks; they simply query the relevant neighbourhood.

---

## 8. Timeline Integration

Timeline nodes (as per `docs/architecture/engines/timeline-engine/spec_v_0_2.md`) should be attached to
Agreements and Regimes to express:

- When a protocol or framework came into force.
- When a regime was modified (e.g. Windsor Framework adjusting NI Protocol).
- Transition periods where old and new rules overlap.

Examples:

```cypher
MERGE (brexit:Timeline {code:'BREXIT_DATE'})
MERGE (niProt:Agreement {code:'NI_PROTOCOL'})
MERGE (niProt)-[:EFFECTIVE_FROM]->(brexit)

// Later effective date for Windsor Framework could be modelled similarly
```

Agents must **never hard‑code** dates or durations; they should:

1. Pull relevant `Timeline` nodes from the graph.
2. Use the Timeline Engine to calculate eligibility windows and lock‑ins.

---

## 9. Non‑Goals and Guardrails

- We **do not** attempt to model constitutional status beyond what is required
  for regulatory reasoning.
- We **do not** treat NI, GI, or AD as EU member states; instead we model
  specific regimes where EU law is applied or coordinated.
- We **do not** encode legal advice into the graph; we encode **rules, regimes,
  and relationships** that support research and explanation.

The system remains a **regulatory research copilot**, not a source of formal
legal/tax/welfare advice.

---

## 10. Implementation Notes

- This document is **normative** for schema decisions concerning:
  - Northern Ireland
  - Common Travel Area
  - Isle of Man
  - Gibraltar
  - Andorra

- Any future changes to how these are modelled must:
  1. Update this document (or a v0.2 successor), and
  2. Update `docs/architecture/graph/archive/schema_v_0_3.md` (or later version) and the graph
     changelog.

- The example seed file `docs/architecture/graph/seed_ni_uk_ie_eu.txt` provides a
  minimal working seed for IE/UK/NI/IM/EU + CTA + NI goods regime and should be
  kept in sync with this document.
