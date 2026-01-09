import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = createAdminClient()

    // Fetch admin users from the copilot_internal.admin_users table
    // Use the schema() method to access the copilot_internal schema
    const { data: adminUsers, error } = await supabase
      .schema("copilot_internal")
      .from("admin_users")
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
      // For now, return empty tenant access - this would be populated by joining with tenants
      tenantAccess: [],
    }))

    return NextResponse.json({ users: transformedUsers })
  } catch (error) {
    console.error("Error in admin-users API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
