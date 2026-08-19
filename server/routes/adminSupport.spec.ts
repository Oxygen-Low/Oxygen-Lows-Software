import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminSupportRouter } from "./adminSupport";
import { Hono } from "hono";

// We'll wrap the router in a standard Hono app to test it easily.
const app = new Hono();
// We simulate setting the SUPABASE_SECRET in env for getServiceRoleKey
app.use("*", async (c, next) => {
  c.env = { SUPABASE_SECRET: "mock-secret" };
  await next();
});
app.route("/", adminSupportRouter);

// Mock @supabase/supabase-js for the middleware
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn((_url: string, _key: string, options?: any) => {
      const authHeader = options?.global?.headers?.Authorization || "";
      const token = authHeader.replace(/^Bearer /i, "");
      return {
        auth: {
          getUser: vi.fn(async () => {
            if (token === "admin-token") {
              return {
                data: { user: { id: "3cb76293-8c6c-49b9-b431-1ff5fce471ee", email: "admin@example.com" } },
                error: null,
              };
            }
            if (token === "user-token") {
              return {
                data: { user: { id: "user-123", email: "test@example.com" } },
                error: null,
              };
            }
            return {
              data: { user: null },
              error: { message: "Invalid token" },
            };
          }),
        },
      };
    }),
  };
});

// Mock the supabase lib for route-specific queries
const mockSupabaseQueryMethods = {
  select: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  then: vi.fn(), // so await mockSupabaseQueryMethods doesn't blow up if someone expects it to be a promise
};

// Ensure select returns the chainable methods
mockSupabaseQueryMethods.select.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.neq.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.eq.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.order.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.in.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.single.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.insert.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.update.mockReturnValue(mockSupabaseQueryMethods);

const mockAdminClient = {
  from: vi.fn(() => mockSupabaseQueryMethods),
};

const mockAuthClient = {
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock("../lib/supabase.ts", () => {
  return {
    getAdminClient: vi.fn(() => mockAdminClient),
    getAuthenticatedClient: vi.fn(() => mockAuthClient),
  };
});

describe("Admin Support Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // We need the query builder to eventually resolve to a Promise with { data, error }
    // The easiest way is to mock it as a generic thenable that resolves to our expected default structure.
    const mockResult = { data: [], error: null };
    mockSupabaseQueryMethods.then = vi.fn((resolve) => resolve(mockResult));
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
      // We expect 200 because it proceeds to the mocked route logic
    });
  });

  describe("GET /tickets", () => {
    it("should fetch tickets and merge user profiles successfully", async () => {
      // First call is for tickets
      mockSupabaseQueryMethods.then
        .mockImplementationOnce((resolve: any) => resolve({
          data: [{ id: 1, user_id: "user-1" }, { id: 2, user_id: "user-2" }],
          error: null
        }))
        // Second call is for profiles
        .mockImplementationOnce((resolve: any) => resolve({
          data: [
            { user_id: "user-1", username: "alice", avatar_url: "url1" },
            { user_id: "user-2", username: "bob", avatar_url: "url2" }
          ],
          error: null
        }));

      const res = await app.request("/tickets", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tickets).toEqual([
        { id: 1, user_id: "user-1", profiles: { user_id: "user-1", username: "alice", avatar_url: "url1" } },
        { id: 2, user_id: "user-2", profiles: { user_id: "user-2", username: "bob", avatar_url: "url2" } }
      ]);
    });

    it("should handle supabase errors when fetching tickets", async () => {
      mockSupabaseQueryMethods.then
        .mockImplementationOnce((resolve: any) => resolve({
          data: null,
          error: new Error("Supabase error")
        }));

      const res = await app.request("/tickets", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Internal server error" });
    });
  });

  describe("GET /tickets/:id", () => {
    it("should fetch a specific ticket and its user profile successfully", async () => {
      // First call is for the ticket
      mockSupabaseQueryMethods.then
        .mockImplementationOnce((resolve: any) => resolve({
          data: { id: 123, user_id: "user-123", status: "Open" },
          error: null
        }))
        // Second call is for the profile
        .mockImplementationOnce((resolve: any) => resolve({
          data: { username: "charlie", avatar_url: "url3" },
          error: null
        }));

      const res = await app.request("/tickets/123", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ticket).toEqual({
        id: 123,
        user_id: "user-123",
        status: "Open",
        profiles: { username: "charlie", avatar_url: "url3" }
      });
    });

    it("should handle supabase errors when fetching a specific ticket", async () => {
      mockSupabaseQueryMethods.then
        .mockImplementationOnce((resolve: any) => resolve({
          data: null,
          error: new Error("Ticket fetch error")
        }));

      const res = await app.request("/tickets/123", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Internal server error" });
    });
  });

  describe("GET /tickets/:id/messages", () => {
    it("should fetch messages and merge sender profiles successfully", async () => {
      // First call is for messages
      mockSupabaseQueryMethods.then
        .mockImplementationOnce((resolve: any) => resolve({
          data: [
            { id: 1, ticket_id: 123, sender_id: "user-1", message: "Hello" },
            { id: 2, ticket_id: 123, sender_id: "admin-1", message: "Hi there" }
          ],
          error: null
        }))
        // Second call is for profiles
        .mockImplementationOnce((resolve: any) => resolve({
          data: [
            { user_id: "user-1", username: "alice", avatar_url: "url1" },
            { user_id: "admin-1", username: "admin", avatar_url: "url2" }
          ],
          error: null
        }));

      const res = await app.request("/tickets/123/messages", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.messages).toEqual([
        { id: 1, ticket_id: 123, sender_id: "user-1", message: "Hello", profiles: { user_id: "user-1", username: "alice", avatar_url: "url1" } },
        { id: 2, ticket_id: 123, sender_id: "admin-1", message: "Hi there", profiles: { user_id: "admin-1", username: "admin", avatar_url: "url2" } }
      ]);
    });

    it("should handle supabase errors when fetching messages", async () => {
      mockSupabaseQueryMethods.then
        .mockImplementationOnce((resolve: any) => resolve({
          data: null,
          error: new Error("Messages fetch error")
        }));

      const res = await app.request("/tickets/123/messages", {
        headers: { Authorization: "Bearer admin-token" },
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Internal server error" });
    });
  });

  describe("POST /tickets/:id/messages", () => {
    it("should reject requests without a message body", async () => {
      const res = await app.request("/tickets/123/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({}) // missing message
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: "Message is required" });
    });

    it("should reject if auth user is not found via getAuthenticatedClient", async () => {
      mockAuthClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Unauthorized") });

      const res = await app.request("/tickets/123/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: "Hello world" })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: "Unauthorized" });
    });

    it("should successfully post a new message", async () => {
      mockAuthClient.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: "admin-user-id" } },
        error: null
      });

      mockSupabaseQueryMethods.then.mockImplementationOnce((resolve: any) => resolve({
        data: { id: 1, ticket_id: 123, sender_id: "admin-user-id", message: "Hello world" },
        error: null
      }));

      const res = await app.request("/tickets/123/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: "Hello world" })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toEqual({
        id: 1, ticket_id: 123, sender_id: "admin-user-id", message: "Hello world"
      });
    });

    it("should handle supabase errors during insert", async () => {
      mockAuthClient.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: "admin-user-id" } },
        error: null
      });

      mockSupabaseQueryMethods.then.mockImplementationOnce((resolve: any) => resolve({
        data: null,
        error: new Error("Insert error")
      }));

      const res = await app.request("/tickets/123/messages", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: "Hello world" })
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Internal server error" });
    });
  });

  describe("PATCH /tickets/:id/status", () => {
    it("should reject requests with invalid status", async () => {
      const res = await app.request("/tickets/123/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: "InvalidStatus" })
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
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: "Invalid status" });
    });

    it("should update status successfully", async () => {
      mockSupabaseQueryMethods.then.mockImplementationOnce((resolve: any) => resolve({
        data: { id: 123, status: "Closed" },
        error: null
      }));

      const res = await app.request("/tickets/123/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: "Closed" })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ticket).toEqual({ id: 123, status: "Closed" });
    });

    it("should handle supabase errors during update", async () => {
      mockSupabaseQueryMethods.then.mockImplementationOnce((resolve: any) => resolve({
        data: null,
        error: new Error("Update error")
      }));

      const res = await app.request("/tickets/123/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: "Open" })
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Internal server error" });
    });
  });
});
