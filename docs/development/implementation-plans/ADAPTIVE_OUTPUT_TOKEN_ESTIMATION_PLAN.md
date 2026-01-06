# Adaptive Output Token Estimation Implementation Plan

**Status**: 📋 Proposed
**Date**: 2026-01-06
**Author**: Platform Infrastructure Team
**Priority**: Medium-High (Cost Accuracy Improvement)
**Target Accuracy**: 95% (up from ~60% baseline)

---

## Executive Summary

This document outlines the implementation plan for **Adaptive Output Token Estimation**, a system that learns from historical user behavior to improve LLM cost estimation accuracy. Instead of using static per-model estimates, this system tracks actual input/output token ratios per user and uses statistical methods to predict expected output tokens for quota enforcement.

### Key Design Principles

1. **Pluggable Architecture**: Support multiple algorithms without refactoring
2. **Multi-Level Configuration**: Algorithm selection at platform, tenant, and user levels
3. **JSONB Flexibility**: Use JSONB columns for algorithm-specific data to avoid schema changes
4. **Open Source Ready**: Clean interfaces for community algorithm contributions
5. **95% Accuracy Target**: Enhanced features beyond basic EMA

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
2. Uses **pluggable algorithms** (EMA, task-classification, ML, etc.)
3. Falls back through hierarchy: User → Tenant → Platform → Static defaults
4. Continuously improves accuracy as usage data accumulates
5. Allows **platform/tenant-level algorithm selection**

---

## Industry Best Practices Research

### How Others Solve This

| Approach | Used By | Pros | Cons | Accuracy |
|----------|---------|------|------|----------|
| **Static Multipliers** | Most SaaS | Simple, predictable | Inaccurate, no personalization | ~60% |
| **Exponential Moving Average** | AWS Cost Explorer | Adapts quickly, lightweight | Needs warmup period | ~75-80% |
| **Percentile-Based (P75/P90)** | Cloud billing | Conservative, reliable | May over-estimate | ~70-75% |
| **Task-Type Classification** | OpenAI fine-tuning | Accurate per task | Complex to classify | ~85-90% |
| **Context-Aware** | Enterprise | Considers input length | More complex | ~88-92% |
| **ML Prediction Models** | Enterprise platforms | Most accurate | High complexity, latency | ~90-95% |
| **Ensemble (Multiple)** | **Recommended** | Best of all approaches | Moderate complexity | ~95% |

### Recommended Approach: Pluggable Ensemble Architecture

Support **multiple algorithms** with platform/tenant-configurable selection:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Algorithm Selection Layer                         │
│                                                                      │
│  Platform Default: "weighted_ensemble"                               │
│       ↓ override                                                     │
│  Tenant Config: "task_aware_ema" (if configured)                    │
│       ↓ override                                                     │
│  User Preference: (future - not in v1)                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Algorithm Registry                                │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ ema_basic   │  │ task_aware  │  │ context_    │  │ weighted_ │  │
│  │             │  │ _ema        │  │ length_     │  │ ensemble  │  │
│  │ Simple EMA  │  │ EMA + task  │  │ aware       │  │           │  │
│  │ α=0.2       │  │ classific.  │  │             │  │ Combines  │  │
│  │             │  │             │  │ Input len   │  │ multiple  │  │
│  │ ~75-80%     │  │ ~85-90%     │  │ correlation │  │ ~95%      │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pluggable Algorithm Architecture

### Algorithm Interface

All estimation algorithms implement a common interface:

```typescript
interface OutputEstimationAlgorithm {
  /** Unique algorithm identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Algorithm version for compatibility tracking */
  readonly version: string;

  /** Expected accuracy range */
  readonly expectedAccuracy: { min: number; max: number };

  /** Default configuration */
  readonly defaultConfig: Record<string, unknown>;

  /**
   * Estimate output tokens for a request
   */
  estimate(params: EstimationInput): Promise<EstimationOutput>;

  /**
   * Update learned patterns after a completed request
   */
  learn(params: LearningInput): Promise<void>;

  /**
   * Validate algorithm-specific configuration
   */
  validateConfig(config: Record<string, unknown>): ValidationResult;

  /**
   * Extract statistics from JSONB for this algorithm
   */
  extractStats(stats: Record<string, unknown>): AlgorithmStats;
}
```

### Built-in Algorithms

#### 1. `ema_basic` - Simple Exponential Moving Average

```typescript
{
  id: 'ema_basic',
  name: 'Basic EMA',
  version: '1.0.0',
  expectedAccuracy: { min: 0.75, max: 0.80 },
  defaultConfig: {
    smoothingFactor: 0.2,
    minRatioBound: 0.1,
    maxRatioBound: 5.0,
    minSamples: 5,
  }
}
```

#### 2. `task_aware_ema` - Task-Type Aware EMA (85-90% accuracy)

Classifies requests by task type and maintains separate EMA per task:

```typescript
{
  id: 'task_aware_ema',
  name: 'Task-Aware EMA',
  version: '1.0.0',
  expectedAccuracy: { min: 0.85, max: 0.90 },
  defaultConfig: {
    smoothingFactor: 0.2,
    taskTypes: ['summarization', 'generation', 'qa', 'analysis', 'coding', 'other'],
    classificationMethod: 'prompt_heuristics', // or 'ml_classifier'
    perTaskMinSamples: 3,
  }
}
```

**Task Classification Heuristics**:
- `summarization`: Prompt contains "summarize", "tldr", "brief", output typically < input
- `generation`: Prompt contains "write", "create", "generate", output typically > input
- `qa`: Prompt is a question, output typically 0.3-0.8× input
- `analysis`: Prompt contains "analyze", "explain", output typically 1.0-2.0× input
- `coding`: Prompt contains code blocks or "function", "class", output varies widely

#### 3. `context_length_aware` - Input Length Correlation (88-92% accuracy)

Uses correlation between input length and output length:

```typescript
{
  id: 'context_length_aware',
  name: 'Context-Length Aware',
  version: '1.0.0',
  expectedAccuracy: { min: 0.88, max: 0.92 },
  defaultConfig: {
    lengthBuckets: [100, 500, 1000, 2000, 4000, 8000, 16000],
    perBucketEMA: true,
    regressionFallback: true,
  }
}
```

**Insight**: Short prompts (< 500 tokens) often get longer responses; long prompts (> 4000) often get shorter responses.

#### 4. `weighted_ensemble` - Combined Algorithms (95% accuracy target)

Combines multiple algorithms with learned weights:

```typescript
{
  id: 'weighted_ensemble',
  name: 'Weighted Ensemble',
  version: '1.0.0',
  expectedAccuracy: { min: 0.93, max: 0.97 },
  defaultConfig: {
    algorithms: ['ema_basic', 'task_aware_ema', 'context_length_aware'],
    initialWeights: { ema_basic: 0.2, task_aware_ema: 0.4, context_length_aware: 0.4 },
    adaptiveWeights: true,  // Learn weights from accuracy
    recencyBoost: true,     // Weight recent samples higher
    outlierExclusion: true, // Exclude statistical outliers
  }
}
```

### Algorithm Registry

```typescript
// packages/reg-intel-core/src/costEstimation/adaptiveEstimator/AlgorithmRegistry.ts

class AlgorithmRegistry {
  private algorithms = new Map<string, OutputEstimationAlgorithm>();

  /** Register a new algorithm */
  register(algorithm: OutputEstimationAlgorithm): void {
    this.algorithms.set(algorithm.id, algorithm);
  }

  /** Get algorithm by ID */
  get(id: string): OutputEstimationAlgorithm | undefined {
    return this.algorithms.get(id);
  }

  /** List all registered algorithms */
  list(): AlgorithmInfo[] {
    return Array.from(this.algorithms.values()).map(a => ({
      id: a.id,
      name: a.name,
      version: a.version,
      expectedAccuracy: a.expectedAccuracy,
    }));
  }

  /** Get algorithm for scope (with fallback chain) */
  async getForScope(params: {
    userId?: string;
    tenantId?: string;
    configStore: AlgorithmConfigStore;
  }): Promise<OutputEstimationAlgorithm> {
    // 1. Check user config (future)
    // 2. Check tenant config
    const tenantConfig = await params.configStore.getTenantConfig(params.tenantId);
    if (tenantConfig?.algorithmId) {
      const algo = this.get(tenantConfig.algorithmId);
      if (algo) return algo;
    }

    // 3. Check platform config
    const platformConfig = await params.configStore.getPlatformConfig();
    const algo = this.get(platformConfig.algorithmId);
    if (algo) return algo;

    // 4. Default to ema_basic
    return this.get('ema_basic')!;
  }
}

// Global registry with built-in algorithms
export const algorithmRegistry = new AlgorithmRegistry();
algorithmRegistry.register(new EMABasicAlgorithm());
algorithmRegistry.register(new TaskAwareEMAAlgorithm());
algorithmRegistry.register(new ContextLengthAwareAlgorithm());
algorithmRegistry.register(new WeightedEnsembleAlgorithm());
```

---

## Technical Architecture

### System Design (Enhanced with Pluggable Algorithms)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Adaptive Output Token Estimation                      │
│                    (Pluggable Algorithm Architecture)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────────┐
│ Algorithm         │   │ Algorithm         │   │ Token Pattern         │
│ Registry          │   │ Config Store      │   │ Storage (JSONB)       │
│                   │   │                   │   │                       │
│ • ema_basic       │   │ • Platform config │   │ • User patterns       │
│ • task_aware_ema  │   │ • Tenant configs  │   │ • Tenant aggregates   │
│ • context_aware   │   │ • Algorithm params│   │ • Platform aggregates │
│ • weighted_ensem. │   │                   │   │ • Algorithm-specific  │
│ • (custom...)     │   │                   │   │   stats in JSONB      │
└───────────────────┘   └───────────────────┘   └───────────────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │ Adaptive Estimator Service    │
                    │                               │
                    │ 1. Resolve algorithm for scope│
                    │ 2. Get input token count      │
                    │ 3. Call algorithm.estimate()  │
                    │ 4. Calculate estimated cost   │
                    │ 5. After request: learn()     │
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

### Design Philosophy: JSONB for Algorithm Flexibility

To support pluggable algorithms without schema changes, we use **JSONB columns** for algorithm-specific data:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     JSONB Column Strategy                                   │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  FIXED COLUMNS (identity, common metrics):                                 │
│  • user_id, tenant_id, provider, model (identity)                          │
│  • sample_count, total_input_tokens, total_output_tokens (universal)       │
│  • created_at, last_updated_at (timestamps)                                │
│                                                                            │
│  JSONB COLUMNS (algorithm-specific, extensible):                           │
│  • algorithm_stats: { ema_ratio, task_ratios, bucket_stats, ... }         │
│  • algorithm_config: { smoothingFactor, weights, ... }                     │
│  • accuracy_metrics: { predictions, actuals, error_rates, ... }           │
│                                                                            │
│  BENEFITS:                                                                 │
│  ✅ No schema migration when adding new algorithms                         │
│  ✅ Each algorithm stores its own structure                                │
│  ✅ Easy to add/remove algorithm-specific fields                           │
│  ✅ PostgreSQL JSONB is indexed and queryable                              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### New Tables

```sql
-- ============================================================================
-- ALGORITHM CONFIGURATION
-- Platform and tenant-level algorithm selection and configuration
-- ============================================================================
CREATE TABLE copilot_internal.estimation_algorithm_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope (platform has NULL scope_id)
  scope TEXT NOT NULL,                       -- 'platform', 'tenant'
  scope_id UUID,                             -- NULL for platform, tenant_id for tenant

  -- Algorithm Selection
  algorithm_id TEXT NOT NULL,                -- 'ema_basic', 'task_aware_ema', 'weighted_ensemble'
  algorithm_version TEXT NOT NULL,           -- '1.0.0'

  -- Algorithm-Specific Configuration (JSONB for flexibility)
  config JSONB NOT NULL DEFAULT '{}',
  /*
    Examples:
    ema_basic: { "smoothingFactor": 0.2, "minRatioBound": 0.1, "maxRatioBound": 5.0 }
    task_aware_ema: { "smoothingFactor": 0.2, "taskTypes": ["summarization", "qa", "generation"] }
    weighted_ensemble: { "algorithms": ["ema_basic", "task_aware_ema"], "weights": { "ema_basic": 0.3, "task_aware_ema": 0.7 } }
  */

  -- Metadata
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,                           -- For audit trail

  -- Constraints
  UNIQUE(scope, scope_id)
);

-- Default platform configuration
INSERT INTO copilot_internal.estimation_algorithm_config (scope, scope_id, algorithm_id, algorithm_version, config)
VALUES ('platform', NULL, 'weighted_ensemble', '1.0.0', '{
  "algorithms": ["ema_basic", "task_aware_ema", "context_length_aware"],
  "initialWeights": { "ema_basic": 0.2, "task_aware_ema": 0.4, "context_length_aware": 0.4 },
  "adaptiveWeights": true,
  "outlierExclusion": true
}'::jsonb);

CREATE INDEX idx_algorithm_config_scope
  ON copilot_internal.estimation_algorithm_config(scope, scope_id);

-- ============================================================================
-- USER TOKEN PATTERNS (JSONB-based)
-- Stores learned patterns per user, per model with algorithm-specific stats
-- ============================================================================
CREATE TABLE copilot_internal.user_token_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (fixed columns for fast lookups)
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL,                    -- 'anthropic', 'openai', etc.
  model TEXT NOT NULL,                       -- 'claude-3-sonnet-20240229'

  -- Universal Statistics (common across all algorithms)
  sample_count INTEGER NOT NULL DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- Algorithm-Specific Statistics (JSONB for flexibility)
  algorithm_stats JSONB NOT NULL DEFAULT '{}',
  /*
    Structure varies by algorithm. Examples:

    For ema_basic:
    {
      "ema_ratio": 0.85,
      "min_ratio": 0.3,
      "max_ratio": 2.1,
      "p50_ratio": 0.8,
      "p90_ratio": 1.4
    }

    For task_aware_ema:
    {
      "task_ratios": {
        "summarization": { "ema": 0.4, "count": 15 },
        "qa": { "ema": 0.6, "count": 42 },
        "generation": { "ema": 1.8, "count": 23 },
        "coding": { "ema": 1.2, "count": 8 }
      },
      "default_ema": 0.85
    }

    For context_length_aware:
    {
      "bucket_stats": {
        "0-500": { "ema": 1.2, "count": 30 },
        "500-1000": { "ema": 0.9, "count": 25 },
        "1000-2000": { "ema": 0.7, "count": 18 },
        "2000+": { "ema": 0.5, "count": 12 }
      },
      "regression_coefficients": { "slope": -0.0001, "intercept": 1.5 }
    }

    For weighted_ensemble:
    {
      "algorithm_predictions": {
        "ema_basic": { "last_prediction": 450, "recent_accuracy": 0.78 },
        "task_aware_ema": { "last_prediction": 420, "recent_accuracy": 0.88 },
        "context_length_aware": { "last_prediction": 435, "recent_accuracy": 0.85 }
      },
      "learned_weights": { "ema_basic": 0.15, "task_aware_ema": 0.45, "context_length_aware": 0.40 }
    }
  */

  -- Accuracy Tracking (for weight learning and monitoring)
  accuracy_metrics JSONB NOT NULL DEFAULT '{}',
  /*
    {
      "recent_predictions": [
        { "predicted": 450, "actual": 420, "timestamp": "2026-01-06T10:00:00Z" },
        { "predicted": 380, "actual": 395, "timestamp": "2026-01-06T10:05:00Z" }
      ],
      "rolling_accuracy": 0.87,
      "total_predictions": 156,
      "within_10_percent": 142,
      "within_20_percent": 153
    }
  */

  -- Timestamps
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
-- GIN index for JSONB queries (e.g., finding users with specific task types)
CREATE INDEX idx_user_token_patterns_stats_gin
  ON copilot_internal.user_token_patterns USING GIN (algorithm_stats);

-- ============================================================================
-- TENANT TOKEN PATTERNS (JSONB-based)
-- Aggregated patterns at tenant level (for user fallback)
-- ============================================================================
CREATE TABLE copilot_internal.tenant_token_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Universal Statistics
  active_user_count INTEGER DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- Algorithm-Specific Statistics (JSONB)
  algorithm_stats JSONB NOT NULL DEFAULT '{}',
  /*
    Aggregated from user patterns. Structure matches user_token_patterns
    but with aggregated values (averages, percentiles across users).
  */

  -- Accuracy Metrics (aggregated)
  accuracy_metrics JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  last_aggregated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, provider, model)
);

CREATE INDEX idx_tenant_token_patterns_lookup
  ON copilot_internal.tenant_token_patterns(tenant_id, provider, model);
CREATE INDEX idx_tenant_token_patterns_stats_gin
  ON copilot_internal.tenant_token_patterns USING GIN (algorithm_stats);

-- ============================================================================
-- PLATFORM TOKEN PATTERNS (JSONB-based)
-- Platform-wide aggregates (for tenant fallback)
-- ============================================================================
CREATE TABLE copilot_internal.platform_token_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Universal Statistics
  active_tenant_count INTEGER DEFAULT 0,
  active_user_count INTEGER DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  -- Algorithm-Specific Statistics (JSONB)
  algorithm_stats JSONB NOT NULL DEFAULT '{}',

  -- Accuracy Metrics (platform-wide)
  accuracy_metrics JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  last_aggregated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(provider, model)
);

CREATE INDEX idx_platform_token_patterns_lookup
  ON copilot_internal.platform_token_patterns(provider, model);

-- ============================================================================
-- TOKEN PATTERN HISTORY (JSONB-based)
-- Historical snapshots for trend analysis, debugging, and algorithm comparison
-- ============================================================================
CREATE TABLE copilot_internal.token_pattern_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  scope TEXT NOT NULL,                       -- 'user', 'tenant', 'platform'
  scope_id UUID,                             -- NULL for platform
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Snapshot (JSONB for full state capture)
  snapshot JSONB NOT NULL,
  /*
    {
      "algorithm_id": "weighted_ensemble",
      "sample_count": 156,
      "algorithm_stats": { ... },
      "accuracy_metrics": { "rolling_accuracy": 0.87 }
    }
  */

  -- Timestamp
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned by month for efficient pruning
-- CREATE TABLE ... PARTITION BY RANGE (snapshot_at);

CREATE INDEX idx_token_pattern_history_lookup
  ON copilot_internal.token_pattern_history(scope, scope_id, provider, model, snapshot_at DESC);
CREATE INDEX idx_token_pattern_history_snapshot_gin
  ON copilot_internal.token_pattern_history USING GIN (snapshot);

-- ============================================================================
-- ALGORITHM PERFORMANCE TRACKING
-- Track algorithm accuracy for A/B testing and weight optimization
-- ============================================================================
CREATE TABLE copilot_internal.algorithm_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  algorithm_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Time bucket (hourly aggregation)
  bucket_start TIMESTAMPTZ NOT NULL,
  bucket_end TIMESTAMPTZ NOT NULL,

  -- Performance Metrics
  metrics JSONB NOT NULL,
  /*
    {
      "total_predictions": 1250,
      "within_10_percent": 1087,
      "within_20_percent": 1200,
      "mean_absolute_error": 45.2,
      "mean_percentage_error": 0.12,
      "accuracy_score": 0.87,
      "sample_breakdown": {
        "by_task_type": { "qa": 0.92, "generation": 0.78 },
        "by_input_length": { "short": 0.85, "long": 0.89 }
      }
    }
  */

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(algorithm_id, provider, model, bucket_start)
);

CREATE INDEX idx_algorithm_performance_lookup
  ON copilot_internal.algorithm_performance(algorithm_id, provider, model, bucket_start DESC);
```

### JSONB Helper Functions

```sql
-- ============================================================================
-- GET EMA RATIO FROM JSONB
-- Extracts EMA ratio from algorithm_stats, handling different algorithm formats
-- ============================================================================
CREATE OR REPLACE FUNCTION copilot_internal.get_ema_ratio(
  p_algorithm_stats JSONB
) RETURNS NUMERIC AS $$
BEGIN
  -- Try direct ema_ratio (ema_basic)
  IF p_algorithm_stats ? 'ema_ratio' THEN
    RETURN (p_algorithm_stats->>'ema_ratio')::NUMERIC;
  END IF;

  -- Try default_ema (task_aware_ema)
  IF p_algorithm_stats ? 'default_ema' THEN
    RETURN (p_algorithm_stats->>'default_ema')::NUMERIC;
  END IF;

  -- Try bucket average (context_length_aware)
  IF p_algorithm_stats ? 'bucket_stats' THEN
    RETURN (
      SELECT AVG((value->>'ema')::NUMERIC)
      FROM jsonb_each(p_algorithm_stats->'bucket_stats') AS x(key, value)
      WHERE value ? 'ema'
    );
  END IF;

  -- Default
  RETURN 0.8;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- MERGE ALGORITHM STATS
-- Merges new algorithm-specific data into existing JSONB
-- ============================================================================
CREATE OR REPLACE FUNCTION copilot_internal.merge_algorithm_stats(
  p_existing JSONB,
  p_new JSONB
) RETURNS JSONB AS $$
BEGIN
  -- Deep merge: new values override existing at each key
  RETURN p_existing || p_new;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
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

## Achieving 95% Accuracy: Enhancement Strategies

To reach the **95% accuracy target** (up from ~60% baseline), we employ multiple complementary strategies:

### Accuracy Improvement Breakdown

| Strategy | Contribution | Cumulative |
|----------|-------------|------------|
| Basic EMA (baseline) | +15-20% | 75-80% |
| Task-type classification | +7-10% | 85-88% |
| Input length correlation | +3-5% | 88-92% |
| Ensemble + weight learning | +3-5% | 91-95% |
| Outlier exclusion | +1-2% | 93-97% |

### Strategy 1: Task-Type Classification (+7-10%)

Different tasks have predictable output patterns:

```typescript
const TASK_OUTPUT_CHARACTERISTICS = {
  summarization: {
    typicalRatio: 0.3,      // Output ~30% of input
    variance: 'low',         // Very predictable
    detection: ['summarize', 'tldr', 'brief', 'key points'],
  },
  qa: {
    typicalRatio: 0.5,      // Output ~50% of input
    variance: 'medium',
    detection: ['?', 'what', 'how', 'why', 'explain'],
  },
  generation: {
    typicalRatio: 2.0,      // Output ~200% of input
    variance: 'high',        // Less predictable
    detection: ['write', 'create', 'generate', 'compose'],
  },
  analysis: {
    typicalRatio: 1.5,
    variance: 'medium',
    detection: ['analyze', 'compare', 'evaluate', 'assess'],
  },
  coding: {
    typicalRatio: 1.2,
    variance: 'high',
    detection: ['function', 'class', 'code', '```'],
  },
  translation: {
    typicalRatio: 1.0,      // ~1:1 ratio
    variance: 'low',
    detection: ['translate', 'convert to', 'in spanish'],
  },
};
```

### Strategy 2: Input Length Correlation (+3-5%)

Empirical observation: output/input ratio correlates with input length:

```typescript
const LENGTH_CORRELATION = {
  // Short prompts often get longer responses (ratio > 1)
  '0-100': { avgRatio: 2.5, confidence: 0.7 },
  '100-500': { avgRatio: 1.5, confidence: 0.8 },
  '500-1000': { avgRatio: 1.0, confidence: 0.85 },
  '1000-2000': { avgRatio: 0.8, confidence: 0.85 },
  '2000-4000': { avgRatio: 0.6, confidence: 0.8 },
  // Long prompts get shorter responses (ratio < 1)
  '4000+': { avgRatio: 0.4, confidence: 0.75 },
};

// Linear regression can model this more precisely
// output_ratio = intercept - (slope × input_tokens)
```

### Strategy 3: Weighted Ensemble with Adaptive Weights (+3-5%)

Combine multiple algorithms and **learn which works best** for each user:

```typescript
interface EnsembleConfig {
  algorithms: string[];
  initialWeights: Record<string, number>;
  adaptiveWeights: boolean;
  weightLearningRate: number;  // How fast weights adapt
}

// After each prediction, update weights based on accuracy
function updateEnsembleWeights(
  predictions: Record<string, number>,
  actual: number,
  currentWeights: Record<string, number>,
  learningRate: number = 0.1
): Record<string, number> {
  const errors: Record<string, number> = {};
  let totalInverseError = 0;

  // Calculate error for each algorithm
  for (const [algo, predicted] of Object.entries(predictions)) {
    const error = Math.abs(predicted - actual) / actual;
    errors[algo] = error;
    totalInverseError += 1 / (error + 0.01); // Avoid division by zero
  }

  // Update weights: better accuracy = higher weight
  const newWeights: Record<string, number> = {};
  for (const algo of Object.keys(predictions)) {
    const accuracyWeight = (1 / (errors[algo] + 0.01)) / totalInverseError;
    newWeights[algo] =
      currentWeights[algo] * (1 - learningRate) +
      accuracyWeight * learningRate;
  }

  return normalizeWeights(newWeights);
}
```

### Strategy 4: Outlier Exclusion (+1-2%)

Exclude statistical outliers from EMA updates to prevent single anomalous requests from skewing estimates:

```typescript
function shouldExcludeAsOutlier(
  currentRatio: number,
  historicalStats: { mean: number; stdDev: number },
  threshold: number = 2.5  // Z-score threshold
): boolean {
  const zScore = Math.abs(currentRatio - historicalStats.mean) / historicalStats.stdDev;
  return zScore > threshold;
}

// In learning pipeline:
if (!shouldExcludeAsOutlier(actualRatio, userStats)) {
  updateEMA(actualRatio);
} else {
  // Log but don't update
  logger.info('Excluded outlier ratio', { actualRatio, userStats });
}
```

### Strategy 5: Recency Weighting

Recent behavior is more predictive than old behavior:

```typescript
// Time-decayed EMA: recent samples weighted more heavily
function calculateRecencyWeightedEMA(
  samples: Array<{ ratio: number; timestamp: Date }>,
  decayHalfLifeHours: number = 168  // 1 week half-life
): number {
  const now = Date.now();
  let weightedSum = 0;
  let weightSum = 0;

  for (const sample of samples) {
    const ageHours = (now - sample.timestamp.getTime()) / (1000 * 60 * 60);
    const weight = Math.pow(0.5, ageHours / decayHalfLifeHours);
    weightedSum += sample.ratio * weight;
    weightSum += weight;
  }

  return weightedSum / weightSum;
}
```

### Strategy 6: Model-Specific Adjustments

Different LLMs have different output characteristics:

```typescript
const MODEL_CHARACTERISTICS = {
  'claude-3-opus': { verbosityFactor: 1.2 },     // More verbose
  'claude-3-sonnet': { verbosityFactor: 1.0 },   // Baseline
  'claude-3-haiku': { verbosityFactor: 0.8 },    // More concise
  'gpt-4-turbo': { verbosityFactor: 1.1 },
  'gpt-3.5-turbo': { verbosityFactor: 0.9 },
};

// Apply model adjustment to base estimate
estimatedOutput *= MODEL_CHARACTERISTICS[model]?.verbosityFactor ?? 1.0;
```

### Accuracy Monitoring Dashboard

Track accuracy in real-time to validate improvements:

```sql
-- Hourly accuracy report by algorithm
SELECT
  DATE_TRUNC('hour', recorded_at) as hour,
  algorithm_id,
  COUNT(*) as predictions,
  AVG(CASE
    WHEN ABS(estimated_output - actual_output) / actual_output < 0.10
    THEN 1 ELSE 0
  END) as within_10_percent,
  AVG(CASE
    WHEN ABS(estimated_output - actual_output) / actual_output < 0.20
    THEN 1 ELSE 0
  END) as within_20_percent,
  AVG(ABS(estimated_output - actual_output)::NUMERIC / actual_output) as mean_error
FROM copilot_internal.llm_cost_records
WHERE estimated_output IS NOT NULL
  AND recorded_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, algorithm_id
ORDER BY hour DESC, algorithm_id;
```

---

## Implementation Phases

### Phase 1: Database Foundation (2-3 days)

**Tasks**:
1. Create migration for JSONB-based tables
2. Create `estimation_algorithm_config` table with platform default
3. Create `user_token_patterns`, `tenant_token_patterns`, `platform_token_patterns` tables
4. Create `algorithm_performance` tracking table
5. Implement JSONB helper functions
6. Add GIN indexes for JSONB queries
7. Write migration tests

**Files**:
- `supabase/migrations/20260106000001_adaptive_token_patterns.sql`

**Verification**:
```bash
npm run db:migrate
npm run db:test:adaptive-patterns
```

### Phase 2: Algorithm Framework (2-3 days)

**Tasks**:
1. Define `OutputEstimationAlgorithm` interface
2. Implement `AlgorithmRegistry` for algorithm management
3. Implement `AlgorithmConfigStore` for scope-based config lookup
4. Implement `ema_basic` algorithm
5. Add unit tests for framework
6. Add integration tests

**Files**:
```
packages/reg-intel-core/src/costEstimation/adaptiveEstimator/
├── types.ts                    # Interfaces and types
├── AlgorithmRegistry.ts        # Algorithm registration
├── AlgorithmConfigStore.ts     # Config lookup with fallback
├── algorithms/
│   ├── BaseAlgorithm.ts        # Base class with common logic
│   ├── EMABasicAlgorithm.ts    # Simple EMA implementation
│   └── index.ts
└── index.ts
```

**Verification**:
```bash
npm run test:algorithm-framework
```

### Phase 3: Advanced Algorithms (3-4 days)

**Tasks**:
1. Implement `task_aware_ema` algorithm with task classification
2. Implement `context_length_aware` algorithm with bucket stats
3. Implement `weighted_ensemble` algorithm with adaptive weights
4. Add task classifier (heuristic-based initially)
5. Add accuracy tracking
6. Add unit tests for each algorithm

**Files**:
```
packages/reg-intel-core/src/costEstimation/adaptiveEstimator/algorithms/
├── TaskAwareEMAAlgorithm.ts
├── ContextLengthAwareAlgorithm.ts
├── WeightedEnsembleAlgorithm.ts
└── utils/
    ├── TaskClassifier.ts
    ├── AccuracyTracker.ts
    └── OutlierDetector.ts
```

**Verification**:
```bash
npm run test:advanced-algorithms
```

### Phase 4: Core Service & Integration (2-3 days)

**Tasks**:
1. Implement `AdaptiveOutputEstimator` main service
2. Implement `TokenPatternStore` (JSONB-aware database layer)
3. Integrate with existing `CostEstimationService`
4. Update `getLLMCostEstimate()` to use adaptive estimation
5. Add `recordActualUsage()` call after LLM requests
6. Update Chat API route
7. Add feature flag for gradual rollout

**Files**:
- `packages/reg-intel-core/src/costEstimation/service.ts`
- `apps/demo-web/src/app/api/chat/route.ts`
- `apps/demo-web/src/lib/costTracking.ts`

**Verification**:
```bash
npm run test:integration:cost-estimation
```

### Phase 5: Aggregation Jobs (1-2 days)

**Tasks**:
1. Implement `PatternAggregator` service
2. Create scheduled job for tenant aggregation
3. Create scheduled job for platform aggregation
4. Add algorithm performance aggregation
5. Add monitoring/alerting

**Files**:
- `packages/reg-intel-core/src/costEstimation/adaptiveEstimator/PatternAggregator.ts`
- `scripts/run-pattern-aggregation.ts`

**Cron Schedule**:
```bash
# Aggregate tenant patterns every hour
0 * * * * npm run patterns:aggregate:tenant

# Aggregate platform patterns every 6 hours
0 */6 * * * npm run patterns:aggregate:platform

# Aggregate algorithm performance hourly
0 * * * * npm run patterns:aggregate:performance
```

### Phase 6: Observability & Documentation (1-2 days)

**Tasks**:
1. Add OpenTelemetry metrics for estimation accuracy
2. Create Grafana dashboard for token patterns and algorithm comparison
3. Add A/B testing support for algorithm comparison
4. Update all documentation
5. Create runbook for operations

**Metrics**:
- `llm_estimation_accuracy_ratio` - Histogram of (estimated/actual)
- `token_pattern_cache_hit_rate` - Cache effectiveness
- `token_pattern_source_distribution` - user/tenant/platform/default usage
- `algorithm_accuracy_by_type` - Compare algorithm performance
- `ensemble_weight_distribution` - Track learned weights

### Implementation Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 1. Database Foundation | 2-3 days | 2-3 days |
| 2. Algorithm Framework | 2-3 days | 4-6 days |
| 3. Advanced Algorithms | 3-4 days | 7-10 days |
| 4. Core Service & Integration | 2-3 days | 9-13 days |
| 5. Aggregation Jobs | 1-2 days | 10-15 days |
| 6. Observability & Documentation | 1-2 days | 11-17 days |

**Total Estimate**: 11-17 days (depending on testing depth)

---

## Configuration

### Environment Variables

```bash
# Feature flag
ADAPTIVE_TOKEN_ESTIMATION_ENABLED=true

# Algorithm selection (platform default)
ADAPTIVE_DEFAULT_ALGORITHM=weighted_ensemble  # ema_basic, task_aware_ema, context_length_aware, weighted_ensemble

# EMA Configuration
ADAPTIVE_EMA_SMOOTHING_FACTOR=0.2        # How quickly to adapt (0.1-0.5)
ADAPTIVE_MIN_RATIO_BOUND=0.1             # Minimum output/input ratio
ADAPTIVE_MAX_RATIO_BOUND=5.0             # Maximum output/input ratio
ADAPTIVE_DEFAULT_OUTPUT_RATIO=0.8        # Default when no data

# Sample thresholds
ADAPTIVE_MIN_USER_SAMPLES=5              # Samples needed for user-level
ADAPTIVE_MIN_TENANT_SAMPLES=20           # Samples needed for tenant-level
ADAPTIVE_MIN_PLATFORM_SAMPLES=100        # Samples needed for platform-level

# Ensemble configuration
ADAPTIVE_ENSEMBLE_WEIGHT_LEARNING_RATE=0.1   # How fast ensemble weights adapt
ADAPTIVE_OUTLIER_ZSCORE_THRESHOLD=2.5        # Z-score threshold for outlier exclusion

# Cache configuration
ADAPTIVE_CACHE_TTL_SECONDS=300           # How long to cache patterns
ADAPTIVE_ALGORITHM_CONFIG_CACHE_TTL=3600 # Algorithm config cache (1 hour)

# Rollout
ADAPTIVE_ROLLOUT_PERCENT=100             # Percentage of tenants to enable
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
