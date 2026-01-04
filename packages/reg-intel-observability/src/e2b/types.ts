/**
 * E2B Cost Tracking Types
 *
 * Type definitions for E2B sandbox pricing, cost calculation, and resource tracking.
 * Mirrors the LLM cost tracking architecture for consistency.
 */

/**
 * Pricing for a specific E2B sandbox tier
 */
export interface E2BPricing {
  /** Sandbox tier (e.g., 'standard', 'gpu', 'high-memory') */
  tier: string;

  /** Region (e.g., 'us-east-1', 'eu-west-1') */
  region: string;

  /** Base price per second of execution time (USD) */
  pricePerSecond: number;

  /** Optional: Price per CPU core-hour (USD) */
  pricePerCpuCoreHour?: number;

  /** Optional: Price per GB memory-hour (USD) */
  pricePerGbMemoryHour?: number;

  /** Optional: Price per GB disk I/O (USD) */
  pricePerGbDiskIO?: number;

  /** When this pricing became effective */
  effectiveDate: string;

  /** Optional: When this pricing expires (null if current) */
  expiresAt?: string | null;

  /** Optional: Notes about this pricing */
  notes?: string;
}

/**
 * Resource usage for an E2B sandbox
 */
export interface E2BResourceUsage {
  /** Total execution/uptime in seconds */
  executionTimeSeconds: number;

  /** Optional: CPU core-seconds consumed (cores * seconds) */
  cpuCoreSeconds?: number;

  /** Optional: Memory GB-seconds consumed (GB * seconds) */
  memoryGbSeconds?: number;

  /** Optional: Disk I/O in GB */
  diskIoGb?: number;

  /** Optional: Network I/O in GB */
  networkIoGb?: number;

  /** Optional: Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Cost calculation result for E2B
 */
export interface E2BCostCalculation {
  /** Execution time cost in USD */
  executionCostUsd: number;

  /** Resource usage cost in USD (CPU, memory, disk) */
  resourceCostUsd: number;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Pricing information used */
  pricing: E2BPricing;

  /** Whether pricing is estimated (if exact pricing unavailable) */
  isEstimated: boolean;
}

/**
 * Cost estimate request for E2B
 */
export interface E2BCostEstimateRequest {
  /** Sandbox tier */
  tier: string;

  /** Region */
  region?: string;

  /** Resource usage */
  resourceUsage: E2BResourceUsage;

  /** Optional: specific pricing date to use */
  pricingDate?: Date;
}

/**
 * E2B cost record for database storage
 */
export interface E2BCostRecord {
  /** Unique ID */
  id: string;

  /** Timestamp */
  timestamp: Date;

  /** Execution context reference */
  executionContextId?: string;

  /** E2B sandbox ID */
  sandboxId: string;

  /** Sandbox tier */
  tier: string;

  /** Region */
  region: string;

  /** Resource usage */
  executionTimeSeconds: number;
  cpuCoreSeconds?: number;
  memoryGbSeconds?: number;
  diskIoGb?: number;
  networkIoGb?: number;

  /** Costs */
  executionCostUsd: number;
  resourceCostUsd: number;
  totalCostUsd: number;
  isEstimated: boolean;

  /** Attribution */
  tenantId: string;
  userId?: string;
  conversationId?: string;
  pathId?: string;

  /** Sandbox lifecycle timestamps */
  createdAtSandbox?: Date;
  terminatedAtSandbox?: Date;
  sandboxStatus?: 'creating' | 'ready' | 'error' | 'terminated';

  /** Metadata */
  success: boolean;
  errorMessage?: string;
  operationType?: string;
}

/**
 * E2B operation metrics for observability
 */
export interface E2BOperationMetrics {
  /** Operation type */
  operation: 'create' | 'reconnect' | 'terminate' | 'cleanup' | 'execute';

  /** Sandbox ID */
  sandboxId: string;

  /** Tier */
  tier: string;

  /** Region */
  region?: string;

  /** Duration in milliseconds */
  durationMs: number;

  /** Success status */
  success: boolean;

  /** Error message if failed */
  errorMessage?: string;

  /** Attribution */
  tenantId?: string;
  userId?: string;
  conversationId?: string;
  pathId?: string;

  /** Resource usage (for execute operations) */
  resourceUsage?: E2BResourceUsage;

  /** Cost (if calculated) */
  costUsd?: number;

  /** Timestamp */
  timestamp?: Date;
}

/**
 * E2B quota check result
 */
export interface E2BQuotaCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean;

  /** Current quota limit in USD */
  limitUsd: number;

  /** Current spend in USD */
  currentSpendUsd: number;

  /** Estimated cost of this operation in USD */
  estimatedCostUsd: number;

  /** Remaining budget in USD */
  remainingUsd: number;

  /** Utilization percentage (0-100) */
  utilizationPercent: number;

  /** Warning threshold reached */
  warningThresholdReached: boolean;

  /** Reason for denial (if not allowed) */
  denialReason?: string;
}

/**
 * E2B quota reservation (for atomic reserve-commit pattern)
 */
export interface E2BQuotaReservation {
  /** Reservation ID */
  reservationId: string;

  /** Tenant ID */
  tenantId: string;

  /** Estimated cost reserved */
  estimatedCostUsd: number;

  /** Expiration time for reservation */
  expiresAt: Date;
}
