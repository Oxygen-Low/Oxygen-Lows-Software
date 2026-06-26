import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "../index";
import { repoManager } from "../lib/repoManager";

vi.mock("../lib/repoManager", () => ({
  repoManager: {
    createRepo: vi.fn(),
    getRepoPath: vi.fn(),
    uploadToStorage: vi.fn(),
    ensureLoaded: vi.fn(),
    getSafeTmpPath: vi.fn()
  }
}));

// Simple mock for supabase
vi.mock("@supabase/supabase-js", () => {
    return {
        createClient: vi.fn(() => ({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "123" } }, error: null }),
                admin: {
                    getUserById: vi.fn().mockResolvedValue({ data: { user: { id: "123" } }, error: null })
                }
            },
            from: vi.fn(() => ({
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: "repo-123", owner_id: "123", storage_path: "path/to/zip" }, error: null }),
                order: vi.fn().mockReturnThis(),
                insert: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                or: vi.fn().mockReturnThis(),
                then: vi.fn().mockImplementation(function(onfulfilled) {
                    return Promise.resolve({ data: [{ id: "repo-123", owner_id: "123" }], error: null }).then(onfulfilled);
                })
            })),
            rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
            storage: {
                from: vi.fn(() => ({
                    remove: vi.fn().mockResolvedValue({ data: null, error: null })
                }))
            }
        }))
    };
});

describe("Repos Routes", () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/repos should return 401 without token", async () => {
    const res = await request(app).get("/api/repos");
    expect(res.status).toBe(401);
  });

  it("POST /api/repos should return 401 without token", async () => {
    const res = await request(app).post("/api/repos").send({ name: "test" });
    expect(res.status).toBe(401);
  });

  it("GET /api/repos/123 should return 401 without token", async () => {
    const res = await request(app).get("/api/repos/123");
    expect(res.status).toBe(401);
  });

  it("GET /api/repos should return repositories for authenticated user", async () => {
    const res = await request(app)
      .get("/api/repos")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/repos should create a repository for authenticated user", async () => {
    (repoManager.createRepo as any).mockResolvedValue({ storagePath: "path/to/zip", size: 1024 });
    (repoManager.getRepoPath as any).mockReturnValue("/tmp/fake-repo");

    const res = await request(app)
      .post("/api/repos")
      .set("Authorization", "Bearer valid-token")
      .send({ name: "my-repo", description: "a test repo", initReadme: false });

    if (res.status === 500) {
        console.error("POST /api/repos failed with 500:", res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
  });
});
