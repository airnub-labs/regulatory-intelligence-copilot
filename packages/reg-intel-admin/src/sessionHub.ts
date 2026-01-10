import {
  GenericRedisEventHub,
  GenericSupabaseEventHub,
  type RedisEventHubConfig,
  type SupabaseEventHubConfig,
  type SseSubscriber,
  type SupabaseClientLike,
} from '@reg-copilot/reg-intel-eventhub';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionEventType } from './types.js';

/**
 * Configuration for Redis-backed session event hub
 */
export interface RedisSessionHubConfig extends RedisEventHubConfig {
  /**
   * Optional prefix for Redis pub/sub channels
   * @default 'admin:events'
   */
  prefix?: string;
}

/**
 * Configuration for Supabase Realtime session event hub
 */
export interface SupabaseSessionHubConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  client?: SupabaseClient;
  prefix?: string;
  instanceId?: string;
}

/**
 * Redis-backed session event hub for distributed SSE
 *
 * Enables real-time session management and forced logout across multiple application instances.
 *
 * ## Channel Structure
 *
 * Channel: `{prefix}:sessions:{userId}`
 *
 * ## Events
 *
 * - `session:created` - New session started (login from new device)
 * - `session:revoked` - Session was revoked → TRIGGERS LOGOUT on that session
 * - `session:all_revoked` - Global logout → TRIGGERS LOGOUT on all sessions
 * - `session:expired` - Session naturally expired
 * - `snapshot` - Full list sent on initial connection
 *
 * ## Forced Logout Flow
 *
 * When an admin revokes a session:
 * 1. Server calls `sessionHub.broadcast(userId, 'session:revoked', { sessionId })`
 * 2. All connected SSE clients for that user receive the event
 * 3. Client checks if revoked sessionId matches their own session
 * 4. If match, client immediately logs out and redirects to sign-in
 *
 * ## Usage
 *
 * ```typescript
 * const sessionHub = new RedisSessionHub({
 *   clients: createPubSubClientPair(resolveRedisBackend('eventHub'))!,
 * });
 *
 * // Subscribe a user's SSE connection (include current sessionId for logout detection)
 * const unsubscribe = sessionHub.subscribe(userId, subscriber);
 *
 * // After revoking a session, broadcast to trigger logout
 * sessionHub.broadcast(userId, 'session:revoked', {
 *   sessionId: revokedSessionId,
 *   revokedBy: adminUserId,
 *   reason: 'Security policy violation',
 * });
 *
 * // For global logout (all sessions)
 * sessionHub.broadcast(userId, 'session:all_revoked', {
 *   revokedBy: adminUserId,
 *   reason: 'Password changed',
 * });
 * ```
 */
export class RedisSessionHub extends GenericRedisEventHub<SessionEventType> {
  protected override readonly loggerName = 'RedisSessionHub';

  constructor(config: RedisSessionHubConfig) {
    super({
      clients: config.clients,
      prefix: config.prefix ?? 'admin:events',
      healthCheckClient: config.healthCheckClient,
    });
  }

  private channelName(userId: string): string {
    return `${this.prefix}:sessions:${userId}`;
  }

  /**
   * Subscribe a local SSE connection to session events for a user
   */
  subscribe(userId: string, subscriber: SseSubscriber<SessionEventType>): () => void {
    return this.subscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Unsubscribe a local SSE connection
   */
  unsubscribe(userId: string, subscriber: SseSubscriber<SessionEventType>): void {
    this.unsubscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Broadcast a session event to all instances for a user
   */
  broadcast(userId: string, event: SessionEventType, data: unknown): void {
    this.broadcastInternal(userId, this.channelName(userId), event, data);
  }
}

/**
 * Supabase Realtime session event hub for distributed SSE
 *
 * Uses Supabase Realtime broadcast channels for cross-instance session event delivery.
 *
 * ## Usage
 *
 * ```typescript
 * const sessionHub = new SupabaseSessionHub({
 *   client: supabaseClient,
 *   // or
 *   supabaseUrl: process.env.SUPABASE_URL,
 *   supabaseKey: process.env.SUPABASE_KEY,
 * });
 *
 * const unsubscribe = sessionHub.subscribe(userId, subscriber);
 *
 * // Trigger forced logout on specific session
 * sessionHub.broadcast(userId, 'session:revoked', { sessionId: '...' });
 *
 * // Trigger forced logout on all sessions
 * sessionHub.broadcast(userId, 'session:all_revoked', { reason: 'Password changed' });
 * ```
 */
export class SupabaseSessionHub extends GenericSupabaseEventHub<SessionEventType> {
  protected override readonly loggerName = 'SupabaseSessionHub';
  protected override readonly broadcastEventName = 'session';

  constructor(config: SupabaseSessionHubConfig) {
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
    return `${this.prefix}:sessions:${userId}`;
  }

  /**
   * Subscribe a local SSE connection to session events for a user
   */
  subscribe(userId: string, subscriber: SseSubscriber<SessionEventType>): () => void {
    return this.subscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Unsubscribe a local SSE connection
   */
  unsubscribe(userId: string, subscriber: SseSubscriber<SessionEventType>): void {
    this.unsubscribeInternal(userId, this.channelName(userId), subscriber);
  }

  /**
   * Broadcast a session event to all instances for a user
   */
  broadcast(userId: string, event: SessionEventType, data: unknown): void {
    this.broadcastInternal(userId, this.channelName(userId), event, data);
  }
}
