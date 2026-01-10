import { ChannelLifecycleManager } from '../channelLifecycleManager.js';
import { LocalSubscriptionManager } from '../localSubscriptionManager.js';
import type { DistributedEventMessage, HealthCheckResult, SseSubscriber } from '../types.js';
import { generateInstanceId } from '../utils.js';
import type { RedisEventHubConfig, RedisKeyValueClient, RedisPubSubClient } from './types.js';

/**
 * Generic Redis-backed event hub for distributed SSE
 *
 * This abstract base class provides the core functionality for Redis pub/sub event hubs.
 * Extend this class and implement the `getChannelName` and `getSubscriptionKey` methods
 * to create domain-specific event hubs.
 *
 * ## Architecture
 *
 * ```
 * Instance 1: Client A subscribes → Local subscriber stored
 *             ↓
 *             Redis pub/sub channel: "{prefix}:{channel-name}"
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
 * 5. **Instance Filtering**: Self-published messages are filtered out using instanceId
 * 6. **Error Resilience**: Redis errors log warnings but don't crash the service
 *
 * ## Usage
 *
 * ```typescript
 * class MyEventHub extends GenericRedisEventHub<MyEventType> {
 *   protected getChannelName(tenantId: string, entityId: string): string {
 *     return `${this.prefix}:my-events:${tenantId}:${entityId}`;
 *   }
 *
 *   protected getSubscriptionKey(tenantId: string, entityId: string): string {
 *     return `${tenantId}:${entityId}`;
 *   }
 *
 *   subscribe(tenantId: string, entityId: string, subscriber: SseSubscriber<MyEventType>): () => void {
 *     return this.subscribeInternal(
 *       this.getSubscriptionKey(tenantId, entityId),
 *       this.getChannelName(tenantId, entityId),
 *       subscriber,
 *     );
 *   }
 *
 *   broadcast(tenantId: string, entityId: string, event: MyEventType, data: unknown): void {
 *     this.broadcastInternal(
 *       this.getSubscriptionKey(tenantId, entityId),
 *       this.getChannelName(tenantId, entityId),
 *       event,
 *       data,
 *     );
 *   }
 * }
 * ```
 */
export abstract class GenericRedisEventHub<TEvent extends string> {
  protected readonly publisher: RedisPubSubClient;
  protected readonly subscriber: RedisPubSubClient;
  protected readonly subscribers: LocalSubscriptionManager<TEvent>;
  protected readonly activeChannels: ChannelLifecycleManager<void>;
  protected readonly prefix: string;
  protected readonly instanceId: string;
  protected readonly healthClient?: RedisKeyValueClient;
  protected isShuttingDown = false;

  /**
   * Logger name for error messages
   * Override in subclasses for more specific logging
   */
  protected readonly loggerName: string = 'GenericRedisEventHub';

  constructor(config: RedisEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = config.instanceId ?? generateInstanceId();
    this.publisher = config.clients.pub;
    this.subscriber = config.clients.sub;
    this.healthClient = config.healthCheckClient;
    this.subscribers = new LocalSubscriptionManager<TEvent>();
    this.activeChannels = new ChannelLifecycleManager<void>();
  }

  /**
   * Subscribe to a Redis channel when first local subscriber connects
   */
  private async subscribeToChannel(channel: string, key: string): Promise<void> {
    await this.activeChannels.getOrCreate(channel, async () => {
      try {
        await this.subscriber.subscribe(channel, (message: string) => {
          if (this.isShuttingDown || !this.subscribers.hasSubscribers(key)) {
            return;
          }

          try {
            const parsed = JSON.parse(message) as DistributedEventMessage<TEvent>;

            // Filter out self-published messages
            if (parsed.instanceId === this.instanceId) {
              return;
            }

            this.subscribers.localBroadcast(key, parsed.event, parsed.data);
          } catch (error) {
            console.error(`[${this.loggerName}] Error parsing message from ${channel}:`, error);
          }
        });
      } catch (error) {
        console.error(`[${this.loggerName}] Error setting up subscription for ${channel}:`, error);
        throw error;
      }
    });
  }

  /**
   * Unsubscribe from a Redis channel when last local subscriber disconnects
   */
  private async unsubscribeFromChannel(channel: string): Promise<void> {
    try {
      const subscription = this.activeChannels.take(channel);

      if (subscription) {
        await subscription;
        await this.subscriber.unsubscribe(channel);
      }
    } catch (error) {
      console.error(`[${this.loggerName}] Error unsubscribing from ${channel}:`, error);
    }
  }

  /**
   * Internal subscribe implementation
   *
   * Subclasses should call this from their domain-specific subscribe method.
   */
  protected subscribeInternal(
    key: string,
    channel: string,
    subscriber: SseSubscriber<TEvent>,
  ): () => void {
    // Add to local subscribers
    const firstSubscriber = this.subscribers.add(key, subscriber);

    // Subscribe to Redis channel if first subscriber
    if (firstSubscriber) {
      void this.subscribeToChannel(channel, key).catch(error => {
        console.error(`[${this.loggerName}] Failed to subscribe to Redis channel ${channel}:`, error);
      });
    }

    // Return unsubscribe function
    return () => this.unsubscribeInternal(key, channel, subscriber);
  }

  /**
   * Internal unsubscribe implementation
   */
  protected unsubscribeInternal(
    key: string,
    channel: string,
    subscriber: SseSubscriber<TEvent>,
  ): void {
    const removedLast = this.subscribers.remove(key, subscriber);

    if (removedLast) {
      void this.unsubscribeFromChannel(channel).catch(error => {
        console.error(`[${this.loggerName}] Failed to unsubscribe from Redis channel ${channel}:`, error);
      });
    }
  }

  /**
   * Internal broadcast implementation
   *
   * Broadcasts to local subscribers immediately, then publishes to Redis
   * for other instances.
   */
  protected broadcastInternal(
    key: string,
    channel: string,
    event: TEvent,
    data: unknown,
  ): void {
    const message: DistributedEventMessage<TEvent> = {
      event,
      data,
      timestamp: Date.now(),
      instanceId: this.instanceId,
    };

    // Broadcast to local subscribers immediately
    this.subscribers.localBroadcast(key, event, data);

    // Publish to Redis pub/sub for other instances (fire and forget)
    void this.publisher.publish(channel, JSON.stringify(message)).catch((error: unknown) => {
      console.error(`[${this.loggerName}] Error publishing to ${channel}:`, error);
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
        console.error(`[${this.loggerName}] Error shutting down channel ${channelName}:`, error);
      }
    });

    this.subscribers.shutdown();
  }

  /**
   * Health check - verify Redis connectivity
   */
  async healthCheck(): Promise<HealthCheckResult> {
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

  /**
   * Get the current subscriber count for a specific key
   */
  getSubscriberCount(key: string): number {
    return this.subscribers.getSubscriberCount(key);
  }

  /**
   * Get the total subscriber count across all keys
   */
  getTotalSubscriberCount(): number {
    return this.subscribers.getTotalSubscriberCount();
  }

  /**
   * Get the number of active Redis channels
   */
  getActiveChannelCount(): number {
    return this.activeChannels.size;
  }
}
