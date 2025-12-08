#!/usr/bin/env tsx

/**
 * Script to apply a SQL migration to Supabase
 * Usage: tsx scripts/apply-migration.ts <migration-file-path>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function applyMigration(migrationPath: string) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}...`);
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Read migration file
  const fullPath = resolve(migrationPath);
  console.log(`Reading migration from ${fullPath}...`);
  const migrationSql = readFileSync(fullPath, 'utf-8');

  console.log('Applying migration...');
  console.log('='.repeat(80));
  console.log(migrationSql);
  console.log('='.repeat(80));

  // Execute the migration SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSql });

  if (error) {
    console.error('Error applying migration:', error);

    // If exec_sql RPC doesn't exist, we need to execute the SQL directly
    // Split the SQL into individual statements and execute them
    console.log('\nTrying alternative method: executing statements individually...');

    const statements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    let successCount = 0;
    let failCount = 0;

    for (const statement of statements) {
      if (!statement) continue;

      console.log(`\nExecuting: ${statement.substring(0, 100)}...`);

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
        console.log('✓ Success');
        successCount++;
      } else {
        const errorText = await response.text();
        console.error('✗ Failed:', errorText);
        failCount++;
      }
    }

    console.log(`\nExecution complete: ${successCount} succeeded, ${failCount} failed`);

    if (failCount > 0) {
      console.error('\n⚠️  Some statements failed. Please apply the migration manually via Supabase dashboard.');
      console.error('You can copy the SQL from:', fullPath);
      process.exit(1);
    }
  } else {
    console.log('✓ Migration applied successfully!');
    console.log('Result:', data);
  }
}

// Get migration path from command line args
const migrationPath = process.argv[2];

if (!migrationPath) {
  console.error('Usage: tsx scripts/apply-migration.ts <migration-file-path>');
  console.error('Example: tsx scripts/apply-migration.ts supabase/migrations/20251208000000_fix_conversation_paths_permissions.sql');
  process.exit(1);
}

applyMigration(migrationPath).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
