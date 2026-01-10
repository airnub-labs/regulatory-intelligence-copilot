import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getSessionHub } from "@/lib/server/admin-event-hubs"
import { auth } from "@/lib/auth"

// DELETE a specific session (force logout from specific device)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; sessionId: string }> }
) {
  try {
    const { userId, sessionId } = await params

    // Get current admin session to prevent self-revocation
    const currentSession = await auth()
    const currentUserId = currentSession?.user?.id
    const currentSessionId = (currentSession as { sessionId?: string })?.sessionId

    // Prevent revoking own current session
    if (currentUserId === userId && currentSessionId === sessionId) {
      return NextResponse.json(
        {
          error: "Cannot revoke current session",
          message: "You cannot revoke the session you are currently using. Use a different session or sign out normally.",
          code: "SELF_REVOCATION_BLOCKED"
        },
        { status: 403 }
      )
    }

    const supabase = createAdminClient()

    // Use RPC to delete specific session
    const { error } = await supabase.rpc("revoke_user_session", {
      p_user_id: userId,
      p_session_id: sessionId,
    })

    if (error) {
      // If RPC doesn't exist, try direct approach
      if (error.code === "42883") {
        // Fallback: Sign out user globally (less granular but works)
        // Note: Supabase doesn't expose per-session revocation in Admin API
        console.warn("revoke_user_session function not found, using global signout")

        const { error: signOutError } = await supabase.auth.admin.signOut(userId, "global")
        if (signOutError) {
          return NextResponse.json(
            { error: "Failed to revoke session", details: signOutError.message },
            { status: 500 }
          )
        }

        // Broadcast session:all_revoked event (fallback used global signout)
        const sessionHub = getSessionHub()
        sessionHub.broadcast(userId, "session:all_revoked", {
          revokedBy: currentUserId,
          reason: "Session revoked by administrator (fallback: all sessions)",
        })

        return NextResponse.json({
          success: true,
          message: "All sessions revoked (granular revocation not available)",
          sessionId,
          revokedAt: new Date().toISOString(),
          fallback: true,
        })
      }

      console.error("Error revoking session:", error)
      return NextResponse.json(
        { error: "Failed to revoke session", details: error.message },
        { status: 500 }
      )
    }

    // Broadcast session:revoked event to trigger forced logout on that specific session
    const sessionHub = getSessionHub()
    sessionHub.broadcast(userId, "session:revoked", {
      sessionId,
      revokedBy: currentUserId,
      reason: "Session revoked by administrator",
    })

    return NextResponse.json({
      success: true,
      message: "Session revoked successfully",
      sessionId,
      revokedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error in DELETE session:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
