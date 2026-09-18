import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  v1Router,
  resolveV1TextModel,
  parseImageSize,
  V1_AVAILABLE_MODELS,
} from "./v1.ts";
import app from "../index.ts";

describe("OpenAI-Compatible Free AI API (/v1 & /api/v1)", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Helper Functions", () => {
    it("resolves text model aliases correctly", () => {
      expect(resolveV1TextModel("gpt-3.5-turbo")).toBe(
        "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M,koboldcpp/llama-3.2-3b-instruct-q4_k_m,meta-llama/Llama-3.2-3B-Instruct,koboldcpp/Llama-3.2-1B-Instruct,koboldcpp/L3-Super-Nova-RP-8B,koboldcpp/L3-8B-Stheno-v3.2,koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
      );
      expect(resolveV1TextModel("gpt-4o-mini")).toBe(
        resolveV1TextModel("Fast"),
      );
      expect(resolveV1TextModel("llama-3.2-3b")).toBe(
        "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
      );
      expect(resolveV1TextModel("Smart")).toBe(
        "aphrodite/TheDrummer/Behemoth-X-123B-v2.1",
      );
      expect(resolveV1TextModel()).toBe(resolveV1TextModel("Fast"));
    });

    it("parses image dimensions and clamps within bounds", () => {
      expect(parseImageSize("1024x1024")).toEqual({ width: 1024, height: 1024 });
      expect(parseImageSize("512x512")).toEqual({ width: 512, height: 512 });
      expect(parseImageSize("2000x2000")).toEqual({ width: 1024, height: 1024 });
      expect(parseImageSize("64x64")).toEqual({ width: 256, height: 256 });
      expect(parseImageSize("invalid")).toEqual({ width: 512, height: 512 });
      expect(parseImageSize()).toEqual({ width: 512, height: 512 });
    });
  });

  describe("GET /v1/models and GET /api/v1/models", () => {
    it("returns model list in OpenAI object format via /v1/models", async () => {
      const res = await app.request("/v1/models");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.object).toBe("list");
      expect(Array.isArray(json.data)).toBe(true);

      const modelIds = json.data.map((m: any) => m.id);
      expect(modelIds).toContain("Fast");
      expect(modelIds).toContain("Smart");
      expect(modelIds).toContain("quality");
      expect(modelIds).toContain("fast");
      expect(modelIds).toContain("dall-e-3");
    });

    it("returns model list via /api/v1/models alias", async () => {
      const res = await app.request("/api/v1/models");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.object).toBe("list");
      expect(json.data.length).toBeGreaterThan(5);
    });

    it("returns specific model via GET /v1/models/:model", async () => {
      const res = await app.request("/v1/models/quality");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("quality");
      expect(json.type).toBe("image");
    });
  });

  describe("POST /v1/chat/completions", () => {
    it("rejects invalid JSON with OpenAI 400 error", async () => {
      const res = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.type).toBe("invalid_request_error");
    });

    it("rejects request without messages with 400 error", async () => {
      const res = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "Fast" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.param).toBe("messages");
    });

    it("executes non-streaming completion keyless and returns OpenAI format", async () => {
      const mockCompletion = {
        id: "chatcmpl-test12345",
        object: "chat.completion",
        created: 1710000000,
        model: "Fast",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello there! How can I help you today?" },
            finish_reason: "stop",
          },
        ],
      };

      global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
        if (url.includes("oai.stablehorde.net/v1/chat/completions")) {
          // Verify keyless anonymous authorization header
          expect(init.headers.Authorization).toBe("Bearer 0000000000");
          return Promise.resolve(
            new Response(JSON.stringify(mockCompletion), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      // Test with no Authorization header
      const res = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("chatcmpl-test12345");
      expect(json.choices[0].message.content).toBe(
        "Hello there! How can I help you today?",
      );
    });

    it("allows requests with dummy Authorization headers without failing", async () => {
      const mockCompletion = {
        id: "chatcmpl-test67890",
        object: "chat.completion",
        created: 1710000000,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Keyless success." },
            finish_reason: "stop",
          },
        ],
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("oai.stablehorde.net/v1/chat/completions")) {
          return Promise.resolve(
            new Response(JSON.stringify(mockCompletion), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await app.request("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-dummy-key-ignored",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Testing with dummy key" }],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.choices[0].message.content).toBe("Keyless success.");
    });

    it("handles streaming chat completions (SSE)", async () => {
      const ssePayload =
        'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("oai.stablehorde.net/v1/chat/completions")) {
          return Promise.resolve(
            new Response(ssePayload, {
              status: 200,
              headers: { "Content-Type": "text/event-stream" },
            }),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "Fast",
          stream: true,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain("Hi");
    });
  });

  describe("POST /v1/images/generations", () => {
    it("rejects request without prompt with 400 error", async () => {
      const res = await app.request("/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.param).toBe("prompt");
    });

    it("submits job and polls AI Horde until completion, returning image URL", async () => {
      const testJobId = "job-abc-123";
      let checkCount = 0;

      global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
        if (url.includes("stablehorde.net/api/v2/generate/async")) {
          // Verify keyless anonymous apikey header
          expect(init.headers.apikey).toBe("0000000000");
          return Promise.resolve(
            new Response(JSON.stringify({ id: testJobId }), { status: 202 }),
          );
        }

        if (url.includes(`generate/check/${testJobId}`)) {
          checkCount++;
          // First check: processing, second check: done
          if (checkCount === 1) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ done: false, processing: 1, wait_time: 2 }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({ done: true, processing: 0 }),
              { status: 200 },
            ),
          );
        }

        if (url.includes(`generate/status/${testJobId}`)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                generations: [
                  {
                    img: "https://images.stablehorde.net/generated_example.webp",
                    seed: 42,
                    censored: false,
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await app.request("/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "a cute fox in snow",
          model: "quality",
          size: "512x512",
          response_format: "url",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.created).toBeDefined();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data[0].url).toBe(
        "https://images.stablehorde.net/generated_example.webp",
      );
    });

    it("supports response_format: 'b64_json'", async () => {
      const testJobId = "job-b64-456";

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("generate/async")) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: testJobId }), { status: 202 }),
          );
        }
        if (url.includes(`generate/check/${testJobId}`)) {
          return Promise.resolve(
            new Response(JSON.stringify({ done: true }), { status: 200 }),
          );
        }
        if (url.includes(`generate/status/${testJobId}`)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                generations: [
                  {
                    img: "data:image/webp;base64,QUJDREVGR0g=",
                    censored: false,
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await app.request("/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "pixel art sword",
          model: "pixel_art",
          response_format: "b64_json",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data[0].b64_json).toBe("QUJDREVGR0g=");
    });

    it("detects safety filter censor and returns content_policy_violation error", async () => {
      const testJobId = "job-censored-789";

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("generate/async")) {
          return Promise.resolve(
            new Response(JSON.stringify({ id: testJobId }), { status: 202 }),
          );
        }
        if (url.includes(`generate/check/${testJobId}`)) {
          return Promise.resolve(
            new Response(JSON.stringify({ done: true }), { status: 200 }),
          );
        }
        if (url.includes(`generate/status/${testJobId}`)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                generations: [{ img: "", censored: true }],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await app.request("/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "test prompt" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("content_policy_violation");
    });
  });

  describe("Shared Rate Limiter (60 req/min per IP)", () => {
    it("enforces 60 requests per minute per IP limit", async () => {
      const testApp = new Hono();
      testApp.route("/v1", v1Router);

      const mockCompletion = {
        id: "chatcmpl-rate",
        choices: [{ message: { content: "ok" } }],
      };

      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockCompletion), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const uniqueIp = "198.51.100.42";

      // Fire 60 requests within limit
      for (let i = 0; i < 60; i++) {
        const res = await testApp.request("/v1/models", {
          headers: { "cf-connecting-ip": uniqueIp },
        });
        expect(res.status).toBe(200);
      }

      // 61st request should be rate limited with HTTP 429
      const overLimitRes = await testApp.request("/v1/models", {
        headers: { "cf-connecting-ip": uniqueIp },
      });

      expect(overLimitRes.status).toBe(429);
      expect(overLimitRes.headers.get("retry-after")).toBeDefined();
      const errJson = await overLimitRes.json();
      expect(errJson.error.type).toBe("rate_limit_error");
      expect(errJson.error.code).toBe(429);
      expect(errJson.error.message).toContain("60 requests per minute");
    });
  });
});
