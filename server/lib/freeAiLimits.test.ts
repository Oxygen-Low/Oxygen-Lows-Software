import { describe, it, expect, beforeEach } from "vitest";
import {
  FREE_MODELS,
  DEFAULT_BASE_DAILY_POINTS,
  recordUserIpAccess,
  getDistinctUsersOnIpInLastWeek,
  getEffectiveDailyLimit,
  getUserDailyUsage,
  getUserDailyPointsUsage,
  checkFreeModelAllowance,
  recordFreeModelUsage,
  getAllFreeModelsUsage,
  createFreeAiTrackingStream,
  _resetFreeAiLimitsForTesting,
} from "./freeAiLimits.ts";
import { calculatePointsCost } from "./pollinationsPricing.ts";

describe("freeAiLimits (Points Usage System)", () => {
  beforeEach(() => {
    _resetFreeAiLimitsForTesting();
  });

  it("should have correct model definitions and tier names", () => {
    expect(FREE_MODELS["deepseek/deepseek-v4.1-flash"].tierName).toBe("Best");
    expect(FREE_MODELS["openai/gpt-6-luna"].tierName).toBe("Standard");
    expect(FREE_MODELS["openai/gpt-oss-20b"].tierName).toBe("Cheap");
  });

  it("should give full base limit (25 points = $0.25) to a single user on an IP", () => {
    const ip = "198.51.100.1";
    const userId = "user1";
    const now = Date.now();

    const limit = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, userId, now);
    expect(limit.baseLimit).toBe(DEFAULT_BASE_DAILY_POINTS);
    expect(limit.userCountOnIp).toBe(1);
    expect(limit.effectiveLimit).toBe(25);
    expect(limit.baseDailyPoints).toBe(25);
    expect(limit.effectiveLimitPoints).toBe(25);
  });

  it("should split points limit dynamically when multiple users access from the same IP within 7 days", () => {
    const ip = "198.51.100.2";
    const now = Date.now();

    // User A accesses
    recordUserIpAccess("userA", ip, now);
    expect(getDistinctUsersOnIpInLastWeek(ip, now)).toEqual(["userA"]);

    let limitA = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userA", now);
    expect(limitA.userCountOnIp).toBe(1);
    expect(limitA.effectiveLimit).toBe(25);

    // User B accesses 1 day later
    const day2 = now + 86_400_000;
    recordUserIpAccess("userB", ip, day2);
    expect(getDistinctUsersOnIpInLastWeek(ip, day2)).toHaveLength(2);

    // Now both userA and userB get 25 / 2 = 12.5 points
    limitA = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userA", day2);
    const limitB = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userB", day2);

    expect(limitA.userCountOnIp).toBe(2);
    expect(limitA.effectiveLimit).toBe(12.5);
    expect(limitB.userCountOnIp).toBe(2);
    expect(limitB.effectiveLimit).toBe(12.5);

    // User C accesses 2 days later
    const day3 = day2 + 86_400_000;
    recordUserIpAccess("userC", ip, day3);

    // 3 users: 25 / 3 = 8.3 points
    const limit3Users = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userA", day3);
    expect(limit3Users.userCountOnIp).toBe(3);
    expect(limit3Users.effectiveLimit).toBe(8.3);
  });

  it("should not count accesses older than 7 days when computing IP user count", () => {
    const ip = "198.51.100.3";
    const t0 = 1_700_000_000_000;

    // userOld was active 8 days ago
    recordUserIpAccess("userOld", ip, t0 - 8 * 24 * 3600 * 1000);
    // userCurrent is active now
    recordUserIpAccess("userCurrent", ip, t0);

    const activeUsers = getDistinctUsersOnIpInLastWeek(ip, t0);
    expect(activeUsers).toEqual(["userCurrent"]);

    const limit = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userCurrent", t0);
    expect(limit.userCountOnIp).toBe(1);
    expect(limit.effectiveLimit).toBe(25);
  });

  it("should deduct points accurately based on Pollinations token pricing", () => {
    const ip = "198.51.100.4";
    const userId = "user1";
    const now = Date.now();

    // Luna: prompt = 0.0000001 Pollen ($0.00001 pts), completion = 0.0000005 Pollen ($0.00005 pts)
    // 10,000 prompt + 10,000 completion = 0.1 pts + 0.5 pts = 0.6 pts
    const expectedPoints = calculatePointsCost("openai/gpt-6-luna", 10_000, 10_000);
    expect(expectedPoints).toBe(0.6);

    const resLuna = recordFreeModelUsage(userId, "openai/gpt-6-luna", ip, 10_000, 10_000, now);
    expect(resLuna.addedPoints).toBe(0.6);
    expect(resLuna.newTotalUsed).toBe(0.6);
    expect(resLuna.remainingPoints).toBe(24.4);
  });

  it("should correctly enforce allowances and block when 25 points quota is exceeded", () => {
    const ip = "198.51.100.5";
    const userId = "userQuota";
    const now = Date.now();

    // Consume ~24.5 points
    const res = recordFreeModelUsage(userId, "openai/gpt-6-luna", ip, 450_000, 400_000, now);
    expect(res.newTotalUsed).toBeGreaterThan(24);

    // If remaining is small, an enormous prompt requiring 5 points should be blocked
    const checkBlocked = checkFreeModelAllowance(userId, "openai/gpt-6-luna", ip, 100_000_000, now);
    expect(checkBlocked.allowed).toBe(false);

    // Consume until 25 points is fully exhausted
    recordFreeModelUsage(userId, "openai/gpt-6-luna", ip, 50_000, 50_000, now);
    const checkExhausted = checkFreeModelAllowance(userId, "openai/gpt-6-luna", ip, 10, now);
    expect(checkExhausted.allowed).toBe(false);
    expect(checkExhausted.remainingPoints).toBe(0);
  });

  it("should reset points allowance on the next UTC day", () => {
    const ip = "198.51.100.6";
    const userId = "userDayReset";
    const day1 = Date.parse("2026-10-21T12:00:00Z");
    const day2 = Date.parse("2026-10-22T00:01:00Z");

    // Exhaust points on day 1
    recordFreeModelUsage(userId, "deepseek/deepseek-v4.1-flash", ip, 1_000_000, 1_000_000, day1);
    expect(checkFreeModelAllowance(userId, "deepseek/deepseek-v4.1-flash", ip, 1, day1).allowed).toBe(false);

    // On day 2 (next UTC day), quota should be completely reset to 25 points
    expect(getUserDailyPointsUsage(userId, "2026-10-22")).toBe(0);
    const checkDay2 = checkFreeModelAllowance(userId, "deepseek/deepseek-v4.1-flash", ip, 500, day2);
    expect(checkDay2.allowed).toBe(true);
    expect(checkDay2.remainingPoints).toBe(25);
  });

  it("should return comprehensive overview via getAllFreeModelsUsage", () => {
    const ip = "198.51.100.7";
    const userId = "userOverview";
    const now = Date.now();

    recordFreeModelUsage(userId, "deepseek/deepseek-v4.1-flash", ip, 1000, 1000, now);

    const all = getAllFreeModelsUsage(userId, ip, now);
    expect(all.userId).toBe(userId);
    expect(all.ip).toBe(ip);
    expect(all.userCountOnIp).toBe(1);
    expect(all.baseDailyPoints).toBe(25);
    expect(all.effectiveLimitPoints).toBe(25);
    expect(all.usedPoints).toBeGreaterThan(0);
    expect(all.remainingPoints).toBeLessThan(25);
    expect(all.models["deepseek/deepseek-v4.1-flash"].rateDisplay).toBeDefined();
    expect(all.models["openai/gpt-6-luna"].rateDisplay).toBeDefined();
    expect(all.models["openai/gpt-oss-20b"].rateDisplay).toBeDefined();
  });

  it("should stream tokens through createFreeAiTrackingStream and invoke callback with usage", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world!"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":15,"completion_tokens":25}}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const sourceStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) {
          controller.enqueue(encoder.encode(c));
        }
        controller.close();
      },
    });

    let recordedIn = 0;
    let recordedOut = 0;
    const trackingStream = createFreeAiTrackingStream(
      sourceStream,
      (inTok, outTok) => {
        recordedIn = inTok;
        recordedOut = outTok;
      },
      10,
    );

    const reader = trackingStream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(recordedIn).toBe(15);
    expect(recordedOut).toBe(25);
  });

  it("should fallback to character estimation if stream does not include usage chunk", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"12345678"}}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const sourceStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) {
          controller.enqueue(encoder.encode(c));
        }
        controller.close();
      },
    });

    let recordedIn = 0;
    let recordedOut = 0;
    const trackingStream = createFreeAiTrackingStream(
      sourceStream,
      (inTok, outTok) => {
        recordedIn = inTok;
        recordedOut = outTok;
      },
      5,
    );

    const reader = trackingStream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(recordedIn).toBe(5);
    // 8 characters / 4 = 2 completion tokens
    expect(recordedOut).toBe(2);
  });
});
