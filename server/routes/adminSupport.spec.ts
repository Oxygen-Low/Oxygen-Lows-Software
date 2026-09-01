import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminSupportRouter } from "./adminSupport";
import { Hono } from "hono";

const app = new Hono();
app.route("/", adminSupportRouter);

let mockTickets: any[] = [];
let mockMessages: any[] = [];
let mockProfiles: Record<string, any> = {};

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
        id: "user-123",
        email: "test@example.com",
        username: "user",
        role: "user",
      };
    }
    return null;
  }),
}));

vi.mock("../lib/dataStore.ts", () => ({
  cleanupExpiredClosedTickets: vi.fn(),
  queryTable: vi.fn((opts: any) => {
    if (opts.table === "support_tickets") {
      let filtered = [...mockTickets];
      if (opts.filters?.some((f: any) => f.field === "id")) {
        const idFilter = opts.filters.find((f: any) => f.field === "id");
        filtered = filtered.filter(
          (t) => String(t.id) === String(idFilter.value),
        );
      }
      if (
        opts.filters?.some(
          (f: any) => f.field === "status" && f.operator === "neq",
        )
      ) {
        const statusFilter = opts.filters.find(
          (f: any) => f.field === "status" && f.operator === "neq",
        );
        filtered = filtered.filter(
          (t) => String(t.status) !== String(statusFilter.value),
        );
      }
      if (
        opts.filters?.some(
          (f: any) => f.field === "status" && f.operator === "eq",
        )
      ) {
        const statusFilter = opts.filters.find(
          (f: any) => f.field === "status" && f.operator === "eq",
        );
        filtered = filtered.filter(
          (t) => String(t.status) === String(statusFilter.value),
        );
      }
      return filtered;
    }
    if (opts.table === "support_messages") {
      if (opts.filters?.some((f: any) => f.field === "ticket_id")) {
        const ticketFilter = opts.filters.find(
          (f: any) => f.field === "ticket_id",
        );
        return mockMessages.filter(
          (m) => String(m.ticket_id) === String(ticketFilter.value),
        );
      }
      return mockMessages;
    }
    return [];
  }),
  getProfileByUserId: vi.fn((userId: string) => {
    return mockProfiles[userId] || null;
  }),
  insertTable: vi.fn((table: string, data: any) => {
    if (table === "support_messages") {
      const item = { id: 1, ...data };
      mockMessages.push(item);
      return [item];
    }
    return [data];
  }),
  updateTable: vi.fn((table: string, filters: any[], data: any) => {
    if (table === "support_tickets") {
      const idFilter = filters.find((f: any) => f.field === "id");
      const ticket = mockTickets.find(
        (t) => String(t.id) === String(idFilter?.value),
      );
      if (ticket) {
        Object.assign(ticket, data);
        return [ticket];
      }
    }
    return [];
  }),
}));

describe("Admin Support Routes", () => {
  beforeEach(() => {
    mockTickets = [];
    mockMessages = [];
    mockProfiles = {};
  });

  describe("Authorization Middleware", () => {
    it("should reject requests without Authorization header", async () => {
      const res = await app.request("/tickets");
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
    });

    it("should reject requests with invalid token", async () => {
      const res = await app.request("/tickets", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
    });

    it("should reject requests from non-admin users", async () => {
      const res = await app.request("/tickets", {
        headers: { Authorization: "Bearer user-token" },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({ error: "Forbidden: Admin access required" });
    });

    it("should allow requests from admin users", async () => {
      const res = await app.request("/tickets", {
        headers: { Authorization: "Bearer admin-token" },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("GET /tickets", () => {
    it("should fetch tickets and merge user profiles successfully", async () => {
      mockTickets = [
        { id: 1, user_id: "user-1", status: "Open" },
        { id: 2, user_id: "user-2", status: "Open" },
      ];
      mockProfiles = {
        "user-1": { user_id: "user-1", username: "alice", avatar_url: "url1" },
        "user-2": { user_id: "user-2", username: "bob", avatar_url: "url2" },
      };

      const res = await app.request("/tickets", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tickets).toEqual([
        {
          id: 1,
          user_id: "user-1",
          status: "Open",
          profiles: {
            user_id: "user-1",
            username: "alice",
            avatar_url: "url1",
          },
        },
        {
          id: 2,
          user_id: "user-2",
          status: "Open",
          profiles: { user_id: "user-2", username: "bob", avatar_url: "url2" },
        },
      ]);
    });

    it("should filter out closed tickets when hideClosed=true", async () => {
      mockTickets = [
        { id: 1, user_id: "user-1", status: "Open" },
        { id: 2, user_id: "user-2", status: "Closed" },
      ];
      mockProfiles = {
        "user-1": { user_id: "user-1", username: "alice", avatar_url: "url1" },
        "user-2": { user_id: "user-2", username: "bob", avatar_url: "url2" },
      };

      const res = await app.request("/tickets?hideClosed=true", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tickets.length).toBe(1);
      expect(data.tickets[0].id).toBe(1);
      expect(data.tickets[0].status).toBe("Open");
    });
  });

  describe("GET /tickets/:id", () => {
    it("should fetch a specific ticket and its user profile successfully", async () => {
      mockTickets = [{ id: 123, user_id: "user-123", status: "Open" }];
      mockProfiles = {
        "user-123": {
          user_id: "user-123",
          username: "charlie",
          avatar_url: "url3",
        },
      };

      const res = await app.request("/tickets/123", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ticket).toEqual({
        id: 123,
        user_id: "user-123",
        status: "Open",
        profiles: {
          user_id: "user-123",
          username: "charlie",
          avatar_url: "url3",
        },
      });
    });

    it("should return 404 when specific ticket is not found", async () => {
      mockTickets = [];

      const res = await app.request("/tickets/999", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ error: "Ticket not found" });
    });
  });

  describe("GET /tickets/:id/messages", () => {
    it("should fetch messages and merge sender profiles successfully", async () => {
      mockMessages = [
        { id: 1, ticket_id: 123, sender_id: "user-1", message: "Hello" },
        {
          id: 2,
          ticket_id: 123,
          sender_id: "1",
          message: "Hi there",
        },
      ];
      mockProfiles = {
        "user-1": { user_id: "user-1", username: "alice", avatar_url: "url1" },
        "1": { user_id: "1", username: "admin", avatar_url: "url2" },
      };

      const res = await app.request("/tickets/123/messages", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.messages).toEqual([
        {
          id: 1,
          ticket_id: 123,
          sender_id: "user-1",
          message: "Hello",
          profiles: {
            user_id: "user-1",
            username: "alice",
            avatar_url: "url1",
          },
        },
        {
          id: 2,
          ticket_id: 123,
          sender_id: "1",
          message: "Hi there",
          profiles: {
            user_id: "1",
            username: "admin",
            avatar_url: "url2",
          },
        },
      ]);
    });
  });

  describe("POST /tickets/:id/messages", () => {
    it("should reject requests without a message body", async () => {
      const res = await app.request("/tickets/123/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}), // missing message
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: "Message is required" });
    });

    it("should successfully post a new message", async () => {
      mockTickets = [{ id: 123, user_id: "user-1" }];

      const res = await app.request("/tickets/123/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "Hello world" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message.message).toBe("Hello world");
      expect(data.message.sender_id).toBe("1");
    });
  });

  describe("PATCH /tickets/:id/status", () => {
    it("should reject requests with invalid status", async () => {
      const res = await app.request("/tickets/123/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "InvalidStatus" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: "Invalid status" });
    });

    it("should reject requests without status", async () => {
      const res = await app.request("/tickets/123/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: "Invalid status" });
    });

    it("should update status successfully and track closed_at", async () => {
      mockTickets = [{ id: 123, status: "Open" }];

      const res = await app.request("/tickets/123/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Closed" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ticket.status).toBe("Closed");
      expect(data.ticket.closed_at).toBeDefined();

      const reopenRes = await app.request("/tickets/123/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "Open" }),
      });

      expect(reopenRes.status).toBe(200);
      const reopenData = await reopenRes.json();
      expect(reopenData.ticket.status).toBe("Open");
      expect(reopenData.ticket.closed_at).toBeNull();
    });
  });
});
