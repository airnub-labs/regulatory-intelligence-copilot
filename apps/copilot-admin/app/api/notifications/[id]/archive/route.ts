import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getNotificationHub } from "@/lib/server/admin-event-hubs";

/**
 * POST /api/notifications/[id]/archive
 *
 * Archive a notification.
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
    const { data, error } = await supabase.rpc("archive_notification", {
      p_notification_id: notificationId,
    });

    if (error) {
      console.error("[Notifications] Error archiving:", error);
      return NextResponse.json(
        { error: "Failed to archive notification" },
        { status: 500 }
      );
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || "Notification not found or already archived" },
        { status: 400 }
      );
    }

    // Broadcast event to SSE subscribers
    const notificationHub = getNotificationHub();
    notificationHub.broadcast(userId, "notification:archived", {
      id: notificationId,
    });

    return NextResponse.json({
      success: true,
      notificationId,
      archivedAt: data.archived_at,
    });
  } catch (error) {
    console.error("[Notifications] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
