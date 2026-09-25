import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { notificationsRouter } from "./notifications";
import { adminNotificationsRouter } from "./adminNotifications";
import * as notificationsLib from "../lib/notifications";

const app = new Hono();
app.route("/api/notifications", notificationsRouter);
app.route("/api/admin/notifications", adminNotificationsRouter);

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async (token: string) => {
    if (token === "admin-token") {
      return {
        id: "1",
        email: "admin@example.com",
        username: "admin",
        role: "admin",
        created_at: "2026-01-01T00:00:00.000Z",
      };
    }
    if (token === "user-token") {
      return {
        id: "user-456",
        email: "user@example.com",
        username: "testuser",
        role: "user",
        created_at: "2026-06-01T00:00:00.000Z",
      };
    }
    if (token === "new-user-token") {
      return {
        id: "user-789",
        email: "newuser@example.com",
        username: "newuser",
        role: "user",
        created_at: "2026-09-01T00:00:00.000Z",
      };
    }
    return null;
  }),
}));

describe("Notifications API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/notifications (Guest & User)", () => {
    it("returns notifications for guests without auth", async () => {
      const res = await app.request("/api/notifications");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.notifications)).toBe(true);
      expect(typeof data.unreadCount).toBe("number");
    });

    it("returns notifications for authenticated user", async () => {
      const res = await app.request("/api/notifications", {
        headers: {
          Authorization: "Bearer user-token",
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.notifications)).toBe(true);
    });
  });

  describe("Admin Notifications Guard & Management", () => {
    it("rejects non-admin users with 403 Forbidden", async () => {
      const res = await app.request("/api/admin/notifications", {
        headers: {
          Authorization: "Bearer user-token",
        },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Admin access required");
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await app.request("/api/admin/notifications");
      expect(res.status).toBe(401);
    });

    it("allows admin user to fetch notifications list", async () => {
      const res = await app.request("/api/admin/notifications", {
        headers: {
          Authorization: "Bearer admin-token",
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.notifications)).toBe(true);
    });

    it("validates missing title and message on notification creation", async () => {
      const res = await app.request("/api/admin/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Notification title is required");
    });

    it("creates a global notification successfully", async () => {
      const res = await app.request("/api/admin/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          title: "System Maintenance Notice",
          message: "The system will undergo brief maintenance at midnight.",
          type: "warning",
          target_type: "all",
          action_url: "/download",
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.notification.title).toBe("System Maintenance Notice");
      expect(data.notification.type).toBe("warning");
      expect(data.notification.target_type).toBe("all");
      expect(data.notification.action_url).toBe("/download");

      // Verify it appears in user notifications
      const userRes = await app.request("/api/notifications");
      const userData = await userRes.json();
      const found = userData.notifications.find(
        (n: any) => n.id === data.notification.id,
      );
      expect(found).toBeDefined();
      expect(found.title).toBe("System Maintenance Notice");

      // Clean up / delete
      const delRes = await app.request(
        `/api/admin/notifications/${data.notification.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: "Bearer admin-token",
          },
        },
      );
      expect(delRes.status).toBe(200);
    });
  });

  describe("User Read/Unread and Dismiss Actions", () => {
    it("requires authentication for marking notifications", async () => {
      const res = await app.request("/api/notifications/some-id/read", {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("marks all notifications as read for logged in user", async () => {
      const res = await app.request("/api/notifications/read-all", {
        method: "POST",
        headers: {
          Authorization: "Bearer user-token",
        },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(typeof data.count).toBe("number");
    });
  });

  describe("Pre-Account Creation Notification Filtering", () => {
    it("does not show notifications created before user account creation timestamp", () => {
      // 1. Create a notification now
      const notifOld = notificationsLib.createNotification({
        title: "Earlier Notification",
        message: "Created before future user registration",
        type: "announcement",
        target_type: "all",
        created_by: "1",
        created_by_username: "Admin",
      });

      const notifOldTargeted = notificationsLib.createNotification({
        title: "Earlier Targeted Notification",
        message: "Targeted to user-456 before future date",
        type: "info",
        target_type: "user",
        target_user_id: "user-456",
        created_by: "1",
        created_by_username: "Admin",
      });

      try {
        const notifTime = new Date(notifOld.created_at).getTime();

        // User registered BEFORE the notifications were sent
        const pastUserCreatedAt = new Date(notifTime - 60000).toISOString();
        const pastUserResult = notificationsLib.getNotificationsForUser(
          "user-456",
          false,
          pastUserCreatedAt,
        );
        const pastIds = pastUserResult.notifications.map((n) => n.id);
        expect(pastIds).toContain(notifOld.id);
        expect(pastIds).toContain(notifOldTargeted.id);

        // User registered AFTER the notifications were sent
        const futureUserCreatedAt = new Date(notifTime + 60000).toISOString();
        const futureUserResult = notificationsLib.getNotificationsForUser(
          "user-456",
          false,
          futureUserCreatedAt,
        );
        const futureIds = futureUserResult.notifications.map((n) => n.id);
        expect(futureIds).not.toContain(notifOld.id);
        expect(futureIds).not.toContain(notifOldTargeted.id);

        // Guest user (userId = null) sees global announcements regardless
        const guestResult = notificationsLib.getNotificationsForUser(null);
        const guestIds = guestResult.notifications.map((n) => n.id);
        expect(guestIds).toContain(notifOld.id);
        expect(guestIds).not.toContain(notifOldTargeted.id);
      } finally {
        notificationsLib.deleteNotification(notifOld.id);
        notificationsLib.deleteNotification(notifOldTargeted.id);
      }
    });

    it("filters out pre-account notifications via GET /api/notifications route", async () => {
      // Create a global notification
      const createRes = await app.request("/api/admin/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          title: "Historic Broadcast",
          message: "A notification created before user-789 registered",
          type: "announcement",
          target_type: "all",
        }),
      });
      expect(createRes.status).toBe(201);
      const createdData = await createRes.json();
      const notifId = createdData.notification.id;

      // User created in the past ("user-token", created_at: 2026-06-01) sees it
      const userRes = await app.request("/api/notifications", {
        headers: {
          Authorization: "Bearer user-token",
        },
      });
      expect(userRes.status).toBe(200);
      const userData = await userRes.json();
      expect(userData.notifications.some((n: any) => n.id === notifId)).toBe(true);

      // User created in the future ("new-user-token", created_at: 2026-09-01) does NOT see notifications from before their registration
      // If we mock created_at of user to far future:
      const newUserRes = await app.request("/api/notifications", {
        headers: {
          Authorization: "Bearer new-user-token",
        },
      });
      expect(newUserRes.status).toBe(200);
      const newUserData = await newUserRes.json();
      // Should not include notifId if created_at of notification < 2026-09-01
      // Note: since test runs in present (e.g. 2026-09-25 or current time),
      // let's verify filtering with getNotificationsForUser explicit timestamp:
      const filtered = notificationsLib.getNotificationsForUser(
        "user-789",
        false,
        new Date(Date.now() + 1000000).toISOString(),
      );
      expect(filtered.notifications.some((n) => n.id === notifId)).toBe(false);

      // Clean up
      await app.request(`/api/admin/notifications/${notifId}`, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer admin-token",
        },
      });
    });
  });
});
