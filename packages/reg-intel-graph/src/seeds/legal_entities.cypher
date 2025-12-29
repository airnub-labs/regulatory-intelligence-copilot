// ============================================================================
// IRISH LEGAL ENTITIES
// ============================================================================

// Private Company Limited by Shares (LTD)
MERGE (e:LegalEntity {id: 'IE_ENTITY_LTD'})
SET e.label = 'Private Company Limited by Shares',
    e.abbreviation = 'LTD',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'PRIVATE',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Most common company type in Ireland',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Designated Activity Company (DAC)
MERGE (e:LegalEntity {id: 'IE_ENTITY_DAC'})
SET e.label = 'Designated Activity Company',
    e.abbreviation = 'DAC',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'DESIGNATED_ACTIVITY',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Company with objects clause limiting activities',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Public Limited Company (PLC)
MERGE (e:LegalEntity {id: 'IE_ENTITY_PLC'})
SET e.label = 'Public Limited Company',
    e.abbreviation = 'PLC',
    e.jurisdiction = 'IE',
    e.category = 'COMPANY',
    e.sub_category = 'PUBLIC',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Company that can offer shares to public',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// General Partnership
MERGE (e:LegalEntity {id: 'IE_ENTITY_PARTNERSHIP'})
SET e.label = 'General Partnership',
    e.jurisdiction = 'IE',
    e.category = 'PARTNERSHIP',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = true,
    e.description = 'Partnership where all partners have unlimited liability',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Limited Partnership (LP)
MERGE (e:LegalEntity {id: 'IE_ENTITY_LP'})
SET e.label = 'Limited Partnership',
    e.abbreviation = 'LP',
    e.jurisdiction = 'IE',
    e.category = 'PARTNERSHIP',
    e.sub_category = 'LIMITED',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = true,
    e.description = 'Partnership with at least one general partner with unlimited liability',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Sole Trader
MERGE (e:LegalEntity {id: 'IE_ENTITY_SOLE_TRADER'})
SET e.label = 'Sole Trader',
    e.jurisdiction = 'IE',
    e.category = 'SOLE_TRADER',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = true,
    e.can_hold_property = true,
    e.tax_transparent = true,
    e.description = 'Individual trading in their own name',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Company Limited by Guarantee (CLG) - typically charities
MERGE (e:LegalEntity {id: 'IE_ENTITY_CLG'})
SET e.label = 'Company Limited by Guarantee',
    e.abbreviation = 'CLG',
    e.jurisdiction = 'IE',
    e.category = 'CHARITY',
    e.has_separate_legal_personality = true,
    e.limited_liability = true,
    e.can_trade = false,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Non-profit company, typically used for charities',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// Discretionary Trust
MERGE (e:LegalEntity {id: 'IE_ENTITY_DISCRETIONARY_TRUST'})
SET e.label = 'Discretionary Trust',
    e.jurisdiction = 'IE',
    e.category = 'TRUST',
    e.has_separate_legal_personality = false,
    e.limited_liability = false,
    e.can_trade = false,
    e.can_hold_property = true,
    e.tax_transparent = false,
    e.description = 'Trust where trustees have discretion over distributions',
    e.created_at = localdatetime(),
    e.updated_at = localdatetime()

WITH e
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (e)-[:IN_JURISDICTION]->(j);

// ============================================================================
// ENTITY-SPECIFIC OBLIGATIONS
// ============================================================================

// Link LTD to CT1 filing
MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'})
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link DAC to CT1 filing
MATCH (e:LegalEntity {id: 'IE_ENTITY_DAC'})
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link LTD to CRO annual return
MATCH (e:LegalEntity {id: 'IE_ENTITY_LTD'})
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link DAC to CRO annual return
MATCH (e:LegalEntity {id: 'IE_ENTITY_DAC'})
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link Sole Trader to Form 11
MATCH (e:LegalEntity {id: 'IE_ENTITY_SOLE_TRADER'})
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);

// Link Partnership to Form 11 (partners file individually)
MATCH (e:LegalEntity {id: 'IE_ENTITY_PARTNERSHIP'})
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:APPLIES_TO_ENTITY]->(e);
