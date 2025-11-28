#!/usr/bin/env node
/**
 * Special Jurisdictions Seeding Script
 *
 * Seeds Memgraph with IE/UK/NI/IM/EU jurisdictions, CTA framework, and NI goods regime.
 * Implements the modelling documented in docs/graph/special_jurisdictions_modelling_v_0_1.md
 *
 * All operations use GraphWriteService to enforce ingress guard aspects.
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
import {
  createGraphWriteService,
  type GraphWriteService,
} from '../packages/reg-intel-graph/src/index.js';

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
    auth = undefined;
  }

  return neo4j.driver(MEMGRAPH_URI, auth);
}

/**
 * Seed the graph with special jurisdiction data using GraphWriteService
 */
async function seedSpecialJurisdictions() {
  console.log('🌱 Starting special jurisdictions seeding...');
  console.log(`📍 Connecting to: ${MEMGRAPH_URI}`);

  const driver = createDriver();

  try {
    // Test connection
    await driver.verifyConnectivity();
    console.log('✅ Connected to Memgraph');

    // Create GraphWriteService
    const writeService: GraphWriteService = createGraphWriteService({
      driver,
      defaultSource: 'ingestion',
      tenantId: 'system',
    });

    // 1. Create Jurisdictions
    console.log('\n🌍 Creating jurisdictions...');

    await writeService.upsertJurisdiction({
      id: 'IE',
      name: 'Ireland',
      type: 'COUNTRY',
      code: 'IE',
    });

    await writeService.upsertJurisdiction({
      id: 'UK',
      name: 'United Kingdom',
      type: 'COUNTRY',
      code: 'UK',
    });

    await writeService.upsertJurisdiction({
      id: 'IM',
      name: 'Isle of Man',
      type: 'CROWN_DEPENDENCY',
      code: 'IM',
    });

    await writeService.upsertJurisdiction({
      id: 'EU',
      name: 'European Union',
      type: 'SUPRANATIONAL',
      code: 'EU',
    });

    console.log('   ✅ Created: IE, UK, IM, EU');

    // 2. Create Special Region: Northern Ireland
    console.log('\n📍 Creating Northern Ireland region...');

    await writeService.upsertRegion({
      id: 'NI',
      name: 'Northern Ireland',
      type: 'special_trade_region',
      parentJurisdictionId: 'UK',
    });

    console.log('   ✅ Created: NI (part of UK)');

    // 3. Create Agreements
    console.log('\n📜 Creating agreements...');

    await writeService.upsertAgreement({
      id: 'CTA',
      name: 'Common Travel Area',
      type: 'mobility_cooperation',
      description: 'Common Travel Area between Ireland, the UK, Isle of Man, and Channel Islands',
    });

    await writeService.upsertAgreement({
      id: 'NI_PROTOCOL',
      name: 'Ireland/Northern Ireland Protocol',
      type: 'protocol',
      description: 'Protocol on Ireland/Northern Ireland relating to goods and customs',
    });

    await writeService.upsertAgreement({
      id: 'WINDSOR_FRAMEWORK',
      name: 'Windsor Framework',
      type: 'implementing_framework',
      description: 'Framework adjusting implementation of the NI Protocol',
    });

    console.log('   ✅ Created: CTA, NI_PROTOCOL, WINDSOR_FRAMEWORK');

    // 4. Link Windsor Framework to NI Protocol
    console.log('\n🔗 Linking Windsor Framework...');

    await writeService.createRelationship({
      fromId: 'NI_PROTOCOL',
      fromLabel: 'Agreement',
      toId: 'WINDSOR_FRAMEWORK',
      toLabel: 'Agreement',
      relType: 'MODIFIED_BY',
    });

    // 5. Create parties to CTA
    console.log('\n🤝 Creating CTA parties...');

    await writeService.createRelationship({
      fromId: 'IE',
      fromLabel: 'Jurisdiction',
      toId: 'CTA',
      toLabel: 'Agreement',
      relType: 'PARTY_TO',
    });

    await writeService.createRelationship({
      fromId: 'UK',
      fromLabel: 'Jurisdiction',
      toId: 'CTA',
      toLabel: 'Agreement',
      relType: 'PARTY_TO',
    });

    await writeService.createRelationship({
      fromId: 'IM',
      fromLabel: 'Jurisdiction',
      toId: 'CTA',
      toLabel: 'Agreement',
      relType: 'PARTY_TO',
    });

    console.log('   ✅ Linked: IE, UK, IM → CTA');

    // 6. Create Regimes
    console.log('\n⚖️  Creating regimes...');

    await writeService.upsertRegime({
      id: 'CTA_MOBILITY_RIGHTS',
      name: 'CTA Mobility & Residence Rights',
      category: 'mobility',
      description: 'Rights to live, work and access services across the CTA',
    });

    await writeService.upsertRegime({
      id: 'NI_EU_GOODS_REGIME',
      name: 'NI EU-Linked Goods Regime',
      category: 'trade',
      description: 'Special goods regime for Northern Ireland under the NI Protocol/Windsor Framework',
    });

    console.log('   ✅ Created: CTA_MOBILITY_RIGHTS, NI_EU_GOODS_REGIME');

    // 7. Link regimes to agreements
    console.log('\n🔗 Linking regimes to agreements...');

    await writeService.createRelationship({
      fromId: 'CTA',
      fromLabel: 'Agreement',
      toId: 'CTA_MOBILITY_RIGHTS',
      toLabel: 'Regime',
      relType: 'ESTABLISHES_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'NI_PROTOCOL',
      fromLabel: 'Agreement',
      toId: 'NI_EU_GOODS_REGIME',
      toLabel: 'Regime',
      relType: 'ESTABLISHES_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'NI_EU_GOODS_REGIME',
      fromLabel: 'Regime',
      toId: 'EU',
      toLabel: 'Jurisdiction',
      relType: 'COORDINATED_WITH',
    });

    await writeService.createRelationship({
      fromId: 'NI_EU_GOODS_REGIME',
      fromLabel: 'Regime',
      toId: 'WINDSOR_FRAMEWORK',
      toLabel: 'Agreement',
      relType: 'IMPLEMENTED_VIA',
    });

    // 8. Attach regimes to jurisdictions/regions
    console.log('\n🔗 Attaching regimes to jurisdictions...');

    await writeService.createRelationship({
      fromId: 'IE',
      fromLabel: 'Jurisdiction',
      toId: 'CTA_MOBILITY_RIGHTS',
      toLabel: 'Regime',
      relType: 'SUBJECT_TO_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'UK',
      fromLabel: 'Jurisdiction',
      toId: 'CTA_MOBILITY_RIGHTS',
      toLabel: 'Regime',
      relType: 'SUBJECT_TO_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'IM',
      fromLabel: 'Jurisdiction',
      toId: 'CTA_MOBILITY_RIGHTS',
      toLabel: 'Regime',
      relType: 'SUBJECT_TO_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'NI',
      fromLabel: 'Region',
      toId: 'NI_EU_GOODS_REGIME',
      toLabel: 'Regime',
      relType: 'SUBJECT_TO_REGIME',
    });

    // 9. Create example benefit
    console.log('\n💼 Creating example CTA benefit...');

    await writeService.upsertBenefit({
      id: 'CTA_RIGHT_TO_LIVE_AND_WORK',
      name: 'Right to live and work across the CTA',
      category: 'mobility',
      description: 'Citizens of CTA countries can live and work in any CTA jurisdiction',
      jurisdictionId: 'IE',
    });

    // Link benefit to regime and jurisdictions
    await writeService.createRelationship({
      fromId: 'CTA_RIGHT_TO_LIVE_AND_WORK',
      fromLabel: 'Benefit',
      toId: 'CTA_MOBILITY_RIGHTS',
      toLabel: 'Regime',
      relType: 'AVAILABLE_VIA_REGIME',
    });

    await writeService.createRelationship({
      fromId: 'CTA_RIGHT_TO_LIVE_AND_WORK',
      fromLabel: 'Benefit',
      toId: 'UK',
      toLabel: 'Jurisdiction',
      relType: 'IN_JURISDICTION',
    });

    await writeService.createRelationship({
      fromId: 'CTA_RIGHT_TO_LIVE_AND_WORK',
      fromLabel: 'Benefit',
      toId: 'IM',
      toLabel: 'Jurisdiction',
      relType: 'IN_JURISDICTION',
    });

    console.log('\n✅ Special jurisdictions seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Jurisdictions: 4 (IE, UK, IM, EU)');
    console.log('   - Regions: 1 (NI)');
    console.log('   - Agreements: 3 (CTA, NI_PROTOCOL, WINDSOR_FRAMEWORK)');
    console.log('   - Regimes: 2 (CTA_MOBILITY_RIGHTS, NI_EU_GOODS_REGIME)');
    console.log('   - Benefits: 1 (CTA mobility benefit)');
    console.log('   - Relationships: ~15');
    console.log('\n✨ All writes enforced via Graph Ingress Guard ✨');
  } catch (error) {
    console.error('❌ Error seeding special jurisdictions:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await driver.close();
    console.log('👋 Disconnected from Memgraph');
  }
}

// Run the seeding
seedSpecialJurisdictions().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
