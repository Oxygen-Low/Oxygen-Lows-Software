import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

export const proxyRouter = new Hono();

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";
const ALLOWED_DOMAINS = ["api.github.com", "raw.githubusercontent.com", "registry.npmjs.org"];

proxyRouter.post("/fetch", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.split(" ")[1];
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { url, options } = await c.req.json();
    if (!url) {
      return c.json({ error: "Missing url" }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return c.json({ error: "Invalid url" }, 400);
    }

    if (parsedUrl.protocol !== "https:") {
      return c.json({ error: "Only HTTPS URLs are allowed" }, 400);
    }

    const hostname = parsedUrl.hostname;
    
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.startsWith("192.168.")
    ) {
      return c.json({ error: "Internal or private IPs not allowed" }, 400);
    }

    const isAllowedDomain = ALLOWED_DOMAINS.some(domain => hostname.endsWith(domain));
    if (!isAllowedDomain) {
      return c.json({ error: "Domain not allowed" }, 403);
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
