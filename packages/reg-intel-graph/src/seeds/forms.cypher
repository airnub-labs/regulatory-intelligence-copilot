// Seed data for Forms (Phase 1)
// This file contains regulatory forms for Irish compliance and benefits

// Revenue Forms
MERGE (f:Form {id: 'IE_REVENUE_FORM_CT1'})
SET f.label = 'Corporation Tax Return (CT1)',
    f.issuing_body = 'Revenue',
    f.form_number = 'CT1',
    f.source_url = 'https://www.revenue.ie/en/companies-and-charities/corporation-tax-for-companies/index.aspx',
    f.category = 'TAX',
    f.online_only = true,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j)

WITH f
MATCH (o:Obligation {id: 'IE_CT1_FILING'})
MERGE (o)-[:REQUIRES_FORM]->(f);

MERGE (f:Form {id: 'IE_REVENUE_FORM_11'})
SET f.label = 'Income Tax Return (Form 11)',
    f.issuing_body = 'Revenue',
    f.form_number = 'Form 11',
    f.source_url = 'https://www.revenue.ie/en/self-assessment-and-self-employment/filing-your-tax-return/index.aspx',
    f.category = 'TAX',
    f.online_only = true,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j)

WITH f
MATCH (o:Obligation {id: 'IE_FORM_11_FILING'})
MERGE (o)-[:REQUIRES_FORM]->(f);

// CRO Forms
MERGE (f:Form {id: 'IE_CRO_FORM_B1'})
SET f.label = 'Annual Return (B1)',
    f.issuing_body = 'CRO',
    f.form_number = 'B1',
    f.source_url = 'https://www.cro.ie/Annual-Return',
    f.category = 'COMPANY',
    f.online_only = true,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j)

WITH f
MATCH (o:Obligation {id: 'IE_CRO_ANNUAL_RETURN'})
MERGE (o)-[:REQUIRES_FORM]->(f);

// DSP Forms
MERGE (f:Form {id: 'IE_DSP_FORM_UP1'})
SET f.label = 'Jobseeker\'s Benefit Application (UP1)',
    f.issuing_body = 'DSP',
    f.form_number = 'UP1',
    f.source_url = 'https://www.gov.ie/en/service/c71fc0-jobseekers-benefit/',
    f.category = 'SOCIAL_WELFARE',
    f.online_only = false,
    f.created_at = localdatetime(),
    f.updated_at = localdatetime()

WITH f
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (f)-[:IN_JURISDICTION]->(j);
