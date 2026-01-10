import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getSessionHub } from "@/lib/server/admin-event-hubs"
import { auth } from "@/lib/auth"

// Session type definition
interface UserSession {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
  factorId: string | null
  aal: string | null
  notAfter: string | null
  refreshedAt: string | null
  userAgent: string | null
  ip: string | null
  tag: string | null
  isActive: boolean
}

// GET all sessions for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = createAdminClient()

    // Query sessions using the database function
    // Note: Requires migration 20260110000000_session_management_functions.sql
    const { data: sessions, error } = await supabase
      .rpc("get_user_sessions", { p_user_id: userId })

    if (error) {
      // If the RPC doesn't exist or schema cache issue, return empty array
      // This is expected before the migration is run
      if (error.code === "42883" || error.message?.includes("schema cache")) {
        console.warn("get_user_sessions function not available - run supabase db reset or apply migration")
        return NextResponse.json({
          sessions: [],
          historicalSessions: [],
          notice: "Session management requires database migration. Run: supabase db reset"
        })
      }
      console.error("Error fetching sessions:", error)
      return NextResponse.json(
        { error: "Failed to fetch sessions", details: error.message },
        { status: 500 }
      )
    }

    // Separate active and historical sessions
    const now = new Date()
    const activeSessions: UserSession[] = []
    const historicalSessions: UserSession[] = []

    for (const session of sessions || []) {
      const sessionData: UserSession = {
        id: session.id,
        userId: session.user_id,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        factorId: session.factor_id,
        aal: session.aal,
        notAfter: session.not_after,
        refreshedAt: session.refreshed_at,
        userAgent: session.user_agent,
        ip: session.ip,
        tag: session.tag,
        isActive: session.not_after ? new Date(session.not_after) > now : true,
      }

      if (sessionData.isActive) {
        activeSessions.push(sessionData)
      } else {
        historicalSessions.push(sessionData)
      }
    }

    return NextResponse.json({
      sessions: activeSessions,
      historicalSessions: historicalSessions.slice(0, 50), // Limit historical to 50
    })
  } catch (error) {
    console.error("Error in GET sessions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE all sessions for a user (force logout from all devices)
// Query params:
//   - excludeCurrent=true (default): Preserves current session when revoking own sessions
//   - excludeCurrent=false: Revokes ALL sessions including current (will log you out)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const { searchParams } = new URL(request.url)
    const excludeCurrent = searchParams.get("excludeCurrent") !== "false" // Default to true

    // Get current admin session
    const currentSession = await auth()
    const currentUserId = currentSession?.user?.id
    const currentSessionId = (currentSession as { sessionId?: string })?.sessionId
    const isRevokingOwnSessions = currentUserId === userId

    // If revoking own sessions and excludeCurrent is true, we need to use a different approach
    if (isRevokingOwnSessions && excludeCurrent) {
      // Need to revoke all sessions EXCEPT the current one
      // This requires the RPC function to support exclusion
      const supabase = createAdminClient()

      // Try to use RPC that excludes current session
      const { data, error } = await supabase.rpc("revoke_all_user_sessions_except", {
        p_user_id: userId,
        p_exclude_session_id: currentSessionId,
      })

      if (error) {
        // If RPC doesn't exist, return error explaining they can't safely do this
        if (error.code === "42883") {
          return NextResponse.json(
            {
              error: "Cannot safely revoke all sessions",
              message: "To revoke all sessions while keeping your current session, the revoke_all_user_sessions_except database function is required. Use excludeCurrent=false to revoke ALL sessions (you will be logged out).",
              code: "FUNCTION_NOT_AVAILABLE"
            },
            { status: 501 }
          )
        }
        console.error("Error revoking sessions:", error)
        return NextResponse.json(
          { error: "Failed to revoke sessions", details: error.message },
          { status: 500 }
        )
      }

      // Broadcast session:all_revoked event (other sessions will be logged out)
      const sessionHub = getSessionHub()
      sessionHub.broadcast(userId, "session:all_revoked", {
        revokedBy: currentUserId,
        reason: "All other sessions revoked by administrator",
        excludedSessionId: currentSessionId,
      })

      return NextResponse.json({
        success: true,
        message: "All other sessions revoked successfully (current session preserved)",
        revokedAt: new Date().toISOString(),
        currentSessionPreserved: true,
        revokedCount: data?.revoked_count ?? 0,
      })
    }

    // Standard approach: revoke ALL sessions
    const supabase = createAdminClient()
    const { error } = await supabase.auth.admin.signOut(userId, "global")

    if (error) {
      console.error("Error signing out user:", error)
      return NextResponse.json(
        { error: "Failed to revoke sessions", details: error.message },
        { status: 500 }
      )
    }

    // Broadcast session:all_revoked event to trigger forced logout on all clients
    const sessionHub = getSessionHub()
    sessionHub.broadcast(userId, "session:all_revoked", {
      revokedBy: currentUserId,
      reason: "All sessions revoked by administrator",
    })

    return NextResponse.json({
      success: true,
      message: "All sessions revoked successfully",
      revokedAt: new Date().toISOString(),
      currentSessionPreserved: false,
    })
  } catch (error) {
    console.error("Error in DELETE sessions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
