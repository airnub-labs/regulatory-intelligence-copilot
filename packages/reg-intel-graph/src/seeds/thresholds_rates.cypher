// Seed data for Thresholds and Rates (Phase 1)
// This file contains initial thresholds and rates for Irish tax and benefits

// === THRESHOLDS ===

// CGT Annual Exemption
MERGE (t:Threshold {id: 'IE_CGT_ANNUAL_EXEMPTION_2024'})
SET t.label = 'CGT Annual Exemption',
    t.value = 1270,
    t.unit = 'EUR',
    t.direction = 'BELOW',
    t.category = 'CGT',
    t.effective_from = datetime('2024-01-01T00:00:00'),
    t.created_at = localdatetime(),
    t.updated_at = localdatetime()

WITH t
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (t)-[:IN_JURISDICTION]->(j);

// Small Benefit Exemption
MERGE (t:Threshold {id: 'IE_SMALL_BENEFIT_EXEMPTION_2024'})
SET t.label = 'Small Benefit Exemption',
    t.value = 1000,
    t.unit = 'EUR',
    t.direction = 'BELOW',
    t.category = 'BIK',
    t.effective_from = datetime('2024-01-01T00:00:00'),
    t.created_at = localdatetime(),
    t.updated_at = localdatetime()

WITH t
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (t)-[:IN_JURISDICTION]->(j);

// PRSI Contribution Threshold for Jobseeker's Benefit
MERGE (t:Threshold {id: 'IE_PRSI_JOBSEEKERS_CONTRIB_THRESHOLD'})
SET t.label = 'PRSI Contributions for Jobseeker\'s Benefit',
    t.value = 104,
    t.unit = 'WEEKS',
    t.direction = 'ABOVE',
    t.category = 'PRSI',
    t.created_at = localdatetime(),
    t.updated_at = localdatetime()

WITH t
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (t)-[:IN_JURISDICTION]->(j);

// === RATES ===

// Income Tax Standard Rate
MERGE (r:Rate {id: 'IE_INCOME_TAX_STANDARD_2024'})
SET r.label = 'Standard Rate Income Tax',
    r.percentage = 20,
    r.band_lower = 0,
    r.band_upper = 42000,
    r.currency = 'EUR',
    r.category = 'INCOME_TAX',
    r.effective_from = datetime('2024-01-01T00:00:00'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// Income Tax Higher Rate
MERGE (r:Rate {id: 'IE_INCOME_TAX_HIGHER_2024'})
SET r.label = 'Higher Rate Income Tax',
    r.percentage = 40,
    r.band_lower = 42000,
    r.currency = 'EUR',
    r.category = 'INCOME_TAX',
    r.effective_from = datetime('2024-01-01T00:00:00'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// CGT Rate
MERGE (r:Rate {id: 'IE_CGT_RATE_2024'})
SET r.label = 'Capital Gains Tax Rate',
    r.percentage = 33,
    r.currency = 'EUR',
    r.category = 'CGT',
    r.effective_from = datetime('2024-01-01T00:00:00'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// PRSI Class S Rate
MERGE (r:Rate {id: 'IE_PRSI_CLASS_S_2024'})
SET r.label = 'PRSI Class S Rate',
    r.percentage = 4,
    r.currency = 'EUR',
    r.category = 'PRSI',
    r.effective_from = datetime('2024-01-01T00:00:00'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// VAT Standard Rate
MERGE (r:Rate {id: 'IE_VAT_STANDARD_2024'})
SET r.label = 'VAT Standard Rate',
    r.percentage = 23,
    r.currency = 'EUR',
    r.category = 'VAT',
    r.effective_from = datetime('2024-01-01T00:00:00'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);

// VAT Reduced Rate
MERGE (r:Rate {id: 'IE_VAT_REDUCED_2024'})
SET r.label = 'VAT Reduced Rate',
    r.percentage = 13.5,
    r.currency = 'EUR',
    r.category = 'VAT',
    r.effective_from = datetime('2024-01-01T00:00:00'),
    r.created_at = localdatetime(),
    r.updated_at = localdatetime()

WITH r
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (r)-[:IN_JURISDICTION]->(j);
