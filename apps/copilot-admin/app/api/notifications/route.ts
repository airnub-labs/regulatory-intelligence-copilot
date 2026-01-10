import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/notifications
 *
 * List notifications for the current user with optional status filter.
 *
 * Query Parameters:
 * - status: Filter by status (UNREAD, READ, DISMISSED, ARCHIVED)
 * - limit: Max number of notifications to return (default: 50)
 * - offset: Pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const supabase = createAdminClient();

  try {
    // Get notifications using RPC function
    const { data: notifications, error } = await supabase.rpc(
      "get_user_notifications",
      {
        p_status: status || null,
        p_limit: limit,
        p_offset: offset,
      }
    );

    if (error) {
      console.error("[Notifications] Error fetching:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    // Get unread count
    const { data: unreadCount } = await supabase.rpc(
      "get_unread_notification_count"
    );

    return NextResponse.json({
      notifications: notifications.map((n: Record<string, unknown>) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        priority: n.priority,
        status: n.status,
        actionUrl: n.action_url,
        metadata: n.metadata,
        createdAt: n.created_at,
        readAt: n.read_at,
      })),
      unreadCount: unreadCount ?? 0,
    });
  } catch (error) {
    console.error("[Notifications] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
