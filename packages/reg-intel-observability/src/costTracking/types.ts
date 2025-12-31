/**
 * Cost Tracking Types - Storage and aggregation for LLM cost data
 *
 * Provides interfaces and types for:
 * - Individual LLM request cost records
 * - Cost aggregation across multiple dimensions
 * - Quota management and enforcement
 * - Historical cost analysis
 */

/**
 * Individual LLM request cost record
 * Represents a single LLM API call with full cost attribution
 */
export interface LlmCostRecord {
  /** Unique identifier for this cost record */
  id: string;

  /** Timestamp when the LLM request was made */
  timestamp: Date;

  /** LLM provider (openai, anthropic, google, groq, local) */
  provider: string;

  /** Specific model used (gpt-4, claude-3-opus, gemini-pro, etc.) */
  model: string;

  /** Number of input tokens consumed */
  inputTokens: number;

  /** Number of output tokens consumed */
  outputTokens: number;

  /** Total tokens (input + output) */
  totalTokens: number;

  /** Cost for input tokens in USD */
  inputCostUsd: number;

  /** Cost for output tokens in USD */
  outputCostUsd: number;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Whether this cost is estimated (true if pricing not found) */
  isEstimated: boolean;

  // Attribution dimensions
  /** Tenant/organization ID for multi-tenant attribution */
  tenantId?: string;

  /** User ID for per-user attribution */
  userId?: string;

  /** Task/touchpoint identifier (main-chat, egress-guard, etc.) */
  task?: string;

  /** Conversation/session ID for per-conversation attribution */
  conversationId?: string;

  /** Whether the request used cached results */
  cached?: boolean;

  /** Whether the request was streamed */
  streaming?: boolean;

  /** Request duration in milliseconds */
  durationMs?: number;

  /** Whether the request succeeded */
  success?: boolean;
}

/**
 * Aggregated cost metrics across a dimension
 */
export interface CostAggregate {
  /** The dimension value (e.g., tenantId=acme-corp, task=main-chat) */
  dimension: string;

  /** Dimension value */
  value: string;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Total requests */
  requestCount: number;

  /** Total tokens consumed */
  totalTokens: number;

  /** Average cost per request */
  avgCostPerRequest: number;

  /** First request timestamp in this aggregate */
  firstRequest: Date;

  /** Last request timestamp in this aggregate */
  lastRequest: Date;
}

/**
 * Multi-dimensional cost aggregation query
 */
export interface CostAggregateQuery {
  /** Start of time range (inclusive) */
  startTime?: Date;

  /** End of time range (inclusive) */
  endTime?: Date;

  /** Group by dimensions (tenant, user, task, conversation, provider, model) */
  groupBy: Array<'tenant' | 'user' | 'task' | 'conversation' | 'provider' | 'model'>;

  /** Filter by tenant IDs */
  tenantIds?: string[];

  /** Filter by user IDs */
  userIds?: string[];

  /** Filter by tasks */
  tasks?: string[];

  /** Filter by conversation IDs */
  conversationIds?: string[];

  /** Filter by providers */
  providers?: string[];

  /** Filter by models */
  models?: string[];

  /** Maximum number of results to return */
  limit?: number;

  /** Sort order (highest cost first, or earliest time first) */
  sortBy?: 'cost_desc' | 'cost_asc' | 'time_desc' | 'time_asc' | 'count_desc';
}

/**
 * Cost quota configuration
 */
export interface CostQuota {
  /** Quota ID */
  id: string;

  /** Quota scope (platform, tenant, user) */
  scope: 'platform' | 'tenant' | 'user';

  /** Scope identifier (tenantId or userId) */
  scopeId?: string;

  /** Quota limit in USD */
  limitUsd: number;

  /** Time period for quota (hourly, daily, weekly, monthly) */
  period: 'hour' | 'day' | 'week' | 'month';

  /** Current spend in USD for this period */
  currentSpendUsd: number;

  /** When the current period started */
  periodStart: Date;

  /** When the current period ends */
  periodEnd: Date;

  /** Whether this quota is currently exceeded */
  isExceeded: boolean;

  /** Warning threshold (0-1, e.g., 0.8 = 80% of quota) */
  warningThreshold?: number;

  /** Whether warning threshold has been exceeded */
  warningExceeded?: boolean;
}

/**
 * Cost quota check request
 */
export interface QuotaCheckRequest {
  /** Scope to check (platform, tenant, user) */
  scope: 'platform' | 'tenant' | 'user';

  /** Scope identifier (tenantId or userId) */
  scopeId?: string;

  /** Expected cost in USD to check against quota */
  estimatedCostUsd: number;
}

/**
 * Cost quota check result
 */
export interface QuotaCheckResult {
  /** Whether the request would exceed the quota */
  allowed: boolean;

  /** Current quota status */
  quota?: CostQuota;

  /** Reason if request is denied */
  reason?: string;

  /** Remaining budget in USD */
  remainingBudgetUsd?: number;
}

/**
 * Cost storage interface - for persisting detailed cost records
 */
export interface CostStorageProvider {
  /**
   * Store a single cost record
   */
  storeCostRecord(record: Omit<LlmCostRecord, 'id'>): Promise<LlmCostRecord>;

  /**
   * Retrieve cost records by query
   */
  queryCostRecords(query: CostAggregateQuery): Promise<LlmCostRecord[]>;

  /**
   * Get aggregated cost metrics
   */
  getAggregatedCosts(query: CostAggregateQuery): Promise<CostAggregate[]>;

  /**
   * Get total cost for a specific scope and time range
   */
  getTotalCost(
    scope: 'platform' | 'tenant' | 'user' | 'task' | 'conversation',
    scopeId: string | undefined,
    startTime?: Date,
    endTime?: Date
  ): Promise<number>;
}

/**
 * Quota management interface - for tracking and enforcing cost quotas
 */
export interface QuotaProvider {
  /**
   * Check if a request would exceed quota
   */
  checkQuota(request: QuotaCheckRequest): Promise<QuotaCheckResult>;

  /**
   * Record actual cost against quota
   */
  recordCost(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    costUsd: number
  ): Promise<void>;

  /**
   * Get quota status
   */
  getQuota(scope: 'platform' | 'tenant' | 'user', scopeId?: string): Promise<CostQuota | null>;

  /**
   * Set or update quota
   */
  setQuota(
    scope: 'platform' | 'tenant' | 'user',
    scopeId: string | undefined,
    limitUsd: number,
    period: 'hour' | 'day' | 'week' | 'month',
    warningThreshold?: number
  ): Promise<CostQuota>;

  /**
   * Reset quota for a new period
   */
  resetQuota(scope: 'platform' | 'tenant' | 'user', scopeId?: string): Promise<void>;
}
