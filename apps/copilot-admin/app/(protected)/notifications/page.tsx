"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useFormatter, useNow } from "next-intl"
import {
  IconBell,
  IconBellOff,
  IconCheck,
  IconChecks,
  IconTrash,
  IconFilter,
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
  IconArchive,
  IconRefresh,
  IconChevronRight,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type Notification,
  NotificationStatus,
  NotificationType,
  NotificationPriority,
  getNotificationRoute,
  getPriorityVariant,
  type NotificationStatusValue,
} from "@/lib/types/notification"

// Mock notifications for demonstration
const mockNotifications: Notification[] = [
  {
    id: "1",
    type: NotificationType.USER_INVITED,
    priority: NotificationPriority.MEDIUM,
    status: NotificationStatus.UNREAD,
    title: "New user invited",
    message: "john.doe@example.com has been invited as a Viewer. They will receive an email with instructions to complete their registration.",
    actorName: "Admin User",
    relatedEntityType: "user",
    relatedEntityId: "user-123",
    contextLink: {
      path: "/administrators",
      params: { tab: "users" },
    },
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    type: NotificationType.SECURITY_ALERT,
    priority: NotificationPriority.HIGH,
    status: NotificationStatus.UNREAD,
    title: "New login from unknown device",
    message: "A new login was detected from Dublin, Ireland using Chrome on macOS. If this was not you, please change your password immediately and review your recent activity.",
    contextLink: {
      path: "/settings",
      section: "security",
    },
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    type: NotificationType.USER_ROLE_CHANGED,
    priority: NotificationPriority.MEDIUM,
    status: NotificationStatus.READ,
    title: "User role updated",
    message: "Jane Smith's role has been changed from Support to Tenant Admin. They now have access to additional administrative features.",
    actorName: "System Admin",
    relatedEntityType: "user",
    relatedEntityId: "user-456",
    contextLink: {
      path: "/administrators",
    },
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "4",
    type: NotificationType.REPORT_READY,
    priority: NotificationPriority.LOW,
    status: NotificationStatus.READ,
    title: "Monthly compliance report ready",
    message: "The December 2025 compliance report has been generated and is now available for download in the Analytics section.",
    contextLink: {
      path: "/analytics",
      section: "reports",
    },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "5",
    type: NotificationType.SYSTEM_UPDATE,
    priority: NotificationPriority.LOW,
    status: NotificationStatus.READ,
    title: "System maintenance completed",
    message: "The scheduled maintenance has been completed successfully. All systems are now operating normally.",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "6",
    type: NotificationType.COMPLIANCE_ALERT,
    priority: NotificationPriority.CRITICAL,
    status: NotificationStatus.UNREAD,
    title: "Compliance deadline approaching",
    message: "The quarterly compliance review deadline is in 5 days. Please ensure all required documents are submitted before January 15, 2026.",
    contextLink: {
      path: "/analytics",
      section: "compliance",
    },
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "7",
    type: NotificationType.PERMISSION_CHANGE,
    priority: NotificationPriority.HIGH,
    status: NotificationStatus.READ,
    title: "API key permissions updated",
    message: "The permissions for API key ending in ...xyz789 have been modified. Review the changes to ensure they meet your security requirements.",
    actorName: "Security Team",
    contextLink: {
      path: "/settings",
      section: "api-keys",
    },
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "8",
    type: NotificationType.MAINTENANCE_SCHEDULED,
    priority: NotificationPriority.MEDIUM,
    status: NotificationStatus.ARCHIVED,
    title: "Scheduled maintenance",
    message: "System maintenance is scheduled for January 20, 2026 from 02:00 to 04:00 UTC. Some services may be temporarily unavailable.",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
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

export default function NotificationsPage() {
  const t = useTranslations("notifications")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const now = useNow({ updateInterval: 60000 }) // Update every minute
  const router = useRouter()

  const [notifications, setNotifications] = React.useState<Notification[]>(mockNotifications)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all")
  const [activeTab, setActiveTab] = React.useState("all")

  // Stats
  const stats = React.useMemo(() => ({
    total: notifications.filter((n) => n.status !== NotificationStatus.ARCHIVED).length,
    unread: notifications.filter((n) => n.status === NotificationStatus.UNREAD).length,
    archived: notifications.filter((n) => n.status === NotificationStatus.ARCHIVED).length,
  }), [notifications])

  // Filtered notifications based on tab and priority
  const filteredNotifications = React.useMemo(() => {
    return notifications.filter((n) => {
      // Tab filter
      if (activeTab === "unread" && n.status !== NotificationStatus.UNREAD) return false
      if (activeTab === "archived" && n.status !== NotificationStatus.ARCHIVED) return false
      if (activeTab === "all" && n.status === NotificationStatus.ARCHIVED) return false

      // Priority filter
      if (priorityFilter !== "all" && n.priority !== priorityFilter) return false

      return true
    })
  }, [notifications, activeTab, priorityFilter])

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    return format.relativeTime(date, now)
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return format.dateTime(date, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedIds(newSelected)
  }

  const handleMarkAsRead = (ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) =>
        ids.includes(n.id)
          ? { ...n, status: NotificationStatus.READ as NotificationStatusValue, readAt: new Date().toISOString() }
          : n
      )
    )
    setSelectedIds(new Set())
  }

  const handleMarkAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.status === NotificationStatus.UNREAD
          ? { ...n, status: NotificationStatus.READ as NotificationStatusValue, readAt: new Date().toISOString() }
          : n
      )
    )
  }

  const handleArchive = (ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) =>
        ids.includes(n.id)
          ? { ...n, status: NotificationStatus.ARCHIVED as NotificationStatusValue }
          : n
      )
    )
    setSelectedIds(new Set())
  }

  const handleDelete = (ids: string[]) => {
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)))
    setSelectedIds(new Set())
  }

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    if (notification.status === NotificationStatus.UNREAD) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, status: NotificationStatus.READ as NotificationStatusValue, readAt: new Date().toISOString() }
            : n
        )
      )
    }
    // Navigate to context
    const route = getNotificationRoute(notification)
    router.push(route)
  }

  const allSelected = filteredNotifications.length > 0 && selectedIds.size === filteredNotifications.length
  const someSelected = selectedIds.size > 0

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <IconBell className="h-6 w-6" aria-hidden="true" />
            {t("pageTitle")}
          </h1>
          <p className="text-muted-foreground">{t("pageDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={stats.unread === 0}
          >
            <IconChecks className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("markAllRead")}
          </Button>
          <Button variant="outline" size="sm">
            <IconRefresh className="mr-2 h-4 w-4" aria-hidden="true" />
            {tCommon("refresh")}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("totalNotifications")}</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("unreadNotifications")}</CardDescription>
            <CardTitle className="text-3xl text-primary">{stats.unread}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("archivedNotifications")}</CardDescription>
            <CardTitle className="text-3xl text-muted-foreground">{stats.archived}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="all">
              {t("tabAll")}
              {stats.total > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {stats.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread">
              {t("tabUnread")}
              {stats.unread > 0 && (
                <Badge variant="default" className="ml-2">
                  {stats.unread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="archived">{t("tabArchived")}</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <IconFilter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40" aria-label={t("filterByPriority")}>
                <SelectValue placeholder={t("allPriorities")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allPriorities")}</SelectItem>
                <SelectItem value={NotificationPriority.CRITICAL}>{t("priority_critical")}</SelectItem>
                <SelectItem value={NotificationPriority.HIGH}>{t("priority_high")}</SelectItem>
                <SelectItem value={NotificationPriority.MEDIUM}>{t("priority_medium")}</SelectItem>
                <SelectItem value={NotificationPriority.LOW}>{t("priority_low")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk Actions */}
        {someSelected && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm font-medium">
                {t("selectedCount", { count: selectedIds.size })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleMarkAsRead(Array.from(selectedIds))}
                >
                  <IconCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("markRead")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchive(Array.from(selectedIds))}
                >
                  <IconArchive className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("archive")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(Array.from(selectedIds))}
                >
                  <IconTrash className="mr-2 h-4 w-4" aria-hidden="true" />
                  {tCommon("delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notifications List */}
        <TabsContent value={activeTab} className="mt-0">
          <Card>
            <CardContent className="p-0">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <IconBellOff className="h-16 w-16 text-muted-foreground/30" aria-hidden="true" />
                  <p className="mt-4 text-lg font-medium">{t("noNotifications")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("noNotificationsDescription")}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Select All Header */}
                  <div className="flex items-center gap-4 bg-muted/50 px-4 py-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label={t("selectAll")}
                    />
                    <span className="text-sm text-muted-foreground">
                      {allSelected ? t("deselectAll") : t("selectAll")}
                    </span>
                  </div>

                  {/* Notification Items */}
                  {filteredNotifications.map((notification) => {
                    const NotificationIcon = getIconForType(notification.type)
                    const isUnread = notification.status === NotificationStatus.UNREAD
                    const priorityVariant = getPriorityVariant(notification.priority)
                    const isSelected = selectedIds.has(notification.id)

                    return (
                      <div
                        key={notification.id}
                        className={`flex gap-4 p-4 transition-colors hover:bg-muted/50 ${
                          isUnread ? "bg-muted/30" : ""
                        } ${isSelected ? "bg-primary/5" : ""}`}
                      >
                        {/* Checkbox */}
                        <div className="flex items-start pt-1">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectOne(notification.id, checked === true)}
                            aria-label={t("selectNotification")}
                          />
                        </div>

                        {/* Icon */}
                        <div
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                            notification.priority === NotificationPriority.CRITICAL
                              ? "bg-destructive/10 text-destructive"
                              : notification.priority === NotificationPriority.HIGH
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <NotificationIcon className="h-5 w-5" aria-hidden="true" />
                        </div>

                        {/* Content */}
                        <button
                          className="flex-1 text-left min-w-0"
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {isUnread && (
                                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                )}
                                <h3 className={`text-sm ${isUnread ? "font-semibold" : "font-medium"}`}>
                                  {notification.title}
                                </h3>
                                <Badge variant={priorityVariant} className="shrink-0 text-[10px]">
                                  {t(`priority_${notification.priority}`)}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {notification.message}
                              </p>
                              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground/70">
                                <span>{formatDateTime(notification.createdAt)}</span>
                                <span>({formatRelativeTime(notification.createdAt)})</span>
                                {notification.actorName && (
                                  <span>• {notification.actorName}</span>
                                )}
                              </div>
                            </div>
                            <IconChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
