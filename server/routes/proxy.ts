import { Hono } from "hono";

export const proxyRouter = new Hono();

proxyRouter.post("/fetch", async (c) => {
  try {
    const { url, options } = await c.req.json();
    if (!url) {
      return c.json({ error: "Missing url" }, 400);
    }

    // SSRF Protection: Parse URL and validate
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return c.json({ error: "Invalid URL" }, 400);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return c.json({ error: "Invalid protocol" }, 400);
    }

    const hostname = parsedUrl.hostname;
    // Block loopback, private IPv4, and some metadata IPs
    const isInternalIP =
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      hostname === "localhost" ||
      hostname === "::1";

    if (isInternalIP) {
      return c.json({ error: "Access to internal/private networks is blocked" }, 403);
    }

    // In Cloudflare Workers, fetch is natively available and preferred over axios
    const response = await fetch(url, {
      method: options?.method || "GET",
      headers: options?.headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: c.req.raw.signal,
    });

    const text = await response.text();
    c.status(response.status as any);
    return c.text(text);
  } catch (error: any) {
    console.error("Proxy fetch error:", error);
    return c.json({ error: error.message || "Unknown error" }, 500);
  }
});
