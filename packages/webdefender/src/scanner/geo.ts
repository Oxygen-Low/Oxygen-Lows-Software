export const CDN_COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-country",
  "x-geoip-country-code",
  "x-geoip-country",
  "x-geo-country",
  "akamai-country-code",
  "x-azure-fd-country",
  "x-appengine-country",
  "fastly-client-ip-country",
] as const;

function normalizeCountryCode(val: unknown): string | null {
  if (!val) return null;
  let str = "";
  if (Array.isArray(val)) {
    if (val.length === 0 || typeof val[0] !== "string") return null;
    str = val[0];
  } else if (typeof val === "string") {
    str = val;
  } else {
    return null;
  }

  const commaIdx = str.indexOf(",");
  if (commaIdx !== -1) {
    str = str.substring(0, commaIdx);
  }

  str = str.trim().toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(str)) {
    return str;
  }
  return null;
}

/**
 * Extracts the 2-letter country code from incoming CDN / proxy headers.
 * Supports Cloudflare, Vercel, AWS CloudFront, Fastly, Netlify, Akamai, Azure Front Door, Google App Engine, and generic reverse proxies.
 */
export function getCountryCode(
  headersOrReq?:
    | Record<string, string | string[] | undefined>
    | Headers
    | { headers?: Record<string, string | string[] | undefined> | Headers }
    | string
    | null,
): string | null {
  if (!headersOrReq) {
    return null;
  }

  // Handle case where a string is directly passed
  if (typeof headersOrReq === "string") {
    return normalizeCountryCode(headersOrReq);
  }

  if (typeof headersOrReq !== "object") {
    return null;
  }

  // Handle wrapper object containing .headers property
  const headers =
    "headers" in headersOrReq && headersOrReq.headers
      ? headersOrReq.headers
      : headersOrReq;

  // Handle standard Fetch API Headers object
  if (typeof (headers as Headers).get === "function") {
    for (const name of CDN_COUNTRY_HEADERS) {
      const val = (headers as Headers).get(name);
      const code = normalizeCountryCode(val);
      if (code) return code;
    }
    return null;
  }

  const record = headers as Record<string, string | string[] | undefined>;

  // Fast path: direct lookup (Node.js/Express/Hono headers are usually lowercased)
  for (const name of CDN_COUNTRY_HEADERS) {
    const val = record[name];
    if (val !== undefined) {
      const code = normalizeCountryCode(val);
      if (code) return code;
    }
  }

  // Fallback path: case-insensitive match for non-lowercased header maps
  const keys = Object.keys(record);
  for (const name of CDN_COUNTRY_HEADERS) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.toLowerCase() === name) {
        const code = normalizeCountryCode(record[k]);
        if (code) return code;
      }
    }
  }

  return null;
}
