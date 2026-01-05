# Cost Estimation Management - DevOps Guide

**Audience**: DevOps, SRE, Support Engineers
**Last Updated**: 2026-01-05

## Overview

This guide covers how to manage cost estimates for quota enforcement. There are TWO types of cost data:

1. **Cost Estimates** (this guide) - For pre-request quota checks
2. **Actual Cost Records** - For billing/accounting (see `COST_TRACKING_MANAGEMENT.md`)

## System Architecture

### Cost Estimation Flow

```
┌─────────────────┐
│ LLM Request or  │
│ E2B Sandbox     │
│ Creation        │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ CostEstimationService               │
│ 1. Check in-memory cache (1hr TTL) │
│ 2. Query database                   │
│ 3. Fallback to ENUM constants       │
│ 4. Return estimate (NEVER null)     │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Quota Check     │
│ ALWAYS happens  │
└─────────────────┘
```

### Data Sources (Priority Order)

1. **Database** (preferred)
   - Most accurate
   - Updateable via SQL
   - Shared across all instances
   - Tables: `llm_cost_estimates`, `e2b_cost_estimates`

2. **Fallback ENUMs** (backup)
   - Hardcoded in application
   - Used when database unavailable
   - Updateable via code deployment
   - Location: `packages/reg-intel-observability/src/costEstimation/fallbacks.ts`

3. **Default Constants** (last resort)
   - Generic values
   - Used when specific model/tier not found

## Database Management

### Schema

#### LLM Cost Estimates

```sql
-- Table structure
copilot_internal.llm_cost_estimates
  ├── id (UUID)
  ├── provider (text)           -- 'anthropic', 'openai', 'google'
  ├── model (text)               -- 'claude-3-sonnet-20240229', 'gpt-4'
  ├── operation_type (text)     -- 'chat', 'completion', 'tool_use', 'embedding'
  ├── estimated_cost_usd (numeric)
  ├── confidence_level (text)   -- 'conservative', 'typical', 'optimistic'
  ├── description (text)
  ├── assumptions (text)
  ├── effective_date (timestamptz)
  ├── expires_at (timestamptz)
  ├── created_at (timestamptz)
  └── updated_at (timestamptz)

-- Unique constraint
UNIQUE(provider, model, operation_type, confidence_level)
```

#### E2B Cost Estimates

```sql
-- Table structure
copilot_internal.e2b_cost_estimates
  ├── id (UUID)
  ├── tier (text)                    -- 'standard', 'gpu', 'high-memory', 'high-cpu'
  ├── region (text)                  -- 'us-east-1', 'us-west-2'
  ├── operation_type (text)          -- 'quick_task', 'standard_session', etc.
  ├── expected_duration_seconds (int)
  ├── estimated_cost_usd (numeric)
  ├── confidence_level (text)        -- 'conservative', 'typical', 'optimistic'
  ├── description (text)
  ├── assumptions (text)
  ├── effective_date (timestamptz)
  ├── expires_at (timestamptz)
  ├── created_at (timestamptz)
  └── updated_at (timestamptz)

-- Unique constraint
UNIQUE(tier, region, operation_type, confidence_level)
```

### Common Operations

#### 1. View Current Estimates

```sql
-- List all LLM estimates for a model
SELECT
  provider,
  model,
  operation_type,
  confidence_level,
  estimated_cost_usd,
  description
FROM copilot_internal.llm_cost_estimates
WHERE model = 'claude-3-sonnet-20240229'
ORDER BY operation_type, confidence_level;

-- List all E2B estimates for a tier
SELECT
  tier,
  region,
  operation_type,
  confidence_level,
  estimated_cost_usd,
  description
FROM copilot_internal.e2b_cost_estimates
WHERE tier = 'standard'
ORDER BY operation_type, confidence_level;
```

#### 2. Add New Model Estimate

```sql
-- Add estimate for new LLM model
INSERT INTO copilot_internal.llm_cost_estimates
  (provider, model, operation_type, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
  (
    'anthropic',
    'claude-4-sonnet-20260101',
    'chat',
    0.06,
    'conservative',
    'Claude 4 Sonnet conservative estimate for chat',
    'Assumes ~1500 input + 500 output tokens at $4/$20 per million'
  ),
  (
    'anthropic',
    'claude-4-sonnet-20260101',
    'chat',
    0.04,
    'typical',
    'Claude 4 Sonnet typical estimate for chat',
    'Assumes ~1000 input + 300 output tokens'
  );

-- Verify
SELECT * FROM copilot_internal.llm_cost_estimates
WHERE model = 'claude-4-sonnet-20260101';
```

#### 3. Update Existing Estimate

```sql
-- Update estimate due to pricing change
UPDATE copilot_internal.llm_cost_estimates
SET
  estimated_cost_usd = 0.055,
  description = 'Updated conservative estimate after vendor price increase',
  updated_at = NOW()
WHERE provider = 'anthropic'
  AND model = 'claude-3-sonnet-20240229'
  AND operation_type = 'chat'
  AND confidence_level = 'conservative';

-- Verify
SELECT * FROM copilot_internal.llm_cost_estimates
WHERE provider = 'anthropic'
  AND model = 'claude-3-sonnet-20240229'
  AND operation_type = 'chat';
```

#### 4. Expire Old Estimate

```sql
-- Mark estimate as expired (e.g., when vendor removes old pricing)
UPDATE copilot_internal.llm_cost_estimates
SET expires_at = NOW(), updated_at = NOW()
WHERE provider = 'openai'
  AND model = 'gpt-3.5-turbo-1106'
  AND expires_at IS NULL;
```

#### 5. Bulk Update for Vendor Price Change

```sql
-- Increase all Anthropic estimates by 10% due to vendor price increase
UPDATE copilot_internal.llm_cost_estimates
SET
  estimated_cost_usd = estimated_cost_usd * 1.10,
  description = COALESCE(description, '') || ' [Updated +10% on 2026-01-05]',
  updated_at = NOW()
WHERE provider = 'anthropic'
  AND expires_at IS NULL;

-- Verify changes
SELECT model, operation_type, confidence_level, estimated_cost_usd
FROM copilot_internal.llm_cost_estimates
WHERE provider = 'anthropic' AND expires_at IS NULL
ORDER BY model, operation_type, confidence_level;
```

#### 6. Add New E2B Tier

```sql
-- Add estimates for new GPU tier
INSERT INTO copilot_internal.e2b_cost_estimates
  (tier, region, operation_type, expected_duration_seconds, estimated_cost_usd, confidence_level, description, assumptions)
VALUES
  ('gpu-a100', 'us-east-1', 'quick_task', 60, 0.12, 'conservative', '1-minute A100 GPU task', 'Based on $0.002/sec'),
  ('gpu-a100', 'us-east-1', 'standard_session', 300, 0.60, 'conservative', '5-minute A100 GPU session', 'Based on $0.002/sec'),
  ('gpu-a100', 'us-east-1', 'standard_session', 300, 0.50, 'typical', '5-minute A100 GPU session (typical)', 'Typical usage pattern');
```

### Helper Functions

The migration provides SQL helper functions for easy lookups:

```sql
-- Get current LLM estimate
SELECT * FROM copilot_internal.get_llm_cost_estimate(
  'anthropic',           -- provider
  'claude-3-sonnet-20240229',  -- model
  'chat',                -- operation_type
  'conservative'         -- confidence_level
);

-- Get current E2B estimate
SELECT * FROM copilot_internal.get_e2b_cost_estimate(
  'standard',            -- tier
  'us-east-1',          -- region
  'standard_session',   -- operation_type
  'conservative'        -- confidence_level
);
```

## Fallback ENUM Management

### Location

File: `packages/reg-intel-observability/src/costEstimation/fallbacks.ts`

### When to Update Fallback ENUMs

Update fallback ENUMs when:
1. **New models released** - Add support for new LLM models or E2B tiers
2. **Vendor pricing changes** - Keep fallbacks aligned with database values
3. **Database seeding** - Ensure fallbacks match database seed data
4. **Safety margin updates** - Adjust conservative estimates based on actual usage

### How to Update Fallback ENUMs

#### 1. Edit the TypeScript File

```typescript
// packages/reg-intel-observability/src/costEstimation/fallbacks.ts

// Add new LLM model
export const FALLBACK_LLM_COST_ESTIMATES = {
  anthropic: {
    // ... existing models ...

    // NEW MODEL
    'claude-4-sonnet-20260101': {
      chat: {
        conservative: 0.06,
        typical: 0.04,
        optimistic: 0.03,
      },
      tool_use: {
        conservative: 0.09,
        typical: 0.06,
        optimistic: 0.04,
      },
      completion: {
        conservative: 0.06,
        typical: 0.04,
        optimistic: 0.03,
      },
      embedding: {
        conservative: 0.015,
        typical: 0.01,
        optimistic: 0.007,
      },
    },
  },
  // ... other providers ...
};

// Add new E2B tier
export const FALLBACK_E2B_COST_ESTIMATES = {
  // ... existing tiers ...

  // NEW TIER
  'gpu-a100': {
    'us-east-1': {
      quick_task: {
        conservative: 0.12,
        typical: 0.10,
        optimistic: 0.08,
      },
      standard_session: {
        conservative: 0.60,
        typical: 0.50,
        optimistic: 0.40,
      },
      // ... more operation types ...
    },
  },
};
```

#### 2. Update Default Constants (if needed)

```typescript
// Update defaults for new baseline pricing
export const DEFAULT_LLM_COST_ESTIMATE = 0.05; // Conservative default
export const DEFAULT_E2B_COST_ESTIMATE = 0.03; // Conservative default
```

#### 3. Build and Test

```bash
# Build observability package
pnpm --filter @reg-copilot/reg-intel-observability build

# Build conversations package (uses fallbacks)
pnpm --filter @reg-copilot/reg-intel-conversations build

# Verify no TypeScript errors
```

#### 4. Deploy

```bash
git add packages/reg-intel-observability/src/costEstimation/fallbacks.ts
git commit -m "feat: Update cost estimate fallbacks for new pricing"
git push

# Deploy to production
```

### Fallback ENUM Structure

Fallbacks MUST match database structure exactly:

**LLM**:
```
provider (string)
  ├── model (string)
      ├── operation_type ('chat' | 'completion' | 'tool_use' | 'embedding')
          └── confidence_level ('conservative' | 'typical' | 'optimistic')
              └── cost (number)
```

**E2B**:
```
tier (string)
  ├── region (string)
      ├── operation_type ('quick_task' | 'standard_session' | 'extended_session' | 'long_running')
          └── confidence_level ('conservative' | 'typical' | 'optimistic')
              └── cost (number)
```

## Monitoring and Alerting

### Check Fallback Usage

Monitor logs for fallback usage (indicates database issues):

```bash
# Check for fallback usage
kubectl logs -l app=demo-web --tail=1000 | grep "using fallback"

# Expected log patterns
# INFO: "Cost estimation service not initialized, using fallback ENUM constant"
# WARN: "Failed to query LLM cost estimate from database, using fallback"
# INFO: "LLM cost estimate not found in database, using fallback ENUM constant"
```

### Metrics to Monitor

1. **Database query success rate**
   - Target: >99% success
   - Alert if <95% for 5 minutes

2. **Fallback usage rate**
   - Target: <1% of requests
   - Alert if >5% for 5 minutes (indicates database issues)

3. **Cache hit rate**
   - Target: >80% hit rate
   - Lower rate indicates cache TTL may be too short

4. **Estimate accuracy**
   - Compare pre-request estimates to actual costs
   - Adjust if estimates consistently off by >20%

## Troubleshooting

### Issue: Quota checks not happening

**Symptom**: Users can exceed quotas
**Diagnosis**:
```sql
-- Check if estimates exist
SELECT COUNT(*) FROM copilot_internal.llm_cost_estimates;
SELECT COUNT(*) FROM copilot_internal.e2b_cost_estimates;
```

**Solution**:
1. Run migration if tables missing: `20260105000002_cost_estimates.sql`
2. Check fallback ENUMs are deployed
3. Verify CostEstimationService is initialized

### Issue: Database queries failing

**Symptom**: Logs show "using fallback" frequently
**Diagnosis**:
```sql
-- Test database connectivity
SELECT version();

-- Test table access
SELECT COUNT(*) FROM copilot_internal.llm_cost_estimates;
```

**Solution**:
1. Check database connection settings
2. Verify RLS policies allow service_role access
3. Check database schema: `copilot_internal`
4. Fallback ENUMs ensure quota enforcement continues

### Issue: Inaccurate estimates

**Symptom**: Estimates differ significantly from actual costs
**Diagnosis**:
```sql
-- Compare estimates to actual costs
SELECT
  e.model,
  e.operation_type,
  e.estimated_cost_usd AS estimate,
  AVG(a.total_cost_usd) AS actual_avg,
  (e.estimated_cost_usd - AVG(a.total_cost_usd)) AS difference
FROM copilot_internal.llm_cost_estimates e
LEFT JOIN copilot_internal.llm_cost_records a
  ON a.model = e.model
  AND a.created_at > NOW() - INTERVAL '7 days'
WHERE e.confidence_level = 'conservative'
GROUP BY e.model, e.operation_type, e.estimated_cost_usd;
```

**Solution**:
1. Update database estimates based on actual usage
2. Update fallback ENUMs to match
3. Consider adding new confidence levels

## Best Practices

### 1. Keep Database and Fallbacks in Sync

```bash
# After updating database estimates
1. Update corresponding fallback ENUMs
2. Test both paths (database and fallback)
3. Deploy together
```

### 2. Use Conservative Estimates for Quota Checks

- Use `confidence_level = 'conservative'` for quota enforcement
- Prevents quota overruns
- Better to over-estimate than under-estimate

### 3. Regular Audits

```sql
-- Monthly audit: Compare estimates to actuals
-- Run this query and adjust estimates as needed
SELECT
  provider,
  model,
  operation_type,
  confidence_level,
  estimated_cost_usd,
  description,
  updated_at,
  CASE
    WHEN updated_at < NOW() - INTERVAL '90 days' THEN 'REVIEW NEEDED'
    ELSE 'OK'
  END AS status
FROM copilot_internal.llm_cost_estimates
WHERE expires_at IS NULL
ORDER BY updated_at ASC;
```

### 4. Document Assumptions

Always include `description` and `assumptions` fields:

```sql
INSERT INTO copilot_internal.llm_cost_estimates (
  provider, model, operation_type,
  estimated_cost_usd, confidence_level,
  description, assumptions  -- Always include these!
)
VALUES (
  'anthropic', 'claude-3-sonnet-20240229', 'chat',
  0.05, 'conservative',
  'Conservative estimate for typical chat request',
  'Assumes ~1500 input + 500 output tokens at $3/$15 per million'
);
```

### 5. Version Control Fallback Changes

Always commit fallback ENUM changes with clear messages:

```bash
git commit -m "feat: Update Claude 3 Sonnet fallback estimate from $0.05 to $0.055

- Vendor increased pricing from $3/$15 to $3.30/$16.50 per million tokens
- Updated conservative estimate to maintain safety margin
- Database estimates already updated via migration
- Refs: VENDOR-PRICING-NOTICE-2026-01-05"
```

## Emergency Procedures

### Database Unavailable

**Fallback ENUMs automatically kick in - no action needed**

Verify fallback operation:
```bash
# Check logs for fallback usage
kubectl logs -l app=demo-web | grep "fallback"

# Should see: "using fallback ENUM constant"
# Quota checks continue to work
```

### Need to Quickly Update Estimates

**Option 1: Database (preferred - instant)**
```sql
UPDATE copilot_internal.llm_cost_estimates
SET estimated_cost_usd = 0.10, updated_at = NOW()
WHERE provider = 'anthropic' AND model = 'claude-3-opus-20240229';

-- Takes effect immediately (cache TTL: 1 hour max)
```

**Option 2: Fallback ENUM (requires deployment)**
1. Edit `fallbacks.ts`
2. Build and deploy
3. Takes effect on next deployment

## Related Documentation

- **Implementation**: `docs/implementation/COST_ESTIMATION_SERVICE_IMPLEMENTATION.md`
- **Architecture**: `docs/architecture/COST_TRACKING_ARCHITECTURE.md`
- **Migration**: `supabase/migrations/20260105000002_cost_estimates.sql`
- **Actual Cost Tracking**: `docs/devops/COST_TRACKING_MANAGEMENT.md`

## Support Contacts

- **Database Issues**: DBA team
- **Application Issues**: Platform team
- **Pricing Updates**: Finance team
- **Vendor Pricing Changes**: Vendor management team
