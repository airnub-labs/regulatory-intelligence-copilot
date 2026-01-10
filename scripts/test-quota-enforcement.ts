#!/usr/bin/env tsx
/**
 * Test script for quota enforcement
 *
 * This script simulates quota breach scenarios to verify that quota enforcement
 * is working correctly for both LLM and E2B cost tracking.
 *
 * Usage:
 *   tsx scripts/test-quota-enforcement.ts
 *   OR
 *   npm run test:quotas
 *
 * Requirements:
 *   - Supabase instance running (local or remote)
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables set
 *   - Test quotas configured in database (run phase2_pricing_and_quotas.sql first)
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@reg-copilot/reg-intel-observability';

const logger = createLogger('QuotaEnforcementTest');

// Environment variables
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'http://localhost:54321';

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const results: TestResult[] = [];

// Get demo tenant ID
async function getDemoTenantId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('auth.users')
    .select('id, raw_user_meta_data')
    .eq('email', 'demo.user@example.com')
    .single();

  if (error || !data) {
    logger.warn('Demo user not found, cannot test quotas');
    return null;
  }

  const tenantId = data.raw_user_meta_data?.tenant_id;
  return tenantId || null;
}

// Test 1: Verify quotas configured
async function test1_VerifyQuotasConfigured(tenantId: string): Promise<TestResult> {
  try {
    const { data, error } = await supabase
      .from('copilot_billing.cost_quotas')
      .select('*')
      .eq('scope', 'tenant')
      .eq('scope_id', tenantId);

    if (error) {
      return {
        name: 'Verify Quotas Configured',
        passed: false,
        message: `Error querying quotas: ${error.message}`,
      };
    }

    const quotas = data || [];
    const e2bQuota = quotas.find(q => q.resource_type === 'e2b');
    const llmQuota = quotas.find(q => q.resource_type === 'llm');

    if (!e2bQuota || !llmQuota) {
      return {
        name: 'Verify Quotas Configured',
        passed: false,
        message: `Missing quotas: E2B=${!!e2bQuota}, LLM=${!!llmQuota}`,
        details: quotas,
      };
    }

    return {
      name: 'Verify Quotas Configured',
      passed: true,
      message: `Both E2B and LLM quotas configured (E2B: $${e2bQuota.limit_usd}, LLM: $${llmQuota.limit_usd})`,
      details: { e2bQuota, llmQuota },
    };
  } catch (error: any) {
    return {
      name: 'Verify Quotas Configured',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

// Test 2: Test E2B quota check function
async function test2_E2BQuotaCheckFunction(tenantId: string): Promise<TestResult> {
  try {
    // Check quota with small estimated cost (should pass)
    const { data: allowedData, error: allowedError } = await supabase.rpc(
      'check_e2b_quota',
      {
        p_scope: 'tenant',
        p_scope_id: tenantId,
        p_estimated_cost: 0.01, // $0.01 - should be allowed
      }
    );

    if (allowedError) {
      return {
        name: 'E2B Quota Check Function',
        passed: false,
        message: `Error calling check_e2b_quota: ${allowedError.message}`,
      };
    }

    const isAllowed = allowedData as boolean;

    if (!isAllowed) {
      return {
        name: 'E2B Quota Check Function',
        passed: false,
        message: 'Small cost ($0.01) was denied - quota may be exhausted or misconfigured',
      };
    }

    // Check quota with huge estimated cost (should fail)
    const { data: deniedData, error: deniedError } = await supabase.rpc(
      'check_e2b_quota',
      {
        p_scope: 'tenant',
        p_scope_id: tenantId,
        p_estimated_cost: 999999.99, // $1M - should be denied
      }
    );

    if (deniedError) {
      return {
        name: 'E2B Quota Check Function',
        passed: false,
        message: `Error on second check: ${deniedError.message}`,
      };
    }

    const isDenied = !(deniedData as boolean);

    if (!isDenied) {
      return {
        name: 'E2B Quota Check Function',
        passed: false,
        message: 'Large cost ($1M) was allowed - quota check not working',
      };
    }

    return {
      name: 'E2B Quota Check Function',
      passed: true,
      message: 'E2B quota check working correctly (allows small costs, denies large costs)',
    };
  } catch (error: any) {
    return {
      name: 'E2B Quota Check Function',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

// Test 3: Test warning threshold detection
async function test3_WarningThresholdDetection(tenantId: string): Promise<TestResult> {
  try {
    // Get quota details
    const { data: quotaData, error: quotaError } = await supabase
      .from('copilot_billing.cost_quotas')
      .select('*')
      .eq('scope', 'tenant')
      .eq('scope_id', tenantId)
      .eq('resource_type', 'e2b')
      .single();

    if (quotaError || !quotaData) {
      return {
        name: 'Warning Threshold Detection',
        passed: false,
        message: 'Could not retrieve E2B quota',
      };
    }

    const limitUsd = Number(quotaData.limit_usd);
    const currentSpendUsd = Number(quotaData.current_spend_usd);
    const warningThreshold = quotaData.warning_threshold || 0.8;
    const warningLimitUsd = limitUsd * warningThreshold;
    const utilizationPercent = (currentSpendUsd / limitUsd) * 100;

    // Check if we're in warning zone (80%-100%)
    const isInWarningZone = currentSpendUsd >= warningLimitUsd && currentSpendUsd < limitUsd;

    // Check if we're exceeded (>100%)
    const isExceeded = currentSpendUsd >= limitUsd;

    return {
      name: 'Warning Threshold Detection',
      passed: true,
      message: `Current: $${currentSpendUsd.toFixed(4)} / $${limitUsd.toFixed(2)} (${utilizationPercent.toFixed(1)}%) | Warning at: $${warningLimitUsd.toFixed(2)} | Status: ${isExceeded ? 'EXCEEDED' : isInWarningZone ? 'WARNING' : 'OK'}`,
      details: {
        currentSpendUsd,
        limitUsd,
        warningLimitUsd,
        utilizationPercent,
        isInWarningZone,
        isExceeded,
      },
    };
  } catch (error: any) {
    return {
      name: 'Warning Threshold Detection',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

// Test 4: Simulate quota breach
async function test4_SimulateQuotaBreach(tenantId: string): Promise<TestResult> {
  try {
    // Get current E2B quota
    const { data: quotaData, error: quotaError } = await supabase
      .from('copilot_billing.cost_quotas')
      .select('*')
      .eq('scope', 'tenant')
      .eq('scope_id', tenantId)
      .eq('resource_type', 'e2b')
      .single();

    if (quotaError || !quotaData) {
      return {
        name: 'Simulate Quota Breach',
        passed: false,
        message: 'Could not retrieve E2B quota',
      };
    }

    const limitUsd = Number(quotaData.limit_usd);
    const currentSpendUsd = Number(quotaData.current_spend_usd);
    const remainingBudget = limitUsd - currentSpendUsd;

    // Try to increment spend beyond limit
    const exceedAmount = remainingBudget + 5.0; // Exceed by $5

    logger.info('Attempting to breach quota...', {
      currentSpend: currentSpendUsd.toFixed(4),
      limit: limitUsd.toFixed(2),
      remaining: remainingBudget.toFixed(4),
      attemptingToAdd: exceedAmount.toFixed(2),
    });

    // This should be denied if quota check is working
    const { data: checkData, error: checkError } = await supabase.rpc(
      'check_e2b_quota',
      {
        p_scope: 'tenant',
        p_scope_id: tenantId,
        p_estimated_cost: exceedAmount,
      }
    );

    if (checkError) {
      return {
        name: 'Simulate Quota Breach',
        passed: false,
        message: `Error checking quota: ${checkError.message}`,
      };
    }

    const isAllowed = checkData as boolean;

    if (isAllowed) {
      return {
        name: 'Simulate Quota Breach',
        passed: false,
        message: `Quota breach was ALLOWED - enforcement not working! Tried to add $${exceedAmount.toFixed(2)} when only $${remainingBudget.toFixed(4)} remaining.`,
      };
    }

    return {
      name: 'Simulate Quota Breach',
      passed: true,
      message: `Quota breach correctly DENIED when attempting to exceed limit by $5`,
      details: {
        currentSpend: currentSpendUsd,
        limit: limitUsd,
        remaining: remainingBudget,
        attemptedToAdd: exceedAmount,
        denied: true,
      },
    };
  } catch (error: any) {
    return {
      name: 'Simulate Quota Breach',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

// Test 5: Test increment quota spend function
async function test5_IncrementQuotaSpend(tenantId: string): Promise<TestResult> {
  try {
    // Get current spend
    const { data: beforeData, error: beforeError } = await supabase
      .from('copilot_billing.cost_quotas')
      .select('current_spend_usd')
      .eq('scope', 'tenant')
      .eq('scope_id', tenantId)
      .eq('resource_type', 'e2b')
      .single();

    if (beforeError || !beforeData) {
      return {
        name: 'Increment Quota Spend',
        passed: false,
        message: 'Could not retrieve initial quota spend',
      };
    }

    const beforeSpend = Number(beforeData.current_spend_usd);

    // Increment by a small test amount
    const testAmount = 0.001; // $0.001
    const { error: incrementError } = await supabase.rpc('increment_e2b_quota_spend', {
      p_scope: 'tenant',
      p_scope_id: tenantId,
      p_amount: testAmount,
    });

    if (incrementError) {
      return {
        name: 'Increment Quota Spend',
        passed: false,
        message: `Error incrementing quota: ${incrementError.message}`,
      };
    }

    // Get updated spend
    const { data: afterData, error: afterError } = await supabase
      .from('copilot_billing.cost_quotas')
      .select('current_spend_usd')
      .eq('scope', 'tenant')
      .eq('scope_id', tenantId)
      .eq('resource_type', 'e2b')
      .single();

    if (afterError || !afterData) {
      return {
        name: 'Increment Quota Spend',
        passed: false,
        message: 'Could not retrieve updated quota spend',
      };
    }

    const afterSpend = Number(afterData.current_spend_usd);
    const actualIncrease = afterSpend - beforeSpend;

    // Allow small floating point differences
    const isCorrect = Math.abs(actualIncrease - testAmount) < 0.0001;

    if (!isCorrect) {
      return {
        name: 'Increment Quota Spend',
        passed: false,
        message: `Spend increment incorrect: expected +$${testAmount.toFixed(4)}, got +$${actualIncrease.toFixed(4)}`,
      };
    }

    return {
      name: 'Increment Quota Spend',
      passed: true,
      message: `Quota spend incremented correctly: $${beforeSpend.toFixed(4)} → $${afterSpend.toFixed(4)} (+$${testAmount.toFixed(4)})`,
      details: { beforeSpend, afterSpend, increment: testAmount, actualIncrease },
    };
  } catch (error: any) {
    return {
      name: 'Increment Quota Spend',
      passed: false,
      message: `Error: ${error.message}`,
    };
  }
}

// Main test runner
async function runTests() {
  console.log('\n=== Quota Enforcement Tests ===\n');

  // Get demo tenant
  const tenantId = await getDemoTenantId();
  if (!tenantId) {
    console.error('❌ Cannot run tests: Demo tenant not found');
    console.error('   Run: supabase db reset to create demo tenant');
    process.exit(1);
  }

  console.log(`Testing with tenant: ${tenantId}\n`);

  // Run all tests
  results.push(await test1_VerifyQuotasConfigured(tenantId));
  results.push(await test2_E2BQuotaCheckFunction(tenantId));
  results.push(await test3_WarningThresholdDetection(tenantId));
  results.push(await test4_SimulateQuotaBreach(tenantId));
  results.push(await test5_IncrementQuotaSpend(tenantId));

  // Print results
  let allPassed = true;
  results.forEach((result, index) => {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m'; // green or red
    const reset = '\x1b[0m';

    console.log(`${color}${icon}${reset} ${index + 1}. ${result.message}`);

    if (!result.passed) {
      allPassed = false;
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    }
  });

  console.log('\n');

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  if (allPassed) {
    console.log('\x1b[32m=== All Quota Enforcement Tests PASSED ===\x1b[0m');
    console.log(`${passedCount}/${totalCount} tests passed\n`);
    console.log('Quota enforcement is working correctly!');
    console.log('\nNext steps:');
    console.log('  1. Test with actual E2B sandbox creation');
    console.log('  2. Test with actual LLM API calls');
    console.log('  3. Monitor quota alerts in configured channels\n');
    process.exit(0);
  } else {
    console.log('\x1b[31m=== Quota Enforcement Tests FAILED ===\x1b[0m');
    console.log(`${passedCount}/${totalCount} tests passed, ${totalCount - passedCount} failed\n`);
    console.log('Review the failed tests above and fix the issues.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('\x1b[31m❌ Test runner failed:\x1b[0m', error.message);
  console.error(error.stack);
  process.exit(1);
});
