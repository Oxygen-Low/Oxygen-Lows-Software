import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "../index";

// Mock supabase
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "test-user-id" } }, error: null }),
      },
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ data: { path: "test-path" }, error: null }),
        })),
      },
    })),
  };
});

describe("ComfyUI and STT Routes", () => {
  const app = createServer();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMFYUI_MOCK = "true";
  });

  describe("GET /api/ai/comfy-supported", () => {
    it("should return supported true when mock mode is enabled", async () => {
      const res = await request(app).get("/api/ai/comfy-supported");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ supported: true, mock: true });
    });

    it("should return supported false when comfy is not reachable and mock mode is off", async () => {
      process.env.COMFYUI_MOCK = "false";
      const res = await request(app).get("/api/ai/comfy-supported");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ supported: false });
    });
  });

  describe("POST /api/ai/comfy-generate", () => {
    it("should return 401 if unauthorized (no token)", async () => {
      const res = await request(app)
        .post("/api/ai/comfy-generate")
        .send({ prompts: ["A beautiful snowy mountain"] });
      expect(res.status).toBe(401);
    });

    it("should return 400 if prompts are missing or invalid", async () => {
      const res = await request(app)
        .post("/api/ai/comfy-generate")
        .set("Authorization", "Bearer mock-token")
        .send({ prompts: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No prompts provided");
    });

    it("should return successful mock generation file names", async () => {
      const res = await request(app)
        .post("/api/ai/comfy-generate")
        .set("Authorization", "Bearer mock-token")
        .send({ prompts: ["Red prompt", "Blue prompt"] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.files).toHaveLength(2);
      expect(res.body.files[0]).toContain("comfyui_");
    });
  });

  describe("POST /api/ai/stt", () => {
    it("should return 400 if no audio file is provided", async () => {
      const res = await request(app).post("/api/ai/stt").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No audio file provided");
    });
  });
});
