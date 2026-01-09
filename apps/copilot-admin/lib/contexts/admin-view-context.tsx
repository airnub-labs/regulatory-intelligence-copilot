"use client"

import * as React from "react"
import {
  type ManagedUser,
  type AuditLogEntry,
  type AuditAction,
  type AuditChange,
  AdminRole,
} from "@/lib/types/admin"
import {
  canViewUserSettings,
  canEditUserSettings,
} from "@/lib/utils/permissions"

/**
 * Audit logger interface for SOC2 compliance
 * In production, this would send logs to a secure audit service
 */
interface AuditLogger {
  log: (entry: Omit<AuditLogEntry, "id" | "timestamp">) => Promise<void>
}

/**
 * Default audit logger - logs to console in development
 * In production, replace with actual audit service
 */
const defaultAuditLogger: AuditLogger = {
  log: async (entry) => {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }

    // In production, this would send to a secure audit service
    // For now, log to console with clear formatting
    console.info("[AUDIT LOG]", JSON.stringify(fullEntry, null, 2))

    // TODO: Implement actual audit logging to backend
    // await fetch('/api/audit-log', {
    //   method: 'POST',
    //   body: JSON.stringify(fullEntry),
    // })
  },
}

interface AdminViewContextValue {
  /** The user whose settings are being viewed (null = own settings) */
  viewingUser: ManagedUser | null
  /** Whether we're currently viewing another user's settings */
  isAdminView: boolean
  /** The current admin user */
  currentAdmin: ManagedUser | null
  /** Whether the admin can edit the viewed user's settings */
  canEdit: boolean
  /** Start viewing another user's settings */
  startViewingUser: (user: ManagedUser) => Promise<boolean>
  /** Stop viewing another user's settings (return to own) */
  stopViewingUser: () => Promise<void>
  /** Log an audit event */
  logAuditEvent: (
    action: AuditAction,
    resourceType: "user_profile" | "user_preferences" | "user_settings",
    outcome: "success" | "failure" | "denied",
    changes?: AuditChange[],
    reason?: string
  ) => Promise<void>
  /** Set the current admin user (called on auth) */
  setCurrentAdmin: (admin: ManagedUser | null) => void
}

const AdminViewContext = React.createContext<AdminViewContextValue | null>(null)

interface AdminViewProviderProps {
  children: React.ReactNode
  auditLogger?: AuditLogger
}

/**
 * Provider for admin view-as-user functionality
 *
 * SOC2 Compliance Features:
 * - All access to other user's data is logged
 * - Role-based permissions are enforced
 * - Clear audit trail of who viewed/edited what
 * - Session is not transferred - admin retains their identity
 */
export function AdminViewProvider({
  children,
  auditLogger = defaultAuditLogger,
}: AdminViewProviderProps) {
  const [viewingUser, setViewingUser] = React.useState<ManagedUser | null>(null)
  const [currentAdmin, setCurrentAdmin] = React.useState<ManagedUser | null>(null)

  const isAdminView = viewingUser !== null

  const canEdit = React.useMemo(() => {
    if (!currentAdmin || !viewingUser) return false
    return canEditUserSettings(currentAdmin, viewingUser)
  }, [currentAdmin, viewingUser])

  /**
   * Log an audit event for SOC2 compliance
   */
  const logAuditEvent = React.useCallback(
    async (
      action: AuditAction,
      resourceType: "user_profile" | "user_preferences" | "user_settings",
      outcome: "success" | "failure" | "denied",
      changes?: AuditChange[],
      reason?: string
    ) => {
      if (!currentAdmin) return

      const targetUser = viewingUser || currentAdmin

      await auditLogger.log({
        actorId: currentAdmin.id,
        actorEmail: currentAdmin.email,
        actorRole: currentAdmin.role,
        action,
        resourceType,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        outcome,
        changes,
        reason,
        // In production, get these from request context
        ipAddress: typeof window !== "undefined" ? "client" : "server",
        userAgent: typeof window !== "undefined" ? navigator.userAgent : "server",
      })
    },
    [currentAdmin, viewingUser, auditLogger]
  )

  /**
   * Start viewing another user's settings
   * Returns true if permission granted, false if denied
   */
  const startViewingUser = React.useCallback(
    async (user: ManagedUser): Promise<boolean> => {
      if (!currentAdmin) {
        console.error("Cannot view user settings: No current admin")
        return false
      }

      // Check permissions
      if (!canViewUserSettings(currentAdmin, user)) {
        await logAuditEvent(
          "admin_view_start",
          "user_settings",
          "denied",
          undefined,
          `Admin ${currentAdmin.email} attempted to view user ${user.email} without permission`
        )
        return false
      }

      // Log the start of admin view
      await logAuditEvent(
        "admin_view_start",
        "user_settings",
        "success",
        undefined,
        `Admin ${currentAdmin.email} started viewing settings for user ${user.email}`
      )

      setViewingUser(user)
      return true
    },
    [currentAdmin, logAuditEvent]
  )

  /**
   * Stop viewing another user's settings
   */
  const stopViewingUser = React.useCallback(async () => {
    if (viewingUser && currentAdmin) {
      await logAuditEvent(
        "admin_view_end",
        "user_settings",
        "success",
        undefined,
        `Admin ${currentAdmin.email} stopped viewing settings for user ${viewingUser.email}`
      )
    }
    setViewingUser(null)
  }, [viewingUser, currentAdmin, logAuditEvent])

  const value = React.useMemo(
    () => ({
      viewingUser,
      isAdminView,
      currentAdmin,
      canEdit,
      startViewingUser,
      stopViewingUser,
      logAuditEvent,
      setCurrentAdmin,
    }),
    [
      viewingUser,
      isAdminView,
      currentAdmin,
      canEdit,
      startViewingUser,
      stopViewingUser,
      logAuditEvent,
    ]
  )

  return (
    <AdminViewContext.Provider value={value}>
      {children}
    </AdminViewContext.Provider>
  )
}

/**
 * Hook to access admin view context
 */
export function useAdminView() {
  const context = React.useContext(AdminViewContext)
  if (!context) {
    throw new Error("useAdminView must be used within an AdminViewProvider")
  }
  return context
}

/**
 * Hook that returns the effective user (viewed user or current admin)
 * Use this in settings pages to get the user whose settings should be shown
 */
export function useEffectiveUser() {
  const { viewingUser, currentAdmin, isAdminView, canEdit } = useAdminView()
  return {
    user: viewingUser || currentAdmin,
    isAdminView,
    canEdit: isAdminView ? canEdit : true, // Can always edit own settings
  }
}

/**
 * Mock function to get admin users for the selector
 * In production, this would fetch from an API
 */
export function getMockAdminUsers(): ManagedUser[] {
  return [
    {
      id: "user-1",
      email: "john.doe@example.com",
      displayName: "John Doe",
      role: AdminRole.ACCOUNT_MANAGER,
      status: "active",
      tenantId: "tenant-1",
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-12-01T14:30:00Z",
      lastLogin: "2024-12-20T09:15:00Z",
      avatarUrl: null,
      preferences: {
        locale: "en-IE",
        timezone: "Europe/Dublin",
        theme: "light",
        emailNotifications: true,
        systemAlerts: true,
        weeklyDigest: false,
      },
    },
    {
      id: "user-2",
      email: "jane.smith@example.com",
      displayName: "Jane Smith",
      role: AdminRole.SUPPORT_TIER_1,
      status: "active",
      tenantId: "tenant-1",
      assignedTenantIds: ["tenant-1", "tenant-2"],
      createdAt: "2024-02-20T14:00:00Z",
      updatedAt: "2024-11-15T11:20:00Z",
      lastLogin: "2024-12-19T16:45:00Z",
      avatarUrl: null,
      preferences: {
        locale: "en-GB",
        timezone: "Europe/London",
        theme: "dark",
        emailNotifications: true,
        systemAlerts: false,
        weeklyDigest: true,
      },
    },
    {
      id: "user-3",
      email: "bob.wilson@example.com",
      displayName: "Bob Wilson",
      role: AdminRole.SUPPORT_TIER_2,
      status: "active",
      tenantId: "tenant-1",
      createdAt: "2024-03-10T09:00:00Z",
      updatedAt: "2024-10-22T08:45:00Z",
      lastLogin: "2024-12-18T11:30:00Z",
      avatarUrl: null,
      preferences: {
        locale: "en-US",
        timezone: "America/New_York",
        theme: "system",
        emailNotifications: false,
        systemAlerts: true,
        weeklyDigest: false,
      },
    },
    {
      id: "user-4",
      email: "maria.garcia@example.com",
      displayName: "Maria Garcia",
      role: AdminRole.COMPLIANCE_AUDITOR,
      status: "pending",
      tenantId: "tenant-1",
      createdAt: "2024-12-01T16:00:00Z",
      updatedAt: "2024-12-01T16:00:00Z",
      avatarUrl: null,
      preferences: {
        locale: "es-ES",
        timezone: "Europe/Madrid",
        theme: "light",
        emailNotifications: true,
        systemAlerts: true,
        weeklyDigest: true,
      },
    },
    {
      id: "user-5",
      email: "alex.viewer@example.com",
      displayName: "Alex Viewer",
      role: AdminRole.VIEWER,
      status: "active",
      tenantId: "tenant-1",
      createdAt: "2024-04-01T12:00:00Z",
      updatedAt: "2024-11-01T10:00:00Z",
      lastLogin: "2024-12-15T14:00:00Z",
      avatarUrl: null,
      preferences: {
        locale: "en-IE",
        timezone: "Europe/Dublin",
        theme: "system",
        emailNotifications: true,
        systemAlerts: false,
        weeklyDigest: false,
      },
    },
    {
      id: "user-6",
      email: "sarah.engineer@example.com",
      displayName: "Sarah Engineer",
      role: AdminRole.SUPPORT_TIER_3,
      status: "active",
      tenantId: "tenant-1",
      createdAt: "2024-05-15T09:00:00Z",
      updatedAt: "2024-12-01T10:00:00Z",
      lastLogin: "2024-12-20T10:30:00Z",
      avatarUrl: null,
      preferences: {
        locale: "en-US",
        timezone: "America/Los_Angeles",
        theme: "dark",
        emailNotifications: true,
        systemAlerts: true,
        weeklyDigest: false,
      },
    },
  ]
}

/**
 * Get the current mock admin (for demo purposes)
 * In production, this would come from the auth session
 */
export function getMockCurrentAdmin(): ManagedUser {
  return {
    id: "admin-1",
    email: "admin@example.com",
    displayName: "Platform Admin",
    role: AdminRole.SUPER_ADMIN,
    status: "active",
    tenantId: "tenant-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-12-01T00:00:00Z",
    lastLogin: new Date().toISOString(),
    avatarUrl: null,
    preferences: {
      locale: "en-IE",
      timezone: "Europe/Dublin",
      theme: "system",
      emailNotifications: true,
      systemAlerts: true,
      weeklyDigest: true,
    },
  }
}
