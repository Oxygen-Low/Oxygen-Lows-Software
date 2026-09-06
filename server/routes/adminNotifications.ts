import { Hono } from "hono";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getAllNotifications,
  createNotification,
  deleteNotification,
  NotificationType,
  NotificationTargetType,
} from "../lib/notifications.ts";
import {
  getAllUserIds,
  getUserById,
  getUserByUsernameOrEmail,
  getProfileByUserId,
} from "../lib/dataStore.ts";

export const adminNotificationsRouter = new Hono();

// Middleware: Admin auth check
adminNotificationsRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : c.req.query("token") || null;

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  c.set("user" as any, user);
  await next();
});

// GET /api/admin/notifications - List all notifications with metadata
adminNotificationsRouter.get("/", async (c) => {
  try {
    const notifications = getAllNotifications();
    return c.json({ notifications, total: notifications.length });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to fetch admin notifications" },
      500,
    );
  }
});

// POST /api/admin/notifications - Create a new notification
adminNotificationsRouter.post("/", async (c) => {
  try {
    const adminUser = (c as any).get("user");
    const body = await c.req.json().catch(() => ({}));
    const { title, message, type, action_url, target_type, target_user } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return c.json({ error: "Notification title is required" }, 400);
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return c.json({ error: "Notification message is required" }, 400);
    }

    const validTypes: NotificationType[] = [
      "info",
      "announcement",
      "warning",
      "success",
      "alert",
    ];
    const notifType: NotificationType = validTypes.includes(type) ? type : "info";

    const targetType: NotificationTargetType =
      target_type === "user" ? "user" : "all";

    let targetUserId: string | null = null;
    let targetUsername: string | null = null;

    if (targetType === "user") {
      if (!target_user || typeof target_user !== "string" || !target_user.trim()) {
        return c.json(
          { error: "Target username or user ID is required for direct notifications" },
          400,
        );
      }

      const cleanTarget = target_user.trim();
      const foundUser =
        getUserByUsernameOrEmail(cleanTarget) || getUserById(cleanTarget);

      if (!foundUser) {
        return c.json(
          { error: `User "${cleanTarget}" was not found` },
          404,
        );
      }

      targetUserId = String(foundUser.id);
      targetUsername = foundUser.username || cleanTarget;
    }

    const newNotification = createNotification({
      title: title.trim(),
      message: message.trim(),
      type: notifType,
      action_url: action_url || null,
      target_type: targetType,
      target_user_id: targetUserId,
      target_username: targetUsername,
      created_by: String(adminUser.id),
      created_by_username: adminUser.username || "Admin",
    });

    return c.json({ success: true, notification: newNotification }, 201);
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to create notification" },
      500,
    );
  }
});

// DELETE /api/admin/notifications/:id - Delete/revoke notification
adminNotificationsRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const success = deleteNotification(id);
    if (!success) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to delete notification" },
      500,
    );
  }
});

// GET /api/admin/notifications/users - Search users for targeted notification
adminNotificationsRouter.get("/users", async (c) => {
  try {
    const query = (c.req.query("q") || "").trim().toLowerCase();
    const userIds = getAllUserIds();
    const users: { id: string; username: string; email: string }[] = [];

    for (const id of userIds) {
      const user = getUserById(id);
      if (!user) continue;
      const username = user.username || "";
      const email = user.email || "";

      if (
        !query ||
        username.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        String(id) === query
      ) {
        users.push({ id: String(id), username, email });
        if (users.length >= 20) break;
      }
    }

    return c.json({ users });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to search users" },
      500,
    );
  }
});
