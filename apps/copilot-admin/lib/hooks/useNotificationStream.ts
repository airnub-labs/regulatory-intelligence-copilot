"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NotificationNewPayload,
  NotificationSnapshotPayload,
  NotificationReadPayload,
  NotificationIdPayload,
} from "@reg-copilot/reg-intel-admin";

/**
 * Notification item for UI display
 */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "UNREAD" | "READ" | "DISMISSED" | "ARCHIVED";
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  readAt?: Date;
}

/**
 * Hook state
 */
export interface UseNotificationStreamState {
  notifications: NotificationItem[];
  unreadCount: number;
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook actions
 */
export interface UseNotificationStreamActions {
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (notificationId: string) => Promise<void>;
  archive: (notificationId: string) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  reconnect: () => void;
}

/**
 * Hook for real-time notification streaming via SSE
 *
 * @example
 * ```tsx
 * function NotificationsButton() {
 *   const { notifications, unreadCount, markAsRead } = useNotificationStream();
 *
 *   return (
 *     <div>
 *       <span>{unreadCount} unread</span>
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
export function useNotificationStream(): UseNotificationStreamState &
  UseNotificationStreamActions {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const connectRef = useRef<() => void>(() => {});
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsLoading(true);
    setError(null);

    const eventSource = new EventSource("/api/notifications/stream");
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
        setError(new Error("Failed to connect to notification stream"));
        setIsLoading(false);
      }
    };

    // Handle snapshot event
    eventSource.addEventListener("snapshot", (event) => {
      try {
        const data = JSON.parse(event.data) as NotificationSnapshotPayload;
        setNotifications(
          data.notifications.map((n) => ({
            ...n,
            createdAt: new Date(n.createdAt),
          }))
        );
        setUnreadCount(data.unreadCount);
        setIsLoading(false);
      } catch (e) {
        console.error("[useNotificationStream] Failed to parse snapshot:", e);
      }
    });

    // Handle new notification
    eventSource.addEventListener("notification:new", (event) => {
      try {
        const data = JSON.parse(event.data) as NotificationNewPayload;
        setNotifications((prev) => [
          { ...data, createdAt: new Date(data.createdAt) },
          ...prev,
        ]);
        setUnreadCount((prev) => prev + 1);
      } catch (e) {
        console.error("[useNotificationStream] Failed to parse new:", e);
      }
    });

    // Handle read notification
    eventSource.addEventListener("notification:read", (event) => {
      try {
        const data = JSON.parse(event.data) as NotificationReadPayload;
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === data.id
              ? { ...n, status: "READ" as const, readAt: new Date(data.readAt) }
              : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {
        console.error("[useNotificationStream] Failed to parse read:", e);
      }
    });

    // Handle dismissed notification
    eventSource.addEventListener("notification:dismissed", (event) => {
      try {
        const data = JSON.parse(event.data) as NotificationIdPayload;
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === data.id ? { ...n, status: "DISMISSED" as const } : n
          )
        );
      } catch (e) {
        console.error("[useNotificationStream] Failed to parse dismissed:", e);
      }
    });

    // Handle archived notification
    eventSource.addEventListener("notification:archived", (event) => {
      try {
        const data = JSON.parse(event.data) as NotificationIdPayload;
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === data.id ? { ...n, status: "ARCHIVED" as const } : n
          )
        );
      } catch (e) {
        console.error("[useNotificationStream] Failed to parse archived:", e);
      }
    });

    // Handle deleted notification
    eventSource.addEventListener("notification:deleted", (event) => {
      try {
        const data = JSON.parse(event.data) as NotificationIdPayload;
        setNotifications((prev) => prev.filter((n) => n.id !== data.id));
      } catch (e) {
        console.error("[useNotificationStream] Failed to parse deleted:", e);
      }
    });
  }, []);

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

  // Actions
  const markAsRead = useCallback(async (notificationId: string) => {
    const response = await fetch(`/api/notifications/${notificationId}/read`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("Failed to mark notification as read");
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const response = await fetch("/api/notifications/read-all", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("Failed to mark all notifications as read");
    }
  }, []);

  const dismiss = useCallback(async (notificationId: string) => {
    const response = await fetch(
      `/api/notifications/${notificationId}/dismiss`,
      { method: "POST" }
    );
    if (!response.ok) {
      throw new Error("Failed to dismiss notification");
    }
  }, []);

  const archive = useCallback(async (notificationId: string) => {
    const response = await fetch(
      `/api/notifications/${notificationId}/archive`,
      { method: "POST" }
    );
    if (!response.ok) {
      throw new Error("Failed to archive notification");
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId: string) => {
    const response = await fetch(`/api/notifications/${notificationId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Failed to delete notification");
    }
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    notifications,
    unreadCount,
    isConnected,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    dismiss,
    archive,
    deleteNotification,
    reconnect,
  };
}
