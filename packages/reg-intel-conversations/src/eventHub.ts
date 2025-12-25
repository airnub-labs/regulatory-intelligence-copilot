export type ConversationEventType =
  | 'message'
  | 'metadata'
  | 'error'
  | 'done'
  | 'disclaimer'
  | 'warning'
  | 'message:pinned'
  | 'message:unpinned';

export type ConversationListEventType =
  | 'snapshot'
  | 'upsert'
  | 'archived'
  | 'unarchived'
  | 'deleted'
  | 'renamed'
  | 'sharing';

export interface SseSubscriber<TEvent> {
  send(event: TEvent, data: unknown): void;
  onClose?(): void;
}

export class ConversationEventHub {
  private subscribers = new Map<string, Set<SseSubscriber<ConversationEventType>>>();

  private key(tenantId: string, conversationId: string) {
    return `${tenantId}:${conversationId}`;
  }

  subscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ) {
    const key = this.key(tenantId, conversationId);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(subscriber);
    return () => this.unsubscribe(tenantId, conversationId, subscriber);
  }

  unsubscribe(
    tenantId: string,
    conversationId: string,
    subscriber: SseSubscriber<ConversationEventType>,
  ) {
    const key = this.key(tenantId, conversationId);
    const set = this.subscribers.get(key);
    if (!set) return;
    set.delete(subscriber);
    if (!set.size) {
      this.subscribers.delete(key);
    }
    subscriber.onClose?.();
  }

  broadcast(tenantId: string, conversationId: string, event: ConversationEventType, data: unknown) {
    const key = this.key(tenantId, conversationId);
    const set = this.subscribers.get(key);
    if (!set) return;
    for (const subscriber of set) {
      subscriber.send(event, data);
    }
  }
}

export class ConversationListEventHub {
  private subscribers = new Map<string, Set<SseSubscriber<ConversationListEventType>>>();

  private key(tenantId: string) {
    return tenantId;
  }

  subscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>) {
    const key = this.key(tenantId);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(subscriber);
    return () => this.unsubscribe(tenantId, subscriber);
  }

  unsubscribe(tenantId: string, subscriber: SseSubscriber<ConversationListEventType>) {
    const key = this.key(tenantId);
    const set = this.subscribers.get(key);
    if (!set) return;
    set.delete(subscriber);
    if (!set.size) {
      this.subscribers.delete(key);
    }
    subscriber.onClose?.();
  }

  broadcast(tenantId: string, event: ConversationListEventType, data: unknown) {
    const key = this.key(tenantId);
    const set = this.subscribers.get(key);
    if (!set) return;
    for (const subscriber of set) {
      subscriber.send(event, data);
    }
  }
}
