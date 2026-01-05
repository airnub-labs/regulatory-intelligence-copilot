# Cost Estimation Service Implementation Plan

> **⚠️ IMPORTANT - ACTUAL IMPLEMENTATION DIFFERS FROM THIS PLAN**
>
> This plan document has been **ARCHIVED** because the actual implementation took a different approach based on clarified requirements:
>
> **This Plan Said (INCORRECT)**:
> - "No hardcoded fallbacks"
> - "Return null and skip quota checks when database unavailable"
> - "No data is better than inaccurate data" for quota estimation
>
> **Actual Implementation (CORRECT)**:
> - **Fallback ENUM constants ARE used** when database unavailable (in `fallbacks.ts`)
> - **Quota checks ALWAYS happen** - never skipped
> - Service ALWAYS returns a `number`, never `null`
> - "No data is better than inaccurate data" applies ONLY to actual cost recording for billing, NOT to pre-request quota estimation
>
> **See Actual Documentation**:
> - Implementation: `docs/implementation/COST_ESTIMATION_SERVICE_IMPLEMENTATION.md`
> - DevOps Guide: `docs/devops/COST_ESTIMATION_MANAGEMENT.md`
> - Architecture: `docs/architecture/COST_TRACKING_ARCHITECTURE.md` (Cost Estimation section)
>
> **Archived on**: 2026-01-05
>
> ---
>
> ## Original Plan (DO NOT USE - See note above)

## Overview

Replace all hardcoded cost estimates with database-backed estimates using transparent caching. **No hardcoded fallbacks** - if database estimates are unavailable, return null and skip quota checks (no data is better than inaccurate data).

## Current Hardcoded Cost Locations

### 1. E2B Sandbox Creation
**File**: `packages/reg-intel-conversations/src/executionContextManager.ts:384`
```typescript
const estimatedCostUsd = 0.03; // ❌ HARDCODED
```
**Context**: Used for quota check before creating E2B sandbox
**Required**: Estimate for 5-minute standard tier session

### 2. LLM Request Quota Check
**File**: `apps/demo-web/src/lib/costTracking.ts:273`
```typescript
estimatedCostUsd: number = 0.05 // ❌ HARDCODED DEFAULT
```
**Context**: Default parameter when caller doesn't provide estimate
**Callers**: `apps/demo-web/src/app/api/chat/route.ts:58` - doesn't pass estimate

### 3. E2B Pricing Service Fallback
**File**: `packages/reg-intel-observability/src/e2b/pricingService.ts:97-102`
```typescript
const FALLBACK_PRICING: Record<string, number> = {
  'standard': 0.0001,      // ❌ HARDCODED
  'gpu': 0.001,
  'high-memory': 0.0005,
  'high-cpu': 0.0003,
};
```
**Context**: Used by `estimateE2BCost()` function
**Status**: This may be acceptable as it's a utility function, but should be reviewed

## Database Schema

### LLM Cost Estimates Table
```sql
CREATE TABLE copilot_internal.llm_cost_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'chat', 'completion', 'embedding'
  estimated_cost_usd DECIMAL(10, 6) NOT NULL,
  confidence_level TEXT NOT NULL, -- 'conservative', 'typical', 'optimistic'
  description TEXT,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, model, operation_type, confidence_level)
);

-- Example data
INSERT INTO copilot_internal.llm_cost_estimates
  (provider, model, operation_type, estimated_cost_usd, confidence_level, description)
VALUES
  ('anthropic', 'claude-3-sonnet-20240229', 'chat', 0.05, 'conservative', 'Conservative estimate for typical chat request (~1000 input + 500 output tokens)'),
  ('anthropic', 'claude-3-sonnet-20240229', 'chat', 0.03, 'typical', 'Typical estimate for chat request'),
  ('anthropic', 'claude-3-opus-20240229', 'chat', 0.10, 'conservative', 'Conservative estimate for Opus chat'),
  ('openai', 'gpt-4', 'chat', 0.08, 'conservative', 'Conservative estimate for GPT-4 chat');
```

### E2B Cost Estimates Table
```sql
CREATE TABLE copilot_internal.e2b_cost_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'us-east-1',
  operation_type TEXT NOT NULL, -- 'standard_session', 'extended_session', 'quick_task'
  expected_duration_seconds INTEGER NOT NULL,
  estimated_cost_usd DECIMAL(10, 6) NOT NULL,
  confidence_level TEXT NOT NULL, -- 'conservative', 'typical', 'optimistic'
  description TEXT,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tier, region, operation_type, confidence_level)
);

-- Example data
INSERT INTO copilot_internal.e2b_cost_estimates
  (tier, region, operation_type, expected_duration_seconds, estimated_cost_usd, confidence_level, description)
VALUES
  ('standard', 'us-east-1', 'standard_session', 300, 0.03, 'conservative', '5-minute session at $0.0001/sec'),
  ('standard', 'us-east-1', 'extended_session', 900, 0.09, 'conservative', '15-minute session at $0.0001/sec'),
  ('standard', 'us-east-1', 'quick_task', 60, 0.006, 'conservative', '1-minute task at $0.0001/sec'),
  ('gpu', 'us-east-1', 'standard_session', 300, 0.30, 'conservative', '5-minute GPU session at $0.001/sec');
```

## Service Architecture

### Service Interface
```typescript
export interface CostEstimationService {
  /**
   * Get LLM cost estimate from database with caching
   * @returns Estimated cost in USD, or null if unavailable
   */
  getLLMCostEstimate(params: {
    provider: string;
    model: string;
    operationType?: string;
    confidenceLevel?: 'conservative' | 'typical' | 'optimistic';
  }): Promise<number | null>;

  /**
   * Get E2B cost estimate from database with caching
   * @returns Estimated cost in USD, or null if unavailable
   */
  getE2BCostEstimate(params: {
    tier: string;
    region?: string;
    operationType?: string;
    confidenceLevel?: 'conservative' | 'typical' | 'optimistic';
  }): Promise<number | null>;
}
```

### Implementation
```typescript
// packages/reg-intel-observability/src/costEstimation/service.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import { createTransparentCache } from '@reg-copilot/reg-intel-cache';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('CostEstimationService');

export class SupabaseCostEstimationService implements CostEstimationService {
  private readonly client: SupabaseClient;
  private readonly llmCache: TransparentCache<number>;
  private readonly e2bCache: TransparentCache<number>;

  constructor(client: SupabaseClient, options?: {
    redisClient?: RedisKeyValueClient;
    cacheTtlSeconds?: number;
  }) {
    this.client = client;

    // Create transparent caches with 1-hour TTL
    const ttl = options?.cacheTtlSeconds ?? 3600;
    this.llmCache = createTransparentCache({
      backend: 'memory', // Or redis if provided
      ttlSeconds: ttl,
      keyPrefix: 'cost-estimate:llm:',
    });
    this.e2bCache = createTransparentCache({
      backend: 'memory',
      ttlSeconds: ttl,
      keyPrefix: 'cost-estimate:e2b:',
    });
  }

  async getLLMCostEstimate(params: {
    provider: string;
    model: string;
    operationType?: string;
    confidenceLevel?: 'conservative' | 'typical' | 'optimistic';
  }): Promise<number | null> {
    const opType = params.operationType ?? 'chat';
    const confidence = params.confidenceLevel ?? 'conservative';

    // Build cache key
    const cacheKey = `${params.provider}:${params.model}:${opType}:${confidence}`;

    // Check cache
    const cached = await this.llmCache.get(cacheKey);
    if (cached !== null) {
      logger.debug({ cacheKey }, 'LLM cost estimate cache hit');
      return cached;
    }

    // Query database
    logger.debug({ params }, 'Querying LLM cost estimate from database');
    const { data, error } = await this.client
      .from('copilot_internal.llm_cost_estimates')
      .select('estimated_cost_usd')
      .eq('provider', params.provider.toLowerCase())
      .eq('model', params.model.toLowerCase())
      .eq('operation_type', opType)
      .eq('confidence_level', confidence)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error({ error, params }, 'Failed to query LLM cost estimate');
      return null;
    }

    const estimate = data?.estimated_cost_usd ? Number(data.estimated_cost_usd) : null;

    // Cache result (even if null to avoid repeated queries)
    await this.llmCache.set(cacheKey, estimate);

    if (estimate === null) {
      logger.warn({ params }, 'LLM cost estimate not found in database');
    }

    return estimate;
  }

  async getE2BCostEstimate(params: {
    tier: string;
    region?: string;
    operationType?: string;
    confidenceLevel?: 'conservative' | 'typical' | 'optimistic';
  }): Promise<number | null> {
    const region = params.region ?? 'us-east-1';
    const opType = params.operationType ?? 'standard_session';
    const confidence = params.confidenceLevel ?? 'conservative';

    // Build cache key
    const cacheKey = `${params.tier}:${region}:${opType}:${confidence}`;

    // Check cache
    const cached = await this.e2bCache.get(cacheKey);
    if (cached !== null) {
      logger.debug({ cacheKey }, 'E2B cost estimate cache hit');
      return cached;
    }

    // Query database
    logger.debug({ params }, 'Querying E2B cost estimate from database');
    const { data, error } = await this.client
      .from('copilot_internal.e2b_cost_estimates')
      .select('estimated_cost_usd')
      .eq('tier', params.tier.toLowerCase())
      .eq('region', region.toLowerCase())
      .eq('operation_type', opType)
      .eq('confidence_level', confidence)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error({ error, params }, 'Failed to query E2B cost estimate');
      return null;
    }

    const estimate = data?.estimated_cost_usd ? Number(data.estimated_cost_usd) : null;

    // Cache result
    await this.e2bCache.set(cacheKey, estimate);

    if (estimate === null) {
      logger.warn({ params }, 'E2B cost estimate not found in database');
    }

    return estimate;
  }
}

// Global service instance
let globalCostEstimationService: CostEstimationService | null = null;

export function initCostEstimationService(service: CostEstimationService): void {
  globalCostEstimationService = service;
  logger.info('Cost estimation service initialized');
}

export function getCostEstimationService(): CostEstimationService {
  if (!globalCostEstimationService) {
    throw new Error('Cost estimation service not initialized');
  }
  return globalCostEstimationService;
}

export function getCostEstimationServiceIfInitialized(): CostEstimationService | null {
  return globalCostEstimationService;
}
```

## Integration Points

### 1. App Initialization
**File**: `apps/demo-web/src/lib/costEstimation.ts` (NEW)
```typescript
import { createClient } from '@supabase/supabase-js';
import {
  SupabaseCostEstimationService,
  initCostEstimationService,
  createLogger
} from '@reg-copilot/reg-intel-observability';

const logger = createLogger('CostEstimation');

let costEstimationService: SupabaseCostEstimationService | null = null;

export const initializeCostEstimation = (): void => {
  try {
    if (costEstimationService) {
      logger.info('Cost estimation already initialized');
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      logger.warn('Supabase credentials not available, skipping cost estimation initialization');
      return;
    }

    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'copilot_internal' },
    });

    costEstimationService = new SupabaseCostEstimationService(client);
    initCostEstimationService(costEstimationService);

    logger.info('Cost estimation service initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize cost estimation service');
  }
};

export const getCostEstimationService = () => costEstimationService;
```

Import in `apps/demo-web/src/app/layout.tsx` or similar startup file:
```typescript
import './lib/costEstimation'; // Side-effect import to initialize
```

### 2. Update ExecutionContextManager
**File**: `packages/reg-intel-conversations/src/executionContextManager.ts:384`

**BEFORE**:
```typescript
const estimatedCostUsd = 0.03;
```

**AFTER**:
```typescript
const { getCostEstimationServiceIfInitialized } = await import('@reg-copilot/reg-intel-observability');
const costEstimator = getCostEstimationServiceIfInitialized();

let estimatedCostUsd: number | null = null;
if (costEstimator) {
  estimatedCostUsd = await costEstimator.getE2BCostEstimate({
    tier: 'standard',
    region: 'us-east-1',
    operationType: 'standard_session',
    confidenceLevel: 'conservative',
  });
}

if (!estimatedCostUsd) {
  this.logger.warn('E2B cost estimate unavailable, skipping quota check');
  // Skip quota check - no data is better than inaccurate data
  // Continue to sandbox creation
} else {
  this.logger.debug({ tenantId: input.tenantId, estimatedCostUsd }, 'Checking E2B quota');

  if (this.config.quotaCheckCallback) {
    const quotaCheckCallback = this.config.quotaCheckCallback;
    await withSpan('e2b.quota_check', {
      'e2b.tenant_id': input.tenantId,
      'e2b.estimated_cost': estimatedCostUsd,
    }, async () => {
      const quotaResult = await quotaCheckCallback(input.tenantId, estimatedCostUsd!);
      // ... quota check logic
    });
  }
}
```

### 3. Update Chat Route
**File**: `apps/demo-web/src/app/api/chat/route.ts:58`

**BEFORE**:
```typescript
const quotaCheck = await checkLLMQuotaBeforeRequest(tenantId);
```

**AFTER**:
```typescript
import { getCostEstimationService } from '@/lib/costEstimation';

// Get cost estimate from database
const costEstimator = getCostEstimationService();
let estimatedCost: number | undefined;

if (costEstimator) {
  estimatedCost = await costEstimator.getLLMCostEstimate({
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229', // TODO: Get from actual model being used
    operationType: 'chat',
    confidenceLevel: 'conservative',
  }) ?? undefined;
}

const quotaCheck = await checkLLMQuotaBeforeRequest(tenantId, estimatedCost);
```

### 4. Update checkLLMQuotaBeforeRequest
**File**: `apps/demo-web/src/lib/costTracking.ts:271-274`

**BEFORE**:
```typescript
export const checkLLMQuotaBeforeRequest = async (
  tenantId: string,
  estimatedCostUsd: number = 0.05 // ❌ HARDCODED DEFAULT
)
```

**AFTER**:
```typescript
export const checkLLMQuotaBeforeRequest = async (
  tenantId: string,
  estimatedCostUsd?: number // Optional - if not provided, skip quota check
): Promise<{ allowed: boolean; reason?: string; quotaDetails?: QuotaDetails }> => {
  try {
    // If no estimate provided, skip quota check
    if (estimatedCostUsd === undefined) {
      logger.warn('No cost estimate provided, skipping quota check - no data is better than inaccurate data');
      return { allowed: true };
    }

    // ... rest of function
```

## Implementation Steps

1. **Create database migration** for `llm_cost_estimates` and `e2b_cost_estimates` tables
2. **Seed initial data** with conservative estimates
3. **Implement SupabaseCostEstimationService** in observability package
4. **Export service** from observability package index
5. **Create app initialization** in `apps/demo-web/src/lib/costEstimation.ts`
6. **Update executionContextManager** to use service
7. **Update chat route** to use service
8. **Update checkLLMQuotaBeforeRequest** signature to make estimate optional
9. **Test** with and without database availability
10. **Commit and push** changes

## Testing Strategy

### Unit Tests
- Test cache hit/miss scenarios
- Test database query errors
- Test null handling

### Integration Tests
- Test with database available (should use database estimates)
- Test with database unavailable (should skip quota checks)
- Test cache TTL expiration

### Manual Testing
1. Verify quota checks work with database estimates
2. Verify graceful degradation when database unavailable
3. Verify no hardcoded costs are used

## Success Criteria

✅ All hardcoded cost estimates removed
✅ Database-backed cost estimates with transparent caching
✅ Graceful degradation: skip quota checks when estimates unavailable
✅ No impact on existing functionality when database available
✅ Build passes without errors
✅ All tests pass
