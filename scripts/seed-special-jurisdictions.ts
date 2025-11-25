#!/usr/bin/env node
/**
 * Special Jurisdictions Seeding Script
 *
 * Seeds Memgraph with IE/UK/NI/IM/EU jurisdictions, CTA framework, and NI goods regime.
 * Implements the modelling documented in docs/specs/special_jurisdictions_modelling_v_0_1.md
 *
 * Based on docs/graph_seed_ni_uk_ie_eu.txt
 *
 * Usage:
 *   tsx scripts/seed-special-jurisdictions.ts
 *
 * Environment Variables:
 *   MEMGRAPH_URI - Bolt URI (default: bolt://localhost:7687)
 *   MEMGRAPH_USERNAME - Username (optional)
 *   MEMGRAPH_PASSWORD - Password (optional)
 */

import neo4j, { Driver } from 'neo4j-driver';

const MEMGRAPH_URI = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
const MEMGRAPH_USERNAME = process.env.MEMGRAPH_USERNAME;
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD;

/**
 * Create driver connection
 */
function createDriver(): Driver {
  let auth;
  if (MEMGRAPH_USERNAME && MEMGRAPH_PASSWORD) {
    auth = neo4j.auth.basic(MEMGRAPH_USERNAME, MEMGRAPH_PASSWORD);
  } else {
    // No auth - pass undefined for Memgraph without authentication
    auth = undefined;
  }

  return neo4j.driver(MEMGRAPH_URI, auth);
}

/**
 * Execute a Cypher query
 */
async function executeCypher(
  driver: Driver,
  query: string,
  params?: Record<string, unknown>
): Promise<void> {
  const session = driver.session();
  try {
    await session.run(query, params || {});
  } finally {
    await session.close();
  }
}

/**
 * Seed the graph with special jurisdiction data
 */
async function seedSpecialJurisdictions() {
  console.log('🌱 Starting special jurisdictions seeding...');
  console.log(`📍 Connecting to: ${MEMGRAPH_URI}`);

  const driver = createDriver();

  try {
    // Test connection
    await driver.verifyConnectivity();
    console.log('✅ Connected to Memgraph');

    // 1. Create Jurisdictions
    console.log('\n🌍 Creating jurisdictions...');
    await executeCypher(
      driver,
      `
      MERGE (ie:Jurisdiction {code: 'IE'})
        ON CREATE SET ie.name = 'Ireland',
                      ie.kind = 'sovereign_state',
                      ie.created_at = datetime()
        ON MATCH SET ie.updated_at = datetime()

      MERGE (uk:Jurisdiction {code: 'UK'})
        ON CREATE SET uk.name = 'United Kingdom',
                      uk.kind = 'sovereign_state',
                      uk.created_at = datetime()
        ON MATCH SET uk.updated_at = datetime()

      MERGE (im:Jurisdiction {code: 'IM'})
        ON CREATE SET im.name = 'Isle of Man',
                      im.kind = 'crown_dependency',
                      im.created_at = datetime()
        ON MATCH SET im.updated_at = datetime()

      MERGE (eu:Jurisdiction {code: 'EU'})
        ON CREATE SET eu.name = 'European Union',
                      eu.kind = 'supranational',
                      eu.created_at = datetime()
        ON MATCH SET eu.updated_at = datetime()
    `
    );
    console.log('   ✅ Created: IE, UK, IM, EU');

    // 2. Create Special Region: Northern Ireland
    console.log('\n📍 Creating Northern Ireland region...');
    await executeCypher(
      driver,
      `
      MERGE (ni:Region {code: 'NI'})
        ON CREATE SET ni.name = 'Northern Ireland',
                      ni.kind = 'special_trade_region'

      MATCH (ni:Region {code: 'NI'})
      MATCH (uk:Jurisdiction {code: 'UK'})
      MERGE (ni)-[:PART_OF]->(uk)
    `
    );
    console.log('   ✅ Created: NI (part of UK)');

    // 3. Create Agreements
    console.log('\n📜 Creating agreements...');
    await executeCypher(
      driver,
      `
      MERGE (cta:Agreement {code: 'CTA'})
        ON CREATE SET cta.name = 'Common Travel Area',
                      cta.kind = 'mobility_cooperation',
                      cta.description = 'Common Travel Area between Ireland, the UK, Isle of Man, and Channel Islands'

      MERGE (niProt:Agreement {code: 'NI_PROTOCOL'})
        ON CREATE SET niProt.name = 'Ireland/Northern Ireland Protocol',
                      niProt.kind = 'protocol',
                      niProt.description = 'Protocol on Ireland/Northern Ireland relating to goods and customs'

      MERGE (wf:Agreement {code: 'WINDSOR_FRAMEWORK'})
        ON CREATE SET wf.name = 'Windsor Framework',
                      wf.kind = 'implementing_framework',
                      wf.description = 'Framework adjusting implementation of the NI Protocol'
    `
    );
    console.log('   ✅ Created: CTA, NI_PROTOCOL, WINDSOR_FRAMEWORK');

    // 4. Link Windsor Framework to NI Protocol
    console.log('\n🔗 Linking Windsor Framework...');
    await executeCypher(
      driver,
      `
      MATCH (niProt:Agreement {code: 'NI_PROTOCOL'})
      MATCH (wf:Agreement {code: 'WINDSOR_FRAMEWORK'})
      MERGE (niProt)-[:MODIFIED_BY]->(wf)
    `
    );

    // 5. Create parties to CTA
    console.log('\n🤝 Creating CTA parties...');
    await executeCypher(
      driver,
      `
      MATCH (ie:Jurisdiction {code: 'IE'})
      MATCH (uk:Jurisdiction {code: 'UK'})
      MATCH (im:Jurisdiction {code: 'IM'})
      MATCH (cta:Agreement {code: 'CTA'})

      MERGE (ie)-[:PARTY_TO]->(cta)
      MERGE (uk)-[:PARTY_TO]->(cta)
      MERGE (im)-[:PARTY_TO]->(cta)
    `
    );
    console.log('   ✅ Linked: IE, UK, IM → CTA');

    // 6. Create Regimes
    console.log('\n⚖️  Creating regimes...');
    await executeCypher(
      driver,
      `
      MERGE (ctaReg:Regime {code: 'CTA_MOBILITY_RIGHTS'})
        ON CREATE SET ctaReg.name = 'CTA Mobility & Residence Rights',
                      ctaReg.domain = 'mobility',
                      ctaReg.scope = 'persons'

      MERGE (niGoods:Regime {code: 'NI_EU_GOODS_REGIME'})
        ON CREATE SET niGoods.name = 'NI EU-Linked Goods Regime',
                      niGoods.domain = 'goods',
                      niGoods.scope = 'trade_customs_vat'
    `
    );
    console.log('   ✅ Created: CTA_MOBILITY_RIGHTS, NI_EU_GOODS_REGIME');

    // 7. Link regimes to agreements
    console.log('\n🔗 Linking regimes to agreements...');
    await executeCypher(
      driver,
      `
      MATCH (cta:Agreement {code: 'CTA'})
      MATCH (ctaReg:Regime {code: 'CTA_MOBILITY_RIGHTS'})
      MERGE (cta)-[:ESTABLISHES_REGIME]->(ctaReg)

      MATCH (niProt:Agreement {code: 'NI_PROTOCOL'})
      MATCH (niGoods:Regime {code: 'NI_EU_GOODS_REGIME'})
      MATCH (wf:Agreement {code: 'WINDSOR_FRAMEWORK'})
      MATCH (eu:Jurisdiction {code: 'EU'})

      MERGE (niProt)-[:ESTABLISHES_REGIME]->(niGoods)
      MERGE (niGoods)-[:COORDINATED_WITH]->(eu)
      MERGE (niGoods)-[:IMPLEMENTED_VIA]->(wf)
    `
    );

    // 8. Attach regimes to jurisdictions/regions
    console.log('\n🔗 Attaching regimes to jurisdictions...');
    await executeCypher(
      driver,
      `
      MATCH (ie:Jurisdiction {code: 'IE'})
      MATCH (uk:Jurisdiction {code: 'UK'})
      MATCH (im:Jurisdiction {code: 'IM'})
      MATCH (ni:Region {code: 'NI'})
      MATCH (ctaReg:Regime {code: 'CTA_MOBILITY_RIGHTS'})
      MATCH (niGoods:Regime {code: 'NI_EU_GOODS_REGIME'})

      MERGE (ie)-[:SUBJECT_TO_REGIME]->(ctaReg)
      MERGE (uk)-[:SUBJECT_TO_REGIME]->(ctaReg)
      MERGE (im)-[:SUBJECT_TO_REGIME]->(ctaReg)
      MERGE (ni)-[:SUBJECT_TO_REGIME]->(niGoods)
    `
    );

    // 9. Create example benefits/rules
    console.log('\n💼 Creating example benefits and rules...');
    await executeCypher(
      driver,
      `
      MERGE (ctaWork:Benefit {code: 'CTA_RIGHT_TO_LIVE_AND_WORK'})
        ON CREATE SET ctaWork.name = 'Right to live and work across the CTA',
                      ctaWork.kind = 'mobility_benefit'

      MATCH (ctaWork:Benefit {code: 'CTA_RIGHT_TO_LIVE_AND_WORK'})
      MATCH (ctaReg:Regime {code: 'CTA_MOBILITY_RIGHTS'})
      MATCH (ie:Jurisdiction {code: 'IE'})
      MATCH (uk:Jurisdiction {code: 'UK'})
      MATCH (im:Jurisdiction {code: 'IM'})

      MERGE (ctaWork)-[:AVAILABLE_VIA_REGIME]->(ctaReg)
      MERGE (ctaWork)-[:IN_JURISDICTION]->(ie)
      MERGE (ctaWork)-[:IN_JURISDICTION]->(uk)
      MERGE (ctaWork)-[:IN_JURISDICTION]->(im)
    `
    );

    await executeCypher(
      driver,
      `
      MERGE (ssCoord:Rule {code: 'IE_UK_SOCIAL_SECURITY_COORDINATION'})
        ON CREATE SET ssCoord.name = 'IE-UK Social Security Coordination (CTA context)',
                      ssCoord.domain = 'social_security',
                      ssCoord.description = 'High-level coordination of contributions and benefits between IE and UK under CTA-linked arrangements and relevant bilateral agreements'

      MATCH (ssCoord:Rule {code: 'IE_UK_SOCIAL_SECURITY_COORDINATION'})
      MATCH (ie:Jurisdiction {code: 'IE'})
      MATCH (uk:Jurisdiction {code: 'UK'})
      MATCH (cta:Agreement {code: 'CTA'})

      MERGE (ssCoord)-[:APPLIES_BETWEEN]->(ie)
      MERGE (ssCoord)-[:APPLIES_BETWEEN]->(uk)
      MERGE (ssCoord)-[:RELATED_TO_AGREEMENT]->(cta)
    `
    );
    console.log('   ✅ Created: CTA_RIGHT_TO_LIVE_AND_WORK, IE_UK_SOCIAL_SECURITY_COORDINATION');

    // 10. Create timeline node for Brexit
    console.log('\n⏰ Creating timeline node...');
    await executeCypher(
      driver,
      `
      MERGE (brexit:Timeline {code: 'BREXIT_DATE'})
        ON CREATE SET brexit.label = 'Brexit Date',
                      brexit.effectiveDate = date('2020-01-31')

      MATCH (brexit:Timeline {code: 'BREXIT_DATE'})
      MATCH (niProt:Agreement {code: 'NI_PROTOCOL'})
      MERGE (niProt)-[:EFFECTIVE_FROM]->(brexit)
    `
    );
    console.log('   ✅ Created: BREXIT_DATE timeline');

    // Count nodes and relationships
    const session = driver.session();
    try {
      const nodeResult = await session.run('MATCH (n) RETURN count(n) as count');
      const nodeCount = nodeResult.records[0].get('count').toNumber();

      const edgeResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
      const edgeCount = edgeResult.records[0].get('count').toNumber();

      console.log('\n✅ Special jurisdictions seeding complete!');
      console.log(`📊 Total nodes: ${nodeCount}, Total relationships: ${edgeCount}`);

      console.log('\n📋 Node Summary:');
      const summaryResult = await session.run(
        'MATCH (n) RETURN labels(n)[0] as type, count(n) as count ORDER BY count DESC'
      );
      for (const record of summaryResult.records) {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        console.log(`   - ${type}: ${count}`);
      }

      // Show specific nodes created
      console.log('\n🔍 Special Jurisdiction Nodes Created:');
      const jurisdictionsResult = await session.run(
        'MATCH (j:Jurisdiction) RETURN j.code as code, j.name as name ORDER BY code'
      );
      console.log('   Jurisdictions:');
      for (const record of jurisdictionsResult.records) {
        console.log(`      • ${record.get('code')}: ${record.get('name')}`);
      }

      const regionsResult = await session.run(
        'MATCH (r:Region) RETURN r.code as code, r.name as name ORDER BY code'
      );
      if (regionsResult.records.length > 0) {
        console.log('   Regions:');
        for (const record of regionsResult.records) {
          console.log(`      • ${record.get('code')}: ${record.get('name')}`);
        }
      }

      const agreementsResult = await session.run(
        'MATCH (a:Agreement) RETURN a.code as code, a.name as name ORDER BY code'
      );
      if (agreementsResult.records.length > 0) {
        console.log('   Agreements:');
        for (const record of agreementsResult.records) {
          console.log(`      • ${record.get('code')}: ${record.get('name')}`);
        }
      }

      const regimesResult = await session.run(
        'MATCH (r:Regime) RETURN r.code as code, r.name as name ORDER BY code'
      );
      if (regimesResult.records.length > 0) {
        console.log('   Regimes:');
        for (const record of regimesResult.records) {
          console.log(`      • ${record.get('code')}: ${record.get('name')}`);
        }
      }
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('❌ Error seeding special jurisdictions:', error);
    throw error;
  } finally {
    await driver.close();
  }
}

// Run the seeding
seedSpecialJurisdictions().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
