#!/usr/bin/env tsx

/**
 * Script to apply a SQL migration to Supabase
 * Usage: tsx scripts/apply-migration.ts <migration-file-path>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Logger } from 'pino';
import { runWithScriptObservability } from './observability.js';

async function applyMigration(migrationPath: string, logger: Logger) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set');
  }

  logger.info({ supabaseUrl }, 'Connecting to Supabase');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Read migration file
  const fullPath = resolve(migrationPath);
  logger.info({ migrationPath: fullPath }, 'Reading migration file');
  const migrationSql = readFileSync(fullPath, 'utf-8');

  logger.info({ migrationPreview: migrationSql.slice(0, 2000) }, 'Applying migration');

  // Execute the migration SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSql });

  if (error) {
    logger.error({ err: error }, 'Error applying migration');

    // If exec_sql RPC doesn't exist, we need to execute the SQL directly
    // Split the SQL into individual statements and execute them
    logger.warn({}, 'Trying alternative method: executing statements individually...');

    const statements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    let successCount = 0;
    let failCount = 0;

    for (const statement of statements) {
      if (!statement) continue;

      logger.info({ preview: statement.substring(0, 100) }, 'Executing statement');

      // Use the postgres REST API to execute raw SQL
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ query: statement + ';' }),
      });

      if (response.ok) {
        logger.info({}, '✓ Success');
        successCount++;
      } else {
        const errorText = await response.text();
        logger.error({ errorText }, '✗ Failed');
        failCount++;
      }
    }

    logger.info({ successCount, failCount }, 'Execution complete');

    if (failCount > 0) {
      logger.error(
        { failedStatements: failCount, migrationPath: fullPath },
        '⚠️  Some statements failed. Please apply the migration manually via Supabase dashboard.'
      );
      throw new Error('One or more migration statements failed');
    }
  } else {
    logger.info({ result: data }, '✓ Migration applied successfully!');
  }
}

// Get migration path from command line args
const migrationPath = process.argv[2];

await runWithScriptObservability(
  'apply-migration',
  async ({ logger }) => {
    if (!migrationPath) {
      throw new Error(
        'Usage: tsx scripts/apply-migration.ts <migration-file-path> (example: supabase/migrations/20251208000000_fix_conversation_paths_permissions.sql)'
      );
    }

    await applyMigration(migrationPath, logger);
  },
  { agentId: 'apply-migration' }
);
