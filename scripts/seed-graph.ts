#!/usr/bin/env node
/**
 * Graph Seeding Script for Regulatory Intelligence Copilot
 *
 * Seeds Memgraph with minimal Ireland regulatory data for testing and development.
 * All operations use MERGE for idempotence - safe to run multiple times.
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
async function executeCypher(driver: Driver, query: string, params?: Record<string, unknown>): Promise<void> {
  const session = driver.session();
  try {
    await session.run(query, params || {});
  } finally {
    await session.close();
  }
}

/**
 * Seed the graph with regulatory data
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
    await executeCypher(driver, 'MATCH (n) DETACH DELETE n');

    // Create Jurisdictions
    console.log('🌍 Creating jurisdictions...');
    await executeCypher(driver, `
      MERGE (ie:Jurisdiction {id: 'IE'})
      SET ie.name = 'Ireland',
          ie.type = 'COUNTRY',
          ie.notes = 'Republic of Ireland'

      MERGE (eu:Jurisdiction {id: 'EU'})
      SET eu.name = 'European Union',
          eu.type = 'SUPRANATIONAL',
          eu.notes = 'European Union supranational entity'

      MERGE (mt:Jurisdiction {id: 'MT'})
      SET mt.name = 'Malta',
          mt.type = 'COUNTRY',
          mt.notes = 'Republic of Malta'
    `);

    // Create Profile Tags
    console.log('👤 Creating profile tags...');
    await executeCypher(driver, `
      MERGE (p1:ProfileTag {id: 'single-director-ie'})
      SET p1.label = 'Single Director (Ireland)',
          p1.description = 'Single director of an Irish limited company, typically Class S PRSI contributor'

      MERGE (p2:ProfileTag {id: 'self-employed-ie'})
      SET p2.label = 'Self-Employed (Ireland)',
          p2.description = 'Self-employed individual in Ireland, Class S PRSI contributor'

      MERGE (p3:ProfileTag {id: 'paye-employee-ie'})
      SET p3.label = 'PAYE Employee (Ireland)',
          p3.description = 'PAYE employee in Ireland, Class A PRSI contributor'
    `);

    // Create Timelines
    console.log('⏰ Creating timeline nodes...');
    await executeCypher(driver, `
      MERGE (t1:Timeline {id: 'lookback-2-years'})
      SET t1.label = '2-Year Lookback',
          t1.window_years = 2,
          t1.notes = 'Common lookback period for PRSI contribution requirements'

      MERGE (t2:Timeline {id: 'lookback-12-months'})
      SET t2.label = '12-Month Lookback',
          t2.window_months = 12,
          t2.notes = 'One-year lookback for recent contributions'

      MERGE (t3:Timeline {id: 'lookback-39-weeks'})
      SET t3.label = '39-Week Lookback',
          t3.window_days = 273,
          t3.notes = 'Specific lookback period for Jobseeker\'s Benefit'

      MERGE (t4:Timeline {id: 'lock-in-4-years'})
      SET t4.label = '4-Year Lock-in',
          t4.window_years = 4,
          t4.notes = 'Common lock-in period for certain tax reliefs'
    `);

    // Create Benefits
    console.log('💰 Creating benefit nodes...');
    await executeCypher(driver, `
      MERGE (b1:Benefit {id: 'jobseekers-benefit-self-employed'})
      SET b1.label = 'Jobseeker\'s Benefit (Self-Employed)',
          b1.name = 'Jobseeker\'s Benefit (Self-Employed)',
          b1.short_summary = 'Weekly payment for self-employed people who lose their job',
          b1.description = 'A payment for self-employed people (Class S PRSI contributors) who have lost their job. Requires PRSI contributions in the 2-4 years before claiming.',
          b1.amount = 'Up to €220 per week (2024 rates)',
          b1.duration = 'Up to 9 months (234 days)'

      MERGE (b2:Benefit {id: 'illness-benefit-class-s'})
      SET b2.label = 'Illness Benefit (Class S)',
          b2.name = 'Illness Benefit for Class S Contributors',
          b2.short_summary = 'Payment for self-employed people unable to work due to illness',
          b2.description = 'Weekly payment for self-employed people (Class S PRSI) who cannot work due to illness. Requires minimum PRSI contributions.',
          b2.amount = 'Up to €220 per week',
          b2.duration = 'Up to 2 years'

      MERGE (b3:Benefit {id: 'treatment-benefit'})
      SET b3.label = 'Treatment Benefit',
          b3.name = 'Treatment Benefit',
          b3.short_summary = 'Dental and optical benefits for PRSI contributors',
          b3.description = 'Provides dental and optical benefits. Class S contributors are eligible after 260 weeks of contributions.',
          b3.amount = 'Varies by treatment',
          b3.duration = 'Ongoing while eligible'
    `);

    // Create Conditions
    console.log('✅ Creating condition nodes...');
    await executeCypher(driver, `
      MERGE (c1:Condition {id: 'prsi-class-s-required'})
      SET c1.label = 'PRSI Class S Required',
          c1.description = 'Must be paying PRSI Class S contributions (self-employed)',
          c1.evaluation_type = 'PROFILE_CHECK'

      MERGE (c2:Condition {id: 'min-contributions-104-weeks'})
      SET c2.label = 'Minimum 104 Weeks Contributions',
          c2.description = 'Must have at least 104 weeks (2 years) of PRSI contributions',
          c2.evaluation_type = 'LOOKBACK_COUNT'

      MERGE (c3:Condition {id: 'min-contributions-39-weeks'})
      SET c3.label = 'Minimum 39 Weeks Contributions',
          c3.description = 'Must have at least 39 weeks of PRSI contributions in relevant period',
          c3.evaluation_type = 'LOOKBACK_COUNT'

      MERGE (c4:Condition {id: 'ceased-self-employment'})
      SET c4.label = 'Ceased Self-Employment',
          c4.description = 'Must have ceased self-employment or business',
          c4.evaluation_type = 'USER_DECLARATION'
    `);

    // Create Sections (Statutory References)
    console.log('📜 Creating statutory sections...');
    await executeCypher(driver, `
      MERGE (s1:Section {id: 'sw-act-2005-s62'})
      SET s1.label = 'Social Welfare Consolidation Act 2005, Section 62',
          s1.title = 'Jobseeker\'s Benefit',
          s1.statutory_ref = 'Social Welfare Consolidation Act 2005, s.62',
          s1.url = 'https://www.irishstatutebook.ie/eli/2005/act/26/section/62/enacted/en/html'

      MERGE (s2:Section {id: 'sw-act-2005-s41'})
      SET s2.label = 'Social Welfare Consolidation Act 2005, Section 41',
          s2.title = 'Illness Benefit',
          s2.statutory_ref = 'Social Welfare Consolidation Act 2005, s.41',
          s2.url = 'https://www.irishstatutebook.ie/eli/2005/act/26/section/41/enacted/en/html'
    `);

    // Create Relationships: Benefits -> Jurisdiction
    console.log('🔗 Creating benefit-jurisdiction relationships...');
    await executeCypher(driver, `
      MATCH (b:Benefit)
      MATCH (ie:Jurisdiction {id: 'IE'})
      MERGE (b)-[:IN_JURISDICTION]->(ie)
    `);

    // Create Relationships: Benefits -> Profile Tags
    console.log('🔗 Creating benefit-profile relationships...');
    await executeCypher(driver, `
      MATCH (b1:Benefit {id: 'jobseekers-benefit-self-employed'})
      MATCH (p1:ProfileTag {id: 'single-director-ie'})
      MATCH (p2:ProfileTag {id: 'self-employed-ie'})
      MERGE (b1)-[:APPLIES_TO]->(p1)
      MERGE (b1)-[:APPLIES_TO]->(p2)

      MATCH (b2:Benefit {id: 'illness-benefit-class-s'})
      MERGE (b2)-[:APPLIES_TO]->(p1)
      MERGE (b2)-[:APPLIES_TO]->(p2)

      MATCH (b3:Benefit {id: 'treatment-benefit'})
      MERGE (b3)-[:APPLIES_TO]->(p1)
      MERGE (b3)-[:APPLIES_TO]->(p2)
    `);

    // Create Relationships: Benefits -> Conditions
    console.log('🔗 Creating benefit-condition relationships...');
    await executeCypher(driver, `
      MATCH (b1:Benefit {id: 'jobseekers-benefit-self-employed'})
      MATCH (c1:Condition {id: 'prsi-class-s-required'})
      MATCH (c2:Condition {id: 'min-contributions-104-weeks'})
      MATCH (c3:Condition {id: 'min-contributions-39-weeks'})
      MATCH (c4:Condition {id: 'ceased-self-employment'})
      MERGE (b1)-[:REQUIRES]->(c1)
      MERGE (b1)-[:REQUIRES]->(c2)
      MERGE (b1)-[:REQUIRES]->(c3)
      MERGE (b1)-[:REQUIRES]->(c4)

      MATCH (b2:Benefit {id: 'illness-benefit-class-s'})
      MERGE (b2)-[:REQUIRES]->(c1)
      MERGE (b2)-[:REQUIRES]->(c2)
    `);

    // Create Relationships: Benefits -> Timelines
    console.log('🔗 Creating benefit-timeline relationships...');
    await executeCypher(driver, `
      MATCH (b1:Benefit {id: 'jobseekers-benefit-self-employed'})
      MATCH (t1:Timeline {id: 'lookback-2-years'})
      MATCH (t3:Timeline {id: 'lookback-39-weeks'})
      MERGE (b1)-[:LOOKBACK_WINDOW]->(t1)
      MERGE (b1)-[:LOOKBACK_WINDOW]->(t3)

      MATCH (b2:Benefit {id: 'illness-benefit-class-s'})
      MERGE (b2)-[:LOOKBACK_WINDOW]->(t1)
    `);

    // Create Relationships: Benefits -> Sections
    console.log('🔗 Creating benefit-section relationships...');
    await executeCypher(driver, `
      MATCH (b1:Benefit {id: 'jobseekers-benefit-self-employed'})
      MATCH (s1:Section {id: 'sw-act-2005-s62'})
      MERGE (b1)-[:DEFINED_BY]->(s1)

      MATCH (b2:Benefit {id: 'illness-benefit-class-s'})
      MATCH (s2:Section {id: 'sw-act-2005-s41'})
      MERGE (b2)-[:DEFINED_BY]->(s2)
    `);

    // Count nodes and relationships
    const session = driver.session();
    try {
      const nodeResult = await session.run('MATCH (n) RETURN count(n) as count');
      const nodeCount = nodeResult.records[0].get('count').toNumber();

      const edgeResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
      const edgeCount = edgeResult.records[0].get('count').toNumber();

      console.log('\n✅ Graph seeding complete!');
      console.log(`📊 Created ${nodeCount} nodes and ${edgeCount} relationships`);
      console.log('\n📋 Node Summary:');
      const summaryResult = await session.run(
        'MATCH (n) RETURN labels(n)[0] as type, count(n) as count ORDER BY count DESC'
      );
      for (const record of summaryResult.records) {
        const type = record.get('type');
        const count = record.get('count').toNumber();
        console.log(`   - ${type}: ${count}`);
      }
    } finally {
      await session.close();
    }

  } catch (error) {
    console.error('❌ Error seeding graph:', error);
    throw error;
  } finally {
    await driver.close();
  }
}

// Run the seeding
seedGraph().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
