import { z } from "zod"

/**
 * Notification types following SOC2 audit requirements
 * Each notification type maps to specific areas of the admin app
 */
export const NotificationType = {
  // User/Admin related
  USER_INVITED: "user_invited",
  USER_ACTIVATED: "user_activated",
  USER_DEACTIVATED: "user_deactivated",
  USER_ROLE_CHANGED: "user_role_changed",

  // Security related
  SECURITY_ALERT: "security_alert",
  LOGIN_ALERT: "login_alert",
  PERMISSION_CHANGE: "permission_change",

  // System related
  SYSTEM_UPDATE: "system_update",
  MAINTENANCE_SCHEDULED: "maintenance_scheduled",

  // Content/Compliance related
  COMPLIANCE_ALERT: "compliance_alert",
  REPORT_READY: "report_ready",

  // General
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
} as const

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType]

export const notificationTypes = Object.values(NotificationType) as NotificationTypeValue[]

/**
 * Priority levels for notifications
 */
export const NotificationPriority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const

export type NotificationPriorityValue = (typeof NotificationPriority)[keyof typeof NotificationPriority]

/**
 * Notification status
 */
export const NotificationStatus = {
  UNREAD: "unread",
  READ: "read",
  DISMISSED: "dismissed",
  ARCHIVED: "archived",
} as const

export type NotificationStatusValue = (typeof NotificationStatus)[keyof typeof NotificationStatus]

/**
 * Context link configuration for deep linking
 * Maps notification types to specific app routes
 */
export interface NotificationContextLink {
  /** Route path within the app */
  path: string
  /** Query parameters to pass */
  params?: Record<string, string>
  /** Tab or section to highlight */
  section?: string
}

/**
 * Full notification interface
 */
export interface Notification {
  id: string
  /** Type of notification for categorization */
  type: NotificationTypeValue
  /** Priority level */
  priority: NotificationPriorityValue
  /** Current status */
  status: NotificationStatusValue
  /** Title displayed in the notification */
  title: string
  /** Detailed message */
  message: string
  /** Context link for navigation */
  contextLink?: NotificationContextLink
  /** Related entity ID (user, report, etc.) */
  relatedEntityId?: string
  /** Related entity type */
  relatedEntityType?: string
  /** Actor who triggered the notification (if applicable) */
  actorId?: string
  actorName?: string
  /** Timestamps */
  createdAt: string
  readAt?: string
  dismissedAt?: string
}

/**
 * Schema for creating notifications
 */
export const createNotificationSchema = z.object({
  type: z.enum(notificationTypes as [NotificationTypeValue, ...NotificationTypeValue[]]),
  priority: z.enum([
    NotificationPriority.LOW,
    NotificationPriority.MEDIUM,
    NotificationPriority.HIGH,
    NotificationPriority.CRITICAL,
  ]),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  contextLink: z
    .object({
      path: z.string(),
      params: z.record(z.string()).optional(),
      section: z.string().optional(),
    })
    .optional(),
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
})

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>

/**
 * Get route for notification type
 */
export function getNotificationRoute(notification: Notification): string {
  if (notification.contextLink) {
    let route = notification.contextLink.path
    if (notification.contextLink.params) {
      const searchParams = new URLSearchParams(notification.contextLink.params)
      route += `?${searchParams.toString()}`
    }
    return route
  }

  // Default routes based on notification type
  switch (notification.type) {
    case NotificationType.USER_INVITED:
    case NotificationType.USER_ACTIVATED:
    case NotificationType.USER_DEACTIVATED:
    case NotificationType.USER_ROLE_CHANGED:
      return "/administrators"

    case NotificationType.SECURITY_ALERT:
    case NotificationType.LOGIN_ALERT:
    case NotificationType.PERMISSION_CHANGE:
      return "/settings/security"

    case NotificationType.SYSTEM_UPDATE:
    case NotificationType.MAINTENANCE_SCHEDULED:
      return "/settings"

    case NotificationType.COMPLIANCE_ALERT:
    case NotificationType.REPORT_READY:
      return "/analytics"

    default:
      return "/notifications"
  }
}

/**
 * Get icon name for notification type (for UI rendering)
 */
export function getNotificationIconName(type: NotificationTypeValue): string {
  switch (type) {
    case NotificationType.USER_INVITED:
    case NotificationType.USER_ACTIVATED:
    case NotificationType.USER_DEACTIVATED:
    case NotificationType.USER_ROLE_CHANGED:
      return "user"

    case NotificationType.SECURITY_ALERT:
    case NotificationType.LOGIN_ALERT:
      return "shield"

    case NotificationType.PERMISSION_CHANGE:
      return "key"

    case NotificationType.SYSTEM_UPDATE:
      return "settings"

    case NotificationType.MAINTENANCE_SCHEDULED:
      return "clock"

    case NotificationType.COMPLIANCE_ALERT:
      return "alert-triangle"

    case NotificationType.REPORT_READY:
      return "file-text"

    case NotificationType.WARNING:
      return "alert-circle"

    case NotificationType.ERROR:
      return "x-circle"

    case NotificationType.INFO:
    default:
      return "info"
  }
}

/**
 * Get priority badge variant
 */
export function getPriorityVariant(
  priority: NotificationPriorityValue
): "default" | "secondary" | "outline" | "destructive" {
  switch (priority) {
    case NotificationPriority.CRITICAL:
      return "destructive"
    case NotificationPriority.HIGH:
      return "default"
    case NotificationPriority.MEDIUM:
      return "secondary"
    case NotificationPriority.LOW:
    default:
      return "outline"
  }
}
