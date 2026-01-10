import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getNotificationHub } from "@/lib/server/admin-event-hubs";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  NotificationEventType,
  NotificationSnapshotPayload,
} from "@reg-copilot/reg-intel-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint for real-time notification delivery
 *
 * GET /api/notifications/stream
 *
 * This endpoint:
 * 1. Authenticates the user
 * 2. Sends a snapshot of current notifications
 * 3. Streams real-time notification updates via SSE
 *
 * Events streamed:
 * - `snapshot` - Initial notification list (sent on connect)
 * - `notification:new` - New notification created
 * - `notification:read` - Notification marked as read
 * - `notification:dismissed` - Notification dismissed
 * - `notification:archived` - Notification archived
 * - `notification:deleted` - Notification deleted
 */
export async function GET(request: NextRequest) {
  // Authenticate user
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE event
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send keepalive comment every 30 seconds
      const keepaliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream closed
          clearInterval(keepaliveInterval);
        }
      }, 30000);

      // Create SSE subscriber object
      const subscriber = {
        send: (event: NotificationEventType, data: unknown) => {
          try {
            sendEvent(event, data);
          } catch {
            // Stream closed
          }
        },
      };

      // Subscribe to notification events
      const notificationHub = getNotificationHub();
      const unsubscribe = notificationHub.subscribe(userId, subscriber);

      // Send initial snapshot
      (async () => {
        try {
          const supabase = createAdminClient();
          const { data: notifications, error } = await supabase.rpc(
            "get_user_notifications",
            {
              p_status: null,
              p_limit: 50,
              p_offset: 0,
            }
          );

          const { data: unreadCount } = await supabase.rpc(
            "get_unread_notification_count"
          );

          if (!error && notifications) {
            const snapshot: NotificationSnapshotPayload = {
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
              })),
              unreadCount: unreadCount ?? 0,
            };
            sendEvent("snapshot", snapshot);
          }
        } catch (error) {
          console.error("[NotificationStream] Error fetching snapshot:", error);
        }
      })();

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(keepaliveInterval);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
