import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

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

    // Query sessions directly from auth.sessions using raw SQL
    // Supabase Admin API doesn't expose sessions directly, so we need to query the table
    const { data: sessions, error } = await supabase
      .rpc("get_user_sessions", { p_user_id: userId })

    if (error) {
      // If the RPC doesn't exist, return empty array
      if (error.code === "42883") {
        console.warn("get_user_sessions function not found, returning empty array")
        return NextResponse.json({ sessions: [], historicalSessions: [] })
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = createAdminClient()

    // Use Supabase Admin API to sign out user from all sessions
    const { error } = await supabase.auth.admin.signOut(userId, "global")

    if (error) {
      console.error("Error signing out user:", error)
      return NextResponse.json(
        { error: "Failed to revoke sessions", details: error.message },
        { status: 500 }
      )
    }

    // Record the logout event for notification
    // This could trigger a realtime notification to connected clients
    try {
      await supabase
        .schema("copilot_internal")
        .from("session_sync_logs")
        .insert({
          user_id: userId,
          expected_tenant_id: "00000000-0000-0000-0000-000000000000", // Placeholder
          actual_tenant_id: null,
          request_path: "/admin/force-logout-all",
        })
    } catch {
      // Ignore notification logging errors
    }

    return NextResponse.json({
      success: true,
      message: "All sessions revoked successfully",
      revokedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error in DELETE sessions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
