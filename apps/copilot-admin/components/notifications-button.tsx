"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations, useFormatter, useNow } from "next-intl"
import {
  IconBell,
  IconBellOff,
  IconCheck,
  IconChecks,
  IconUsers,
  IconShield,
  IconKey,
  IconSettings,
  IconClock,
  IconAlertTriangle,
  IconFileText,
  IconAlertCircle,
  IconCircleX,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  type Notification,
  NotificationStatus,
  NotificationType,
  NotificationPriority,
  getNotificationRoute,
  getPriorityVariant,
} from "@/lib/types/notification"

// Mock notifications for demonstration
const mockNotifications: Notification[] = [
  {
    id: "1",
    type: NotificationType.USER_INVITED,
    priority: NotificationPriority.MEDIUM,
    status: NotificationStatus.UNREAD,
    title: "New user invited",
    message: "john.doe@example.com has been invited as a Viewer",
    actorName: "Admin User",
    relatedEntityType: "user",
    relatedEntityId: "user-123",
    contextLink: {
      path: "/administrators",
      params: { tab: "users" },
    },
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
  },
  {
    id: "2",
    type: NotificationType.SECURITY_ALERT,
    priority: NotificationPriority.HIGH,
    status: NotificationStatus.UNREAD,
    title: "New login from unknown device",
    message: "A new login was detected from Dublin, Ireland using Chrome on macOS",
    contextLink: {
      path: "/settings",
      section: "security",
    },
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
  },
  {
    id: "3",
    type: NotificationType.USER_ROLE_CHANGED,
    priority: NotificationPriority.MEDIUM,
    status: NotificationStatus.READ,
    title: "User role updated",
    message: "Jane Smith's role has been changed to Tenant Admin",
    actorName: "System Admin",
    relatedEntityType: "user",
    relatedEntityId: "user-456",
    contextLink: {
      path: "/administrators",
    },
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
  {
    id: "4",
    type: NotificationType.REPORT_READY,
    priority: NotificationPriority.LOW,
    status: NotificationStatus.READ,
    title: "Monthly report ready",
    message: "The December 2025 compliance report is now available for download",
    contextLink: {
      path: "/analytics",
      section: "reports",
    },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: "5",
    type: NotificationType.SYSTEM_UPDATE,
    priority: NotificationPriority.LOW,
    status: NotificationStatus.READ,
    title: "System maintenance completed",
    message: "The scheduled maintenance has been completed successfully",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
]

// Icon mapping for notification types
const notificationIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  user: IconUsers,
  shield: IconShield,
  key: IconKey,
  settings: IconSettings,
  clock: IconClock,
  "alert-triangle": IconAlertTriangle,
  "file-text": IconFileText,
  "alert-circle": IconAlertCircle,
  "x-circle": IconCircleX,
  info: IconInfoCircle,
}

function getIconForType(type: string): React.ComponentType<{ className?: string }> {
  switch (type) {
    case NotificationType.USER_INVITED:
    case NotificationType.USER_ACTIVATED:
    case NotificationType.USER_DEACTIVATED:
    case NotificationType.USER_ROLE_CHANGED:
      return notificationIcons.user
    case NotificationType.SECURITY_ALERT:
    case NotificationType.LOGIN_ALERT:
      return notificationIcons.shield
    case NotificationType.PERMISSION_CHANGE:
      return notificationIcons.key
    case NotificationType.SYSTEM_UPDATE:
      return notificationIcons.settings
    case NotificationType.MAINTENANCE_SCHEDULED:
      return notificationIcons.clock
    case NotificationType.COMPLIANCE_ALERT:
      return notificationIcons["alert-triangle"]
    case NotificationType.REPORT_READY:
      return notificationIcons["file-text"]
    case NotificationType.WARNING:
      return notificationIcons["alert-circle"]
    case NotificationType.ERROR:
      return notificationIcons["x-circle"]
    default:
      return notificationIcons.info
  }
}

export function NotificationsButton() {
  const t = useTranslations("notifications")
  const format = useFormatter()
  const now = useNow({ updateInterval: 60000 }) // Update every minute
  const router = useRouter()

  const [notifications, setNotifications] = React.useState<Notification[]>(mockNotifications)
  const [isOpen, setIsOpen] = React.useState(false)

  const unreadCount = React.useMemo(
    () => notifications.filter((n) => n.status === NotificationStatus.UNREAD).length,
    [notifications]
  )

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, status: NotificationStatus.READ, readAt: new Date().toISOString() }
          : n
      )
    )
  }

  const handleMarkAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.status === NotificationStatus.UNREAD
          ? { ...n, status: NotificationStatus.READ, readAt: new Date().toISOString() }
          : n
      )
    )
  }

  const handleDismiss = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, status: NotificationStatus.DISMISSED, dismissedAt: new Date().toISOString() }
          : n
      )
    )
  }

  const handleNotificationClick = (notification: Notification) => {
    handleMarkAsRead(notification.id)
    setIsOpen(false)
    const route = getNotificationRoute(notification)
    router.push(route)
  }

  const visibleNotifications = notifications.filter(
    (n) => n.status !== NotificationStatus.DISMISSED && n.status !== NotificationStatus.ARCHIVED
  )

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    return format.relativeTime(date, now)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("openNotifications")}
        >
          <IconBell className="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground"
              aria-label={t("unreadCount", { count: unreadCount })}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <IconBell className="h-5 w-5" aria-hidden="true" />
            <h3 className="font-semibold">{t("title")}</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={handleMarkAllAsRead}
              aria-label={t("markAllRead")}
            >
              <IconChecks className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("markAllRead")}
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <ScrollArea className="h-80">
          {visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <IconBellOff className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-2 text-sm text-muted-foreground">{t("noNotifications")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {visibleNotifications.map((notification) => {
                const NotificationIcon = getIconForType(notification.type)
                const isUnread = notification.status === NotificationStatus.UNREAD
                const priorityVariant = getPriorityVariant(notification.priority)

                return (
                  <div
                    key={notification.id}
                    className={`relative flex gap-3 p-4 transition-colors hover:bg-muted/50 ${
                      isUnread ? "bg-muted/30" : ""
                    }`}
                  >
                    {/* Unread indicator */}
                    {isUnread && (
                      <span className="absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary" />
                    )}

                    {/* Icon */}
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        notification.priority === NotificationPriority.CRITICAL
                          ? "bg-destructive/10 text-destructive"
                          : notification.priority === NotificationPriority.HIGH
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <NotificationIcon className="h-4 w-4" aria-hidden="true" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <button
                        className="w-full text-left"
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${isUnread ? "font-medium" : ""}`}>
                            {notification.title}
                          </p>
                          {notification.priority === NotificationPriority.CRITICAL ||
                           notification.priority === NotificationPriority.HIGH ? (
                            <Badge variant={priorityVariant} className="shrink-0 text-[10px]">
                              {t(`priority_${notification.priority}`)}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground/70">
                          {formatRelativeTime(notification.createdAt)}
                          {notification.actorName && ` • ${notification.actorName}`}
                        </p>
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 gap-1">
                      {isUnread && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMarkAsRead(notification.id)}
                          aria-label={t("markRead")}
                        >
                          <IconCheck className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => handleDismiss(notification.id)}
                        aria-label={t("dismiss")}
                      >
                        <IconX className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-center text-sm"
            asChild
          >
            <Link href="/notifications" onClick={() => setIsOpen(false)}>
              {t("viewAll")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
