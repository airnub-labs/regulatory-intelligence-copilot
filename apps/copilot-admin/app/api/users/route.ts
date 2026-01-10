import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * GET /api/users
 *
 * List all users with optional type filter.
 *
 * Query parameters:
 * - type: 'platform' | 'admin' | undefined (default: all platform users)
 *
 * Platform users are fetched from auth.users with tenant memberships.
 * Admin users are fetched from copilot_core.platform_admins.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "platform"

    const supabase = createAdminClient()

    // Handle admin users query
    if (type === "admin") {
      return getAdminUsers(supabase)
    }

    // Default: platform users
    return getPlatformUsers(supabase)
  } catch (error) {
    console.error("Error in users API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * Fetch admin users from copilot_core.platform_admins
 */
async function getAdminUsers(supabase: ReturnType<typeof createAdminClient>) {
  const { data: adminUsers, error } = await supabase
    .schema("copilot_core")
    .from("platform_admins")
    .select(`
      id,
      email,
      display_name,
      role,
      status,
      tenant_id,
      assigned_tenant_ids,
      created_at,
      updated_at,
      last_login
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching admin users:", error)
    return NextResponse.json(
      { error: "Failed to fetch admin users", details: error.message },
      { status: 500 }
    )
  }

  // Transform the data to match the frontend interface
  const transformedUsers = (adminUsers ?? []).map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.display_name ?? user.email.split("@")[0],
    role: user.role,
    status: user.status,
    tenantId: user.tenant_id,
    assignedTenantIds: user.assigned_tenant_ids ?? [],
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLogin: user.last_login,
    tenantAccess: [],
    userType: "admin" as const,
  }))

  return NextResponse.json({ users: transformedUsers })
}

/**
 * Fetch platform users from auth.users with tenant memberships
 */
async function getPlatformUsers(supabase: ReturnType<typeof createAdminClient>) {
  // Fetch all users from auth.users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()

  if (authError) {
    console.error("Error fetching auth users:", authError)
    return NextResponse.json(
      { error: "Failed to fetch users", details: authError.message },
      { status: 500 }
    )
  }

  // Get all tenant memberships with tenant info
  const { data: memberships, error: membershipError } = await supabase
    .schema("copilot_core")
    .from("tenant_memberships")
    .select(`
      id,
      tenant_id,
      user_id,
      role,
      status,
      invited_by,
      invited_at,
      joined_at,
      created_at,
      updated_at
    `)
    .in("status", ["active", "pending"])

  if (membershipError) {
    console.error("Error fetching memberships:", membershipError)
    return NextResponse.json(
      { error: "Failed to fetch memberships", details: membershipError.message },
      { status: 500 }
    )
  }

  // Get all tenants
  const { data: tenants, error: tenantsError } = await supabase
    .schema("copilot_core")
    .from("tenants")
    .select(`
      id,
      name,
      slug,
      type,
      owner_id,
      plan,
      created_at
    `)
    .is("deleted_at", null)

  if (tenantsError) {
    console.error("Error fetching tenants:", tenantsError)
    return NextResponse.json(
      { error: "Failed to fetch tenants", details: tenantsError.message },
      { status: 500 }
    )
  }

  // Get user preferences
  const { data: preferences, error: prefsError } = await supabase
    .schema("copilot_core")
    .from("user_preferences")
    .select(`
      user_id,
      current_tenant_id,
      preferences,
      created_at,
      updated_at
    `)

  if (prefsError) {
    console.error("Error fetching preferences:", prefsError)
    // Continue without preferences - not critical
  }

  // Create lookup maps
  const tenantMap = new Map(tenants?.map((t) => [t.id, t]) ?? [])
  const prefsMap = new Map(preferences?.map((p) => [p.user_id, p]) ?? [])

  // Group memberships by user
  const membershipsByUser = new Map<string, typeof memberships>()
  for (const membership of memberships ?? []) {
    const userId = membership.user_id
    if (!membershipsByUser.has(userId)) {
      membershipsByUser.set(userId, [])
    }
    membershipsByUser.get(userId)!.push(membership)
  }

  // Transform users data
  const users = authUsers.users.map((user) => {
    const userMemberships = membershipsByUser.get(user.id) ?? []
    const userPrefs = prefsMap.get(user.id)

    // Map tenant roles
    const tenantRoles = userMemberships.map((m) => {
      const tenant = tenantMap.get(m.tenant_id)
      const isPrimary = userPrefs?.current_tenant_id === m.tenant_id

      return {
        tenantId: m.tenant_id,
        tenantName: tenant?.name ?? "Unknown Tenant",
        tenantSlug: tenant?.slug,
        tenantType: tenant?.type,
        tenantPlan: tenant?.plan,
        role: m.role,
        status: m.status,
        isPrimary,
        joinedAt: m.joined_at,
        invitedAt: m.invited_at,
      }
    })

    // Determine primary role (for display)
    const primaryMembership = tenantRoles.find((tr) => tr.isPrimary) || tenantRoles[0]

    // Determine user status
    let status: "active" | "inactive" | "pending" = "active"
    if (userMemberships.every((m) => m.status === "pending")) {
      status = "pending"
    } else if (!user.email_confirmed_at) {
      status = "pending"
    } else if (user.banned_until && new Date(user.banned_until) > new Date()) {
      status = "inactive"
    }

    // Get preferences
    const userPreferences = userPrefs?.preferences ?? {}

    return {
      id: user.id,
      email: user.email ?? "",
      displayName:
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email?.split("@")[0] ||
        "Unknown",
      avatarUrl: user.user_metadata?.avatar_url as string | undefined,
      status,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_sign_in_at,
      emailConfirmedAt: user.email_confirmed_at,
      tenantRoles,
      primaryRole: primaryMembership?.role ?? "viewer",
      preferences: {
        locale: (userPreferences as Record<string, unknown>).locale ?? "en-IE",
        timezone: (userPreferences as Record<string, unknown>).timezone ?? "Europe/Dublin",
        theme: (userPreferences as Record<string, unknown>).theme ?? "system",
      },
      userType: "platform" as const,
    }
  })

  return NextResponse.json({ users })
}
