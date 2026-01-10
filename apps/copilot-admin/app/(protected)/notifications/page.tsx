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
  IconLoader2,
  IconPlugConnectedX,
  IconSend,
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  NotificationStatus,
  NotificationPriority,
  getNotificationRoute,
  getPriorityVariant,
  type NotificationPriorityValue,
  type Notification,
} from "@/lib/types/notification"
import {
  useNotifications,
  type NotificationItem,
} from "@/components/notification-provider"
import { NotificationComposer } from "@/components/notification-composer"

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

export default function NotificationsPage() {
  const t = useTranslations("notifications")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const now = useNow({ updateInterval: 60000 }) // Update every minute
  const router = useRouter()

  // Use shared notification context (single SSE connection for all components)
  const {
    notifications: rawNotifications,
    unreadCount,
    isConnected,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    archive,
    deleteNotification,
    reconnect,
  } = useNotifications()

  // Map raw notifications to UI format
  const notifications = React.useMemo(
    () => rawNotifications.map(mapToUINotification),
    [rawNotifications]
  )

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all")
  const [activeTab, setActiveTab] = React.useState("all")
  const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set())

  // Stats
  const stats = React.useMemo(() => ({
    total: notifications.filter((n) => n.status !== NotificationStatus.ARCHIVED).length,
    unread: unreadCount,
    archived: notifications.filter((n) => n.status === NotificationStatus.ARCHIVED).length,
  }), [notifications, unreadCount])

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

  const handleMarkAsRead = async (ids: string[]) => {
    setProcessingIds(new Set(ids))
    try {
      await Promise.all(ids.map((id) => markAsRead(id)))
    } catch (error) {
      console.error("Error marking notifications as read:", error)
    } finally {
      setProcessingIds(new Set())
      setSelectedIds(new Set())
    }
  }

  const handleMarkAllAsRead = async () => {
    setProcessingIds(new Set(["all"]))
    try {
      await markAllAsRead()
    } catch (error) {
      console.error("Error marking all notifications as read:", error)
    } finally {
      setProcessingIds(new Set())
    }
  }

  const handleArchive = async (ids: string[]) => {
    setProcessingIds(new Set(ids))
    try {
      await Promise.all(ids.map((id) => archive(id)))
    } catch (error) {
      console.error("Error archiving notifications:", error)
    } finally {
      setProcessingIds(new Set())
      setSelectedIds(new Set())
    }
  }

  const handleDelete = async (ids: string[]) => {
    setProcessingIds(new Set(ids))
    try {
      await Promise.all(ids.map((id) => deleteNotification(id)))
    } catch (error) {
      console.error("Error deleting notifications:", error)
    } finally {
      setProcessingIds(new Set())
      setSelectedIds(new Set())
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if unread
    if (notification.status === NotificationStatus.UNREAD) {
      try {
        await markAsRead(notification.id)
      } catch (error) {
        console.error("Error marking notification as read:", error)
      }
    }
    // Navigate to context
    const route = getNotificationRoute(notification)
    router.push(route)
  }

  const allSelected = filteredNotifications.length > 0 && selectedIds.size === filteredNotifications.length
  const someSelected = selectedIds.size > 0
  const isMarkingAll = processingIds.has("all")

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <IconBell className="h-6 w-6" aria-hidden="true" />
              {t("pageTitle")}
            </h1>
            <p className="text-muted-foreground">{t("pageDescription")}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{tCommon("loading")}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error/disconnected state
  if (error && !isConnected) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <IconBell className="h-6 w-6" aria-hidden="true" />
              {t("pageTitle")}
            </h1>
            <p className="text-muted-foreground">{t("pageDescription")}</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <IconPlugConnectedX className="h-16 w-16 text-destructive/50" aria-hidden="true" />
            <p className="mt-4 text-lg font-medium">{t("connectionError")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("connectionErrorDescription")}</p>
            <Button variant="outline" className="mt-4" onClick={reconnect}>
              <IconRefresh className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("tryAgain")}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <IconBell className="h-6 w-6" aria-hidden="true" />
            {t("pageTitle")}
            {!isConnected && (
              <Badge variant="outline" className="ml-2 text-amber-600">
                {t("reconnecting")}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">{t("pageDescription")}</p>
        </div>
        <div className="flex gap-2">
          <NotificationComposer
            trigger={
              <Button size="sm">
                <IconSend className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("sendNotification")}
              </Button>
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={stats.unread === 0 || isMarkingAll}
          >
            {isMarkingAll ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <IconChecks className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t("markAllRead")}
          </Button>
          <Button variant="outline" size="sm" onClick={reconnect}>
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
                  disabled={processingIds.size > 0}
                >
                  <IconCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("markRead")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchive(Array.from(selectedIds))}
                  disabled={processingIds.size > 0}
                >
                  <IconArchive className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("archive")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(Array.from(selectedIds))}
                  disabled={processingIds.size > 0}
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
                    const isProcessing = processingIds.has(notification.id)

                    return (
                      <div
                        key={notification.id}
                        className={`flex gap-4 p-4 transition-colors hover:bg-muted/50 ${
                          isUnread ? "bg-muted/30" : ""
                        } ${isSelected ? "bg-primary/5" : ""} ${isProcessing ? "opacity-50" : ""}`}
                      >
                        {/* Checkbox */}
                        <div className="flex items-start pt-1">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectOne(notification.id, checked === true)}
                            aria-label={t("selectNotification")}
                            disabled={isProcessing}
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
                          {isProcessing ? (
                            <IconLoader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                          ) : (
                            <NotificationIcon className="h-5 w-5" aria-hidden="true" />
                          )}
                        </div>

                        {/* Content */}
                        <button
                          className="flex-1 text-left min-w-0"
                          onClick={() => handleNotificationClick(notification)}
                          disabled={isProcessing}
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
