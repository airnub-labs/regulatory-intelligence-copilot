// ============================================================================
// IRISH ASSET CLASSES FOR TAX PURPOSES
// ============================================================================

// Residential Property
MERGE (ac:AssetClass {id: 'IE_ASSET_RESIDENTIAL_PROPERTY'})
SET ac.label = 'Residential Property',
    ac.category = 'PROPERTY',
    ac.sub_category = 'RESIDENTIAL',
    ac.tangible = true,
    ac.cgt_applicable = true,
    ac.cat_applicable = true,
    ac.stamp_duty_applicable = true,
    ac.description = 'Residential real estate including houses, apartments, and residential land',
    ac.created_at = localdatetime(),
    ac.updated_at = localdatetime()

WITH ac
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ac)-[:IN_JURISDICTION]->(j);

// Commercial Property
MERGE (ac:AssetClass {id: 'IE_ASSET_COMMERCIAL_PROPERTY'})
SET ac.label = 'Commercial Property',
    ac.category = 'PROPERTY',
    ac.sub_category = 'COMMERCIAL',
    ac.tangible = true,
    ac.cgt_applicable = true,
    ac.cat_applicable = true,
    ac.stamp_duty_applicable = true,
    ac.description = 'Commercial real estate including offices, retail spaces, and industrial property',
    ac.created_at = localdatetime(),
    ac.updated_at = localdatetime()

WITH ac
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ac)-[:IN_JURISDICTION]->(j);

// Quoted Shares
MERGE (ac:AssetClass {id: 'IE_ASSET_SHARES_QUOTED'})
SET ac.label = 'Quoted Shares',
    ac.category = 'SHARES',
    ac.sub_category = 'QUOTED',
    ac.tangible = false,
    ac.cgt_applicable = true,
    ac.cat_applicable = true,
    ac.stamp_duty_applicable = true,
    ac.description = 'Shares listed on a recognized stock exchange',
    ac.created_at = localdatetime(),
    ac.updated_at = localdatetime()

WITH ac
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ac)-[:IN_JURISDICTION]->(j);

// Unquoted Shares
MERGE (ac:AssetClass {id: 'IE_ASSET_SHARES_UNQUOTED'})
SET ac.label = 'Unquoted Shares',
    ac.category = 'SHARES',
    ac.sub_category = 'UNQUOTED',
    ac.tangible = false,
    ac.cgt_applicable = true,
    ac.cat_applicable = true,
    ac.stamp_duty_applicable = true,
    ac.description = 'Private company shares not listed on an exchange',
    ac.created_at = localdatetime(),
    ac.updated_at = localdatetime()

WITH ac
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ac)-[:IN_JURISDICTION]->(j);

// Cryptocurrency
MERGE (ac:AssetClass {id: 'IE_ASSET_CRYPTO'})
SET ac.label = 'Cryptocurrency',
    ac.category = 'CRYPTO',
    ac.tangible = false,
    ac.cgt_applicable = true,
    ac.cat_applicable = true,
    ac.stamp_duty_applicable = false,
    ac.description = 'Digital assets including Bitcoin, Ethereum, and other cryptocurrencies',
    ac.created_at = localdatetime(),
    ac.updated_at = localdatetime()

WITH ac
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ac)-[:IN_JURISDICTION]->(j);

// Agricultural Land
MERGE (ac:AssetClass {id: 'IE_ASSET_AGRICULTURAL_LAND'})
SET ac.label = 'Agricultural Land',
    ac.category = 'AGRICULTURAL',
    ac.tangible = true,
    ac.cgt_applicable = true,
    ac.cat_applicable = true,
    ac.stamp_duty_applicable = true,
    ac.description = 'Farmland and agricultural property used for farming purposes',
    ac.created_at = localdatetime(),
    ac.updated_at = localdatetime()

WITH ac
MATCH (j:Jurisdiction {id: 'IE'})
MERGE (ac)-[:IN_JURISDICTION]->(j);

// ============================================================================
// LINK CGT RATE TO ASSET CLASSES
// ============================================================================

// Standard 33% CGT rate applies to most assets
MATCH (ac:AssetClass)-[:IN_JURISDICTION]->(j:Jurisdiction {id: 'IE'})
WHERE ac.cgt_applicable = true
MATCH (r:Rate {id: 'IE_CGT_RATE_2024'})
MERGE (ac)-[:HAS_CGT_RATE]->(r);
