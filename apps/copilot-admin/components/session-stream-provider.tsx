"use client";

import * as React from "react";
import { createContext, useContext, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  useSessionStream,
  type SessionItem,
  type UseSessionStreamState,
} from "@/lib/hooks/useSessionStream";

/**
 * Session context value
 */
export interface SessionContextValue extends UseSessionStreamState {
  /** Reconnect to the session stream */
  reconnect: () => void;
  /** The current session ID (from NextAuth) */
  currentSessionId?: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionStreamProviderProps {
  children: React.ReactNode;
}

/**
 * Provider that monitors session events and handles forced logout
 *
 * This provider:
 * - Maintains a single SSE connection for session events
 * - Automatically signs out the user when their session is revoked
 * - Shows a toast notification when logout occurs
 * - Provides active sessions list to all child components
 *
 * Should be placed inside SessionProvider and NextIntlClientProvider.
 *
 * @example
 * ```tsx
 * // In providers.tsx
 * <SessionStreamProvider>
 *   {children}
 * </SessionStreamProvider>
 *
 * // In any component to access sessions
 * function ActiveSessionsList() {
 *   const { sessions, isConnected } = useSessions();
 *   // ...
 * }
 * ```
 */
export function SessionStreamProvider({
  children,
}: SessionStreamProviderProps) {
  const { data: session, status } = useSession();

  // Extract session ID from NextAuth session
  const currentSessionId = (session as unknown as { sessionId?: string })
    ?.sessionId;

  // Memoize the callback to prevent re-renders from causing reconnects
  const onForcedLogout = useCallback((reason?: string) => {
    toast.error("Session Ended", {
      description:
        reason || "Your session was revoked by an administrator.",
      duration: 10000,
    });
  }, []);

  // Memoize options to prevent recreation every render
  const options = useMemo(
    () =>
      status === "authenticated"
        ? { currentSessionId, onForcedLogout }
        : {},
    [status, currentSessionId, onForcedLogout]
  );

  // Use the session stream hook with forced logout handling
  const sessionStream = useSessionStream(options);

  const contextValue: SessionContextValue = {
    ...sessionStream,
    currentSessionId,
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Hook to access session state
 *
 * Must be used within a SessionStreamProvider.
 *
 * @returns Session state including active sessions list
 * @throws Error if used outside of SessionStreamProvider
 *
 * @example
 * ```tsx
 * function ActiveSessionsCard() {
 *   const { sessions, isConnected, currentSessionId } = useSessions();
 *
 *   return (
 *     <Card>
 *       <CardTitle>Active Sessions ({sessions.length})</CardTitle>
 *       {sessions.map(s => (
 *         <div key={s.sessionId}>
 *           {s.userAgent}
 *           {s.sessionId === currentSessionId && <Badge>Current</Badge>}
 *         </div>
 *       ))}
 *     </Card>
 *   );
 * }
 * ```
 */
export function useSessions(): SessionContextValue {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSessions must be used within a SessionStreamProvider");
  }

  return context;
}

// Re-export types for convenience
export type { SessionItem };
