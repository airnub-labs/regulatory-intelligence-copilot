"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import type {
  SessionSnapshotPayload,
  SessionCreatedPayload,
  SessionRevokedPayload,
  SessionAllRevokedPayload,
} from "@reg-copilot/reg-intel-admin";

/**
 * Session item for UI display
 */
export interface SessionItem {
  sessionId: string;
  userAgent?: string;
  ipAddress?: string;
  lastActiveAt?: Date;
  createdAt: Date;
  isCurrent: boolean;
}

/**
 * Hook state
 */
export interface UseSessionStreamState {
  sessions: SessionItem[];
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook options
 */
export interface UseSessionStreamOptions {
  /**
   * Current session ID for detecting forced logout
   * If the current session is revoked, the user will be signed out
   */
  currentSessionId?: string;

  /**
   * Callback when forced logout occurs
   * Defaults to signing out and showing a toast
   */
  onForcedLogout?: (reason?: string) => void;

  /**
   * Message to show when forced logout occurs
   */
  forcedLogoutMessage?: string;
}

/**
 * Hook for real-time session streaming via SSE
 *
 * This hook:
 * - Streams real-time session updates
 * - Automatically signs out the user when their session is revoked
 * - Supports "global logout" (all sessions revoked)
 *
 * @example
 * ```tsx
 * function SessionMonitor() {
 *   const { sessions, isConnected } = useSessionStream({
 *     currentSessionId: getSessionId(),
 *     onForcedLogout: (reason) => {
 *       toast.error(reason || "Your session was revoked");
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <span>{sessions.length} active sessions</span>
 *       {sessions.map(s => (
 *         <div key={s.sessionId}>
 *           {s.userAgent} - {s.ipAddress}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSessionStream(
  options: UseSessionStreamOptions = {}
): UseSessionStreamState & { reconnect: () => void } {
  const { currentSessionId, onForcedLogout, forcedLogoutMessage } = options;

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const router = useRouter();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const connectRef = useRef<() => void>(() => {});
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  // Use refs for callbacks to avoid recreating connect when callbacks change
  const onForcedLogoutRef = useRef(onForcedLogout);
  const forcedLogoutMessageRef = useRef(forcedLogoutMessage);
  const currentSessionIdRef = useRef(currentSessionId);

  // Update refs when values change (without causing reconnects)
  useEffect(() => {
    onForcedLogoutRef.current = onForcedLogout;
  }, [onForcedLogout]);

  useEffect(() => {
    forcedLogoutMessageRef.current = forcedLogoutMessage;
  }, [forcedLogoutMessage]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const handleForcedLogout = useCallback(
    async (reason?: string) => {
      // Call custom handler if provided
      if (onForcedLogoutRef.current) {
        onForcedLogoutRef.current(reason);
      }

      // Sign out and redirect to login
      await signOut({ redirect: false });
      router.push(
        `/login?message=${encodeURIComponent(
          forcedLogoutMessageRef.current || reason || "Your session was revoked"
        )}`
      );
    },
    [router]
  );

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsLoading(true);
    setError(null);

    const eventSource = new EventSource("/api/sessions/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();

      // Exponential backoff reconnect using ref to avoid circular dependency
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay =
          baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
        reconnectAttempts.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), delay);
      } else {
        setError(new Error("Failed to connect to session stream"));
        setIsLoading(false);
      }
    };

    // Handle snapshot event
    eventSource.addEventListener("snapshot", (event) => {
      try {
        const data = JSON.parse(event.data) as SessionSnapshotPayload;
        setSessions(
          data.activeSessions.map((s) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            lastActiveAt: s.lastActiveAt ? new Date(s.lastActiveAt) : undefined,
            isCurrent: currentSessionIdRef.current === s.sessionId,
          }))
        );
        setIsLoading(false);
      } catch (e) {
        console.error("[useSessionStream] Failed to parse snapshot:", e);
      }
    });

    // Handle new session
    eventSource.addEventListener("session:created", (event) => {
      try {
        const data = JSON.parse(event.data) as SessionCreatedPayload;
        setSessions((prev) => [
          {
            ...data.session,
            createdAt: new Date(data.session.createdAt),
            lastActiveAt: data.session.lastActiveAt
              ? new Date(data.session.lastActiveAt)
              : undefined,
            isCurrent: currentSessionIdRef.current === data.session.sessionId,
          },
          ...prev,
        ]);
      } catch (e) {
        console.error("[useSessionStream] Failed to parse created:", e);
      }
    });

    // Handle session revoked - CHECK IF IT'S THE CURRENT SESSION
    eventSource.addEventListener("session:revoked", (event) => {
      try {
        const data = JSON.parse(event.data) as SessionRevokedPayload;

        // Remove from list
        setSessions((prev) =>
          prev.filter((s) => s.sessionId !== data.sessionId)
        );

        // If this is the current session, force logout
        if (currentSessionIdRef.current && data.sessionId === currentSessionIdRef.current) {
          handleForcedLogout(data.reason || "Your session was revoked by an administrator");
        }
      } catch (e) {
        console.error("[useSessionStream] Failed to parse revoked:", e);
      }
    });

    // Handle all sessions revoked - ALWAYS FORCE LOGOUT
    eventSource.addEventListener("session:all_revoked", (event) => {
      try {
        const data = JSON.parse(event.data) as SessionAllRevokedPayload;
        setSessions([]);
        handleForcedLogout(data.reason || "All sessions have been revoked");
      } catch (e) {
        console.error("[useSessionStream] Failed to parse all_revoked:", e);
      }
    });

    // Handle session expired
    eventSource.addEventListener("session:expired", (event) => {
      try {
        const data = JSON.parse(event.data) as { sessionId: string };
        setSessions((prev) =>
          prev.filter((s) => s.sessionId !== data.sessionId)
        );

        // If this is the current session, force logout
        if (currentSessionIdRef.current && data.sessionId === currentSessionIdRef.current) {
          handleForcedLogout("Your session has expired");
        }
      } catch (e) {
        console.error("[useSessionStream] Failed to parse expired:", e);
      }
    });
  }, [handleForcedLogout]); // Only depends on handleForcedLogout which only depends on router

  // Update the ref when connect changes
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Connect on mount only (empty dependency array)
  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only connect on mount

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    sessions,
    isConnected,
    isLoading,
    error,
    reconnect,
  };
}
