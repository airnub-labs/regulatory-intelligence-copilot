import type { SseSubscriber } from './types.js';

/**
 * Manages local (in-memory) SSE subscribers for a single server instance
 *
 * This class handles the storage and broadcasting of events to locally connected
 * SSE clients. It does NOT handle cross-instance communication - that's the job
 * of the Redis or Supabase event hubs.
 *
 * ## Usage
 *
 * ```typescript
 * const manager = new LocalSubscriptionManager<MyEventType>();
 *
 * // Add a subscriber (returns true if this was the first subscriber for this key)
 * const isFirst = manager.add('tenant:conversation', subscriber);
 *
 * // Broadcast to all local subscribers for a key
 * manager.localBroadcast('tenant:conversation', 'message', { text: 'Hello' });
 *
 * // Remove a subscriber (returns true if this was the last subscriber for this key)
 * const wasLast = manager.remove('tenant:conversation', subscriber);
 *
 * // Shutdown all subscribers
 * manager.shutdown();
 * ```
 */
export class LocalSubscriptionManager<TEvent extends string> {
  private readonly subscribers = new Map<string, Set<SseSubscriber<TEvent>>>();

  /**
   * Add a subscriber for a given key
   *
   * @param key The subscription key (e.g., "tenantId:conversationId")
   * @param subscriber The SSE subscriber to add
   * @returns `true` if this was the first subscriber for this key (signals to subscribe to distributed channel)
   */
  add(key: string, subscriber: SseSubscriber<TEvent>): boolean {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    const set = this.subscribers.get(key)!;
    set.add(subscriber);
    return set.size === 1;
  }

  /**
   * Remove a subscriber for a given key
   *
   * Calls the subscriber's `onClose` callback if defined.
   *
   * @param key The subscription key
   * @param subscriber The SSE subscriber to remove
   * @returns `true` if this was the last subscriber for this key (signals to unsubscribe from distributed channel)
   */
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

  /**
   * Check if there are any subscribers for a given key
   */
  hasSubscribers(key: string): boolean {
    return this.subscribers.has(key);
  }

  /**
   * Get the count of subscribers for a given key
   */
  getSubscriberCount(key: string): number {
    return this.subscribers.get(key)?.size ?? 0;
  }

  /**
   * Get the total count of all subscribers across all keys
   */
  getTotalSubscriberCount(): number {
    let count = 0;
    for (const set of this.subscribers.values()) {
      count += set.size;
    }
    return count;
  }

  /**
   * Broadcast an event to all local subscribers for a key
   *
   * This only broadcasts to subscribers on THIS server instance.
   * Use the distributed event hub's `broadcast` method to send to all instances.
   *
   * @param key The subscription key
   * @param event The event type
   * @param data The event payload
   */
  localBroadcast(key: string, event: TEvent, data: unknown): void {
    const set = this.subscribers.get(key);
    if (!set) return;

    for (const subscriber of set) {
      subscriber.send(event, data);
    }
  }

  /**
   * Shutdown all subscribers
   *
   * Calls `onClose` on each subscriber and clears all subscriptions.
   */
  shutdown(): void {
    for (const [, subscribers] of this.subscribers) {
      for (const subscriber of subscribers) {
        subscriber.onClose?.();
      }
    }
    this.subscribers.clear();
  }
}
