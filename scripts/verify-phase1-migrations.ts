#!/usr/bin/env tsx
/**
 * Phase 1 Migration Verification Script
 *
 * This script verifies that both E2B and LLM cost tracking migrations have been
 * applied successfully to the database.
 *
 * Usage:
 *   tsx scripts/verify-phase1-migrations.ts
 *   OR
 *   npm run verify:phase1
 *
 * Requirements:
 *   - Supabase instance running (local or remote)
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables set
 *   - Migrations 20260104000001 and 20260104000002 applied
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'http://localhost:54321';

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set'
  );
  console.error(
    '   Set it in .env.local or pass it: SUPABASE_SERVICE_ROLE_KEY=... npm run verify:phase1'
  );
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Verification tests
interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const results: VerificationResult[] = [];

async function runQuery(sql: string): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }
  return data || [];
}

async function verify1_TablesExist(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'copilot_internal'
          AND table_name IN ('e2b_pricing', 'e2b_cost_records', 'model_pricing')
        ORDER BY table_name;
      `,
    });

    if (error) {
      // Table might not exist, try direct query
      const tables = await Promise.all([
        supabase.from('copilot_internal.e2b_pricing').select('id').limit(0),
        supabase
          .from('copilot_internal.e2b_cost_records')
          .select('id')
          .limit(0),
        supabase.from('copilot_internal.model_pricing').select('id').limit(0),
      ]);

      const tableNames = [];
      if (!tables[0].error) tableNames.push('e2b_pricing');
      if (!tables[1].error) tableNames.push('e2b_cost_records');
      if (!tables[2].error) tableNames.push('model_pricing');

      if (tableNames.length === 3) {
        return {
          name: 'Tables Exist',
          passed: true,
          message: 'All 3 required tables exist',
          details: tableNames,
        };
      }

      return {
        name: 'Tables Exist',
        passed: false,
        message: `Only ${tableNames.length}/3 tables exist: ${tableNames.join(', ')}`,
        details: tableNames,
      };
    }

    const tableNames = (data || []).map((row: any) => row.table_name);

    if (tableNames.length === 3) {
      return {
        name: 'Tables Exist',
        passed: true,
        message: 'All 3 required tables exist',
        details: tableNames,
      };
    }

    return {
      name: 'Tables Exist',
      passed: false,
      message: `Only ${tableNames.length}/3 tables exist: ${tableNames.join(', ')}`,
      details: tableNames,
    };
  } catch (error: any) {
    return {
      name: 'Tables Exist',
      passed: false,
      message: `Error checking tables: ${error.message}`,
    };
  }
}

async function verify2_E2BPricingSeeded(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase
      .from('copilot_internal.e2b_pricing')
      .select('tier, region, price_per_second')
      .order('price_per_second');

    if (error) {
      return {
        name: 'E2B Pricing Seeded',
        passed: false,
        message: `Error querying e2b_pricing: ${error.message}`,
      };
    }

    const tiers = (data || []).map((row: any) => row.tier);

    if (tiers.length >= 4) {
      return {
        name: 'E2B Pricing Seeded',
        passed: true,
        message: `E2B pricing seeded (${tiers.length} tiers)`,
        details: tiers,
      };
    }

    return {
      name: 'E2B Pricing Seeded',
      passed: false,
      message: `Expected 4+ tiers, found ${tiers.length}`,
      details: tiers,
    };
  } catch (error: any) {
    return {
      name: 'E2B Pricing Seeded',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

async function verify3_LLMPricingSeeded(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase
      .from('copilot_internal.model_pricing')
      .select('provider, model')
      .order('provider');

    if (error) {
      return {
        name: 'LLM Pricing Seeded',
        passed: false,
        message: `Error querying model_pricing: ${error.message}`,
      };
    }

    const models = data || [];
    const providerCounts: Record<string, number> = {};

    models.forEach((row: any) => {
      providerCounts[row.provider] = (providerCounts[row.provider] || 0) + 1;
    });

    if (models.length >= 10 && Object.keys(providerCounts).length >= 3) {
      return {
        name: 'LLM Pricing Seeded',
        passed: true,
        message: `LLM pricing seeded (${models.length} models, ${Object.keys(providerCounts).length} providers)`,
        details: providerCounts,
      };
    }

    return {
      name: 'LLM Pricing Seeded',
      passed: false,
      message: `Expected 10+ models from 3+ providers, found ${models.length} models from ${Object.keys(providerCounts).length} providers`,
      details: providerCounts,
    };
  } catch (error: any) {
    return {
      name: 'LLM Pricing Seeded',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

async function verify4_ResourceTypeColumn(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_schema = 'copilot_internal'
          AND table_name = 'cost_quotas'
          AND column_name = 'resource_type';
      `,
    });

    if (error) {
      // Try direct query to cost_quotas
      const { error: tableError } = await supabase
        .from('copilot_internal.cost_quotas')
        .select('resource_type')
        .limit(1);

      if (!tableError) {
        return {
          name: 'resource_type Column',
          passed: true,
          message: 'resource_type column exists on cost_quotas',
        };
      }

      return {
        name: 'resource_type Column',
        passed: false,
        message: `Error checking resource_type column: ${error.message || tableError.message}`,
      };
    }

    if (data && data.length > 0) {
      return {
        name: 'resource_type Column',
        passed: true,
        message: 'resource_type column exists on cost_quotas',
        details: data[0],
      };
    }

    return {
      name: 'resource_type Column',
      passed: false,
      message: 'resource_type column not found on cost_quotas',
    };
  } catch (error: any) {
    return {
      name: 'resource_type Column',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

async function verify5_HelperFunctions(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'copilot_internal'
          AND routine_name IN (
            'check_e2b_quota',
            'calculate_e2b_cost',
            'increment_e2b_quota_spend',
            'get_current_model_pricing',
            'calculate_llm_cost'
          )
        ORDER BY routine_name;
      `,
    });

    if (error) {
      return {
        name: 'Helper Functions',
        passed: false,
        message: `Error checking functions: ${error.message}`,
      };
    }

    const functions = (data || []).map((row: any) => row.routine_name);

    if (functions.length === 5) {
      return {
        name: 'Helper Functions',
        passed: true,
        message: 'All 5 helper functions created',
        details: functions,
      };
    }

    return {
      name: 'Helper Functions',
      passed: false,
      message: `Expected 5 functions, found ${functions.length}`,
      details: functions,
    };
  } catch (error: any) {
    return {
      name: 'Helper Functions',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

async function verify6_E2BCostCalculation(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.rpc('calculate_e2b_cost', {
      p_tier: 'standard',
      p_region: 'us-east-1',
      p_execution_time_seconds: 300,
      p_cpu_core_seconds: null,
      p_memory_gb_seconds: null,
      p_disk_io_gb: null,
      p_pricing_date: new Date().toISOString(),
    });

    if (error) {
      return {
        name: 'E2B Cost Calculation',
        passed: false,
        message: `Error calling calculate_e2b_cost: ${error.message}`,
      };
    }

    if (data && Array.isArray(data) && data.length > 0) {
      const result = data[0];
      const totalCost = parseFloat(result.total_cost_usd);

      if (totalCost > 0 && totalCost < 1) {
        return {
          name: 'E2B Cost Calculation',
          passed: true,
          message: `E2B cost calculation working (300s = $${totalCost.toFixed(4)})`,
          details: result,
        };
      }
    }

    return {
      name: 'E2B Cost Calculation',
      passed: false,
      message: 'calculate_e2b_cost returned unexpected result',
      details: data,
    };
  } catch (error: any) {
    return {
      name: 'E2B Cost Calculation',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

async function verify7_LLMCostCalculation(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.rpc('calculate_llm_cost', {
      p_provider: 'openai',
      p_model: 'gpt-4',
      p_input_tokens: 1000,
      p_output_tokens: 500,
    });

    if (error) {
      return {
        name: 'LLM Cost Calculation',
        passed: false,
        message: `Error calling calculate_llm_cost: ${error.message}`,
      };
    }

    if (data && Array.isArray(data) && data.length > 0) {
      const result = data[0];
      const totalCost = parseFloat(result.total_cost_usd);
      const pricingFound = result.pricing_found;

      if (pricingFound && totalCost > 0) {
        return {
          name: 'LLM Cost Calculation',
          passed: true,
          message: `LLM cost calculation working (1000in/500out = $${totalCost.toFixed(4)})`,
          details: result,
        };
      }
    }

    return {
      name: 'LLM Cost Calculation',
      passed: false,
      message: 'calculate_llm_cost returned unexpected result',
      details: data,
    };
  } catch (error: any) {
    return {
      name: 'LLM Cost Calculation',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

async function verify8_AggregationViews(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'copilot_internal'
          AND table_name LIKE '%cost%summary%'
        ORDER BY table_name;
      `,
    });

    if (error) {
      return {
        name: 'Aggregation Views',
        passed: false,
        message: `Error checking views: ${error.message}`,
      };
    }

    const views = (data || []).map((row: any) => row.table_name);

    if (views.length >= 7) {
      return {
        name: 'Aggregation Views',
        passed: true,
        message: `All ${views.length} aggregation views created`,
        details: views,
      };
    }

    return {
      name: 'Aggregation Views',
      passed: false,
      message: `Expected 7+ views, found ${views.length}`,
      details: views,
    };
  } catch (error: any) {
    return {
      name: 'Aggregation Views',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

async function verify9_RLSPolicies(): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'copilot_internal'
          AND tablename IN ('e2b_pricing', 'e2b_cost_records', 'model_pricing');
      `,
    });

    if (error) {
      return {
        name: 'RLS Policies',
        passed: false,
        message: `Error checking RLS: ${error.message}`,
      };
    }

    const tables = data || [];
    const rlsEnabled = tables.filter((row: any) => row.rowsecurity === true);

    if (rlsEnabled.length === 3) {
      return {
        name: 'RLS Policies',
        passed: true,
        message: 'RLS enabled on all 3 cost tracking tables',
        details: tables,
      };
    }

    return {
      name: 'RLS Policies',
      passed: false,
      message: `RLS enabled on ${rlsEnabled.length}/3 tables`,
      details: tables,
    };
  } catch (error: any) {
    return {
      name: 'RLS Policies',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

// Main verification runner
async function runVerification() {
  console.log('\n=== Phase 1 Migration Verification ===\n');

  // Run all verification tests
  results.push(await verify1_TablesExist());
  results.push(await verify2_E2BPricingSeeded());
  results.push(await verify3_LLMPricingSeeded());
  results.push(await verify4_ResourceTypeColumn());
  results.push(await verify5_HelperFunctions());
  results.push(await verify6_E2BCostCalculation());
  results.push(await verify7_LLMCostCalculation());
  results.push(await verify8_AggregationViews());
  results.push(await verify9_RLSPolicies());

  // Print results
  let allPassed = true;
  results.forEach((result) => {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m'; // green or red
    const reset = '\x1b[0m';

    console.log(`${color}${icon}${reset} ${result.message}`);

    if (!result.passed) {
      allPassed = false;
      if (result.details) {
        console.log(`  Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    }
  });

  console.log('\n');

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  if (allPassed) {
    console.log('\x1b[32m=== Phase 1 Verification PASSED ===\x1b[0m');
    console.log('All migrations applied successfully!');
    console.log(`${passedCount}/${totalCount} checks passed\n`);
    process.exit(0);
  } else {
    console.log('\x1b[31m=== Phase 1 Verification FAILED ===\x1b[0m');
    console.log(
      `${passedCount}/${totalCount} checks passed, ${totalCount - passedCount} failed`
    );
    console.log(
      '\nPlease review the failed checks above and apply the migrations:'
    );
    console.log('  supabase db reset\n');
    process.exit(1);
  }
}

// Run verification
runVerification().catch((error) => {
  console.error('\x1b[31m❌ Verification script failed:\x1b[0m', error.message);
  console.error(error.stack);
  process.exit(1);
});
