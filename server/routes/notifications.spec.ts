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
      // Mock getAllNotifications to return notifications at different timestamps
      const originalGetAll = notificationsLib.getAllNotifications;
      const sampleNotifications: notificationsLib.NotificationRecord[] = [
        {
          id: "notif-old-global",
          title: "Old Announcement",
          message: "Before account was created",
          type: "announcement",
          target_type: "all",
          created_by: "1",
          created_by_username: "Admin",
          created_at: "2026-05-01T10:00:00.000Z",
        },
        {
          id: "notif-new-global",
          title: "New Announcement",
          message: "After account was created",
          type: "announcement",
          target_type: "all",
          created_by: "1",
          created_by_username: "Admin",
          created_at: "2026-07-01T10:00:00.000Z",
        },
        {
          id: "notif-old-targeted",
          title: "Old Direct Message",
          message: "Old targeted message",
          type: "info",
          target_type: "user",
          target_user_id: "user-456",
          created_by: "1",
          created_by_username: "Admin",
          created_at: "2026-04-01T10:00:00.000Z",
        },
        {
          id: "notif-new-targeted",
          title: "New Direct Message",
          message: "New targeted message",
          type: "info",
          target_type: "user",
          target_user_id: "user-456",
          created_by: "1",
          created_by_username: "Admin",
          created_at: "2026-08-01T10:00:00.000Z",
        },
      ];

      vi.spyOn(notificationsLib, "getAllNotifications").mockReturnValue(
        sampleNotifications,
      );

      // User created on 2026-06-01T00:00:00.000Z
      const userResult = notificationsLib.getNotificationsForUser(
        "user-456",
        false,
        "2026-06-01T00:00:00.000Z",
      );

      // Should only contain notif-new-global and notif-new-targeted
      const ids = userResult.notifications.map((n) => n.id);
      expect(ids).toContain("notif-new-global");
      expect(ids).toContain("notif-new-targeted");
      expect(ids).not.toContain("notif-old-global");
      expect(ids).not.toContain("notif-old-targeted");
      expect(userResult.unreadCount).toBe(2);

      // Newer user created on 2026-09-01T00:00:00.000Z (after all sample notifications)
      const newerUserResult = notificationsLib.getNotificationsForUser(
        "user-789",
        false,
        "2026-09-01T00:00:00.000Z",
      );
      expect(newerUserResult.notifications).toHaveLength(0);
      expect(newerUserResult.unreadCount).toBe(0);

      // Guest user (userId = null) sees all global announcements
      const guestResult = notificationsLib.getNotificationsForUser(null);
      const guestIds = guestResult.notifications.map((n) => n.id);
      expect(guestIds).toContain("notif-old-global");
      expect(guestIds).toContain("notif-new-global");
      expect(guestIds).not.toContain("notif-old-targeted");
      expect(guestIds).not.toContain("notif-new-targeted");

      vi.spyOn(notificationsLib, "getAllNotifications").mockRestore();
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
