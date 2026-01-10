"use client";

import * as React from "react";
import { createContext, useContext } from "react";
import {
  useNotificationStream,
  type NotificationItem,
  type UseNotificationStreamState,
  type UseNotificationStreamActions,
} from "@/lib/hooks/useNotificationStream";

/**
 * Notification context value
 */
export interface NotificationContextValue
  extends UseNotificationStreamState,
    UseNotificationStreamActions {}

const NotificationContext = createContext<NotificationContextValue | null>(
  null
);

interface NotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Provider that manages notifications via a single SSE connection
 *
 * This provider:
 * - Maintains a single SSE connection for all notification consumers
 * - Provides real-time notification state to all child components
 * - Exposes actions for managing notifications (markAsRead, dismiss, etc.)
 *
 * Should be placed inside SessionProvider and NextIntlClientProvider.
 *
 * @example
 * ```tsx
 * // In providers.tsx
 * <NotificationProvider>
 *   {children}
 * </NotificationProvider>
 *
 * // In any component
 * function MyComponent() {
 *   const { notifications, unreadCount, markAsRead } = useNotifications();
 *   // ...
 * }
 * ```
 */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const notificationStream = useNotificationStream();

  return (
    <NotificationContext.Provider value={notificationStream}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification state and actions
 *
 * Must be used within a NotificationProvider.
 *
 * @returns Notification state and actions
 * @throws Error if used outside of NotificationProvider
 *
 * @example
 * ```tsx
 * function NotificationsButton() {
 *   const { notifications, unreadCount, markAsRead } = useNotifications();
 *
 *   return (
 *     <div>
 *       <Badge>{unreadCount}</Badge>
 *       {notifications.map(n => (
 *         <div key={n.id} onClick={() => markAsRead(n.id)}>
 *           {n.title}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }

  return context;
}

// Re-export types for convenience
export type { NotificationItem };
