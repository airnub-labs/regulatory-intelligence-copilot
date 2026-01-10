import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionHub } from "@/lib/server/admin-event-hubs";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  SessionEventType,
  SessionSnapshotPayload,
  SessionInfo,
} from "@reg-copilot/reg-intel-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint for real-time session events
 *
 * GET /api/sessions/stream
 *
 * This endpoint:
 * 1. Authenticates the user
 * 2. Sends a snapshot of active sessions
 * 3. Streams real-time session updates via SSE
 *
 * Events streamed:
 * - `snapshot` - Initial session list (sent on connect)
 * - `session:created` - New session started (login from new device)
 * - `session:revoked` - Session was revoked → CLIENT SHOULD LOGOUT
 * - `session:all_revoked` - Global logout → CLIENT SHOULD LOGOUT
 * - `session:expired` - Session naturally expired
 *
 * ## Forced Logout
 *
 * When receiving `session:revoked`, the client should check if the
 * revoked sessionId matches their current session. If so, immediately
 * sign out and redirect to the login page.
 *
 * When receiving `session:all_revoked`, all clients should immediately
 * sign out and redirect to the login page.
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
        send: (event: SessionEventType, data: unknown) => {
          try {
            sendEvent(event, data);
          } catch {
            // Stream closed
          }
        },
      };

      // Subscribe to session events
      const sessionHub = getSessionHub();
      const unsubscribe = sessionHub.subscribe(userId, subscriber);

      // Send initial snapshot
      (async () => {
        try {
          const supabase = createAdminClient();
          const { data: sessions, error } = await supabase.rpc(
            "get_user_sessions",
            { p_user_id: userId }
          );

          if (!error && sessions) {
            const now = new Date();
            const activeSessions: SessionInfo[] = (
              sessions as Array<{
                id: string;
                user_agent?: string;
                ip?: string;
                refreshed_at?: string;
                created_at: string;
                not_after?: string;
              }>
            )
              .filter((s) => {
                // Filter to only active sessions
                if (s.not_after) {
                  return new Date(s.not_after) > now;
                }
                return true;
              })
              .map((s) => ({
                sessionId: s.id,
                userAgent: s.user_agent,
                ipAddress: s.ip,
                lastActiveAt: s.refreshed_at,
                createdAt: s.created_at,
              }));

            const snapshot: SessionSnapshotPayload = {
              activeSessions,
            };
            sendEvent("snapshot", snapshot);
          }
        } catch (error) {
          console.error("[SessionStream] Error fetching snapshot:", error);
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
