import { Hono } from "hono";
import { getAuthenticatedClient } from "../lib/supabase.ts";

export const oauthAdminRouter = new Hono();

import { rateLimiter } from "../lib/rateLimiter.ts";

// 20 requests per minute for OAuth admin operations
const apiLimiter = rateLimiter(20, 60_000, "oauth-admin");

oauthAdminRouter.use("*", apiLimiter);

oauthAdminRouter.get("/clients", async (c) => {
  try {
    const token = c.req.header("authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Missing token" }, 401);
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { data, error } = await supabase.auth.oauth.listClients();
    if (error) throw error;
    return c.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});

oauthAdminRouter.get("/authorized-apps", async (c) => {
  try {
    const token = c.req.header("authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Missing token" }, 401);
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { data, error } = await supabase.auth.oauth.listAuthorizedApps();
    if (error) throw error;
    return c.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});

oauthAdminRouter.post("/clients", async (c) => {
  try {
    const token = c.req.header("authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Missing token" }, 401);
    const { name, type, redirect_uris } = await c.req.json();
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { data, error } = await supabase.auth.oauth.createClient({
      name,
      type,
      redirect_uris,
    });
    if (error) throw error;
    return c.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});

oauthAdminRouter.delete("/clients/:id", async (c) => {
  try {
    const token = c.req.header("authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Missing token" }, 401);
    const id = c.req.param("id");
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { error } = await supabase.auth.oauth.deleteClient(id);
    if (error) throw error;
    return c.json({ success: true });
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});

oauthAdminRouter.post("/revoke-authorization/:id", async (c) => {
  try {
    const token = c.req.header("authorization")?.split(" ")[1];
    if (!token) return c.json({ error: "Missing token" }, 401);
    const id = c.req.param("id");
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { error } = await supabase.auth.oauth.revokeAuthorization(id);
    if (error) throw error;
    return c.json({ success: true });
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});
