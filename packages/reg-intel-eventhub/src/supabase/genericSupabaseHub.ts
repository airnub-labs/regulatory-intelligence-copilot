import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { ChannelLifecycleManager } from '../channelLifecycleManager.js';
import { LocalSubscriptionManager } from '../localSubscriptionManager.js';
import type { DistributedEventMessage, HealthCheckResult, SseSubscriber } from '../types.js';
import { generateInstanceId } from '../utils.js';
import { CHANNEL_SUBSCRIBE_TIMEOUT_MS, type SupabaseClientLike, type SupabaseEventHubConfig } from './types.js';

/**
 * Helper to subscribe to a Supabase Realtime channel with timeout
 */
async function subscribeToChannel(channel: RealtimeChannel): Promise<RealtimeChannel> {
  return await new Promise<RealtimeChannel>((resolve, reject) => {
    let settled = false;

    // Set up a timeout to prevent hanging indefinitely
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Realtime channel subscribe timeout after ${CHANNEL_SUBSCRIBE_TIMEOUT_MS}ms`));
      }
    }, CHANNEL_SUBSCRIBE_TIMEOUT_MS);

    channel.subscribe((status: string) => {
      if (settled) {
        return;
      }

      if (status === 'SUBSCRIBED') {
        settled = true;
        clearTimeout(timeoutId);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR') {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('Realtime channel error'));
      } else if (status === 'TIMED_OUT') {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('Realtime channel subscribe timeout'));
      } else if (status === 'CLOSED') {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error('Realtime channel closed before subscription completed'));
      } else {
        // Handle unexpected status values to prevent silent hangs
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error(`Unexpected Realtime channel status: ${status}`));
      }
    });
  });
}

/**
 * Generic Supabase Realtime event hub for distributed SSE
 *
 * This abstract base class provides the core functionality for Supabase Realtime event hubs.
 * Extend this class and implement the required methods to create domain-specific event hubs.
 *
 * ## Architecture
 *
 * Uses Supabase Realtime broadcast channels for cross-instance event distribution:
 *
 * ```
 * Instance 1: Client A subscribes → Local subscriber stored
 *             ↓
 *             Supabase Realtime channel: "{prefix}:{channel-name}"
 *             ↓
 * Instance 2: broadcast() called → Sends via Supabase Realtime
 *             ↓
 * Instance 1: Receives broadcast → Sends to Client A's SSE connection
 * ```
 *
 * ## Key Features
 *
 * 1. **Lazy Channel Creation**: Channels are only created when first subscriber connects
 * 2. **Instance Filtering**: Self-published messages are filtered using instanceId
 * 3. **Timeout Handling**: Channel subscription has a configurable timeout
 * 4. **Graceful Cleanup**: Channels are unsubscribed when last subscriber disconnects
 *
 * ## Usage
 *
 * ```typescript
 * class MyEventHub extends GenericSupabaseEventHub<MyEventType> {
 *   protected readonly broadcastEventName = 'my-events';
 *
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
export abstract class GenericSupabaseEventHub<TEvent extends string> {
  protected readonly client: SupabaseClientLike;
  protected readonly subscribers: LocalSubscriptionManager<TEvent>;
  protected readonly channels: ChannelLifecycleManager<RealtimeChannel>;
  protected readonly prefix: string;
  protected readonly instanceId: string;
  protected isShuttingDown = false;

  /**
   * Logger name for error messages
   * Override in subclasses for more specific logging
   */
  protected readonly loggerName: string = 'GenericSupabaseEventHub';

  /**
   * Broadcast event name used in Supabase Realtime
   * Override in subclasses to use a different event name
   */
  protected abstract readonly broadcastEventName: string;

  constructor(config: SupabaseEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = config.instanceId ?? generateInstanceId();

    this.client =
      config.client ??
      createClient(config.supabaseUrl ?? '', config.supabaseKey ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
      });

    this.subscribers = new LocalSubscriptionManager<TEvent>();
    this.channels = new ChannelLifecycleManager<RealtimeChannel>();
  }

  /**
   * Ensure a Supabase Realtime channel exists and is subscribed
   */
  private async ensureChannel(channel: string, key: string): Promise<RealtimeChannel> {
    return await this.channels.getOrCreate(channel, async () => {
      const realtimeChannel = this.client.channel(channel, {
        config: { broadcast: { self: false } },
      });

      realtimeChannel.on(
        'broadcast',
        { event: this.broadcastEventName },
        (payload: { payload: unknown }) => {
          if (this.isShuttingDown || !this.subscribers.hasSubscribers(key)) {
            return;
          }

          try {
            const parsed = payload.payload as DistributedEventMessage<TEvent>;

            // Filter out self-published messages
            if (parsed.instanceId === this.instanceId) {
              return;
            }

            this.subscribers.localBroadcast(key, parsed.event, parsed.data);
          } catch (error) {
            console.error(
              `[${this.loggerName}] Error handling payload from channel ${channel}:`,
              error,
            );
          }
        },
      );

      return await subscribeToChannel(realtimeChannel);
    });
  }

  /**
   * Internal subscribe implementation
   */
  protected subscribeInternal(
    key: string,
    channel: string,
    subscriber: SseSubscriber<TEvent>,
  ): () => void {
    const firstSubscriber = this.subscribers.add(key, subscriber);

    if (firstSubscriber) {
      void this.ensureChannel(channel, key).catch(error => {
        console.error(
          `[${this.loggerName}] Failed to subscribe to channel ${channel}:`,
          error,
        );
      });
    }

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
      const channelPromise = this.channels.take(channel);

      if (channelPromise) {
        void channelPromise
          .then(realtimeChannel => realtimeChannel.unsubscribe())
          .catch(error => {
            console.error(
              `[${this.loggerName}] Failed to unsubscribe from channel ${channel}:`,
              error,
            );
          });
      }
    }
  }

  /**
   * Internal broadcast implementation
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

    // Send via Supabase Realtime for other instances
    void this.ensureChannel(channel, key)
      .then(realtimeChannel =>
        realtimeChannel.send({
          type: 'broadcast',
          event: this.broadcastEventName,
          payload: message,
        }),
      )
      .catch(error => {
        console.error(`[${this.loggerName}] Error publishing to channel ${channel}:`, error);
      });
  }

  /**
   * Graceful shutdown - unsubscribe from all channels
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    await this.channels.shutdown(async (channelName, channelPromise) => {
      try {
        const channel = await channelPromise;
        await channel.unsubscribe();
      } catch (error) {
        console.error(`[${this.loggerName}] Error shutting down channel ${channelName}:`, error);
      }
    });

    this.subscribers.shutdown();
  }

  /**
   * Health check - verify Supabase Realtime connectivity
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const channelName = `${this.prefix}:health:${this.instanceId}`;
    const channel = this.client.channel(channelName);

    try {
      const subscribedChannel = await subscribeToChannel(channel);
      const status = await subscribedChannel.unsubscribe();
      return status === 'ok'
        ? { healthy: true }
        : { healthy: false, error: `unsubscribe status: ${status}` };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : String(error) };
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
   * Get the number of active Supabase Realtime channels
   */
  getActiveChannelCount(): number {
    return this.channels.size;
  }
}
