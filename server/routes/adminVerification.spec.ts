import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminVerificationRouter } from "./adminVerification";
import { serverStorage } from "../lib/storage";
import { Hono } from "hono";

const app = new Hono();
app.route("/", adminVerificationRouter);

let mockVerifications: any[] = [];
let mockPublicAssets: any[] = [];
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

vi.mock("../lib/storage.ts", () => ({
  serverStorage: {
    download: vi.fn(async () => ({ data: Buffer.from("test"), error: null })),
    upload: vi.fn(async () => ({ data: {}, error: null })),
    remove: vi.fn(async () => ({ data: {}, error: null })),
    move: vi.fn(async () => ({ data: { path: "test.png" }, error: null })),
  },
}));

vi.mock("../lib/dataStore.ts", () => ({
  queryTable: vi.fn((opts: any) => {
    if (opts.table === "asset_verifications") {
      if (opts.filters?.some((f: any) => f.field === "id")) {
        const idFilter = opts.filters.find((f: any) => f.field === "id");
        return mockVerifications.filter(
          (v) => String(v.id) === String(idFilter.value),
        );
      }
      return mockVerifications;
    }
    if (opts.table === "public_assets") {
      if (opts.filters?.some((f: any) => f.field === "id")) {
        const idFilter = opts.filters.find((f: any) => f.field === "id");
        return mockPublicAssets.filter(
          (a) => String(a.id) === String(idFilter.value),
        );
      }
      return mockPublicAssets;
    }
    return [];
  }),
  getProfileByUserId: vi.fn((userId: string) => {
    return mockProfiles[userId] || null;
  }),
  insertTable: vi.fn((table: string, data: any) => {
    if (table === "public_assets") {
      const item = { id: "pa-1", ...data };
      mockPublicAssets.push(item);
      return [item];
    }
    return [data];
  }),
  updateTable: vi.fn((table: string, filters: any[], data: any) => {
    if (table === "asset_verifications") {
      const idFilter = filters.find((f: any) => f.field === "id");
      const v = mockVerifications.find(
        (item) => String(item.id) === String(idFilter?.value),
      );
      if (v) {
        Object.assign(v, data);
        return [v];
      }
    }
    return [];
  }),
  deleteTable: vi.fn((table: string, filters: any[]) => {
    if (table === "asset_verifications") {
      const idFilter = filters.find((f: any) => f.field === "id");
      const idx = mockVerifications.findIndex(
        (item) => String(item.id) === String(idFilter?.value),
      );
      if (idx !== -1) {
        return mockVerifications.splice(idx, 1);
      }
    }
    return [];
  }),
}));

describe("Admin Verification Routes", () => {
  beforeEach(() => {
    mockVerifications = [];
    mockPublicAssets = [];
    mockProfiles = {};
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
    mockVerifications = [
      {
        id: "v-1",
        user_id: "user-123",
        title: "Test File",
        status: "pending",
        asset_type: "file",
        target_type: "public_asset",
      },
    ];

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
    mockVerifications = [{ id: "v-1", status: "pending", title: "Test Asset" }];

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
    expect(body.verification.status).toBe("rejected");
    expect(body.verification.rejection_reason).toBe("Violates terms");
  });

  it("successfully approves a submission", async () => {
    mockVerifications = [
      {
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
    ];

    const res = await app.request("/v-1/approve", {
      method: "POST",
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.verification.status).toBe("approved");
    expect(serverStorage.move).toHaveBeenCalledWith(
      "Storage",
      "user-123/test.png",
      "public-assets",
      "user-123/test.png",
    );
  });
});
