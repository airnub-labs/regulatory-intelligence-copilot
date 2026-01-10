import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RedisNotificationHub,
  SupabaseNotificationHub,
  type RedisNotificationHubConfig,
  type SupabaseNotificationHubConfig,
} from './notificationHub.js';
import {
  RedisSessionHub,
  SupabaseSessionHub,
  type RedisSessionHubConfig,
  type SupabaseSessionHubConfig,
} from './sessionHub.js';

/**
 * Combined configuration for admin event hubs
 */
export interface AdminEventHubsConfig {
  /**
   * Redis configuration for pub/sub transport
   * If provided (with clients), Redis will be used as the transport
   */
  redis?: RedisNotificationHubConfig;

  /**
   * Supabase Realtime configuration for pub/sub transport
   * Used as fallback when Redis is not configured
   */
  supabase?: SupabaseNotificationHubConfig;
}

/**
 * Result of createAdminEventHubs factory
 */
export interface AdminEventHubs {
  /**
   * Notification event hub for real-time notification delivery
   */
  notificationHub: RedisNotificationHub | SupabaseNotificationHub;

  /**
   * Session event hub for real-time session management and forced logout
   */
  sessionHub: RedisSessionHub | SupabaseSessionHub;

  /**
   * The transport type being used
   */
  transport: 'redis' | 'supabase';
}

/**
 * Create admin event hub instances with automatic transport selection
 *
 * ## Transport Selection
 *
 * 1. If `redis.clients` is provided → use Redis pub/sub
 * 2. If `supabase.client` or credentials are provided → use Supabase Realtime
 * 3. Otherwise → throws an error (distributed events require a transport)
 *
 * ## Usage
 *
 * ```typescript
 * // With Redis
 * const { notificationHub, sessionHub, transport } = createAdminEventHubs({
 *   redis: {
 *     clients: createPubSubClientPair(resolveRedisBackend('eventHub'))!,
 *   },
 * });
 *
 * // With Supabase Realtime
 * const { notificationHub, sessionHub, transport } = createAdminEventHubs({
 *   supabase: {
 *     client: supabaseClient,
 *   },
 * });
 *
 * // With both (Redis takes priority)
 * const { notificationHub, sessionHub, transport } = createAdminEventHubs({
 *   redis: { clients },
 *   supabase: { client: supabaseClient },
 * });
 * console.log(transport); // 'redis'
 * ```
 *
 * @param config Configuration for Redis and/or Supabase transport
 * @returns Admin event hubs instance
 * @throws Error if neither Redis nor Supabase is configured
 */
export function createAdminEventHubs(config: AdminEventHubsConfig): AdminEventHubs {
  // Redis takes priority if configured
  if (config.redis?.clients) {
    return {
      notificationHub: new RedisNotificationHub(config.redis),
      sessionHub: new RedisSessionHub(config.redis as RedisSessionHubConfig),
      transport: 'redis',
    };
  }

  // Fall back to Supabase Realtime
  if (config.supabase?.client || (config.supabase?.supabaseUrl && config.supabase?.supabaseKey)) {
    return {
      notificationHub: new SupabaseNotificationHub(config.supabase),
      sessionHub: new SupabaseSessionHub(config.supabase as SupabaseSessionHubConfig),
      transport: 'supabase',
    };
  }

  throw new Error(
    'Admin event hubs require Redis or Supabase Realtime credentials. ' +
      'Provide redis.clients or supabase.client/credentials.',
  );
}

/**
 * Create admin event hubs using only Redis
 *
 * Convenience function when you know you want Redis transport.
 */
export function createRedisAdminEventHubs(
  config: RedisNotificationHubConfig,
): {
  notificationHub: RedisNotificationHub;
  sessionHub: RedisSessionHub;
} {
  return {
    notificationHub: new RedisNotificationHub(config),
    sessionHub: new RedisSessionHub(config as RedisSessionHubConfig),
  };
}

/**
 * Create admin event hubs using only Supabase Realtime
 *
 * Convenience function when you know you want Supabase transport.
 */
export function createSupabaseAdminEventHubs(
  config: SupabaseNotificationHubConfig,
): {
  notificationHub: SupabaseNotificationHub;
  sessionHub: SupabaseSessionHub;
} {
  return {
    notificationHub: new SupabaseNotificationHub(config),
    sessionHub: new SupabaseSessionHub(config as SupabaseSessionHubConfig),
  };
}
