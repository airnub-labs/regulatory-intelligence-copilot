/**
 * @reg-copilot/reg-intel-admin
 *
 * Admin event hubs for real-time notifications and session management.
 *
 * This package provides event hubs for:
 * - **Notifications**: Real-time delivery of user notifications
 * - **Sessions**: Real-time session updates and forced logout triggers
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createAdminEventHubs } from '@reg-copilot/reg-intel-admin';
 *
 * // Create event hubs (Redis or Supabase transport)
 * const { notificationHub, sessionHub } = createAdminEventHubs({
 *   supabase: {
 *     client: supabaseClient,
 *   },
 * });
 *
 * // Subscribe to notification events
 * const unsubscribe = notificationHub.subscribe(userId, (event, data) => {
 *   if (event === 'notification:new') {
 *     // Show notification to user
 *   }
 * });
 *
 * // Subscribe to session events (for forced logout)
 * sessionHub.subscribe(userId, (event, data) => {
 *   if (event === 'session:revoked' && data.sessionId === currentSessionId) {
 *     // Immediately log out and redirect
 *     signOut();
 *   }
 * });
 * ```
 *
 * ## Notification Events
 *
 * | Event | Description |
 * |-------|-------------|
 * | `notification:new` | New notification created |
 * | `notification:read` | Notification marked as read |
 * | `notification:dismissed` | Notification dismissed |
 * | `notification:archived` | Notification archived |
 * | `notification:deleted` | Notification permanently deleted |
 * | `snapshot` | Full list sent on initial connection |
 *
 * ## Session Events
 *
 * | Event | Description | Client Action |
 * |-------|-------------|---------------|
 * | `session:created` | New session started | Update session list |
 * | `session:revoked` | Session was revoked | **LOGOUT** if matches current session |
 * | `session:all_revoked` | Global logout | **LOGOUT** immediately |
 * | `session:expired` | Session naturally expired | Remove from list |
 * | `snapshot` | Full list sent on connection | Initialize session list |
 */

// Types
export * from './types.js';

// Notification Hub
export {
  RedisNotificationHub,
  SupabaseNotificationHub,
  type RedisNotificationHubConfig,
  type SupabaseNotificationHubConfig,
} from './notificationHub.js';

// Session Hub
export {
  RedisSessionHub,
  SupabaseSessionHub,
  type RedisSessionHubConfig,
  type SupabaseSessionHubConfig,
} from './sessionHub.js';

// Factory
export {
  createAdminEventHubs,
  createRedisAdminEventHubs,
  createSupabaseAdminEventHubs,
  type AdminEventHubsConfig,
  type AdminEventHubs,
} from './factory.js';
