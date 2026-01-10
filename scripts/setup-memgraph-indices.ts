/**
 * Memgraph Index Setup Script
 *
 * Programmatically creates all required indices in Memgraph for optimal query performance.
 *
 * Usage:
 *   pnpm setup:indices
 *
 * Environment Variables (from .env.local or .env):
 *   MEMGRAPH_URI - Memgraph connection URI (default: bolt://localhost:7687)
 *   MEMGRAPH_USERNAME - Username for authentication (optional)
 *   MEMGRAPH_PASSWORD - Password for authentication (optional)
 */

import { loadEnv } from './load-env.js';
import neo4j, { Driver, Session } from 'neo4j-driver';

// Load environment variables from .env.local or .env
loadEnv();

// Index definitions organized by category
const INDICES = {
  // Primary ID indices for all node types
  primaryIds: [
    'CREATE INDEX ON :Benefit(id)',
    'CREATE INDEX ON :Relief(id)',
    'CREATE INDEX ON :Section(id)',
    'CREATE INDEX ON :Jurisdiction(id)',
    'CREATE INDEX ON :ProfileTag(id)',
    'CREATE INDEX ON :Obligation(id)',
    'CREATE INDEX ON :Timeline(id)',
    'CREATE INDEX ON :Condition(id)',
    'CREATE INDEX ON :Threshold(id)',
    'CREATE INDEX ON :Rate(id)',
    'CREATE INDEX ON :Form(id)',
    'CREATE INDEX ON :Concept(id)',
    'CREATE INDEX ON :PRSIClass(id)',
    'CREATE INDEX ON :NIClass(id)',
    'CREATE INDEX ON :LifeEvent(id)',
    'CREATE INDEX ON :Penalty(id)',
    'CREATE INDEX ON :LegalEntity(id)',
    'CREATE INDEX ON :TaxCredit(id)',
    'CREATE INDEX ON :RegulatoryBody(id)',
    'CREATE INDEX ON :AssetClass(id)',
    'CREATE INDEX ON :MeansTest(id)',
    'CREATE INDEX ON :BenefitCap(id)',
    'CREATE INDEX ON :CoordinationRule(id)',
    'CREATE INDEX ON :TaxYear(id)',
  ],

  // Timestamp indices for change detection
  timestamps: [
    'CREATE INDEX ON :Benefit(updated_at)',
    'CREATE INDEX ON :Relief(updated_at)',
    'CREATE INDEX ON :Section(updated_at)',
    'CREATE INDEX ON :Obligation(updated_at)',
  ],

  // Property indices for common query filters
  properties: [
    'CREATE INDEX ON :TaxYear(year)',
    'CREATE INDEX ON :TaxYear(jurisdiction)',
    'CREATE INDEX ON :Rate(category)',
    'CREATE INDEX ON :Threshold(unit)',
    'CREATE INDEX ON :TaxCredit(tax_year)',
    'CREATE INDEX ON :CoordinationRule(home_jurisdiction)',
    'CREATE INDEX ON :CoordinationRule(host_jurisdiction)',
  ],

  // Label/name search indices
  search: [
    'CREATE INDEX ON :Benefit(label)',
    'CREATE INDEX ON :Relief(label)',
    'CREATE INDEX ON :Section(label)',
    'CREATE INDEX ON :Benefit(name)',
    'CREATE INDEX ON :Relief(name)',
    'CREATE INDEX ON :Section(name)',
  ],
};

async function createIndex(session: Session, indexQuery: string): Promise<void> {
  try {
    await session.run(indexQuery);
    console.log(`✓ ${indexQuery}`);
  } catch (error) {
    // Index may already exist - this is fine
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`⚠ ${indexQuery} - already exists (skipped)`);
    } else {
      console.error(`✗ ${indexQuery} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}

async function setupIndices(): Promise<void> {
  const uri = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
  const username = process.env.MEMGRAPH_USERNAME;
  const password = process.env.MEMGRAPH_PASSWORD;

  console.log('========================================');
  console.log('Memgraph Index Setup');
  console.log('========================================');
  console.log(`Connecting to: ${uri}`);
  console.log('');

  let driver: Driver | null = null;
  let session: Session | null = null;

  try {
    // Create driver with authentication if provided
    const auth = username && password ? neo4j.auth.basic(username, password) : undefined;
    driver = neo4j.driver(uri, auth);

    // Test connection
    await driver.verifyConnectivity();
    console.log('✓ Connected to Memgraph successfully');
    console.log('');

    session = driver.session();

    // Create indices by category
    console.log('Creating Primary ID Indices...');
    for (const indexQuery of INDICES.primaryIds) {
      await createIndex(session, indexQuery);
    }
    console.log('');

    console.log('Creating Timestamp Indices...');
    for (const indexQuery of INDICES.timestamps) {
      await createIndex(session, indexQuery);
    }
    console.log('');

    console.log('Creating Property Indices...');
    for (const indexQuery of INDICES.properties) {
      await createIndex(session, indexQuery);
    }
    console.log('');

    console.log('Creating Search Indices...');
    for (const indexQuery of INDICES.search) {
      await createIndex(session, indexQuery);
    }
    console.log('');

    // Count total indices created
    const totalIndices =
      INDICES.primaryIds.length +
      INDICES.timestamps.length +
      INDICES.properties.length +
      INDICES.search.length;

    console.log('========================================');
    console.log(`✓ Index setup complete!`);
    console.log(`  Total indices: ${totalIndices}`);
    console.log('========================================');
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('✗ Index setup failed!');
    console.error('========================================');
    console.error(error);
    process.exit(1);
  } finally {
    // Clean up
    if (session) {
      await session.close();
    }
    if (driver) {
      await driver.close();
    }
  }
}

// Run the setup
setupIndices().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
