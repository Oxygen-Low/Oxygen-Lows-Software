import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "../index";
import { repoManager } from "../lib/repoManager";

// Set environment variable to skip config errors
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

vi.mock("../lib/repoManager", () => ({
  repoManager: {
    createRepo: vi.fn(),
    getRepoPath: vi.fn(),
    uploadToStorage: vi.fn(),
    ensureLoaded: vi.fn(),
    getSafeTmpPath: vi.fn(),
    touchActivity: vi.fn(),
    git: vi.fn().mockReturnValue({
      branchLocal: vi
        .fn()
        .mockResolvedValue({ all: ["main"], current: "main" }),
    }),
  },
}));

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
        single: vi
          .fn()
          .mockResolvedValue({
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
  // Valid UUID for testing
  const validId = "12345678-1234-1234-1234-1234567890ab";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/repos should return 200 even without token (public)", async () => {
    const res = await request(app).get("/api/repos");
    expect(res.status).toBe(200);
  });

  it("POST /api/repos (old route) should return 404", async () => {
    const res = await request(app).post("/api/repos").send({ name: "test" });
    expect(res.status).toBe(404);
  });

  it("GET /api/repos/:id should return 200 for valid ID even without token (public)", async () => {
    // Explicitly use a lowercase UUID string to match regex case-sensitivity
    const res = await request(app).get("/api/repos/" + validId.toLowerCase());
    expect(res.status).toBe(200);
  });

  it("GET /api/repos should return repositories for authenticated user", async () => {
    const res = await request(app)
      .get("/api/repos")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  describe("Path Traversal Security Tests", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (repoManager.ensureLoaded as any).mockResolvedValue("/tmp/fake-repo");
      (repoManager.getSafeTmpPath as any).mockReturnValue("/tmp/fake-temp-dir");
    });

    it("POST /api/repos/:id/files should reject path traversal with ../", async () => {
      const res = await request(app)
        .post(`/api/repos/${validId}/files`)
        .set("Authorization", "Bearer valid-token")
        .send({
          filePath: "../../../etc/passwd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should reject absolute paths", async () => {
      const res = await request(app)
        .post(`/api/repos/${validId}/files`)
        .set("Authorization", "Bearer valid-token")
        .send({
          filePath: "/etc/passwd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should reject encoded path traversal", async () => {
      const res = await request(app)
        .post(`/api/repos/${validId}/files`)
        .set("Authorization", "Bearer valid-token")
        .send({
          filePath: "..%2F..%2F..%2Fetc%2Fpasswd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should reject paths with mixed traversal patterns", async () => {
      const res = await request(app)
        .post(`/api/repos/${validId}/files`)
        .set("Authorization", "Bearer valid-token")
        .send({
          filePath: "subdir/../../../../../../etc/passwd",
          content: "malicious content",
          branch: "main",
          message: "Attack attempt",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toBe("Invalid file path");
    });

    it("POST /api/repos/:id/files should accept valid relative paths", async () => {
      const res = await request(app)
        .post(`/api/repos/${validId}/files`)
        .set("Authorization", "Bearer valid-token")
        .send({
          filePath: "src/components/MyComponent.tsx",
          content: "export const MyComponent = () => <div>Hello</div>;",
          branch: "main",
          message: "Add component",
        });

      // Should not be rejected by path validation (may fail for other reasons in mock)
      expect(res.status).not.toBe(400);
      if (res.status === 400) {
        expect(res.body.error).not.toBe("Invalid file path");
      }
    });
  });
});
