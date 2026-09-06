import { Hono } from "hono";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "../lib/notifications.ts";

export const notificationsRouter = new Hono();

async function getAuthenticatedUser(c: any) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    token = c.req.query("token") || null;
  }
  if (!token) return null;
  return await resolveUserFromToken(token);
}

// GET /api/notifications - List notifications for user or guest
notificationsRouter.get("/", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    const includeDismissed = c.req.query("includeDismissed") === "true";
    const result = getNotificationsForUser(
      user ? String(user.id) : null,
      includeDismissed,
    );
    return c.json(result);
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to fetch notifications" },
      500,
    );
  }
});

// POST /api/notifications/read-all - Mark all unread notifications as read
notificationsRouter.post("/read-all", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const count = markAllNotificationsRead(String(user.id));
    return c.json({ success: true, count });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to mark all notifications as read" },
      500,
    );
  }
});

// POST /api/notifications/:id/read - Mark single notification as read
notificationsRouter.post("/:id/read", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const state = markNotificationRead(String(user.id), id, true);
    if (!state) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true, state });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to mark notification as read" },
      500,
    );
  }
});

// POST /api/notifications/:id/unread - Mark single notification as unread
notificationsRouter.post("/:id/unread", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const state = markNotificationRead(String(user.id), id, false);
    if (!state) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true, state });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to mark notification as unread" },
      500,
    );
  }
});

// POST /api/notifications/:id/dismiss - Dismiss notification
notificationsRouter.post("/:id/dismiss", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const success = dismissNotification(String(user.id), id);
    if (!success) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to dismiss notification" },
      500,
    );
  }
});
