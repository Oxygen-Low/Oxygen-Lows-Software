import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { imageGenRouter, CLOUDFLARE_IMAGE_MODELS, HORDE_SFW_CURATED } from "./imageGen.ts";

describe("Image Generation Router", () => {
  let app: Hono;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = new Hono();
    app.route("/api/ai/image", imageGenRouter);
  });

  describe("GET /api/ai/image/models", () => {
    it("returns available Cloudflare models and curated Horde SFW models", async () => {
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
      expect(data.cloudflare).toBeDefined();
      expect(data.cloudflare.length).toBeGreaterThan(0);
      expect(data.cloudflare[0].id).toBe("@cf/black-forest-labs/flux-1-schnell");

      expect(data.horde).toBeDefined();
      expect(data.horde.length).toBeGreaterThan(0);

      // Verify NSFW models are excluded from discovered models
      const nsfwFound = data.horde.some((m: any) =>
        /nsfw|explicit/i.test(m.id || m.name),
      );
      expect(nsfwFound).toBe(false);

      // Verify enriched worker counts
      const sdxl = data.horde.find((m: any) => m.id === "SDXL 1.0");
      expect(sdxl).toBeDefined();
      expect(sdxl.workers).toBe(12);
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

    it("requires authentication for Cloudflare models", async () => {
      const res = await app.request("/api/ai/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "cloudflare",
          model: "@cf/black-forest-labs/flux-1-schnell",
          prompt: "a scenic mountain sunset",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Authentication is required");
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
          model: "SDXL 1.0",
          prompt: "a majestic golden retriever playing in autumn leaves",
          negative_prompt: "blurry, low quality",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.async).toBe(true);
      expect(data.id).toBe("mock-horde-job-123");

      // Verify SFW flags were passed in fetch payload
      const calls = (global.fetch as any).mock.calls;
      const hordeCall = calls.find((c: any[]) =>
        c[0].includes("stablehorde.net/api/v2/generate/async"),
      );
      expect(hordeCall).toBeDefined();
      const payload = JSON.parse(hordeCall[1].body);
      expect(payload.nsfw).toBe(false);
      expect(payload.censor_nsfw).toBe(true);
      expect(payload.prompt).toContain("### blurry, low quality");
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
