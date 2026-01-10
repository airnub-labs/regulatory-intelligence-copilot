import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

// Schema for updating workspace
const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
})

// Schema for restore action
const restoreWorkspaceSchema = z.object({
  action: z.literal("restore"),
})

// PATCH update or restore a workspace
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; workspaceId: string }> }
) {
  try {
    const { userId, workspaceId } = await params
    const body = await request.json()
    const supabase = createAdminClient()

    // Check if this is a restore action
    const restoreValidation = restoreWorkspaceSchema.safeParse(body)
    if (restoreValidation.success) {
      // Restore workspace using RPC
      const { data: result, error } = await supabase.rpc("restore_workspace", {
        p_tenant_id: workspaceId,
        p_user_id: userId,
      })

      if (error) {
        console.error("Error restoring workspace:", error)
        return NextResponse.json(
          { error: "Failed to restore workspace", details: error.message },
          { status: 500 }
        )
      }

      if (!result?.success) {
        return NextResponse.json(
          { error: result?.error || "Failed to restore workspace" },
          { status: 400 }
        )
      }

      return NextResponse.json({
        success: true,
        restoredAt: result.restored_at,
      })
    }

    // Otherwise, it's an update
    const validation = updateWorkspaceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.issues },
        { status: 400 }
      )
    }

    const updates = validation.data

    // Verify user has permission to update this workspace
    const { data: membership } = await supabase
      .schema("copilot_core")
      .from("tenant_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", workspaceId)
      .eq("status", "active")
      .is("deleted_at", null)
      .single()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "User does not have permission to update this workspace" },
        { status: 403 }
      )
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.name !== undefined) {
      updateData.name = updates.name
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description
    }

    // Update workspace
    const { error: updateError } = await supabase
      .schema("copilot_core")
      .from("tenants")
      .update(updateData)
      .eq("id", workspaceId)

    if (updateError) {
      console.error("Error updating workspace:", updateError)
      return NextResponse.json(
        { error: "Failed to update workspace", details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in PATCH workspace:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE soft delete a workspace
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; workspaceId: string }> }
) {
  try {
    const { userId, workspaceId } = await params
    const supabase = createAdminClient()

    // Use the delete_workspace RPC function
    const { data: result, error } = await supabase.rpc("delete_workspace", {
      p_tenant_id: workspaceId,
      p_user_id: userId,
    })

    if (error) {
      console.error("Error deleting workspace:", error)
      return NextResponse.json(
        { error: "Failed to delete workspace", details: error.message },
        { status: 500 }
      )
    }

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || "Failed to delete workspace" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      deletedAt: result.deleted_at,
      gracePeriodDays: result.grace_period_days,
      restoreBefore: result.restore_before,
      membersAffected: result.members_affected,
    })
  } catch (error) {
    console.error("Error in DELETE workspace:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
