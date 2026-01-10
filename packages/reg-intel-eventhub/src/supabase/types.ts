import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

/**
 * Minimal interface for Supabase client required by event hubs.
 * This allows compatibility across different versions of @supabase/supabase-js.
 */
export interface SupabaseClientLike {
  channel(
    name: string,
    opts?: { config?: { broadcast?: { self?: boolean } } },
  ): RealtimeChannel;
}

/**
 * Configuration for Supabase Realtime event hubs
 */
export interface SupabaseEventHubConfig {
  /**
   * Supabase URL (required if client not provided)
   */
  supabaseUrl?: string;

  /**
   * Supabase anon/service key (required if client not provided)
   */
  supabaseKey?: string;

  /**
   * Pre-configured Supabase client (preferred over URL/key)
   * Uses a minimal interface to allow compatibility across versions.
   */
  client?: SupabaseClientLike;

  /**
   * Prefix for Supabase Realtime channel names
   * @default 'copilot:events'
   */
  prefix?: string;

  /**
   * Optional pre-generated instance ID
   * If not provided, one will be generated automatically
   */
  instanceId?: string;
}

/**
 * Re-export Supabase types for convenience
 */
export type { SupabaseClient, RealtimeChannel };

/**
 * Default timeout for channel subscription (30 seconds)
 */
export const CHANNEL_SUBSCRIBE_TIMEOUT_MS = 30000;
