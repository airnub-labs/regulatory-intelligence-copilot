// ============================================================================
// TAX YEARS (IRELAND)
// ============================================================================

// Tax Year 2023
MERGE (ty:TaxYear {id: 'IE_TAX_YEAR_2023'})
SET ty.year = 2023,
    ty.start_date = '2023-01-01',
    ty.end_date = '2023-12-31',
    ty.jurisdiction = 'IE',
    ty.created_at = localdatetime(),
    ty.updated_at = localdatetime()

WITH ty
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ty)-[:IN_JURISDICTION]->(j);

// Tax Year 2024
MERGE (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
SET ty.year = 2024,
    ty.start_date = '2024-01-01',
    ty.end_date = '2024-12-31',
    ty.jurisdiction = 'IE',
    ty.created_at = localdatetime(),
    ty.updated_at = localdatetime()

WITH ty
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ty)-[:IN_JURISDICTION]->(j);

// Tax Year 2025
MERGE (ty:TaxYear {id: 'IE_TAX_YEAR_2025'})
SET ty.year = 2025,
    ty.start_date = '2025-01-01',
    ty.end_date = '2025-12-31',
    ty.jurisdiction = 'IE',
    ty.created_at = localdatetime(),
    ty.updated_at = localdatetime()

WITH ty
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ty)-[:IN_JURISDICTION]->(j);

// ============================================================================
// LINK RATES TO TAX YEARS
// ============================================================================

// Link 2024 rates to tax year 2024
MATCH (r:Rate) WHERE r.id CONTAINS '2024'
MATCH (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
MERGE (r)-[:APPLIES_IN_YEAR]->(ty);

// ============================================================================
// LINK THRESHOLDS TO TAX YEARS
// ============================================================================

// Link 2024 thresholds to tax year 2024
MATCH (t:Threshold) WHERE t.id CONTAINS '2024'
MATCH (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
MERGE (t)-[:APPLIES_IN_YEAR]->(ty);

// ============================================================================
// LINK TAX CREDITS TO TAX YEARS
// ============================================================================

// Link 2024 tax credits to tax year 2024
MATCH (c:TaxCredit) WHERE c.id CONTAINS '2024'
MATCH (ty:TaxYear {id: 'IE_TAX_YEAR_2024'})
MERGE (c)-[:APPLIES_IN_YEAR]->(ty);
