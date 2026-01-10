import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getNotificationHub } from "@/lib/server/admin-event-hubs";

/**
 * POST /api/notifications/[id]/read
 *
 * Mark a notification as read.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notificationId } = await params;
  const userId = session.user.id;
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: notificationId,
    });

    if (error) {
      console.error("[Notifications] Error marking as read:", error);
      return NextResponse.json(
        { error: "Failed to mark notification as read" },
        { status: 500 }
      );
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Notification not found or already read" },
        { status: 400 }
      );
    }

    // Broadcast event to SSE subscribers
    const notificationHub = getNotificationHub();
    notificationHub.broadcast(userId, "notification:read", {
      id: notificationId,
      readAt: data.read_at,
    });

    return NextResponse.json({
      success: true,
      notificationId,
      readAt: data.read_at,
    });
  } catch (error) {
    console.error("[Notifications] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
