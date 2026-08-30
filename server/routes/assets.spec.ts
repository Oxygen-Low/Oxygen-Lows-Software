import { describe, it, expect, vi, beforeEach } from "vitest";
import { assetsRouter } from "./assets";
import { Hono } from "hono";

const app = new Hono();
app.route("/", assetsRouter);

let mockVerifications: any[] = [];

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async (token: string) => {
    if (token === "user-token") {
      return {
        id: "user-123",
        email: "test@example.com",
        username: "user123",
        role: "user",
      };
    }
    if (token === "other-user-token") {
      return {
        id: "user-other",
        email: "other@example.com",
        username: "other",
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
  },
}));

vi.mock("../lib/dataStore.ts", () => ({
  queryTable: vi.fn((opts: any) => {
    if (opts.table === "asset_verifications") {
      if (opts.filters?.some((f: any) => f.field === "id")) {
        const idFilter = opts.filters.find((f: any) => f.field === "id");
        return mockVerifications.filter((v) => String(v.id) === String(idFilter.value));
      }
      if (opts.userId) {
        return mockVerifications.filter((v) => String(v.user_id) === String(opts.userId));
      }
      return mockVerifications;
    }
    return [];
  }),
  insertTable: vi.fn((table: string, data: any, userId: string) => {
    if (table === "asset_verifications") {
      const item = { id: data.id || "v-inserted", user_id: userId, ...data };
      mockVerifications.push(item);
      return [item];
    }
    return [data];
  }),
  updateTable: vi.fn((table: string, filters: any[], data: any) => {
    return [data];
  }),
  deleteTable: vi.fn((table: string, filters: any[]) => {
    if (table === "asset_verifications") {
      const idFilter = filters.find((f: any) => f.field === "id");
      if (idFilter) {
        const idx = mockVerifications.findIndex((v) => String(v.id) === String(idFilter.value));
        if (idx !== -1) {
          return mockVerifications.splice(idx, 1);
        }
      }
      const pathFilter = filters.find((f: any) => f.field === "original_file_path");
      if (pathFilter) {
        const idx = mockVerifications.findIndex((v) => String(v.original_file_path) === String(pathFilter.value));
        if (idx !== -1) {
          return mockVerifications.splice(idx, 1);
        }
      }
    }
    return [];
  }),
}));

describe("Assets & Verification Routes", () => {
  beforeEach(() => {
    mockVerifications = [];
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/verifications/my");
    expect(res.status).toBe(401);
  });

  it("fetches current user's verifications", async () => {
    mockVerifications = [
      { id: "v-1", user_id: "user-123", title: "Test File", status: "pending" },
    ];

    const res = await app.request("/verifications/my", {
      headers: { Authorization: "Bearer user-token" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verifications).toHaveLength(1);
    expect(json.verifications[0].id).toBe("v-1");
  });

  it("submits verification and clears previous verifications for the file", async () => {
    mockVerifications = [
      {
        id: "v-old",
        user_id: "user-123",
        title: "Old Song",
        original_file_path: "user-123/song.mp3",
      },
    ];

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
  });

  it("deletes user's own verification request", async () => {
    mockVerifications = [
      {
        id: "v-100",
        user_id: "user-123",
        asset_type: "file",
        status: "pending",
        target_type: "public_usage",
      },
    ];

    const res = await app.request("/verifications/v-100", {
      method: "DELETE",
      headers: { Authorization: "Bearer user-token" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockVerifications).toHaveLength(0);
  });

  it("forbids deleting another user's verification request", async () => {
    mockVerifications = [
      {
        id: "v-100",
        user_id: "user-123",
        asset_type: "file",
        status: "pending",
      },
    ];

    const res = await app.request("/verifications/v-100", {
      method: "DELETE",
      headers: { Authorization: "Bearer other-user-token" },
    });

    expect(res.status).toBe(403);
  });
});
