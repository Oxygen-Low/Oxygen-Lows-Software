import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "../index";
import { repoManager } from "../lib/repoManager";

vi.mock("../lib/repoManager", () => ({
  repoManager: {
    createRepo: vi.fn(),
    getRepoPath: vi.fn(),
    uploadToStorage: vi.fn(),
    ensureLoaded: vi.fn()
  }
}));

describe("Repos Routes", () => {
  const app = createServer();
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
});
