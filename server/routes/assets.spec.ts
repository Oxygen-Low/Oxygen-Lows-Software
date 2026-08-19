import { describe, it, expect, vi, beforeEach } from "vitest";
import { assetsRouter } from "./assets";
import { Hono } from "hono";

const app = new Hono();
app.use("*", async (c, next) => {
  c.env = { SUPABASE_SECRET: "mock-secret" };
  await next();
});
app.route("/", assetsRouter);

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn((_url: string, _key: string, options?: any) => {
      const authHeader = options?.global?.headers?.Authorization || "";
      const token = authHeader.replace(/^Bearer /i, "");
      return {
        auth: {
          getUser: vi.fn(async () => {
            if (token === "user-token") {
              return {
                data: {
                  user: {
                    id: "user-123",
                    email: "test@example.com",
                  },
                },
                error: null,
              };
            }
            if (token === "other-user-token") {
              return {
                data: {
                  user: {
                    id: "user-other",
                    email: "other@example.com",
                  },
                },
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

const mockSupabaseQueryMethods: any = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  then: vi.fn(),
};

mockSupabaseQueryMethods.select.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.eq.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.order.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.single.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.insert.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.update.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.delete.mockReturnValue(mockSupabaseQueryMethods);

const mockAdminClient = {
  from: vi.fn(() => mockSupabaseQueryMethods),
  storage: {
    from: vi.fn(() => ({
      remove: vi.fn(async () => ({ data: {}, error: null })),
    })),
  },
};

vi.mock("../lib/supabase.ts", () => {
  return {
    getAdminClient: vi.fn(() => mockAdminClient),
  };
});

describe("Assets & Verification Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseQueryMethods.then = vi.fn((resolve) =>
      resolve({ data: [], error: null }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/verifications/my");
    expect(res.status).toBe(401);
  });

  it("fetches current user's verifications", async () => {
    mockSupabaseQueryMethods.then = vi.fn((resolve) =>
      resolve({
        data: [{ id: "v-1", title: "Test File", status: "pending" }],
        error: null,
      }),
    );

    const res = await app.request("/verifications/my", {
      headers: { Authorization: "Bearer user-token" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verifications).toHaveLength(1);
    expect(json.verifications[0].id).toBe("v-1");
  });

  it("submits verification and clears previous verifications for the file", async () => {
    mockSupabaseQueryMethods.then = vi.fn((resolve) =>
      resolve({
        data: { id: "v-2", title: "My Song", status: "pending" },
        error: null,
      }),
    );

    const res = await app.request("/verifications/submit", {
      method: "POST",
      headers: {
        Authorization: "Bearer user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        asset_type: "file",
        target_type: "public_usage",
        title: "My Song",
        original_file_path: "user-123/song.mp3",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.verification.title).toBe("My Song");
    // Verify delete was called to remove prior verifications
    expect(mockSupabaseQueryMethods.delete).toHaveBeenCalled();
  });

  it("deletes user's own verification request", async () => {
    mockSupabaseQueryMethods.then = vi.fn((resolve) =>
      resolve({
        data: {
          id: "v-100",
          user_id: "user-123",
          asset_type: "file",
          status: "pending",
          target_type: "public_usage",
        },
        error: null,
      }),
    );

    const res = await app.request("/verifications/v-100", {
      method: "DELETE",
      headers: { Authorization: "Bearer user-token" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("forbids deleting another user's verification request", async () => {
    mockSupabaseQueryMethods.then = vi.fn((resolve) =>
      resolve({
        data: {
          id: "v-100",
          user_id: "user-123",
          asset_type: "file",
          status: "pending",
        },
        error: null,
      }),
    );

    const res = await app.request("/verifications/v-100", {
      method: "DELETE",
      headers: { Authorization: "Bearer other-user-token" },
    });

    expect(res.status).toBe(403);
  });
});
