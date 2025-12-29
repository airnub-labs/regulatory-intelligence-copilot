// Life Events Seed Data
// Represents significant life events that trigger regulatory changes
// Reference: schema_v_0_6.md Section 2.25

// ============================================================================
// FAMILY Life Events
// ============================================================================

// Birth of a child
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_BIRTH_OF_CHILD'})
SET e.label = 'Birth of a child',
    e.category = 'FAMILY',
    e.triggers_timeline = true,
    e.description = 'Birth or adoption of a child triggers various benefit entitlements and timelines',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (b:Benefit) WHERE b.id IN ['IE_MATERNITY_BENEFIT', 'IE_CHILD_BENEFIT']
MERGE (e)-[:TRIGGERS]->(b);

// Marriage or civil partnership
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_MARRIAGE'})
SET e.label = 'Marriage or Civil Partnership',
    e.category = 'FAMILY',
    e.triggers_timeline = false,
    e.description = 'Marriage or civil partnership may affect tax credits and social welfare entitlements',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (r:Relief) WHERE r.id IN ['IE_MARRIED_PERSONS_TAX_CREDIT']
MERGE (e)-[:TRIGGERS]->(r);

// Death of spouse/civil partner
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_BEREAVEMENT'})
SET e.label = 'Death of spouse or civil partner',
    e.category = 'FAMILY',
    e.triggers_timeline = true,
    e.description = 'Bereavement triggers survivor pension entitlements and tax relief periods',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (b:Benefit) WHERE b.id IN ['IE_WIDOWS_PENSION']
MERGE (e)-[:TRIGGERS]->(b);

// ============================================================================
// EMPLOYMENT Life Events
// ============================================================================

// Starting employment
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_START_EMPLOYMENT'})
SET e.label = 'Starting employment',
    e.category = 'EMPLOYMENT',
    e.triggers_timeline = true,
    e.description = 'Commencing employment triggers PRSI contributions and potential benefit build-up',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (o:Obligation) WHERE o.id IN ['IE_PAYROLL_REGISTRATION']
MERGE (e)-[:TRIGGERS]->(o);

// Becoming unemployed
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_UNEMPLOYMENT'})
SET e.label = 'Becoming unemployed',
    e.category = 'EMPLOYMENT',
    e.triggers_timeline = true,
    e.description = 'Job loss triggers Jobseeker\'s Benefit/Allowance entitlements and contribution lookback periods',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (b:Benefit) WHERE b.id IN ['IE_JOBSEEKERS_BENEFIT']
MERGE (e)-[:TRIGGERS]->(b);

// Link to lookback window timeline
WITH e
MATCH (t:Timeline {id: 'IE_JOBSEEKERS_BENEFIT_LOOKBACK'})
MERGE (e)-[:STARTS_TIMELINE]->(t);

// Starting self-employment
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_START_SELF_EMPLOYMENT'})
SET e.label = 'Starting self-employment',
    e.category = 'EMPLOYMENT',
    e.triggers_timeline = true,
    e.description = 'Commencing self-employment triggers registration obligations and Class S PRSI',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (o:Obligation) WHERE o.id IN ['IE_FORM_11_FILING']
MERGE (e)-[:TRIGGERS]->(o);

// Retirement
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_RETIREMENT'})
SET e.label = 'Retirement',
    e.category = 'EMPLOYMENT',
    e.triggers_timeline = false,
    e.description = 'Retirement triggers State Pension entitlements based on contribution history',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (b:Benefit) WHERE b.id IN ['IE_STATE_PENSION_CONTRIBUTORY']
MERGE (e)-[:TRIGGERS]->(b);

// ============================================================================
// HEALTH Life Events
// ============================================================================

// Illness or injury
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_ILLNESS'})
SET e.label = 'Illness or injury',
    e.category = 'HEALTH',
    e.triggers_timeline = true,
    e.description = 'Illness or injury triggers Illness Benefit and potential Invalidity Pension after extended period',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j)

WITH e
MATCH (b:Benefit) WHERE b.id IN ['IE_ILLNESS_BENEFIT']
MERGE (e)-[:TRIGGERS]->(b);

// Disability
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_DISABILITY'})
SET e.label = 'Acquiring a disability',
    e.category = 'HEALTH',
    e.triggers_timeline = false,
    e.description = 'Acquiring a disability may trigger various support benefits and tax reliefs',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// ============================================================================
// RESIDENCY Life Events
// ============================================================================

// Moving to Ireland
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_IMMIGRATION'})
SET e.label = 'Moving to Ireland',
    e.category = 'RESIDENCY',
    e.triggers_timeline = true,
    e.description = 'Becoming Irish resident triggers tax residence rules and domicile considerations',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Leaving Ireland (emigration)
MERGE (e:LifeEvent {id: 'IE_LIFE_EVENT_EMIGRATION'})
SET e.label = 'Leaving Ireland',
    e.category = 'RESIDENCY',
    e.triggers_timeline = true,
    e.description = 'Ceasing Irish residence may end tax residence and affect benefit entitlements',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// ============================================================================
// Timeline Relationships
// ============================================================================

// Birth of child starts maternity benefit claim window
MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_BIRTH_OF_CHILD'})
MATCH (t:Timeline {id: 'IE_MATERNITY_BENEFIT_CLAIM_WINDOW'})
MERGE (e)-[:STARTS_TIMELINE]->(t);

// Bereavement starts survivor pension claim window
MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_BEREAVEMENT'})
MATCH (t:Timeline {id: 'IE_WIDOWS_PENSION_CLAIM_WINDOW'})
MERGE (e)-[:STARTS_TIMELINE]->(t);

// Illness starts illness benefit lookback period
MATCH (e:LifeEvent {id: 'IE_LIFE_EVENT_ILLNESS'})
MATCH (t:Timeline {id: 'IE_ILLNESS_BENEFIT_LOOKBACK'})
MERGE (e)-[:STARTS_TIMELINE]->(t);
