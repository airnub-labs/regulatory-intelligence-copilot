import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getNotificationHub } from "@/lib/server/admin-event-hubs";

/**
 * POST /api/notifications/read-all
 *
 * Mark all unread notifications as read.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase.rpc("mark_all_notifications_read");

    if (error) {
      console.error("[Notifications] Error marking all as read:", error);
      return NextResponse.json(
        { error: "Failed to mark all notifications as read" },
        { status: 500 }
      );
    }

    // Broadcast event to SSE subscribers
    // Since we marked all as read, broadcast a snapshot refresh event
    const notificationHub = getNotificationHub();
    notificationHub.broadcast(userId, "snapshot", {
      refresh: true,
      markedCount: data?.marked_count || 0,
    });

    return NextResponse.json({
      success: true,
      markedCount: data?.marked_count || 0,
    });
  } catch (error) {
    console.error("[Notifications] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
