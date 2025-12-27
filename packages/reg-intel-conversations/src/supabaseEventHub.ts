import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { ConversationEventType, ConversationListEventType, SseSubscriber } from './eventHub.js';
import {
  ChannelLifecycleManager,
  LocalSubscriptionManager,
  generateInstanceId,
  type DistributedEventMessage,
} from './sharedEventHub.js';

export interface SupabaseRealtimeEventHubConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  client?: SupabaseClient;
  prefix?: string;
  instanceId?: string;
}

async function subscribeToChannel(channel: RealtimeChannel): Promise<RealtimeChannel> {
  return await new Promise<RealtimeChannel>((resolve, reject) => {
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR') {
        reject(new Error('Realtime channel error'));
      } else if (status === 'TIMED_OUT') {
        reject(new Error('Realtime channel subscribe timeout'));
      }
    });
  });
}

export class SupabaseRealtimeConversationEventHub {
  private client: SupabaseClient;
  private subscribers = new LocalSubscriptionManager<ConversationEventType>();
  private channels = new ChannelLifecycleManager<RealtimeChannel>();
  private prefix: string;
  private instanceId: string;
  private isShuttingDown = false;

  constructor(config: SupabaseRealtimeEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = config.instanceId ?? generateInstanceId();

    this.client =
      config.client ??
      createClient(config.supabaseUrl ?? '', config.supabaseKey ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
      });
  }

  private channelName(tenantId: string, conversationId: string): string {
    return `${this.prefix}:conversation:${tenantId}:${conversationId}`;
  }

  private key(tenantId: string, conversationId: string): string {
    return `${tenantId}:${conversationId}`;
  }

  private async ensureChannel(channel: string, key: string): Promise<RealtimeChannel> {
    return await this.channels.getOrCreate(channel, async () => {
      const realtimeChannel = this.client.channel(channel, { config: { broadcast: { self: false } } });

      realtimeChannel.on('broadcast', { event: 'conversation' }, payload => {
        if (this.isShuttingDown || !this.subscribers.hasSubscribers(key)) {
          return;
        }

        try {
          const parsed = payload.payload as DistributedEventMessage<ConversationEventType>;

          if (parsed.instanceId === this.instanceId) {
            return;
          }

          this.subscribers.localBroadcast(key, parsed.event, parsed.data);
        } catch (error) {
          console.error(`[SupabaseConversationEventHub] Error handling payload from ${channel}:`, error);
        }
      });

      return await subscribeToChannel(realtimeChannel);
    });
  }

  subscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ): () => void {
    const key = this.key(tenantId, conversationId);
    const channel = this.channelName(tenantId, conversationId);

    const firstSubscriber = this.subscribers.add(key, subscriber);

    if (firstSubscriber) {
      void this.ensureChannel(channel, key).catch(error => {
        console.error(`[SupabaseConversationEventHub] Failed to subscribe to ${channel}:`, error);
      });
    }

    return () => this.unsubscribe(tenantId, conversationId, subscriber);
  }

  unsubscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ): void {
    const key = this.key(tenantId, conversationId);
    const channel = this.channelName(tenantId, conversationId);

    const removedLast = this.subscribers.remove(key, subscriber);

    if (removedLast) {
      const channelPromise = this.channels.take(channel);

      if (channelPromise) {
        void channelPromise
          .then(realtimeChannel => realtimeChannel.unsubscribe())
          .catch(error => {
            console.error(`[SupabaseConversationEventHub] Failed to unsubscribe from ${channel}:`, error);
          });
      }
    }
  }

  broadcast(tenantId: string, conversationId: string, event: ConversationEventType, data: unknown): void {
    const channel = this.channelName(tenantId, conversationId);
    const message: DistributedEventMessage<ConversationEventType> = {
      event,
      data,
      timestamp: Date.now(),
      instanceId: this.instanceId,
    };

    const key = this.key(tenantId, conversationId);
    this.subscribers.localBroadcast(key, event, data);

    void this.ensureChannel(channel, key)
      .then(realtimeChannel =>
        realtimeChannel.send({
          type: 'broadcast',
          event: 'conversation',
          payload: message,
        }),
      )
      .catch(error => {
        console.error(`[SupabaseConversationEventHub] Error publishing to ${channel}:`, error);
      });
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    await this.channels.shutdown(async (channelName, channelPromise) => {
      try {
        const channel = await channelPromise;
        await channel.unsubscribe();
      } catch (error) {
        console.error(`[SupabaseConversationEventHub] Error shutting down channel ${channelName}:`, error);
      }
    });

    this.subscribers.shutdown();
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
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
}

export class SupabaseRealtimeConversationListEventHub {
  private client: SupabaseClient;
  private subscribers = new LocalSubscriptionManager<ConversationListEventType>();
  private channels = new ChannelLifecycleManager<RealtimeChannel>();
  private prefix: string;
  private instanceId: string;
  private isShuttingDown = false;

  constructor(config: SupabaseRealtimeEventHubConfig) {
    this.prefix = config.prefix ?? 'copilot:events';
    this.instanceId = config.instanceId ?? generateInstanceId();

    this.client =
      config.client ??
      createClient(config.supabaseUrl ?? '', config.supabaseKey ?? '', {
        auth: { autoRefreshToken: false, persistSession: false },
      });
  }

  private channelName(tenantId: string): string {
    return `${this.prefix}:conversation-list:${tenantId}`;
  }

  private async ensureChannel(channel: string, key: string): Promise<RealtimeChannel> {
    return await this.channels.getOrCreate(channel, async () => {
      const realtimeChannel = this.client.channel(channel, { config: { broadcast: { self: false } } });

      realtimeChannel.on('broadcast', { event: 'conversation-list' }, payload => {
        if (this.isShuttingDown || !this.subscribers.hasSubscribers(key)) {
          return;
        }

        try {
          const parsed = payload.payload as DistributedEventMessage<ConversationListEventType>;

          if (parsed.instanceId === this.instanceId) {
            return;
          }

          this.subscribers.localBroadcast(key, parsed.event, parsed.data);
        } catch (error) {
          console.error(`[SupabaseConversationListEventHub] Error handling payload from ${channel}:`, error);
        }
      });

      return await subscribeToChannel(realtimeChannel);
    });
  }

  subscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): () => void {
    const key = tenantId;
    const channel = this.channelName(tenantId);

    const firstSubscriber = this.subscribers.add(key, subscriber);

    if (firstSubscriber) {
      void this.ensureChannel(channel, key).catch(error => {
        console.error(`[SupabaseConversationListEventHub] Failed to subscribe to ${channel}:`, error);
      });
    }

    return () => this.unsubscribe(tenantId, subscriber);
  }

  unsubscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): void {
    const key = tenantId;
    const channel = this.channelName(tenantId);

    const removedLast = this.subscribers.remove(key, subscriber);

    if (removedLast) {
      const channelPromise = this.channels.take(channel);

      if (channelPromise) {
        void channelPromise
          .then(realtimeChannel => realtimeChannel.unsubscribe())
          .catch(error => {
            console.error(`[SupabaseConversationListEventHub] Failed to unsubscribe from ${channel}:`, error);
          });
      }
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

    this.subscribers.localBroadcast(tenantId, event, data);

    void this.ensureChannel(channel, tenantId)
      .then(realtimeChannel =>
        realtimeChannel.send({
          type: 'broadcast',
          event: 'conversation-list',
          payload: message,
        }),
      )
      .catch(error => {
        console.error(`[SupabaseConversationListEventHub] Error publishing to ${channel}:`, error);
      });
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    await this.channels.shutdown(async (channelName, channelPromise) => {
      try {
        const channel = await channelPromise;
        await channel.unsubscribe();
      } catch (error) {
        console.error(`[SupabaseConversationListEventHub] Error shutting down channel ${channelName}:`, error);
      }
    });

    this.subscribers.shutdown();
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    const channelName = `${this.prefix}:health:list:${this.instanceId}`;
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
}
