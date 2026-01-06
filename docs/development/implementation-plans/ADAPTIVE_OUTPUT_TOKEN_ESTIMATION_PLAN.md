# Adaptive Output Token Estimation Implementation Plan

**Status**: 📋 Proposed
**Date**: 2026-01-06
**Author**: Platform Infrastructure Team
**Priority**: Medium-High (Cost Accuracy Improvement)

---

## Executive Summary

This document outlines the implementation plan for **Adaptive Output Token Estimation**, a system that learns from historical user behavior to improve LLM cost estimation accuracy. Instead of using static per-model estimates, this system tracks actual input/output token ratios per user and uses statistical methods to predict expected output tokens for quota enforcement.

### Problem Statement

**Current State**:
- Pre-request quota estimation uses **static cost estimates** per model
- Example: Claude 3 Sonnet chat = $0.05 (conservative estimate)
- Same estimate for ALL users regardless of actual usage patterns
- No feedback loop from actual costs to future estimates

**Issues**:
1. **Inaccurate estimates**: Users with consistent short responses get overcharged in quota
2. **No personalization**: Power users and casual users treated identically
3. **Quota friction**: Conservative estimates may block legitimate requests unnecessarily
4. **No learning**: System doesn't improve over time

### Proposed Solution

Implement an **Adaptive Output Token Estimator** that:
1. Tracks historical input/output token ratios per user
2. Uses exponential moving average (EMA) to weight recent behavior
3. Falls back through hierarchy: User → Tenant → Platform → Static defaults
4. Continuously improves accuracy as usage data accumulates

---

## Industry Best Practices Research

### How Others Solve This

| Approach | Used By | Pros | Cons |
|----------|---------|------|------|
| **Static Multipliers** | Most SaaS | Simple, predictable | Inaccurate, no personalization |
| **Exponential Moving Average** | AWS Cost Explorer | Adapts quickly, lightweight | Needs warmup period |
| **Percentile-Based (P75/P90)** | Cloud billing | Conservative, reliable | May over-estimate |
| **Task-Type Classification** | OpenAI fine-tuning | Accurate per task | Complex to classify |
| **ML Prediction Models** | Enterprise platforms | Most accurate | High complexity, latency |
| **Hybrid (EMA + Bounds)** | **Recommended** | Balanced accuracy/simplicity | Moderate complexity |

### Recommended Approach: Hybrid EMA with Bounds

```
estimated_output_tokens = clamp(
  user_ema_ratio × input_tokens,
  min_bound,
  max_bound
)

where:
  user_ema_ratio = α × current_ratio + (1 - α) × previous_ema
  α = 0.2 (smoothing factor)
  min_bound = 0.1 × input_tokens  (prevent unrealistically low estimates)
  max_bound = 5.0 × input_tokens  (prevent runaway estimates)
```

---

## Technical Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Adaptive Output Token Estimation                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────────┐
│ Token Pattern     │   │ Adaptive Estimator│   │ Learning Pipeline     │
│ Storage           │   │ Service           │   │ (Post-Request)        │
│                   │   │                   │   │                       │
│ • User patterns   │   │ • EMA calculation │   │ • Record actual ratio │
│ • Tenant patterns │   │ • Fallback chain  │   │ • Update EMA          │
│ • Platform stats  │   │ • Bounds checking │   │ • Prune stale data    │
└───────────────────┘   └───────────────────┘   └───────────────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │ Cost Estimation Service       │
                    │ (Enhanced with Adaptive)      │
                    │                               │
                    │ 1. Get input token count      │
                    │ 2. Estimate output tokens     │
                    │ 3. Calculate estimated cost   │
                    │ 4. Perform quota check        │
                    └───────────────────────────────┘
```

### Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PRE-REQUEST ESTIMATION                                                    │
└──────────────────────────────────────────────────────────────────────────┘

User Request (with input tokens)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ 1. Count Input Tokens (tiktoken - exact)            │
│    input_tokens = tiktoken.encode(prompt).length    │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ 2. Estimate Output Tokens (adaptive - learned)      │
│                                                     │
│    a. Lookup user's EMA ratio for this model        │
│       → Found? Use user_ratio                       │
│       → Not found? Fallback to tenant ratio         │
│       → Not found? Fallback to platform ratio       │
│       → Not found? Use static model default         │
│                                                     │
│    b. Calculate: output_estimate = ratio × input    │
│                                                     │
│    c. Apply bounds:                                 │
│       output_estimate = clamp(estimate, min, max)   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ 3. Calculate Estimated Cost                         │
│    input_cost = (input_tokens / 1M) × input_price   │
│    output_cost = (output_est / 1M) × output_price   │
│    total_estimate = input_cost + output_cost        │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ 4. Quota Check                                      │
│    allowed = current_spend + estimate <= limit      │
└─────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────┐
│ POST-REQUEST LEARNING                                                     │
└──────────────────────────────────────────────────────────────────────────┘

LLM Response (with actual output tokens)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ 1. Record Actual Tokens                             │
│    actual_input = response.usage.input_tokens       │
│    actual_output = response.usage.output_tokens     │
│    actual_ratio = actual_output / actual_input      │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ 2. Update User's EMA                                │
│    new_ema = α × actual_ratio + (1-α) × old_ema     │
│    where α = 0.2 (smoothing factor)                 │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ 3. Aggregate to Tenant & Platform                   │
│    (Batch job, runs hourly)                         │
│    tenant_ema = avg(user_emas) for tenant           │
│    platform_ema = avg(tenant_emas) for platform     │
└─────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

```sql
-- ============================================================================
-- USER TOKEN PATTERNS
-- Stores learned input/output ratios per user, per model
-- ============================================================================
CREATE TABLE copilot_internal.user_token_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL,                    -- 'anthropic', 'openai', etc.
  model TEXT NOT NULL,                       -- 'claude-3-sonnet-20240229'

  -- Learned Statistics
  ema_output_ratio NUMERIC(8, 4) NOT NULL,   -- EMA of (output/input) ratio
  sample_count INTEGER NOT NULL DEFAULT 0,   -- Number of samples used
  total_input_tokens BIGINT DEFAULT 0,       -- Total input tokens processed
  total_output_tokens BIGINT DEFAULT 0,      -- Total output tokens generated

  -- Distribution Stats (for percentile-based estimation)
  min_ratio NUMERIC(8, 4),                   -- Minimum observed ratio
  max_ratio NUMERIC(8, 4),                   -- Maximum observed ratio
  p50_ratio NUMERIC(8, 4),                   -- Median ratio (updated periodically)
  p90_ratio NUMERIC(8, 4),                   -- 90th percentile ratio

  -- Configuration
  smoothing_factor NUMERIC(4, 3) DEFAULT 0.2, -- α in EMA formula
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, provider, model)
);

-- Indexes for fast lookups
CREATE INDEX idx_user_token_patterns_user_model
  ON copilot_internal.user_token_patterns(user_id, provider, model);
CREATE INDEX idx_user_token_patterns_tenant
  ON copilot_internal.user_token_patterns(tenant_id, provider, model);
CREATE INDEX idx_user_token_patterns_updated
  ON copilot_internal.user_token_patterns(last_updated_at);

-- ============================================================================
-- TENANT TOKEN PATTERNS
-- Aggregated patterns at tenant level (for user fallback)
-- ============================================================================
CREATE TABLE copilot_internal.tenant_token_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Aggregated Statistics
  ema_output_ratio NUMERIC(8, 4) NOT NULL,
  active_user_count INTEGER DEFAULT 0,       -- Users contributing to aggregate
  sample_count INTEGER DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- Distribution
  min_ratio NUMERIC(8, 4),
  max_ratio NUMERIC(8, 4),
  p50_ratio NUMERIC(8, 4),
  p90_ratio NUMERIC(8, 4),

  -- Metadata
  last_aggregated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, provider, model)
);

CREATE INDEX idx_tenant_token_patterns_lookup
  ON copilot_internal.tenant_token_patterns(tenant_id, provider, model);

-- ============================================================================
-- PLATFORM TOKEN PATTERNS
-- Platform-wide aggregates (for tenant fallback)
-- ============================================================================
CREATE TABLE copilot_internal.platform_token_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Aggregated Statistics
  ema_output_ratio NUMERIC(8, 4) NOT NULL,
  active_tenant_count INTEGER DEFAULT 0,
  active_user_count INTEGER DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- Distribution
  min_ratio NUMERIC(8, 4),
  max_ratio NUMERIC(8, 4),
  p50_ratio NUMERIC(8, 4),
  p90_ratio NUMERIC(8, 4),

  -- Metadata
  last_aggregated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(provider, model)
);

CREATE INDEX idx_platform_token_patterns_lookup
  ON copilot_internal.platform_token_patterns(provider, model);

-- ============================================================================
-- TOKEN PATTERN HISTORY
-- Historical snapshots for trend analysis and debugging
-- ============================================================================
CREATE TABLE copilot_internal.token_pattern_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  scope TEXT NOT NULL,                       -- 'user', 'tenant', 'platform'
  scope_id UUID,                             -- NULL for platform
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Snapshot
  ema_output_ratio NUMERIC(8, 4) NOT NULL,
  sample_count INTEGER NOT NULL,

  -- Timestamp
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned by month for efficient pruning
-- CREATE TABLE ... PARTITION BY RANGE (snapshot_at);

CREATE INDEX idx_token_pattern_history_lookup
  ON copilot_internal.token_pattern_history(scope, scope_id, provider, model, snapshot_at DESC);
```

### Helper Functions

```sql
-- ============================================================================
-- GET OUTPUT TOKEN ESTIMATE
-- Returns estimated output tokens using learned patterns with fallback chain
-- ============================================================================
CREATE OR REPLACE FUNCTION copilot_internal.estimate_output_tokens(
  p_user_id UUID,
  p_tenant_id UUID,
  p_provider TEXT,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_confidence_level TEXT DEFAULT 'typical'  -- 'optimistic', 'typical', 'conservative'
) RETURNS TABLE (
  estimated_output_tokens INTEGER,
  ratio_used NUMERIC,
  ratio_source TEXT,                         -- 'user', 'tenant', 'platform', 'default'
  sample_count INTEGER,
  confidence_score NUMERIC
) AS $$
DECLARE
  v_ratio NUMERIC;
  v_source TEXT;
  v_samples INTEGER;
  v_min_bound NUMERIC := 0.1;               -- Minimum ratio bound
  v_max_bound NUMERIC := 5.0;               -- Maximum ratio bound
  v_default_ratio NUMERIC := 0.8;           -- Default output/input ratio
  v_confidence NUMERIC;
BEGIN
  -- 1. Try user-level pattern
  SELECT
    CASE p_confidence_level
      WHEN 'conservative' THEN COALESCE(p90_ratio, ema_output_ratio * 1.3)
      WHEN 'optimistic' THEN COALESCE(LEAST(p50_ratio, ema_output_ratio * 0.7), ema_output_ratio * 0.7)
      ELSE ema_output_ratio
    END,
    sample_count
  INTO v_ratio, v_samples
  FROM copilot_internal.user_token_patterns
  WHERE user_id = p_user_id
    AND provider = p_provider
    AND model = p_model
    AND sample_count >= 5;  -- Require minimum samples for reliability

  IF v_ratio IS NOT NULL THEN
    v_source := 'user';
    v_confidence := LEAST(0.95, 0.5 + (v_samples::NUMERIC / 200));  -- More samples = higher confidence
  ELSE
    -- 2. Try tenant-level pattern
    SELECT
      CASE p_confidence_level
        WHEN 'conservative' THEN COALESCE(p90_ratio, ema_output_ratio * 1.3)
        WHEN 'optimistic' THEN COALESCE(LEAST(p50_ratio, ema_output_ratio * 0.7), ema_output_ratio * 0.7)
        ELSE ema_output_ratio
      END,
      sample_count
    INTO v_ratio, v_samples
    FROM copilot_internal.tenant_token_patterns
    WHERE tenant_id = p_tenant_id
      AND provider = p_provider
      AND model = p_model
      AND sample_count >= 20;  -- Require more samples at tenant level

    IF v_ratio IS NOT NULL THEN
      v_source := 'tenant';
      v_confidence := LEAST(0.85, 0.4 + (v_samples::NUMERIC / 500));
    ELSE
      -- 3. Try platform-level pattern
      SELECT
        CASE p_confidence_level
          WHEN 'conservative' THEN COALESCE(p90_ratio, ema_output_ratio * 1.3)
          WHEN 'optimistic' THEN COALESCE(LEAST(p50_ratio, ema_output_ratio * 0.7), ema_output_ratio * 0.7)
          ELSE ema_output_ratio
        END,
        sample_count
      INTO v_ratio, v_samples
      FROM copilot_internal.platform_token_patterns
      WHERE provider = p_provider
        AND model = p_model
        AND sample_count >= 100;  -- Require significant samples at platform level

      IF v_ratio IS NOT NULL THEN
        v_source := 'platform';
        v_confidence := LEAST(0.75, 0.3 + (v_samples::NUMERIC / 2000));
      ELSE
        -- 4. Use static default
        v_ratio := v_default_ratio;
        v_source := 'default';
        v_samples := 0;
        v_confidence := 0.5;
      END IF;
    END IF;
  END IF;

  -- Apply bounds
  v_ratio := GREATEST(v_min_bound, LEAST(v_max_bound, v_ratio));

  RETURN QUERY SELECT
    CEIL(p_input_tokens * v_ratio)::INTEGER,
    v_ratio,
    v_source,
    v_samples,
    v_confidence;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- UPDATE USER TOKEN PATTERN
-- Updates user's EMA after a completed LLM request
-- ============================================================================
CREATE OR REPLACE FUNCTION copilot_internal.update_user_token_pattern(
  p_user_id UUID,
  p_tenant_id UUID,
  p_provider TEXT,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_smoothing_factor NUMERIC DEFAULT 0.2
) RETURNS VOID AS $$
DECLARE
  v_current_ema NUMERIC;
  v_new_ratio NUMERIC;
  v_new_ema NUMERIC;
BEGIN
  -- Calculate new ratio
  IF p_input_tokens > 0 THEN
    v_new_ratio := p_output_tokens::NUMERIC / p_input_tokens;
  ELSE
    RETURN;  -- Skip if no input tokens
  END IF;

  -- Upsert pattern
  INSERT INTO copilot_internal.user_token_patterns (
    user_id, tenant_id, provider, model,
    ema_output_ratio, sample_count,
    total_input_tokens, total_output_tokens,
    min_ratio, max_ratio,
    smoothing_factor, last_updated_at
  )
  VALUES (
    p_user_id, p_tenant_id, p_provider, p_model,
    v_new_ratio, 1,
    p_input_tokens, p_output_tokens,
    v_new_ratio, v_new_ratio,
    p_smoothing_factor, NOW()
  )
  ON CONFLICT (user_id, provider, model) DO UPDATE SET
    ema_output_ratio = EXCLUDED.smoothing_factor * v_new_ratio
                     + (1 - EXCLUDED.smoothing_factor) * user_token_patterns.ema_output_ratio,
    sample_count = user_token_patterns.sample_count + 1,
    total_input_tokens = user_token_patterns.total_input_tokens + p_input_tokens,
    total_output_tokens = user_token_patterns.total_output_tokens + p_output_tokens,
    min_ratio = LEAST(user_token_patterns.min_ratio, v_new_ratio),
    max_ratio = GREATEST(user_token_patterns.max_ratio, v_new_ratio),
    last_updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AGGREGATE TENANT PATTERNS
-- Aggregates user patterns to tenant level (run hourly)
-- ============================================================================
CREATE OR REPLACE FUNCTION copilot_internal.aggregate_tenant_token_patterns()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  INSERT INTO copilot_internal.tenant_token_patterns (
    tenant_id, provider, model,
    ema_output_ratio, active_user_count, sample_count,
    total_input_tokens, total_output_tokens,
    min_ratio, max_ratio, p50_ratio, p90_ratio,
    last_aggregated_at
  )
  SELECT
    tenant_id,
    provider,
    model,
    AVG(ema_output_ratio),
    COUNT(DISTINCT user_id),
    SUM(sample_count),
    SUM(total_input_tokens),
    SUM(total_output_tokens),
    MIN(min_ratio),
    MAX(max_ratio),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ema_output_ratio),
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ema_output_ratio),
    NOW()
  FROM copilot_internal.user_token_patterns
  WHERE last_updated_at > NOW() - INTERVAL '30 days'
    AND sample_count >= 5
  GROUP BY tenant_id, provider, model
  ON CONFLICT (tenant_id, provider, model) DO UPDATE SET
    ema_output_ratio = EXCLUDED.ema_output_ratio,
    active_user_count = EXCLUDED.active_user_count,
    sample_count = EXCLUDED.sample_count,
    total_input_tokens = EXCLUDED.total_input_tokens,
    total_output_tokens = EXCLUDED.total_output_tokens,
    min_ratio = EXCLUDED.min_ratio,
    max_ratio = EXCLUDED.max_ratio,
    p50_ratio = EXCLUDED.p50_ratio,
    p90_ratio = EXCLUDED.p90_ratio,
    last_aggregated_at = NOW();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AGGREGATE PLATFORM PATTERNS
-- Aggregates tenant patterns to platform level (run hourly)
-- ============================================================================
CREATE OR REPLACE FUNCTION copilot_internal.aggregate_platform_token_patterns()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  INSERT INTO copilot_internal.platform_token_patterns (
    provider, model,
    ema_output_ratio, active_tenant_count, active_user_count, sample_count,
    total_input_tokens, total_output_tokens,
    min_ratio, max_ratio, p50_ratio, p90_ratio,
    last_aggregated_at
  )
  SELECT
    provider,
    model,
    AVG(ema_output_ratio),
    COUNT(DISTINCT tenant_id),
    SUM(active_user_count),
    SUM(sample_count),
    SUM(total_input_tokens),
    SUM(total_output_tokens),
    MIN(min_ratio),
    MAX(max_ratio),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ema_output_ratio),
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ema_output_ratio),
    NOW()
  FROM copilot_internal.tenant_token_patterns
  WHERE last_aggregated_at > NOW() - INTERVAL '7 days'
    AND sample_count >= 20
  GROUP BY provider, model
  ON CONFLICT (provider, model) DO UPDATE SET
    ema_output_ratio = EXCLUDED.ema_output_ratio,
    active_tenant_count = EXCLUDED.active_tenant_count,
    active_user_count = EXCLUDED.active_user_count,
    sample_count = EXCLUDED.sample_count,
    total_input_tokens = EXCLUDED.total_input_tokens,
    total_output_tokens = EXCLUDED.total_output_tokens,
    min_ratio = EXCLUDED.min_ratio,
    max_ratio = EXCLUDED.max_ratio,
    p50_ratio = EXCLUDED.p50_ratio,
    p90_ratio = EXCLUDED.p90_ratio,
    last_aggregated_at = NOW();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;
```

---

## TypeScript Implementation

### File Structure

```
packages/reg-intel-core/src/
├── costEstimation/
│   ├── adaptiveEstimator/
│   │   ├── types.ts                    # Type definitions
│   │   ├── AdaptiveOutputEstimator.ts  # Main estimator service
│   │   ├── TokenPatternStore.ts        # Database interaction layer
│   │   ├── EMACalculator.ts            # EMA calculation utilities
│   │   ├── PatternAggregator.ts        # Aggregation job runner
│   │   └── index.ts                    # Module exports
│   ├── service.ts                      # Enhanced CostEstimationService
│   └── index.ts
```

### Core Types

```typescript
// packages/reg-intel-core/src/costEstimation/adaptiveEstimator/types.ts

export interface TokenPattern {
  userId?: string;
  tenantId?: string;
  provider: string;
  model: string;
  emaOutputRatio: number;
  sampleCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  minRatio?: number;
  maxRatio?: number;
  p50Ratio?: number;
  p90Ratio?: number;
  lastUpdatedAt: Date;
}

export interface OutputTokenEstimate {
  estimatedOutputTokens: number;
  ratioUsed: number;
  ratioSource: 'user' | 'tenant' | 'platform' | 'default';
  sampleCount: number;
  confidenceScore: number;  // 0.0 to 1.0
}

export interface AdaptiveEstimatorConfig {
  smoothingFactor: number;        // Default: 0.2
  minRatioBound: number;          // Default: 0.1
  maxRatioBound: number;          // Default: 5.0
  minUserSamples: number;         // Default: 5
  minTenantSamples: number;       // Default: 20
  minPlatformSamples: number;     // Default: 100
  defaultOutputRatio: number;     // Default: 0.8
  cacheTtlSeconds: number;        // Default: 300 (5 minutes)
}

export type ConfidenceLevel = 'optimistic' | 'typical' | 'conservative';
```

### Adaptive Estimator Service

```typescript
// packages/reg-intel-core/src/costEstimation/adaptiveEstimator/AdaptiveOutputEstimator.ts

import { SupabaseClient } from '@supabase/supabase-js';
import {
  TokenPattern,
  OutputTokenEstimate,
  AdaptiveEstimatorConfig,
  ConfidenceLevel,
} from './types.js';
import { TokenPatternStore } from './TokenPatternStore.js';
import { TransparentCache } from '@reg-copilot/reg-intel-cache';

const DEFAULT_CONFIG: AdaptiveEstimatorConfig = {
  smoothingFactor: 0.2,
  minRatioBound: 0.1,
  maxRatioBound: 5.0,
  minUserSamples: 5,
  minTenantSamples: 20,
  minPlatformSamples: 100,
  defaultOutputRatio: 0.8,
  cacheTtlSeconds: 300,
};

export class AdaptiveOutputEstimator {
  private store: TokenPatternStore;
  private cache: TransparentCache;
  private config: AdaptiveEstimatorConfig;

  constructor(
    supabaseClient: SupabaseClient,
    cache: TransparentCache,
    config?: Partial<AdaptiveEstimatorConfig>
  ) {
    this.store = new TokenPatternStore(supabaseClient);
    this.cache = cache;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate output tokens for a given request
   * Uses learned patterns with fallback chain: user → tenant → platform → default
   */
  async estimateOutputTokens(params: {
    userId: string;
    tenantId: string;
    provider: string;
    model: string;
    inputTokens: number;
    confidenceLevel?: ConfidenceLevel;
  }): Promise<OutputTokenEstimate> {
    const { userId, tenantId, provider, model, inputTokens } = params;
    const confidenceLevel = params.confidenceLevel ?? 'typical';

    // Check cache first
    const cacheKey = `adaptive:${userId}:${provider}:${model}`;
    const cached = await this.cache.get<TokenPattern>(cacheKey);

    let pattern: TokenPattern | null = cached ?? null;
    let source: OutputTokenEstimate['ratioSource'] = 'default';

    // 1. Try user pattern
    if (!pattern || pattern.sampleCount < this.config.minUserSamples) {
      pattern = await this.store.getUserPattern(userId, provider, model);
      if (pattern && pattern.sampleCount >= this.config.minUserSamples) {
        source = 'user';
        await this.cache.set(cacheKey, pattern, { ttlSeconds: this.config.cacheTtlSeconds });
      } else {
        pattern = null;
      }
    } else {
      source = 'user';
    }

    // 2. Try tenant pattern
    if (!pattern) {
      const tenantCacheKey = `adaptive:tenant:${tenantId}:${provider}:${model}`;
      pattern = await this.cache.get<TokenPattern>(tenantCacheKey);

      if (!pattern || pattern.sampleCount < this.config.minTenantSamples) {
        pattern = await this.store.getTenantPattern(tenantId, provider, model);
        if (pattern && pattern.sampleCount >= this.config.minTenantSamples) {
          source = 'tenant';
          await this.cache.set(tenantCacheKey, pattern, { ttlSeconds: this.config.cacheTtlSeconds });
        } else {
          pattern = null;
        }
      } else {
        source = 'tenant';
      }
    }

    // 3. Try platform pattern
    if (!pattern) {
      const platformCacheKey = `adaptive:platform:${provider}:${model}`;
      pattern = await this.cache.get<TokenPattern>(platformCacheKey);

      if (!pattern || pattern.sampleCount < this.config.minPlatformSamples) {
        pattern = await this.store.getPlatformPattern(provider, model);
        if (pattern && pattern.sampleCount >= this.config.minPlatformSamples) {
          source = 'platform';
          await this.cache.set(platformCacheKey, pattern, { ttlSeconds: this.config.cacheTtlSeconds * 2 });
        } else {
          pattern = null;
        }
      } else {
        source = 'platform';
      }
    }

    // Calculate estimate
    let ratio: number;
    let sampleCount: number;
    let confidenceScore: number;

    if (pattern) {
      ratio = this.selectRatioByConfidence(pattern, confidenceLevel);
      sampleCount = pattern.sampleCount;
      confidenceScore = this.calculateConfidence(source, sampleCount);
    } else {
      // 4. Use static default
      ratio = this.config.defaultOutputRatio;
      sampleCount = 0;
      confidenceScore = 0.5;
      source = 'default';
    }

    // Apply bounds
    ratio = Math.max(this.config.minRatioBound, Math.min(this.config.maxRatioBound, ratio));

    const estimatedOutputTokens = Math.ceil(inputTokens * ratio);

    return {
      estimatedOutputTokens,
      ratioUsed: ratio,
      ratioSource: source,
      sampleCount,
      confidenceScore,
    };
  }

  /**
   * Record actual tokens after request completion (learning)
   */
  async recordActualTokens(params: {
    userId: string;
    tenantId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    const { userId, tenantId, provider, model, inputTokens, outputTokens } = params;

    if (inputTokens <= 0) return;

    await this.store.updateUserPattern({
      userId,
      tenantId,
      provider,
      model,
      inputTokens,
      outputTokens,
      smoothingFactor: this.config.smoothingFactor,
    });

    // Invalidate user cache
    const cacheKey = `adaptive:${userId}:${provider}:${model}`;
    await this.cache.delete(cacheKey);
  }

  /**
   * Select appropriate ratio based on confidence level
   */
  private selectRatioByConfidence(
    pattern: TokenPattern,
    level: ConfidenceLevel
  ): number {
    switch (level) {
      case 'conservative':
        // Use P90 or inflate EMA by 30%
        return pattern.p90Ratio ?? pattern.emaOutputRatio * 1.3;
      case 'optimistic':
        // Use P50 or deflate EMA by 30%
        return Math.min(
          pattern.p50Ratio ?? pattern.emaOutputRatio * 0.7,
          pattern.emaOutputRatio * 0.7
        );
      case 'typical':
      default:
        return pattern.emaOutputRatio;
    }
  }

  /**
   * Calculate confidence score based on source and sample count
   */
  private calculateConfidence(
    source: OutputTokenEstimate['ratioSource'],
    sampleCount: number
  ): number {
    const baseConfidence = {
      user: 0.5,
      tenant: 0.4,
      platform: 0.3,
      default: 0.5,
    };

    const maxConfidence = {
      user: 0.95,
      tenant: 0.85,
      platform: 0.75,
      default: 0.5,
    };

    const sampleDivisor = {
      user: 200,
      tenant: 500,
      platform: 2000,
      default: 1,
    };

    const base = baseConfidence[source];
    const max = maxConfidence[source];
    const divisor = sampleDivisor[source];

    return Math.min(max, base + sampleCount / divisor);
  }
}
```

### Integration with CostEstimationService

```typescript
// Enhanced CostEstimationService integration

import { AdaptiveOutputEstimator } from './adaptiveEstimator/AdaptiveOutputEstimator.js';
import { TiktokenCounter } from '../tokens/tiktoken.js';

export class EnhancedCostEstimationService {
  private adaptiveEstimator: AdaptiveOutputEstimator;
  private tokenCounter: TiktokenCounter;
  private pricingService: PricingService;

  /**
   * Get LLM cost estimate using adaptive output token estimation
   */
  async getLLMCostEstimate(params: {
    userId: string;
    tenantId: string;
    provider: string;
    model: string;
    inputText: string;
    confidenceLevel?: ConfidenceLevel;
  }): Promise<{
    estimatedCostUsd: number;
    inputTokens: number;
    estimatedOutputTokens: number;
    outputEstimateSource: string;
    confidenceScore: number;
  }> {
    // 1. Count exact input tokens
    const inputResult = await this.tokenCounter.estimateTokens(params.inputText);
    const inputTokens = inputResult.tokens;

    // 2. Estimate output tokens using adaptive estimator
    const outputEstimate = await this.adaptiveEstimator.estimateOutputTokens({
      userId: params.userId,
      tenantId: params.tenantId,
      provider: params.provider,
      model: params.model,
      inputTokens,
      confidenceLevel: params.confidenceLevel ?? 'conservative',
    });

    // 3. Get pricing
    const pricing = await this.pricingService.getPricing(params.provider, params.model);
    if (!pricing) {
      throw new Error(`No pricing found for ${params.provider}/${params.model}`);
    }

    // 4. Calculate cost
    const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCostUsd = (outputEstimate.estimatedOutputTokens / 1_000_000) * pricing.outputPricePerMillion;
    const estimatedCostUsd = inputCostUsd + outputCostUsd;

    return {
      estimatedCostUsd,
      inputTokens,
      estimatedOutputTokens: outputEstimate.estimatedOutputTokens,
      outputEstimateSource: outputEstimate.ratioSource,
      confidenceScore: outputEstimate.confidenceScore,
    };
  }

  /**
   * Record actual usage after LLM request (for learning)
   */
  async recordActualUsage(params: {
    userId: string;
    tenantId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    await this.adaptiveEstimator.recordActualTokens(params);
  }
}
```

---

## Implementation Phases

### Phase 1: Database Foundation (1-2 days)

**Tasks**:
1. Create migration for new tables
2. Implement SQL helper functions
3. Add database indexes
4. Create aggregation functions
5. Write migration tests

**Files**:
- `supabase/migrations/20260106000001_adaptive_token_patterns.sql`

**Verification**:
```bash
npm run db:migrate
npm run db:test:adaptive-patterns
```

### Phase 2: Core Service Implementation (2-3 days)

**Tasks**:
1. Implement `TokenPatternStore` (database layer)
2. Implement `AdaptiveOutputEstimator` (core logic)
3. Implement `EMACalculator` (utilities)
4. Add unit tests
5. Add integration tests

**Files**:
- `packages/reg-intel-core/src/costEstimation/adaptiveEstimator/*.ts`

**Verification**:
```bash
npm run test:adaptive-estimator
```

### Phase 3: Integration (1-2 days)

**Tasks**:
1. Integrate with `CostEstimationService`
2. Update `getLLMCostEstimate()` to use adaptive estimation
3. Add `recordActualUsage()` call after LLM requests
4. Update Chat API route
5. Add feature flag for gradual rollout

**Files**:
- `packages/reg-intel-core/src/costEstimation/service.ts`
- `apps/demo-web/src/app/api/chat/route.ts`
- `apps/demo-web/src/lib/costTracking.ts`

**Verification**:
```bash
npm run test:integration:cost-estimation
```

### Phase 4: Aggregation Jobs (1 day)

**Tasks**:
1. Implement `PatternAggregator` service
2. Create scheduled job for tenant aggregation
3. Create scheduled job for platform aggregation
4. Add monitoring/alerting

**Files**:
- `packages/reg-intel-core/src/costEstimation/adaptiveEstimator/PatternAggregator.ts`
- `scripts/run-pattern-aggregation.ts`

**Cron Schedule**:
```bash
# Aggregate tenant patterns every hour
0 * * * * npm run patterns:aggregate:tenant

# Aggregate platform patterns every 6 hours
0 */6 * * * npm run patterns:aggregate:platform
```

### Phase 5: Observability & Documentation (1 day)

**Tasks**:
1. Add OpenTelemetry metrics for estimation accuracy
2. Create Grafana dashboard for token patterns
3. Update all documentation
4. Create runbook for operations

**Metrics**:
- `llm_estimation_accuracy_ratio` - Histogram of (estimated/actual)
- `token_pattern_cache_hit_rate` - Cache effectiveness
- `token_pattern_source_distribution` - user/tenant/platform/default usage

---

## Configuration

### Environment Variables

```bash
# Feature flag
ADAPTIVE_TOKEN_ESTIMATION_ENABLED=true

# EMA Configuration
ADAPTIVE_EMA_SMOOTHING_FACTOR=0.2        # How quickly to adapt (0.1-0.5)
ADAPTIVE_MIN_RATIO_BOUND=0.1             # Minimum output/input ratio
ADAPTIVE_MAX_RATIO_BOUND=5.0             # Maximum output/input ratio
ADAPTIVE_DEFAULT_OUTPUT_RATIO=0.8        # Default when no data

# Sample thresholds
ADAPTIVE_MIN_USER_SAMPLES=5              # Samples needed for user-level
ADAPTIVE_MIN_TENANT_SAMPLES=20           # Samples needed for tenant-level
ADAPTIVE_MIN_PLATFORM_SAMPLES=100        # Samples needed for platform-level

# Cache configuration
ADAPTIVE_CACHE_TTL_SECONDS=300           # How long to cache patterns
```

### Feature Flag Rollout

```typescript
// Gradual rollout strategy
const isAdaptiveEnabled = (tenantId: string): boolean => {
  // Phase 1: Internal testing
  if (INTERNAL_TENANT_IDS.includes(tenantId)) return true;

  // Phase 2: Beta tenants
  if (BETA_TENANT_IDS.includes(tenantId)) return true;

  // Phase 3: Percentage rollout
  const hash = hashTenantId(tenantId);
  const rolloutPercent = parseInt(process.env.ADAPTIVE_ROLLOUT_PERCENT ?? '0');
  return (hash % 100) < rolloutPercent;
};
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('AdaptiveOutputEstimator', () => {
  describe('estimateOutputTokens', () => {
    it('should use user pattern when available with sufficient samples', async () => {
      // Setup user with 10 samples, EMA ratio of 0.6
      // Expect: ratio from user, source = 'user'
    });

    it('should fallback to tenant pattern when user has insufficient samples', async () => {
      // Setup user with 2 samples, tenant with 50 samples
      // Expect: ratio from tenant, source = 'tenant'
    });

    it('should fallback to platform pattern when tenant has insufficient samples', async () => {
      // Setup tenant with 5 samples, platform with 500 samples
      // Expect: ratio from platform, source = 'platform'
    });

    it('should use default when no patterns available', async () => {
      // No patterns in database
      // Expect: default ratio 0.8, source = 'default'
    });

    it('should apply bounds to extreme ratios', async () => {
      // Setup user with ratio 10.0 (above max bound)
      // Expect: ratio clamped to 5.0
    });

    it('should use P90 ratio for conservative confidence level', async () => {
      // Setup user with P90 = 1.5, EMA = 1.0
      // Request with confidence = 'conservative'
      // Expect: ratio = 1.5
    });
  });

  describe('recordActualTokens', () => {
    it('should update EMA correctly for existing user', async () => {
      // Setup user with EMA = 0.5, smoothing = 0.2
      // Record: input=100, output=80 (ratio=0.8)
      // Expected new EMA = 0.2 * 0.8 + 0.8 * 0.5 = 0.56
    });

    it('should create new pattern for new user', async () => {
      // New user, record first sample
      // Expect: new pattern created with ratio as initial EMA
    });
  });
});
```

### Integration Tests

```typescript
describe('Cost Estimation Integration', () => {
  it('should use adaptive estimation in quota check flow', async () => {
    // 1. Record 10 requests for user with avg ratio 0.5
    // 2. Make quota check request
    // 3. Verify estimated cost uses learned ratio
  });

  it('should improve accuracy as samples increase', async () => {
    // 1. Track estimation error over 100 requests
    // 2. Verify error decreases as samples increase
  });
});
```

### Accuracy Monitoring

```sql
-- Weekly accuracy report
SELECT
  DATE_TRUNC('day', recorded_at) as day,
  AVG(
    CASE
      WHEN estimated_output_tokens > 0
      THEN output_tokens::NUMERIC / estimated_output_tokens
    END
  ) as accuracy_ratio,
  COUNT(*) as sample_count
FROM copilot_internal.llm_cost_records
WHERE recorded_at > NOW() - INTERVAL '7 days'
  AND estimated_output_tokens IS NOT NULL
GROUP BY day
ORDER BY day;
```

---

## Rollback Plan

### If Issues Occur

1. **Disable feature flag**:
   ```bash
   ADAPTIVE_TOKEN_ESTIMATION_ENABLED=false
   ```

2. **System falls back to static estimates** (existing behavior)

3. **Data preserved** for analysis:
   - Token pattern tables remain intact
   - Can re-enable after fixing issues

### Data Migration (if needed)

```sql
-- Clear adaptive data (does not affect billing records)
TRUNCATE copilot_internal.user_token_patterns;
TRUNCATE copilot_internal.tenant_token_patterns;
TRUNCATE copilot_internal.platform_token_patterns;
TRUNCATE copilot_internal.token_pattern_history;
```

---

## Success Metrics

### Primary Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Estimation accuracy | ~60% | >85% | `abs(estimated - actual) / actual` |
| Quota false positives | Unknown | <5% | Requests blocked that would have been under quota |
| User satisfaction | N/A | Improved | Survey/feedback |

### Secondary Metrics

| Metric | Target | Purpose |
|--------|--------|---------|
| Pattern coverage | >80% users | Users with personalized estimates |
| Cache hit rate | >70% | Performance efficiency |
| Aggregation latency | <30s | Job performance |

---

## Appendix A: EMA Formula Explanation

**Exponential Moving Average (EMA)** weights recent observations more heavily:

```
EMA_new = α × current_value + (1 - α) × EMA_old

where:
  α = smoothing factor (0.2 recommended)
  current_value = actual_output_tokens / actual_input_tokens
  EMA_old = previous EMA value
```

**Why α = 0.2?**
- Balances responsiveness vs. stability
- 50% weight given to last ~4 samples
- Adapts within ~10 requests to new behavior
- Resistant to single outliers

**Example**:
```
Initial EMA: 0.5 (default)
Request 1: ratio = 0.8 → EMA = 0.2×0.8 + 0.8×0.5 = 0.56
Request 2: ratio = 0.9 → EMA = 0.2×0.9 + 0.8×0.56 = 0.628
Request 3: ratio = 0.7 → EMA = 0.2×0.7 + 0.8×0.628 = 0.642
```

---

## Appendix B: Alternative Approaches Considered

### 1. Machine Learning Model
**Rejected because**:
- Adds latency to quota checks (inference time)
- Requires ML infrastructure
- Overkill for this use case
- Higher maintenance burden

### 2. Simple Average
**Rejected because**:
- Doesn't adapt to changing user behavior
- Old data has same weight as recent data
- Slow to respond to pattern changes

### 3. Task-Type Classification
**Considered for future**:
- Would require classifying each request (summarization, Q&A, generation)
- More accurate but adds complexity
- Could be added as enhancement layer on top of EMA

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-06 | Platform Team | Initial draft |

---

**END OF IMPLEMENTATION PLAN**
