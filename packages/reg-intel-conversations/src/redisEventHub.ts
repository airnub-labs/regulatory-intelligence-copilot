import type {
  RedisPubSubClient,
  RedisKeyValueClient,
} from '@reg-copilot/reg-intel-cache';
import type {
  ConversationEventType,
  ConversationListEventType,
  SseSubscriber,
} from './eventHub.js';
import {
  ChannelLifecycleManager,
  LocalSubscriptionManager,
  generateInstanceId,
  type DistributedEventMessage,
} from './sharedEventHub.js';
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
 * ## Environment Variables
 *
 * ```bash
 * # Standard Redis (default)
 * REDIS_URL=redis://localhost:6379
 * REDIS_PASSWORD=your_password
 *
 * # Or Upstash-compatible credentials using the shared REDIS_URL/REDIS_PASSWORD names
 * REDIS_URL=https://your-endpoint.upstash.io
 * REDIS_PASSWORD=your_upstash_token
 * ```
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
export class RedisConversationEventHub {
  private publisher: RedisPubSubClient;
  private subscriber: RedisPubSubClient;
  private subscribers = new LocalSubscriptionManager<ConversationEventType>();
  private activeChannels = new ChannelLifecycleManager<void>();
  private prefix: string;
  private instanceId: string;
  private isShuttingDown = false;
  private healthClient?: RedisKeyValueClient;

  constructor(config: RedisEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = generateInstanceId();
    this.publisher = config.clients.pub;
    this.subscriber = config.clients.sub;
    this.healthClient = config.healthCheckClient;
  }

  private channelName(tenantId: string, conversationId: string): string {
    return `${this.prefix}:conversation:${tenantId}:${conversationId}`;
  }

  private key(tenantId: string, conversationId: string): string {
    return `${tenantId}:${conversationId}`;
  }

  /**
   * Subscribe to Redis channel for a conversation
   * Only called when first local subscriber connects
   *
   * Uses Redis pub/sub so there is no backlog when no clients are listening.
   * For production with high volume, consider using Redis Streams or native Redis protocol.
   */
  private async subscribeToChannel(channel: string, key: string): Promise<void> {
    await this.activeChannels.getOrCreate(channel, async () => {
      try {
        await this.subscriber.subscribe(channel, (message: string) => {
          if (this.isShuttingDown || !this.subscribers.hasSubscribers(key)) {
            return;
          }

          try {
            const parsed = JSON.parse(message) as DistributedEventMessage<ConversationEventType>;

            if (parsed.instanceId === this.instanceId) {
              return;
            }

            this.subscribers.localBroadcast(key, parsed.event, parsed.data);
          } catch (error) {
            console.error(`[RedisEventHub] Error parsing message from ${channel}:`, error);
          }
        });
      } catch (error) {
        console.error(`[RedisEventHub] Error setting up subscription for ${channel}:`, error);
        throw error;
      }
    });
  }

  /**
   * Unsubscribe from Redis channel
   * Only called when last local subscriber disconnects
   */
  private async unsubscribeFromChannel(channel: string): Promise<void> {
    try {
      const subscription = this.activeChannels.take(channel);

      if (subscription) {
        await subscription;
        await this.subscriber.unsubscribe(channel);
      }
    } catch (error) {
      console.error(`[RedisEventHub] Error unsubscribing from ${channel}:`, error);
    }
  }

  /**
   * Subscribe a local SSE connection to conversation events
   */
  subscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ): () => void {
    const key = this.key(tenantId, conversationId);
    const channel = this.channelName(tenantId, conversationId);

    // Add to local subscribers
    const firstSubscriber = this.subscribers.add(key, subscriber);

    if (firstSubscriber) {
      void this.subscribeToChannel(channel, key).catch(error => {
        console.error(`[RedisEventHub] Failed to subscribe to Redis channel ${channel}:`, error);
      });
    }

    // Return unsubscribe function
    return () => this.unsubscribe(tenantId, conversationId, subscriber);
  }

  /**
   * Unsubscribe a local SSE connection
   */
  unsubscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ): void {
    const key = this.key(tenantId, conversationId);
    const channel = this.channelName(tenantId, conversationId);

    const removedLast = this.subscribers.remove(key, subscriber);

    if (removedLast) {
      void this.unsubscribeFromChannel(channel).catch(error => {
        console.error(`[RedisEventHub] Failed to unsubscribe from Redis channel ${channel}:`, error);
      });
    }
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
    const channel = this.channelName(tenantId, conversationId);
    const message: DistributedEventMessage<ConversationEventType> = {
      event,
      data,
      timestamp: Date.now(),
      instanceId: this.instanceId,
    };

    // Broadcast to local subscribers immediately
    const key = this.key(tenantId, conversationId);
    this.subscribers.localBroadcast(key, event, data);

    // Publish to Redis pub/sub for other instances (fire and forget)
    void this.publisher.publish(channel, JSON.stringify(message)).catch((error: unknown) => {
      console.error(`[RedisEventHub] Error publishing to ${channel}:`, error);
    });
  }

  /**
   * Graceful shutdown - unsubscribe from all Redis channels
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    await this.activeChannels.shutdown(async (channelName, subscriptionPromise) => {
      try {
        await subscriptionPromise;
        await this.subscriber.unsubscribe(channelName);
      } catch (error) {
        console.error(`[RedisEventHub] Error shutting down channel ${channelName}:`, error);
      }
    });

    this.subscribers.shutdown();
  }

  /**
   * Health check - verify Redis connectivity
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      if (this.healthClient?.ping) {
        await this.healthClient.ping();
      }
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Redis-backed conversation list event hub for distributed SSE
 *
 * Similar to RedisConversationEventHub but for conversation list events
 * (create, update, delete, archive, etc.)
 */
export class RedisConversationListEventHub {
  private publisher: RedisPubSubClient;
  private subscriber: RedisPubSubClient;
  private subscribers = new LocalSubscriptionManager<ConversationListEventType>();
  private activeChannels = new ChannelLifecycleManager<void>();
  private prefix: string;
  private instanceId: string;
  private isShuttingDown = false;
  private healthClient?: RedisKeyValueClient;

  constructor(config: RedisEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = generateInstanceId();
    this.publisher = config.clients.pub;
    this.subscriber = config.clients.sub;
    this.healthClient = config.healthCheckClient;
  }

  private channelName(tenantId: string): string {
    return `${this.prefix}:conversation-list:${tenantId}`;
  }

  private key(tenantId: string): string {
    return tenantId;
  }

  private async subscribeToChannel(channel: string, key: string): Promise<void> {
    await this.activeChannels.getOrCreate(channel, async () => {
      try {
        await this.subscriber.subscribe(channel, (message: string) => {
          if (this.isShuttingDown || !this.subscribers.hasSubscribers(key)) {
            return;
          }

          try {
            const parsed = JSON.parse(message) as DistributedEventMessage<ConversationListEventType>;

            if (parsed.instanceId === this.instanceId) {
              return;
            }

            this.subscribers.localBroadcast(key, parsed.event, parsed.data);
          } catch (error) {
            console.error(`[RedisListEventHub] Error parsing message from ${channel}:`, error);
          }
        });
      } catch (error) {
        console.error(`[RedisListEventHub] Error setting up subscription for ${channel}:`, error);
        throw error;
      }
    });
  }

  private async unsubscribeFromChannel(channel: string): Promise<void> {
    try {
      const subscription = this.activeChannels.take(channel);

      if (subscription) {
        await subscription;
        await this.subscriber.unsubscribe(channel);
      }
    } catch (error) {
      console.error(`[RedisListEventHub] Error unsubscribing from ${channel}:`, error);
    }
  }

  subscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): () => void {
    const key = this.key(tenantId);
    const channel = this.channelName(tenantId);

    const firstSubscriber = this.subscribers.add(key, subscriber);

    // Subscribe to Redis channel if first subscriber
    if (firstSubscriber) {
      void this.subscribeToChannel(channel, key).catch(error => {
        console.error(`[RedisListEventHub] Failed to subscribe to Redis channel ${channel}:`, error);
      });
    }

    return () => this.unsubscribe(tenantId, subscriber);
  }

  unsubscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): void {
    const key = this.key(tenantId);
    const channel = this.channelName(tenantId);

    const removedLast = this.subscribers.remove(key, subscriber);

    if (removedLast) {
      void this.unsubscribeFromChannel(channel).catch(error => {
        console.error(`[RedisListEventHub] Failed to unsubscribe from Redis channel ${channel}:`, error);
      });
    }
  }

  broadcast(tenantId: string, event: ConversationListEventType, data: unknown): void {
    const channel = this.channelName(tenantId);
    const message: DistributedEventMessage<ConversationListEventType> = {
      event,
      data,
      timestamp: Date.now(),
      instanceId: this.instanceId,
    };

    // Broadcast to local subscribers immediately
    const key = this.key(tenantId);
    this.subscribers.localBroadcast(key, event, data);

    // Publish to Redis pub/sub for other instances
    void this.publisher.publish(channel, JSON.stringify(message)).catch((error: unknown) => {
      console.error(`[RedisListEventHub] Error publishing to ${channel}:`, error);
    });
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    await this.activeChannels.shutdown(async (channelName, subscriptionPromise) => {
      try {
        await subscriptionPromise;
        await this.subscriber.unsubscribe(channelName);
      } catch (error) {
        console.error(`[RedisListEventHub] Error shutting down channel ${channelName}:`, error);
      }
    });

    this.subscribers.shutdown();
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      if (this.healthClient?.ping) {
        await this.healthClient.ping();
      }
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
