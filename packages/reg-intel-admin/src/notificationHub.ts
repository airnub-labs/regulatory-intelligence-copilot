import {
  GenericRedisEventHub,
  GenericSupabaseEventHub,
  type RedisEventHubConfig,
  type SupabaseEventHubConfig,
  type SseSubscriber,
  type SupabaseClientLike,
} from '@reg-copilot/reg-intel-eventhub';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationEventType } from './types.js';

/**
 * Configuration for Redis-backed notification event hub
 */
export interface RedisNotificationHubConfig extends RedisEventHubConfig {
  /**
   * Optional prefix for Redis pub/sub channels
   * @default 'admin:events'
   */
  prefix?: string;
}

/**
 * Configuration for Supabase Realtime notification event hub
 */
export interface SupabaseNotificationHubConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  client?: SupabaseClient;
  prefix?: string;
  instanceId?: string;
}

/**
 * Redis-backed notification event hub for distributed SSE
 *
 * Enables real-time notification delivery across multiple application instances.
 *
 * ## Channel Structure
 *
 * Channel: `{prefix}:notifications:{userId}`
 *
 * ## Events
 *
 * - `notification:new` - New notification created
 * - `notification:read` - Notification marked as read
 * - `notification:dismissed` - Notification dismissed
 * - `notification:archived` - Notification archived
 * - `notification:deleted` - Notification permanently deleted
 * - `snapshot` - Full list sent on initial connection
 *
 * ## Usage
 *
 * ```typescript
 * const notificationHub = new RedisNotificationHub({
 *   clients: createPubSubClientPair(resolveRedisBackend('eventHub'))!,
 * });
 *
 * // Subscribe a user's SSE connection
 * const unsubscribe = notificationHub.subscribe(userId, subscriber);
 *
 * // Broadcast a new notification to all instances
 * notificationHub.broadcast(userId, 'notification:new', { id: '...', title: '...' });
 * ```
 */
export class RedisNotificationHub extends GenericRedisEventHub<NotificationEventType> {
  protected override readonly loggerName = 'RedisNotificationHub';

  constructor(config: RedisNotificationHubConfig) {
    super({
      clients: config.clients,
      prefix: config.prefix ?? 'admin:events',
      healthCheckClient: config.healthCheckClient,
    });
  }

  private channelName(userId: string): string {
    return `${this.prefix}:notifications:${userId}`;
  }

  /**
   * Subscribe a local SSE connection to notification events for a user
   */
  subscribe(userId: string, subscriber: SseSubscriber<NotificationEventType>): () => void {
    return this.subscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Unsubscribe a local SSE connection
   */
  unsubscribe(userId: string, subscriber: SseSubscriber<NotificationEventType>): void {
    this.unsubscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Broadcast a notification event to all instances for a user
   */
  broadcast(userId: string, event: NotificationEventType, data: unknown): void {
    this.broadcastInternal(userId, this.channelName(userId), event, data);
  }
}

/**
 * Supabase Realtime notification event hub for distributed SSE
 *
 * Uses Supabase Realtime broadcast channels for cross-instance notification delivery.
 *
 * ## Usage
 *
 * ```typescript
 * const notificationHub = new SupabaseNotificationHub({
 *   client: supabaseClient,
 *   // or
 *   supabaseUrl: process.env.SUPABASE_URL,
 *   supabaseKey: process.env.SUPABASE_KEY,
 * });
 *
 * const unsubscribe = notificationHub.subscribe(userId, subscriber);
 * notificationHub.broadcast(userId, 'notification:new', { id: '...', title: '...' });
 * ```
 */
export class SupabaseNotificationHub extends GenericSupabaseEventHub<NotificationEventType> {
  protected override readonly loggerName = 'SupabaseNotificationHub';
  protected override readonly broadcastEventName = 'notification';

  constructor(config: SupabaseNotificationHubConfig) {
    // Use double assertion to bypass Supabase version compatibility issues
    // The client interface is compatible at runtime across versions
    super({
      client: config.client as unknown as SupabaseClientLike,
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      prefix: config.prefix ?? 'admin:events',
      instanceId: config.instanceId,
    });
  }

  private channelName(userId: string): string {
    return `${this.prefix}:notifications:${userId}`;
  }

  /**
   * Subscribe a local SSE connection to notification events for a user
   */
  subscribe(userId: string, subscriber: SseSubscriber<NotificationEventType>): () => void {
    return this.subscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Unsubscribe a local SSE connection
   */
  unsubscribe(userId: string, subscriber: SseSubscriber<NotificationEventType>): void {
    this.unsubscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Broadcast a notification event to all instances for a user
   */
  broadcast(userId: string, event: NotificationEventType, data: unknown): void {
    this.broadcastInternal(userId, this.channelName(userId), event, data);
  }
}
