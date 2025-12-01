export type ConversationEventType = 'message' | 'metadata' | 'error' | 'done' | 'disclaimer';

export interface SseSubscriber {
  send(event: ConversationEventType, data: unknown): void;
  onClose?(): void;
}

export class ConversationEventHub {
  private subscribers = new Map<string, Set<SseSubscriber>>();

  private key(tenantId: string, conversationId: string) {
    return `${tenantId}:${conversationId}`;
  }

  subscribe(tenantId: string, conversationId: string, subscriber: SseSubscriber) {
    const key = this.key(tenantId, conversationId);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(subscriber);
    return () => this.unsubscribe(tenantId, conversationId, subscriber);
  }

  unsubscribe(tenantId: string, conversationId: string, subscriber: SseSubscriber) {
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
