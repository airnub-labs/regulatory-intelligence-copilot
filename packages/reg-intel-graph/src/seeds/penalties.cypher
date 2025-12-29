// ============================================================================
// PENALTIES FOR CT1 FILING
// ============================================================================

// Late CT1 Filing Surcharge - First tier (5%)
MERGE (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5'})
SET p.label = 'Late CT1 Filing Surcharge (5%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 5,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = '5% surcharge on tax due if CT1 filed within 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// Late CT1 Filing Surcharge - Second tier (10%)
MERGE (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_10'})
SET p.label = 'Late CT1 Filing Surcharge (10%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 10,
    p.currency = 'EUR',
    p.applies_after_months = 2,
    p.description = '10% surcharge on tax due if CT1 filed more than 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// PENALTIES FOR FORM 11 FILING
// ============================================================================

// Late Form 11 Filing Surcharge - First tier (5%)
MERGE (p:Penalty {id: 'IE_LATE_FORM11_SURCHARGE_5'})
SET p.label = 'Late Form 11 Filing Surcharge (5%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 5,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = '5% surcharge on tax due if Form 11 filed within 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// Late Form 11 Filing Surcharge - Second tier (10%)
MERGE (p:Penalty {id: 'IE_LATE_FORM11_SURCHARGE_10'})
SET p.label = 'Late Form 11 Filing Surcharge (10%)',
    p.penalty_type = 'SURCHARGE',
    p.rate = 10,
    p.currency = 'EUR',
    p.applies_after_months = 2,
    p.description = '10% surcharge on tax due if Form 11 filed more than 2 months after deadline',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// LATE PAYMENT INTEREST
// ============================================================================

MERGE (p:Penalty {id: 'IE_LATE_PAYMENT_INTEREST'})
SET p.label = 'Late Payment Interest',
    p.penalty_type = 'INTEREST',
    p.daily_rate = 0.0219,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = 'Interest charged at 0.0219% per day (approx 8% per annum) on overdue tax',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_PRELIMINARY_TAX'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// CRO LATE FILING PENALTIES
// ============================================================================

MERGE (p:Penalty {id: 'IE_CRO_LATE_ANNUAL_RETURN'})
SET p.label = 'CRO Late Annual Return Penalty',
    p.penalty_type = 'FIXED',
    p.flat_amount = 100,
    p.currency = 'EUR',
    p.applies_after_days = 1,
    p.description = 'Late filing fee plus potential loss of audit exemption for 2 years',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:HAS_PENALTY]->(p);

// Loss of Audit Exemption (consequential penalty)
MERGE (p:Penalty {id: 'IE_CRO_LOSS_AUDIT_EXEMPTION'})
SET p.label = 'Loss of Audit Exemption',
    p.penalty_type = 'RESTRICTION',
    p.applies_after_days = 1,
    p.description = 'Company loses audit exemption for current and following financial year',
    p.created_at = localdatetime(),
    p.updated_at = localdatetime()

WITH p
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (p)-[:IN_JURISDICTION]->(j)

WITH p
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:HAS_PENALTY]->(p);

// ============================================================================
// WAIVER CONDITIONS
// ============================================================================

// Create waiver condition for first-time offenders
MERGE (c:Condition {id: 'IE_FIRST_TIME_LATE_FILER'})
SET c.label = 'First-time late filer',
    c.description = 'Surcharge may be reduced or waived for taxpayers with good compliance history',
    c.category = 'COMPLIANCE_HISTORY',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (p:Penalty {id: 'IE_LATE_CT1_SURCHARGE_5'})
MERGE (p)-[:WAIVED_IF]->(c);

// Reasonable excuse condition
MERGE (c:Condition {id: 'IE_REASONABLE_EXCUSE'})
SET c.label = 'Reasonable excuse',
    c.description = 'Penalty may be waived if taxpayer can demonstrate reasonable excuse for late filing',
    c.category = 'EXCUSE',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (p:Penalty) WHERE p.penalty_type = 'SURCHARGE'
MERGE (p)-[:WAIVED_IF]->(c);
