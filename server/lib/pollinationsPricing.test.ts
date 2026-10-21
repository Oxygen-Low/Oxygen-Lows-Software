import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getModelPricing,
  calculatePointsCost,
  refreshPollinationsPricing,
  _resetPricingCacheForTesting,
  FALLBACK_MODEL_PRICING,
} from "./pollinationsPricing.ts";

describe("Pollinations Pricing Module", () => {
  beforeEach(() => {
    _resetPricingCacheForTesting();
    vi.restoreAllMocks();
  });

  it("returns fallback pricing for known free models", () => {
    const deepseek = getModelPricing("deepseek/deepseek-v4.1-flash");
    expect(deepseek.promptPointsPer1k).toBe(0.015);
    expect(deepseek.completionPointsPer1k).toBe(0.06);

    const luna = getModelPricing("openai/gpt-6-luna");
    expect(luna.promptPointsPer1k).toBe(0.01);
    expect(luna.completionPointsPer1k).toBe(0.05);

    const oss = getModelPricing("openai/gpt-oss-20b");
    expect(oss.promptPointsPer1k).toBe(0.005);
    expect(oss.completionPointsPer1k).toBe(0.018);
  });

  it("calculates points cost correctly (1 Pollen = 100 Points = 100 Cents)", () => {
    // 1000 prompt tokens for GPT-6 Luna = 1000 * 0.0000001 Pollen = 0.0001 Pollen = 0.01 Points (1 cent)
    // 1000 completion tokens for GPT-6 Luna = 1000 * 0.0000005 Pollen = 0.0005 Pollen = 0.05 Points (5 cents)
    const cost = calculatePointsCost("openai/gpt-6-luna", 1000, 1000);
    expect(cost).toBe(0.06);
  });

  it("refreshes pricing from Pollinations API and caches result", async () => {
    const mockApiResponse = {
      data: [
        {
          id: "openai/gpt-6-luna",
          pricing: {
            promptTextTokens: "0.0000002",
            completionTextTokens: "0.0000008",
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as any);

    await refreshPollinationsPricing(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const updatedLuna = getModelPricing("openai/gpt-6-luna");
    expect(updatedLuna.promptPointsPer1k).toBe(0.02);
    expect(updatedLuna.completionPointsPer1k).toBe(0.08);

    // Second call within 10 minutes should use cache without refetching
    await refreshPollinationsPricing();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back gracefully when API returns error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as any);

    await refreshPollinationsPricing(true);
    const luna = getModelPricing("openai/gpt-6-luna");
    expect(luna.promptPointsPer1k).toBe(FALLBACK_MODEL_PRICING["openai/gpt-6-luna"].promptPointsPer1k);
  });
});
