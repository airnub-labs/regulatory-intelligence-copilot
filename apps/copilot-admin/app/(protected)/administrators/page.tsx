"use client"

import * as React from "react"
import { useTranslations, useFormatter } from "next-intl"
import { cn } from "@/lib/utils"
import {
  IconUsers,
  IconSearch,
  IconTrash,
  IconShieldCheck,
  IconEye,
  IconHeadset,
  IconHeadphones,
  IconDots,
  IconMail,
  IconUserPlus,
  IconDownload,
  IconChevronLeft,
  IconChevronRight,
  IconUser,
  IconCalendar,
  IconClock,
  IconHistory,
  IconServer,
  IconFileCheck,
  IconUserStar,
  IconTerminal2,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AdminRole,
  AdminStatus,
  adminRoles,
  type AdminUser,
  type AdminRoleType,
  type AdminStatusType,
  createAdminUserSchema,
} from "@/lib/types/admin"

// Extended admin user type with multi-tenant support
interface TenantAccess {
  tenantId: string
  tenantName: string
  tenantSlug: string
  accessLevel: "full" | "limited" | "readonly"
}

interface AdminUserWithTenants extends AdminUser {
  tenantAccess: TenantAccess[]
}

// Helper function to fetch admin users from the API
async function fetchAdminUsers(): Promise<AdminUserWithTenants[]> {
  try {
    const response = await fetch("/api/admin-users")
    if (!response.ok) {
      throw new Error("Failed to fetch admin users")
    }
    const data = await response.json()
    return data.users ?? []
  } catch (error) {
    console.error("Error fetching admin users:", error)
    return []
  }
}

// Access level badge colors
const accessLevelColors: Record<string, string> = {
  full: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  limited: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  readonly: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

// Mock activity log
interface ActivityLog {
  id: string
  action: string
  timestamp: string
  details: string
}

function getMockActivityLog(userId: string): ActivityLog[] {
  return [
    {
      id: "1",
      action: "login",
      timestamp: "2026-01-08T10:30:00Z",
      details: "Successful login from 192.168.1.1",
    },
    {
      id: "2",
      action: "user_update",
      timestamp: "2026-01-07T14:00:00Z",
      details: "Updated user settings",
    },
    {
      id: "3",
      action: "login",
      timestamp: "2026-01-06T09:15:00Z",
      details: "Successful login from 192.168.1.1",
    },
    {
      id: "4",
      action: "permission_change",
      timestamp: "2026-01-05T11:30:00Z",
      details: "Role changed from Viewer to Support",
    },
  ]
}

// Role icon mapping
const roleIcons: Record<AdminRoleType, React.ComponentType<{ className?: string }>> = {
  [AdminRole.SUPER_ADMIN]: IconShieldCheck,
  [AdminRole.PLATFORM_ENGINEER]: IconServer,
  [AdminRole.ACCOUNT_MANAGER]: IconUserStar,
  [AdminRole.COMPLIANCE_AUDITOR]: IconFileCheck,
  [AdminRole.SUPPORT_TIER_3]: IconTerminal2,
  [AdminRole.SUPPORT_TIER_2]: IconHeadphones,
  [AdminRole.SUPPORT_TIER_1]: IconHeadset,
  [AdminRole.VIEWER]: IconEye,
}

// Status badge variants
const statusVariants: Record<AdminStatusType, "default" | "secondary" | "outline" | "destructive"> = {
  [AdminStatus.ACTIVE]: "default",
  [AdminStatus.INACTIVE]: "secondary",
  [AdminStatus.PENDING]: "outline",
}

const ITEMS_PER_PAGE = 10

type DialogSection = "profile" | "activity"

export default function AdministratorsPage() {
  const t = useTranslations("administrators")
  const tCommon = useTranslations("common")
  const tValidation = useTranslations("validation")
  const format = useFormatter()

  const [users, setUsers] = React.useState<AdminUserWithTenants[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [roleFilter, setRoleFilter] = React.useState<string>("all")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [isLoading, setIsLoading] = React.useState(true)

  // Fetch admin users from Supabase on mount
  React.useEffect(() => {
    async function loadUsers() {
      setIsLoading(true)
      const fetchedUsers = await fetchAdminUsers()
      setUsers(fetchedUsers)
      setIsLoading(false)
    }
    loadUsers()
  }, [])

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1)

  // Dialog state for admin details
  const [selectedUser, setSelectedUser] = React.useState<AdminUserWithTenants | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState<DialogSection>("profile")
  const [activityLog, setActivityLog] = React.useState<ActivityLog[]>([])

  // Dialog states for add/delete
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)

  // Form state for add/edit
  const [formData, setFormData] = React.useState({
    email: "",
    displayName: "",
    role: AdminRole.VIEWER as AdminRoleType,
  })
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = React.useState(false)

  // Stats
  const stats = React.useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === AdminStatus.ACTIVE).length,
    pending: users.filter((u) => u.status === AdminStatus.PENDING).length,
    multiTenantAdmins: users.filter((u) => u.tenantAccess.length > 1).length,
    byRole: {
      [AdminRole.SUPER_ADMIN]: users.filter((u) => u.role === AdminRole.SUPER_ADMIN).length,
      [AdminRole.PLATFORM_ENGINEER]: users.filter((u) => u.role === AdminRole.PLATFORM_ENGINEER).length,
      [AdminRole.ACCOUNT_MANAGER]: users.filter((u) => u.role === AdminRole.ACCOUNT_MANAGER).length,
      [AdminRole.COMPLIANCE_AUDITOR]: users.filter((u) => u.role === AdminRole.COMPLIANCE_AUDITOR).length,
      [AdminRole.SUPPORT_TIER_3]: users.filter((u) => u.role === AdminRole.SUPPORT_TIER_3).length,
      [AdminRole.SUPPORT_TIER_2]: users.filter((u) => u.role === AdminRole.SUPPORT_TIER_2).length,
      [AdminRole.SUPPORT_TIER_1]: users.filter((u) => u.role === AdminRole.SUPPORT_TIER_1).length,
      [AdminRole.VIEWER]: users.filter((u) => u.role === AdminRole.VIEWER).length,
    },
  }), [users])

  // Filter users based on search and filters
  const filteredUsers = React.useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        searchQuery === "" ||
        user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesRole = roleFilter === "all" || user.role === roleFilter
      const matchesStatus = statusFilter === "all" || user.status === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchQuery, roleFilter, statusFilter])

  // Paginated users
  const paginatedUsers = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredUsers, currentPage])

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, roleFilter, statusFilter])

  // Load activity log when user selected
  React.useEffect(() => {
    if (selectedUser) {
      setActivityLog(getMockActivityLog(selectedUser.id))
    } else {
      setActivityLog([])
    }
  }, [selectedUser])

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const handleViewUser = (user: AdminUserWithTenants) => {
    setSelectedUser(user)
    setFormData({
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    })
    setActiveSection("profile")
    setIsDialogOpen(true)
  }

  const handleAddUser = () => {
    setFormData({
      email: "",
      displayName: "",
      role: AdminRole.VIEWER,
    })
    setFormErrors({})
    setIsAddDialogOpen(true)
  }

  const handleDeleteUser = (user: AdminUserWithTenants) => {
    setSelectedUser(user)
    setIsDeleteDialogOpen(true)
  }

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement> | { name: string; value: string }
  ) => {
    const { name, value } = "target" in e ? e.target : e
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: "" }))
    }
  }

  const handleSaveUser = async (isEdit: boolean) => {
    const result = createAdminUserSchema.safeParse(formData)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] =
            err.code === "too_small" ? tValidation("required") : tValidation("email")
        }
      })
      setFormErrors(fieldErrors)
      return
    }

    setIsSaving(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      if (isEdit && selectedUser) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === selectedUser.id
              ? { ...u, ...formData, updatedAt: new Date().toISOString() }
              : u
          )
        )
        setSelectedUser((prev) =>
          prev ? { ...prev, ...formData, updatedAt: new Date().toISOString() } : null
        )
      } else {
        const newUser: AdminUserWithTenants = {
          id: crypto.randomUUID(),
          ...formData,
          status: AdminStatus.PENDING,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tenantAccess: [],
        }
        setUsers((prev) => [...prev, newUser])
        setIsAddDialogOpen(false)
      }
    } catch {
      setFormErrors({ submit: tCommon("error") })
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!selectedUser) return

    setIsSaving(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id))
      setIsDeleteDialogOpen(false)
      setIsDialogOpen(false)
      setSelectedUser(null)
    } catch {
      // Handle error
    } finally {
      setIsSaving(false)
    }
  }

  const UserFormContent = ({ isEdit }: { isEdit: boolean }) => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("userEmail")}</Label>
        <div className="relative">
          <IconMail
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleFormChange}
            disabled={isEdit}
            className="pl-10"
            aria-invalid={!!formErrors.email}
            aria-describedby={formErrors.email ? "email-error" : undefined}
          />
        </div>
        {formErrors.email && (
          <p id="email-error" className="text-sm text-destructive" role="alert">
            {formErrors.email}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">{t("userName")}</Label>
        <Input
          id="displayName"
          name="displayName"
          value={formData.displayName}
          onChange={handleFormChange}
          aria-invalid={!!formErrors.displayName}
          aria-describedby={formErrors.displayName ? "displayName-error" : undefined}
        />
        {formErrors.displayName && (
          <p id="displayName-error" className="text-sm text-destructive" role="alert">
            {formErrors.displayName}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">{t("userRole")}</Label>
        <Select
          value={formData.role}
          onValueChange={(value) => handleFormChange({ name: "role", value })}
        >
          <SelectTrigger id="role">
            <SelectValue placeholder={t("selectRole")} />
          </SelectTrigger>
          <SelectContent>
            {adminRoles.map((role) => {
              const RoleIcon = roleIcons[role]
              return (
                <SelectItem key={role} value={role}>
                  <span className="flex items-center gap-2">
                    <RoleIcon className="h-4 w-4" aria-hidden="true" />
                    {t(`role_${role}`)}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {t(`roleDescription_${formData.role}`)}
        </p>
      </div>

      {formErrors.submit && (
        <p className="text-sm text-destructive" role="alert">
          {formErrors.submit}
        </p>
      )}
    </div>
  )

  // Navigation items for the detail dialog sidebar
  const navItems = [
    { id: "profile" as const, name: t("sheet.profile"), icon: IconUser },
    { id: "activity" as const, name: t("sheet.activity"), icon: IconHistory },
  ]

  const getSectionTitle = (section: DialogSection): string => {
    return navItems.find((item) => item.id === section)?.name ?? ""
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <IconUsers className="h-6 w-6" aria-hidden="true" />
            {t("pageTitle")}
          </h1>
          <p className="text-muted-foreground">{t("pageDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <IconDownload className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("export")}
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddUser}>
                <IconUserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("inviteAdmin")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("addUserTitle")}</DialogTitle>
                <DialogDescription>{t("addUserDescription")}</DialogDescription>
              </DialogHeader>
              <UserFormContent isEdit={false} />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  disabled={isSaving}
                >
                  {tCommon("cancel")}
                </Button>
                <Button onClick={() => handleSaveUser(false)} disabled={isSaving}>
                  {isSaving ? tCommon("loading") : t("sendInvitation")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("totalAdmins")}</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("activeAdmins")}</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("pendingInvitations")}</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{stats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("multiTenantAdmins")}</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.multiTenantAdmins}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">{t("tabUsers")}</TabsTrigger>
          <TabsTrigger value="roles">{t("tabRoles")}</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-1">
                  <IconSearch
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    placeholder={t("searchUsers")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    aria-label={t("searchUsers")}
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-40" aria-label={t("filterByRole")}>
                    <SelectValue placeholder={t("allRoles")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allRoles")}</SelectItem>
                    {adminRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`role_${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40" aria-label={t("filterByStatus")}>
                    <SelectValue placeholder={t("allStatuses")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allStatuses")}</SelectItem>
                    <SelectItem value={AdminStatus.ACTIVE}>{t("statusActive")}</SelectItem>
                    <SelectItem value={AdminStatus.INACTIVE}>{t("statusInactive")}</SelectItem>
                    <SelectItem value={AdminStatus.PENDING}>{t("statusPending")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[280px]">{t("userColumn")}</TableHead>
                    <TableHead>{t("roleColumn")}</TableHead>
                    <TableHead>{t("tenantAccessColumn")}</TableHead>
                    <TableHead>{t("statusColumn")}</TableHead>
                    <TableHead>{t("lastLoginColumn")}</TableHead>
                    <TableHead className="w-[70px]">
                      <span className="sr-only">{t("actionsColumn")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-48" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : paginatedUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        <p className="text-muted-foreground">{tCommon("noResults")}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedUsers.map((user) => {
                      const RoleIcon = roleIcons[user.role]
                      return (
                        <TableRow
                          key={user.id}
                          className="cursor-pointer"
                          onClick={() => handleViewUser(user)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{user.displayName}</p>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <RoleIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                              <span>{t(`role_${user.role}`)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <div className="flex items-center gap-2">
                                {user.tenantAccess.length === 0 ? (
                                  <span className="text-sm text-muted-foreground">—</span>
                                ) : user.tenantAccess.length === 1 ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="outline"
                                        className={cn("text-xs", accessLevelColors[user.tenantAccess[0].accessLevel])}
                                      >
                                        1 {t("tenant")}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{user.tenantAccess[0].tenantName}</p>
                                      <p className="text-xs text-muted-foreground capitalize">
                                        {t(`accessLevel_${user.tenantAccess[0].accessLevel}`)}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="text-xs">
                                        {user.tenantAccess.length} {t("tenants")}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="space-y-1">
                                        {user.tenantAccess.map((ta) => (
                                          <p key={ta.tenantId}>
                                            {ta.tenantName}: <span className="font-medium capitalize">{t(`accessLevel_${ta.accessLevel}`)}</span>
                                          </p>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariants[user.status]}>
                              {t(`status${user.status.charAt(0).toUpperCase() + user.status.slice(1)}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.lastLogin
                              ? format.dateTime(new Date(user.lastLogin), {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("userActions")}>
                                  <IconDots className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewUser(user); }}>
                                  <IconUser className="mr-2 h-4 w-4" aria-hidden="true" />
                                  {t("viewDetails")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); handleDeleteUser(user); }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <IconTrash className="mr-2 h-4 w-4" aria-hidden="true" />
                                  {tCommon("delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {t("pagination.showing", {
                    from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                    to: Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length),
                    total: filteredUsers.length,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <IconChevronLeft className="h-4 w-4" />
                    <span className="sr-only">{t("pagination.previous")}</span>
                  </Button>
                  <span className="text-sm">
                    {t("pagination.page", { current: currentPage, total: totalPages })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <IconChevronRight className="h-4 w-4" />
                    <span className="sr-only">{t("pagination.next")}</span>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {adminRoles.map((role) => {
              const RoleIcon = roleIcons[role]
              const count = stats.byRole[role]
              return (
                <Card key={role}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <RoleIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{t(`role_${role}`)}</CardTitle>
                          <CardDescription>{count} {count === 1 ? t("user") : t("users")}</CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{t(`roleDescription_${role}`)}</p>
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">{t("permissions")}</h4>
                      <div className="flex flex-wrap gap-1">
                        {role === AdminRole.SUPER_ADMIN && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permFullAccess")}</Badge>
                          </>
                        )}
                        {role === AdminRole.PLATFORM_ENGINEER && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permManageInfra")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewInfra")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewAudit")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewReports")}</Badge>
                          </>
                        )}
                        {role === AdminRole.ACCOUNT_MANAGER && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permManageUsers")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewTenants")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewReports")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewAudit")}</Badge>
                          </>
                        )}
                        {role === AdminRole.COMPLIANCE_AUDITOR && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permViewAudit")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permExportAudit")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewReports")}</Badge>
                          </>
                        )}
                        {role === AdminRole.SUPPORT_TIER_3 && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permViewLogs")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permDebugQueries")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permProdAccess")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permCodeAccess")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permCrossTenant")}</Badge>
                          </>
                        )}
                        {role === AdminRole.SUPPORT_TIER_2 && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permViewUsers")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permCrossTenant")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewAsUser")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permEditPrefs")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permEscalateEng")}</Badge>
                          </>
                        )}
                        {role === AdminRole.SUPPORT_TIER_1 && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permViewUsers")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permAssignedTenants")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewConversations")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permEscalateT2")}</Badge>
                          </>
                        )}
                        {role === AdminRole.VIEWER && (
                          <>
                            <Badge variant="outline" className="text-xs">{t("permViewReports")}</Badge>
                            <Badge variant="outline" className="text-xs">{t("permViewDashboard")}</Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Admin Details Dialog with Sidebar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[700px] lg:max-w-[800px]">
          <DialogTitle className="sr-only">
            {selectedUser ? t("dialog.title", { name: selectedUser.displayName }) : t("dialog.titleDefault")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("dialog.description")}
          </DialogDescription>
          {selectedUser && (
            <SidebarProvider className="items-start">
              <Sidebar collapsible="none" className="hidden md:flex">
                <SidebarContent>
                  {/* User Header in Sidebar */}
                  <div className="border-b p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="text-sm">
                          {getInitials(selectedUser.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{selectedUser.displayName}</p>
                        <p className="truncate text-sm text-muted-foreground">{selectedUser.email}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(() => {
                        const RoleIcon = roleIcons[selectedUser.role]
                        return (
                          <Badge variant="outline" className="gap-1">
                            <RoleIcon className="h-3 w-3" aria-hidden="true" />
                            {t(`role_${selectedUser.role}`)}
                          </Badge>
                        )
                      })()}
                      <Badge variant={statusVariants[selectedUser.status]}>
                        {t(`status${selectedUser.status.charAt(0).toUpperCase() + selectedUser.status.slice(1)}`)}
                      </Badge>
                    </div>
                  </div>
                  <SidebarGroup>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {navItems.map((item) => (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              isActive={activeSection === item.id}
                              onClick={() => setActiveSection(item.id)}
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.name}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </SidebarContent>
              </Sidebar>
              <main className="flex h-[560px] flex-1 flex-col overflow-hidden">
                <header className="flex h-14 shrink-0 items-center gap-2 border-b">
                  <div className="flex items-center gap-2 px-4">
                    <Breadcrumb>
                      <BreadcrumbList>
                        <BreadcrumbItem className="hidden md:block">
                          <span className="text-muted-foreground">{selectedUser.displayName}</span>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="hidden md:block" />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{getSectionTitle(activeSection)}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </BreadcrumbList>
                    </Breadcrumb>
                  </div>
                </header>
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                  {/* Mobile Navigation */}
                  <div className="flex gap-2 overflow-x-auto md:hidden">
                    {navItems.map((item) => (
                      <Button
                        key={item.id}
                        variant={activeSection === item.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveSection(item.id)}
                        className="shrink-0"
                      >
                        <item.icon className="mr-1 h-4 w-4" />
                        {item.name}
                      </Button>
                    ))}
                  </div>

                  {/* Profile Section */}
                  {activeSection === "profile" && (
                    <div className="space-y-6">
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label>{t("userEmail")}</Label>
                          <Input
                            value={formData.email}
                            disabled
                            type="email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("userName")}</Label>
                          <Input
                            value={formData.displayName}
                            onChange={(e) => handleFormChange(e)}
                            name="displayName"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("userRole")}</Label>
                          <Select
                            value={formData.role}
                            onValueChange={(value) => handleFormChange({ name: "role", value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {adminRoles.map((role) => {
                                const RoleIcon = roleIcons[role]
                                return (
                                  <SelectItem key={role} value={role}>
                                    <span className="flex items-center gap-2">
                                      <RoleIcon className="h-4 w-4" aria-hidden="true" />
                                      {t(`role_${role}`)}
                                    </span>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground">
                            {t(`roleDescription_${formData.role}`)}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("statusColumn")}</Label>
                          <Select defaultValue={selectedUser.status}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={AdminStatus.ACTIVE}>{t("statusActive")}</SelectItem>
                              <SelectItem value={AdminStatus.INACTIVE}>{t("statusInactive")}</SelectItem>
                              <SelectItem value={AdminStatus.PENDING}>{t("statusPending")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <h4 className="font-medium">{t("sheet.accountInfo")}</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <IconCalendar className="h-4 w-4" aria-hidden="true" />
                            <span>{t("sheet.createdAt")}</span>
                          </div>
                          <span>
                            {format.dateTime(new Date(selectedUser.createdAt), {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <IconClock className="h-4 w-4" aria-hidden="true" />
                            <span>{t("sheet.lastLogin")}</span>
                          </div>
                          <span>
                            {selectedUser.lastLogin
                              ? format.dateTime(new Date(selectedUser.lastLogin), {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "numeric",
                                })
                              : "—"}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between pt-4">
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteUser(selectedUser)}
                        >
                          <IconTrash className="mr-2 h-4 w-4" aria-hidden="true" />
                          {tCommon("delete")}
                        </Button>
                        <Button onClick={() => handleSaveUser(true)} disabled={isSaving}>
                          {isSaving ? tCommon("loading") : tCommon("save")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Activity Section */}
                  {activeSection === "activity" && (
                    <div className="space-y-4">
                      <h4 className="font-medium">{t("sheet.recentActivity")}</h4>
                      <div className="space-y-4">
                        {activityLog.map((log) => (
                          <div key={log.id} className="flex gap-4 text-sm">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                              <IconHistory className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <p className="font-medium capitalize">{log.action.replace("_", " ")}</p>
                              <p className="text-muted-foreground">{log.details}</p>
                              <p className="text-xs text-muted-foreground">
                                {format.dateTime(new Date(log.timestamp), {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "numeric",
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </main>
            </SidebarProvider>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteUserTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteUserDescription", { name: selectedUser?.displayName ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isSaving}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isSaving}>
              {isSaving ? tCommon("loading") : tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
