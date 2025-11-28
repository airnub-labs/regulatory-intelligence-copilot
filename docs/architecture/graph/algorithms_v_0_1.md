# Graph Algorithms Spec — v0.1

> **Scope:** Document how the Regulatory Intelligence Copilot uses Memgraph algorithms **today**, and how optional Leiden community detection can be added **without breaking** existing behaviour.
>
> **Goal:** Keep the current powerful, explicit edge-based interaction logic as the source of truth, and treat community detection as a *decorative / assistive* layer that can be turned off at any time.

---

## 1. Design Principles

1. **Explicit edges are the source of truth**  
   Mutual exclusions, dependencies, timelines, and cross-domain interactions are represented explicitly via typed edges such as `EXCLUDES`, `MUTUALLY_EXCLUSIVE_WITH`, `LIMITED_BY`, `REQUIRES`, `CITES`, `LOOKBACK_WINDOW`, `LOCKS_IN_FOR_PERIOD`, `COORDINATED_WITH`, `TREATY_LINKED_TO`, `INTERPRETS`, etc.  
   These semantic edges — plus the LLM/MCP ingestion logic that creates them — are where the real power comes from.

2. **Path-based queries remain the primary interaction engine**  
   All high‑value behaviour (hidden interaction discovery, mutual exclusions, impact analysis) must continue to work **purely from these edges** using Cypher pattern queries. Community detection must not be required for correctness.

3. **Community detection is optional and additive**  
   Leiden (or any other community detection algorithm) is an **optional lens**:
   - It annotates nodes with metadata (`community_id`, tags, summaries).
   - It can be enabled, tuned, or completely disabled without breaking core behaviour.

4. **Memgraph Community + MAGE only (for now)**  
   All algorithms used in this project must run on **Memgraph Community** with the open-source **MAGE** extensions. Memgraph Enterprise features (HA, dynamic algorithms, RBAC, etc.) may be considered later but are **not** required for correctness.

---

## 2. Current Behaviour (v0.1) — No Community Detection Required

### 2.1 Semantic edges (source of truth)

The graph schema defines a rich set of relationship types that encode regulatory semantics. Examples include:

- `EXCLUDES` / `MUTUALLY_EXCLUSIVE_WITH` — mutual exclusions and conflict rules
- `LIMITED_BY` — caps, thresholds, or constraints
- `REQUIRES` — prerequisites / eligibility conditions
- `CITES` / `REFERENCES` — cross‑references in legislation or guidance
- `LOOKBACK_WINDOW` / `LOCKS_IN_FOR_PERIOD` — time‑based constraints
- `COORDINATED_WITH` / `TREATY_LINKED_TO` — cross‑jurisdiction coordination (IE/UK/EU/IM/etc.)
- `INTERPRETS` — case law or guidance that interprets a rule

These edges are created and updated by ingestion agents (via MCP + E2B) and upserted through the `GraphWriteService` and **Graph Ingress Guard**.

### 2.2 Query patterns used today

The system uses **direct Cypher queries** over these edges for all core behaviours:

- **Mutual exclusions & conflicts**
  - Find rules that **exclude** or are **mutually exclusive** with a target rule.
  - Typical pattern: `MATCH` on `EXCLUDES` / `MUTUALLY_EXCLUSIVE_WITH` edges.

- **Hidden interactions / multi‑hop dependencies**
  - Discover rules connected via `CITES`, `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, etc.
  - Typical pattern: variable‑length path matches (`*1..N`) over a curated set of relationship types.

- **Timeline logic**
  - Use `LOOKBACK_WINDOW` / `LOCKS_IN_FOR_PERIOD` edges plus the Timeline Engine to answer:
    - "If I do X now, how long am I locked in for?"
    - "If I waited N months before doing Y, would I still be eligible?"

- **Cross‑jurisdiction interactions**
  - Follow `COORDINATED_WITH`, `TREATY_LINKED_TO`, and jurisdictional labels to show how a rule behaves across IE / UK / NI / EU / IM and other special jurisdictions.

All of this works **without** any community detection. This behaviour is **canonical** and must continue to function even if community detection is disabled.

---

## 3. Optional Algorithms — Layered on Top

The following algorithms are **optional** enhancements. They must not be required for correctness, and they must be easy to turn off or remove.

### 3.1 Leiden community detection (optional)

**Algorithm:** `leiden_community_detection` from Memgraph MAGE (or equivalent community detection module).

**Mode:**

- Run on **static snapshots** of the graph (e.g. nightly, or after a batch of new documents/cases is ingested).
- Do **not** depend on dynamic/streaming community detection.

**Output:**

- Assign a `community_id` (or `communities: [ ... ]`) property to rules and related nodes.
- Optionally create `(:Community)` nodes with:
  - `id` / `label`
  - `jurisdictions` (e.g. `["IE","UK","EU","IM"]`)
  - `topic_tags` (e.g. `["PRSI","Class S","Jobseeker's Benefit"]`)
  - `summary_node_id` (link to an LLM‑generated community summary)

**Usage patterns (non‑breaking):**

- **Navigation & UX:**
  - "Show me other rules from the same community as this one."
  - "Highlight that this rule lives in the ‘cross‑border PRSI’ community."

- **GraphRAG context selection:**
  - When answering broad questions, fetch:
    - The community summary node, and
    - Top‑K central rules in that community (see §3.2).

- **Bridge detection (candidate hidden interactions):**
  - Rules that connect multiple communities (or appear frequently on shortest paths between communities) are flagged as **potential cross‑domain interaction hotspots**.
  - These are candidates for further LLM or human review, which may result in new explicit edges (`EXCLUDES`, `LIMITED_BY`, etc.).

**Important constraint:**

> Removing or disabling Leiden must not break any existing queries. All mandatory behaviour continues to rely only on explicit edges and path queries.

### 3.2 Centrality within communities (optional)

**Algorithms:**

- PageRank (importance based on references), and/or
- Betweenness centrality (bridge nodes on many shortest paths).

**Scope:**

- Run **within each community** subgraph generated by Leiden.

**Usage:**

- Annotate nodes with `centrality_score` or separate metrics.
- When building LLM context or UI summaries:
  - Prefer top‑K rules by centrality as **anchor rules** in each community.

Again, these metrics are **advisory**. If centrality computations are disabled, the system still functions using:

- Community IDs (if enabled), and
- The underlying explicit edge queries.

### 3.3 Bounded traversals and impact analysis (core, but generic)

Although not a “fancy” algorithm, **bounded multi‑hop traversal** is a core pattern for impact analysis and is expected to remain fundamental:

- Starting from a changed rule (e.g. Finance Act 2026 amended section X):
  - Follow edges like `CITES`, `REQUIRES`, `LIMITED_BY`, `EXCLUDES`, `INTERPRETS`.
  - Use bounded depth (e.g. 2–4 hops) to avoid graph explosion.
  - Optionally intersect with:
    - Specific jurisdictions or rule types,
    - A community ID (if Leiden is enabled).

This pattern is independent of any specific MAGE algorithm and is considered **part of the core query approach**.

---

## 4. Operational & Performance Considerations

1. **Snapshot‑based computation**  
   - Leiden and centrality should be run on a **snapshot** of the graph, not on every write.  
   - This avoids long‑running operations impacting ingestion or interactive queries.

2. **Bounded GraphRAG queries**  
   - Any GraphRAG‑style retrieval must be **bounded** in depth and result size.  
   - The LLM should see a compact, ranked slice of the graph, not entire communities.

3. **Toggleability**  
   - Community detection and centrality must be **easy to toggle** via configuration:  
     e.g. `GRAPH_ALGO_LEIDEN_ENABLED=true/false`.  
   - Disabling them should:
     - Stop scheduled jobs,
     - Avoid writing/using `community_id` or `centrality_score`,
     - Leave all existing edge‑based logic untouched.

4. **No Enterprise‑only dependencies**  
   - All required algorithms must work on Memgraph Community + MAGE.  
   - Memgraph Enterprise features (HA, dynamic algorithms, RBAC) are optional and can be added later without changing this spec.

---

## 5. Invariants and Non‑Regression Guarantees

To protect the existing powerful behaviour, the following invariants must hold:

1. **Edge‑based semantics remain canonical**  
   - Queries that answer:
     - Mutual exclusions,
     - Eligibility dependencies,
     - Timeline constraints,
     - Cross‑jurisdiction impacts,
   - Must continue to operate solely on explicit edges, regardless of whether Leiden or centrality are enabled.

2. **Community detection is advisory only (v0.1)**  
   - Leiden and related metadata may influence **ranking, grouping, and UI hints**, but may not be used as the sole basis for determining legality, eligibility, or exclusions.

3. **Safe removal**  
   - It must be possible to:
     - Disable Leiden and centrality,
     - Delete any `community_id` / `centrality_score` properties,
     - And still have the system behave correctly from a regulatory logic perspective.

---

## 6. Future Extensions (Non‑binding)

The following are future possibilities and are **explicitly non‑binding** for v0.1:

- **Node similarity / embeddings (e.g. node2vec)**  
  To find structurally or semantically similar rules across jurisdictions (e.g. IE vs UK vs IM vs EU) based on their neighbourhoods.

- **Enterprise‑grade dynamic algorithms**  
  If this project evolves into a dedicated “Regulatory Graph as a Service” platform, Memgraph Enterprise features for dynamic community detection and centrality may be evaluated.

These can be captured in future specs (e.g. `algorithms_v_0_2.md`) once needed.

---

**Status:** Draft / v0.1

**Guarantee:** Enabling or disabling any algorithm described here must **not break** the current explicit edge + path‑query behaviour of the Regulatory Intelligence graph.

