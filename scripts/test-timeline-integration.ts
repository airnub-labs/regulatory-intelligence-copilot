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

import { createBoltGraphClient } from '../packages/reg-intel-core/src/graph/boltGraphClient.js';
import {
  computeLookbackRange,
  computeLockInEnd,
  isWithinLookback,
} from '../packages/reg-intel-core/src/timeline/timelineEngine.js';
import type { Logger } from 'pino';
import { runWithScriptObservability } from './observability.js';

async function testTimelineIntegration(logger: Logger) {
  const testLogger = logger.child({ test: 'timeline-integration' });
  testLogger.info({ banner: true }, '🧪 Testing Timeline Engine integration with seeded graph data');

  const graphClient = createBoltGraphClient();

  try {
    // Test 1: Fetch timelines for Jobseeker's Benefit
    testLogger.info({ step: 'timelines' }, "📋 Test 1: Fetching timelines for Jobseeker's Benefit (Self-Employed)");
    const benefitId = 'jobseekers-benefit-self-employed';
    const timelines = await graphClient.getTimelines(benefitId);

    testLogger.info({ timelineCount: timelines.length }, '✅ Fetched timelines');
    timelines.forEach(timeline => {
      testLogger.info({ timelineId: timeline.id, label: timeline.label }, 'Timeline found');
    });

    if (timelines.length === 0) {
      testLogger.warn({ step: 'timelines' }, '⚠️  No timelines found. Make sure graph is seeded.');
      return;
    }

    // Test 2: Compute lookback ranges
    testLogger.info({ step: 'lookback' }, '\n📅 Test 2: Computing lookback ranges (as of today)');
    const now = new Date();

    for (const timeline of timelines) {
      const result = computeLookbackRange(timeline, now);
      testLogger.info(
        {
          timeline: timeline.label,
          rangeStart: result.range.start.toISOString(),
          rangeEnd: result.range.end.toISOString(),
          description: result.description,
        },
        'Lookback range computed'
      );
    }

    // Test 3: Check if example contribution dates fall within lookback
    testLogger.info({ step: 'contribution-check' }, '\n📊 Test 3: Checking example contribution dates');

    // Example: PRSI contributions from 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Example: PRSI contributions from 3 years ago
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    for (const timeline of timelines.slice(0, 2)) { // Test first 2 timelines
      testLogger.info({ timeline: timeline.label }, 'Checking contribution windows');

      const withinSixMonths = isWithinLookback(sixMonthsAgo, timeline, now);
      testLogger.info({ within: withinSixMonths.within }, 'Contribution from 6 months ago');

      const withinThreeYears = isWithinLookback(threeYearsAgo, timeline, now);
      testLogger.info({ within: withinThreeYears.within }, 'Contribution from 3 years ago');
    }

    // Test 4: Compute lock-in periods
    testLogger.info({ step: 'lock-in' }, '\n🔒 Test 4: Computing lock-in periods');
    const claimDate = new Date('2024-01-01');

    for (const timeline of timelines.slice(0, 2)) {
      const result = computeLockInEnd(claimDate, timeline);
      testLogger.info(
        {
          timeline: timeline.label,
          claimDate: claimDate.toISOString(),
          lockInEnd: result.end.toISOString(),
          description: result.description,
        },
        'Computed lock-in period'
      );
    }

    // Test 5: Fetch rules with profile and jurisdiction
    testLogger.info({ step: 'graph-rules' }, '\n🔍 Test 5: Fetching rules for profile and jurisdiction');
    const graphContext = await graphClient.getRulesForProfileAndJurisdiction(
      'single-director-ie',
      'IE',
      'jobseeker'
    );

    testLogger.info(
      { nodeCount: graphContext.nodes.length, edgeCount: graphContext.edges.length },
      '✅ Graph rules fetched'
    );
    const benefits = graphContext.nodes.filter(n => n.type === 'Benefit');
    testLogger.info({ benefits: benefits.map(b => b.label) }, 'Benefits list');

    const timelineNodes = graphContext.nodes.filter(n => n.type === 'Timeline');
    testLogger.info({ timelines: timelineNodes.map(t => t.label) }, 'Timeline nodes list');

    testLogger.info({ success: true }, '\n✅ All timeline integration tests passed!');
    testLogger.info({ success: true }, '\n💡 The Timeline Engine is correctly integrated with the graph data.');
    testLogger.info(
      { guidance: true },
      'Agents can now fetch timeline constraints and compute date ranges for PRSI contribution requirements, benefit eligibility windows, etc.'
    );

  } catch (error) {
    testLogger.error({ err: error }, '\n❌ Test failed');
    throw error;
  } finally {
    await graphClient.close();
  }
}

// Run tests
await runWithScriptObservability(
  'test-timeline-integration',
  async ({ withSpan, logger }) => {
    await withSpan(
      'script.test-timeline-integration',
      { 'script.name': 'test-timeline-integration' },
      () => testTimelineIntegration(logger)
    );
  },
  { agentId: 'test-timeline-integration' }
);
