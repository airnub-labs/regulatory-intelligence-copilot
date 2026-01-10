/**
 * Permission Utilities for Hybrid RBAC
 *
 * This module provides utility functions for checking and calculating permissions.
 * It maintains backward compatibility with the existing permission system while
 * supporting the new hybrid RBAC model.
 */

import {
  Permission,
  type PermissionType,
  type PermissionGroupIdType,
  type AdminRoleType,
  AdminRole,
  roleHierarchy,
  roleDefaults,
  calculateEffectivePermissions,
  type UserPermissionConfig,
  type EffectivePermissions,
} from "../types/permissions"

// Re-export types and constants for convenience
export {
  Permission,
  AdminRole,
  roleHierarchy,
  type PermissionType,
  type PermissionGroupIdType,
  type AdminRoleType,
  type UserPermissionConfig,
  type EffectivePermissions,
}

// =============================================================================
// USER INTERFACE (for permission checking)
// =============================================================================

/**
 * Minimal user interface for permission checking
 */
export interface PermissionUser {
  id: string
  role: AdminRoleType
  tenantId?: string
  assignedTenantIds?: string[]
  permissionConfig?: UserPermissionConfig
}

// =============================================================================
// PERMISSION CHECKING
// =============================================================================

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  user: PermissionUser,
  permission: PermissionType
): boolean {
  const effective = calculateEffectivePermissions(user.role, user.permissionConfig)
  return effective.permissions.has(permission)
}

/**
 * Check if a user has ANY of the specified permissions
 */
export function hasAnyPermission(
  user: PermissionUser,
  permissions: PermissionType[]
): boolean {
  const effective = calculateEffectivePermissions(user.role, user.permissionConfig)
  return permissions.some((p) => effective.permissions.has(p))
}

/**
 * Check if a user has ALL of the specified permissions
 */
export function hasAllPermissions(
  user: PermissionUser,
  permissions: PermissionType[]
): boolean {
  const effective = calculateEffectivePermissions(user.role, user.permissionConfig)
  return permissions.every((p) => effective.permissions.has(p))
}

/**
 * Get all effective permissions for a user
 */
export function getUserPermissions(user: PermissionUser): EffectivePermissions {
  return calculateEffectivePermissions(user.role, user.permissionConfig)
}

/**
 * Check if a role has a specific permission by default
 * (without considering user-specific overrides)
 */
export function roleHasPermission(
  role: AdminRoleType,
  permission: PermissionType
): boolean {
  const effective = calculateEffectivePermissions(role)
  return effective.permissions.has(permission)
}

// =============================================================================
// ROLE HIERARCHY
// =============================================================================

/**
 * Check if actor role is higher than or equal to target role
 */
export function isRoleHigherOrEqual(
  actorRole: AdminRoleType,
  targetRole: AdminRoleType
): boolean {
  return roleHierarchy[actorRole] >= roleHierarchy[targetRole]
}

/**
 * Check if actor role is strictly higher than target role
 */
export function isRoleHigher(
  actorRole: AdminRoleType,
  targetRole: AdminRoleType
): boolean {
  return roleHierarchy[actorRole] > roleHierarchy[targetRole]
}

/**
 * Get all roles that are lower in hierarchy than the given role
 */
export function getLowerRoles(role: AdminRoleType): AdminRoleType[] {
  const level = roleHierarchy[role]
  return Object.entries(roleHierarchy)
    .filter(([, roleLevel]) => roleLevel < level)
    .map(([roleName]) => roleName as AdminRoleType)
}

/**
 * Get roles that an actor can assign to other users
 * (can only assign roles lower than their own)
 */
export function getAssignableRoles(actorRole: AdminRoleType): AdminRoleType[] {
  // Super admin can assign all roles
  if (actorRole === AdminRole.SUPER_ADMIN) {
    return Object.values(AdminRole)
  }

  // Others can only assign roles strictly lower than their own
  return getLowerRoles(actorRole)
}

/**
 * Check if actor can assign a specific role to a user
 */
export function canAssignRole(
  actorRole: AdminRoleType,
  targetRole: AdminRoleType
): boolean {
  // Super admin can assign any role
  if (actorRole === AdminRole.SUPER_ADMIN) return true

  // Must have USERS_EDIT_PERMISSIONS permission
  if (!roleHasPermission(actorRole, Permission.USERS_EDIT_PERMISSIONS)) {
    return false
  }

  // Can only assign roles strictly lower in hierarchy
  return isRoleHigher(actorRole, targetRole)
}

/**
 * Check if actor can manage (edit/delete) a target user
 */
export function canManageUser(
  actorRole: AdminRoleType,
  targetRole: AdminRoleType
): boolean {
  // Super admin can manage everyone
  if (actorRole === AdminRole.SUPER_ADMIN) return true

  // Must have user management permissions
  if (!roleHasPermission(actorRole, Permission.USERS_EDIT)) {
    return false
  }

  // Can only manage users with lower roles
  return isRoleHigher(actorRole, targetRole)
}

// =============================================================================
// TENANT ACCESS
// =============================================================================

/**
 * Check if admin has access to a specific tenant
 */
export function hasAccessToTenant(
  admin: PermissionUser,
  tenantId: string
): boolean {
  // Check for cross-tenant access permission
  if (hasPermission(admin, Permission.TENANTS_VIEW_ALL)) {
    return true
  }

  // Account manager uses primary tenantId
  if (admin.role === AdminRole.ACCOUNT_MANAGER) {
    return admin.tenantId === tenantId
  }

  // Support tiers use assignedTenantIds
  if (
    admin.role === AdminRole.SUPPORT_TIER_1 ||
    admin.role === AdminRole.SUPPORT_TIER_2 ||
    admin.role === AdminRole.SUPPORT_TIER_3
  ) {
    return admin.assignedTenantIds?.includes(tenantId) ?? false
  }

  // Roles with TENANTS_VIEW can access their own tenant
  if (hasPermission(admin, Permission.TENANTS_VIEW)) {
    return admin.tenantId === tenantId
  }

  return false
}

/**
 * Get all tenant IDs accessible to an admin
 * Returns "all" for admins with cross-tenant access
 */
export function getAccessibleTenantIds(
  admin: PermissionUser
): string[] | "all" {
  // Check for cross-tenant access
  if (hasPermission(admin, Permission.TENANTS_VIEW_ALL)) {
    return "all"
  }

  // Account manager: primary tenant only
  if (admin.role === AdminRole.ACCOUNT_MANAGER && admin.tenantId) {
    return [admin.tenantId]
  }

  // Support tiers: assigned tenants
  if (
    admin.role === AdminRole.SUPPORT_TIER_1 ||
    admin.role === AdminRole.SUPPORT_TIER_2 ||
    admin.role === AdminRole.SUPPORT_TIER_3
  ) {
    return admin.assignedTenantIds ?? []
  }

  // Others: own tenant only
  if (admin.tenantId) {
    return [admin.tenantId]
  }

  return []
}

// =============================================================================
// VIEW-AS-USER FUNCTIONALITY
// =============================================================================

/**
 * Check if admin can view as another user
 */
export function canViewAsUser(admin: PermissionUser): boolean {
  return hasPermission(admin, Permission.USERS_VIEW_AS)
}

/**
 * Check if admin can view a specific user's settings
 */
export function canViewUserSettings(
  admin: PermissionUser,
  targetUser: PermissionUser
): boolean {
  // Must have basic user view permission
  if (!hasPermission(admin, Permission.USERS_VIEW)) {
    return false
  }

  // Super admin can view all users
  if (admin.role === AdminRole.SUPER_ADMIN) {
    return true
  }

  // Check for cross-tenant access
  if (hasPermission(admin, Permission.USERS_VIEW_CROSS_TENANT)) {
    return true
  }

  // Otherwise, must have tenant access
  if (targetUser.tenantId) {
    return hasAccessToTenant(admin, targetUser.tenantId)
  }

  return false
}

/**
 * Check if admin can edit a specific user's settings
 */
export function canEditUserSettings(
  admin: PermissionUser,
  targetUser: PermissionUser
): boolean {
  // Must have edit preferences permission
  if (!hasPermission(admin, Permission.USERS_EDIT_PREFERENCES)) {
    return false
  }

  // Super admin can edit all users
  if (admin.role === AdminRole.SUPER_ADMIN) {
    return true
  }

  // Must have view access first
  if (!canViewUserSettings(admin, targetUser)) {
    return false
  }

  // Check if can manage the user's role level
  return canManageUser(admin.role, targetUser.role)
}

// =============================================================================
// PERMISSION AUDIT
// =============================================================================

/**
 * Get a detailed breakdown of where a user's permission comes from
 * Useful for audit logs and debugging
 */
export function getPermissionSource(
  user: PermissionUser,
  permission: PermissionType
): "role" | "group" | "grant" | "none" {
  const effective = getUserPermissions(user)

  if (!effective.permissions.has(permission)) {
    return "none"
  }

  if (effective.sources.fromGrants.includes(permission)) {
    return "grant"
  }

  if (effective.sources.fromAdditionalGroups.includes(permission)) {
    return "group"
  }

  if (effective.sources.fromRole.includes(permission)) {
    return "role"
  }

  return "none"
}

/**
 * Get all permission sources for audit purposes
 */
export function getPermissionAuditInfo(user: PermissionUser): {
  role: AdminRoleType
  roleDefaultGroups: PermissionGroupIdType[]
  additionalGroups: PermissionGroupIdType[]
  individualGrants: PermissionType[]
  individualRevocations: PermissionType[]
  effectivePermissionCount: number
} {
  const effective = getUserPermissions(user)
  const roleConfig = roleDefaults[user.role]

  return {
    role: user.role,
    roleDefaultGroups: roleConfig.defaultGroups,
    additionalGroups: user.permissionConfig?.additionalGroups ?? [],
    individualGrants: user.permissionConfig?.permissionGrants ?? [],
    individualRevocations: user.permissionConfig?.permissionRevocations ?? [],
    effectivePermissionCount: effective.permissions.size,
  }
}

// =============================================================================
// PERMISSION COMPARISON
// =============================================================================

/**
 * Compare two permission sets and return the difference
 */
export function comparePermissions(
  before: Set<PermissionType>,
  after: Set<PermissionType>
): {
  added: PermissionType[]
  removed: PermissionType[]
  unchanged: PermissionType[]
} {
  const added: PermissionType[] = []
  const removed: PermissionType[] = []
  const unchanged: PermissionType[] = []

  // Check for added and unchanged
  for (const permission of after) {
    if (before.has(permission)) {
      unchanged.push(permission)
    } else {
      added.push(permission)
    }
  }

  // Check for removed
  for (const permission of before) {
    if (!after.has(permission)) {
      removed.push(permission)
    }
  }

  return { added, removed, unchanged }
}

/**
 * Calculate what permissions would change if a role change occurs
 */
export function calculateRoleChangeImpact(
  currentRole: AdminRoleType,
  newRole: AdminRoleType,
  config?: UserPermissionConfig
): {
  added: PermissionType[]
  removed: PermissionType[]
} {
  const currentEffective = calculateEffectivePermissions(currentRole, config)
  const newEffective = calculateEffectivePermissions(newRole, config)

  const { added, removed } = comparePermissions(
    currentEffective.permissions,
    newEffective.permissions
  )

  return { added, removed }
}
