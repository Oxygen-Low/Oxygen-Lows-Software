import { describe, it, expect, beforeEach } from "vitest";
import {
  FREE_MODELS,
  recordUserIpAccess,
  getDistinctUsersOnIpInLastWeek,
  getEffectiveDailyLimit,
  getUserDailyUsage,
  checkFreeModelAllowance,
  recordFreeModelUsage,
  getAllFreeModelsUsage,
  createFreeAiTrackingStream,
  _resetFreeAiLimitsForTesting,
} from "./freeAiLimits.ts";

describe("freeAiLimits", () => {
  beforeEach(() => {
    _resetFreeAiLimitsForTesting();
  });

  it("should have correct base limits and multipliers for the three models", () => {
    expect(FREE_MODELS["deepseek/deepseek-v4.1-flash"]).toEqual({
      id: "deepseek/deepseek-v4.1-flash",
      name: "Best",
      baseDailyLimit: 1_000_000,
      outputMultiplier: 4,
      tierName: "Best",
    });

    expect(FREE_MODELS["openai/gpt-6-luna"]).toEqual({
      id: "openai/gpt-6-luna",
      name: "Standard",
      baseDailyLimit: 2_000_000,
      outputMultiplier: 5,
      tierName: "Standard",
    });

    expect(FREE_MODELS["openai/gpt-oss-20b"]).toEqual({
      id: "openai/gpt-oss-20b",
      name: "Cheap",
      baseDailyLimit: 5_000_000,
      outputMultiplier: 6,
      tierName: "Cheap",
    });
  });

  it("should give full base limit to a single user on an IP", () => {
    const ip = "198.51.100.1";
    const userId = "user1";
    const now = Date.now();

    const limit = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, userId, now);
    expect(limit.baseLimit).toBe(1_000_000);
    expect(limit.userCountOnIp).toBe(1);
    expect(limit.effectiveLimit).toBe(1_000_000);
    expect(limit.outputMultiplier).toBe(4);
  });

  it("should split limit dynamically when multiple users access from the same IP within 7 days", () => {
    const ip = "198.51.100.2";
    const now = Date.now();

    // User A accesses
    recordUserIpAccess("userA", ip, now);
    expect(getDistinctUsersOnIpInLastWeek(ip, now)).toEqual(["userA"]);

    let limitA = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userA", now);
    expect(limitA.userCountOnIp).toBe(1);
    expect(limitA.effectiveLimit).toBe(1_000_000);

    // User B accesses 1 day later
    const day2 = now + 86_400_000;
    recordUserIpAccess("userB", ip, day2);
    expect(getDistinctUsersOnIpInLastWeek(ip, day2)).toHaveLength(2);

    // Now both userA and userB get 1,000,000 / 2 = 500,000 tokens
    limitA = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userA", day2);
    const limitB = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userB", day2);

    expect(limitA.userCountOnIp).toBe(2);
    expect(limitA.effectiveLimit).toBe(500_000);
    expect(limitB.userCountOnIp).toBe(2);
    expect(limitB.effectiveLimit).toBe(500_000);

    // For gpt-6-luna (2M base): 2M / 2 = 1,000,000
    const lunaLimit = getEffectiveDailyLimit("openai/gpt-6-luna", ip, "userA", day2);
    expect(lunaLimit.effectiveLimit).toBe(1_000_000);

    // User C accesses 2 days later
    const day3 = day2 + 86_400_000;
    recordUserIpAccess("userC", ip, day3);

    // 3 users: 1,000,000 / 3 = 333,333
    const limit3Users = getEffectiveDailyLimit("deepseek/deepseek-v4.1-flash", ip, "userA", day3);
    expect(limit3Users.userCountOnIp).toBe(3);
    expect(limit3Users.effectiveLimit).toBe(333_333);
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
    expect(limit.effectiveLimit).toBe(1_000_000);
  });

  it("should apply output token multipliers accurately when recording usage", () => {
    const ip = "198.51.100.4";
    const userId = "user1";
    const now = Date.now();

    // Deepseek has 4x output multiplier
    // 100 input tokens + 200 output tokens = 100 + 200 * 4 = 900 tokens
    const res1 = recordFreeModelUsage(userId, "deepseek/deepseek-v4.1-flash", ip, 100, 200, now);
    expect(res1.weightedAddedTokens).toBe(900);
    expect(res1.newTotalUsed).toBe(900);
    expect(res1.remainingTokens).toBe(1_000_000 - 900);

    // Luna has 5x output multiplier
    // 50 input tokens + 100 output tokens = 50 + 100 * 5 = 550 tokens
    const resLuna = recordFreeModelUsage(userId, "openai/gpt-6-luna", ip, 50, 100, now);
    expect(resLuna.weightedAddedTokens).toBe(550);
    expect(resLuna.newTotalUsed).toBe(550);
    expect(resLuna.remainingTokens).toBe(2_000_000 - 550);

    // Cheap (gpt-oss-20b) has 6x output multiplier
    // 100 input + 100 output = 100 + 100 * 6 = 700 tokens
    const resCheap = recordFreeModelUsage(userId, "openai/gpt-oss-20b", ip, 100, 100, now);
    expect(resCheap.weightedAddedTokens).toBe(700);
    expect(resCheap.newTotalUsed).toBe(700);
    expect(resCheap.remainingTokens).toBe(5_000_000 - 700);
  });

  it("should correctly enforce allowances and block when quota is exceeded", () => {
    const ip = "198.51.100.5";
    const userId = "userQuota";
    const now = Date.now();

    // Limit is 1,000,000. Consume 999,500 tokens
    recordFreeModelUsage(userId, "deepseek/deepseek-v4.1-flash", ip, 999_500, 0, now);

    // 500 tokens remaining. An estimated 100 tokens should be allowed
    const check1 = checkFreeModelAllowance(userId, "deepseek/deepseek-v4.1-flash", ip, 100, now);
    expect(check1.allowed).toBe(true);
    expect(check1.remainingTokens).toBe(500);

    // An estimated 600 tokens should be blocked
    const check2 = checkFreeModelAllowance(userId, "deepseek/deepseek-v4.1-flash", ip, 600, now);
    expect(check2.allowed).toBe(false);

    // Consume the remaining 500
    recordFreeModelUsage(userId, "deepseek/deepseek-v4.1-flash", ip, 500, 0, now);
    const check3 = checkFreeModelAllowance(userId, "deepseek/deepseek-v4.1-flash", ip, 1, now);
    expect(check3.allowed).toBe(false);
    expect(check3.remainingTokens).toBe(0);
  });

  it("should reset allowance on the next UTC day", () => {
    const ip = "198.51.100.6";
    const userId = "userDayReset";
    const day1 = Date.parse("2026-10-21T12:00:00Z");
    const day2 = Date.parse("2026-10-22T00:01:00Z");

    // Exhaust tokens on day 1
    recordFreeModelUsage(userId, "deepseek/deepseek-v4.1-flash", ip, 1_000_000, 0, day1);
    expect(checkFreeModelAllowance(userId, "deepseek/deepseek-v4.1-flash", ip, 1, day1).allowed).toBe(false);

    // On day 2 (next UTC day), quota should be completely reset
    expect(getUserDailyUsage(userId, "deepseek/deepseek-v4.1-flash", "2026-10-22")).toBe(0);
    const checkDay2 = checkFreeModelAllowance(userId, "deepseek/deepseek-v4.1-flash", ip, 500, day2);
    expect(checkDay2.allowed).toBe(true);
    expect(checkDay2.remainingTokens).toBe(1_000_000);
  });

  it("should return comprehensive overview via getAllFreeModelsUsage", () => {
    const ip = "198.51.100.7";
    const userId = "userOverview";
    const now = Date.now();

    recordFreeModelUsage(userId, "deepseek/deepseek-v4.1-flash", ip, 100, 100, now);

    const all = getAllFreeModelsUsage(userId, ip, now);
    expect(all.userId).toBe(userId);
    expect(all.ip).toBe(ip);
    expect(all.userCountOnIp).toBe(1);
    expect(all.models["deepseek/deepseek-v4.1-flash"].usedTokens).toBe(500); // 100 + 100*4
    expect(all.models["deepseek/deepseek-v4.1-flash"].remainingTokens).toBe(1_000_000 - 500);
    expect(all.models["openai/gpt-6-luna"].usedTokens).toBe(0);
    expect(all.models["openai/gpt-oss-20b"].usedTokens).toBe(0);
  });

  it("should stream tokens through createFreeAiTrackingStream and invoke callback with usage", async () => {
    let capturedInput = 0;
    let capturedOutput = 0;

    const sourceChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world! Here is more text."}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":25,"completion_tokens":10}}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const sourceStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of sourceChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const trackingStream = createFreeAiTrackingStream(
      sourceStream,
      (inTok, outTok) => {
        capturedInput = inTok;
        capturedOutput = outTok;
      },
      50,
    );

    const reader = trackingStream.getReader();
    let readAll = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      readAll += decoder.decode(value);
    }

    expect(readAll).toContain('"Hello"');
    expect(readAll).toContain('" world! Here is more text."');
    expect(capturedInput).toBe(25);
    expect(capturedOutput).toBe(10);
  });

  it("should fallback to character estimation if stream does not include usage chunk", async () => {
    let capturedInput = 0;
    let capturedOutput = 0;

    const sourceChunks = [
      'data: {"choices":[{"delta":{"content":"Four score and seven years ago"}}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const sourceStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of sourceChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const trackingStream = createFreeAiTrackingStream(
      sourceStream,
      (inTok, outTok) => {
        capturedInput = inTok;
        capturedOutput = outTok;
      },
      12,
    );

    const reader = trackingStream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(capturedInput).toBe(12);
    // "Four score and seven years ago".length = 30 -> Math.ceil(30 / 4) = 8
    expect(capturedOutput).toBe(8);
  });
});
