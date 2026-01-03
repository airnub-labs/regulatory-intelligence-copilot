/**
 * Conversation Configuration System
 *
 * Provides configuration for conversation compaction, summarization,
 * and path management at global, tenant, and user levels.
 */

import { createKeyValueClient, type ResolvedBackend, type RedisKeyValueClient } from '@reg-copilot/reg-intel-cache';
import type { SupabaseLikeClient } from './conversationStores.js';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Compression strategy for path merging
 */
export type MergeCompressionStrategy =
  | 'none'           // No compression, keep all messages
  | 'minimal'        // Light compression, remove only duplicates
  | 'moderate'       // Moderate compression, summarize redundant exchanges
  | 'aggressive';    // Aggressive compression, keep only key decisions/outcomes

/**
 * Compression strategy for active conversation paths
 */
export type PathCompressionStrategy =
  | 'none'           // No compression
  | 'sliding_window' // Keep last N messages, summarize older
  | 'semantic'       // Compress based on semantic similarity
  | 'hybrid';        // Combination of sliding window + semantic

/**
 * Configuration for conversation path behavior
 */
export interface ConversationConfig {
  // Merge compression
  mergeCompressionStrategy: MergeCompressionStrategy;
  mergeMaxMessages?: number;          // Max messages to keep in merged path
  mergePreservePinned?: boolean;      // Always preserve pinned/starred messages

  // Path compression
  pathCompressionStrategy: PathCompressionStrategy;
  pathMaxMessages?: number;           // Trigger compression when path exceeds this
  pathSlidingWindowSize?: number;     // Size of sliding window (for sliding_window strategy)
  pathCompressionThreshold?: number;  // Similarity threshold (for semantic strategy)

  // General settings
  autoCompactEnabled?: boolean;       // Enable automatic compaction
  compactionIntervalMinutes?: number; // How often to run compaction

  // Metadata
  configLevel: 'global' | 'tenant' | 'user';
  configScope: string;                // 'global', tenant ID, or user ID
  updatedAt: Date;
  updatedBy?: string | null;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt'> = {
  mergeCompressionStrategy: 'moderate',
  mergeMaxMessages: 100,
  mergePreservePinned: true,

  pathCompressionStrategy: 'sliding_window',
  pathMaxMessages: 200,
  pathSlidingWindowSize: 50,
  pathCompressionThreshold: 0.85,

  autoCompactEnabled: true,
  compactionIntervalMinutes: 60,
};

// =============================================================================
// Configuration Store Interface
// =============================================================================

export interface GetConfigInput {
  tenantId: string;
  userId?: string | null;
}

export interface SetConfigInput {
  tenantId: string;
  userId?: string | null;
  config: Partial<Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt' | 'updatedBy'>>;
  updatedBy?: string | null;
}

export interface ConversationConfigStore {
  /**
   * Get effective configuration for a user/tenant.
   * Returns merged config: user overrides tenant overrides global defaults.
   */
  getConfig(input: GetConfigInput): Promise<ConversationConfig>;

  /**
   * Set configuration at global level
   */
  setGlobalConfig(config: Partial<Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt' | 'updatedBy'>>, updatedBy?: string): Promise<void>;

  /**
   * Set configuration at tenant level
   */
  setTenantConfig(input: SetConfigInput): Promise<void>;

  /**
   * Set configuration at user level
   */
  setUserConfig(input: SetConfigInput): Promise<void>;

  /**
   * Delete tenant-level configuration (fall back to global)
   */
  deleteTenantConfig(tenantId: string): Promise<void>;

  /**
   * Delete user-level configuration (fall back to tenant/global)
   */
  deleteUserConfig(input: { tenantId: string; userId: string }): Promise<void>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * @deprecated In-memory config storage is maintained only for legacy tests.
 * Prefer Supabase-backed config stores (with optional Redis caching) in multi-instance environments.
 */
export class InMemoryConversationConfigStore implements ConversationConfigStore {
  private globalConfig: ConversationConfig | null = null;
  private tenantConfigs = new Map<string, ConversationConfig>();
  private userConfigs = new Map<string, ConversationConfig>(); // key: `${tenantId}:${userId}`

  private getUserKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  async getConfig(input: GetConfigInput): Promise<ConversationConfig> {
    // Start with defaults
    let config: ConversationConfig = {
      ...DEFAULT_CONFIG,
      configLevel: 'global',
      configScope: 'global',
      updatedAt: new Date(),
    };

    // Override with global config
    if (this.globalConfig) {
      config = { ...config, ...this.globalConfig };
    }

    // Override with tenant config
    const tenantConfig = this.tenantConfigs.get(input.tenantId);
    if (tenantConfig) {
      config = { ...config, ...tenantConfig };
    }

    // Override with user config
    if (input.userId) {
      const userKey = this.getUserKey(input.tenantId, input.userId);
      const userConfig = this.userConfigs.get(userKey);
      if (userConfig) {
        config = { ...config, ...userConfig };
      }
    }

    return config;
  }

  async setGlobalConfig(
    partialConfig: Partial<Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt' | 'updatedBy'>>,
    updatedBy?: string
  ): Promise<void> {
    this.globalConfig = {
      ...DEFAULT_CONFIG,
      ...this.globalConfig,
      ...partialConfig,
      configLevel: 'global',
      configScope: 'global',
      updatedAt: new Date(),
      updatedBy: updatedBy ?? null,
    };
  }

  async setTenantConfig(input: SetConfigInput): Promise<void> {
    const existing = this.tenantConfigs.get(input.tenantId);
    this.tenantConfigs.set(input.tenantId, {
      ...DEFAULT_CONFIG,
      ...existing,
      ...input.config,
      configLevel: 'tenant',
      configScope: input.tenantId,
      updatedAt: new Date(),
      updatedBy: input.updatedBy ?? null,
    });
  }

  async setUserConfig(input: SetConfigInput): Promise<void> {
    if (!input.userId) {
      throw new Error('userId required for user-level config');
    }

    const userKey = this.getUserKey(input.tenantId, input.userId);
    const existing = this.userConfigs.get(userKey);
    this.userConfigs.set(userKey, {
      ...DEFAULT_CONFIG,
      ...existing,
      ...input.config,
      configLevel: 'user',
      configScope: input.userId,
      updatedAt: new Date(),
      updatedBy: input.updatedBy ?? null,
    });
  }

  async deleteTenantConfig(tenantId: string): Promise<void> {
    this.tenantConfigs.delete(tenantId);
  }

  async deleteUserConfig(input: { tenantId: string; userId: string }): Promise<void> {
    const userKey = this.getUserKey(input.tenantId, input.userId);
    this.userConfigs.delete(userKey);
  }

  // Test helper
  clear(): void {
    this.globalConfig = null;
    this.tenantConfigs.clear();
    this.userConfigs.clear();
  }
}

// =============================================================================
// Supabase Implementation
// =============================================================================

interface ConversationConfigRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  config_level: 'global' | 'tenant' | 'user';

  merge_compression_strategy: MergeCompressionStrategy;
  merge_max_messages: number | null;
  merge_preserve_pinned: boolean | null;

  path_compression_strategy: PathCompressionStrategy;
  path_max_messages: number | null;
  path_sliding_window_size: number | null;
  path_compression_threshold: number | null;

  auto_compact_enabled: boolean | null;
  compaction_interval_minutes: number | null;

  updated_at: string;
  updated_by: string | null;
}

export class SupabaseConversationConfigStore implements ConversationConfigStore {
  constructor(
    private supabase: SupabaseLikeClient,
    private logger?: { info?: (msg: string, meta?: any) => void; error?: (msg: string, meta?: any) => void }
  ) {}

  private mapRow(row: ConversationConfigRow): ConversationConfig {
    return {
      mergeCompressionStrategy: row.merge_compression_strategy,
      mergeMaxMessages: row.merge_max_messages ?? undefined,
      mergePreservePinned: row.merge_preserve_pinned ?? undefined,

      pathCompressionStrategy: row.path_compression_strategy,
      pathMaxMessages: row.path_max_messages ?? undefined,
      pathSlidingWindowSize: row.path_sliding_window_size ?? undefined,
      pathCompressionThreshold: row.path_compression_threshold ?? undefined,

      autoCompactEnabled: row.auto_compact_enabled ?? undefined,
      compactionIntervalMinutes: row.compaction_interval_minutes ?? undefined,

      configLevel: row.config_level,
      configScope: row.user_id ?? row.tenant_id,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
    };
  }

  async getConfig(input: GetConfigInput): Promise<ConversationConfig> {
    // Query for all relevant configs (global, tenant, user)
    const { data, error } = await this.supabase
      .from('conversation_configs')
      .select('*')
      .or(`config_level.eq.global,and(config_level.eq.tenant,tenant_id.eq.${input.tenantId})${input.userId ? `,and(config_level.eq.user,tenant_id.eq.${input.tenantId},user_id.eq.${input.userId})` : ''}`)
      .order('config_level', { ascending: true }); // global < tenant < user

    if (error) {
      this.logger?.error?.('[SupabaseConversationConfigStore] Failed to get config', { error });
      throw new Error(`Failed to get conversation config: ${error.message}`);
    }

    // Merge configs in order: defaults -> global -> tenant -> user
    let config: ConversationConfig = {
      ...DEFAULT_CONFIG,
      configLevel: 'global',
      configScope: 'global',
      updatedAt: new Date(),
    };

    for (const row of (data ?? [])) {
      const rowConfig = this.mapRow(row);
      config = { ...config, ...rowConfig };
    }

    return config;
  }

  async setGlobalConfig(
    partialConfig: Partial<Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt' | 'updatedBy'>>,
    updatedBy?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('conversation_configs')
      .upsert({
        config_level: 'global',
        tenant_id: 'global',
        user_id: null,
        merge_compression_strategy: partialConfig.mergeCompressionStrategy ?? DEFAULT_CONFIG.mergeCompressionStrategy,
        merge_max_messages: partialConfig.mergeMaxMessages ?? null,
        merge_preserve_pinned: partialConfig.mergePreservePinned ?? null,
        path_compression_strategy: partialConfig.pathCompressionStrategy ?? DEFAULT_CONFIG.pathCompressionStrategy,
        path_max_messages: partialConfig.pathMaxMessages ?? null,
        path_sliding_window_size: partialConfig.pathSlidingWindowSize ?? null,
        path_compression_threshold: partialConfig.pathCompressionThreshold ?? null,
        auto_compact_enabled: partialConfig.autoCompactEnabled ?? null,
        compaction_interval_minutes: partialConfig.compactionIntervalMinutes ?? null,
        updated_by: updatedBy ?? null,
      }, {
        onConflict: 'config_level,tenant_id,user_id',
      });

    if (error) {
      this.logger?.error?.('[SupabaseConversationConfigStore] Failed to set global config', { error });
      throw new Error(`Failed to set global config: ${error.message}`);
    }
  }

  async setTenantConfig(input: SetConfigInput): Promise<void> {
    const { error } = await this.supabase
      .from('conversation_configs')
      .upsert({
        config_level: 'tenant',
        tenant_id: input.tenantId,
        user_id: null,
        merge_compression_strategy: input.config.mergeCompressionStrategy ?? DEFAULT_CONFIG.mergeCompressionStrategy,
        merge_max_messages: input.config.mergeMaxMessages ?? null,
        merge_preserve_pinned: input.config.mergePreservePinned ?? null,
        path_compression_strategy: input.config.pathCompressionStrategy ?? DEFAULT_CONFIG.pathCompressionStrategy,
        path_max_messages: input.config.pathMaxMessages ?? null,
        path_sliding_window_size: input.config.pathSlidingWindowSize ?? null,
        path_compression_threshold: input.config.pathCompressionThreshold ?? null,
        auto_compact_enabled: input.config.autoCompactEnabled ?? null,
        compaction_interval_minutes: input.config.compactionIntervalMinutes ?? null,
        updated_by: input.updatedBy ?? null,
      }, {
        onConflict: 'config_level,tenant_id,user_id',
      });

    if (error) {
      this.logger?.error?.('[SupabaseConversationConfigStore] Failed to set tenant config', { error, tenantId: input.tenantId });
      throw new Error(`Failed to set tenant config: ${error.message}`);
    }
  }

  async setUserConfig(input: SetConfigInput): Promise<void> {
    if (!input.userId) {
      throw new Error('userId required for user-level config');
    }

    const { error } = await this.supabase
      .from('conversation_configs')
      .upsert({
        config_level: 'user',
        tenant_id: input.tenantId,
        user_id: input.userId,
        merge_compression_strategy: input.config.mergeCompressionStrategy ?? DEFAULT_CONFIG.mergeCompressionStrategy,
        merge_max_messages: input.config.mergeMaxMessages ?? null,
        merge_preserve_pinned: input.config.mergePreservePinned ?? null,
        path_compression_strategy: input.config.pathCompressionStrategy ?? DEFAULT_CONFIG.pathCompressionStrategy,
        path_max_messages: input.config.pathMaxMessages ?? null,
        path_sliding_window_size: input.config.pathSlidingWindowSize ?? null,
        path_compression_threshold: input.config.pathCompressionThreshold ?? null,
        auto_compact_enabled: input.config.autoCompactEnabled ?? null,
        compaction_interval_minutes: input.config.compactionIntervalMinutes ?? null,
        updated_by: input.updatedBy ?? null,
      }, {
        onConflict: 'config_level,tenant_id,user_id',
      });

    if (error) {
      this.logger?.error?.('[SupabaseConversationConfigStore] Failed to set user config', { error, tenantId: input.tenantId, userId: input.userId });
      throw new Error(`Failed to set user config: ${error.message}`);
    }
  }

  async deleteTenantConfig(tenantId: string): Promise<void> {
    const { error } = await this.supabase
      .from('conversation_configs')
      .delete()
      .eq('config_level', 'tenant')
      .eq('tenant_id', tenantId);

    if (error) {
      this.logger?.error?.('[SupabaseConversationConfigStore] Failed to delete tenant config', { error, tenantId });
      throw new Error(`Failed to delete tenant config: ${error.message}`);
    }
  }

  async deleteUserConfig(input: { tenantId: string; userId: string }): Promise<void> {
    const { error } = await this.supabase
      .from('conversation_configs')
      .delete()
      .eq('config_level', 'user')
      .eq('tenant_id', input.tenantId)
      .eq('user_id', input.userId);

    if (error) {
      this.logger?.error?.('[SupabaseConversationConfigStore] Failed to delete user config', { error, tenantId: input.tenantId, userId: input.userId });
      throw new Error(`Failed to delete user config: ${error.message}`);
    }
  }
}

export interface CachingConfigStoreOptions {
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSeconds?: number;
  /** Key prefix (default: 'copilot:conv:config') */
  keyPrefix?: string;
}

export class CachingConversationConfigStore implements ConversationConfigStore {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly backing: ConversationConfigStore,
    private readonly redis: RedisKeyValueClient,
    options: CachingConfigStoreOptions = {}
  ) {
    this.ttlSeconds = options.ttlSeconds ?? 300;
    this.keyPrefix = options.keyPrefix ?? 'copilot:conv:config';
  }

  private cacheKey(tenantId: string, userId?: string | null): string {
    return userId
      ? `${this.keyPrefix}:${tenantId}:${userId}`
      : `${this.keyPrefix}:${tenantId}`;
  }

  async getConfig(input: GetConfigInput): Promise<ConversationConfig> {
    const key = this.cacheKey(input.tenantId, input.userId);

    // Try cache first
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Restore Date object
        parsed.updatedAt = new Date(parsed.updatedAt);
        return parsed as ConversationConfig;
      }
    } catch {
      // Cache miss or error, continue to backing store
    }

    // Fetch from backing store
    const config = await this.backing.getConfig(input);

    // Cache result
    try {
      await this.redis.setex(key, this.ttlSeconds, JSON.stringify(config));
    } catch {
      // Ignore cache write errors
    }

    return config;
  }

  async setGlobalConfig(
    config: Partial<Omit<ConversationConfig, 'configLevel' | 'configScope' | 'updatedAt' | 'updatedBy'>>,
    updatedBy?: string
  ): Promise<void> {
    await this.backing.setGlobalConfig(config, updatedBy);
    // Invalidate all cached configs (global affects everyone)
    // In production, you'd use Redis SCAN or pub/sub for cache invalidation
  }

  async setTenantConfig(input: SetConfigInput): Promise<void> {
    await this.backing.setTenantConfig(input);
    // Invalidate tenant's cached configs
    try {
      await this.redis.del(this.cacheKey(input.tenantId));
    } catch {
      // Ignore
    }
  }

  async setUserConfig(input: SetConfigInput): Promise<void> {
    await this.backing.setUserConfig(input);
    // Invalidate user's cached config
    if (input.userId) {
      try {
        await this.redis.del(this.cacheKey(input.tenantId, input.userId));
      } catch {
        // Ignore
      }
    }
  }

  async deleteTenantConfig(tenantId: string): Promise<void> {
    await this.backing.deleteTenantConfig(tenantId);
    try {
      await this.redis.del(this.cacheKey(tenantId));
    } catch {
      // Ignore
    }
  }

  async deleteUserConfig(input: { tenantId: string; userId: string }): Promise<void> {
    await this.backing.deleteUserConfig(input);
    try {
      await this.redis.del(this.cacheKey(input.tenantId, input.userId));
    } catch {
      // Ignore
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export interface ConfigStoreFactoryOptions {
  supabase?: SupabaseLikeClient;
  redis?: RedisKeyValueClient;
  redisBackend?: ResolvedBackend | null;
  cacheTtlSeconds?: number;
  logger?: { info?: (msg: string, meta?: any) => void; error?: (msg: string, meta?: any) => void };
}

export function createConversationConfigStore(
  options: ConfigStoreFactoryOptions
): ConversationConfigStore {
  if (!options.supabase) {
    throw new Error('Supabase client is required to create a ConversationConfigStore');
  }

  const supabaseStore = new SupabaseConversationConfigStore(options.supabase, options.logger);
  const redisClient = options.redis ?? (options.redisBackend ? createKeyValueClient(options.redisBackend) : null);

  if (redisClient) {
    return new CachingConversationConfigStore(supabaseStore, redisClient, {
      ttlSeconds: options.cacheTtlSeconds,
    });
  }

  return supabaseStore;
}
