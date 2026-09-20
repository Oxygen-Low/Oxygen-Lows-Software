import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCloudflareDefender,
  withDefender,
} from "./cloudflare";

describe("Cloudflare Worker WebDefender Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("withDefender (Higher-Order Wrapper)", () => {
    it("should allow legitimate requests through to the underlying worker", async () => {
      const baseWorker = {
        fetch: vi.fn().mockImplementation(async (request: Request) => {
          return new Response("OK from worker", { status: 200 });
        }),
      };

      const wrappedWorker = withDefender(baseWorker, {
        offlineMode: true,
      });

      const request = new Request("https://example.com/api/users", {
        method: "GET",
        headers: {
          "cf-connecting-ip": "203.0.113.195",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });

      const env = {};
      const ctx = { waitUntil: vi.fn() };

      const response = await wrappedWorker.fetch(request, env, ctx);

      expect(baseWorker.fetch).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe("OK from worker");
    });

    it("should block SQL injection in query params and return 403 without calling worker", async () => {
      const baseWorker = {
        fetch: vi.fn(),
      };

      const wrappedWorker = withDefender(baseWorker, {
        offlineMode: true,
      });

      const request = new Request(
        "https://example.com/search?q=UNION+SELECT+1,2,username,password+FROM+users--",
        {
          method: "GET",
          headers: {
            "cf-connecting-ip": "203.0.113.1",
            "user-agent": "Mozilla/5.0",
          },
        },
      );

      const response = await wrappedWorker.fetch(request, {}, {});

      expect(baseWorker.fetch).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.blocked).toBe(true);
      expect(data.reason).toBeDefined();
    });

    it("should block path traversal attempts", async () => {
      const baseWorker = {
        fetch: vi.fn(),
      };

      const wrappedWorker = withDefender(baseWorker, {
        offlineMode: true,
      });

      const request = new Request("https://example.com/download?file=../../etc/passwd", {
        method: "GET",
        headers: {
          "cf-connecting-ip": "203.0.113.1",
        },
      });

      const response = await wrappedWorker.fetch(request, {}, {});

      expect(baseWorker.fetch).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.blocked).toBe(true);
    });
  });

  describe("createCloudflareDefender (Direct Guard)", () => {
    it("should return null for allowed requests and block 403 Response for malicious requests", async () => {
      const defender = createCloudflareDefender({
        offlineMode: true,
      });

      // 1. Clean request
      const cleanReq = new Request("https://example.com/hello", {
        headers: { "cf-connecting-ip": "192.0.2.1" },
      });
      const allowedRes = await defender.protect(cleanReq);
      expect(allowedRes).toBeNull();

      // 2. Malicious request (Shell injection)
      const maliciousReq = new Request(
        "https://example.com/tools?cmd=;cat+/etc/shadow",
        {
          headers: { "cf-connecting-ip": "192.0.2.1" },
        },
      );
      const blockedRes = await defender.protect(maliciousReq);
      expect(blockedRes).not.toBeNull();
      expect(blockedRes?.status).toBe(403);
      const data = await blockedRes?.json();
      expect(data.blocked).toBe(true);
    });

    it("should support customBlockResponse handler", async () => {
      const defender = createCloudflareDefender({
        offlineMode: true,
        customBlockResponse: (result) => {
          return new Response(
            JSON.stringify({ custom: true, reason: result.reason }),
            {
              status: 418,
              headers: { "Content-Type": "application/json" },
            },
          );
        },
      });

      const req = new Request("https://example.com/?x=UNION+SELECT+1", {
        headers: { "cf-connecting-ip": "192.0.2.1" },
      });

      const response = await defender.protect(req);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(418);
      const data = await response?.json();
      expect(data.custom).toBe(true);
    });
  });

  describe("Path exclusions and Skip Body Scan", () => {
    it("should bypass defender completely for excludePaths", async () => {
      const defender = createCloudflareDefender({
        offlineMode: true,
        excludePaths: ["/webhook", /^\/public\//],
      });

      // Even with SQL injection in query, excluded path is allowed
      const webhookReq = new Request(
        "https://example.com/webhook?sqli=' OR 1=1--",
      );
      expect(await defender.protect(webhookReq)).toBeNull();

      const regexReq = new Request(
        "https://example.com/public/test?sqli=' OR 1=1--",
      );
      expect(await defender.protect(regexReq)).toBeNull();
    });

    it("should skip body scanning on skipBodyScanPaths", async () => {
      const defender = createCloudflareDefender({
        offlineMode: true,
        skipBodyScanPaths: ["/ai/chat"],
      });

      const chatReq = new Request("https://example.com/ai/chat", {
        method: "POST",
        headers: { "cf-connecting-ip": "192.0.2.1" },
        body: JSON.stringify({ prompt: "UNION SELECT * FROM users" }),
      });

      // Body scan skipped -> allowed
      expect(await defender.protect(chatReq)).toBeNull();
    });
  });

  describe("IP and Geo Detection", () => {
    it("should prioritize cf-connecting-ip over x-forwarded-for", async () => {
      const defender = createCloudflareDefender({
        offlineMode: true,
      });

      // Spy on handleRequest to inspect normalized IP
      const handleSpy = vi.spyOn(defender.client, "handleRequest");

      const req = new Request("https://example.com/test", {
        headers: {
          "cf-connecting-ip": "198.51.100.42",
          "x-forwarded-for": "10.0.0.1, 10.0.0.2",
        },
      });

      await defender.protect(req);

      expect(handleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: "198.51.100.42",
        }),
      );
    });

    it("should extract Geo Country from request.cf.country", async () => {
      const defender = createCloudflareDefender({
        offlineMode: true,
      });

      const handleSpy = vi.spyOn(defender.client, "handleRequest");

      const req = new Request("https://example.com/test", {
        headers: { "cf-connecting-ip": "198.51.100.42" },
      });
      (req as any).cf = { country: "FR" };

      await defender.protect(req);

      expect(handleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            "cf-ipcountry": "FR",
          }),
        }),
      );
    });
  });

  describe("ctx.waitUntil & Non-blocking telemetry", () => {
    it("should pass initPromise and telemetry promises to ctx.waitUntil", async () => {
      const defender = createCloudflareDefender({
        offlineMode: true,
      });

      const waitUntil = vi.fn();
      const ctx = { waitUntil };

      const req = new Request("https://example.com/api/data", {
        headers: { "cf-connecting-ip": "192.0.2.1" },
      });

      await defender.protect(req, {}, ctx);

      // ctx.waitUntil should have been called (for lazy init and/or log flush)
      expect(waitUntil).toHaveBeenCalled();
    });

    it("should flush logs via ctx.waitUntil in edge mode with batch logging enabled", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "test-app",
          block_mode_enabled: true,
          config: {},
          routes: [],
          admin_banned_ips: [],
        }),
        text: async () => "",
      });
      vi.stubGlobal("fetch", fetchMock);

      const defender = createCloudflareDefender({
        apiKey: "test-key",
        // batchLogging is true by default — intentionally not setting offlineMode
        // so that logEvent actually tries to send
      });

      // Manually inject appConfig to skip network init
      (defender.client as any).appConfig = (
        defender.client as any
      ).normalizeConfig({
        id: "test-app",
        block_mode_enabled: true,
        config: { batch_logging_enabled: true },
        routes: [],
        admin_banned_ips: [],
      });
      (defender.client as any).isInitialized = true;

      const waitUntil = vi.fn();
      const ctx = { waitUntil };

      const req = new Request("https://example.com/api/page", {
        headers: { "cf-connecting-ip": "192.0.2.10" },
      });

      await defender.protect(req, {}, ctx);

      // ctx.waitUntil must be called with the flush promise so logs are not lost
      expect(waitUntil).toHaveBeenCalled();
      const calls = waitUntil.mock.calls;
      // At least one call should be a Promise (the log flush)
      const hasPromise = calls.some(
        (args: any[]) => args[0] instanceof Promise,
      );
      expect(hasPromise).toBe(true);

      vi.unstubAllGlobals();
    });
  });


  describe("Configuration & Environment Variables", () => {
    it("should automatically resolve DEFENDER_API_KEY from env", async () => {
      const defender = createCloudflareDefender();

      const env = { DEFENDER_API_KEY: "env-secret-key-123" };
      const req = new Request("https://example.com/test");

      await defender.protect(req, env);

      expect(defender.client.getConfig().apiKey).toBe("env-secret-key-123");
    });

    it("should support dynamic config resolver function", async () => {
      const defender = createCloudflareDefender((env) => ({
        apiKey: env.DYNAMIC_KEY,
        offlineMode: true,
      }));

      const env = { DYNAMIC_KEY: "dynamic-resolved-key" };
      const req = new Request("https://example.com/test");

      await defender.protect(req, env);

      expect(defender.client.getConfig().apiKey).toBe("dynamic-resolved-key");
    });
  });
});
