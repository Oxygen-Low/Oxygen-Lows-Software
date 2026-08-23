const cache = new Map<string, { code: string | null; expiry: number }>();
const CACHE_TTL = 3600000; // 1 hour
const MAX_CACHE_SIZE = 10000;
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 1334; // ~45 req/min

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|169\.254\.|::1$|fc00:|fe80:)/.test(
    ip,
  );
}

function cleanCache() {
  if (cache.size > MAX_CACHE_SIZE) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now > value.expiry) {
        cache.delete(key);
      }
    }
    // If still too large, delete oldest
    if (cache.size > MAX_CACHE_SIZE) {
      let excess = cache.size - MAX_CACHE_SIZE;
      for (const key of cache.keys()) {
        if (excess <= 0) break;
        cache.delete(key);
        excess--;
      }
    }
  }
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getCountryCode(ip: string): Promise<string | null> {
  if (!ip || isPrivateIp(ip)) {
    return null;
  }

  const cached = cache.get(ip);
  if (cached && cached.expiry > Date.now()) {
    return cached.code;
  }

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await delay(RATE_LIMIT_DELAY - timeSinceLastRequest);
  }

  lastRequestTime = Date.now();

  try {
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=countryCode`,
    );
    if (response.ok) {
      const data = await response.json();
      const code = data.countryCode || null;

      cleanCache();
      cache.set(ip, { code, expiry: Date.now() + CACHE_TTL });

      return code;
    }
  } catch (error) {
    // silently fail and return null on network errors
  }

  return null;
}
