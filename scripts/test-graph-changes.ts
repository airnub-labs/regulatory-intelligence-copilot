#!/usr/bin/env node
/**
 * Test Graph Changes Script
 *
 * Simulates graph changes for testing the GraphChangeDetector and SSE streaming.
 * Uses GraphWriteService for write operations to enforce ingress guard.
 * Direct queries are used only for reads and deletes (not yet in GraphWriteService API).
 *
 * Usage:
 *   tsx scripts/test-graph-changes.ts [action]
 *
 * Actions:
 *   add-node      - Add a new test node
 *   update-node   - Update an existing node
 *   remove-node   - Remove a test node
 *   add-edge      - Add a new test edge
 *   remove-edge   - Remove a test edge
 *   simulate      - Run a sequence of changes with delays
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
} from '@reg-copilot/reg-intel-graph';
import { runWithScriptObservability } from './observability.js';
import type { Logger } from 'pino';

const MEMGRAPH_URI = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
const MEMGRAPH_USERNAME = process.env.MEMGRAPH_USERNAME;
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD;

let log: (...messages: unknown[]) => void;
let logError: (...messages: unknown[]) => void;

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
 * Add a test node using GraphWriteService
 */
async function addTestNode(writeService: GraphWriteService): Promise<string> {
  const timestamp = Date.now();
  const nodeId = `TEST_BENEFIT_${timestamp}`;

  log(`➕ Adding test node: ${nodeId}`);

  // Create the benefit using GraphWriteService
  await writeService.upsertBenefit({
    id: nodeId,
    name: `Test Benefit ${timestamp}`,
    category: 'TEST',
    short_summary: 'Test benefit for change detection',
    description: 'This is a test benefit created to verify graph change detection is working correctly.',
    jurisdictionId: 'IE',
  });

  log('✅ Test node added successfully');
  return nodeId;
}

/**
 * Update an existing test node (uses direct query for read, GraphWriteService for write)
 */
async function updateTestNode(driver: Driver, writeService: GraphWriteService): Promise<void> {
  log('🔄 Updating test node...');

  const session = driver.session();
  try {
    // Find a test node (read operation - not in GraphWriteService API yet)
    const result = await session.run(`
      MATCH (b:Benefit)
      WHERE b.id STARTS WITH 'TEST_BENEFIT_'
      RETURN b.id AS id, b.name AS name, b.category AS category,
             b.short_summary AS summary, b.description AS description
      LIMIT 1
    `);

    if (result.records.length === 0) {
      log('⚠️  No test nodes found. Run "add-node" first.');
      return;
    }

    const record = result.records[0];
    const nodeId = record.get('id');
    log(`   Updating node: ${nodeId}`);

    // Update using GraphWriteService
    await writeService.upsertBenefit({
      id: nodeId,
      name: record.get('name'),
      category: record.get('category'),
      short_summary: record.get('summary'),
      description: `Updated at ${new Date().toISOString()} - Change detection test`,
      jurisdictionId: 'IE',
    });

    log('✅ Test node updated successfully');
  } finally {
    await session.close();
  }
}

/**
 * Remove a test node (DELETE not in GraphWriteService API - uses direct query)
 *
 * NOTE: This uses direct Cypher for DELETE operations which are not yet
 * supported by GraphWriteService. In production, deletes should also go
 * through a guarded service.
 */
async function removeTestNode(driver: Driver): Promise<void> {
  log('🗑️  Removing test node...');

  const session = driver.session();
  try {
    // Find and remove a test node
    const result = await session.run(`
      MATCH (b:Benefit)
      WHERE b.id STARTS WITH 'TEST_BENEFIT_'
      WITH b LIMIT 1
      DETACH DELETE b
      RETURN count(b) AS deleted
    `);

    const deleted = result.records[0].get('deleted').toNumber();

    if (deleted === 0) {
      log('⚠️  No test nodes found to remove.');
    } else {
      log('✅ Test node removed successfully');
    }
  } finally {
    await session.close();
  }
}

/**
 * Add a test edge using GraphWriteService
 */
async function addTestEdge(driver: Driver, writeService: GraphWriteService): Promise<void> {
  log('➕ Adding test edge...');

  const session = driver.session();
  try {
    // Find two test nodes (read operation)
    const result = await session.run(`
      MATCH (b1:Benefit), (b2:Benefit)
      WHERE b1.id STARTS WITH 'TEST_BENEFIT_'
        AND b2.id STARTS WITH 'TEST_BENEFIT_'
        AND b1 <> b2
      RETURN b1.id AS id1, b2.id AS id2
      LIMIT 1
    `);

    if (result.records.length === 0) {
      log('⚠️  Need at least 2 test nodes. Creating them...');
      await addTestNode(writeService);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await addTestNode(writeService);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await addTestEdge(driver, writeService); // Retry
      return;
    }

    const id1 = result.records[0].get('id1');
    const id2 = result.records[0].get('id2');

    log(`   Creating edge: ${id1} -> ${id2}`);

    // Create relationship using GraphWriteService
    await writeService.createRelationship({
      fromId: id1,
      fromLabel: 'Benefit',
      toId: id2,
      toLabel: 'Benefit',
      relType: 'MUTUALLY_EXCLUSIVE_WITH',
    });

    log('✅ Test edge added successfully');
  } finally {
    await session.close();
  }
}

/**
 * Remove a test edge (DELETE not in GraphWriteService API - uses direct query)
 *
 * NOTE: This uses direct Cypher for DELETE operations which are not yet
 * supported by GraphWriteService.
 */
async function removeTestEdge(driver: Driver): Promise<void> {
  log('🗑️  Removing test edge...');

  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (b1:Benefit)-[r:MUTUALLY_EXCLUSIVE_WITH]->(b2:Benefit)
      WHERE b1.id STARTS WITH 'TEST_BENEFIT_'
        AND b2.id STARTS WITH 'TEST_BENEFIT_'
      WITH r LIMIT 1
      DELETE r
      RETURN count(r) AS deleted
    `);

    const deleted = result.records[0].get('deleted').toNumber();

    if (deleted === 0) {
      log('⚠️  No test edges found to remove.');
    } else {
      log('✅ Test edge removed successfully');
    }
  } finally {
    await session.close();
  }
}

/**
 * Simulate a sequence of changes with delays
 */
async function simulateChanges(
  driver: Driver,
  writeService: GraphWriteService,
): Promise<void> {
  log('🎬 Starting simulation of graph changes...\n');

  const actions = [
    { name: 'Add Node 1', fn: () => addTestNode(writeService), delay: 2000 },
    { name: 'Add Node 2', fn: () => addTestNode(writeService), delay: 3000 },
    { name: 'Add Edge', fn: () => addTestEdge(driver, writeService), delay: 3000 },
    { name: 'Update Node', fn: () => updateTestNode(driver, writeService), delay: 3000 },
    { name: 'Remove Edge', fn: () => removeTestEdge(driver), delay: 3000 },
    { name: 'Add Node 3', fn: () => addTestNode(writeService), delay: 3000 },
    { name: 'Remove Node', fn: () => removeTestNode(driver), delay: 3000 },
  ];

  for (const action of actions) {
    log(`\n[${new Date().toISOString()}] ${action.name}`);
    log('─'.repeat(50));
    await action.fn();
    log(`   ⏳ Waiting ${action.delay}ms before next action...\n`);
    await new Promise((resolve) => setTimeout(resolve, action.delay));
  }

  log('\n✅ Simulation complete!');
  log('✨ Write operations enforced via Graph Ingress Guard ✨');
  log('⚠️  DELETE operations use direct Cypher (not yet in GraphWriteService API)');
}

/**
 * Main function
 */
const action = process.argv[2] || 'simulate';

async function main(selectedAction: string, logger: Logger) {
  log = (...messages: unknown[]) => {
    const serialized = messages.map(message => String(message)).join(' ');
    logger.info({ messages }, serialized);
  };

  logError = (...messages: unknown[]) => {
    const serialized = messages.map(message => String(message)).join(' ');
    logger.error({ messages }, serialized);
  };

  log('🧪 Test Graph Changes');
  log(`📍 Connecting to: ${MEMGRAPH_URI}\n`);

  const driver = createDriver();

  try {
    await driver.verifyConnectivity();
    log('✅ Connected to Memgraph\n');

    // Create GraphWriteService
    const writeService: GraphWriteService = createGraphWriteService({
      driver,
      defaultSource: 'script',
      tenantId: 'test',
    });

    switch (selectedAction) {
      case 'add-node':
        await addTestNode(writeService);
        break;
      case 'update-node':
        await updateTestNode(driver, writeService);
        break;
      case 'remove-node':
        await removeTestNode(driver);
        break;
      case 'add-edge':
        await addTestEdge(driver, writeService);
        break;
      case 'remove-edge':
        await removeTestEdge(driver);
        break;
      case 'simulate':
        await simulateChanges(driver, writeService);
        break;
      default:
        logError(`❌ Unknown action: ${selectedAction}`);
        log('\nAvailable actions:');
        log('  - add-node');
        log('  - update-node');
        log('  - remove-node');
        log('  - add-edge');
        log('  - remove-edge');
        log('  - simulate (default)');
        throw new Error(`Unknown action: ${selectedAction}`);
    }
  } catch (error) {
    logError('❌ Error:', error);
    if (error instanceof Error) {
      logError('   Message:', error.message);
      logError('   Stack:', error.stack);
    }
    throw error;
  } finally {
    await driver.close();
  }
}

// Run
await runWithScriptObservability(
  'test-graph-changes',
  async ({ logger, withSpan }) => {
    await withSpan(
      'script.test-graph-changes',
      { 'script.name': 'test-graph-changes', action },
      () => main(action, logger)
    );
  },
  { tenantId: 'test', agentId: 'test-graph-changes' }
);
