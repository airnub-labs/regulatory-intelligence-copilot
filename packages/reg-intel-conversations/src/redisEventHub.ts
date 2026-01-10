import type {
  RedisPubSubClient,
  RedisKeyValueClient,
} from '@reg-copilot/reg-intel-cache';
import {
  GenericRedisEventHub,
  type RedisEventHubConfig as GenericRedisEventHubConfig,
  type SseSubscriber,
} from '@reg-copilot/reg-intel-eventhub';
import type {
  ConversationEventType,
  ConversationListEventType,
} from './eventHub.js';
import {
  SupabaseRealtimeConversationEventHub,
  SupabaseRealtimeConversationListEventHub,
  type SupabaseRealtimeEventHubConfig,
} from './supabaseEventHub.js';

/**
 * Configuration for Redis-backed event hubs
 */
export interface RedisEventHubConfig {
  /**
   * Redis pub/sub clients created by the cache factory
   */
  clients: { pub: RedisPubSubClient; sub: RedisPubSubClient };
  /**
   * Optional prefix for Redis pub/sub channels
   * @default 'copilot:events'
   */
  prefix?: string;
  /** Optional ping client for health checks */
  healthCheckClient?: RedisKeyValueClient;
}

export type EventHubFactoryConfig =
  | RedisEventHubConfig
  | {
      redis?: RedisEventHubConfig;
      supabase?: SupabaseRealtimeEventHubConfig;
    };

/**
 * Redis-backed conversation event hub for distributed SSE
 *
 * ## Architecture
 *
 * This implementation enables SSE events to be broadcast across multiple Next.js instances:
 *
 * ```
 * Instance 1: Client A subscribes → Local subscriber stored
 *             ↓
 *             Redis pub/sub channel: "copilot:events:conversation:{tenantId}:{conversationId}"
 *             ↓
 * Instance 2: broadcast() called → Publishes to Redis
 *             ↓
 * Instance 1: Receives from Redis → Sends to Client A's SSE connection
 * ```
 *
 * ## Key Design Decisions
 *
 * 1. **Local Subscribers**: SSE connections are instance-local, so subscribers are stored in memory
 * 2. **Redis Pub/Sub**: Used only for cross-instance event distribution
 * 3. **Lazy Subscription**: Only subscribe to Redis channels when first local subscriber connects
 * 4. **Graceful Cleanup**: Unsubscribe from Redis when last local subscriber disconnects
 * 5. **Error Resilience**: Redis errors log warnings but don't crash the service
 *
 * ## Usage
 *
 * ```typescript
 * const eventHub = new RedisConversationEventHub({
 *   clients: createPubSubClientPair(resolveRedisBackend('eventHub'))!,
 * });
 *
 * // Subscribe (same API as in-memory version)
 * const unsubscribe = eventHub.subscribe(tenantId, conversationId, subscriber);
 *
 * // Broadcast to all instances
 * eventHub.broadcast(tenantId, conversationId, 'message', { text: 'Hello' });
 * ```
 */
export class RedisConversationEventHub extends GenericRedisEventHub<ConversationEventType> {
  protected override readonly loggerName = 'RedisConversationEventHub';

  constructor(config: RedisEventHubConfig) {
    super({
      clients: config.clients as GenericRedisEventHubConfig['clients'],
      prefix: config.prefix,
      healthCheckClient: config.healthCheckClient as GenericRedisEventHubConfig['healthCheckClient'],
    });
  }

  private channelName(tenantId: string, conversationId: string): string {
    return `${this.prefix}:conversation:${tenantId}:${conversationId}`;
  }

  private key(tenantId: string, conversationId: string): string {
    return `${tenantId}:${conversationId}`;
  }

  /**
   * Subscribe a local SSE connection to conversation events
   */
  subscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ): () => void {
    return this.subscribeInternal(
      this.key(tenantId, conversationId),
      this.channelName(tenantId, conversationId),
      subscriber,
    );
  }

  /**
   * Unsubscribe a local SSE connection
   */
  unsubscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ): void {
    this.unsubscribeInternal(
      this.key(tenantId, conversationId),
      this.channelName(tenantId, conversationId),
      subscriber,
    );
  }

  /**
   * Broadcast an event to all instances
   */
  broadcast(
    tenantId: string,
    conversationId: string,
    event: ConversationEventType,
    data: unknown,
  ): void {
    this.broadcastInternal(
      this.key(tenantId, conversationId),
      this.channelName(tenantId, conversationId),
      event,
      data,
    );
  }
}

/**
 * Redis-backed conversation list event hub for distributed SSE
 *
 * Similar to RedisConversationEventHub but for conversation list events
 * (create, update, delete, archive, etc.)
 */
export class RedisConversationListEventHub extends GenericRedisEventHub<ConversationListEventType> {
  protected override readonly loggerName = 'RedisConversationListEventHub';

  constructor(config: RedisEventHubConfig) {
    super({
      clients: config.clients as GenericRedisEventHubConfig['clients'],
      prefix: config.prefix,
      healthCheckClient: config.healthCheckClient as GenericRedisEventHubConfig['healthCheckClient'],
    });
  }

  private channelName(tenantId: string): string {
    return `${this.prefix}:conversation-list:${tenantId}`;
  }

  private key(tenantId: string): string {
    return tenantId;
  }

  subscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): () => void {
    return this.subscribeInternal(
      this.key(tenantId),
      this.channelName(tenantId),
      subscriber,
    );
  }

  unsubscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): void {
    this.unsubscribeInternal(
      this.key(tenantId),
      this.channelName(tenantId),
      subscriber,
    );
  }

  broadcast(tenantId: string, event: ConversationListEventType, data: unknown): void {
    this.broadcastInternal(
      this.key(tenantId),
      this.channelName(tenantId),
      event,
      data,
    );
  }
}

/**
 * Create event hub instances with automatic transport selection
 *
 * If Redis credentials are provided, returns Redis-backed hubs.
 * Otherwise, uses Supabase Realtime when credentials are present.
 * Throws when neither transport is configured to avoid silent single-instance drift.
 */
export function createEventHubs(config?: EventHubFactoryConfig): {
  conversationEventHub: RedisConversationEventHub | SupabaseRealtimeConversationEventHub;
  conversationListEventHub: RedisConversationListEventHub | SupabaseRealtimeConversationListEventHub;
} {
  const redisConfig =
    (config && 'clients' in config ? config : (config && 'redis' in config) ? config.redis : undefined) ?? undefined;
  const supabaseConfig = (config && 'supabase' in config ? config.supabase : undefined) ?? undefined;

  if (redisConfig?.clients) {
    return {
      conversationEventHub: new RedisConversationEventHub(redisConfig),
      conversationListEventHub: new RedisConversationListEventHub(redisConfig),
    };
  }

  if (supabaseConfig?.client || (supabaseConfig?.supabaseUrl && supabaseConfig?.supabaseKey)) {
    return {
      conversationEventHub: new SupabaseRealtimeConversationEventHub(supabaseConfig),
      conversationListEventHub: new SupabaseRealtimeConversationListEventHub(supabaseConfig),
    };
  }

  throw new Error('Event hubs require Redis or Supabase Realtime credentials; provide pub/sub clients or Supabase config.');
}
