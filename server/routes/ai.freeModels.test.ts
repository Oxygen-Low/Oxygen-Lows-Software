import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aiRouter } from "./ai.ts";
import * as authModule from "../lib/auth.ts";
import {
  _resetFreeAiLimitsForTesting,
  recordFreeModelUsage,
  getUserDailyPointsUsage,
  getEffectiveDailyLimit,
} from "../lib/freeAiLimits.ts";

describe("AI Router - Free Models API and Proxy", () => {
  const mockUser = {
    id: "user-free-test-1",
    username: "freetester",
    email: "free@example.com",
  };

  beforeEach(() => {
    _resetFreeAiLimitsForTesting();
    vi.spyOn(authModule, "resolveUserFromToken").mockImplementation(async (token) => {
      if (token === "valid-user-token") return mockUser as any;
      if (token === "second-user-token")
        return { id: "user-free-test-2", username: "user2", email: "user2@example.com" } as any;
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /free-usage requires authentication", async () => {
    const res = await aiRouter.request("/free-usage", {
      method: "GET",
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("Authentication required");
  });

  it("GET /free-usage returns model quotas and remaining points", async () => {
    const res = await aiRouter.request("/free-usage", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-user-token",
        "x-forwarded-for": "100.200.50.1",
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.userId).toBe(mockUser.id);
    expect(json.ip).toBe("100.200.50.1");
    expect(json.userCountOnIp).toBe(1);
    expect(json.baseDailyPoints).toBe(25);
    expect(json.effectiveLimitPoints).toBe(25);
    expect(json.remainingPoints).toBe(25);
    expect(json.models["deepseek/deepseek-v4.1-flash"]).toBeDefined();
    expect(json.models["deepseek/deepseek-v4.1-flash"].rateDisplay).toBeDefined();
    expect(json.models["openai/gpt-6-luna"].rateDisplay).toBeDefined();
    expect(json.models["openai/gpt-oss-20b"].rateDisplay).toBeDefined();
  });

  it("POST /proxy rejects unauthenticated access to free models", async () => {
    const res = await aiRouter.request("/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v4.1-flash",
        category: "free",
        messages: [{ role: "user", content: "Hello" }],
      }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Please log in to use free AI models.");
  });

  it("POST /proxy allows authenticated free model request and records points based on pricing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (typeof url === "string" && url.includes("pollinations.ai")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Hi there! I am DeepSeek." } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(url);
    });

    try {
      const res = await aiRouter.request("/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-user-token",
          "x-forwarded-for": "100.200.50.2",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-v4.1-flash",
          category: "free",
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.choices[0].message.content).toContain("DeepSeek");

      const usedToday = getUserDailyPointsUsage(mockUser.id);
      expect(usedToday).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /proxy enforces daily limits and returns 429 when quota exceeded", async () => {
    const ip = "100.200.50.3";
    // Pre-consume 25 points
    recordFreeModelUsage(mockUser.id, "deepseek/deepseek-v4.1-flash", ip, 1_000_000, 1_000_000);

    const res = await aiRouter.request("/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v4.1-flash",
        category: "free",
        messages: [{ role: "user", content: "Test message" }],
      }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("FREE_TIER_LIMIT_REACHED");
    expect(json.error).toContain("Daily limit reached");
    expect(json.effectiveLimit).toBe(25);
    expect(json.remainingPoints).toBe(0);
  });

  it("POST /proxy splits limit when multiple accounts access from same IP", async () => {
    const ip = "100.200.50.4";
    // User 1 accesses
    recordFreeModelUsage(mockUser.id, "deepseek/deepseek-v4.1-flash", ip, 100, 0);
    // User 2 accesses from same IP
    recordFreeModelUsage("user-free-test-2", "deepseek/deepseek-v4.1-flash", ip, 100, 0);

    // Limit is now 25 / 2 = 12.5 points
    const limit = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, mockUser.id);
    expect(limit.userCountOnIp).toBe(2);
    expect(limit.effectiveLimit).toBe(12.5);

    // If User 1 has consumed 12.5 points:
    recordFreeModelUsage(mockUser.id, "deepseek/deepseek-v4.1-flash", ip, 500_000, 500_000);

    const res = await aiRouter.request("/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v4.1-flash",
        category: "free",
        messages: [{ role: "user", content: "Test message" }],
      }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe("FREE_TIER_LIMIT_REACHED");
    expect(json.error).toContain("split between 2 accounts on this IP");
  });
});
