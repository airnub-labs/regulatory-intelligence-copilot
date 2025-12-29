// PRSI Classes Seed Data
// Implements Irish PRSI (Pay Related Social Insurance) classification system
// Reference: https://www.gov.ie/en/publication/9f278-prsi-classes/

// ============================================================================
// PRSI Class A - Employees
// ============================================================================
MERGE (ca:PRSIClass {id: 'IE_PRSI_CLASS_A'})
SET ca.label = 'Class A',
    ca.description = 'Employees under 66 in industrial, commercial and service employment',
    ca.eligible_benefits = [
      'Jobseeker\'s Benefit',
      'Illness Benefit',
      'Maternity Benefit',
      'Paternity Benefit',
      'Parent\'s Benefit',
      'Adoptive Benefit',
      'Health and Safety Benefit',
      'Invalidity Pension',
      'State Pension (Contributory)',
      'Widow\'s, Widower\'s or Surviving Civil Partner\'s Pension',
      'Guardian\'s Payment (Contributory)',
      'Treatment Benefit',
      'Occupational Injuries Benefit'
    ],
    ca.created_at = localdatetime(),
    ca.updated_at = localdatetime()

WITH ca
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ca)-[:IN_JURISDICTION]->(j)

WITH ca
MATCH (p:ProfileTag) WHERE p.id IN ['PROFILE_PAYE_EMPLOYEE_IE']
MERGE (p)-[:HAS_PRSI_CLASS]->(ca);

// Link Class A to major benefits
WITH ca
MATCH (b:Benefit) WHERE b.id IN [
  'IE_JOBSEEKERS_BENEFIT',
  'IE_ILLNESS_BENEFIT',
  'IE_MATERNITY_BENEFIT',
  'IE_STATE_PENSION_CONTRIBUTORY'
]
MERGE (ca)-[:ENTITLES_TO]->(b);

// ============================================================================
// PRSI Class S - Self-employed
// ============================================================================
MERGE (cs:PRSIClass {id: 'IE_PRSI_CLASS_S'})
SET cs.label = 'Class S',
    cs.description = 'Self-employed people with income of €5,000 or more per year',
    cs.eligible_benefits = [
      'Invalidity Pension',
      'State Pension (Contributory)',
      'Widow\'s, Widower\'s or Surviving Civil Partner\'s Pension',
      'Guardian\'s Payment (Contributory)',
      'Maternity Benefit',
      'Paternity Benefit',
      'Parent\'s Benefit',
      'Adoptive Benefit',
      'Treatment Benefit'
    ],
    cs.created_at = localdatetime(),
    cs.updated_at = localdatetime()

WITH cs
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (cs)-[:IN_JURISDICTION]->(j)

WITH cs
MATCH (p:ProfileTag) WHERE p.id IN ['PROFILE_SELF_EMPLOYED_IE', 'PROFILE_SINGLE_DIRECTOR_IE']
MERGE (p)-[:HAS_PRSI_CLASS]->(cs);

// Link Class S to eligible benefits (notably excluding Jobseeker's Benefit)
WITH cs
MATCH (b:Benefit) WHERE b.id IN [
  'IE_MATERNITY_BENEFIT',
  'IE_STATE_PENSION_CONTRIBUTORY'
]
MERGE (cs)-[:ENTITLES_TO]->(b);

// ============================================================================
// PRSI Class B - Civil Servants (pre-1995)
// ============================================================================
MERGE (cb:PRSIClass {id: 'IE_PRSI_CLASS_B'})
SET cb.label = 'Class B',
    cb.description = 'Civil and public servants recruited before 6 April 1995',
    cb.eligible_benefits = [
      'Widow\'s, Widower\'s or Surviving Civil Partner\'s Pension',
      'Guardian\'s Payment (Contributory)',
      'Treatment Benefit'
    ],
    cb.created_at = localdatetime(),
    cb.updated_at = localdatetime()

WITH cb
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (cb)-[:IN_JURISDICTION]->(j);

// ============================================================================
// PRSI Class D - Civil Servants (post-1995)
// ============================================================================
MERGE (cd:PRSIClass {id: 'IE_PRSI_CLASS_D'})
SET cd.label = 'Class D',
    cd.description = 'Civil and public servants recruited from 6 April 1995',
    cd.eligible_benefits = [
      'Jobseeker\'s Benefit',
      'Illness Benefit',
      'Maternity Benefit',
      'Paternity Benefit',
      'Parent\'s Benefit',
      'Adoptive Benefit',
      'Health and Safety Benefit',
      'Invalidity Pension',
      'Widow\'s, Widower\'s or Surviving Civil Partner\'s Pension',
      'Guardian\'s Payment (Contributory)',
      'Treatment Benefit',
      'Occupational Injuries Benefit'
    ],
    cd.created_at = localdatetime(),
    cd.updated_at = localdatetime()

WITH cd
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (cd)-[:IN_JURISDICTION]->(j);

// Link Class D to major benefits (similar to Class A but no State Pension)
WITH cd
MATCH (b:Benefit) WHERE b.id IN [
  'IE_JOBSEEKERS_BENEFIT',
  'IE_ILLNESS_BENEFIT',
  'IE_MATERNITY_BENEFIT'
]
MERGE (cd)-[:ENTITLES_TO]->(b);

// ============================================================================
// PRSI Class J - Employees with earnings under €38 per week
// ============================================================================
MERGE (cj:PRSIClass {id: 'IE_PRSI_CLASS_J'})
SET cj.label = 'Class J',
    cj.description = 'Employees with reckonable earnings under €38 per week',
    cj.eligible_benefits = [
      'Occupational Injuries Benefit'
    ],
    cj.created_at = localdatetime(),
    cj.updated_at = localdatetime()

WITH cj
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (cj)-[:IN_JURISDICTION]->(j);

// ============================================================================
// PRSI Contribution Rates
// ============================================================================

// Link PRSI classes to contribution rates
MATCH (ca:PRSIClass {id: 'IE_PRSI_CLASS_A'})
MATCH (r:Rate {id: 'IE_PRSI_RATE_EMPLOYEE_CLASS_A'})
MERGE (ca)-[:CONTRIBUTION_RATE]->(r);

MATCH (cs:PRSIClass {id: 'IE_PRSI_CLASS_S'})
MATCH (r:Rate {id: 'IE_PRSI_RATE_SELF_EMPLOYED'})
MERGE (cs)-[:CONTRIBUTION_RATE]->(r);
