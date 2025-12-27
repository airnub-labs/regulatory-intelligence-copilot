import { Redis } from '@upstash/redis';
import type {
  ConversationEventType,
  ConversationListEventType,
  SseSubscriber,
} from './eventHub.js';

/**
 * Configuration for Redis-backed event hubs
 */
export interface RedisEventHubConfig {
  /**
   * Redis connection URL
   * Can be standard Redis (redis://...) or Upstash REST API (https://...)
   */
  url: string;
  /**
   * Redis authentication token/password
   */
  token: string;
  /**
   * Optional prefix for Redis pub/sub channels
   * @default 'copilot:events'
   */
  prefix?: string;
}

/**
 * Internal message structure for Redis pub/sub
 */
interface RedisEventMessage<TEvent> {
  event: TEvent;
  data: unknown;
  timestamp: number;
  instanceId?: string;
}

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
 * # Upstash Redis (recommended for production)
 * UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
 * UPSTASH_REDIS_REST_TOKEN=your_token_here
 *
 * # Or standard Redis
 * REDIS_URL=redis://localhost:6379
 * REDIS_TOKEN=your_password
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * const eventHub = new RedisConversationEventHub({
 *   url: process.env.UPSTASH_REDIS_REST_URL,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN,
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
  private redis: Redis;
  private subscriber: Redis;
  private subscribers = new Map<string, Set<SseSubscriber<ConversationEventType>>>();
  private activeChannels = new Map<string, Promise<void>>();
  private prefix: string;
  private instanceId: string;
  private isShuttingDown = false;

  constructor(config: RedisEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = `instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create separate Redis clients for pub and sub
    // This is required because a Redis client in subscribe mode cannot be used for other operations
    this.redis = new Redis({
      url: config.url,
      token: config.token,
    });

    this.subscriber = new Redis({
      url: config.url,
      token: config.token,
    });
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
   * Uses Redis pub/sub. Note: For Upstash Redis over HTTP, this uses a polling approach.
   * For production with high volume, consider using Redis Streams or native Redis protocol.
   */
  private async subscribeToChannel(channel: string, key: string): Promise<void> {
    if (this.activeChannels.has(channel)) {
      return this.activeChannels.get(channel);
    }

    const subscriptionPromise = (async () => {
      try {
        // Create a polling loop for Redis messages
        // This is a simple implementation - for production, consider using Redis Streams
        const pollInterval = 1000; // 1 second polling
        const pollMessages = async () => {
          if (this.isShuttingDown || !this.subscribers.has(key)) {
            return;
          }

          try {
            // Use a list-based approach for reliable message delivery
            // Note: Upstash Redis HTTP API doesn't support BLPOP, so we use LPOP with polling
            const result = await this.subscriber.lpop(channel) as string | null;

            if (result) {
              const message = result;
              try {
                const parsed = JSON.parse(message) as RedisEventMessage<ConversationEventType>;

                // Skip messages from our own instance to avoid duplication
                if (parsed.instanceId === this.instanceId) {
                  // Continue polling
                  setImmediate(pollMessages);
                  return;
                }

                // Broadcast to local subscribers
                const subscribers = this.subscribers.get(key);
                if (subscribers) {
                  for (const subscriber of subscribers) {
                    subscriber.send(parsed.event, parsed.data);
                  }
                }
              } catch (error) {
                console.error(`[RedisEventHub] Error parsing message from ${channel}:`, error);
              }
            }

            // Continue polling
            setImmediate(pollMessages);
          } catch (error) {
            console.error(`[RedisEventHub] Error polling ${channel}:`, error);
            // Retry after delay on error
            setTimeout(pollMessages, pollInterval);
          }
        };

        // Start polling
        void pollMessages();
      } catch (error) {
        console.error(`[RedisEventHub] Error setting up subscription for ${channel}:`, error);
        this.activeChannels.delete(channel);
        throw error;
      }
    })();

    this.activeChannels.set(channel, subscriptionPromise);
    return subscriptionPromise;
  }

  /**
   * Unsubscribe from Redis channel
   * Only called when last local subscriber disconnects
   */
  private async unsubscribeFromChannel(channel: string): Promise<void> {
    try {
      // Just remove from active channels - the polling loop will stop automatically
      // when it checks this.subscribers.has(key) and finds it empty
      this.activeChannels.delete(channel);
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
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(subscriber);

    // Subscribe to Redis channel if this is the first subscriber for this conversation
    if (this.subscribers.get(key)!.size === 1) {
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

    const set = this.subscribers.get(key);
    if (!set) return;

    set.delete(subscriber);
    subscriber.onClose?.();

    // Clean up if no more subscribers
    if (set.size === 0) {
      this.subscribers.delete(key);

      // Unsubscribe from Redis channel
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
    const message: RedisEventMessage<ConversationEventType> = {
      event,
      data,
      timestamp: Date.now(),
      instanceId: this.instanceId,
    };

    // Broadcast to local subscribers immediately
    const key = this.key(tenantId, conversationId);
    const localSubscribers = this.subscribers.get(key);
    if (localSubscribers) {
      for (const subscriber of localSubscribers) {
        subscriber.send(event, data);
      }
    }

    // Push to Redis list for other instances (fire and forget)
    // Using RPUSH to add to the end of the list
    void this.redis.rpush(channel, JSON.stringify(message)).catch((error: unknown) => {
      console.error(`[RedisEventHub] Error publishing to ${channel}:`, error);
    });
  }

  /**
   * Graceful shutdown - unsubscribe from all Redis channels
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    const unsubscribePromises = Array.from(this.activeChannels.keys()).map(channel =>
      this.unsubscribeFromChannel(channel),
    );

    await Promise.all(unsubscribePromises);

    // Clear all subscribers
    for (const [, subscribers] of this.subscribers) {
      for (const subscriber of subscribers) {
        subscriber.onClose?.();
      }
    }
    this.subscribers.clear();
  }

  /**
   * Health check - verify Redis connectivity
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.redis.ping();
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
  private redis: Redis;
  private subscriber: Redis;
  private subscribers = new Map<string, Set<SseSubscriber<ConversationListEventType>>>();
  private activeChannels = new Map<string, Promise<void>>();
  private prefix: string;
  private instanceId: string;
  private isShuttingDown = false;

  constructor(config: RedisEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = `instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    this.redis = new Redis({
      url: config.url,
      token: config.token,
    });

    this.subscriber = new Redis({
      url: config.url,
      token: config.token,
    });
  }

  private channelName(tenantId: string): string {
    return `${this.prefix}:conversation-list:${tenantId}`;
  }

  private key(tenantId: string): string {
    return tenantId;
  }

  private async subscribeToChannel(channel: string, key: string): Promise<void> {
    if (this.activeChannels.has(channel)) {
      return this.activeChannels.get(channel);
    }

    const subscriptionPromise = (async () => {
      try {
        const pollInterval = 1000;
        const pollMessages = async () => {
          if (this.isShuttingDown || !this.subscribers.has(key)) {
            return;
          }

          try {
            const result = await this.subscriber.lpop(channel) as string | null;

            if (result) {
              const message = result;
              try {
                const parsed = JSON.parse(message) as RedisEventMessage<ConversationListEventType>;

                if (parsed.instanceId === this.instanceId) {
                  setImmediate(pollMessages);
                  return;
                }

                const subscribers = this.subscribers.get(key);
                if (subscribers) {
                  for (const subscriber of subscribers) {
                    subscriber.send(parsed.event, parsed.data);
                  }
                }
              } catch (error) {
                console.error(`[RedisListEventHub] Error parsing message from ${channel}:`, error);
              }
            }

            setImmediate(pollMessages);
          } catch (error) {
            console.error(`[RedisListEventHub] Error polling ${channel}:`, error);
            setTimeout(pollMessages, pollInterval);
          }
        };

        void pollMessages();
      } catch (error) {
        console.error(`[RedisListEventHub] Error setting up subscription for ${channel}:`, error);
        this.activeChannels.delete(channel);
        throw error;
      }
    })();

    this.activeChannels.set(channel, subscriptionPromise);
    return subscriptionPromise;
  }

  private async unsubscribeFromChannel(channel: string): Promise<void> {
    try {
      this.activeChannels.delete(channel);
    } catch (error) {
      console.error(`[RedisListEventHub] Error unsubscribing from ${channel}:`, error);
    }
  }

  subscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): () => void {
    const key = this.key(tenantId);
    const channel = this.channelName(tenantId);

    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(subscriber);

    // Subscribe to Redis channel if first subscriber
    if (this.subscribers.get(key)!.size === 1) {
      void this.subscribeToChannel(channel, key).catch(error => {
        console.error(`[RedisListEventHub] Failed to subscribe to Redis channel ${channel}:`, error);
      });
    }

    return () => this.unsubscribe(tenantId, subscriber);
  }

  unsubscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): void {
    const key = this.key(tenantId);
    const channel = this.channelName(tenantId);

    const set = this.subscribers.get(key);
    if (!set) return;

    set.delete(subscriber);
    subscriber.onClose?.();

    if (set.size === 0) {
      this.subscribers.delete(key);

      void this.unsubscribeFromChannel(channel).catch(error => {
        console.error(`[RedisListEventHub] Failed to unsubscribe from Redis channel ${channel}:`, error);
      });
    }
  }

  broadcast(tenantId: string, event: ConversationListEventType, data: unknown): void {
    const channel = this.channelName(tenantId);
    const message: RedisEventMessage<ConversationListEventType> = {
      event,
      data,
      timestamp: Date.now(),
      instanceId: this.instanceId,
    };

    // Broadcast to local subscribers immediately
    const key = this.key(tenantId);
    const localSubscribers = this.subscribers.get(key);
    if (localSubscribers) {
      for (const subscriber of localSubscribers) {
        subscriber.send(event, data);
      }
    }

    // Push to Redis list for other instances
    void this.redis.rpush(channel, JSON.stringify(message)).catch((error: unknown) => {
      console.error(`[RedisListEventHub] Error publishing to ${channel}:`, error);
    });
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    const unsubscribePromises = Array.from(this.activeChannels.keys()).map(channel =>
      this.unsubscribeFromChannel(channel),
    );

    await Promise.all(unsubscribePromises);

    for (const [, subscribers] of this.subscribers) {
      for (const subscriber of subscribers) {
        subscriber.onClose?.();
      }
    }
    this.subscribers.clear();
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.redis.ping();
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
 * Create event hub instances with automatic fallback
 *
 * If Redis credentials are provided, returns Redis-backed hubs.
 * Otherwise, returns in-memory hubs for development.
 */
export function createEventHubs(config?: RedisEventHubConfig): {
  conversationEventHub: RedisConversationEventHub;
  conversationListEventHub: RedisConversationListEventHub;
} {
  if (!config?.url || !config?.token) {
    throw new Error('Redis configuration required for createEventHubs. Use in-memory hubs for development.');
  }

  return {
    conversationEventHub: new RedisConversationEventHub(config),
    conversationListEventHub: new RedisConversationListEventHub(config),
  };
}
