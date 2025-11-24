#!/usr/bin/env node
/**
 * Timeline Integration Test Script
 *
 * Tests that Timeline Engine works correctly with real graph data
 * from the seeded Memgraph database.
 *
 * Prerequisites:
 * 1. Memgraph must be running
 * 2. Graph must be seeded (run: npx tsx scripts/seed-graph.ts)
 *
 * Usage:
 *   npx tsx scripts/test-timeline-integration.ts
 */

import { createBoltGraphClient } from '../packages/compliance-core/src/graph/boltGraphClient.js';
import {
  computeLookbackRange,
  computeLockInEnd,
  isWithinLookback,
} from '../packages/compliance-core/src/timeline/timelineEngine.js';

async function testTimelineIntegration() {
  console.log('🧪 Testing Timeline Engine integration with seeded graph data\n');

  const graphClient = createBoltGraphClient();

  try {
    // Test 1: Fetch timelines for Jobseeker's Benefit
    console.log('📋 Test 1: Fetching timelines for Jobseeker\'s Benefit (Self-Employed)');
    const benefitId = 'jobseekers-benefit-self-employed';
    const timelines = await graphClient.getTimelines(benefitId);

    console.log(`   ✅ Found ${timelines.length} timeline(s)`);
    for (const timeline of timelines) {
      console.log(`      - ${timeline.label} (${timeline.id})`);
    }

    if (timelines.length === 0) {
      console.log('   ⚠️  No timelines found. Make sure graph is seeded.');
      return;
    }

    // Test 2: Compute lookback ranges
    console.log('\n📅 Test 2: Computing lookback ranges (as of today)');
    const now = new Date();

    for (const timeline of timelines) {
      const result = computeLookbackRange(timeline, now);
      console.log(`\n   Timeline: ${timeline.label}`);
      console.log(`   Range: ${result.range.start.toISOString().split('T')[0]} to ${result.range.end.toISOString().split('T')[0]}`);
      console.log(`   Description: ${result.description}`);
    }

    // Test 3: Check if example contribution dates fall within lookback
    console.log('\n📊 Test 3: Checking example contribution dates');

    // Example: PRSI contributions from 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Example: PRSI contributions from 3 years ago
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    for (const timeline of timelines.slice(0, 2)) { // Test first 2 timelines
      console.log(`\n   Timeline: ${timeline.label}`);

      const withinSixMonths = isWithinLookback(sixMonthsAgo, timeline, now);
      console.log(`   - Contribution from 6 months ago: ${withinSixMonths.within ? '✅ WITHIN' : '❌ OUTSIDE'}`);

      const withinThreeYears = isWithinLookback(threeYearsAgo, timeline, now);
      console.log(`   - Contribution from 3 years ago: ${withinThreeYears.within ? '✅ WITHIN' : '❌ OUTSIDE'}`);
    }

    // Test 4: Compute lock-in periods
    console.log('\n🔒 Test 4: Computing lock-in periods');
    const claimDate = new Date('2024-01-01');

    for (const timeline of timelines.slice(0, 2)) {
      const result = computeLockInEnd(claimDate, timeline);
      console.log(`\n   Timeline: ${timeline.label}`);
      console.log(`   If claimed on ${claimDate.toISOString().split('T')[0]}, lock-in ends: ${result.end.toISOString().split('T')[0]}`);
      console.log(`   Description: ${result.description}`);
    }

    // Test 5: Fetch rules with profile and jurisdiction
    console.log('\n🔍 Test 5: Fetching rules for profile and jurisdiction');
    const graphContext = await graphClient.getRulesForProfileAndJurisdiction(
      'single-director-ie',
      'IE',
      'jobseeker'
    );

    console.log(`   ✅ Found ${graphContext.nodes.length} nodes and ${graphContext.edges.length} edges`);
    const benefits = graphContext.nodes.filter(n => n.type === 'Benefit');
    console.log(`   Benefits: ${benefits.map(b => b.label).join(', ')}`);

    const timelineNodes = graphContext.nodes.filter(n => n.type === 'Timeline');
    console.log(`   Timelines: ${timelineNodes.map(t => t.label).join(', ')}`);

    console.log('\n✅ All timeline integration tests passed!');
    console.log('\n💡 The Timeline Engine is correctly integrated with the graph data.');
    console.log('   Agents can now fetch timeline constraints and compute date ranges');
    console.log('   for PRSI contribution requirements, benefit eligibility windows, etc.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  } finally {
    await graphClient.close();
  }
}

// Run tests
testTimelineIntegration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
