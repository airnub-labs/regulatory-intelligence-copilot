// Seed data for Obligations (Phase 1)
// This file contains initial obligations for Irish profiles

// Irish Corporation Tax Filing Obligation
MERGE (o:Obligation {id: 'IE_CT1_FILING'})
SET o.label = 'Corporation Tax Return (CT1)',
    o.category = 'FILING',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Annual corporation tax return required for all Irish companies',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j)

WITH o
MERGE (t:Timeline {id: 'IE_CT1_DEADLINE'})
SET t.label = '9 months after accounting period end',
    t.window_months = 9,
    t.kind = 'DEADLINE'
MERGE (o)-[:FILING_DEADLINE]->(t)

WITH o
MATCH (p:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})
MERGE (p)-[:HAS_OBLIGATION]->(o);

// Irish Form 11 Filing Obligation (Self-employed)
MERGE (o:Obligation {id: 'IE_FORM_11_FILING'})
SET o.label = 'Income Tax Return (Form 11)',
    o.category = 'FILING',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Annual income tax return for self-employed individuals',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j)

WITH o
MATCH (p:ProfileTag {id: 'PROFILE_SELF_EMPLOYED_IE'})
MERGE (p)-[:HAS_OBLIGATION]->(o);

// Irish Annual Return (CRO) Obligation
MERGE (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
SET o.label = 'Annual Return (B1)',
    o.category = 'FILING',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Annual return to Companies Registration Office',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j)

WITH o
MATCH (p:ProfileTag {id: 'PROFILE_SINGLE_DIRECTOR_IE'})
MERGE (p)-[:HAS_OBLIGATION]->(o);

// Preliminary Tax Payment Obligation
MERGE (o:Obligation {id: 'IE_PRELIMINARY_TAX'})
SET o.label = 'Preliminary Tax Payment',
    o.category = 'PAYMENT',
    o.frequency = 'ANNUAL',
    o.penalty_applies = true,
    o.description = 'Advance payment of income/corporation tax',
    o.created_at = localdatetime(),
    o.updated_at = localdatetime()

WITH o
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (o)-[:IN_JURISDICTION]->(j);
