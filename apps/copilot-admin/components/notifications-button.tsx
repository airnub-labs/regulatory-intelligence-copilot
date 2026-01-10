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
  IconLoader2,
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
  NotificationPriority,
  getNotificationRoute,
  getPriorityVariant,
  type NotificationPriorityValue,
} from "@/lib/types/notification"
import {
  useNotifications,
  type NotificationItem,
} from "@/components/notification-provider"

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
  const typeUpper = type.toUpperCase()
  if (typeUpper.includes("USER") || typeUpper.includes("ROLE")) {
    return notificationIcons.user
  }
  if (typeUpper.includes("SECURITY") || typeUpper.includes("LOGIN")) {
    return notificationIcons.shield
  }
  if (typeUpper.includes("PERMISSION")) {
    return notificationIcons.key
  }
  if (typeUpper.includes("SYSTEM")) {
    return notificationIcons.settings
  }
  if (typeUpper.includes("MAINTENANCE")) {
    return notificationIcons.clock
  }
  if (typeUpper.includes("COMPLIANCE")) {
    return notificationIcons["alert-triangle"]
  }
  if (typeUpper.includes("REPORT")) {
    return notificationIcons["file-text"]
  }
  if (typeUpper.includes("WARNING")) {
    return notificationIcons["alert-circle"]
  }
  if (typeUpper.includes("ERROR")) {
    return notificationIcons["x-circle"]
  }
  return notificationIcons.info
}

// Map NotificationItem from hook to UI Notification type
function mapToUINotification(item: NotificationItem): Notification {
  return {
    id: item.id,
    type: item.type as Notification["type"],
    priority: item.priority.toLowerCase() as NotificationPriorityValue,
    status: item.status.toLowerCase() as Notification["status"],
    title: item.title,
    message: item.message,
    contextLink: item.actionUrl ? { path: item.actionUrl } : undefined,
    createdAt: item.createdAt.toISOString(),
    readAt: item.readAt?.toISOString(),
  }
}

export function NotificationsButton() {
  const t = useTranslations("notifications")
  const format = useFormatter()
  const now = useNow({ updateInterval: 60000 }) // Update every minute
  const router = useRouter()

  // Use shared notification context (single SSE connection for all components)
  const {
    notifications: rawNotifications,
    unreadCount,
    isConnected,
    isLoading,
    markAsRead,
    markAllAsRead,
    dismiss,
  } = useNotifications()

  // Map raw notifications to UI format
  const notifications = React.useMemo(
    () => rawNotifications.map(mapToUINotification),
    [rawNotifications]
  )

  const [isOpen, setIsOpen] = React.useState(false)
  const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set())
  const [isMarkingAll, setIsMarkingAll] = React.useState(false)

  const handleMarkAsRead = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id))
    try {
      await markAsRead(id)
    } catch (error) {
      console.error("Error marking notification as read:", error)
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true)
    try {
      await markAllAsRead()
    } catch (error) {
      console.error("Error marking all notifications as read:", error)
    } finally {
      setIsMarkingAll(false)
    }
  }

  const handleDismiss = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id))
    try {
      await dismiss(id)
    } catch (error) {
      console.error("Error dismissing notification:", error)
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.status === NotificationStatus.UNREAD) {
      try {
        await markAsRead(notification.id)
      } catch (error) {
        console.error("Error marking notification as read:", error)
      }
    }
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
          {!isConnected && !isLoading && (
            <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
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
              disabled={isMarkingAll}
              aria-label={t("markAllRead")}
            >
              {isMarkingAll ? (
                <IconLoader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <IconChecks className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              {t("markAllRead")}
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-2 text-sm text-muted-foreground">{t("loading")}</p>
            </div>
          ) : visibleNotifications.length === 0 ? (
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
                const isProcessing = processingIds.has(notification.id)

                return (
                  <div
                    key={notification.id}
                    className={`relative flex gap-3 p-4 transition-colors hover:bg-muted/50 ${
                      isUnread ? "bg-muted/30" : ""
                    } ${isProcessing ? "opacity-50" : ""}`}
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
                      {isProcessing ? (
                        <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <NotificationIcon className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <button
                        className="w-full text-left"
                        onClick={() => handleNotificationClick(notification)}
                        disabled={isProcessing}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${isUnread ? "font-medium" : ""}`}>
                            {notification.title}
                          </p>
                          {(notification.priority === NotificationPriority.CRITICAL ||
                           notification.priority === NotificationPriority.HIGH) && (
                            <Badge variant={priorityVariant} className="shrink-0 text-[10px]">
                              {t(`priority_${notification.priority}`)}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground/70">
                          {formatRelativeTime(notification.createdAt)}
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
                          disabled={isProcessing}
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
                        disabled={isProcessing}
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
