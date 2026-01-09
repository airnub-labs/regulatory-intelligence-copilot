import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

// Schema for creating a workspace
const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tenantId: z.string().uuid(),
})

// GET all workspaces for a user (across all their tenants)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = createAdminClient()

    // Get all tenant memberships for user
    const { data: memberships } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ workspaces: [] })
    }

    const tenantIds = memberships.map((m) => m.tenant_id)

    // For multi-tenant users, workspaces are essentially the tenants themselves
    // with team/enterprise tenants being the "workspaces"
    const { data: tenants, error: tenantsError } = await supabase
      .schema("copilot_internal")
      .from("tenants")
      .select(`
        id,
        name,
        slug,
        description,
        type,
        plan,
        owner_id,
        settings,
        created_at,
        updated_at,
        deleted_at,
        deleted_by
      `)
      .in("id", tenantIds)

    if (tenantsError) {
      console.error("Error fetching tenants as workspaces:", tenantsError)
      return NextResponse.json(
        { error: "Failed to fetch workspaces", details: tenantsError.message },
        { status: 500 }
      )
    }

    // Create membership role map
    const roleMap = new Map(memberships.map((m) => [m.tenant_id, m.role]))

    // Get member counts for each tenant
    const { data: memberCounts } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .select("tenant_id")
      .in("tenant_id", tenantIds)
      .eq("status", "active")
      .is("deleted_at", null)

    const countMap = new Map<string, number>()
    for (const mc of memberCounts || []) {
      countMap.set(mc.tenant_id, (countMap.get(mc.tenant_id) || 0) + 1)
    }

    // Transform to workspace format
    const workspaces = (tenants || []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      type: t.type,
      plan: t.plan,
      ownerId: t.owner_id,
      status: t.deleted_at ? "deleted" : "active",
      memberCount: countMap.get(t.id) || 0,
      role: roleMap.get(t.id) || "viewer",
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      deletedAt: t.deleted_at,
      deletedBy: t.deleted_by,
      canRestore: t.deleted_at
        ? new Date().getTime() - new Date(t.deleted_at).getTime() < 30 * 24 * 60 * 60 * 1000
        : false,
    }))

    // Separate active and deleted
    const activeWorkspaces = workspaces.filter((w) => w.status === "active")
    const deletedWorkspaces = workspaces.filter((w) => w.status === "deleted")

    return NextResponse.json({
      workspaces: activeWorkspaces,
      deletedWorkspaces,
    })
  } catch (error) {
    console.error("Error in GET workspaces:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST create a new workspace (team tenant)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const body = await request.json()

    // Validate request body
    const validation = createWorkspaceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { name, description, tenantId } = validation.data
    const supabase = createAdminClient()

    // Verify user has permission to create workspaces in this tenant
    const { data: membership } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .is("deleted_at", null)
      .single()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "User does not have permission to create workspaces in this tenant" },
        { status: 403 }
      )
    }

    // Generate slug from name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    // Ensure unique slug
    let slug = baseSlug
    let counter = 0
    while (true) {
      const { data: existing } = await supabase
        .schema("copilot_internal")
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .single()

      if (!existing) break

      counter++
      slug = `${baseSlug}-${counter}`

      if (counter > 100) {
        slug = `${baseSlug}-${Date.now()}`
        break
      }
    }

    // Create new workspace (team tenant)
    const { data: workspace, error: createError } = await supabase
      .schema("copilot_internal")
      .from("tenants")
      .insert({
        name,
        slug,
        description,
        type: "team",
        owner_id: userId,
        plan: "free",
      })
      .select("id, name, slug")
      .single()

    if (createError) {
      console.error("Error creating workspace:", createError)
      return NextResponse.json(
        { error: "Failed to create workspace", details: createError.message },
        { status: 500 }
      )
    }

    // Add creator as owner
    await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .insert({
        tenant_id: workspace.id,
        user_id: userId,
        role: "owner",
        status: "active",
        joined_at: new Date().toISOString(),
      })

    return NextResponse.json({
      success: true,
      workspace,
    })
  } catch (error) {
    console.error("Error in POST workspace:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
