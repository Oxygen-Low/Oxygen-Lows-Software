/**
 * Pollinations Pricing Cache & Points Calculator
 *
 * Polls https://gen.pollinations.ai/v1/models every 10 minutes to obtain the latest
 * token pricing in Pollen (1 Pollen = $1.00 USD = 100 Points = 100 Cents).
 */

export interface ModelPricing {
  promptTextTokens: number;
  completionTextTokens: number;
  promptPointsPer1k: number;
  completionPointsPer1k: number;
  rateDisplay: string;
}

export const FALLBACK_MODEL_PRICING: Record<string, ModelPricing> = {
  "deepseek/deepseek-v4.1-flash": {
    promptTextTokens: 0.00000015,
    completionTextTokens: 0.0000006,
    promptPointsPer1k: 0.015,
    completionPointsPer1k: 0.06,
    rateDisplay: "~0.04 pts / 1k",
  },
  "openai/gpt-6-luna": {
    promptTextTokens: 0.0000001,
    completionTextTokens: 0.0000005,
    promptPointsPer1k: 0.01,
    completionPointsPer1k: 0.05,
    rateDisplay: "~0.03 pts / 1k",
  },
  "openai/gpt-oss-20b": {
    promptTextTokens: 0.00000005,
    completionTextTokens: 0.00000018,
    promptPointsPer1k: 0.005,
    completionPointsPer1k: 0.018,
    rateDisplay: "~0.01 pts / 1k",
  },
};

const TEN_MINUTES_MS = 10 * 60 * 1000;
let cachedPricing: Record<string, ModelPricing> = { ...FALLBACK_MODEL_PRICING };
let lastFetchTimestamp = 0;
let ongoingFetchPromise: Promise<Record<string, ModelPricing>> | null = null;

function computeRateDisplay(promptPtsPer1k: number, completionPtsPer1k: number): string {
  // Average blended rate assuming ~1:1 or 2:1 prompt:completion ratio
  const blended = (promptPtsPer1k * 2 + completionPtsPer1k) / 3;
  return `~${blended.toFixed(blended < 0.02 ? 3 : 2)} pts / 1k`;
}

/**
 * Fetches and refreshes the model pricing cache from Pollinations API.
 * Ensures only one network fetch happens every 10 minutes.
 */
export async function refreshPollinationsPricing(force = false): Promise<Record<string, ModelPricing>> {
  const now = Date.now();
  if (!force && lastFetchTimestamp > 0 && now - lastFetchTimestamp < TEN_MINUTES_MS) {
    return cachedPricing;
  }

  if (ongoingFetchPromise) {
    return ongoingFetchPromise;
  }

  ongoingFetchPromise = (async () => {
    try {
      const res = await fetch("https://gen.pollinations.ai/v1/models?reliability=all", {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        lastFetchTimestamp = now;
        return cachedPricing;
      }

      const json = await res.json();
      const list: any[] = Array.isArray(json) ? json : json?.data || [];

      const updated: Record<string, ModelPricing> = { ...cachedPricing };

      for (const m of list) {
        if (!m || typeof m !== "object") continue;
        const id = m.id || m.name;
        if (!id || typeof id !== "string") continue;

        const pricing = m.pricing;
        if (pricing && typeof pricing === "object") {
          const promptRate = Number(pricing.promptTextTokens) || 0;
          const completionRate = Number(pricing.completionTextTokens) || 0;

          if (promptRate > 0 || completionRate > 0) {
            const promptPtsPer1k = promptRate * 100 * 1000;
            const compPtsPer1k = completionRate * 100 * 1000;

            const pricingEntry: ModelPricing = {
              promptTextTokens: promptRate,
              completionTextTokens: completionRate,
              promptPointsPer1k: Number(promptPtsPer1k.toFixed(5)),
              completionPointsPer1k: Number(compPtsPer1k.toFixed(5)),
              rateDisplay: computeRateDisplay(promptPtsPer1k, compPtsPer1k),
            };

            updated[id] = pricingEntry;
            // Also store base alias (without namespace if applicable)
            if (id.includes("/")) {
              const shortId = id.split("/")[1];
              if (!updated[shortId]) updated[shortId] = pricingEntry;
            }
          }
        }
      }

      cachedPricing = updated;
      lastFetchTimestamp = now;
      return cachedPricing;
    } catch {
      lastFetchTimestamp = now;
      return cachedPricing;
    } finally {
      ongoingFetchPromise = null;
    }
  })();

  return ongoingFetchPromise;
}

/**
 * Returns current pricing for a model (sync, using cached data).
 */
export function getModelPricing(modelId: string): ModelPricing {
  // Fire off background refresh if expired
  if (Date.now() - lastFetchTimestamp >= TEN_MINUTES_MS) {
    refreshPollinationsPricing().catch(() => {});
  }

  return (
    cachedPricing[modelId] ||
    FALLBACK_MODEL_PRICING[modelId] || {
      promptTextTokens: 0.0000001,
      completionTextTokens: 0.0000005,
      promptPointsPer1k: 0.01,
      completionPointsPer1k: 0.05,
      rateDisplay: "~0.03 pts / 1k",
    }
  );
}

/**
 * Calculates the cost in Points (1 point = 1 cent = 0.01 Pollen)
 * for a given model and token counts.
 */
export function calculatePointsCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = getModelPricing(modelId);
  const pollenCost =
    promptTokens * pricing.promptTextTokens +
    completionTokens * pricing.completionTextTokens;
  // 1 Pollen = 100 Points
  const points = pollenCost * 100;
  // Return with precision up to 6 decimal places
  return Math.round(points * 1_000_000) / 1_000_000;
}

/**
 * Helper to manually override cache (useful for testing).
 */
export function _resetPricingCacheForTesting(
  customPricing?: Record<string, ModelPricing>,
): void {
  cachedPricing = customPricing ? { ...customPricing } : { ...FALLBACK_MODEL_PRICING };
  lastFetchTimestamp = 0;
  ongoingFetchPromise = null;
}
