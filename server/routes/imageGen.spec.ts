import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { imageGenRouter, HORDE_SFW_CURATED } from "./imageGen.ts";

describe("Image Generation Router", () => {
  let app: Hono;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = new Hono();
    app.route("/api/ai/image", imageGenRouter);
  });

  describe("GET /api/ai/image/models", () => {
    it("returns available curated Horde SFW models", async () => {
      // Mock stablehorde models status fetch
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("stablehorde.net/api/v2/status/models")) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { name: "SDXL 1.0", count: 12, queued: 2, eta: 15 },
              { name: "Deliberate", count: 5, queued: 0, eta: 8 },
              { name: "nsfw_explicit_model", count: 10, queued: 5, eta: 20 },
            ],
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const res = await app.request("/api/ai/image/models");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.cloudflare).toBeUndefined();

      expect(data.horde).toBeDefined();
      expect(data.horde.length).toBe(7);

      const ids = data.horde.map((m: any) => m.id);
      expect(ids).toEqual([
        "quality",
        "pixel_art",
        "fast",
        "anime",
        "realistic",
        "cartoon",
        "simplistic",
      ]);

      // Verify NSFW models are excluded and cannot be injected
      const nsfwFound = data.horde.some((m: any) =>
        /nsfw|explicit/i.test(m.id || m.name),
      );
      expect(nsfwFound).toBe(false);

      // Verify enriched worker counts for presets from base models
      const quality = data.horde.find((m: any) => m.id === "quality");
      expect(quality).toBeDefined();
      expect(quality.workers).toBe(12);

      const cartoon = data.horde.find((m: any) => m.id === "cartoon");
      expect(cartoon).toBeDefined();
      expect(cartoon.workers).toBe(5);
    });
  });

  describe("POST /api/ai/image/generate", () => {
    it("rejects request when prompt is missing or empty", async () => {
      const res = await app.request("/api/ai/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "horde",
          model: "SDXL 1.0",
          prompt: "   ",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Prompt is required");
    });

    it("rejects invalid provider", async () => {
      const res = await app.request("/api/ai/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "unknown_provider",
          prompt: "test image",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid provider");
    });

    it("rejects cloudflare provider with 400 error", async () => {
      const res = await app.request("/api/ai/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "cloudflare",
          model: "@cf/black-forest-labs/flux-1-schnell",
          prompt: "a scenic mountain sunset",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid provider");
    });

    it("allows unauthenticated generation requests for AI Horde models", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("stablehorde.net/api/v2/generate/async")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: "mock-horde-job-123", kudos: 0 }),
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const res = await app.request("/api/ai/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "horde",
          model: "quality",
          prompt: "a majestic golden retriever playing in autumn leaves",
          negative_prompt: "blurry, low quality",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.async).toBe(true);
      expect(data.id).toBe("mock-horde-job-123");
      expect(data.model).toBe("Quality");

      // Verify SFW flags and preset injection were passed in fetch payload
      const calls = (global.fetch as any).mock.calls;
      const hordeCall = calls.find((c: any[]) =>
        c[0].includes("stablehorde.net/api/v2/generate/async"),
      );
      expect(hordeCall).toBeDefined();
      const payload = JSON.parse(hordeCall[1].body);
      expect(payload.nsfw).toBe(false);
      expect(payload.censor_nsfw).toBe(true);
      // Resolved underlying model
      expect(payload.models).toEqual(["SDXL 1.0"]);
      // Enhanced prompt with quality style
      expect(payload.prompt).toContain("masterpiece, ultra detailed");
      expect(payload.prompt).toContain("### blurry, low quality");
    });

    it("translates preset ID into base model and injects positive/negative style tags", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("stablehorde.net/api/v2/generate/async")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: "mock-pixel-art-123", kudos: 0 }),
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const res = await app.request("/api/ai/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "horde",
          model: "pixel_art",
          prompt: "a knight standing in a dungeon",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.model).toBe("Pixel Art");

      const calls = (global.fetch as any).mock.calls;
      const hordeCall = calls.find((c: any[]) =>
        c[0].includes("stablehorde.net/api/v2/generate/async"),
      );
      const payload = JSON.parse(hordeCall[1].body);
      expect(payload.models).toEqual(["stable_diffusion"]);
      expect(payload.prompt).toContain("pixel art, 16-bit pixel graphic");
      expect(payload.prompt).toContain("### photorealistic, 3D render");
    });
  });

  describe("GET /api/ai/image/status/:id", () => {
    it("reports pending status while job is still processing", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v2/generate/check/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              done: false,
              processing: 1,
              waiting: 0,
              queue_position: 2,
              wait_time: 14,
            }),
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const res = await app.request("/api/ai/image/status/mock-job-id");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.done).toBe(false);
      expect(data.queue_position).toBe(2);
      expect(data.wait_time).toBe(14);
    });

    it("fetches final image and seed once generation is complete", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v2/generate/check/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ done: true, faulted: false }),
          } as Response);
        }
        if (url.includes("/api/v2/generate/status/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              done: true,
              faulted: false,
              generations: [
                {
                  img: "https://mock-storage.stablehorde.net/image.webp",
                  seed: "987654321",
                  censored: false,
                },
              ],
            }),
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const res = await app.request("/api/ai/image/status/mock-job-id");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.done).toBe(true);
      expect(data.image).toBe("https://mock-storage.stablehorde.net/image.webp");
      expect(data.seed).toBe("987654321");
    });
  });
});
