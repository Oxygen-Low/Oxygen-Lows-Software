import { Hono } from "hono";
import { validateAiUrl } from "../lib/safeAiUrl.ts";

export const proxyRouter = new Hono();

proxyRouter.post("/fetch", async (c) => {
  try {
    const { url, options } = await c.req.json();
    if (!url) {
      return c.json({ error: "Missing url" }, 400);
    }

    // Protect against Server-Side Request Forgery (SSRF)
    // Ensures URL is HTTPS and does not point to internal/private IPs
    await validateAiUrl(url);

    // In Cloudflare Workers, fetch is natively available and preferred over axios
    const response = await fetch(url, {
      method: options?.method || "GET",
      headers: options?.headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    c.status(response.status as any);
    return c.text(text);
  } catch (error: any) {
    console.error("Proxy fetch error:", error);
    return c.json({ error: error.message || "Unknown error" }, 500);
  }
});
