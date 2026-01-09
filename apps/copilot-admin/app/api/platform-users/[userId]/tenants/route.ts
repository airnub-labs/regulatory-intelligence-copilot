import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

// Schema for adding user to tenant
const addToTenantSchema = z.object({
  tenantId: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "viewer"]),
})

// GET all tenant memberships for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = createAdminClient()

    // Get tenant memberships with tenant details
    const { data: memberships, error: membershipError } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .select(`
        id,
        tenant_id,
        role,
        status,
        invited_by,
        invited_at,
        joined_at,
        created_at,
        updated_at,
        deleted_at
      `)
      .eq("user_id", userId)
      .is("deleted_at", null)

    if (membershipError) {
      console.error("Error fetching memberships:", membershipError)
      return NextResponse.json(
        { error: "Failed to fetch memberships", details: membershipError.message },
        { status: 500 }
      )
    }

    // Get tenant details
    const tenantIds = memberships?.map((m) => m.tenant_id) ?? []

    let tenants: Array<{
      id: string
      name: string
      slug: string | null
      type: string
      plan: string
      owner_id: string
      created_at: string
      deleted_at: string | null
    }> = []

    if (tenantIds.length > 0) {
      const { data, error: tenantsError } = await supabase
        .schema("copilot_internal")
        .from("tenants")
        .select(`
          id,
          name,
          slug,
          type,
          plan,
          owner_id,
          created_at,
          deleted_at
        `)
        .in("id", tenantIds)

      if (tenantsError) {
        console.error("Error fetching tenants:", tenantsError)
      } else {
        tenants = data || []
      }
    }

    // Get user preferences for primary tenant
    const { data: prefs } = await supabase
      .schema("copilot_internal")
      .from("user_preferences")
      .select("current_tenant_id")
      .eq("user_id", userId)
      .single()

    // Create tenant map
    const tenantMap = new Map(tenants.map((t) => [t.id, t]))

    // Map memberships with tenant info
    const result = (memberships || []).map((m) => {
      const tenant = tenantMap.get(m.tenant_id)
      return {
        id: m.id,
        tenantId: m.tenant_id,
        tenantName: tenant?.name ?? "Unknown Tenant",
        tenantSlug: tenant?.slug,
        tenantType: tenant?.type,
        tenantPlan: tenant?.plan,
        isDeleted: tenant?.deleted_at !== null,
        role: m.role,
        status: m.status,
        isPrimary: prefs?.current_tenant_id === m.tenant_id,
        invitedAt: m.invited_at,
        joinedAt: m.joined_at,
        createdAt: m.created_at,
      }
    })

    // Also get available tenants for adding user
    const { data: allTenants } = await supabase
      .schema("copilot_internal")
      .from("tenants")
      .select("id, name, slug, type, plan")
      .is("deleted_at", null)
      .order("name")

    // Filter out tenants user is already in
    const availableTenants = (allTenants || []).filter(
      (t) => !tenantIds.includes(t.id)
    )

    return NextResponse.json({
      memberships: result,
      availableTenants,
    })
  } catch (error) {
    console.error("Error in GET tenants:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST add user to a tenant
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const body = await request.json()

    // Validate request body
    const validation = addToTenantSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { tenantId, role } = validation.data
    const supabase = createAdminClient()

    // Check if membership already exists
    const { data: existing } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .select("id, deleted_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single()

    if (existing && !existing.deleted_at) {
      return NextResponse.json(
        { error: "User is already a member of this tenant" },
        { status: 400 }
      )
    }

    // If soft-deleted, restore it
    if (existing?.deleted_at) {
      const { error: restoreError } = await supabase
        .schema("copilot_internal")
        .from("tenant_memberships")
        .update({
          deleted_at: null,
          role,
          status: "active",
          joined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)

      if (restoreError) {
        console.error("Error restoring membership:", restoreError)
        return NextResponse.json(
          { error: "Failed to restore membership", details: restoreError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        membershipId: existing.id,
        restored: true,
      })
    }

    // Create new membership
    const { data: membership, error: createError } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role,
        status: "active",
        joined_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (createError) {
      console.error("Error creating membership:", createError)
      return NextResponse.json(
        { error: "Failed to add user to tenant", details: createError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      membershipId: membership.id,
    })
  } catch (error) {
    console.error("Error in POST tenant:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
