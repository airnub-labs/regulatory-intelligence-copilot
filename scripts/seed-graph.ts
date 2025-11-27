#!/usr/bin/env node
/**
 * Graph Seeding Script for Regulatory Intelligence Copilot
 *
 * Seeds Memgraph with minimal Ireland regulatory data for testing and development.
 * All operations use GraphWriteService to enforce ingress guard aspects.
 *
 * Usage:
 *   tsx scripts/seed-graph.ts
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
 * Clear existing data (for development only)
 */
async function clearGraph(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.run('MATCH (n) DETACH DELETE n');
  } finally {
    await session.close();
  }
}

/**
 * Seed the graph with regulatory data using GraphWriteService
 */
async function seedGraph() {
  console.log('🌱 Starting graph seeding...');
  console.log(`📍 Connecting to: ${MEMGRAPH_URI}`);

  const driver = createDriver();

  try {
    // Test connection
    await driver.verifyConnectivity();
    console.log('✅ Connected to Memgraph');

    // Clear existing data (optional - comment out for production)
    console.log('🧹 Clearing existing data...');
    await clearGraph(driver);

    // Create GraphWriteService
    const writeService: GraphWriteService = createGraphWriteService({
      driver,
      defaultSource: 'ingestion',
      tenantId: 'system', // System-level seeding, not tenant-specific
    });

    // Create Jurisdictions
    console.log('🌍 Creating jurisdictions...');
    await writeService.upsertJurisdiction({
      id: 'IE',
      name: 'Ireland',
      type: 'COUNTRY',
      notes: 'Republic of Ireland',
    });

    await writeService.upsertJurisdiction({
      id: 'EU',
      name: 'European Union',
      type: 'SUPRANATIONAL',
      notes: 'European Union supranational entity',
    });

    await writeService.upsertJurisdiction({
      id: 'MT',
      name: 'Malta',
      type: 'COUNTRY',
      notes: 'Republic of Malta',
    });

    console.log('   ✅ Created: IE, EU, MT');

    // Create Statutes
    console.log('📜 Creating statutes...');
    await writeService.upsertStatute({
      id: 'IE_SW_CONS_ACT_2005',
      name: 'Social Welfare Consolidation Act 2005',
      citation: 'SWCA 2005',
      type: 'PRIMARY',
      jurisdictionId: 'IE',
      source_url: 'https://www.irishstatutebook.ie/eli/2005/act/26/enacted/en/html',
    });

    await writeService.upsertStatute({
      id: 'IE_TCA_1997',
      name: 'Taxes Consolidation Act 1997',
      citation: 'TCA 1997',
      type: 'PRIMARY',
      jurisdictionId: 'IE',
      source_url: 'https://www.irishstatutebook.ie/eli/1997/act/39/enacted/en/html',
    });

    console.log('   ✅ Created: SWCA 2005, TCA 1997');

    // Create Sections
    console.log('📄 Creating sections...');
    await writeService.upsertSection({
      id: 'IE_SWCA_2005_S27',
      label: 'Section 27',
      title: "Jobseeker's Benefit (Self-Employed)",
      text_excerpt: 'Provides for jobseeker\'s benefit for self-employed contributors',
      section_number: '27',
      statuteId: 'IE_SW_CONS_ACT_2005',
      jurisdictionId: 'IE',
    });

    await writeService.upsertSection({
      id: 'IE_TCA_1997_S766',
      label: 'Section 766',
      title: 'R&D Tax Credit',
      text_excerpt: 'Provides for relief for expenditure on research and development',
      section_number: '766',
      statuteId: 'IE_TCA_1997',
      jurisdictionId: 'IE',
    });

    console.log('   ✅ Created: SWCA S27, TCA S766');

    // Create Benefits
    console.log('💰 Creating benefits...');
    await writeService.upsertBenefit({
      id: 'IE_BENEFIT_JOBSEEKERS_SE',
      name: "Jobseeker's Benefit (Self-Employed)",
      category: 'UNEMPLOYMENT',
      short_summary: 'Short-term payment for self-employed who lose employment',
      description:
        'A weekly payment for self-employed people who have lost work. Requires Class S PRSI contributions.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertBenefit({
      id: 'IE_BENEFIT_ILLNESS',
      name: 'Illness Benefit',
      category: 'ILLNESS',
      short_summary: 'Short-term payment when unable to work due to illness',
      description: 'Weekly payment if unable to work due to illness. Available to Class S contributors.',
      jurisdictionId: 'IE',
    });

    await writeService.upsertBenefit({
      id: 'IE_BENEFIT_STATE_PENSION_CONTRIBUTORY',
      name: 'State Pension (Contributory)',
      category: 'PENSION',
      short_summary: 'Long-term pension based on PRSI contributions',
      description:
        'State pension paid at age 66 based on your social insurance contributions over your working life.',
      jurisdictionId: 'IE',
    });

    console.log('   ✅ Created: Jobseeker\'s Benefit, Illness Benefit, State Pension');

    // Create Reliefs
    console.log('💡 Creating reliefs...');
    await writeService.upsertRelief({
      id: 'IE_RELIEF_RND_CREDIT',
      name: 'R&D Tax Credit',
      tax_type: 'CORPORATION_TAX',
      short_summary: 'Tax credit for qualifying R&D expenditure',
      description:
        'Corporation tax credit of 25% of qualifying R&D expenditure, with various conditions and limits.',
      jurisdictionId: 'IE',
    });

    console.log('   ✅ Created: R&D Tax Credit');

    // Create Timelines
    console.log('⏱️  Creating timeline constraints...');
    await writeService.upsertTimeline({
      id: 'IE_PRSI_12_MONTH_LOOKBACK',
      label: '12-month PRSI contribution lookback',
      window_months: 12,
      kind: 'LOOKBACK',
      jurisdictionCode: 'IE',
      description: 'Lookback period for PRSI contribution requirements on various benefits',
    });

    await writeService.upsertTimeline({
      id: 'IE_RND_4_YEAR_PERIOD',
      label: 'R&D 4-year accounting period',
      window_years: 4,
      kind: 'EFFECTIVE_WINDOW',
      jurisdictionCode: 'IE',
      description: 'R&D tax credit can be claimed over a 4-year accounting period',
    });

    console.log('   ✅ Created: PRSI lookback, R&D period');

    // Create relationships
    console.log('🔗 Creating relationships...');

    // Link benefits to sections
    await writeService.createRelationship({
      fromId: 'IE_BENEFIT_JOBSEEKERS_SE',
      fromLabel: 'Benefit',
      toId: 'IE_SWCA_2005_S27',
      toLabel: 'Section',
      relType: 'CITES',
    });

    // Link relief to section
    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RND_CREDIT',
      fromLabel: 'Relief',
      toId: 'IE_TCA_1997_S766',
      toLabel: 'Section',
      relType: 'CITES',
    });

    // Link benefits to timeline constraints
    await writeService.createRelationship({
      fromId: 'IE_BENEFIT_JOBSEEKERS_SE',
      fromLabel: 'Benefit',
      toId: 'IE_PRSI_12_MONTH_LOOKBACK',
      toLabel: 'Timeline',
      relType: 'LOOKBACK_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_BENEFIT_ILLNESS',
      fromLabel: 'Benefit',
      toId: 'IE_PRSI_12_MONTH_LOOKBACK',
      toLabel: 'Timeline',
      relType: 'LOOKBACK_WINDOW',
    });

    await writeService.createRelationship({
      fromId: 'IE_RELIEF_RND_CREDIT',
      fromLabel: 'Relief',
      toId: 'IE_RND_4_YEAR_PERIOD',
      toLabel: 'Timeline',
      relType: 'EFFECTIVE_WINDOW',
    });

    console.log('   ✅ Created relationships');

    console.log('\n✅ Graph seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Jurisdictions: 3 (IE, EU, MT)');
    console.log('   - Statutes: 2');
    console.log('   - Sections: 2');
    console.log('   - Benefits: 3');
    console.log('   - Reliefs: 1');
    console.log('   - Timeline constraints: 2');
    console.log('   - Relationships: ~5');
    console.log('\n✨ All writes enforced via Graph Ingress Guard ✨');
  } catch (error) {
    console.error('❌ Error seeding graph:', error);
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
seedGraph().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
