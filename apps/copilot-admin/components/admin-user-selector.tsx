"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  IconUser,
  IconUsers,
  IconChevronDown,
  IconCheck,
  IconShieldCheck,
  IconServer,
  IconUserStar,
  IconFileCheck,
  IconEye,
  IconHeadset,
  IconHeadphones,
  IconTerminal2,
  IconX,
  IconAlertTriangle,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  useAdminView,
  getMockAdminUsers,
} from "@/lib/contexts/admin-view-context"
import {
  type ManagedUser,
  AdminRole,
} from "@/lib/types/admin"
import { Permission, hasPermission } from "@/lib/utils/permissions"

const roleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  [AdminRole.SUPER_ADMIN]: IconShieldCheck,
  [AdminRole.PLATFORM_ENGINEER]: IconServer,
  [AdminRole.ACCOUNT_MANAGER]: IconUserStar,
  [AdminRole.COMPLIANCE_AUDITOR]: IconFileCheck,
  [AdminRole.SUPPORT_TIER_3]: IconTerminal2,
  [AdminRole.SUPPORT_TIER_2]: IconHeadphones,
  [AdminRole.SUPPORT_TIER_1]: IconHeadset,
  [AdminRole.VIEWER]: IconEye,
}

const statusColors: Record<string, string> = {
  active: "bg-green-500",
  inactive: "bg-gray-400",
  pending: "bg-yellow-500",
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

interface AdminUserSelectorProps {
  className?: string
}

/**
 * Admin User Selector Component
 *
 * Allows admins to select a user to view/edit their settings.
 * Follows SOC2 security best practices:
 * - Role-based access control
 * - Audit logging for all access
 * - Clear visual indication of admin view mode
 * - No credential access or session transfer
 */
export function AdminUserSelector({ className }: AdminUserSelectorProps) {
  const t = useTranslations("adminView")
  const {
    viewingUser,
    isAdminView,
    currentAdmin,
    canEdit,
    startViewingUser,
    stopViewingUser,
  } = useAdminView()

  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [users, setUsers] = React.useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = React.useState(false)

  // Check if current admin can view other users
  const canViewOthers = currentAdmin
    ? hasPermission(currentAdmin, Permission.USERS_VIEW)
    : false

  // Load users when popover opens
  React.useEffect(() => {
    if (open && users.length === 0) {
      setIsLoading(true)
      // In production, fetch from API with proper tenant filtering
      const mockUsers = getMockAdminUsers()
      // Filter out current admin from the list
      const filteredUsers = mockUsers.filter((u) => u.id !== currentAdmin?.id)
      setUsers(filteredUsers)
      setIsLoading(false)
    }
  }, [open, users.length, currentAdmin?.id])

  // Filter users based on search
  const filteredUsers = React.useMemo(() => {
    if (!searchQuery) return users
    const query = searchQuery.toLowerCase()
    return users.filter(
      (user) =>
        user.displayName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  const handleSelectUser = async (user: ManagedUser) => {
    const success = await startViewingUser(user)
    if (success) {
      setOpen(false)
      setSearchQuery("")
    }
  }

  const handleStopViewing = async () => {
    await stopViewingUser()
    setSearchQuery("")
  }

  // Don't render if user can't view others
  if (!canViewOthers) {
    return null
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Admin View Banner - Shows when viewing another user */}
      {isAdminView && viewingUser && (
        <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <IconAlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">
            {t("viewingUserSettings")}
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={viewingUser.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(viewingUser.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{viewingUser.displayName}</span>
                <span className="text-sm">({viewingUser.email})</span>
                {!canEdit && (
                  <Badge variant="secondary" className="text-xs">
                    {t("readOnly")}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStopViewing}
                className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-900/30"
              >
                <IconX className="h-4 w-4 mr-1" />
                {t("stopViewing")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* User Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={t("selectUserToView")}
            className="w-full justify-between"
          >
            <div className="flex items-center gap-2">
              <IconUsers className="h-4 w-4 text-muted-foreground" />
              {isAdminView && viewingUser ? (
                <span>{viewingUser.displayName}</span>
              ) : (
                <span className="text-muted-foreground">{t("selectUserToView")}</span>
              )}
            </div>
            <IconChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("searchUsers")}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t("loading")}
                </div>
              ) : filteredUsers.length === 0 ? (
                <CommandEmpty>{t("noUsersFound")}</CommandEmpty>
              ) : (
                <CommandGroup heading={t("users")}>
                  {filteredUsers.map((user) => {
                    const RoleIcon = roleIcons[user.role] || IconUser
                    const isSelected = viewingUser?.id === user.id

                    return (
                      <CommandItem
                        key={user.id}
                        value={user.id}
                        onSelect={() => handleSelectUser(user)}
                        className="flex items-center gap-3 py-3"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatarUrl || undefined} />
                          <AvatarFallback>
                            {getInitials(user.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {user.displayName}
                            </span>
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                statusColors[user.status]
                              )}
                              aria-label={user.status}
                            />
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="truncate">{user.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {t(`role_${user.role}`)}
                          </Badge>
                        </div>
                        {isSelected && (
                          <IconCheck className="h-4 w-4 text-primary" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
            </CommandList>
            {isAdminView && (
              <>
                <CommandSeparator />
                <div className="p-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground"
                    onClick={handleStopViewing}
                  >
                    <IconUser className="h-4 w-4 mr-2" />
                    {t("viewOwnSettings")}
                  </Button>
                </div>
              </>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {/* Permission Info */}
      {!isAdminView && (
        <p className="text-xs text-muted-foreground">
          {t("selectUserHelp")}
        </p>
      )}
    </div>
  )
}

/**
 * Compact admin view indicator for headers/breadcrumbs
 */
export function AdminViewIndicator() {
  const t = useTranslations("adminView")
  const { viewingUser, isAdminView, canEdit, stopViewingUser } = useAdminView()

  if (!isAdminView || !viewingUser) {
    return null
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-950/30 rounded-md border border-amber-300 dark:border-amber-800">
      <IconEye className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
        {t("viewingAs", { name: viewingUser.displayName })}
      </span>
      {!canEdit && (
        <Badge variant="secondary" className="text-xs">
          {t("readOnly")}
        </Badge>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-amber-700 hover:text-amber-900 dark:text-amber-300"
        onClick={() => stopViewingUser()}
      >
        <IconX className="h-3 w-3" />
        <span className="sr-only">{t("stopViewing")}</span>
      </Button>
    </div>
  )
}
