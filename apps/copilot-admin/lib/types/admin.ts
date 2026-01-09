import { z } from "zod"
import type { UserPermissionConfig as PermissionConfigType } from "./permissions"

// Re-export from new permission system for backward compatibility
export {
  Permission,
  PermissionGroupId,
  PermissionGroups,
  type PermissionType,
  type PermissionGroupIdType,
  type PermissionGroupDefinition,
  type UserPermissionConfig,
  type EffectivePermissions,
  type RoleDefaultConfig,
  roleDefaults,
  allPermissions,
  getGroupPermissions,
  getGroupsPermissions,
  getRoleDefaultPermissions,
  calculateEffectivePermissions,
  createEmptyPermissionConfig,
  groupPermissionsByCategory,
  getPermissionCategory,
  PermissionCategory,
  type PermissionCategoryType,
} from "./permissions"

/**
 * SOC2-compliant admin roles for internal platform staff
 *
 * @description These roles are for internal staff managing the platform,
 * NOT for customer-facing tenant administration (which lives in demo-web).
 *
 * Role hierarchy (highest to lowest):
 * 1. super_admin - Full platform access (founders, engineering leads)
 * 2. platform_engineer - Infrastructure operations (DevOps)
 * 3. account_manager - Customer success, tenant-scoped access
 * 4. compliance_auditor - Audit logs, compliance reports (security team)
 * 5. support_tier_3 - Engineering support (code access, prod debugging)
 * 6. support_tier_2 - Escalation support, cross-tenant access
 * 7. support_tier_1 - Frontline support, assigned tenants only
 * 8. viewer - Read-only dashboards (analysts, stakeholders)
 */
export const AdminRole = {
  /** Full platform access - can manage all users, settings, tenants, and infrastructure */
  SUPER_ADMIN: "super_admin",
  /** Infrastructure operations - deployments, scaling, service management */
  PLATFORM_ENGINEER: "platform_engineer",
  /** Customer success - scoped to assigned tenants, can manage tenant users */
  ACCOUNT_MANAGER: "account_manager",
  /** Security/compliance team - read-only access to audit logs, compliance reports */
  COMPLIANCE_AUDITOR: "compliance_auditor",
  /** Engineering support - code access, log viewing, production debugging (T3) */
  SUPPORT_TIER_3: "support_tier_3",
  /** Escalation support - cross-tenant access, view-as-user, can edit preferences (T2) */
  SUPPORT_TIER_2: "support_tier_2",
  /** Frontline support - assigned tenants only, read + limited actions (T1) */
  SUPPORT_TIER_1: "support_tier_1",
  /** Read-only access to dashboards and reports */
  VIEWER: "viewer",
} as const

export type AdminRoleType = (typeof AdminRole)[keyof typeof AdminRole]

export const adminRoles: AdminRoleType[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.PLATFORM_ENGINEER,
  AdminRole.ACCOUNT_MANAGER,
  AdminRole.COMPLIANCE_AUDITOR,
  AdminRole.SUPPORT_TIER_3,
  AdminRole.SUPPORT_TIER_2,
  AdminRole.SUPPORT_TIER_1,
  AdminRole.VIEWER,
]

/**
 * Admin user status
 */
export const AdminStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
} as const

export type AdminStatusType = (typeof AdminStatus)[keyof typeof AdminStatus]

/**
 * Admin user interface
 */
export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: AdminRoleType
  status: AdminStatusType
  lastLogin?: string
  createdAt: string
  updatedAt: string
  /** Primary tenant for account managers */
  tenantId?: string
  /** For support roles, the list of assigned tenant IDs they can access */
  assignedTenantIds?: string[]
  /** User-specific permission configuration (additional groups, grants, revocations) */
  permissionConfig?: PermissionConfigType
}

/**
 * Validation schema for creating an admin user
 */
export const createAdminUserSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().min(1).max(100),
  role: z.enum([
    AdminRole.SUPER_ADMIN,
    AdminRole.PLATFORM_ENGINEER,
    AdminRole.ACCOUNT_MANAGER,
    AdminRole.COMPLIANCE_AUDITOR,
    AdminRole.SUPPORT_TIER_3,
    AdminRole.SUPPORT_TIER_2,
    AdminRole.SUPPORT_TIER_1,
    AdminRole.VIEWER,
  ]),
  tenantId: z.string().uuid().optional(),
  /** For support roles, the list of assigned tenant IDs */
  assignedTenantIds: z.array(z.string().uuid()).optional(),
})

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>

/**
 * Validation schema for updating an admin user
 */
export const updateAdminUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  role: z
    .enum([
      AdminRole.SUPER_ADMIN,
      AdminRole.PLATFORM_ENGINEER,
      AdminRole.ACCOUNT_MANAGER,
      AdminRole.COMPLIANCE_AUDITOR,
      AdminRole.SUPPORT_TIER_3,
      AdminRole.SUPPORT_TIER_2,
      AdminRole.SUPPORT_TIER_1,
      AdminRole.VIEWER,
    ])
    .optional(),
  status: z
    .enum([AdminStatus.ACTIVE, AdminStatus.INACTIVE, AdminStatus.PENDING])
    .optional(),
  /** For support roles, the list of assigned tenant IDs */
  assignedTenantIds: z.array(z.string().uuid()).optional(),
})

export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>

// ============================================================================
// View As User Feature - SOC2 Compliant Admin Impersonation
// ============================================================================

/**
 * User preferences that can be viewed/edited by admin
 */
export interface UserPreferences {
  locale: string
  timezone: string
  theme: "light" | "dark" | "system"
  emailNotifications: boolean
  systemAlerts: boolean
  weeklyDigest: boolean
}

/**
 * Extended admin user with preferences for view-as-user feature
 */
export interface ManagedUser extends AdminUser {
  avatarUrl?: string | null
  preferences?: UserPreferences
}

/**
 * Context for admin viewing another user's settings
 */
export interface AdminViewContext {
  /** The user being viewed/edited (null if viewing own settings) */
  viewingUser: ManagedUser | null
  /** Whether admin mode is active */
  isAdminView: boolean
  /** The actual admin user performing the action */
  adminUser: ManagedUser | null
}

/**
 * Audit log entry for SOC2 compliance
 * All admin actions on user data must be logged
 */
export interface AuditLogEntry {
  id: string
  timestamp: string
  /** The admin performing the action */
  actorId: string
  actorEmail: string
  actorRole: AdminRoleType
  /** The action being performed */
  action: AuditAction
  /** The resource type being accessed */
  resourceType: "user_profile" | "user_preferences" | "user_settings"
  /** The user whose data is being accessed */
  targetUserId: string
  targetUserEmail: string
  /** Outcome of the action */
  outcome: "success" | "failure" | "denied"
  /** What was changed (for update actions) */
  changes?: AuditChange[]
  /** Additional context */
  ipAddress?: string
  userAgent?: string
  reason?: string
}

/**
 * Types of auditable actions for view-as-user feature
 */
export type AuditAction =
  | "view_profile"
  | "update_profile"
  | "view_preferences"
  | "update_preferences"
  | "admin_view_start"
  | "admin_view_end"

/**
 * Record of what was changed in an update action
 */
export interface AuditChange {
  field: string
  oldValue: unknown
  newValue: unknown
}

// ============================================================================
// Tenant Management
// ============================================================================

/**
 * Tenant status
 */
export const TenantStatus = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  TRIAL: "trial",
  CANCELLED: "cancelled",
} as const

export type TenantStatusType = (typeof TenantStatus)[keyof typeof TenantStatus]

/**
 * Tenant interface
 */
export interface Tenant {
  id: string
  name: string
  slug: string
  status: TenantStatusType
  plan: string
  maxUsers: number
  maxWorkspaces: number
  createdAt: string
  updatedAt: string
}

/**
 * User's membership in a tenant
 */
export interface TenantMembership {
  id: string
  userId: string
  tenantId: string
  tenant: Tenant
  role: AdminRoleType
  joinedAt: string
  isPrimary: boolean
}

// ============================================================================
// Workspace Management
// ============================================================================

/**
 * Workspace status
 */
export const WorkspaceStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived",
  DELETED: "deleted",
} as const

export type WorkspaceStatusType = (typeof WorkspaceStatus)[keyof typeof WorkspaceStatus]

/**
 * Workspace interface
 */
export interface Workspace {
  id: string
  name: string
  description?: string
  tenantId: string
  tenantName: string
  status: WorkspaceStatusType
  createdAt: string
  updatedAt: string
  deletedAt?: string
  memberCount: number
}

/**
 * User's role in a workspace
 */
export const WorkspaceRole = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const

export type WorkspaceRoleType = (typeof WorkspaceRole)[keyof typeof WorkspaceRole]

/**
 * User's membership in a workspace
 */
export interface WorkspaceMembership {
  id: string
  userId: string
  workspaceId: string
  workspace: Workspace
  role: WorkspaceRoleType
  joinedAt: string
}

// ============================================================================
// Billing & Subscriptions
// ============================================================================

/**
 * Subscription status
 */
export const SubscriptionStatus = {
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELLED: "cancelled",
  TRIALING: "trialing",
  PAUSED: "paused",
  EXPIRED: "expired",
} as const

export type SubscriptionStatusType = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus]

/**
 * Subscription plan type
 */
export const PlanType = {
  FREE: "free",
  STARTER: "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise",
  CUSTOM: "custom",
} as const

export type PlanTypeValue = (typeof PlanType)[keyof typeof PlanType]

/**
 * Subscription interface
 */
export interface Subscription {
  id: string
  userId: string
  tenantId: string
  plan: PlanTypeValue
  status: SubscriptionStatusType
  startDate: string
  endDate?: string
  trialEndDate?: string
  cancelledAt?: string
  amount: number
  currency: string
  interval: "month" | "year"
  isFreeGrant: boolean
  grantReason?: string
  grantedBy?: string
  createdAt: string
  updatedAt: string
}

/**
 * Payment history entry
 */
export interface PaymentHistory {
  id: string
  subscriptionId: string
  amount: number
  currency: string
  status: "succeeded" | "failed" | "pending" | "refunded"
  paymentMethod?: string
  invoiceUrl?: string
  createdAt: string
}

/**
 * Billing info for a user
 */
export interface UserBilling {
  subscriptions: Subscription[]
  payments: PaymentHistory[]
  totalSpent: number
  currentPlan: PlanTypeValue
  nextBillingDate?: string
}
