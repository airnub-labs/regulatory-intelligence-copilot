/**
 * Supabase RPC Function Response Types
 *
 * Type definitions for all custom PostgreSQL functions called via supabase.rpc()
 * These types ensure type safety when calling RPC functions without using `any`.
 *
 * @see /docs/architecture/multi-tenant/README.md
 */

/**
 * Result from verify_tenant_access RPC function
 * Used to check if a user has access to a specific tenant and their role
 */
export interface TenantAccessResult {
  has_access: boolean;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

/**
 * Result from invite_user_to_workspace RPC function
 * Returns invitation details including invite URL and expiration
 */
export interface InvitationResult {
  success: boolean;
  error?: string;
  invitation_id?: string;
  email?: string;
  role?: string;
  workspace_name?: string;
  invite_url?: string;
  expires_at?: string;
}

/**
 * Result from get_user_tenants RPC function
 * Returns list of tenants/workspaces the user has access to
 */
export interface UserTenantResult {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_type: 'personal' | 'team' | 'enterprise';
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  joined_at: string;
}

/**
 * Result from query performance monitoring RPC functions
 * Used for tracking slow queries and tenant-specific performance
 */
export interface QueryPerformanceStats {
  query_type: string;
  table_name: string | null;
  avg_execution_time_ms: number;
  max_execution_time_ms: number;
  query_count: number;
  slowest_tenant_id: string | null;
}

/**
 * Result from get_pending_membership_events RPC function
 * Returns workspace membership change events for a user
 */
export interface MembershipEventResult {
  event_id: string;
  tenant_id: string;
  tenant_name: string;
  event_type: 'added' | 'removed' | 'role_changed' | 'suspended' | 'reactivated' | 'status_changed';
  old_role?: string;
  new_role?: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
}

/**
 * Result from session/tenant consistency check RPC functions
 * Used in middleware to detect JWT/database mismatches
 */
export type CurrentTenantIdResult = string | null;

/**
 * Generic RPC error structure
 * Supabase RPC calls can return errors in this format
 */
export interface RpcError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}
