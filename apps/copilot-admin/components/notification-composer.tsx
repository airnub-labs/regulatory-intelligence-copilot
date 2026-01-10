"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  IconSend,
  IconUsers,
  IconBuilding,
  IconUserCheck,
  IconBroadcast,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  NotificationType,
  NotificationPriority,
  type NotificationTypeValue,
  type NotificationPriorityValue,
} from "@/lib/types/notification"
import { AdminRole, type AdminRoleType } from "@/lib/types/admin"

/**
 * Target types for notification delivery
 */
const TargetType = {
  ALL_USERS: "all_users",
  PLATFORM_ROLES: "platform_roles",
  TENANT_ROLES: "tenant_roles",
} as const

type TargetTypeValue = (typeof TargetType)[keyof typeof TargetType]

interface NotificationComposerProps {
  /** Optional trigger element (uses default button if not provided) */
  trigger?: React.ReactNode
  /** Callback when notification is sent successfully */
  onSuccess?: () => void
  /** Available tenants for tenant-specific targeting */
  tenants?: Array<{ id: string; name: string }>
}

interface FormState {
  type: NotificationTypeValue
  priority: NotificationPriorityValue
  title: string
  message: string
  actionUrl: string
  targetType: TargetTypeValue
  platformRoles: AdminRoleType[]
  tenantId: string
  tenantRoles: string[]
}

const initialFormState: FormState = {
  type: NotificationType.ANNOUNCEMENT,
  priority: NotificationPriority.MEDIUM,
  title: "",
  message: "",
  actionUrl: "",
  targetType: TargetType.ALL_USERS,
  platformRoles: [],
  tenantId: "",
  tenantRoles: [],
}

/**
 * Platform roles available for targeting
 */
const platformRoleOptions: Array<{ value: AdminRoleType; labelKey: string }> = [
  { value: AdminRole.SUPER_ADMIN, labelKey: "role_super_admin" },
  { value: AdminRole.PLATFORM_ENGINEER, labelKey: "role_platform_engineer" },
  { value: AdminRole.ACCOUNT_MANAGER, labelKey: "role_account_manager" },
  { value: AdminRole.COMPLIANCE_AUDITOR, labelKey: "role_compliance_auditor" },
  { value: AdminRole.SUPPORT_TIER_3, labelKey: "role_support_tier_3" },
  { value: AdminRole.SUPPORT_TIER_2, labelKey: "role_support_tier_2" },
  { value: AdminRole.SUPPORT_TIER_1, labelKey: "role_support_tier_1" },
  { value: AdminRole.VIEWER, labelKey: "role_viewer" },
]

/**
 * Tenant roles available for targeting
 */
const tenantRoleOptions = [
  { value: "owner", labelKey: "tenantRoleOwner" },
  { value: "admin", labelKey: "tenantRoleAdmin" },
  { value: "member", labelKey: "tenantRoleMember" },
  { value: "viewer", labelKey: "tenantRoleViewer" },
]

export function NotificationComposer({
  trigger,
  onSuccess,
  tenants = [],
}: NotificationComposerProps) {
  const t = useTranslations("notificationComposer")
  const tAdmin = useTranslations("adminView")
  const tCommon = useTranslations("common")

  const [open, setOpen] = React.useState(false)
  const [isSending, setIsSending] = React.useState(false)
  const [formState, setFormState] = React.useState<FormState>(initialFormState)

  const handleReset = () => {
    setFormState(initialFormState)
  }

  const handleClose = () => {
    setOpen(false)
    handleReset()
  }

  const handlePlatformRoleToggle = (role: AdminRoleType) => {
    setFormState((prev) => ({
      ...prev,
      platformRoles: prev.platformRoles.includes(role)
        ? prev.platformRoles.filter((r) => r !== role)
        : [...prev.platformRoles, role],
    }))
  }

  const handleTenantRoleToggle = (role: string) => {
    setFormState((prev) => ({
      ...prev,
      tenantRoles: prev.tenantRoles.includes(role)
        ? prev.tenantRoles.filter((r) => r !== role)
        : [...prev.tenantRoles, role],
    }))
  }

  const handleSend = async () => {
    // Validate required fields
    if (!formState.title.trim()) {
      toast.error(t("validation.titleRequired"))
      return
    }
    if (!formState.message.trim()) {
      toast.error(t("validation.messageRequired"))
      return
    }

    // Validate targeting
    if (formState.targetType === TargetType.PLATFORM_ROLES && formState.platformRoles.length === 0) {
      toast.error(t("validation.selectRoles"))
      return
    }
    if (formState.targetType === TargetType.TENANT_ROLES) {
      if (!formState.tenantId) {
        toast.error(t("validation.selectTenant"))
        return
      }
      if (formState.tenantRoles.length === 0) {
        toast.error(t("validation.selectTenantRoles"))
        return
      }
    }

    setIsSending(true)
    try {
      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formState.type,
          priority: formState.priority,
          title: formState.title,
          message: formState.message,
          actionUrl: formState.actionUrl || undefined,
          targetType: formState.targetType,
          platformRoles: formState.targetType === TargetType.PLATFORM_ROLES ? formState.platformRoles : undefined,
          tenantId: formState.targetType === TargetType.TENANT_ROLES ? formState.tenantId : undefined,
          tenantRoles: formState.targetType === TargetType.TENANT_ROLES ? formState.tenantRoles : undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(t("success"), {
          description: t("successDescription", { count: data.recipientCount }),
        })
        handleClose()
        onSuccess?.()
      } else {
        const error = await response.json()
        toast.error(t("error"), {
          description: error.message || error.error,
        })
      }
    } catch (error) {
      console.error("Failed to send notification:", error)
      toast.error(t("error"))
    } finally {
      setIsSending(false)
    }
  }

  const getTargetDescription = () => {
    switch (formState.targetType) {
      case TargetType.ALL_USERS:
        return t("targetAllUsersDescription")
      case TargetType.PLATFORM_ROLES:
        if (formState.platformRoles.length === 0) return t("targetPlatformRolesDescription")
        return t("targetPlatformRolesSelected", { count: formState.platformRoles.length })
      case TargetType.TENANT_ROLES:
        if (!formState.tenantId) return t("targetTenantRolesDescription")
        const tenant = tenants.find((t) => t.id === formState.tenantId)
        return t("targetTenantRolesSelected", {
          tenant: tenant?.name || formState.tenantId,
          count: formState.tenantRoles.length,
        })
      default:
        return ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <IconBroadcast className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("sendNotification")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconBroadcast className="h-5 w-5" aria-hidden="true" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Notification Content */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">{t("contentSection")}</h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">{t("notificationType")}</Label>
                <Select
                  value={formState.type}
                  onValueChange={(value: NotificationTypeValue) =>
                    setFormState((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NotificationType.ANNOUNCEMENT}>
                      {t("type.announcement")}
                    </SelectItem>
                    <SelectItem value={NotificationType.BROADCAST}>
                      {t("type.broadcast")}
                    </SelectItem>
                    <SelectItem value={NotificationType.SYSTEM_UPDATE}>
                      {t("type.systemUpdate")}
                    </SelectItem>
                    <SelectItem value={NotificationType.MAINTENANCE_SCHEDULED}>
                      {t("type.maintenance")}
                    </SelectItem>
                    <SelectItem value={NotificationType.INFO}>
                      {t("type.info")}
                    </SelectItem>
                    <SelectItem value={NotificationType.WARNING}>
                      {t("type.warning")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">{t("priorityLabel")}</Label>
                <Select
                  value={formState.priority}
                  onValueChange={(value: NotificationPriorityValue) =>
                    setFormState((prev) => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NotificationPriority.LOW}>
                      {t("priority.low")}
                    </SelectItem>
                    <SelectItem value={NotificationPriority.MEDIUM}>
                      {t("priority.medium")}
                    </SelectItem>
                    <SelectItem value={NotificationPriority.HIGH}>
                      {t("priority.high")}
                    </SelectItem>
                    <SelectItem value={NotificationPriority.CRITICAL}>
                      {t("priority.critical")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{t("notificationTitle")}</Label>
              <Input
                id="title"
                value={formState.title}
                onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t("titlePlaceholder")}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">{t("notificationMessage")}</Label>
              <Textarea
                id="message"
                value={formState.message}
                onChange={(e) => setFormState((prev) => ({ ...prev, message: e.target.value }))}
                placeholder={t("messagePlaceholder")}
                rows={4}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formState.message.length}/2000
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionUrl">{t("actionUrl")}</Label>
              <Input
                id="actionUrl"
                type="url"
                value={formState.actionUrl}
                onChange={(e) => setFormState((prev) => ({ ...prev, actionUrl: e.target.value }))}
                placeholder={t("actionUrlPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("actionUrlHint")}</p>
            </div>
          </div>

          <Separator />

          {/* Targeting */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">{t("targetSection")}</h4>

            <div className="space-y-2">
              <Label>{t("targetType")}</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant={formState.targetType === TargetType.ALL_USERS ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setFormState((prev) => ({ ...prev, targetType: TargetType.ALL_USERS }))}
                >
                  <IconUsers className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("targetAllUsers")}
                </Button>
                <Button
                  type="button"
                  variant={formState.targetType === TargetType.PLATFORM_ROLES ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setFormState((prev) => ({ ...prev, targetType: TargetType.PLATFORM_ROLES }))}
                >
                  <IconUserCheck className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("targetPlatformRoles")}
                </Button>
                <Button
                  type="button"
                  variant={formState.targetType === TargetType.TENANT_ROLES ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setFormState((prev) => ({ ...prev, targetType: TargetType.TENANT_ROLES }))}
                >
                  <IconBuilding className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("targetTenantRoles")}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{getTargetDescription()}</p>
            </div>

            {/* Platform Roles Selection */}
            {formState.targetType === TargetType.PLATFORM_ROLES && (
              <div className="space-y-2">
                <Label>{t("selectPlatformRoles")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {platformRoleOptions.map((role) => (
                    <div key={role.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`role-${role.value}`}
                        checked={formState.platformRoles.includes(role.value)}
                        onCheckedChange={() => handlePlatformRoleToggle(role.value)}
                      />
                      <Label
                        htmlFor={`role-${role.value}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {tAdmin(role.labelKey)}
                      </Label>
                    </div>
                  ))}
                </div>
                {formState.platformRoles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formState.platformRoles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-xs">
                        {tAdmin(`role_${role}`)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tenant Roles Selection */}
            {formState.targetType === TargetType.TENANT_ROLES && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant">{t("selectTenant")}</Label>
                  <Select
                    value={formState.tenantId}
                    onValueChange={(value) =>
                      setFormState((prev) => ({ ...prev, tenantId: value }))
                    }
                  >
                    <SelectTrigger id="tenant">
                      <SelectValue placeholder={t("selectTenantPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("selectTenantRoles")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {tenantRoleOptions.map((role) => (
                      <div key={role.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`tenant-role-${role.value}`}
                          checked={formState.tenantRoles.includes(role.value)}
                          onCheckedChange={() => handleTenantRoleToggle(role.value)}
                        />
                        <Label
                          htmlFor={`tenant-role-${role.value}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {t(role.labelKey)}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSending}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                {t("sending")}
              </>
            ) : (
              <>
                <IconSend className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("send")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
