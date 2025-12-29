// ============================================================================
// IRISH REGULATORY BODIES
// ============================================================================

// Revenue Commissioners (Tax Authority)
MERGE (rb:RegulatoryBody {id: 'IE_REVENUE'})
SET rb.label = 'Revenue Commissioners',
    rb.abbreviation = 'Revenue',
    rb.jurisdiction = 'IE',
    rb.domain = 'TAX',
    rb.website = 'https://www.revenue.ie',
    rb.description = 'Irish tax authority responsible for tax collection and customs',
    rb.created_at = localdatetime(),
    rb.updated_at = localdatetime()

WITH rb
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (rb)-[:IN_JURISDICTION]->(j);

// Department of Social Protection (Social Welfare)
MERGE (rb:RegulatoryBody {id: 'IE_DSP'})
SET rb.label = 'Department of Social Protection',
    rb.abbreviation = 'DSP',
    rb.jurisdiction = 'IE',
    rb.domain = 'SOCIAL_WELFARE',
    rb.website = 'https://www.gov.ie/en/organisation/department-of-social-protection/',
    rb.description = 'Government department responsible for social welfare payments and pensions',
    rb.created_at = localdatetime(),
    rb.updated_at = localdatetime()

WITH rb
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (rb)-[:IN_JURISDICTION]->(j);

// Companies Registration Office (Company Registrar)
MERGE (rb:RegulatoryBody {id: 'IE_CRO'})
SET rb.label = 'Companies Registration Office',
    rb.abbreviation = 'CRO',
    rb.jurisdiction = 'IE',
    rb.domain = 'COMPANY',
    rb.website = 'https://www.cro.ie',
    rb.description = 'Registrar of companies in Ireland',
    rb.created_at = localdatetime(),
    rb.updated_at = localdatetime()

WITH rb
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (rb)-[:IN_JURISDICTION]->(j);

// Pensions Authority
MERGE (rb:RegulatoryBody {id: 'IE_PENSIONS_AUTHORITY'})
SET rb.label = 'Pensions Authority',
    rb.jurisdiction = 'IE',
    rb.domain = 'PENSIONS',
    rb.website = 'https://www.pensionsauthority.ie',
    rb.description = 'Regulator of occupational pensions in Ireland',
    rb.created_at = localdatetime(),
    rb.updated_at = localdatetime()

WITH rb
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (rb)-[:IN_JURISDICTION]->(j);

// ============================================================================
// LINK OBLIGATIONS TO REGULATORY BODIES
// ============================================================================

// Revenue administers tax obligations
MATCH (o:Obligation {id: 'IE_CT1_FILING'}), (rb:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (o)-[:ADMINISTERED_BY]->(rb);

MATCH (o:Obligation {id: 'IE_FORM_11_FILING'}), (rb:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (o)-[:ADMINISTERED_BY]->(rb);

MATCH (o:Obligation {id: 'IE_PRELIMINARY_TAX'}), (rb:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (o)-[:ADMINISTERED_BY]->(rb);

// CRO administers company filing obligations
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'}), (rb:RegulatoryBody {id: 'IE_CRO'})
MERGE (o)-[:ADMINISTERED_BY]->(rb);

// ============================================================================
// LINK FORMS TO ISSUING BODIES
// ============================================================================

// Revenue issues tax forms
MATCH (f:Form {id: 'IE_REVENUE_FORM_CT1'}), (rb:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (f)-[:ISSUED_BY]->(rb);

MATCH (f:Form {id: 'IE_REVENUE_FORM_11'}), (rb:RegulatoryBody {id: 'IE_REVENUE'})
MERGE (f)-[:ISSUED_BY]->(rb);

// CRO issues company forms
MATCH (f:Form {id: 'IE_CRO_FORM_B1'}), (rb:RegulatoryBody {id: 'IE_CRO'})
MERGE (f)-[:ISSUED_BY]->(rb);

// DSP issues social welfare forms
MATCH (f:Form {id: 'IE_DSP_FORM_UP1'}), (rb:RegulatoryBody {id: 'IE_DSP'})
MERGE (f)-[:ISSUED_BY]->(rb);

// ============================================================================
// LINK BENEFITS TO ADMINISTERING BODIES
// ============================================================================

// DSP administers all Irish social welfare benefits
MATCH (b:Benefit)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
MATCH (rb:RegulatoryBody {id: 'IE_DSP'})
MERGE (b)-[:ADMINISTERED_BY]->(rb);
