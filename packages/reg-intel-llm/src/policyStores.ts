/**
 * Policy Stores - LLM Routing Policy Persistence
 *
 * Provides Supabase-backed storage for tenant LLM policies with optional
 * Redis caching for multi-instance deployments.
 */

import type { RedisKeyValueClient } from '@reg-copilot/reg-intel-cache';
import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { LlmPolicyStore, TenantLlmPolicy, LlmTaskPolicy } from './llmRouter.js';
import type { EgressMode } from './egressClient.js';

const logger = createLogger('PolicyStore');

// ============================================================================
// Types
// ============================================================================

export interface SupabaseLikeClient {
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): {
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    upsert(
      values: Record<string, unknown>,
      options?: { onConflict?: string }
    ): Promise<{ error: { message: string } | null }>;
    delete(): {
      eq(column: string, value: unknown): Promise<{ error: { message: string } | null }>;
    };
  };
}

export type { RedisKeyValueClient as RedisLikeClient } from '@reg-copilot/reg-intel-cache';

interface PolicyRow {
  id: string;
  tenant_id: string;
  default_model: string;
  default_provider: string;
  allow_remote_egress: boolean;
  egress_mode: EgressMode | null;
  allow_off_mode: boolean | null;
  tasks: LlmTaskPolicy[];
  user_policies: Record<string, { egressMode?: EgressMode; allowOffMode?: boolean }>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Supabase Implementation
// ============================================================================

export class SupabasePolicyStore implements LlmPolicyStore {
  private readonly tableName = 'tenant_llm_policies';

  constructor(
    private readonly supabase: SupabaseLikeClient,
    private readonly schema: 'public' | 'copilot_internal' = 'copilot_internal'
  ) {}

  private get table() {
    // Use schema-qualified table name if using copilot_internal
    return this.schema === 'copilot_internal'
      ? `${this.schema}.${this.tableName}`
      : this.tableName;
  }

  async getPolicy(tenantId: string): Promise<TenantLlmPolicy | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      // PGRST116 = no rows found, not an error
      if (error.message.includes('PGRST116')) {
        return null;
      }
      logger.error({ tenantId, error: error.message }, 'Failed to get policy');
      throw new Error(`Failed to get policy: ${error.message}`);
    }

    return data ? this.mapRowToPolicy(data as PolicyRow) : null;
  }

  async setPolicy(policy: TenantLlmPolicy): Promise<void> {
    const row = this.mapPolicyToRow(policy);

    const { error } = await this.supabase
      .from(this.table)
      .upsert(row, { onConflict: 'tenant_id' });

    if (error) {
      logger.error({ tenantId: policy.tenantId, error: error.message }, 'Failed to set policy');
      throw new Error(`Failed to set policy: ${error.message}`);
    }

    logger.info({ tenantId: policy.tenantId }, 'Policy saved to Supabase');
  }

  async deletePolicy(tenantId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error({ tenantId, error: error.message }, 'Failed to delete policy');
      throw new Error(`Failed to delete policy: ${error.message}`);
    }
  }

  private mapRowToPolicy(row: PolicyRow): TenantLlmPolicy {
    return {
      tenantId: row.tenant_id,
      defaultModel: row.default_model,
      defaultProvider: row.default_provider,
      allowRemoteEgress: row.allow_remote_egress,
      egressMode: row.egress_mode ?? undefined,
      allowOffMode: row.allow_off_mode ?? undefined,
      tasks: row.tasks ?? [],
      userPolicies: row.user_policies ?? undefined,
    };
  }

  private mapPolicyToRow(policy: TenantLlmPolicy): Record<string, unknown> {
    return {
      tenant_id: policy.tenantId,
      default_model: policy.defaultModel,
      default_provider: policy.defaultProvider,
      allow_remote_egress: policy.allowRemoteEgress,
      egress_mode: policy.egressMode ?? null,
      allow_off_mode: policy.allowOffMode ?? null,
      tasks: policy.tasks ?? [],
      user_policies: policy.userPolicies ?? {},
    };
  }
}

// ============================================================================
// Caching Layer
// ============================================================================

export interface CachingPolicyStoreOptions {
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
  /** Key prefix (default: 'copilot:llm:policy') */
  keyPrefix?: string;
}

export class CachingPolicyStore implements LlmPolicyStore {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly backing: LlmPolicyStore,
    private readonly redis: RedisKeyValueClient,
    options: CachingPolicyStoreOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 300;
    this.keyPrefix = options.keyPrefix ?? 'copilot:llm:policy';
  }

  private cacheKey(tenantId: string): string {
    return `${this.keyPrefix}:${tenantId}`;
  }

  async getPolicy(tenantId: string): Promise<TenantLlmPolicy | null> {
    const key = this.cacheKey(tenantId);

    // Try cache first
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        logger.debug({ tenantId }, 'Policy cache hit');
        return JSON.parse(cached) as TenantLlmPolicy;
      }
    } catch (err) {
      logger.warn({ tenantId, error: err }, 'Redis cache read failed, falling back to backing store');
    }

    // Cache miss - fetch from backing store
    const policy = await this.backing.getPolicy(tenantId);

    if (policy) {
      try {
        await this.redis.setex(key, this.ttlSeconds, JSON.stringify(policy));
        logger.debug({ tenantId, ttl: this.ttlSeconds }, 'Policy cached');
      } catch (err) {
        logger.warn({ tenantId, error: err }, 'Redis cache write failed');
      }
    }

    return policy;
  }

  async setPolicy(policy: TenantLlmPolicy): Promise<void> {
    // Write to backing store first
    await this.backing.setPolicy(policy);

    // Invalidate cache
    try {
      await this.redis.del(this.cacheKey(policy.tenantId));
      logger.debug({ tenantId: policy.tenantId }, 'Policy cache invalidated');
    } catch (err) {
      logger.warn({ tenantId: policy.tenantId, error: err }, 'Redis cache invalidation failed');
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export interface PolicyStoreConfig {
  supabase?: SupabaseLikeClient;
  redis?: RedisKeyValueClient;
  cacheTtlSeconds?: number;
  schema?: 'public' | 'copilot_internal';
}

/**
 * Create the appropriate policy store based on available configuration.
 *
 * Priority:
 * 1. Supabase + Redis = CachingPolicyStore(SupabasePolicyStore)
 * 2. Supabase only = SupabasePolicyStore
 * 3. Neither = InMemoryPolicyStore (dev/test only)
 */
export function createPolicyStore(config: PolicyStoreConfig): LlmPolicyStore {
  const { InMemoryPolicyStore } = require('./llmRouter.js');

  if (!config.supabase) {
    logger.warn('No Supabase client provided, using InMemoryPolicyStore (not suitable for production)');
    return new InMemoryPolicyStore();
  }

  const supabaseStore = new SupabasePolicyStore(config.supabase, config.schema);

  if (config.redis) {
    logger.info({ ttl: config.cacheTtlSeconds ?? 300 }, 'Using CachingPolicyStore with Redis');
    return new CachingPolicyStore(supabaseStore, config.redis, {
      ttlSeconds: config.cacheTtlSeconds,
    });
  }

  logger.info('Using SupabasePolicyStore without caching');
  return supabaseStore;
}
