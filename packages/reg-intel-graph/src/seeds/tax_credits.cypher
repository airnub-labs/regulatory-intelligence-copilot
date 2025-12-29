// ============================================================================
// IRISH TAX CREDITS 2024
// ============================================================================

// Personal Tax Credit (Single)
MERGE (c:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_SINGLE_2024'})
SET c.label = 'Personal Tax Credit (Single)',
    c.amount = 1875,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'PERSONAL',
    c.description = 'Basic tax credit for single individuals',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Personal Tax Credit (Married)
MERGE (c:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_MARRIED_2024'})
SET c.label = 'Personal Tax Credit (Married)',
    c.amount = 3750,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = true,
    c.category = 'PERSONAL',
    c.description = 'Basic tax credit for married couples/civil partners',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Employee Tax Credit (PAYE Credit)
MERGE (c:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
SET c.label = 'Employee Tax Credit',
    c.amount = 1875,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'EMPLOYMENT',
    c.description = 'Tax credit for PAYE employees',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j)

WITH c
MATCH (p:ProfileTag {id: 'PROFILE_PAYE_EMPLOYEE_IE'})
MERGE (p)-[:ENTITLED_TO]->(c);

// Earned Income Tax Credit (Self-employed)
MERGE (c:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
SET c.label = 'Earned Income Tax Credit',
    c.amount = 1875,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'EMPLOYMENT',
    c.description = 'Tax credit for self-employed and proprietary directors',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j)

WITH c
MATCH (p:ProfileTag) WHERE p.id IN ['PROFILE_SELF_EMPLOYED_IE', 'PROFILE_SINGLE_DIRECTOR_IE']
MERGE (p)-[:ENTITLED_TO]->(c);

// Home Carer Tax Credit
MERGE (c:TaxCredit {id: 'IE_HOME_CARER_TAX_CREDIT_2024'})
SET c.label = 'Home Carer Tax Credit',
    c.amount = 1800,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'FAMILY',
    c.description = 'Credit for spouse/civil partner caring for dependents at home',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Single Person Child Carer Credit
MERGE (c:TaxCredit {id: 'IE_SINGLE_PERSON_CHILD_CARER_2024'})
SET c.label = 'Single Person Child Carer Credit',
    c.amount = 1750,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'FAMILY',
    c.description = 'Credit for single parents with qualifying children',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Age Tax Credit (65+)
MERGE (c:TaxCredit {id: 'IE_AGE_TAX_CREDIT_SINGLE_2024'})
SET c.label = 'Age Tax Credit (Single)',
    c.amount = 245,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'PERSONAL',
    c.description = 'Additional credit for individuals aged 65 or over',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// Incapacitated Child Tax Credit
MERGE (c:TaxCredit {id: 'IE_INCAPACITATED_CHILD_CREDIT_2024'})
SET c.label = 'Incapacitated Child Tax Credit',
    c.amount = 3500,
    c.currency = 'EUR',
    c.tax_year = 2024,
    c.refundable = false,
    c.transferable = false,
    c.category = 'FAMILY',
    c.description = 'Credit for parents of permanently incapacitated children',
    c.created_at = localdatetime(),
    c.updated_at = localdatetime()

WITH c
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (c)-[:IN_JURISDICTION]->(j);

// ============================================================================
// STACKING RELATIONSHIPS
// ============================================================================

// Personal credit stacks with Employee/Earned Income credit
MATCH (c1:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_SINGLE_2024'})
MATCH (c2:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
MERGE (c1)-[:STACKS_WITH]->(c2);

MATCH (c1:TaxCredit {id: 'IE_PERSONAL_TAX_CREDIT_SINGLE_2024'})
MATCH (c2:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
MERGE (c1)-[:STACKS_WITH]->(c2);

// But Employee and Earned Income don't stack (mutually exclusive)
MATCH (c1:TaxCredit {id: 'IE_EMPLOYEE_TAX_CREDIT_2024'})
MATCH (c2:TaxCredit {id: 'IE_EARNED_INCOME_TAX_CREDIT_2024'})
MERGE (c1)-[:MUTUALLY_EXCLUSIVE_WITH]->(c2);
