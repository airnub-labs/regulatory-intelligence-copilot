import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GenericSupabaseEventHub,
  type SseSubscriber,
  type SupabaseClientLike,
} from '@reg-copilot/reg-intel-eventhub';
import type { ConversationEventType, ConversationListEventType } from './eventHub.js';

export interface SupabaseRealtimeEventHubConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  client?: SupabaseClient;
  prefix?: string;
  instanceId?: string;
}

/**
 * Supabase Realtime conversation event hub for distributed SSE
 *
 * Uses Supabase Realtime broadcast channels for cross-instance event distribution.
 */
export class SupabaseRealtimeConversationEventHub extends GenericSupabaseEventHub<ConversationEventType> {
  protected override readonly loggerName = 'SupabaseConversationEventHub';
  protected override readonly broadcastEventName = 'conversation';

  constructor(config: SupabaseRealtimeEventHubConfig) {
    // Use double assertion to bypass Supabase version compatibility issues
    // The client interface is compatible at runtime across versions
    super({
      client: config.client as unknown as SupabaseClientLike,
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      prefix: config.prefix,
      instanceId: config.instanceId,
    });
  }

  private channelName(tenantId: string, conversationId: string): string {
    return `${this.prefix}:conversation:${tenantId}:${conversationId}`;
  }

  private key(tenantId: string, conversationId: string): string {
    return `${tenantId}:${conversationId}`;
  }

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

  broadcast(tenantId: string, conversationId: string, event: ConversationEventType, data: unknown): void {
    this.broadcastInternal(
      this.key(tenantId, conversationId),
      this.channelName(tenantId, conversationId),
      event,
      data,
    );
  }
}

/**
 * Supabase Realtime conversation list event hub for distributed SSE
 *
 * Uses Supabase Realtime broadcast channels for cross-instance event distribution
 * of conversation list changes (create, update, delete, archive, etc.)
 */
export class SupabaseRealtimeConversationListEventHub extends GenericSupabaseEventHub<ConversationListEventType> {
  protected override readonly loggerName = 'SupabaseConversationListEventHub';
  protected override readonly broadcastEventName = 'conversation-list';

  constructor(config: SupabaseRealtimeEventHubConfig) {
    // Use double assertion to bypass Supabase version compatibility issues
    // The client interface is compatible at runtime across versions
    super({
      client: config.client as unknown as SupabaseClientLike,
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      prefix: config.prefix,
      instanceId: config.instanceId,
    });
  }

  private channelName(tenantId: string): string {
    return `${this.prefix}:conversation-list:${tenantId}`;
  }

  subscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): () => void {
    return this.subscribeInternal(
      tenantId,
      this.channelName(tenantId),
      subscriber,
    );
  }

  unsubscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>): void {
    this.unsubscribeInternal(
      tenantId,
      this.channelName(tenantId),
      subscriber,
    );
  }

  broadcast(tenantId: string, event: ConversationListEventType, data: unknown): void {
    this.broadcastInternal(
      tenantId,
      this.channelName(tenantId),
      event,
      data,
    );
  }
}
