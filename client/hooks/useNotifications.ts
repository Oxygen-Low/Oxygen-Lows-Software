import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/db";
import { toast } from "sonner";

export type NotificationType =
  | "info"
  | "announcement"
  | "warning"
  | "success"
  | "alert";

export interface ClientNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  action_url?: string | null;
  target_type: "all" | "user";
  target_user_id?: string | null;
  target_username?: string | null;
  created_by: string;
  created_by_username: string;
  created_at: string;
  is_read: boolean;
  dismissed: boolean;
}

// Global state listeners so all components (header, sidebar, notifications page) stay in sync
type Listener = () => void;
let globalNotifications: ClientNotification[] = [];
let globalUnreadCount = 0;
let globalLoading = false;
let globalHasFetched = false;
const listeners = new Set<Listener>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function useNotifications() {
  const { session } = useAuth();
  const token = session?.access_token;
  const currentUserId = session?.user?.id;

  const [notifications, setNotifications] = useState<ClientNotification[]>(
    globalNotifications,
  );
  const [unreadCount, setUnreadCount] = useState<number>(globalUnreadCount);
  const [loading, setLoading] = useState<boolean>(globalLoading);

  const fetchInProgress = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;
    try {
      globalLoading = true;
      emitChange();

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/notifications", { headers });
      if (res.ok) {
        const data = await res.json();
        globalNotifications = data.notifications || [];
        globalUnreadCount = data.unreadCount || 0;
        globalHasFetched = true;
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      globalLoading = false;
      fetchInProgress.current = false;
      emitChange();
    }
  }, [token]);

  // Initial fetch and on session change
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, currentUserId]);

  // Sync component state with global state
  useEffect(() => {
    const handleUpdate = () => {
      setNotifications(globalNotifications);
      setUnreadCount(globalUnreadCount);
      setLoading(globalLoading);
    };

    listeners.add(handleUpdate);
    // Initial sync
    handleUpdate();

    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  // Real-time SSE listener
  useEffect(() => {
    const channel = supabase
      .channel("app_realtime_notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new) {
            const newNotif: ClientNotification = {
              ...payload.new,
              is_read: false,
              dismissed: false,
            };

            // Check if this notification applies to the current user
            const appliesToMe =
              newNotif.target_type === "all" ||
              (currentUserId && String(newNotif.target_user_id) === String(currentUserId));

            if (appliesToMe) {
              // Avoid duplicates
              if (!globalNotifications.some((n) => n.id === newNotif.id)) {
                globalNotifications = [newNotif, ...globalNotifications];
                globalUnreadCount += 1;
                emitChange();

                // Show real-time toast alert
                const toastFn =
                  newNotif.type === "warning" || newNotif.type === "alert"
                    ? toast.warning
                    : newNotif.type === "success"
                      ? toast.success
                      : toast.info;

                toastFn(newNotif.title, {
                  description: newNotif.message,
                  duration: 6000,
                });
              }
            }
          } else if (payload.eventType === "DELETE" && payload.old) {
            const deletedId = payload.old.id;
            const existing = globalNotifications.find((n) => n.id === deletedId);
            if (existing) {
              globalNotifications = globalNotifications.filter(
                (n) => n.id !== deletedId,
              );
              if (!existing.is_read) {
                globalUnreadCount = Math.max(0, globalUnreadCount - 1);
              }
              emitChange();
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notification_state" },
        (payload: any) => {
          // If state for current user changed
          if (payload.new) {
            if (payload.new.action === "mark_all_read") {
              if (String(payload.new.user_id) === String(currentUserId)) {
                globalNotifications = globalNotifications.map((n) => ({
                  ...n,
                  is_read: true,
                }));
                globalUnreadCount = 0;
                emitChange();
              }
            } else if (String(payload.new.user_id) === String(currentUserId)) {
              const state = payload.new;
              globalNotifications = globalNotifications
                .map((n) => {
                  if (n.id === state.notification_id) {
                    return {
                      ...n,
                      is_read: state.is_read,
                      dismissed: state.dismissed,
                    };
                  }
                  return n;
                })
                .filter((n) => !n.dismissed);

              globalUnreadCount = globalNotifications.filter((n) => !n.is_read).length;
              emitChange();
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const markAsRead = async (id: string) => {
    // Optimistic update
    globalNotifications = globalNotifications.map((n) =>
      n.id === id ? { ...n, is_read: true } : n,
    );
    globalUnreadCount = globalNotifications.filter((n) => !n.is_read).length;
    emitChange();

    if (token) {
      try {
        await fetch(`/api/notifications/${id}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error("Failed to mark notification as read:", err);
      }
    }
  };

  const markAsUnread = async (id: string) => {
    // Optimistic update
    globalNotifications = globalNotifications.map((n) =>
      n.id === id ? { ...n, is_read: false } : n,
    );
    globalUnreadCount = globalNotifications.filter((n) => !n.is_read).length;
    emitChange();

    if (token) {
      try {
        await fetch(`/api/notifications/${id}/unread`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error("Failed to mark notification as unread:", err);
      }
    }
  };

  const markAllAsRead = async () => {
    // Optimistic update
    globalNotifications = globalNotifications.map((n) => ({
      ...n,
      is_read: true,
    }));
    globalUnreadCount = 0;
    emitChange();

    if (token) {
      try {
        await fetch("/api/notifications/read-all", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error("Failed to mark all as read:", err);
      }
    }
  };

  const dismissNotification = async (id: string) => {
    // Optimistic update
    const target = globalNotifications.find((n) => n.id === id);
    globalNotifications = globalNotifications.filter((n) => n.id !== id);
    if (target && !target.is_read) {
      globalUnreadCount = Math.max(0, globalUnreadCount - 1);
    }
    emitChange();

    if (token) {
      try {
        await fetch(`/api/notifications/${id}/dismiss`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error("Failed to dismiss notification:", err);
      }
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    refresh: fetchNotifications,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    dismissNotification,
  };
}
