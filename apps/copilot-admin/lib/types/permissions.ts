/**
 * Hybrid RBAC Permission System for Copilot Admin
 *
 * Architecture:
 * Permissions (atomic) -> Permission Groups (bundles) -> Roles (templates) -> Users (+ overrides)
 *
 * This follows industry standards from Azure AD, AWS IAM, Okta, and Salesforce
 * while maintaining SOC2/GDPR compliance.
 */

// =============================================================================
// LAYER 1: ATOMIC PERMISSIONS (54 total)
// =============================================================================

/**
 * Atomic permissions follow the naming convention: {category}.{action}
 *
 * Categories:
 * - users: User account management
 * - billing: Financial and subscription operations
 * - infrastructure: Platform infrastructure operations
 * - settings: System configuration
 * - tenants: Tenant/workspace management
 * - conversations: Chat/conversation access
 * - data: Data export and GDPR operations
 * - audit: Audit logs and compliance
 * - reports: Analytics and reporting
 * - dashboard: Dashboard access
 * - escalation: Support escalation paths
 * - support: Support engineering operations
 */
export const Permission = {
  // ========== User Management (10 permissions) ==========
  /** Create new user accounts */
  USERS_CREATE: "users.create",
  /** View user profiles and basic information */
  USERS_VIEW: "users.view",
  /** View users across multiple tenants */
  USERS_VIEW_CROSS_TENANT: "users.view_cross_tenant",
  /** Edit user profile information */
  USERS_EDIT: "users.edit",
  /** Edit user preferences (locale, timezone, theme) */
  USERS_EDIT_PREFERENCES: "users.edit_preferences",
  /** Modify user roles and permissions */
  USERS_EDIT_PERMISSIONS: "users.edit_permissions",
  /** Delete user accounts */
  USERS_DELETE: "users.delete",
  /** Unlock locked user accounts */
  USERS_UNLOCK_ACCOUNT: "users.unlock_account",
  /** Send invitations to new users */
  USERS_INVITE: "users.invite",
  /** View as another user (read-only impersonation) */
  USERS_VIEW_AS: "users.view_as",

  // ========== Billing & Finance (6 permissions) ==========
  /** View billing invoices and history */
  BILLING_VIEW_INVOICES: "billing.view_invoices",
  /** Upgrade/downgrade subscription plans */
  BILLING_MANAGE_SUBSCRIPTIONS: "billing.manage_subscriptions",
  /** Add/remove payment methods */
  BILLING_MANAGE_PAYMENT_METHODS: "billing.manage_payment_methods",
  /** View current usage metrics */
  BILLING_VIEW_USAGE: "billing.view_usage",
  /** Export billing data and reports */
  BILLING_EXPORT_REPORTS: "billing.export_reports",
  /** Grant subscription credits or extensions */
  BILLING_GRANT_CREDITS: "billing.grant_credits",

  // ========== Infrastructure (4 permissions) ==========
  /** View infrastructure metrics and status */
  INFRASTRUCTURE_VIEW: "infrastructure.view",
  /** Manage infrastructure configuration */
  INFRASTRUCTURE_MANAGE: "infrastructure.manage",
  /** View service health and uptime */
  INFRASTRUCTURE_VIEW_HEALTH: "infrastructure.view_health",
  /** Manage feature flags and toggles */
  INFRASTRUCTURE_MANAGE_FEATURES: "infrastructure.manage_features",

  // ========== Settings (4 permissions) ==========
  /** View system settings */
  SETTINGS_VIEW: "settings.view",
  /** Manage system settings */
  SETTINGS_MANAGE: "settings.manage",
  /** Manage API keys and tokens */
  SETTINGS_MANAGE_API_KEYS: "settings.manage_api_keys",
  /** View API keys (masked) */
  SETTINGS_VIEW_API_KEYS: "settings.view_api_keys",

  // ========== Tenant Management (6 permissions) ==========
  /** View tenant information */
  TENANTS_VIEW: "tenants.view",
  /** View all tenants across the platform */
  TENANTS_VIEW_ALL: "tenants.view_all",
  /** Manage tenant settings and configuration */
  TENANTS_MANAGE: "tenants.manage",
  /** Create new tenants */
  TENANTS_CREATE: "tenants.create",
  /** Delete tenants */
  TENANTS_DELETE: "tenants.delete",
  /** View tenant metadata for escalation context */
  TENANTS_VIEW_METADATA: "tenants.view_metadata",

  // ========== Conversations (5 permissions) ==========
  /** View conversation metadata */
  CONVERSATIONS_VIEW: "conversations.view",
  /** View conversation message content */
  CONVERSATIONS_VIEW_CONTENT: "conversations.view_content",
  /** Add annotations/notes to conversations */
  CONVERSATIONS_ANNOTATE: "conversations.annotate",
  /** Delete conversations */
  CONVERSATIONS_DELETE: "conversations.delete",
  /** Export conversation data */
  CONVERSATIONS_EXPORT: "conversations.export",

  // ========== Data Export & GDPR (4 permissions) ==========
  /** Export user data (GDPR Article 15) */
  DATA_EXPORT_USER: "data.export_user",
  /** Export audit logs */
  DATA_EXPORT_AUDIT: "data.export_audit",
  /** Delete user data (GDPR Article 17) */
  DATA_DELETE_USER: "data.delete_user",
  /** View data processing activities */
  DATA_VIEW_PROCESSING: "data.view_processing",

  // ========== Audit & Compliance (4 permissions) ==========
  /** View audit logs */
  AUDIT_VIEW: "audit.view",
  /** Export audit logs */
  AUDIT_EXPORT: "audit.export",
  /** Configure audit settings */
  AUDIT_CONFIGURE: "audit.configure",
  /** View compliance reports */
  AUDIT_VIEW_COMPLIANCE: "audit.view_compliance",

  // ========== Reports & Analytics (4 permissions) ==========
  /** View analytics reports */
  REPORTS_VIEW: "reports.view",
  /** Export report data */
  REPORTS_EXPORT: "reports.export",
  /** Create custom reports */
  REPORTS_CREATE: "reports.create",
  /** Schedule recurring reports */
  REPORTS_SCHEDULE: "reports.schedule",

  // ========== Dashboard (2 permissions) ==========
  /** View dashboard */
  DASHBOARD_VIEW: "dashboard.view",
  /** Customize dashboard layout */
  DASHBOARD_CUSTOMIZE: "dashboard.customize",

  // ========== Escalation (4 permissions) ==========
  /** Escalate to Tier 2 support */
  ESCALATION_TO_TIER2: "escalation.to_tier2",
  /** Escalate to Tier 3 support */
  ESCALATION_TO_TIER3: "escalation.to_tier3",
  /** Escalate to engineering team */
  ESCALATION_TO_ENGINEERING: "escalation.to_engineering",
  /** Receive escalated tickets */
  ESCALATION_RECEIVE: "escalation.receive",

  // ========== Support Operations (5 permissions) ==========
  /** View application logs */
  SUPPORT_VIEW_LOGS: "support.view_logs",
  /** Execute debug queries */
  SUPPORT_DEBUG_QUERIES: "support.debug_queries",
  /** Access production environment for support */
  SUPPORT_PROD_ACCESS: "support.prod_access",
  /** Access codebase for debugging */
  SUPPORT_CODE_ACCESS: "support.code_access",
  /** Deploy hotfixes */
  SUPPORT_HOTFIX: "support.hotfix",
} as const

export type PermissionType = (typeof Permission)[keyof typeof Permission]

/**
 * All permission values as an array
 */
export const allPermissions: PermissionType[] = Object.values(Permission)

/**
 * Permission categories for UI grouping
 */
export const PermissionCategory = {
  USERS: "users",
  BILLING: "billing",
  INFRASTRUCTURE: "infrastructure",
  SETTINGS: "settings",
  TENANTS: "tenants",
  CONVERSATIONS: "conversations",
  DATA: "data",
  AUDIT: "audit",
  REPORTS: "reports",
  DASHBOARD: "dashboard",
  ESCALATION: "escalation",
  SUPPORT: "support",
} as const

export type PermissionCategoryType =
  (typeof PermissionCategory)[keyof typeof PermissionCategory]

/**
 * Get category from permission string
 */
export function getPermissionCategory(
  permission: PermissionType
): PermissionCategoryType {
  const category = permission.split(".")[0]
  return category as PermissionCategoryType
}

/**
 * Group permissions by category
 */
export function groupPermissionsByCategory(): Record<
  PermissionCategoryType,
  PermissionType[]
> {
  const grouped: Record<PermissionCategoryType, PermissionType[]> = {
    users: [],
    billing: [],
    infrastructure: [],
    settings: [],
    tenants: [],
    conversations: [],
    data: [],
    audit: [],
    reports: [],
    dashboard: [],
    escalation: [],
    support: [],
  }

  for (const permission of allPermissions) {
    const category = getPermissionCategory(permission)
    grouped[category].push(permission)
  }

  return grouped
}

// =============================================================================
// LAYER 2: PERMISSION GROUPS (26 total)
// =============================================================================

/**
 * Permission Group IDs
 */
export const PermissionGroupId = {
  // User Management Groups
  USER_MANAGEMENT_FULL: "user_management_full",
  USER_MANAGEMENT_READ: "user_management_read",
  USER_SUPPORT_BASIC: "user_support_basic",
  USER_SUPPORT_ADVANCED: "user_support_advanced",

  // Billing Groups
  BILLING_FULL: "billing_full",
  BILLING_READ: "billing_read",

  // Infrastructure Groups
  INFRASTRUCTURE_FULL: "infrastructure_full",
  INFRASTRUCTURE_READ: "infrastructure_read",

  // Tenant Groups
  TENANT_MANAGEMENT_FULL: "tenant_management_full",
  TENANT_VIEW_ALL: "tenant_view_all",
  TENANT_VIEW_ASSIGNED: "tenant_view_assigned",
  CROSS_TENANT_ACCESS: "cross_tenant_access",

  // Data & Compliance Groups
  DATA_EXPORT: "data_export",
  AUDIT_FULL: "audit_full",
  AUDIT_READ: "audit_read",
  COMPLIANCE_REPORTING: "compliance_reporting",

  // Conversation Groups
  CONVERSATION_FULL: "conversation_full",
  CONVERSATION_READ: "conversation_read",
  CONVERSATION_SUPPORT: "conversation_support",

  // Report Groups
  REPORTS_FULL: "reports_full",
  REPORTS_READ: "reports_read",

  // Support Engineering Groups
  SUPPORT_ENGINEERING: "support_engineering",
  SUPPORT_TIER3_OPS: "support_tier3_ops",

  // Dashboard Groups
  DASHBOARD_FULL: "dashboard_full",
  DASHBOARD_READ: "dashboard_read",

  // Escalation Groups
  ESCALATION_TIER1: "escalation_tier1",
  ESCALATION_TIER2: "escalation_tier2",
  ESCALATION_TIER3: "escalation_tier3",
} as const

export type PermissionGroupIdType =
  (typeof PermissionGroupId)[keyof typeof PermissionGroupId]

/**
 * Permission Group definition
 */
export interface PermissionGroupDefinition {
  id: PermissionGroupIdType
  category: "user" | "billing" | "infrastructure" | "tenant" | "data" | "conversation" | "report" | "dashboard" | "escalation" | "support"
  permissions: PermissionType[]
}

/**
 * Permission Group definitions with their bundled permissions
 */
export const PermissionGroups: Record<
  PermissionGroupIdType,
  PermissionGroupDefinition
> = {
  // ========== User Management Groups ==========
  [PermissionGroupId.USER_MANAGEMENT_FULL]: {
    id: PermissionGroupId.USER_MANAGEMENT_FULL,
    category: "user",
    permissions: [
      Permission.USERS_CREATE,
      Permission.USERS_VIEW,
      Permission.USERS_VIEW_CROSS_TENANT,
      Permission.USERS_EDIT,
      Permission.USERS_EDIT_PREFERENCES,
      Permission.USERS_EDIT_PERMISSIONS,
      Permission.USERS_DELETE,
      Permission.USERS_UNLOCK_ACCOUNT,
      Permission.USERS_INVITE,
      Permission.USERS_VIEW_AS,
    ],
  },
  [PermissionGroupId.USER_MANAGEMENT_READ]: {
    id: PermissionGroupId.USER_MANAGEMENT_READ,
    category: "user",
    permissions: [Permission.USERS_VIEW],
  },
  [PermissionGroupId.USER_SUPPORT_BASIC]: {
    id: PermissionGroupId.USER_SUPPORT_BASIC,
    category: "user",
    permissions: [Permission.USERS_VIEW],
  },
  [PermissionGroupId.USER_SUPPORT_ADVANCED]: {
    id: PermissionGroupId.USER_SUPPORT_ADVANCED,
    category: "user",
    permissions: [
      Permission.USERS_VIEW,
      Permission.USERS_VIEW_CROSS_TENANT,
      Permission.USERS_EDIT_PREFERENCES,
      Permission.USERS_UNLOCK_ACCOUNT,
      Permission.USERS_VIEW_AS,
    ],
  },

  // ========== Billing Groups ==========
  [PermissionGroupId.BILLING_FULL]: {
    id: PermissionGroupId.BILLING_FULL,
    category: "billing",
    permissions: [
      Permission.BILLING_VIEW_INVOICES,
      Permission.BILLING_MANAGE_SUBSCRIPTIONS,
      Permission.BILLING_MANAGE_PAYMENT_METHODS,
      Permission.BILLING_VIEW_USAGE,
      Permission.BILLING_EXPORT_REPORTS,
      Permission.BILLING_GRANT_CREDITS,
    ],
  },
  [PermissionGroupId.BILLING_READ]: {
    id: PermissionGroupId.BILLING_READ,
    category: "billing",
    permissions: [
      Permission.BILLING_VIEW_INVOICES,
      Permission.BILLING_VIEW_USAGE,
    ],
  },

  // ========== Infrastructure Groups ==========
  [PermissionGroupId.INFRASTRUCTURE_FULL]: {
    id: PermissionGroupId.INFRASTRUCTURE_FULL,
    category: "infrastructure",
    permissions: [
      Permission.INFRASTRUCTURE_VIEW,
      Permission.INFRASTRUCTURE_MANAGE,
      Permission.INFRASTRUCTURE_VIEW_HEALTH,
      Permission.INFRASTRUCTURE_MANAGE_FEATURES,
    ],
  },
  [PermissionGroupId.INFRASTRUCTURE_READ]: {
    id: PermissionGroupId.INFRASTRUCTURE_READ,
    category: "infrastructure",
    permissions: [
      Permission.INFRASTRUCTURE_VIEW,
      Permission.INFRASTRUCTURE_VIEW_HEALTH,
    ],
  },

  // ========== Tenant Groups ==========
  [PermissionGroupId.TENANT_MANAGEMENT_FULL]: {
    id: PermissionGroupId.TENANT_MANAGEMENT_FULL,
    category: "tenant",
    permissions: [
      Permission.TENANTS_VIEW,
      Permission.TENANTS_VIEW_ALL,
      Permission.TENANTS_MANAGE,
      Permission.TENANTS_CREATE,
      Permission.TENANTS_DELETE,
      Permission.TENANTS_VIEW_METADATA,
    ],
  },
  [PermissionGroupId.TENANT_VIEW_ALL]: {
    id: PermissionGroupId.TENANT_VIEW_ALL,
    category: "tenant",
    permissions: [
      Permission.TENANTS_VIEW,
      Permission.TENANTS_VIEW_ALL,
      Permission.TENANTS_VIEW_METADATA,
    ],
  },
  [PermissionGroupId.TENANT_VIEW_ASSIGNED]: {
    id: PermissionGroupId.TENANT_VIEW_ASSIGNED,
    category: "tenant",
    permissions: [Permission.TENANTS_VIEW, Permission.TENANTS_VIEW_METADATA],
  },
  [PermissionGroupId.CROSS_TENANT_ACCESS]: {
    id: PermissionGroupId.CROSS_TENANT_ACCESS,
    category: "tenant",
    permissions: [
      Permission.USERS_VIEW_CROSS_TENANT,
      Permission.TENANTS_VIEW_ALL,
      Permission.TENANTS_VIEW_METADATA,
    ],
  },

  // ========== Data & Compliance Groups ==========
  [PermissionGroupId.DATA_EXPORT]: {
    id: PermissionGroupId.DATA_EXPORT,
    category: "data",
    permissions: [
      Permission.DATA_EXPORT_USER,
      Permission.DATA_EXPORT_AUDIT,
      Permission.DATA_VIEW_PROCESSING,
    ],
  },
  [PermissionGroupId.AUDIT_FULL]: {
    id: PermissionGroupId.AUDIT_FULL,
    category: "data",
    permissions: [
      Permission.AUDIT_VIEW,
      Permission.AUDIT_EXPORT,
      Permission.AUDIT_CONFIGURE,
      Permission.AUDIT_VIEW_COMPLIANCE,
    ],
  },
  [PermissionGroupId.AUDIT_READ]: {
    id: PermissionGroupId.AUDIT_READ,
    category: "data",
    permissions: [Permission.AUDIT_VIEW],
  },
  [PermissionGroupId.COMPLIANCE_REPORTING]: {
    id: PermissionGroupId.COMPLIANCE_REPORTING,
    category: "data",
    permissions: [
      Permission.AUDIT_VIEW,
      Permission.AUDIT_EXPORT,
      Permission.AUDIT_VIEW_COMPLIANCE,
      Permission.DATA_VIEW_PROCESSING,
    ],
  },

  // ========== Conversation Groups ==========
  [PermissionGroupId.CONVERSATION_FULL]: {
    id: PermissionGroupId.CONVERSATION_FULL,
    category: "conversation",
    permissions: [
      Permission.CONVERSATIONS_VIEW,
      Permission.CONVERSATIONS_VIEW_CONTENT,
      Permission.CONVERSATIONS_ANNOTATE,
      Permission.CONVERSATIONS_DELETE,
      Permission.CONVERSATIONS_EXPORT,
    ],
  },
  [PermissionGroupId.CONVERSATION_READ]: {
    id: PermissionGroupId.CONVERSATION_READ,
    category: "conversation",
    permissions: [
      Permission.CONVERSATIONS_VIEW,
      Permission.CONVERSATIONS_VIEW_CONTENT,
    ],
  },
  [PermissionGroupId.CONVERSATION_SUPPORT]: {
    id: PermissionGroupId.CONVERSATION_SUPPORT,
    category: "conversation",
    permissions: [
      Permission.CONVERSATIONS_VIEW,
      Permission.CONVERSATIONS_VIEW_CONTENT,
      Permission.CONVERSATIONS_ANNOTATE,
    ],
  },

  // ========== Report Groups ==========
  [PermissionGroupId.REPORTS_FULL]: {
    id: PermissionGroupId.REPORTS_FULL,
    category: "report",
    permissions: [
      Permission.REPORTS_VIEW,
      Permission.REPORTS_EXPORT,
      Permission.REPORTS_CREATE,
      Permission.REPORTS_SCHEDULE,
    ],
  },
  [PermissionGroupId.REPORTS_READ]: {
    id: PermissionGroupId.REPORTS_READ,
    category: "report",
    permissions: [Permission.REPORTS_VIEW],
  },

  // ========== Support Engineering Groups ==========
  [PermissionGroupId.SUPPORT_ENGINEERING]: {
    id: PermissionGroupId.SUPPORT_ENGINEERING,
    category: "support",
    permissions: [
      Permission.SUPPORT_VIEW_LOGS,
      Permission.SUPPORT_DEBUG_QUERIES,
      Permission.SUPPORT_CODE_ACCESS,
    ],
  },
  [PermissionGroupId.SUPPORT_TIER3_OPS]: {
    id: PermissionGroupId.SUPPORT_TIER3_OPS,
    category: "support",
    permissions: [
      Permission.SUPPORT_VIEW_LOGS,
      Permission.SUPPORT_DEBUG_QUERIES,
      Permission.SUPPORT_PROD_ACCESS,
      Permission.SUPPORT_CODE_ACCESS,
      Permission.SUPPORT_HOTFIX,
    ],
  },

  // ========== Dashboard Groups ==========
  [PermissionGroupId.DASHBOARD_FULL]: {
    id: PermissionGroupId.DASHBOARD_FULL,
    category: "dashboard",
    permissions: [Permission.DASHBOARD_VIEW, Permission.DASHBOARD_CUSTOMIZE],
  },
  [PermissionGroupId.DASHBOARD_READ]: {
    id: PermissionGroupId.DASHBOARD_READ,
    category: "dashboard",
    permissions: [Permission.DASHBOARD_VIEW],
  },

  // ========== Escalation Groups ==========
  [PermissionGroupId.ESCALATION_TIER1]: {
    id: PermissionGroupId.ESCALATION_TIER1,
    category: "escalation",
    permissions: [Permission.ESCALATION_TO_TIER2],
  },
  [PermissionGroupId.ESCALATION_TIER2]: {
    id: PermissionGroupId.ESCALATION_TIER2,
    category: "escalation",
    permissions: [
      Permission.ESCALATION_TO_TIER3,
      Permission.ESCALATION_RECEIVE,
    ],
  },
  [PermissionGroupId.ESCALATION_TIER3]: {
    id: PermissionGroupId.ESCALATION_TIER3,
    category: "escalation",
    permissions: [
      Permission.ESCALATION_TO_ENGINEERING,
      Permission.ESCALATION_RECEIVE,
    ],
  },
}

/**
 * Get permissions for a group
 */
export function getGroupPermissions(
  groupId: PermissionGroupIdType
): PermissionType[] {
  return PermissionGroups[groupId]?.permissions ?? []
}

/**
 * Get permissions from multiple groups (deduplicated)
 */
export function getGroupsPermissions(
  groupIds: PermissionGroupIdType[]
): PermissionType[] {
  const permissions = new Set<PermissionType>()
  for (const groupId of groupIds) {
    for (const permission of getGroupPermissions(groupId)) {
      permissions.add(permission)
    }
  }
  return Array.from(permissions)
}

// =============================================================================
// LAYER 3: ROLE -> PERMISSION GROUP DEFAULTS
// =============================================================================

/**
 * Admin roles with their hierarchy levels
 */
export const AdminRole = {
  /** Level 8 - Full platform access */
  SUPER_ADMIN: "super_admin",
  /** Level 7 - Infrastructure operations */
  PLATFORM_ENGINEER: "platform_engineer",
  /** Level 6 - Customer success, tenant-scoped */
  ACCOUNT_MANAGER: "account_manager",
  /** Level 5 - Audit logs, compliance reports */
  COMPLIANCE_AUDITOR: "compliance_auditor",
  /** Level 4 - Engineering support (T3) */
  SUPPORT_TIER_3: "support_tier_3",
  /** Level 3 - Escalation support (T2) */
  SUPPORT_TIER_2: "support_tier_2",
  /** Level 2 - Frontline support (T1) */
  SUPPORT_TIER_1: "support_tier_1",
  /** Level 1 - Read-only dashboards */
  VIEWER: "viewer",
} as const

export type AdminRoleType = (typeof AdminRole)[keyof typeof AdminRole]

/**
 * Role hierarchy levels (higher number = more access)
 */
export const roleHierarchy: Record<AdminRoleType, number> = {
  [AdminRole.SUPER_ADMIN]: 8,
  [AdminRole.PLATFORM_ENGINEER]: 7,
  [AdminRole.ACCOUNT_MANAGER]: 6,
  [AdminRole.COMPLIANCE_AUDITOR]: 5,
  [AdminRole.SUPPORT_TIER_3]: 4,
  [AdminRole.SUPPORT_TIER_2]: 3,
  [AdminRole.SUPPORT_TIER_1]: 2,
  [AdminRole.VIEWER]: 1,
}

/**
 * Role default configuration
 */
export interface RoleDefaultConfig {
  /** Permission groups included by default */
  defaultGroups: PermissionGroupIdType[]
  /** Additional individual permissions beyond groups */
  additionalPermissions: PermissionType[]
  /** Whether this role has all permissions (super admin only) */
  hasAllPermissions?: boolean
}

/**
 * Default permission groups and permissions for each role
 */
export const roleDefaults: Record<AdminRoleType, RoleDefaultConfig> = {
  [AdminRole.SUPER_ADMIN]: {
    defaultGroups: [],
    additionalPermissions: [],
    hasAllPermissions: true,
  },
  [AdminRole.PLATFORM_ENGINEER]: {
    defaultGroups: [
      PermissionGroupId.INFRASTRUCTURE_FULL,
      PermissionGroupId.AUDIT_READ,
      PermissionGroupId.REPORTS_READ,
      PermissionGroupId.DASHBOARD_READ,
    ],
    additionalPermissions: [Permission.SETTINGS_VIEW],
  },
  [AdminRole.ACCOUNT_MANAGER]: {
    defaultGroups: [
      PermissionGroupId.USER_MANAGEMENT_READ,
      PermissionGroupId.TENANT_VIEW_ASSIGNED,
      PermissionGroupId.CONVERSATION_SUPPORT,
      PermissionGroupId.REPORTS_READ,
      PermissionGroupId.DASHBOARD_READ,
    ],
    additionalPermissions: [
      Permission.USERS_EDIT,
      Permission.USERS_EDIT_PREFERENCES,
      Permission.USERS_INVITE,
      Permission.SETTINGS_VIEW,
      Permission.AUDIT_VIEW,
    ],
  },
  [AdminRole.COMPLIANCE_AUDITOR]: {
    defaultGroups: [
      PermissionGroupId.AUDIT_FULL,
      PermissionGroupId.COMPLIANCE_REPORTING,
      PermissionGroupId.TENANT_VIEW_ALL,
      PermissionGroupId.DASHBOARD_READ,
    ],
    additionalPermissions: [],
  },
  [AdminRole.SUPPORT_TIER_3]: {
    defaultGroups: [
      PermissionGroupId.USER_SUPPORT_ADVANCED,
      PermissionGroupId.SUPPORT_TIER3_OPS,
      PermissionGroupId.CROSS_TENANT_ACCESS,
      PermissionGroupId.DATA_EXPORT,
      PermissionGroupId.CONVERSATION_SUPPORT,
      PermissionGroupId.ESCALATION_TIER3,
      PermissionGroupId.DASHBOARD_READ,
      PermissionGroupId.REPORTS_READ,
    ],
    additionalPermissions: [
      Permission.BILLING_VIEW_INVOICES,
      Permission.INFRASTRUCTURE_VIEW_HEALTH,
      Permission.AUDIT_VIEW,
    ],
  },
  [AdminRole.SUPPORT_TIER_2]: {
    defaultGroups: [
      PermissionGroupId.USER_SUPPORT_ADVANCED,
      PermissionGroupId.CROSS_TENANT_ACCESS,
      PermissionGroupId.DATA_EXPORT,
      PermissionGroupId.CONVERSATION_SUPPORT,
      PermissionGroupId.ESCALATION_TIER2,
      PermissionGroupId.DASHBOARD_READ,
      PermissionGroupId.REPORTS_READ,
    ],
    additionalPermissions: [
      Permission.BILLING_VIEW_INVOICES,
      Permission.AUDIT_VIEW,
    ],
  },
  [AdminRole.SUPPORT_TIER_1]: {
    defaultGroups: [
      PermissionGroupId.USER_SUPPORT_BASIC,
      PermissionGroupId.TENANT_VIEW_ASSIGNED,
      PermissionGroupId.CONVERSATION_READ,
      PermissionGroupId.ESCALATION_TIER1,
      PermissionGroupId.DASHBOARD_READ,
      PermissionGroupId.REPORTS_READ,
    ],
    additionalPermissions: [Permission.TENANTS_VIEW_METADATA],
  },
  [AdminRole.VIEWER]: {
    defaultGroups: [
      PermissionGroupId.DASHBOARD_READ,
      PermissionGroupId.REPORTS_READ,
    ],
    additionalPermissions: [],
  },
}

/**
 * Get default permissions for a role
 */
export function getRoleDefaultPermissions(role: AdminRoleType): PermissionType[] {
  const config = roleDefaults[role]

  // Super admin has all permissions
  if (config.hasAllPermissions) {
    return [...allPermissions]
  }

  // Combine group permissions and additional permissions
  const permissions = new Set<PermissionType>()

  // Add permissions from default groups
  for (const groupId of config.defaultGroups) {
    for (const permission of getGroupPermissions(groupId)) {
      permissions.add(permission)
    }
  }

  // Add additional individual permissions
  for (const permission of config.additionalPermissions) {
    permissions.add(permission)
  }

  return Array.from(permissions)
}

// =============================================================================
// LAYER 4: USER PERMISSION CONFIGURATION
// =============================================================================

/**
 * Per-user permission configuration for overrides
 */
export interface UserPermissionConfig {
  /** Additional permission groups beyond role defaults */
  additionalGroups: PermissionGroupIdType[]
  /** Individual permissions granted beyond role and groups */
  permissionGrants: PermissionType[]
  /** Individual permissions revoked from role and groups */
  permissionRevocations: PermissionType[]
  /** When the config was last updated */
  updatedAt: string
  /** Who updated the config */
  updatedBy: string
}

/**
 * Create an empty user permission config
 */
export function createEmptyPermissionConfig(): UserPermissionConfig {
  return {
    additionalGroups: [],
    permissionGrants: [],
    permissionRevocations: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "",
  }
}

/**
 * Effective permissions result
 */
export interface EffectivePermissions {
  /** All permissions the user has access to */
  permissions: Set<PermissionType>
  /** Permission groups the user has (from role + additional) */
  groups: PermissionGroupIdType[]
  /** Whether the user has all permissions (super admin) */
  hasAllPermissions: boolean
  /** Source breakdown for audit */
  sources: {
    fromRole: PermissionType[]
    fromAdditionalGroups: PermissionType[]
    fromGrants: PermissionType[]
    revoked: PermissionType[]
  }
}

/**
 * Calculate effective permissions for a user
 */
export function calculateEffectivePermissions(
  role: AdminRoleType,
  config?: UserPermissionConfig
): EffectivePermissions {
  const roleConfig = roleDefaults[role]

  // Super admin has all permissions
  if (roleConfig.hasAllPermissions) {
    return {
      permissions: new Set(allPermissions),
      groups: [],
      hasAllPermissions: true,
      sources: {
        fromRole: [...allPermissions],
        fromAdditionalGroups: [],
        fromGrants: [],
        revoked: [],
      },
    }
  }

  // Start with role default permissions
  const fromRole = getRoleDefaultPermissions(role)
  const permissions = new Set<PermissionType>(fromRole)

  // Track all groups
  const allGroups = [...roleConfig.defaultGroups]

  // Add from additional groups
  const fromAdditionalGroups: PermissionType[] = []
  if (config?.additionalGroups) {
    for (const groupId of config.additionalGroups) {
      allGroups.push(groupId)
      for (const permission of getGroupPermissions(groupId)) {
        if (!permissions.has(permission)) {
          fromAdditionalGroups.push(permission)
        }
        permissions.add(permission)
      }
    }
  }

  // Add individual grants
  const fromGrants: PermissionType[] = []
  if (config?.permissionGrants) {
    for (const permission of config.permissionGrants) {
      if (!permissions.has(permission)) {
        fromGrants.push(permission)
      }
      permissions.add(permission)
    }
  }

  // Remove revocations
  const revoked: PermissionType[] = []
  if (config?.permissionRevocations) {
    for (const permission of config.permissionRevocations) {
      if (permissions.has(permission)) {
        revoked.push(permission)
        permissions.delete(permission)
      }
    }
  }

  return {
    permissions,
    groups: allGroups,
    hasAllPermissions: false,
    sources: {
      fromRole,
      fromAdditionalGroups,
      fromGrants,
      revoked,
    },
  }
}
