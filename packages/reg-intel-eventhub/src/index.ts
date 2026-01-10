/**
 * @reg-copilot/reg-intel-eventhub
 *
 * Shared event hub infrastructure for distributed SSE pub/sub across services.
 *
 * This package provides the core building blocks for creating distributed event hubs:
 * - LocalSubscriptionManager: In-memory SSE subscriber management
 * - ChannelLifecycleManager: Lazy channel initialization and cleanup
 * - GenericRedisEventHub: Base class for Redis pub/sub event hubs
 * - GenericSupabaseEventHub: Base class for Supabase Realtime event hubs
 *
 * ## Usage
 *
 * Create a domain-specific event hub by extending one of the generic base classes:
 *
 * ```typescript
 * import { GenericRedisEventHub } from '@reg-copilot/reg-intel-eventhub/redis';
 *
 * type MyEventType = 'created' | 'updated' | 'deleted';
 *
 * class MyRedisEventHub extends GenericRedisEventHub<MyEventType> {
 *   subscribe(entityId: string, subscriber: SseSubscriber<MyEventType>): () => void {
 *     const key = entityId;
 *     const channel = `${this.prefix}:my-events:${entityId}`;
 *     return this.subscribeInternal(key, channel, subscriber);
 *   }
 *
 *   broadcast(entityId: string, event: MyEventType, data: unknown): void {
 *     const key = entityId;
 *     const channel = `${this.prefix}:my-events:${entityId}`;
 *     this.broadcastInternal(key, channel, event, data);
 *   }
 * }
 * ```
 *
 * ## Architecture
 *
 * Event hubs use a hybrid architecture:
 * - Local subscribers stored in memory (for SSE connections on this instance)
 * - Distributed pub/sub (Redis or Supabase) for cross-instance communication
 *
 * ## Subpath Exports
 *
 * - `@reg-copilot/reg-intel-eventhub` - Core types and utilities
 * - `@reg-copilot/reg-intel-eventhub/redis` - Redis-specific implementation
 * - `@reg-copilot/reg-intel-eventhub/supabase` - Supabase Realtime implementation
 */

// Core types
export * from './types.js';

// Utilities
export * from './utils.js';

// Local subscription management
export * from './localSubscriptionManager.js';

// Channel lifecycle management
export * from './channelLifecycleManager.js';

// Re-export submodules for convenience (users can also import from subpaths)
export * from './redis/index.js';
export * from './supabase/index.js';
