import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServer } from "../index";

// Set environment variable to skip config errors
process.env.SUPABASE_SECRET = "test-key";

// Simple mock for supabase
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "123" } }, error: null }),
        admin: {
          getUserById: vi
            .fn()
            .mockResolvedValue({ data: { user: { id: "123" } }, error: null }),
        },
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "12345678-1234-1234-1234-1234567890ab",
            owner_id: "123",
            github_repo_full_name: "test/repo",
            profiles: { username: "testuser" },
          },
          error: null,
        }),
        order: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation(function (onfulfilled) {
          return Promise.resolve({
            data: [
              { id: "12345678-1234-1234-1234-1234567890ab", owner_id: "123" },
            ],
            error: null,
          }).then(onfulfilled);
        }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      },
    })),
  };
});

describe("Repos Routes", () => {
  const app = createServer();
  const validId = "12345678-1234-1234-1234-1234567890ab";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/repos should return 200", async () => {
    const res = await app.request("/api/repos");
    expect(res.status).toBe(200);
  });

  it("POST /api/repos (old route) should return 404", async () => {
    const res = await app.request("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBe(404);
  });

  it("GET /api/repos/:id should return 200 for valid ID", async () => {
    const res = await app.request("/api/repos/" + validId.toLowerCase());
    expect(res.status).toBe(200);
  });

  it("GET /api/repos should return repositories for authenticated user", async () => {
    const res = await app.request("/api/repos", {
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  describe("Path Traversal Security Tests", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("POST /api/repos/:id/files should reject path traversal with ../", async () => {
      const res = await app.request(`/api/repos/${validId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
          "x-github-token": "test-token",
        },
        body: JSON.stringify({
          filePath: "../../../etc/passwd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should reject absolute paths", async () => {
      const res = await app.request(`/api/repos/${validId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
          "x-github-token": "test-token",
        },
        body: JSON.stringify({
          filePath: "/etc/passwd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should reject encoded path traversal", async () => {
      const res = await app.request(`/api/repos/${validId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
          "x-github-token": "test-token",
        },
        body: JSON.stringify({
          filePath: "..%2F..%2F..%2Fetc%2Fpasswd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should reject paths with mixed traversal patterns", async () => {
      const res = await app.request(`/api/repos/${validId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
          "x-github-token": "test-token",
        },
        body: JSON.stringify({
          filePath: "subdir/../../../../../../etc/passwd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should accept valid relative paths", async () => {
      const res = await app.request(`/api/repos/${validId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
          "x-github-token": "test-github-token",
        },
        body: JSON.stringify({
          filePath: "src/components/MyComponent.tsx",
          content: "export const MyComponent = () => <div>Hello</div>;",
          branch: "main",
          message: "Add component",
        }),
      });
      // Should not be rejected by path validation (may fail for other reasons in mock)
      expect(res.status).not.toBe(400);
    });
  });
});
