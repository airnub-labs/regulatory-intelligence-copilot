import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

// Schema for updating membership
const updateMembershipSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
  status: z.enum(["active", "pending", "suspended", "removed"]).optional(),
})

// PATCH update user's membership in a tenant
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; tenantId: string }> }
) {
  try {
    const { userId, tenantId } = await params
    const body = await request.json()

    // Validate request body
    const validation = updateMembershipSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.issues },
        { status: 400 }
      )
    }

    const updates = validation.data
    const supabase = createAdminClient()

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.role !== undefined) {
      updateData.role = updates.role
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status
    }

    // Update membership
    const { error } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .update(updateData)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)

    if (error) {
      console.error("Error updating membership:", error)
      return NextResponse.json(
        { error: "Failed to update membership", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in PATCH tenant membership:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE remove user from a tenant (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; tenantId: string }> }
) {
  try {
    const { userId, tenantId } = await params
    const supabase = createAdminClient()

    // Check if user is the tenant owner
    const { data: tenant } = await supabase
      .schema("copilot_internal")
      .from("tenants")
      .select("owner_id, type")
      .eq("id", tenantId)
      .single()

    if (tenant?.owner_id === userId) {
      return NextResponse.json(
        { error: "Cannot remove the tenant owner. Transfer ownership first." },
        { status: 400 }
      )
    }

    // Check if this is a personal tenant
    if (tenant?.type === "personal") {
      return NextResponse.json(
        { error: "Cannot remove user from their personal tenant" },
        { status: 400 }
      )
    }

    // Soft delete the membership
    const { error } = await supabase
      .schema("copilot_internal")
      .from("tenant_memberships")
      .update({
        deleted_at: new Date().toISOString(),
        status: "removed",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)

    if (error) {
      console.error("Error removing membership:", error)
      return NextResponse.json(
        { error: "Failed to remove membership", details: error.message },
        { status: 500 }
      )
    }

    // If this was the user's current tenant, clear it
    await supabase
      .schema("copilot_internal")
      .from("user_preferences")
      .update({
        current_tenant_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("current_tenant_id", tenantId)

    return NextResponse.json({
      success: true,
      removedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error in DELETE tenant membership:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
