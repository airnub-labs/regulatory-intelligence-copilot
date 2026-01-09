"use client"

import * as React from "react"
import { useTranslations, useFormatter } from "next-intl"
import {
  IconBuilding,
  IconChevronLeft,
  IconChevronRight,
  IconCreditCard,
  IconCrown,
  IconDots,
  IconDownload,
  IconEdit,
  IconEye,
  IconFolder,
  IconGift,
  IconLock,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconTrash,
  IconUser,
  IconUserCheck,
  IconUsers,
  IconArchive,
  IconX,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import {
  type TenantMembership,
  type WorkspaceMembership,
  type Subscription,
  type PaymentHistory,
  type AdminRoleType,
  AdminRole,
  TenantStatus,
  WorkspaceStatus,
  SubscriptionStatus,
  PlanType,
  WorkspaceRole,
} from "@/lib/types/admin"

// Extended user type for platform users with multi-tenant support
interface PlatformUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  status: "active" | "inactive" | "pending"
  createdAt: string
  lastLogin?: string
  preferences?: {
    locale: string
    timezone: string
    theme: "light" | "dark" | "system"
  }
  // Multi-tenant role mappings - user can have different roles in different tenants
  tenantRoles: TenantRoleMapping[]
}

interface TenantRoleMapping {
  tenantId: string
  tenantName: string
  tenantSlug: string
  role: string
  isPrimary: boolean
  joinedAt: string
}

// Mock platform users with multi-tenant roles
const mockPlatformUsers: PlatformUser[] = [
  {
    id: "user-1",
    email: "john.smith@acme.com",
    displayName: "John Smith",
    status: "active",
    createdAt: "2024-01-15T10:00:00Z",
    lastLogin: "2026-01-08T09:30:00Z",
    preferences: { locale: "en-IE", timezone: "Europe/Dublin", theme: "light" },
    tenantRoles: [
      { tenantId: "t1", tenantName: "Acme Corporation", tenantSlug: "acme", role: "Admin", isPrimary: true, joinedAt: "2024-01-15T10:00:00Z" },
      { tenantId: "t2", tenantName: "Beta Industries", tenantSlug: "beta", role: "Member", isPrimary: false, joinedAt: "2024-06-01T10:00:00Z" },
    ],
  },
  {
    id: "user-2",
    email: "sarah.connor@techstart.io",
    displayName: "Sarah Connor",
    status: "active",
    createdAt: "2024-02-20T14:00:00Z",
    lastLogin: "2026-01-07T16:45:00Z",
    preferences: { locale: "en-US", timezone: "America/New_York", theme: "dark" },
    tenantRoles: [
      { tenantId: "t3", tenantName: "Tech Startup Inc", tenantSlug: "techstart", role: "Owner", isPrimary: true, joinedAt: "2024-02-20T14:00:00Z" },
    ],
  },
  {
    id: "user-3",
    email: "michael.chen@enterprise.com",
    displayName: "Michael Chen",
    status: "active",
    createdAt: "2024-03-10T09:00:00Z",
    lastLogin: "2026-01-06T11:20:00Z",
    preferences: { locale: "en-GB", timezone: "Europe/London", theme: "system" },
    tenantRoles: [
      { tenantId: "t1", tenantName: "Acme Corporation", tenantSlug: "acme", role: "Member", isPrimary: true, joinedAt: "2024-03-10T09:00:00Z" },
      { tenantId: "t4", tenantName: "Global Consulting", tenantSlug: "globalconsult", role: "Admin", isPrimary: false, joinedAt: "2024-08-15T10:00:00Z" },
      { tenantId: "t5", tenantName: "Finance Partners", tenantSlug: "finpartners", role: "Viewer", isPrimary: false, joinedAt: "2024-10-01T10:00:00Z" },
    ],
  },
  {
    id: "user-4",
    email: "emma.wilson@corp.ie",
    displayName: "Emma Wilson",
    status: "active",
    createdAt: "2024-04-05T11:00:00Z",
    lastLogin: "2026-01-05T14:10:00Z",
    preferences: { locale: "ga-IE", timezone: "Europe/Dublin", theme: "light" },
    tenantRoles: [
      { tenantId: "t2", tenantName: "Beta Industries", tenantSlug: "beta", role: "Admin", isPrimary: true, joinedAt: "2024-04-05T11:00:00Z" },
    ],
  },
  {
    id: "user-5",
    email: "david.murphy@example.com",
    displayName: "David Murphy",
    status: "pending",
    createdAt: "2026-01-02T10:00:00Z",
    preferences: { locale: "en-IE", timezone: "Europe/Dublin", theme: "system" },
    tenantRoles: [
      { tenantId: "t1", tenantName: "Acme Corporation", tenantSlug: "acme", role: "Member", isPrimary: true, joinedAt: "2026-01-02T10:00:00Z" },
    ],
  },
  {
    id: "user-6",
    email: "lisa.taylor@multi.org",
    displayName: "Lisa Taylor",
    status: "active",
    createdAt: "2024-05-15T08:00:00Z",
    lastLogin: "2026-01-04T10:30:00Z",
    preferences: { locale: "en-US", timezone: "America/Los_Angeles", theme: "dark" },
    tenantRoles: [
      { tenantId: "t3", tenantName: "Tech Startup Inc", tenantSlug: "techstart", role: "Admin", isPrimary: true, joinedAt: "2024-05-15T08:00:00Z" },
      { tenantId: "t4", tenantName: "Global Consulting", tenantSlug: "globalconsult", role: "Member", isPrimary: false, joinedAt: "2024-07-20T10:00:00Z" },
      { tenantId: "t1", tenantName: "Acme Corporation", tenantSlug: "acme", role: "Viewer", isPrimary: false, joinedAt: "2024-09-10T10:00:00Z" },
      { tenantId: "t6", tenantName: "Innovation Labs", tenantSlug: "innolabs", role: "Owner", isPrimary: false, joinedAt: "2024-11-01T10:00:00Z" },
    ],
  },
  {
    id: "user-7",
    email: "james.brown@inactive.com",
    displayName: "James Brown",
    status: "inactive",
    createdAt: "2024-01-10T09:00:00Z",
    lastLogin: "2024-11-15T16:00:00Z",
    preferences: { locale: "en-GB", timezone: "Europe/London", theme: "light" },
    tenantRoles: [
      { tenantId: "t2", tenantName: "Beta Industries", tenantSlug: "beta", role: "Member", isPrimary: true, joinedAt: "2024-01-10T09:00:00Z" },
    ],
  },
  {
    id: "user-8",
    email: "anna.schmidt@de.company.com",
    displayName: "Anna Schmidt",
    status: "active",
    createdAt: "2024-06-20T10:00:00Z",
    lastLogin: "2026-01-03T09:15:00Z",
    preferences: { locale: "de-DE", timezone: "Europe/Berlin", theme: "system" },
    tenantRoles: [
      { tenantId: "t5", tenantName: "Finance Partners", tenantSlug: "finpartners", role: "Admin", isPrimary: true, joinedAt: "2024-06-20T10:00:00Z" },
      { tenantId: "t4", tenantName: "Global Consulting", tenantSlug: "globalconsult", role: "Owner", isPrimary: false, joinedAt: "2024-08-01T10:00:00Z" },
    ],
  },
  {
    id: "user-9",
    email: "carlos.rodriguez@es.corp.com",
    displayName: "Carlos Rodriguez",
    status: "active",
    createdAt: "2024-07-10T14:00:00Z",
    lastLogin: "2026-01-02T11:45:00Z",
    preferences: { locale: "es-ES", timezone: "Europe/Madrid", theme: "light" },
    tenantRoles: [
      { tenantId: "t6", tenantName: "Innovation Labs", tenantSlug: "innolabs", role: "Member", isPrimary: true, joinedAt: "2024-07-10T14:00:00Z" },
    ],
  },
  {
    id: "user-10",
    email: "marie.dupont@fr.org.com",
    displayName: "Marie Dupont",
    status: "active",
    createdAt: "2024-08-05T11:00:00Z",
    lastLogin: "2026-01-01T15:20:00Z",
    preferences: { locale: "fr-FR", timezone: "Europe/Paris", theme: "dark" },
    tenantRoles: [
      { tenantId: "t1", tenantName: "Acme Corporation", tenantSlug: "acme", role: "Admin", isPrimary: true, joinedAt: "2024-08-05T11:00:00Z" },
      { tenantId: "t3", tenantName: "Tech Startup Inc", tenantSlug: "techstart", role: "Member", isPrimary: false, joinedAt: "2024-10-15T10:00:00Z" },
    ],
  },
  {
    id: "user-11",
    email: "pending.user@newcompany.com",
    displayName: "Pending User",
    status: "pending",
    createdAt: "2026-01-05T09:00:00Z",
    preferences: { locale: "en-IE", timezone: "Europe/Dublin", theme: "system" },
    tenantRoles: [
      { tenantId: "t2", tenantName: "Beta Industries", tenantSlug: "beta", role: "Member", isPrimary: true, joinedAt: "2026-01-05T09:00:00Z" },
    ],
  },
  {
    id: "user-12",
    email: "paulo.silva@pt.company.com",
    displayName: "Paulo Silva",
    status: "active",
    createdAt: "2024-09-12T10:00:00Z",
    lastLogin: "2025-12-30T14:30:00Z",
    preferences: { locale: "pt-PT", timezone: "Europe/Lisbon", theme: "light" },
    tenantRoles: [
      { tenantId: "t5", tenantName: "Finance Partners", tenantSlug: "finpartners", role: "Member", isPrimary: true, joinedAt: "2024-09-12T10:00:00Z" },
      { tenantId: "t6", tenantName: "Innovation Labs", tenantSlug: "innolabs", role: "Admin", isPrimary: false, joinedAt: "2024-11-20T10:00:00Z" },
    ],
  },
]

// Mock data generators for detailed view
function getMockTenantMemberships(user: PlatformUser): TenantMembership[] {
  return user.tenantRoles.map((tr, index) => ({
    id: `tm-${user.id}-${index}`,
    userId: user.id,
    tenantId: tr.tenantId,
    tenant: {
      id: tr.tenantId,
      name: tr.tenantName,
      slug: tr.tenantSlug,
      status: TenantStatus.ACTIVE,
      plan: index === 0 ? "professional" : "starter",
      maxUsers: 50,
      maxWorkspaces: 10,
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-12-01T14:30:00Z",
    },
    role: tr.role as AdminRoleType,
    joinedAt: tr.joinedAt,
    isPrimary: tr.isPrimary,
  }))
}

function getMockWorkspaceMemberships(userId: string): WorkspaceMembership[] {
  return [
    {
      id: "wm-1",
      userId,
      workspaceId: "ws-1",
      workspace: {
        id: "ws-1",
        name: "Regulatory Compliance",
        description: "EU regulatory compliance tracking",
        tenantId: "t1",
        tenantName: "Acme Corporation",
        status: WorkspaceStatus.ACTIVE,
        createdAt: "2024-02-01T10:00:00Z",
        updatedAt: "2024-12-01T14:30:00Z",
        memberCount: 12,
      },
      role: WorkspaceRole.OWNER,
      joinedAt: "2024-02-01T10:00:00Z",
    },
    {
      id: "wm-2",
      userId,
      workspaceId: "ws-2",
      workspace: {
        id: "ws-2",
        name: "Tax Planning",
        description: "Corporate tax strategy",
        tenantId: "t1",
        tenantName: "Acme Corporation",
        status: WorkspaceStatus.ACTIVE,
        createdAt: "2024-03-15T11:00:00Z",
        updatedAt: "2024-11-28T09:15:00Z",
        memberCount: 8,
      },
      role: WorkspaceRole.ADMIN,
      joinedAt: "2024-03-20T14:00:00Z",
    },
  ]
}

function getMockSubscriptions(userId: string): Subscription[] {
  return [
    {
      id: "sub-1",
      userId,
      tenantId: "t1",
      plan: PlanType.PROFESSIONAL,
      status: SubscriptionStatus.ACTIVE,
      startDate: "2024-01-15T00:00:00Z",
      amount: 99,
      currency: "EUR",
      interval: "month",
      isFreeGrant: false,
      createdAt: "2024-01-15T00:00:00Z",
      updatedAt: "2024-12-01T00:00:00Z",
    },
  ]
}

function getMockPaymentHistory(userId: string): PaymentHistory[] {
  return [
    {
      id: "pay-1",
      subscriptionId: "sub-1",
      amount: 99,
      currency: "EUR",
      status: "succeeded",
      paymentMethod: "Visa ending in 4242",
      invoiceUrl: "#",
      createdAt: "2024-12-01T00:00:00Z",
    },
    {
      id: "pay-2",
      subscriptionId: "sub-1",
      amount: 99,
      currency: "EUR",
      status: "succeeded",
      paymentMethod: "Visa ending in 4242",
      invoiceUrl: "#",
      createdAt: "2024-11-01T00:00:00Z",
    },
  ]
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// Role badge colors
const roleColors: Record<string, string> = {
  Owner: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Member: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Viewer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

// Status badge variants
const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  pending: "outline",
}

const subscriptionStatusColors: Record<string, string> = {
  active: "bg-green-500",
  past_due: "bg-red-500",
  cancelled: "bg-gray-500",
  trialing: "bg-blue-500",
}

const statusColors: Record<string, string> = {
  active: "bg-green-500",
  inactive: "bg-gray-400",
  pending: "bg-yellow-500",
  trial: "bg-blue-500",
  archived: "bg-orange-500",
}

const ITEMS_PER_PAGE = 10

type DialogSection = "profile" | "tenants" | "workspaces" | "billing" | "preferences" | "permissions"

// Platform user roles (distinct from admin roles)
const platformRoles = ["Owner", "Admin", "Member", "Viewer"] as const
type PlatformRoleType = typeof platformRoles[number]

// Platform role icons
const platformRoleIcons: Record<PlatformRoleType, React.ComponentType<{ className?: string }>> = {
  Owner: IconCrown,
  Admin: IconShieldCheck,
  Member: IconUserCheck,
  Viewer: IconEye,
}

// Platform role permission categories
interface PlatformRolePermissions {
  tenantManagement: string[]
  workspaceManagement: string[]
  userManagement: string[]
  dataAccess: string[]
}

const platformRolePermissions: Record<PlatformRoleType, PlatformRolePermissions> = {
  Owner: {
    tenantManagement: ["permManageTenant", "permManageBilling", "permInviteUsers", "permRemoveUsers"],
    workspaceManagement: ["permCreateWorkspace", "permDeleteWorkspace", "permManageWorkspaceSettings"],
    userManagement: ["permAssignRoles", "permManageMembers", "permViewAllUsers"],
    dataAccess: ["permFullDataAccess", "permExportData", "permDeleteData"],
  },
  Admin: {
    tenantManagement: ["permViewBilling", "permInviteUsers"],
    workspaceManagement: ["permCreateWorkspace", "permManageWorkspaceSettings"],
    userManagement: ["permAssignRoles", "permManageMembers", "permViewAllUsers"],
    dataAccess: ["permFullDataAccess", "permExportData"],
  },
  Member: {
    tenantManagement: [],
    workspaceManagement: ["permJoinWorkspace"],
    userManagement: ["permViewMembers"],
    dataAccess: ["permViewOwnData", "permExportOwnData"],
  },
  Viewer: {
    tenantManagement: [],
    workspaceManagement: ["permViewWorkspace"],
    userManagement: ["permViewMembers"],
    dataAccess: ["permViewOwnData"],
  },
}

// Permission groups available for platform users
const availablePermissionGroups = [
  { id: "data_export", name: "Data Export" },
  { id: "conversation_export", name: "Conversation Export" },
  { id: "report_access", name: "Report Access" },
  { id: "api_access", name: "API Access" },
  { id: "bulk_operations", name: "Bulk Operations" },
] as const

export default function UsersPage() {
  const t = useTranslations("userManagement")
  const tCommon = useTranslations("common")
  const tPerm = useTranslations("permissions")
  const format = useFormatter()

  // Data state
  const [users, setUsers] = React.useState<PlatformUser[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)

  // Fetch users from API on mount
  React.useEffect(() => {
    async function loadUsers() {
      try {
        setIsLoading(true)
        const response = await fetch("/api/platform-users")
        if (!response.ok) {
          throw new Error("Failed to fetch users")
        }
        const data = await response.json()
        // Transform API response to match PlatformUser interface
        const transformedUsers: PlatformUser[] = data.users.map((user: Record<string, unknown>) => ({
          id: user.id as string,
          email: user.email as string,
          displayName: user.displayName as string,
          avatarUrl: user.avatarUrl as string | undefined,
          status: user.status as "active" | "inactive" | "pending",
          createdAt: user.createdAt as string,
          lastLogin: user.lastLogin as string | null,
          tenantRoles: (user.tenantRoles as Array<Record<string, unknown>>).map((tr) => ({
            tenantId: tr.tenantId as string,
            tenantName: tr.tenantName as string,
            role: tr.role as "Owner" | "Admin" | "Member" | "Viewer",
            status: (tr.status as string) === "active" ? TenantStatus.ACTIVE : TenantStatus.SUSPENDED,
            isPrimary: tr.isPrimary as boolean,
          })),
          preferences: user.preferences as { locale: string; timezone: string; theme: "light" | "dark" | "system" },
        }))
        setUsers(transformedUsers)
      } catch (error) {
        console.error("Error loading users:", error)
        // Fall back to mock data if API fails
        setUsers(mockPlatformUsers)
      } finally {
        setIsLoading(false)
      }
    }
    loadUsers()
  }, [])

  // Filter state
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [planFilter, setPlanFilter] = React.useState<string>("all")

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1)

  // Dialog state for user details
  const [selectedUser, setSelectedUser] = React.useState<PlatformUser | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState<DialogSection>("profile")

  // Data for selected user
  const [tenantMemberships, setTenantMemberships] = React.useState<TenantMembership[]>([])
  const [workspaceMemberships, setWorkspaceMemberships] = React.useState<WorkspaceMembership[]>([])
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([])
  const [payments, setPayments] = React.useState<PaymentHistory[]>([])

  // Statistics
  const stats = React.useMemo(() => ({
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.status === "active").length,
    trialUsers: users.filter((u) => u.status === "pending").length,
    multiTenantUsers: users.filter((u) => u.tenantRoles.length > 1).length,
  }), [users])

  // Filter users
  const filteredUsers = React.useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        searchQuery === "" ||
        user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === "all" || user.status === statusFilter
      const matchesPlan = planFilter === "all" || true

      return matchesSearch && matchesStatus && matchesPlan
    })
  }, [users, searchQuery, statusFilter, planFilter])

  // Paginated users
  const paginatedUsers = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredUsers, currentPage])

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, planFilter])

  // Load user data when selected
  React.useEffect(() => {
    if (selectedUser) {
      setTenantMemberships(getMockTenantMemberships(selectedUser))
      setWorkspaceMemberships(getMockWorkspaceMemberships(selectedUser.id))
      setSubscriptions(getMockSubscriptions(selectedUser.id))
      setPayments(getMockPaymentHistory(selectedUser.id))
    } else {
      setTenantMemberships([])
      setWorkspaceMemberships([])
      setSubscriptions([])
      setPayments([])
    }
  }, [selectedUser])

  // Group workspaces by tenant
  const workspacesByTenant = React.useMemo(() => {
    const grouped = new Map<string, WorkspaceMembership[]>()
    workspaceMemberships.forEach((wm) => {
      const tenantName = wm.workspace.tenantName
      if (!grouped.has(tenantName)) {
        grouped.set(tenantName, [])
      }
      grouped.get(tenantName)!.push(wm)
    })
    return grouped
  }, [workspaceMemberships])

  const handleViewUser = (user: PlatformUser) => {
    setSelectedUser(user)
    setActiveSection("profile")
    setIsDialogOpen(true)
  }

  // Save user profile
  const handleSaveProfile = async (updates: { displayName?: string }) => {
    if (!selectedUser) return

    try {
      setIsSaving(true)
      const response = await fetch(`/api/platform-users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: updates }),
      })

      if (!response.ok) {
        throw new Error("Failed to save profile")
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, displayName: updates.displayName ?? u.displayName }
            : u
        )
      )
      setSelectedUser((prev) =>
        prev ? { ...prev, displayName: updates.displayName ?? prev.displayName } : null
      )
    } catch (error) {
      console.error("Error saving profile:", error)
    } finally {
      setIsSaving(false)
    }
  }

  // Save user preferences
  const handleSavePreferences = async (updates: { locale?: string; timezone?: string; theme?: string }) => {
    if (!selectedUser) return

    try {
      setIsSaving(true)
      const response = await fetch(`/api/platform-users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: updates }),
      })

      if (!response.ok) {
        throw new Error("Failed to save preferences")
      }

      // Update local state
      const newPrefs = { ...selectedUser.preferences, ...updates } as typeof selectedUser.preferences
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, preferences: newPrefs } : u
        )
      )
      setSelectedUser((prev) =>
        prev ? { ...prev, preferences: newPrefs } : null
      )
    } catch (error) {
      console.error("Error saving preferences:", error)
    } finally {
      setIsSaving(false)
    }
  }

  // Save tenant membership role
  const handleSaveMembership = async (tenantId: string, role: string) => {
    if (!selectedUser) return

    try {
      setIsSaving(true)
      const response = await fetch(`/api/platform-users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership: { tenantId, role } }),
      })

      if (!response.ok) {
        throw new Error("Failed to save membership")
      }

      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? {
                ...u,
                tenantRoles: u.tenantRoles.map((tr) =>
                  tr.tenantId === tenantId ? { ...tr, role: role as typeof tr.role } : tr
                ),
              }
            : u
        )
      )
      setSelectedUser((prev) =>
        prev
          ? {
              ...prev,
              tenantRoles: prev.tenantRoles.map((tr) =>
                tr.tenantId === tenantId ? { ...tr, role: role as typeof tr.role } : tr
              ),
            }
          : null
      )
    } catch (error) {
      console.error("Error saving membership:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString()
  }

  // Get primary tenant role for display
  const getPrimaryTenantRole = (user: PlatformUser): TenantRoleMapping | undefined => {
    return user.tenantRoles.find((tr) => tr.isPrimary) || user.tenantRoles[0]
  }

  // State for user permission groups
  const [userPermissionGroups, setUserPermissionGroups] = React.useState<string[]>([])

  // Load permission groups when user is selected
  React.useEffect(() => {
    if (selectedUser) {
      // In production, this would load from the API
      // For now, simulate some assigned groups for demo
      setUserPermissionGroups(selectedUser.id === "user-1" ? ["data_export", "api_access"] : [])
    } else {
      setUserPermissionGroups([])
    }
  }, [selectedUser])

  // Toggle permission group
  const handleTogglePermissionGroup = (groupId: string) => {
    setUserPermissionGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    )
  }

  // Navigation items for the sidebar
  const navItems = [
    { id: "profile" as const, name: t("tabs.profile"), icon: IconUser },
    { id: "tenants" as const, name: t("tabs.tenants"), icon: IconBuilding },
    { id: "workspaces" as const, name: t("tabs.workspaces"), icon: IconFolder },
    { id: "billing" as const, name: t("tabs.billing"), icon: IconCreditCard },
    { id: "preferences" as const, name: t("tabs.preferences"), icon: IconSettings },
    { id: "permissions" as const, name: t("tabs.permissions"), icon: IconLock },
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
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <IconDownload className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("export")}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("stats.totalUsers")}</CardDescription>
            <CardTitle className="text-3xl">{stats.totalUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("stats.activeUsers")}</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.activeUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("stats.trialUsers")}</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{stats.trialUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("stats.multiTenantUsers")}</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.multiTenantUsers}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
          <TabsTrigger value="roles">{t("tabs.roles")}</TabsTrigger>
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40" aria-label={t("filters.byStatus")}>
                    <SelectValue placeholder={t("filters.allStatuses")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
                    <SelectItem value="active">{t("status.active")}</SelectItem>
                    <SelectItem value="inactive">{t("status.inactive")}</SelectItem>
                    <SelectItem value="pending">{t("status.pending")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={planFilter} onValueChange={setPlanFilter}>
                  <SelectTrigger className="w-full sm:w-40" aria-label={t("filters.byPlan")}>
                    <SelectValue placeholder={t("filters.allPlans")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.allPlans")}</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
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
                <TableHead className="w-[280px]">{t("table.user")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.tenantRoles")}</TableHead>
                <TableHead>{t("table.lastLogin")}</TableHead>
                <TableHead className="w-[70px]">
                  <span className="sr-only">{tCommon("actions")}</span>
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
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : paginatedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <p className="text-muted-foreground">{t("noUsersFound")}</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUsers.map((user) => {
                  const primaryRole = getPrimaryTenantRole(user)
                  const additionalRolesCount = user.tenantRoles.length - 1

                  return (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer"
                      onClick={() => handleViewUser(user)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatarUrl || undefined} />
                            <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.displayName}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[user.status] || "secondary"}>
                          {t(`status.${user.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <div className="flex items-center gap-2">
                            {primaryRole && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className={cn("text-xs", roleColors[primaryRole.role])}
                                  >
                                    {primaryRole.role}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{primaryRole.tenantName}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {additionalRolesCount > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="secondary" className="text-xs">
                                    +{additionalRolesCount} {additionalRolesCount === 1 ? t("table.tenant") : t("table.tenants")}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="space-y-1">
                                    {user.tenantRoles.slice(1).map((tr) => (
                                      <p key={tr.tenantId}>
                                        {tr.tenantName}: <span className="font-medium">{tr.role}</span>
                                      </p>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.lastLogin ? formatDate(user.lastLogin) : "—"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tCommon("actions")}>
                              <IconDots className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewUser(user); }}>
                              <IconUser className="mr-2 h-4 w-4" aria-hidden="true" />
                              {t("actions.viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <IconEdit className="mr-2 h-4 w-4" aria-hidden="true" />
                              {tCommon("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => e.stopPropagation()}
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

        {/* Roles Tab */}
        <TabsContent value="roles" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {platformRoles.map((role) => {
              const RoleIcon = platformRoleIcons[role]
              const permissions = platformRolePermissions[role]
              const usersWithRole = users.filter((u) =>
                u.tenantRoles.some((tr) => tr.role === role)
              ).length

              return (
                <Card key={role}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg",
                          roleColors[role] || "bg-primary/10"
                        )}>
                          <RoleIcon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{t(`roles.${role.toLowerCase()}`)}</CardTitle>
                          <CardDescription>
                            {usersWithRole} {usersWithRole === 1 ? t("roleCount.singular") : t("roleCount.plural")}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t(`roleDescriptions.${role.toLowerCase()}`)}
                    </p>
                    <div className="space-y-3">
                      {permissions.tenantManagement.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground mb-1">
                            {t("roleCategories.tenantManagement")}
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {permissions.tenantManagement.map((perm) => (
                              <Badge key={perm} variant="outline" className="text-xs">
                                {t(`platformPermissions.${perm}`)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {permissions.workspaceManagement.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground mb-1">
                            {t("roleCategories.workspaceManagement")}
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {permissions.workspaceManagement.map((perm) => (
                              <Badge key={perm} variant="outline" className="text-xs">
                                {t(`platformPermissions.${perm}`)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {permissions.userManagement.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground mb-1">
                            {t("roleCategories.userManagement")}
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {permissions.userManagement.map((perm) => (
                              <Badge key={perm} variant="outline" className="text-xs">
                                {t(`platformPermissions.${perm}`)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {permissions.dataAccess.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground mb-1">
                            {t("roleCategories.dataAccess")}
                          </h5>
                          <div className="flex flex-wrap gap-1">
                            {permissions.dataAccess.map((perm) => (
                              <Badge key={perm} variant="outline" className="text-xs">
                                {t(`platformPermissions.${perm}`)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* User Details Dialog with Sidebar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[800px] lg:max-w-[900px]">
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
                        <AvatarImage src={selectedUser.avatarUrl || undefined} />
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
                      <Badge variant={statusVariants[selectedUser.status] || "secondary"}>
                        {t(`status.${selectedUser.status}`)}
                      </Badge>
                      <Badge variant="outline">
                        {selectedUser.tenantRoles.length} {selectedUser.tenantRoles.length === 1 ? t("table.tenant") : t("table.tenants")}
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
                      {/* Basic Profile Info */}
                      <div className="space-y-4">
                        <h4 className="font-medium">{t("profileSection.basicInfo")}</h4>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="displayName">{t("profile.displayName")}</Label>
                            <Input
                              id="displayName"
                              defaultValue={selectedUser.displayName}
                              onBlur={(e) => {
                                if (e.target.value !== selectedUser.displayName) {
                                  handleSaveProfile({ displayName: e.target.value })
                                }
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">{t("profile.email")}</Label>
                            <Input id="email" defaultValue={selectedUser.email} type="email" disabled />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="status">{t("profile.status")}</Label>
                            <Select defaultValue={selectedUser.status} disabled>
                              <SelectTrigger id="status">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">{t("status.active")}</SelectItem>
                                <SelectItem value="inactive">{t("status.inactive")}</SelectItem>
                                <SelectItem value="pending">{t("status.pending")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Role Information */}
                      <div className="space-y-4">
                        <h4 className="font-medium">{t("profileSection.roleInfo")}</h4>
                        <div className="rounded-lg border p-4">
                          <div className="space-y-3">
                            {selectedUser.tenantRoles.map((tr) => {
                              const RoleIcon = platformRoleIcons[tr.role as PlatformRoleType] || IconUser
                              return (
                                <div key={tr.tenantId} className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "flex h-8 w-8 items-center justify-center rounded-lg",
                                      roleColors[tr.role] || "bg-muted"
                                    )}>
                                      <RoleIcon className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <div>
                                      <p className="font-medium">{tr.tenantName}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {t(`roles.${tr.role.toLowerCase()}`)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {tr.isPrimary && (
                                      <Badge variant="secondary" className="text-xs">
                                        {t("tenants.primary")}
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className={cn("text-xs", roleColors[tr.role])}>
                                      {tr.role}
                                    </Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Account Details */}
                      <div className="space-y-4">
                        <h4 className="font-medium">{t("profileSection.accountDetails")}</h4>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("profileSection.userId")}</Label>
                            <p className="font-mono text-sm">{selectedUser.id}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("profileSection.createdAt")}</Label>
                            <p className="text-sm">
                              {format.dateTime(new Date(selectedUser.createdAt), {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("profileSection.lastLogin")}</Label>
                            <p className="text-sm">
                              {selectedUser.lastLogin
                                ? format.dateTime(new Date(selectedUser.lastLogin), {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : t("profileSection.neverLoggedIn")}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("profileSection.tenantCount")}</Label>
                            <p className="text-sm">
                              {selectedUser.tenantRoles.length} {selectedUser.tenantRoles.length === 1 ? t("table.tenant") : t("table.tenants")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4">
                        <Button disabled={isSaving}>
                          {isSaving ? tCommon("loading") : tCommon("save")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Preferences Section */}
                  {activeSection === "preferences" && selectedUser.preferences && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="font-medium">{t("preferencesSection.title")}</h4>
                        <p className="text-sm text-muted-foreground">
                          {t("preferencesSection.description")}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="locale">{t("profile.locale")}</Label>
                          <Select
                            defaultValue={selectedUser.preferences.locale}
                            onValueChange={(value) => handleSavePreferences({ locale: value })}
                          >
                            <SelectTrigger id="locale">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="en-IE">English (Ireland)</SelectItem>
                              <SelectItem value="en-GB">English (UK)</SelectItem>
                              <SelectItem value="en-US">English (US)</SelectItem>
                              <SelectItem value="ga-IE">Gaeilge (Ireland)</SelectItem>
                              <SelectItem value="es-ES">Español (Spain)</SelectItem>
                              <SelectItem value="fr-FR">Français (France)</SelectItem>
                              <SelectItem value="de-DE">Deutsch (Germany)</SelectItem>
                              <SelectItem value="pt-PT">Português (Portugal)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="timezone">{t("profile.timezone")}</Label>
                          <Select
                            defaultValue={selectedUser.preferences.timezone}
                            onValueChange={(value) => handleSavePreferences({ timezone: value })}
                          >
                            <SelectTrigger id="timezone">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Europe/Dublin">Europe/Dublin (GMT/IST)</SelectItem>
                              <SelectItem value="Europe/London">Europe/London (GMT/BST)</SelectItem>
                              <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                              <SelectItem value="Europe/Berlin">Europe/Berlin (CET)</SelectItem>
                              <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                              <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                              <SelectItem value="UTC">UTC</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="theme">{t("profile.theme")}</Label>
                          <Select
                            defaultValue={selectedUser.preferences.theme}
                            onValueChange={(value) => handleSavePreferences({ theme: value })}
                          >
                            <SelectTrigger id="theme">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">{t("theme.light")}</SelectItem>
                              <SelectItem value="dark">{t("theme.dark")}</SelectItem>
                              <SelectItem value="system">{t("theme.system")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4">
                        <Button disabled={isSaving}>
                          {isSaving ? tCommon("loading") : tCommon("save")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Tenants Section */}
                  {activeSection === "tenants" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{t("tenants.title")}</h4>
                          <p className="text-sm text-muted-foreground">{t("tenants.multiTenantNote")}</p>
                        </div>
                        <Button size="sm">
                          <IconPlus className="h-4 w-4 mr-1" />
                          {t("tenants.addToTenant")}
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("tenants.name")}</TableHead>
                            <TableHead>{t("tenants.role")}</TableHead>
                            <TableHead>{t("tenants.status")}</TableHead>
                            <TableHead>{t("tenants.joinedAt")}</TableHead>
                            <TableHead className="text-right">{tCommon("actions")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tenantMemberships.map((tm) => (
                            <TableRow key={tm.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{tm.tenant.name}</span>
                                  {tm.isPrimary && (
                                    <Badge variant="secondary">{t("tenants.primary")}</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn("text-xs", roleColors[tm.role as string] || "")}
                                >
                                  {tm.role}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(statusColors[tm.tenant.status], "text-white")}>
                                  {tm.tenant.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {format.dateTime(new Date(tm.joinedAt), {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <IconTrash className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Workspaces Section */}
                  {activeSection === "workspaces" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{t("workspaces.title")}</h4>
                        <Button size="sm">
                          <IconPlus className="h-4 w-4 mr-1" />
                          {t("workspaces.addToWorkspace")}
                        </Button>
                      </div>

                      {Array.from(workspacesByTenant.entries()).map(([tenantName, workspaces]) => (
                        <div key={tenantName} className="space-y-2">
                          <h5 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <IconBuilding className="h-4 w-4" />
                            {tenantName}
                          </h5>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t("workspaces.name")}</TableHead>
                                <TableHead>{t("workspaces.status")}</TableHead>
                                <TableHead>{t("workspaces.role")}</TableHead>
                                <TableHead className="text-right">{tCommon("actions")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {workspaces.map((wm) => (
                                <TableRow key={wm.id}>
                                  <TableCell>
                                    <span className="font-medium">{wm.workspace.name}</span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={cn(statusColors[wm.workspace.status], "text-white")}>
                                      {wm.workspace.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{wm.role}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {wm.workspace.status === WorkspaceStatus.ARCHIVED ? (
                                        <Button variant="ghost" size="sm" className="text-green-600">
                                          <IconRefresh className="h-4 w-4" />
                                        </Button>
                                      ) : (
                                        <Button variant="ghost" size="sm" className="text-orange-600">
                                          <IconArchive className="h-4 w-4" />
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="sm" className="text-destructive">
                                        <IconTrash className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Billing Section */}
                  {activeSection === "billing" && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{t("billing.subscriptions")}</h4>
                        <Button size="sm">
                          <IconGift className="h-4 w-4 mr-1" />
                          {t("billing.grantSubscription")}
                        </Button>
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("billing.plan")}</TableHead>
                            <TableHead>{t("billing.status")}</TableHead>
                            <TableHead>{t("billing.amount")}</TableHead>
                            <TableHead>{t("billing.type")}</TableHead>
                            <TableHead className="text-right">{tCommon("actions")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subscriptions.map((sub) => (
                            <TableRow key={sub.id}>
                              <TableCell className="font-medium capitalize">{sub.plan}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(subscriptionStatusColors[sub.status], "text-white")}>
                                  {sub.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {format.number(sub.amount, { style: "currency", currency: sub.currency })}
                                /{sub.interval}
                              </TableCell>
                              <TableCell>
                                {sub.isFreeGrant ? (
                                  <Badge variant="secondary">
                                    <IconGift className="h-3 w-3 mr-1" />
                                    {t("billing.free")}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">{t("billing.paid")}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <IconX className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-4">{t("billing.paymentHistory")}</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("billing.date")}</TableHead>
                              <TableHead>{t("billing.amount")}</TableHead>
                              <TableHead>{t("billing.status")}</TableHead>
                              <TableHead className="text-right">{t("billing.invoice")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments.map((payment) => (
                              <TableRow key={payment.id}>
                                <TableCell>
                                  {format.dateTime(new Date(payment.createdAt), {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </TableCell>
                                <TableCell>
                                  {format.number(payment.amount, { style: "currency", currency: payment.currency })}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={payment.status === "succeeded" ? "default" : "destructive"}>
                                    {payment.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {payment.invoiceUrl && (
                                    <Button variant="link" size="sm" asChild>
                                      <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer">
                                        {t("billing.viewInvoice")}
                                      </a>
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Permissions Section */}
                  {activeSection === "permissions" && selectedUser && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="font-medium">{t("permissionsSection.title")}</h4>
                        <p className="text-sm text-muted-foreground">
                          {t("permissionsSection.description")}
                        </p>
                      </div>

                      {/* Current Role Permissions */}
                      <div className="space-y-3">
                        <h5 className="text-sm font-medium">{t("permissionsSection.rolePermissions")}</h5>
                        <div className="rounded-lg border p-4">
                          {selectedUser.tenantRoles.map((tr) => {
                            const role = tr.role as PlatformRoleType
                            const RoleIcon = platformRoleIcons[role] || IconUser
                            return (
                              <div key={tr.tenantId} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <RoleIcon className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{tr.tenantName}</span>
                                  <Badge variant="outline" className={cn("text-xs", roleColors[role])}>
                                    {role}
                                  </Badge>
                                  {tr.isPrimary && (
                                    <Badge variant="secondary" className="text-xs">
                                      {t("tenants.primary")}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground ml-6">
                                  {t(`roleDescriptions.${role.toLowerCase()}`)}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <Separator />

                      {/* Additional Permission Groups */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="text-sm font-medium">{t("permissionsSection.additionalGroups")}</h5>
                            <p className="text-xs text-muted-foreground">
                              {t("permissionsSection.additionalGroupsDescription")}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {availablePermissionGroups.map((group) => (
                            <div
                              key={group.id}
                              className="flex items-center justify-between rounded-lg border p-3"
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  id={`group-${group.id}`}
                                  checked={userPermissionGroups.includes(group.id)}
                                  onCheckedChange={() => handleTogglePermissionGroup(group.id)}
                                />
                                <div>
                                  <Label
                                    htmlFor={`group-${group.id}`}
                                    className="text-sm font-medium cursor-pointer"
                                  >
                                    {t(`permissionGroups.${group.id}.name`)}
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    {t(`permissionGroups.${group.id}.description`)}
                                  </p>
                                </div>
                              </div>
                              {userPermissionGroups.includes(group.id) && (
                                <Badge variant="default" className="text-xs">
                                  {t("permissionsSection.assigned")}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end pt-4">
                        <Button>{tCommon("save")}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </main>
            </SidebarProvider>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
