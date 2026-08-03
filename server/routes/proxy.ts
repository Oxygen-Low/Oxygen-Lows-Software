import { Hono } from "hono";

export const proxyRouter = new Hono();

proxyRouter.post("/fetch", async (c) => {
  try {
    const { url, options } = await c.req.json();
    if (!url) {
      return c.json({ error: "Missing url" }, 400);
    }

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
