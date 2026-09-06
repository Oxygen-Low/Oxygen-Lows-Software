import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./dataStore.ts";
import { broadcastChange } from "./realtime.ts";

export const NOTIFICATIONS_DIR = path.join(DATA_DIR, "notifications");
const NOTIFICATIONS_FILE = path.join(NOTIFICATIONS_DIR, "notifications.json");
const USER_STATE_FILE = path.join(NOTIFICATIONS_DIR, "user_state.json");

export type NotificationType =
  | "info"
  | "announcement"
  | "warning"
  | "success"
  | "alert";

export type NotificationTargetType = "all" | "user";

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  action_url?: string | null;
  target_type: NotificationTargetType;
  target_user_id?: string | null;
  target_username?: string | null;
  created_by: string;
  created_by_username: string;
  created_at: string;
}

export interface UserNotificationState {
  id: string;
  user_id: string;
  notification_id: string;
  is_read: boolean;
  dismissed: boolean;
  updated_at: string;
}

export interface ClientNotificationItem extends NotificationRecord {
  is_read: boolean;
  dismissed: boolean;
}

function ensureNotificationsDir() {
  if (!fs.existsSync(NOTIFICATIONS_DIR)) {
    fs.mkdirSync(NOTIFICATIONS_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

function writeJsonFile(filePath: string, data: any) {
  ensureNotificationsDir();
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}

export function getAllNotifications(): NotificationRecord[] {
  const records = readJsonFile<NotificationRecord[]>(NOTIFICATIONS_FILE, []);
  return records.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getNotificationById(id: string): NotificationRecord | null {
  const records = getAllNotifications();
  return records.find((n) => n.id === id) || null;
}

function getAllUserStates(): UserNotificationState[] {
  return readJsonFile<UserNotificationState[]>(USER_STATE_FILE, []);
}

function saveUserStates(states: UserNotificationState[]) {
  writeJsonFile(USER_STATE_FILE, states);
}

export function getUserNotificationStates(
  userId: string,
): Map<string, UserNotificationState> {
  const allStates = getAllUserStates();
  const userStates = allStates.filter((s) => String(s.user_id) === String(userId));
  const map = new Map<string, UserNotificationState>();
  for (const s of userStates) {
    map.set(s.notification_id, s);
  }
  return map;
}

export function createNotification(params: {
  title: string;
  message: string;
  type: NotificationType;
  action_url?: string | null;
  target_type: NotificationTargetType;
  target_user_id?: string | null;
  target_username?: string | null;
  created_by: string;
  created_by_username: string;
}): NotificationRecord {
  const records = getAllNotifications();
  const newNotification: NotificationRecord = {
    id: crypto.randomUUID(),
    title: params.title.trim(),
    message: params.message.trim(),
    type: params.type || "info",
    action_url: params.action_url ? params.action_url.trim() : null,
    target_type: params.target_type || "all",
    target_user_id:
      params.target_type === "user" ? params.target_user_id || null : null,
    target_username:
      params.target_type === "user" ? params.target_username || null : null,
    created_by: params.created_by,
    created_by_username: params.created_by_username,
    created_at: new Date().toISOString(),
  };

  records.unshift(newNotification);
  writeJsonFile(NOTIFICATIONS_FILE, records);

  // Broadcast real-time change
  try {
    broadcastChange({
      table: "notifications",
      event: "INSERT",
      schema: "public",
      new: newNotification,
      old: null,
      targetUserId:
        newNotification.target_type === "user"
          ? String(newNotification.target_user_id)
          : undefined,
    });
  } catch (err) {
    console.error("Failed to broadcast notification event:", err);
  }

  return newNotification;
}

export function deleteNotification(id: string): boolean {
  const records = getAllNotifications();
  const index = records.findIndex((n) => n.id === id);
  if (index === -1) return false;

  const [deleted] = records.splice(index, 1);
  writeJsonFile(NOTIFICATIONS_FILE, records);

  // Broadcast deletion
  try {
    broadcastChange({
      table: "notifications",
      event: "DELETE",
      schema: "public",
      new: null,
      old: deleted,
      targetUserId:
        deleted.target_type === "user"
          ? String(deleted.target_user_id)
          : undefined,
    });
  } catch (err) {
    console.error("Failed to broadcast notification deletion:", err);
  }

  return true;
}

export function getNotificationsForUser(
  userId: string | null,
  includeDismissed = false,
): { notifications: ClientNotificationItem[]; unreadCount: number } {
  const allNotifications = getAllNotifications();

  // If user is guest, they only see global announcements
  if (!userId) {
    const guestItems = allNotifications
      .filter((n) => n.target_type === "all")
      .map((n) => ({
        ...n,
        is_read: false,
        dismissed: false,
      }));
    return {
      notifications: guestItems,
      unreadCount: guestItems.length,
    };
  }

  const userStates = getUserNotificationStates(userId);
  const userItems: ClientNotificationItem[] = [];

  for (const n of allNotifications) {
    // Only include if targeted to all or targeted to this specific user
    if (
      n.target_type !== "all" &&
      String(n.target_user_id) !== String(userId)
    ) {
      continue;
    }

    const state = userStates.get(n.id);
    const isDismissed = state?.dismissed || false;
    const isRead = state?.is_read || false;

    if (isDismissed && !includeDismissed) {
      continue;
    }

    userItems.push({
      ...n,
      is_read: isRead,
      dismissed: isDismissed,
    });
  }

  const unreadCount = userItems.filter((n) => !n.is_read && !n.dismissed).length;

  return {
    notifications: userItems,
    unreadCount,
  };
}

export function markNotificationRead(
  userId: string,
  notificationId: string,
  isRead: boolean,
): UserNotificationState | null {
  const notification = getNotificationById(notificationId);
  if (!notification) return null;

  const allStates = getAllUserStates();
  const stateId = `${userId}_${notificationId}`;
  const existingIdx = allStates.findIndex(
    (s) => String(s.user_id) === String(userId) && s.notification_id === notificationId,
  );

  let updatedState: UserNotificationState;
  const now = new Date().toISOString();

  if (existingIdx !== -1) {
    allStates[existingIdx].is_read = isRead;
    allStates[existingIdx].updated_at = now;
    updatedState = allStates[existingIdx];
  } else {
    updatedState = {
      id: stateId,
      user_id: String(userId),
      notification_id: notificationId,
      is_read: isRead,
      dismissed: false,
      updated_at: now,
    };
    allStates.push(updatedState);
  }

  saveUserStates(allStates);

  try {
    broadcastChange({
      table: "user_notification_state",
      event: "UPDATE",
      schema: "public",
      new: updatedState,
      old: null,
      targetUserId: String(userId),
    });
  } catch (err) {
    console.error("Failed to broadcast notification state change:", err);
  }

  return updatedState;
}

export function markAllNotificationsRead(userId: string): number {
  const { notifications } = getNotificationsForUser(userId, false);
  const unreadNotifications = notifications.filter((n) => !n.is_read);
  if (unreadNotifications.length === 0) return 0;

  const allStates = getAllUserStates();
  const now = new Date().toISOString();
  let count = 0;

  for (const n of unreadNotifications) {
    const existingIdx = allStates.findIndex(
      (s) => String(s.user_id) === String(userId) && s.notification_id === n.id,
    );
    if (existingIdx !== -1) {
      allStates[existingIdx].is_read = true;
      allStates[existingIdx].updated_at = now;
    } else {
      allStates.push({
        id: `${userId}_${n.id}`,
        user_id: String(userId),
        notification_id: n.id,
        is_read: true,
        dismissed: false,
        updated_at: now,
      });
    }
    count++;
  }

  saveUserStates(allStates);

  try {
    broadcastChange({
      table: "user_notification_state",
      event: "UPDATE",
      schema: "public",
      new: { user_id: String(userId), action: "mark_all_read" },
      old: null,
      targetUserId: String(userId),
    });
  } catch (err) {
    console.error("Failed to broadcast mark all read:", err);
  }

  return count;
}

export function dismissNotification(
  userId: string,
  notificationId: string,
): boolean {
  const notification = getNotificationById(notificationId);
  if (!notification) return false;

  const allStates = getAllUserStates();
  const stateId = `${userId}_${notificationId}`;
  const existingIdx = allStates.findIndex(
    (s) => String(s.user_id) === String(userId) && s.notification_id === notificationId,
  );

  const now = new Date().toISOString();
  let updatedState: UserNotificationState;

  if (existingIdx !== -1) {
    allStates[existingIdx].dismissed = true;
    allStates[existingIdx].updated_at = now;
    updatedState = allStates[existingIdx];
  } else {
    updatedState = {
      id: stateId,
      user_id: String(userId),
      notification_id: notificationId,
      is_read: true,
      dismissed: true,
      updated_at: now,
    };
    allStates.push(updatedState);
  }

  saveUserStates(allStates);

  try {
    broadcastChange({
      table: "user_notification_state",
      event: "UPDATE",
      schema: "public",
      new: updatedState,
      old: null,
      targetUserId: String(userId),
    });
  } catch (err) {
    console.error("Failed to broadcast dismiss state change:", err);
  }

  return true;
}
