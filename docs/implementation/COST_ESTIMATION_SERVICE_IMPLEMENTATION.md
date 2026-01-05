# Cost Estimation Service - Implementation Summary

**Status**: ✅ IMPLEMENTED
**Date**: 2026-01-05
**Implementation**: Phase 3 Cost Tracking

## Overview

The Cost Estimation Service provides database-backed cost estimates for quota checks BEFORE operations (LLM requests, E2B sandbox creation). It ensures quota enforcement ALWAYS happens using a database-first, fallback-second approach.

## Key Principle

**Quota enforcement MUST NEVER be disabled**. The service uses:
1. **Database values** (preferred - most accurate, updateable via SQL)
2. **Fallback ENUM constants** (when database unavailable - manually updateable in code)
3. **Default constants** (last resort - generic values)

This differs from actual cost recording (billing), which uses database ONLY with no fallbacks.

## Architecture

### Two Distinct Systems

| Aspect | Pre-Request Quota Estimation | Actual Cost Recording (Billing) |
|--------|----------------------------|----------------------------------|
| **Purpose** | Estimate cost BEFORE operation | Record actual cost AFTER operation |
| **Accuracy** | Conservative estimates acceptable | Must be exact, audit-quality |
| **Fallback** | ✅ Uses fallback ENUMs if DB unavailable | ❌ No fallbacks - DB required |
| **Impact if unavailable** | Uses fallback, quota still enforced | No cost recorded (warn only) |
| **Location** | `costEstimation/` module | `businessMetrics.ts` |
| **Tables** | `llm_cost_estimates`, `e2b_cost_estimates` | `llm_cost_records`, `e2b_cost_records` |

### Service Behavior

```typescript
// CostEstimationService.getLLMCostEstimate()
async getLLMCostEstimate(params): Promise<number> {
  // 1. Check in-memory cache (1-hour TTL)
  if (cached) return cached;

  // 2. Query database
  try {
    const dbValue = await queryDatabase(params);
    if (dbValue) {
      cache.set(dbValue);
      return dbValue; // ✅ Database value (most accurate)
    }
  } catch (error) {
    logger.warn('Database query failed, using fallback');
  }

  // 3. Use fallback ENUM
  const fallback = getLLMCostEstimateFallback(params);
  cache.set(fallback);
  return fallback; // ✅ Fallback constant (ensures quota enforcement)
}
```

**CRITICAL**: Service NEVER returns `null` or `undefined` - quota checks always happen.

## Implementation Details

### Files Created

1. **`packages/reg-intel-observability/src/costEstimation/types.ts`**
   - Type definitions for cost estimate parameters
   - Confidence levels, operation types

2. **`packages/reg-intel-observability/src/costEstimation/fallbacks.ts`**
   - `FALLBACK_LLM_COST_ESTIMATES` - comprehensive LLM fallbacks
   - `FALLBACK_E2B_COST_ESTIMATES` - comprehensive E2B fallbacks
   - `getLLMCostEstimateFallback()` - helper function
   - `getE2BCostEstimateFallback()` - helper function

3. **`packages/reg-intel-observability/src/costEstimation/service.ts`**
   - `CostEstimationService` interface
   - `SupabaseCostEstimationService` implementation
   - In-memory caching with TTL
   - Global service initialization

4. **`packages/reg-intel-observability/src/costEstimation/index.ts`**
   - Module exports

5. **`apps/demo-web/src/lib/costEstimation.ts`**
   - App-level initialization
   - Auto-initializes on module load

6. **`supabase/migrations/20260105000002_cost_estimates.sql`**
   - Database schema for cost estimates
   - Seeded with conservative estimates
   - Helper functions for lookups

### Files Modified

1. **`packages/reg-intel-conversations/src/executionContextManager.ts`**
   - E2B quota check now uses CostEstimationService
   - Removed hardcoded `0.03` estimate
   - Falls back to ENUM if service unavailable

2. **`apps/demo-web/src/app/api/chat/route.ts`**
   - LLM quota check now uses CostEstimationService
   - Removed hardcoded `0.05` estimate
   - Falls back to ENUM if service unavailable

3. **`apps/demo-web/src/lib/costTracking.ts`**
   - `checkLLMQuotaBeforeRequest()` parameter now required (not optional)
   - Always performs quota check with provided estimate

4. **`packages/reg-intel-observability/src/businessMetrics.ts`**
   - `recordE2BCost()` removed hardcoded fallback
   - Only records to database when services initialized
   - No cost recording when unavailable (billing accuracy requirement)

## Database Schema

### LLM Cost Estimates

```sql
CREATE TABLE copilot_internal.llm_cost_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,           -- 'anthropic', 'openai', 'google'
  model TEXT NOT NULL,               -- 'claude-3-sonnet-20240229', 'gpt-4'
  operation_type TEXT NOT NULL,     -- 'chat', 'completion', 'tool_use', 'embedding'
  estimated_cost_usd DECIMAL(10,6) NOT NULL,
  confidence_level TEXT NOT NULL,   -- 'conservative', 'typical', 'optimistic'
  description TEXT,
  assumptions TEXT,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, model, operation_type, confidence_level)
);
```

**Seeded Values** (see migration for full list):
- Anthropic: Claude 3 Sonnet, Opus, Haiku
- OpenAI: GPT-4 Turbo, GPT-4o, GPT-4o Mini, GPT-3.5 Turbo
- Multiple operation types and confidence levels

### E2B Cost Estimates

```sql
CREATE TABLE copilot_internal.e2b_cost_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL,                           -- 'standard', 'gpu', 'high-memory', 'high-cpu'
  region TEXT NOT NULL DEFAULT 'us-east-1',     -- AWS region
  operation_type TEXT NOT NULL,                 -- 'quick_task', 'standard_session', etc.
  expected_duration_seconds INTEGER NOT NULL,   -- Expected runtime
  estimated_cost_usd DECIMAL(10,6) NOT NULL,
  confidence_level TEXT NOT NULL,               -- 'conservative', 'typical', 'optimistic'
  description TEXT,
  assumptions TEXT,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tier, region, operation_type, confidence_level)
);
```

**Seeded Values** (see migration for full list):
- All tiers: standard, gpu, high-memory, high-cpu
- Multiple operation types: quick_task, standard_session, extended_session, long_running

## Fallback ENUM Constants

### LLM Fallbacks

Located in `packages/reg-intel-observability/src/costEstimation/fallbacks.ts`:

```typescript
export const FALLBACK_LLM_COST_ESTIMATES: Record<
  string, // provider
  Record<string, // model
    Record<LLMOperationType,
      Record<ConfidenceLevel, number>
    >
  >
> = {
  anthropic: {
    'claude-3-sonnet-20240229': {
      chat: { conservative: 0.05, typical: 0.03, optimistic: 0.02 },
      tool_use: { conservative: 0.08, typical: 0.05, optimistic: 0.03 },
      // ...
    },
    // ... more models
  },
  openai: {
    'gpt-4-turbo': {
      chat: { conservative: 0.04, typical: 0.025, optimistic: 0.015 },
      // ...
    },
    // ... more models
  },
};
```

### E2B Fallbacks

```typescript
export const FALLBACK_E2B_COST_ESTIMATES: Record<
  string, // tier
  Record<string, // region
    Record<E2BOperationType,
      Record<ConfidenceLevel, number>
    >
  >
> = {
  standard: {
    'us-east-1': {
      quick_task: { conservative: 0.006, typical: 0.005, optimistic: 0.004 },
      standard_session: { conservative: 0.03, typical: 0.025, optimistic: 0.02 },
      // ...
    },
  },
  // ... more tiers
};
```

## Usage Examples

### LLM Quota Check (Chat API)

```typescript
// apps/demo-web/src/app/api/chat/route.ts
const costEstimator = getCostEstimationService();
let estimatedCost: number;

if (costEstimator) {
  // Use service (database → fallback)
  estimatedCost = await costEstimator.getLLMCostEstimate({
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    operationType: 'chat',
    confidenceLevel: 'conservative',
  });
} else {
  // Service not initialized - use fallback directly
  estimatedCost = getLLMCostEstimateFallback(
    'anthropic',
    'claude-3-sonnet-20240229',
    'chat',
    'conservative'
  );
}

// Quota check ALWAYS happens
const quotaCheck = await checkLLMQuotaBeforeRequest(tenantId, estimatedCost);
```

### E2B Quota Check (Sandbox Creation)

```typescript
// packages/reg-intel-conversations/src/executionContextManager.ts
const costEstimator = getCostEstimationServiceIfInitialized();
let estimatedCostUsd: number;

if (costEstimator) {
  // Use service (database → fallback)
  estimatedCostUsd = await costEstimator.getE2BCostEstimate({
    tier: 'standard',
    region: 'us-east-1',
    operationType: 'standard_session',
    confidenceLevel: 'conservative',
  });
} else {
  // Service not initialized - use fallback directly
  estimatedCostUsd = getE2BCostEstimateFallback(
    'standard',
    'us-east-1',
    'standard_session',
    'conservative'
  );
}

// Quota check ALWAYS happens
await quotaCheckCallback(tenantId, estimatedCostUsd);
```

## Service Initialization

Auto-initializes at app startup via side-effect import:

```typescript
// apps/demo-web/src/lib/costEstimation.ts
export const initializeCostEstimation = (): void => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Supabase credentials not available, service will use fallback ENUMs');
    return;
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'copilot_internal' },
  });

  const service = new SupabaseCostEstimationService(client, {
    cacheTtlSeconds: 3600, // 1 hour
  });

  initCostEstimationService(service);
};

// Auto-initialize on module load
initializeCostEstimation();
```

## Caching Strategy

- **In-memory cache** with 1-hour TTL
- **Cache key format**: `${provider}:${model}:${operation}:${confidence}`
- **Cache invalidation**: Automatic TTL expiration
- **Manual clear**: `service.clearCache()`

## Testing

✅ TypeScript compilation passes
✅ Quota checks ALWAYS enforced (database or fallback)
✅ Graceful degradation when database unavailable
✅ No impact on existing functionality

## Migration Path

1. **Database migration**: Run `20260105000002_cost_estimates.sql`
2. **Service initialization**: Automatic on app startup
3. **Fallback safety**: Works without database via fallback ENUMs
4. **Monitoring**: Check logs for fallback usage

## Maintenance

### Updating Database Estimates

```sql
-- Update existing estimate
UPDATE copilot_internal.llm_cost_estimates
SET estimated_cost_usd = 0.06, updated_at = NOW()
WHERE provider = 'anthropic'
  AND model = 'claude-3-sonnet-20240229'
  AND operation_type = 'chat'
  AND confidence_level = 'conservative';

-- Add new model estimate
INSERT INTO copilot_internal.llm_cost_estimates
  (provider, model, operation_type, estimated_cost_usd, confidence_level, description)
VALUES
  ('openai', 'gpt-5', 'chat', 0.10, 'conservative', 'GPT-5 conservative estimate');
```

### Updating Fallback ENUMs

Edit `packages/reg-intel-observability/src/costEstimation/fallbacks.ts`:

```typescript
// Update existing fallback
'claude-3-sonnet-20240229': {
  chat: { conservative: 0.06, typical: 0.04, optimistic: 0.03 }, // Updated
},

// Add new model fallback
'gpt-5': {
  chat: { conservative: 0.10, typical: 0.07, optimistic: 0.05 },
},
```

Commit and deploy the code change.

## Related Documents

- **Migration**: `supabase/migrations/20260105000002_cost_estimates.sql`
- **DevOps Guide**: `docs/devops/COST_ESTIMATION_MANAGEMENT.md`
- **Architecture**: `docs/architecture/COST_TRACKING_ARCHITECTURE.md`
- **Implementation Plan** (archived): `docs/archive/cost-estimation/COST_ESTIMATION_SERVICE_PLAN.md`

## Success Criteria

✅ All hardcoded cost estimates removed from quota checks
✅ Database-backed estimates with transparent caching
✅ Fallback ENUMs ensure quota enforcement never disabled
✅ Actual cost recording (billing) uses database only
✅ Clear separation between estimation and recording
✅ Documentation complete for devops/support teams
