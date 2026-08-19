import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminVerificationRouter } from "./adminVerification";
import { Hono } from "hono";

const app = new Hono();
app.use("*", async (c, next) => {
  c.env = { SUPABASE_SECRET: "mock-secret" };
  await next();
});
app.route("/", adminVerificationRouter);

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
                data: {
                  user: {
                    id: "3cb76293-8c6c-49b9-b431-1ff5fce471ee",
                    email: "admin@example.com",
                  },
                },
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

const mockSupabaseQueryMethods: any = {
  select: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  then: vi.fn(),
};

mockSupabaseQueryMethods.select.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.neq.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.eq.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.order.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.in.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.single.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.insert.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.update.mockReturnValue(mockSupabaseQueryMethods);
mockSupabaseQueryMethods.delete.mockReturnValue(mockSupabaseQueryMethods);

const mockAdminClient = {
  from: vi.fn(() => mockSupabaseQueryMethods),
  storage: {
    from: vi.fn(() => ({
      download: vi.fn(async () => ({ data: Buffer.from("test"), error: null })),
      upload: vi.fn(async () => ({ data: {}, error: null })),
      remove: vi.fn(async () => ({ data: {}, error: null })),
    })),
  },
};

vi.mock("../lib/supabase.ts", () => {
  return {
    getAdminClient: vi.fn(() => mockAdminClient),
  };
});

describe("Admin Verification Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseQueryMethods.then = vi.fn((resolve) =>
      resolve({ data: [], error: null }),
    );
  });

  it("rejects unauthorized requests without token", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users with 403 Forbidden", async () => {
    const res = await app.request("/", {
      headers: { Authorization: "Bearer user-token" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  it("allows admin to fetch verifications", async () => {
    const mockVerifications = [
      {
        id: "v-1",
        user_id: "user-123",
        title: "Test File",
        status: "pending",
        asset_type: "file",
        target_type: "public_asset",
      },
    ];
    mockSupabaseQueryMethods.then = vi.fn((resolve) =>
      resolve({ data: mockVerifications, error: null }),
    );

    const res = await app.request("/", {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verifications).toBeDefined();
  });

  it("requires a denial reason when rejecting a submission", async () => {
    const res = await app.request("/v-1/reject", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("reason is required");
  });

  it("successfully rejects a submission with a reason", async () => {
    mockSupabaseQueryMethods.single.mockReturnValueOnce(
      Promise.resolve({
        data: { id: "v-1", status: "pending", title: "Test Asset" },
        error: null,
      }),
    );
    mockSupabaseQueryMethods.single.mockReturnValueOnce(
      Promise.resolve({
        data: {
          id: "v-1",
          status: "rejected",
          rejection_reason: "Violates terms",
        },
        error: null,
      }),
    );

    const res = await app.request("/v-1/reject", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "Violates terms" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("successfully approves a submission", async () => {
    mockSupabaseQueryMethods.single.mockReturnValueOnce(
      Promise.resolve({
        data: {
          id: "v-1",
          user_id: "user-123",
          status: "pending",
          title: "Test File",
          asset_type: "file",
          target_type: "public_asset",
          original_file_path: "user-123/test.png",
          file_size: 1024,
          mime_type: "image/png",
        },
        error: null,
      }),
    );
    // new asset insert single
    mockSupabaseQueryMethods.single.mockReturnValueOnce(
      Promise.resolve({
        data: { id: "pa-1", name: "Test File" },
        error: null,
      }),
    );
    // update verification single
    mockSupabaseQueryMethods.single.mockReturnValueOnce(
      Promise.resolve({
        data: {
          id: "v-1",
          status: "approved",
          public_asset_id: "pa-1",
        },
        error: null,
      }),
    );

    const res = await app.request("/v-1/approve", {
      method: "POST",
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
