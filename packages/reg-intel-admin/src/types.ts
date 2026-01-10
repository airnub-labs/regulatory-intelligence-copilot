/**
 * Admin event hub types
 */

// Re-export base types from eventhub
export type { SseSubscriber, HealthCheckResult } from '@reg-copilot/reg-intel-eventhub';

/**
 * Notification event types
 *
 * Events for real-time notification delivery to admin users.
 * Channel: `admin:notifications:{userId}`
 */
export type NotificationEventType =
  | 'notification:new'       // New notification created
  | 'notification:read'      // Notification marked as read
  | 'notification:dismissed' // Notification dismissed
  | 'notification:archived'  // Notification archived
  | 'notification:deleted'   // Notification permanently deleted
  | 'snapshot';              // Full list sent on initial connection

/**
 * Session event types
 *
 * Events for real-time session management and forced logout.
 * Channel: `admin:sessions:{userId}`
 *
 * IMPORTANT: `session:revoked` and `session:all_revoked` events
 * should trigger immediate logout on affected clients.
 */
export type SessionEventType =
  | 'session:created'        // New session started (login from new device)
  | 'session:revoked'        // Session was revoked → TRIGGERS LOGOUT on that session
  | 'session:all_revoked'    // Global logout → TRIGGERS LOGOUT on all sessions
  | 'session:expired'        // Session naturally expired
  | 'snapshot';              // Full list sent on initial connection

/**
 * Notification priority levels
 */
export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Notification status
 */
export type NotificationStatus = 'UNREAD' | 'READ' | 'DISMISSED' | 'ARCHIVED';

/**
 * Notification types (matches copilot-admin type definitions)
 */
export type NotificationType =
  | 'USER_INVITED'
  | 'USER_REMOVED'
  | 'ROLE_CHANGED'
  | 'SECURITY_ALERT'
  | 'LOGIN_ALERT'
  | 'PASSWORD_CHANGED'
  | 'PERMISSION_CHANGE'
  | 'COMPLIANCE_ALERT'
  | 'SYSTEM_UPDATE'
  | 'REPORT_READY'
  | 'WORKSPACE_CREATED'
  | 'WORKSPACE_DELETED';

/**
 * Payload for notification:new event
 */
export interface NotificationNewPayload {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Payload for notification:read event
 */
export interface NotificationReadPayload {
  id: string;
  readAt: string;
}

/**
 * Payload for notification:dismissed/archived/deleted events
 */
export interface NotificationIdPayload {
  id: string;
}

/**
 * Payload for snapshot event (notifications)
 */
export interface NotificationSnapshotPayload {
  notifications: NotificationNewPayload[];
  unreadCount: number;
}

/**
 * Session info for session events
 */
export interface SessionInfo {
  sessionId: string;
  userAgent?: string;
  ipAddress?: string;
  lastActiveAt?: string;
  createdAt: string;
}

/**
 * Payload for session:created event
 */
export interface SessionCreatedPayload {
  session: SessionInfo;
}

/**
 * Payload for session:revoked event
 *
 * IMPORTANT: Clients should check if the revoked sessionId matches their own
 * session and immediately log out if so.
 */
export interface SessionRevokedPayload {
  sessionId: string;
  revokedBy?: string;  // User ID of admin who revoked
  reason?: string;
}

/**
 * Payload for session:all_revoked event
 *
 * IMPORTANT: All clients for this user should immediately log out.
 */
export interface SessionAllRevokedPayload {
  revokedBy?: string;  // User ID of admin who revoked
  reason?: string;
}

/**
 * Payload for snapshot event (sessions)
 */
export interface SessionSnapshotPayload {
  activeSessions: SessionInfo[];
}
