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
      };
    }
    if (token === "user-token") {
      return {
        id: "user-456",
        email: "user@example.com",
        username: "testuser",
        role: "user",
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
          action_url: "/changelogs",
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.notification.title).toBe("System Maintenance Notice");
      expect(data.notification.type).toBe("warning");
      expect(data.notification.target_type).toBe("all");
      expect(data.notification.action_url).toBe("/changelogs");

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
});
