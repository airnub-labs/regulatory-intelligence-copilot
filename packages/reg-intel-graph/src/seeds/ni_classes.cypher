// ============================================================================
// UK NATIONAL INSURANCE CLASSES
// ============================================================================

// NI Class 1 - Employees
MERGE (ni:NIClass {id: 'UK_NI_CLASS_1'})
SET ni.label = 'Class 1 National Insurance',
    ni.description = 'Paid by employees and employers on earnings from employment',
    ni.rate = 12.0,
    ni.threshold_weekly = 242,
    ni.threshold_annual = 12570,
    ni.eligible_benefits = ['State Pension', 'Unemployment Benefit', 'Maternity Allowance', 'Bereavement Benefits'],
    ni.created_at = localdatetime(),
    ni.updated_at = localdatetime()

WITH ni
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (ni)-[:IN_JURISDICTION]->(j);

// NI Class 2 - Self-Employed (Low Earnings)
MERGE (ni:NIClass {id: 'UK_NI_CLASS_2'})
SET ni.label = 'Class 2 National Insurance',
    ni.description = 'Flat-rate contributions for self-employed people',
    ni.rate = 3.45,
    ni.threshold_weekly = 6632,
    ni.threshold_annual = 6725,
    ni.eligible_benefits = ['State Pension', 'Bereavement Benefits', 'Maternity Allowance'],
    ni.created_at = localdatetime(),
    ni.updated_at = localdatetime()

WITH ni
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (ni)-[:IN_JURISDICTION]->(j);

// NI Class 3 - Voluntary Contributions
MERGE (ni:NIClass {id: 'UK_NI_CLASS_3'})
SET ni.label = 'Class 3 National Insurance',
    ni.description = 'Voluntary contributions to fill gaps in your National Insurance record',
    ni.rate = 17.45,
    ni.eligible_benefits = ['State Pension'],
    ni.created_at = localdatetime(),
    ni.updated_at = localdatetime()

WITH ni
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (ni)-[:IN_JURISDICTION]->(j);

// NI Class 4 - Self-Employed Profits
MERGE (ni:NIClass {id: 'UK_NI_CLASS_4'})
SET ni.label = 'Class 4 National Insurance',
    ni.description = 'Paid by self-employed people on annual profits',
    ni.rate = 9.0,
    ni.threshold_annual = 12570,
    ni.eligible_benefits = [],
    ni.created_at = localdatetime(),
    ni.updated_at = localdatetime()

WITH ni
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (ni)-[:IN_JURISDICTION]->(j);

// ============================================================================
// LINK NI CLASSES TO PROFILE TAGS
// ============================================================================

// Link employed profiles to Class 1
MATCH (pt:ProfileTag), (ni:NIClass {id: 'UK_NI_CLASS_1'})
WHERE pt.id IN ['employed', 'employee', 'worker']
MERGE (pt)-[:HAS_NI_CLASS]->(ni);

// Link self-employed profiles to Class 2 and Class 4
MATCH (pt:ProfileTag), (ni2:NIClass {id: 'UK_NI_CLASS_2'}), (ni4:NIClass {id: 'UK_NI_CLASS_4'})
WHERE pt.id IN ['self-employed', 'sole-trader']
MERGE (pt)-[:HAS_NI_CLASS]->(ni2)
MERGE (pt)-[:HAS_NI_CLASS]->(ni4);

// ============================================================================
// LINK NI CLASSES TO BENEFITS
// ============================================================================

// Class 1 qualifies for State Pension, Unemployment, Maternity
MATCH (ni:NIClass {id: 'UK_NI_CLASS_1'}), (b:Benefit)
WHERE b.id CONTAINS 'UK_STATE_PENSION' OR b.id CONTAINS 'UK_JOBSEEKERS'
MERGE (ni)-[:QUALIFIES_FOR]->(b);

// Class 2 qualifies for State Pension
MATCH (ni:NIClass {id: 'UK_NI_CLASS_2'}), (b:Benefit)
WHERE b.id CONTAINS 'UK_STATE_PENSION'
MERGE (ni)-[:QUALIFIES_FOR]->(b);

// Class 3 qualifies for State Pension only
MATCH (ni:NIClass {id: 'UK_NI_CLASS_3'}), (b:Benefit)
WHERE b.id CONTAINS 'UK_STATE_PENSION'
MERGE (ni)-[:QUALIFIES_FOR]->(b);

// Note: Class 4 doesn't qualify for any contributory benefits
