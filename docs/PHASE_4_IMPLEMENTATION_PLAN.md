# Phase 4 Implementation Plan - Domain Content & Seeding

## Executive Summary

**Objective:** Populate the Memgraph knowledge graph with real regulatory data for Ireland, UK, Northern Ireland, Isle of Man, EU, and Common Travel Area (CTA), and create specialized domain agents.

**Status:** Phase 3 Complete ✅ → Ready to start Phase 4

**Estimated Duration:** 3-4 weeks (with real data research)

**Dependencies:**
- ✅ Phase 3 complete (ComplianceEngine routing, graph queries working)
- ✅ GraphWriteService operational
- ✅ Timeline Engine v0.2 ready
- ⚠️ Real regulatory data sources needed

---

## Table of Contents

1. [Goals & Non-Goals](#goals--non-goals)
2. [Current State Assessment](#current-state-assessment)
3. [Implementation Phases](#implementation-phases)
4. [Task Breakdown](#task-breakdown)
5. [Data Sources](#data-sources)
6. [Success Criteria](#success-criteria)
7. [Risks & Mitigation](#risks--mitigation)
8. [Timeline](#timeline)

---

## Goals & Non-Goals

### Goals ✅

1. **Graph Schema v0.4** - Implement complete node and relationship types
2. **Seed IE Baseline** - Populate Irish regulatory graph with ~50-100 representative rules
3. **Seed UK/NI/IM** - Add UK-specific rules and NI special jurisdiction handling
4. **Seed EU/CTA** - Add EU coordination and CTA treaty rules
5. **Timeline Constraints** - Populate real lookback windows, lock-ins, deadlines
6. **Specialized Agents** - Create 3-5 domain-specific agents for common scenarios
7. **Mutual Exclusions** - Map conflicts between benefits/reliefs
8. **Test Data Quality** - Verify graph queries return relevant, accurate context

### Non-Goals ❌

1. **Complete Regulatory Database** - Not attempting 100% coverage (that's Phase 5+)
2. **Legal Validation** - Seeded data for demonstration, not legal advice
3. **Historical Versions** - Only current/recent rules (not full history)
4. **UI Changes** - Focus on backend graph, not frontend updates
5. **Production Data** - Development/demo quality, not production-ready

---

## Current State Assessment

### What We Have ✅

**Infrastructure:**
- GraphWriteService with ingress guards
- Timeline Engine v0.2
- Graph schema v0.3 (basic nodes)
- Seed scripts framework
- BoltGraphClient for queries

**Seeded Data:**
- Basic jurisdictions (IE, UK, EU)
- Sample benefits (small benefit exemption)
- Profile tags (self-employed, single-director, etc.)
- Basic relationships

**Agents:**
- GlobalRegulatoryComplianceAgent (router)
- SingleDirector_IE_SocialSafetyNet_Agent (basic implementation)

### What We Need 🚧

**Data:**
- Real IE tax reliefs (SCE, EII, RnD credits, etc.)
- Real IE welfare benefits (JSB, PUP, Maternity, etc.)
- Real pension rules (State Pension, PRSA, etc.)
- UK-specific rules (different from IE)
- NI handling (part of UK but with special rules)
- EU coordination regulations
- CTA treaty provisions

**Agents:**
- IE_SelfEmployed_TaxAgent
- IE_CGT_Investor_Agent
- SingleDirector_IE_Tax_Agent (split from SocialSafetyNet)
- EU_CrossBorder_Coordinator_Agent

**Relationships:**
- MUTUALLY_EXCLUSIVE_WITH (benefits that can't be combined)
- REQUIRES (dependencies between benefits)
- LIMITED_BY (income thresholds, time limits)
- Timeline constraints for all benefits

---

## Implementation Phases

### Phase 4A: Schema Enhancement (Week 1)

**Objective:** Extend graph schema to support all v0.4 node and edge types

**Tasks:**
1. Add new node types:
   - `:CaseLaw` - For precedent references
   - `:Guidance` - For Revenue/HMRC guidance
   - `:ChangeEvent` - For tracking legislative changes
   - `:Agreement` - For CTA treaty (already partially done)
   - `:Regime` - For grouping related rules (already partially done)

2. Add new edge types:
   - `COORDINATED_WITH` - For EU/CTA coordination
   - `SUPERSEDES` - For rule changes over time
   - `INTERPRETS` - For guidance → statute links
   - `FILING_DEADLINE` - For timeline constraints

3. Update GraphWriteService DTOs:
   - `UpsertCaseLawDto`
   - `UpsertGuidanceDto`
   - `UpsertChangeEventDto`

**Deliverables:**
- Updated `graphWriteService.ts` with new DTOs
- Updated schema documentation
- Test script for new node/edge types

**Acceptance Criteria:**
- All new node types can be created via GraphWriteService
- All new edge types can be created
- ESLint rules still enforce write discipline
- Build passes without errors

---

### Phase 4B: IE Tax Data Seeding (Week 2)

**Objective:** Seed comprehensive Irish tax data

**Data to Seed:**

#### Tax Reliefs
1. **Start Your Own Business Relief (SYOB)**
   - Lookback: 2 years
   - Lock-in: 4 years
   - Income threshold: €60,000
   - Mutually exclusive with: Certain other SCE claims

2. **Employment Investment Incentive (EII)**
   - Lock-in: 4 years
   - Mutually exclusive with: Seed Capital Scheme
   - Requires: Form EII1, Revenue approval

3. **R&D Tax Credit**
   - Calculation: 25% of qualifying expenditure
   - Requires: Revenue pre-approval for first claim
   - Separate rules for small vs large companies

4. **Capital Gains Tax (CGT) Reliefs**
   - Retirement Relief
   - Entrepreneur Relief
   - Principal Private Residence Relief
   - Revised Entrepreneur Relief

5. **Home Renovation Incentive (HRI)**
   - Lookback: Work completed in qualifying period
   - Limited by: €30,000 max claim
   - Requires: VAT-registered contractor

#### Corporate Tax Rules
1. **Corporation Tax Rate** - 12.5% for trading income
2. **Close Company Surcharge** - 20% on undistributed income
3. **Research & Development** - Enhanced deductions

**Implementation:**
- Create `scripts/seed-ie-tax.ts`
- Use GraphWriteService for all writes
- Add timeline constraints for each benefit
- Map mutual exclusions
- Link to relevant Revenue.ie guidance

**Acceptance Criteria:**
- ~30-40 IE tax nodes seeded
- All have timeline constraints
- Mutual exclusions mapped
- Test query returns relevant results for "self-employed tax reliefs"

---

### Phase 4C: IE Welfare & Pensions (Week 2)

**Objective:** Seed Irish social welfare and pension data

**Data to Seed:**

#### Welfare Benefits
1. **Jobseeker's Benefit (JSB)**
   - Requires: 104 PRSI contributions
   - Duration: 234 days (9 months)
   - Means tested: No
   - PRSI class requirement: A, E, H

2. **Jobseeker's Allowance (JA)**
   - Means tested: Yes
   - Duration: Unlimited (subject to reviews)
   - Requires: Habitual residence condition

3. **Maternity Benefit**
   - Requires: 39 weeks PRSI in 12 months before
   - Duration: 26 weeks
   - PRSI classes: A, E, S

4. **Illness Benefit**
   - Requires: 104 PRSI contributions
   - Duration: 624 days (2 years)

5. **Carer's Allowance**
   - Means tested: Yes
   - Requires: Full-time care of person with disability
   - Income threshold: €350/week (single)

#### Pensions
1. **State Pension (Contributory)**
   - Requires: Average 48 contributions/year
   - Reduced rate: 10-47 contributions/year
   - Age: 66 (increasing to 67, 68)

2. **State Pension (Non-Contributory)**
   - Means tested: Yes
   - Age: 66
   - No PRSI requirement

3. **PRSA Rules**
   - Tax relief limits
   - Age-based contribution limits
   - Vesting at 60

**Implementation:**
- Create `scripts/seed-ie-welfare.ts`
- Create `scripts/seed-ie-pensions.ts`
- Link PRSI class requirements
- Map age-based rules
- Add income thresholds

**Acceptance Criteria:**
- ~25-30 welfare/pension nodes
- PRSI requirements linked
- Age-based rules configured
- Timeline constraints for durations
- Test query for "single-director pension options" returns results

---

### Phase 4D: UK, NI, IM Data (Week 3)

**Objective:** Seed UK-specific rules and handle special jurisdictions

**Special Jurisdictions Handling:**

#### Northern Ireland (NI)
```
Modeled as: :Region node with special properties
Relationships:
  - PART_OF → UK
  - COORDINATED_WITH → IE (CTA)
  - HYBRID_RULES → Some IE rules apply, some UK rules apply
```

**Data to Seed:**

#### UK Tax Reliefs
1. **Seed Enterprise Investment Scheme (SEIS)**
   - Different from IE EII
   - Tax relief: 50% (vs IE 40%)

2. **Enterprise Investment Scheme (EIS)**
   - Lock-in: 3 years (vs IE 4 years)

3. **Entrepreneur's Relief**
   - Different threshold than IE
   - 10% lifetime limit

#### UK Welfare
1. **Universal Credit**
   - Different from IE Jobseeker's
   - Monthly assessment

2. **State Pension (UK)**
   - Different age and contribution rules
   - New State Pension vs Old State Pension

#### NI Specific
1. **Cross-border workers**
   - Can claim some IE benefits
   - Subject to CTA rules

2. **Special EU coordination**
   - Brexit implications
   - NI Protocol effects

**Implementation:**
- Create `scripts/seed-uk.ts`
- Create `scripts/seed-ni-special.ts`
- Model NI as Region, not full Jurisdiction
- Add `HYBRID_RULES` edge type
- Link to CTA coordination

**Acceptance Criteria:**
- ~20-25 UK nodes
- NI modeled correctly as Region
- Cross-border rules linked
- Test query for "NI cross-border worker benefits" returns UK + IE options

---

### Phase 4E: EU & CTA Coordination (Week 3)

**Objective:** Seed EU coordination and CTA treaty rules

**Data to Seed:**

#### EU Coordination (Regulation 883/2004)
1. **Aggregation of Periods**
   - Combine IE + other EU PRSI for benefits
   - Node type: `:Regime`
   - Links to: Multiple jurisdictions

2. **Posting of Workers**
   - A1 certificate rules
   - Which country's social security applies

3. **Family Benefits Coordination**
   - Priority rules when both parents work in different EU countries

#### Common Travel Area (CTA)
1. **CTA Treaty Node**
   - Type: `:Agreement`
   - Parties: IE, UK
   - Scope: Social welfare, healthcare, residence

2. **Reciprocal Benefits**
   - IE Jobseeker's Benefit can count UK contributions
   - UK benefits can count IE contributions

3. **Cross-border Healthcare**
   - EHIC/GHIC rules

**Implementation:**
- Create `scripts/seed-eu-coordination.ts`
- Create `scripts/seed-cta.ts`
- Use `:Agreement` and `:Regime` nodes
- Add `COORDINATED_WITH` edges
- Link to relevant EU regulations

**Acceptance Criteria:**
- ~15-20 coordination nodes
- CTA treaty modeled
- EU aggregation rules linked
- Test query for "EU worker benefits" returns coordination context

---

### Phase 4F: Specialized Agents (Week 4)

**Objective:** Create 3-5 domain-specific agents for common scenarios

**Agents to Create:**

#### 1. IE_SelfEmployed_TaxAgent
```typescript
canHandle(input) {
  // Check for tax-related keywords
  // Check profile is self-employed
  // Check jurisdiction includes IE
}

handle(input, ctx) {
  // Query graph for:
  //   - Tax reliefs applicable to self-employed
  //   - R&D credits if tech business
  //   - Income thresholds
  //   - Filing deadlines

  // Return specialized tax guidance
}
```

**Keywords:** tax, relief, R&D, deduction, VAT, corporation tax, income tax

#### 2. IE_CGT_Investor_Agent
```typescript
canHandle(input) {
  // Check for CGT-related keywords
  // Check for investment/property/asset keywords
}

handle(input, ctx) {
  // Query graph for:
  //   - CGT reliefs (Retirement, Entrepreneur, PPR)
  //   - Exemptions (€1,270 annual)
  //   - Rates (33%)
  //   - Timeline constraints

  // Return CGT-specific guidance
}
```

**Keywords:** capital gains, CGT, property, shares, investment, disposal

#### 3. SingleDirector_IE_Tax_Agent
```typescript
canHandle(input) {
  // Check profile is single-director
  // Check for company tax keywords
}

handle(input, ctx) {
  // Query graph for:
  //   - Corporation tax rules
  //   - Close company surcharge
  //   - Director's remuneration strategies
  //   - Dividend vs salary optimization

  // Return single-director tax guidance
}
```

**Keywords:** corporation tax, close company, director, dividend, salary

#### 4. EU_CrossBorder_Coordinator_Agent
```typescript
canHandle(input) {
  // Check for cross-border keywords
  // Check multiple jurisdictions in profile
}

handle(input, ctx) {
  // Query graph for:
  //   - EU coordination regulations
  //   - CTA rules
  //   - Aggregation provisions
  //   - Posting rules

  // Return cross-border coordination guidance
}
```

**Keywords:** EU, cross-border, posted worker, A1 certificate, multiple countries

#### 5. IE_Pension_Agent (Optional)
```typescript
canHandle(input) {
  // Check for pension keywords
  // Check age > 55 (approaching retirement)
}

handle(input, ctx) {
  // Query graph for:
  //   - State pension entitlement
  //   - PRSA rules
  //   - ARF/AMRF rules
  //   - Tax relief on contributions

  // Return pension guidance
}
```

**Keywords:** pension, retirement, PRSA, ARF, state pension, contributory

**Implementation:**
- Create agent files in `packages/reg-intel-core/src/agents/`
- Follow GlobalRegulatoryComplianceAgent pattern
- Add to `DOMAIN_AGENTS` registry
- Create tests for each agent's `canHandle` logic

**Acceptance Criteria:**
- Each agent can correctly identify its domain
- Each agent queries relevant graph subsets
- Agent delegation works from GlobalRegulatoryComplianceAgent
- Test queries route to correct specialized agent

---

### Phase 4G: Mutual Exclusions & Constraints (Week 4)

**Objective:** Map conflicts and dependencies between benefits

**Mutual Exclusions to Map:**

1. **Tax Reliefs:**
   - EII ⟷ Seed Capital Scheme (can't claim both)
   - SYOB ⟷ Regular SCE (different variants)
   - Entrepreneur Relief ⟷ Retirement Relief (timing conflicts)

2. **Welfare Benefits:**
   - JSB ⟷ Illness Benefit (can't claim simultaneously)
   - Carer's Allowance ⟷ JSB (generally exclusive)

3. **Income Thresholds:**
   - Many benefits LIMITED_BY income
   - Tax credits LIMITED_BY income bands

**Timeline Constraints to Add:**

For each benefit/relief:
- **Lookback windows:** "Must have been unemployed for 2 years"
- **Lock-in periods:** "Can't dispose of shares for 4 years"
- **Filing deadlines:** "Claim within 4 years of tax year end"
- **Duration limits:** "Benefit payable for max 9 months"

**Implementation:**
- Create `scripts/seed-mutual-exclusions.ts`
- Create `scripts/seed-timeline-constraints.ts`
- Use `MUTUALLY_EXCLUSIVE_WITH` edges
- Use `LIMITED_BY` edges for thresholds
- Create `:TimelineConstraint` nodes

**Acceptance Criteria:**
- ~30-40 mutual exclusion edges
- ~50+ timeline constraint nodes
- Timeline Engine can evaluate constraints
- Test query identifies conflicts

---

## Task Breakdown

### Week 1: Schema Enhancement
- [ ] Add new node types to GraphWriteService
- [ ] Add new edge types to GraphWriteService
- [ ] Update DTOs and type definitions
- [ ] Create test script for new types
- [ ] Update schema documentation
- [ ] Verify build passes

**Effort:** 8-12 hours

---

### Week 2: IE Core Data
- [ ] Research IE tax reliefs (Revenue.ie)
- [ ] Create seed-ie-tax.ts script
- [ ] Seed 30-40 tax nodes
- [ ] Research IE welfare benefits (gov.ie)
- [ ] Create seed-ie-welfare.ts script
- [ ] Seed 15-20 welfare nodes
- [ ] Research IE pension rules
- [ ] Create seed-ie-pensions.ts script
- [ ] Seed 10-15 pension nodes
- [ ] Add timeline constraints for all
- [ ] Test queries for each domain

**Effort:** 20-25 hours

---

### Week 3: UK/EU/CTA Data
- [ ] Research UK tax/welfare differences
- [ ] Create seed-uk.ts script
- [ ] Seed 20-25 UK nodes
- [ ] Design NI special jurisdiction model
- [ ] Create seed-ni-special.ts script
- [ ] Seed 10-15 NI hybrid rules
- [ ] Research EU coordination regulations
- [ ] Create seed-eu-coordination.ts script
- [ ] Seed 10-15 EU coordination nodes
- [ ] Research CTA treaty provisions
- [ ] Create seed-cta.ts script
- [ ] Seed CTA agreement and reciprocal rules
- [ ] Test cross-border queries

**Effort:** 20-25 hours

---

### Week 4: Agents & Constraints
- [ ] Create IE_SelfEmployed_TaxAgent
- [ ] Create IE_CGT_Investor_Agent
- [ ] Create SingleDirector_IE_Tax_Agent
- [ ] Create EU_CrossBorder_Coordinator_Agent
- [ ] (Optional) Create IE_Pension_Agent
- [ ] Test agent routing
- [ ] Create seed-mutual-exclusions.ts
- [ ] Map 30-40 mutual exclusions
- [ ] Create seed-timeline-constraints.ts
- [ ] Add 50+ timeline constraints
- [ ] Test Timeline Engine evaluation
- [ ] End-to-end testing

**Effort:** 20-25 hours

---

## Data Sources

### Primary Sources (Authoritative)

**Ireland:**
- Revenue.ie - Tax reliefs, credits, allowances
- gov.ie - Welfare benefits, eligibility
- Citizens Information - Plain-language guides
- Finance Acts - Legislative changes

**UK:**
- GOV.UK - Tax and benefits
- HMRC - Tax guidance
- DWP - Welfare benefits

**EU:**
- EUR-Lex - EU regulations
- EU Social Security Coordination - Official guides

**CTA:**
- Department of Foreign Affairs - CTA information
- UK Home Office - CTA guidance

### Secondary Sources (For Context)

- Tax advisors' guides (PwC, Deloitte, EY publications)
- Citizens Advice (UK)
- Money Advice & Budgeting Service (MABS)

### Data Quality Notes

- Use official sources for rules and thresholds
- Cross-reference multiple sources
- Flag uncertain areas in node properties (`confidence: 'low'`)
- Add `source_url` property to all nodes
- Mark demo data with `demo: true` property

---

## Success Criteria

### Quantitative Metrics

- **Nodes:** 150-200 total nodes (from ~20 current)
- **Edges:** 300-400 total edges
- **Jurisdictions:** 5+ covered (IE, UK, NI, IM, EU)
- **Agents:** 4-5 specialized agents
- **Timeline Constraints:** 50+ constraint nodes
- **Mutual Exclusions:** 30-40 conflict edges

### Qualitative Metrics

- **Agent Routing:** Queries route to correct specialized agent 90%+ of the time
- **Graph Context:** Graph queries return 5-15 relevant nodes for typical questions
- **Accuracy:** Seeded data matches official sources
- **Completeness:** Major benefits/reliefs covered for each jurisdiction
- **Documentation:** All nodes have source_url property

### Test Queries (Must Return Relevant Results)

1. "What tax reliefs are available for self-employed in Ireland?"
   - Should route to IE_SelfEmployed_TaxAgent
   - Should return SYOB, R&D credit, etc.

2. "Can I claim both EII and Seed Capital?"
   - Should identify mutual exclusion
   - Should explain conflict

3. "I'm a NI resident working in Dublin, what benefits can I claim?"
   - Should route to EU_CrossBorder_Coordinator_Agent
   - Should return CTA reciprocal rules

4. "What's the lookback period for Start Your Own Business relief?"
   - Should return 2 year lookback
   - Should explain Timeline constraint

5. "Single director company tax optimization strategies"
   - Should route to SingleDirector_IE_Tax_Agent
   - Should return corporation tax, close company rules

---

## Risks & Mitigation

### Risk 1: Data Research Takes Longer Than Expected
**Probability:** High
**Impact:** Medium

**Mitigation:**
- Start with IE core data (most familiar)
- Use demo data flagged as `demo: true` for initial testing
- Prioritize breadth over depth (cover more topics lightly first)
- Can expand data in Phase 5

### Risk 2: Complex Rules Hard to Model
**Probability:** Medium
**Impact:** Medium

**Mitigation:**
- Simplify complex rules for v0.4 (note in properties)
- Use `notes` property to explain simplifications
- Flag complex areas for Phase 5 enhancement
- Focus on common scenarios first

### Risk 3: Agent Routing Ambiguous
**Probability:** Medium
**Impact:** Low

**Mitigation:**
- Clear keyword lists for each agent
- Fallback to GlobalRegulatoryComplianceAgent works
- Can tune `canHandle` logic iteratively
- Add logging to track routing decisions

### Risk 4: Timeline Engine Not Ready
**Probability:** Low
**Impact:** Medium

**Mitigation:**
- Timeline Engine v0.2 already exists
- Test early with simple constraints
- Can add constraints incrementally
- Worst case: skip complex time logic for v0.4

### Risk 5: Scope Creep
**Probability:** High
**Impact:** High

**Mitigation:**
- **Stick to plan:** 150-200 nodes max for Phase 4
- Mark additional topics for Phase 5
- Focus on demonstration quality, not production
- Time-box each sub-phase

---

## Timeline

### Week 1 (Days 1-5)
- **Mon-Tue:** Schema enhancement
- **Wed-Thu:** Testing and documentation
- **Fri:** Review and adjustments

### Week 2 (Days 6-12)
- **Mon-Tue:** IE tax data research and seeding
- **Wed-Thu:** IE welfare data research and seeding
- **Fri:** IE pension data and testing

### Week 3 (Days 13-19)
- **Mon-Tue:** UK data research and seeding
- **Wed-Thu:** EU/CTA coordination
- **Fri:** Cross-border testing

### Week 4 (Days 20-25)
- **Mon-Tue:** Create specialized agents
- **Wed-Thu:** Mutual exclusions and timeline constraints
- **Fri:** End-to-end testing and documentation

### Buffer (Days 26-28)
- Integration testing
- Bug fixes
- Documentation updates
- Phase 4 completion review

---

## Deliverables Checklist

### Code
- [ ] `graphWriteService.ts` - New DTOs for Phase 4 nodes
- [ ] `seed-ie-tax.ts` - IE tax reliefs
- [ ] `seed-ie-welfare.ts` - IE welfare benefits
- [ ] `seed-ie-pensions.ts` - IE pension rules
- [ ] `seed-uk.ts` - UK-specific rules
- [ ] `seed-ni-special.ts` - NI hybrid jurisdiction
- [ ] `seed-eu-coordination.ts` - EU regulations
- [ ] `seed-cta.ts` - CTA treaty
- [ ] `seed-mutual-exclusions.ts` - Conflict mapping
- [ ] `seed-timeline-constraints.ts` - Time-based rules
- [ ] 4-5 specialized agent files

### Documentation
- [ ] Updated schema documentation
- [ ] Data source references
- [ ] Agent routing guide
- [ ] Phase 4 completion report

### Testing
- [ ] Schema enhancement tests
- [ ] Seed script tests
- [ ] Agent routing tests
- [ ] Timeline Engine tests
- [ ] End-to-end query tests

---

## Phase 4 → Phase 5 Transition

**What Phase 4 Enables:**
- Real regulatory context for queries
- Specialized agent routing
- Timeline-aware reasoning
- Cross-border coordination

**What's Deferred to Phase 5:**
- On-demand enrichment (MCP legal search)
- Change tracking (Finance Acts, eBriefs)
- Complete coverage (all benefits/reliefs)
- Production-quality validation

**Success Definition:**
Phase 4 is complete when:
1. 150-200 nodes seeded across IE/UK/EU
2. 4-5 specialized agents operational
3. Timeline constraints working
4. Test queries return relevant context
5. Documentation complete

---

## Review Questions

Before approving this plan, please consider:

1. **Scope:** Is 150-200 nodes the right target? Too ambitious? Too modest?
2. **Jurisdictions:** Should we prioritize IE deeply or spread across IE/UK/EU?
3. **Agents:** Are these 4-5 agents the right ones? Missing any critical domains?
4. **Timeline:** Is 3-4 weeks realistic? Need more/less time?
5. **Data Sources:** Any specific sources you want to emphasize or avoid?
6. **Quality:** Demo quality vs production quality - is the tradeoff clear?

**Next Steps After Review:**
- Adjust plan based on feedback
- Create initial branch for Phase 4
- Start with Week 1 schema enhancement
- Iterative progress updates

---

## Appendix A: Example Node Structure

### Tax Relief Node (SYOB)
```typescript
{
  id: 'RELIEF_SYOB_IE',
  label: 'Start Your Own Business Relief',
  type: 'Relief',
  properties: {
    name: 'Start Your Own Business Relief (SYOB)',
    category: 'Income Tax Relief',
    summary: 'Tax relief for unemployed persons starting a business',
    description: 'Relief from Income Tax for 2 years...',
    max_relief: '€40,000 per year',
    jurisdictionId: 'IE',
    source_url: 'https://www.revenue.ie/en/jobs-and-pensions/...',
    demo: false,
    confidence: 'high',
  },
  edges: {
    IN_JURISDICTION: ['IE'],
    APPLIES_TO: ['PROFILE_SELF_EMPLOYED_IE'],
    REQUIRES: ['TIMELINE_LOOKBACK_2Y_UNEMPLOYMENT'],
    LIMITED_BY: ['TIMELINE_LOCKIN_4Y_BUSINESS'],
    MUTUALLY_EXCLUSIVE_WITH: ['RELIEF_SCE_REGULAR'],
  }
}
```

### Timeline Constraint Node
```typescript
{
  id: 'TIMELINE_LOOKBACK_2Y_UNEMPLOYMENT',
  label: '2 Year Unemployment Lookback',
  type: 'TimelineConstraint',
  properties: {
    constraint_type: 'lookback_window',
    duration_years: 2,
    condition: 'unemployed',
    description: 'Must have been unemployed for 2 of the previous 5 years',
  }
}
```

---

## Appendix B: Agent Routing Decision Tree

```
User Query: "What tax reliefs are available?"
    ↓
GlobalRegulatoryComplianceAgent.handleStream()
    ↓
Try specialized agents:
    ↓
IE_SelfEmployed_TaxAgent.canHandle()?
    ├─ Profile: self-employed? ✅
    ├─ Jurisdiction: IE? ✅
    ├─ Keywords: "tax reliefs"? ✅
    └─ MATCH → Route to IE_SelfEmployed_TaxAgent
        ↓
        Query graph:
        - MATCH (r:Relief)-[:IN_JURISDICTION]->(:Jurisdiction {id: 'IE'})
        - WHERE (r)-[:APPLIES_TO]->(:ProfileTag {id: 'PROFILE_SELF_EMPLOYED_IE'})
        - RETURN r, relationships
        ↓
        Return: SYOB, R&D Credit, Home Office Relief, etc.
```
