#!/usr/bin/env node
/**
 * Test Graph Changes Script
 *
 * Simulates graph changes for testing the GraphChangeDetector and SSE streaming.
 * Useful for development and testing without needing complex graph operations.
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
 * Add a test node
 */
async function addTestNode(driver: Driver): Promise<void> {
  const timestamp = Date.now();
  const nodeId = `test-benefit-${timestamp}`;

  console.log(`➕ Adding test node: ${nodeId}`);

  await executeCypher(
    driver,
    `
    MERGE (b:Benefit {id: $id})
    SET b.label = $label,
        b.name = $name,
        b.short_summary = $summary,
        b.description = $description,
        b.test_node = true,
        b.created_at = datetime()

    WITH b
    MATCH (ie:Jurisdiction {id: 'IE'})
    MERGE (b)-[:IN_JURISDICTION]->(ie)

    WITH b
    MATCH (p:ProfileTag {id: 'single-director-ie'})
    MERGE (b)-[:APPLIES_TO]->(p)
  `,
    {
      id: nodeId,
      label: `Test Benefit ${timestamp}`,
      name: `Test Benefit ${timestamp}`,
      summary: 'Test benefit for change detection',
      description: 'This is a test benefit created to verify graph change detection is working correctly.',
    }
  );

  console.log('✅ Test node added successfully');
}

/**
 * Update an existing test node
 */
async function updateTestNode(driver: Driver): Promise<void> {
  console.log('🔄 Updating test node...');

  const session = driver.session();
  try {
    // Find a test node
    const result = await session.run(`
      MATCH (b:Benefit {test_node: true})
      RETURN b.id AS id
      LIMIT 1
    `);

    if (result.records.length === 0) {
      console.log('⚠️  No test nodes found. Run "add-node" first.');
      return;
    }

    const nodeId = result.records[0].get('id');
    console.log(`   Updating node: ${nodeId}`);

    await session.run(
      `
      MATCH (b:Benefit {id: $id})
      SET b.description = $newDescription,
          b.updated_at = datetime()
    `,
      {
        id: nodeId,
        newDescription: `Updated at ${new Date().toISOString()} - Change detection test`,
      }
    );

    console.log('✅ Test node updated successfully');
  } finally {
    await session.close();
  }
}

/**
 * Remove a test node
 */
async function removeTestNode(driver: Driver): Promise<void> {
  console.log('🗑️  Removing test node...');

  const session = driver.session();
  try {
    // Find and remove a test node
    const result = await session.run(`
      MATCH (b:Benefit {test_node: true})
      WITH b LIMIT 1
      DETACH DELETE b
      RETURN count(b) AS deleted
    `);

    const deleted = result.records[0].get('deleted').toNumber();

    if (deleted === 0) {
      console.log('⚠️  No test nodes found to remove.');
    } else {
      console.log('✅ Test node removed successfully');
    }
  } finally {
    await session.close();
  }
}

/**
 * Add a test edge
 */
async function addTestEdge(driver: Driver): Promise<void> {
  console.log('➕ Adding test edge...');

  const session = driver.session();
  try {
    // Find two test nodes or create them
    const result = await session.run(`
      MATCH (b1:Benefit {test_node: true})
      MATCH (b2:Benefit {test_node: true})
      WHERE b1 <> b2
      RETURN b1.id AS id1, b2.id AS id2
      LIMIT 1
    `);

    if (result.records.length === 0) {
      console.log('⚠️  Need at least 2 test nodes. Creating them...');
      await addTestNode(driver);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await addTestNode(driver);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await addTestEdge(driver); // Retry
      return;
    }

    const id1 = result.records[0].get('id1');
    const id2 = result.records[0].get('id2');

    console.log(`   Creating edge: ${id1} -> ${id2}`);

    await session.run(
      `
      MATCH (b1:Benefit {id: $id1})
      MATCH (b2:Benefit {id: $id2})
      MERGE (b1)-[:MUTUALLY_EXCLUSIVE_WITH]->(b2)
    `,
      { id1, id2 }
    );

    console.log('✅ Test edge added successfully');
  } finally {
    await session.close();
  }
}

/**
 * Remove a test edge
 */
async function removeTestEdge(driver: Driver): Promise<void> {
  console.log('🗑️  Removing test edge...');

  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (b1:Benefit {test_node: true})-[r:MUTUALLY_EXCLUSIVE_WITH]->(b2:Benefit {test_node: true})
      WITH r LIMIT 1
      DELETE r
      RETURN count(r) AS deleted
    `);

    const deleted = result.records[0].get('deleted').toNumber();

    if (deleted === 0) {
      console.log('⚠️  No test edges found to remove.');
    } else {
      console.log('✅ Test edge removed successfully');
    }
  } finally {
    await session.close();
  }
}

/**
 * Simulate a sequence of changes with delays
 */
async function simulateChanges(driver: Driver): Promise<void> {
  console.log('🎬 Starting simulation of graph changes...\n');

  const actions = [
    { name: 'Add Node 1', fn: () => addTestNode(driver), delay: 2000 },
    { name: 'Add Node 2', fn: () => addTestNode(driver), delay: 3000 },
    { name: 'Add Edge', fn: () => addTestEdge(driver), delay: 3000 },
    { name: 'Update Node', fn: () => updateTestNode(driver), delay: 3000 },
    { name: 'Remove Edge', fn: () => removeTestEdge(driver), delay: 3000 },
    { name: 'Add Node 3', fn: () => addTestNode(driver), delay: 3000 },
    { name: 'Remove Node', fn: () => removeTestNode(driver), delay: 3000 },
  ];

  for (const action of actions) {
    console.log(`\n[${new Date().toISOString()}] ${action.name}`);
    console.log('─'.repeat(50));
    await action.fn();
    console.log(`   ⏳ Waiting ${action.delay}ms before next action...\n`);
    await new Promise((resolve) => setTimeout(resolve, action.delay));
  }

  console.log('\n✅ Simulation complete!');
}

/**
 * Main function
 */
async function main() {
  const action = process.argv[2] || 'simulate';

  console.log('🧪 Test Graph Changes');
  console.log(`📍 Connecting to: ${MEMGRAPH_URI}\n`);

  const driver = createDriver();

  try {
    await driver.verifyConnectivity();
    console.log('✅ Connected to Memgraph\n');

    switch (action) {
      case 'add-node':
        await addTestNode(driver);
        break;
      case 'update-node':
        await updateTestNode(driver);
        break;
      case 'remove-node':
        await removeTestNode(driver);
        break;
      case 'add-edge':
        await addTestEdge(driver);
        break;
      case 'remove-edge':
        await removeTestEdge(driver);
        break;
      case 'simulate':
        await simulateChanges(driver);
        break;
      default:
        console.error(`❌ Unknown action: ${action}`);
        console.log('\nAvailable actions:');
        console.log('  - add-node');
        console.log('  - update-node');
        console.log('  - remove-node');
        console.log('  - add-edge');
        console.log('  - remove-edge');
        console.log('  - simulate (default)');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
