import type { SseSubscriber } from './eventHub.js';

export interface DistributedEventMessage<TEvent> {
  event: TEvent;
  data: unknown;
  timestamp: number;
  instanceId?: string;
}

export class LocalSubscriptionManager<TEvent> {
  private readonly subscribers = new Map<string, Set<SseSubscriber<TEvent>>>();

  add(key: string, subscriber: SseSubscriber<TEvent>): boolean {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    const set = this.subscribers.get(key)!;
    set.add(subscriber);
    return set.size === 1;
  }

  remove(key: string, subscriber: SseSubscriber<TEvent>): boolean {
    const set = this.subscribers.get(key);
    if (!set) return false;

    set.delete(subscriber);
    subscriber.onClose?.();

    if (set.size === 0) {
      this.subscribers.delete(key);
      return true;
    }

    return false;
  }

  hasSubscribers(key: string): boolean {
    return this.subscribers.has(key);
  }

  localBroadcast(key: string, event: TEvent, data: unknown): void {
    const set = this.subscribers.get(key);
    if (!set) return;

    for (const subscriber of set) {
      subscriber.send(event, data);
    }
  }

  shutdown(): void {
    for (const [, subscribers] of this.subscribers) {
      for (const subscriber of subscribers) {
        subscriber.onClose?.();
      }
    }
    this.subscribers.clear();
  }
}

export class ChannelLifecycleManager<TChannel> {
  private readonly channels = new Map<string, Promise<TChannel>>();

  getOrCreate(channelName: string, factory: () => Promise<TChannel>): Promise<TChannel> {
    const existing = this.channels.get(channelName);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        return await factory();
      } catch (error) {
        this.channels.delete(channelName);
        throw error;
      }
    })();

    this.channels.set(channelName, promise);
    return promise;
  }

  take(channelName: string): Promise<TChannel> | undefined {
    const channel = this.channels.get(channelName);
    this.channels.delete(channelName);
    return channel;
  }

  async shutdown(unsubscribe: (channelName: string, channel: Promise<TChannel>) => Promise<void>): Promise<void> {
    const unsubscribePromises = Array.from(this.channels.entries()).map(([name, channel]: [string, Promise<TChannel>]) => unsubscribe(name, channel));
    this.channels.clear();
    await Promise.all(unsubscribePromises);
  }
}

export function generateInstanceId(): string {
  return `instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
