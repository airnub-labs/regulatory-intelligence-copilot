# Universal Function Approximators & Regulatory Intelligence Copilot

> **Purpose of this note**  
> Capture a future-facing idea: how **universal function approximators (UFAs)** – e.g. neural networks and GNNs – could complement the **Memgraph rules graph, timeline engine, and (future) causal KG** in the Regulatory Intelligence Copilot. This is *not* part of the v0.x architecture; it’s a parked concept to revisit once the core graph + rules pipeline is mature.

---

## 1. What is a Universal Function Approximator (UFA)?

In ML theory, a **universal function approximator** is a model class that can approximate any “reasonable” function given enough capacity and data.

Classical results:

- A standard feed‑forward neural network (multilayer perceptron) with at least one hidden layer and a non‑linear activation (ReLU, sigmoid, tanh, etc.) can approximate any continuous function on a compact domain to arbitrary precision (the **universal approximation theorem**).
- More recent results generalise this to **graph neural networks (GNNs)** and related architectures: under mild conditions, they can approximate a wide class of functions defined *over graphs* and node/edge attributes.

Practically: if there is some mapping

> f(inputs) → output

that we don’t know in closed form (e.g. “probability this case becomes a long, painful appeal”), a UFA can, in principle, **learn** that mapping from data.

Important constraints:

- “Universal” ≠ “automatic correctness”. We still need
  - good data,
  - sensible features,
  - and a structure that reflects reality (especially for causal reasoning).
- UFAs are **numeric engines**, not knowledge graphs. They don’t replace the rules graph or causal structure; they sit *inside* it to model complex relationships.

---

## 2. Where Reg Copilot is today (v0.x)

Right now, the **Regulatory Intelligence Copilot** is centred on:

- A **Memgraph rules & concepts graph**:
  - Nodes for statutes, benefits, PRSI classes, conditions, timelines, change events, concepts, etc.
  - Edges for `APPLIES_TO`, `CONDITION_FOR`, `MUTUALLY_EXCLUSIVE_WITH`, `CHANGE_IMPACT`, cross‑border links, etc.
- A **timeline engine**:
  - Encodes lookbacks, lock‑ins, effective dates, clawbacks, waiting periods.
  - Answers “what applies when?” and “what happens if the user does X on date D?”.
- A chat‑first UX and agent layer that:
  - Traverses the rules graph.
  - Builds and explains regulatory scenarios for a single user/company.

All of this is **symbolic / graph‑driven**. The behaviour is largely deterministic and explainable in terms of statutes/rules.

There is **no requirement** for UFAs in v0.x. The initial priority remains:

- Clean, correct rules encoding.
- Strong temporal reasoning.
- Safe, PII‑free graph boundaries.

This document is about **possible v1.x+ enhancements** once the base is solid.

---

## 3. How UFAs could complement Reg Copilot (future directions)

### 3.1. Learned scoring on top of the rules graph

The rules graph can already answer:

- “Given this profile and timeline, what are you eligible for?”
- “How do tax, welfare, PRSI, pensions interact in this scenario?”

But there are additional questions that are **not purely legal** and are closer to pattern recognition, risk estimation, or optimisation, e.g.:

- How *difficult* is this path likely to be for someone like you?
- How likely is this case to end up in appeal or require manual intervention?
- Among several legally valid options, which ones tend to lead to **better real‑world outcomes** for users with similar profiles?

These can be framed as functions such as:

- `friction_score = f(user_features, graph_path_features, history_features)`
- `appeal_risk = f(case_features, rule_subgraph, prior_cases)`
- `expected_outcome_quality = f(strategy_over_time, cohort_features)`

These functions are:

- Non‑linear,
- Data‑dependent,
- Not easily hand‑coded.

A **UFA (e.g. MLP, GNN)** is a good candidate for learning them:

1. The rules + timeline engine produces **structured features** for a candidate path:
   - which rules apply,
   - how many agencies are involved,
   - number of steps, deadlines, interactions,
   - historical statistics where available (e.g. appeal rates for similar paths).
2. A neural model is trained on historical data (or synthetic data in the absence of full real datasets) to approximate:
   - friction/risk/quality as a function of those features.
3. At query time, the scenario engine:
   - enumerates a small set of candidate paths (symbolically correct),
   - calls the UFA to **score** each path,
   - presents ranked options with both:
     - a legal explanation (from the graph), and
     - a data‑driven “how this tends to go in the real world” score.

**Key point:**

- The **graph remains the ground truth** for legality and explanation.
- The UFA is an **advisory module** for ranking/prioritisation based on empirical patterns.

### 3.2. UFAs inside a future causal knowledge graph

If/when Reg Copilot grows a **causal layer** (causal KG) alongside the rules graph, UFAs become even more relevant.

In a causal model, each variable Y has a structural equation:

> Y = f_Y(parents_of_Y, noise)

A natural choice is to implement `f_Y` as a **neural network**:

- Inputs: values of parent variables (e.g. policy parameters, economic conditions, user behaviour variables).
- Output: distribution parameters or point predictions for Y (e.g. benefit take‑up, average income, appeal rate).

This is exactly how **Neural Causal Models / Causal Generative Neural Networks (CGNNs)** are typically structured:

- The **graph** encodes who‑causes‑whom.
- Each node’s **mechanism** is a UFA.

Applied to Reg Copilot, a causal KG layer might include variables such as:

- # of claimants of a benefit,
- poverty rate in a cohort,
- labour market participation,
- scheme cost,
- average processing time, etc.

UFAs could then be used to approximate:

- How those variables respond, in practice, to
  - changes in rule parameters (thresholds, rates, durations),
  - changes in service design (digital vs in‑person),
  - macro conditions.

The **scenario engine** would then be able to:

- Simulate *policy interventions*:
  - “If the income threshold for benefit X is increased by €Y, what happens to:
    - take‑up,
    - cost,
    - poverty metrics in cohort C,
    - appeal volume?”
- Combine legal constraints (from the rules graph) with **empirical response curves** (from the causal KG + UFAs).

Again:

- The **graph structure** (causal KG) determines which variables are connected.
- UFAs provide **flexible functional forms** for the mechanisms between variables.

### 3.3. Graph‑level pattern detection with GNNs

Once the Memgraph rules graph spans multiple domains (tax, welfare, pensions, car‑import, etc.), there may be value in learning at the **graph level**:

- Which subgraph shapes tend to be confusing or brittle (lots of appeals, frequent changes).
- Where similar “problematic motifs” appear in multiple jurisdictions/domains.
- How to suggest **refactors** (e.g. simplify paths, consolidate conditions) based on patterns seen elsewhere.

Graph Neural Networks (GNNs) can serve as UFAs over graphs:

- Input: a subgraph around a rule or benefit (nodes, edges, attributes).
- Output: a score or classification (e.g. “high confusion risk”, “likely to generate backlogs”).

This would be a **tooling / analysis** feature for the maintainers, not a user‑facing feature. It could eventually support:

- Automated linting of new graph insertions.
- Identification of “knots” in the rules where users repeatedly struggle.

---

## 4. Design principles if/when we adopt UFAs

Given the regulatory context, any use of UFAs must respect some design constraints:

1. **Graph first, ML second**
   - The Memgraph rules graph and timeline engine remain the **source of truth** for:
     - applicability,
     - eligibility,
     - legal interactions,
     - time windows.
   - UFAs are **advisory/optimisation modules** layered on top.

2. **Explainable vs opaque
**
   - Legal reasoning and scenario outcomes must be explainable in terms of rules and timelines.
   - UFA outputs (scores, predictions) should be clearly labelled as
     - data‑driven estimates,
     - with uncertainty and provenance where possible.

3. **Clear trust boundaries**
   - The system must never silently override
     - statutory logic,
     - known constraints,
     - or explicit graph relationships
   based on a neural prediction.

4. **Data governance & privacy**
   - Any training data used for UFAs (especially user‑level outcomes) must respect the existing privacy architecture and PII boundaries.
   - Ideally, UFAs are trained on **aggregated, de‑identified** cohorts, and only cohort‑level signals feed back into the graph.

5. **Incremental adoption**
   - Start with low‑risk use cases:
     - friction scoring,
     - complexity heuristics,
     - internal graph‑health tools.
   - Only later consider policy‑impact simulations once data, evaluation, and governance are robust.

---

## 5. Summary / Future TODO

- **UFAs (MLPs, GNNs, neural causal mechanisms)** are powerful numeric engines that can learn complex mappings from data.
- They are **not a replacement** for the Memgraph rules graph or a future causal KG; they are **plug‑in components** inside that structure.
- Plausible future applications in Reg Copilot:
  - Learned friction / risk / outcome scoring on top of graph‑generated paths.
  - Neural structural equations inside a causal KG for policy impact simulation.
  - GNN‑based graph analysis tools for spotting confusing / brittle rule structures.
- For now, this remains **out of scope for v0.x**; the priority is
  - correctness and completeness of the rules graph,
  - strong temporal reasoning,
  - robust ingress/egress and privacy.

**Action for future Alan / future maintainers:**

- Revisit this document when:
  - The core rules graph is stable across multiple domains (tax, welfare, pensions, car import).
  - There is access to suitable outcome data (even if only in synthetic / research form).
  - There is a clear need to:
    - rank/prioritise multiple valid paths, or
    - explore systemic impacts of rule changes.

At that point, consider an ADR:

- **ADR: Introduce UFA‑based scoring module** (scope, data, models, evaluation, and safeguards).

This page is intentionally high‑level; detailed design should live in a dedicated ADR and/or `docs/architecture` update once we decide to move forward.

