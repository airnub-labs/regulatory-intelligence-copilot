// ============================================================================
// UK BENEFIT CAPS
// ============================================================================

// Benefit Cap 2024 - Outside Greater London
MERGE (cap:BenefitCap {id: 'UK_BENEFIT_CAP_2024_OUTSIDE_LONDON'})
SET cap.label = 'Benefit Cap 2024 (Outside Greater London)',
    cap.amount_single = 16967,
    cap.amount_couple = 25323,
    cap.amount_with_children = 25323,
    cap.currency = 'GBP',
    cap.frequency = 'ANNUAL',
    cap.exemptions = [
      'Working Tax Credit',
      'Disability Living Allowance',
      'Personal Independence Payment',
      'Attendance Allowance',
      'Carer\'s Allowance',
      'Guardian\'s Allowance',
      'Industrial Injuries Benefits',
      'War Widow\'s or War Widower\'s Pension'
    ],
    cap.effective_from = '2024-04-06',
    cap.created_at = localdatetime(),
    cap.updated_at = localdatetime()

WITH cap
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (cap)-[:IN_JURISDICTION]->(j);

// Benefit Cap 2024 - Greater London
MERGE (cap:BenefitCap {id: 'UK_BENEFIT_CAP_2024_LONDON'})
SET cap.label = 'Benefit Cap 2024 (Greater London)',
    cap.amount_single = 19342,
    cap.amount_couple = 28879,
    cap.amount_with_children = 28879,
    cap.currency = 'GBP',
    cap.frequency = 'ANNUAL',
    cap.exemptions = [
      'Working Tax Credit',
      'Disability Living Allowance',
      'Personal Independence Payment',
      'Attendance Allowance',
      'Carer\'s Allowance',
      'Guardian\'s Allowance',
      'Industrial Injuries Benefits',
      'War Widow\'s or War Widower\'s Pension'
    ],
    cap.effective_from = '2024-04-06',
    cap.created_at = localdatetime(),
    cap.updated_at = localdatetime()

WITH cap
MATCH (j:Jurisdiction {id: 'UK'})
MERGE (cap)-[:IN_JURISDICTION]->(j);

// ============================================================================
// LINK BENEFITS TO CAPS
// ============================================================================

// Benefits that count towards the cap (if they exist in the graph)
MATCH (cap:BenefitCap)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'UK'})
MATCH (b:Benefit)-[:IN_JURISDICTION]->(j)
WHERE b.id CONTAINS 'UNIVERSAL_CREDIT'
   OR b.id CONTAINS 'HOUSING_BENEFIT'
   OR b.id CONTAINS 'CHILD_BENEFIT'
   OR b.id CONTAINS 'CHILD_TAX_CREDIT'
   OR b.id CONTAINS 'JOBSEEKERS'
   OR b.id CONTAINS 'EMPLOYMENT_SUPPORT'
   OR b.id CONTAINS 'INCOME_SUPPORT'
   OR b.id CONTAINS 'MATERNITY_ALLOWANCE'
MERGE (b)-[:SUBJECT_TO_CAP]->(cap);

// Note: Benefits like DLA, PIP, Carer's Allowance are NOT subject to the cap
// These are listed in the exemptions property
