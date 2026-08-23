import { Hono } from "hono";
import { getAuthenticatedClient } from "../lib/supabase.ts";
import { rateLimiter } from "../lib/rateLimiter.ts";

interface SupabaseOAuthAdmin {
  listClients(): Promise<{ data: any; error: any }>;
  listAuthorizedApps(): Promise<{ data: any; error: any }>;
  createClient(params: {
    name: string;
    type: string;
    redirect_uris: string[];
  }): Promise<{ data: any; error: any }>;
  deleteClient(id: string): Promise<{ error: any }>;
  revokeAuthorization(id: string): Promise<{ error: any }>;
}

export const oauthAdminRouter = new Hono();

// 20 requests per minute for OAuth admin operations
const apiLimiter = rateLimiter(20, 60_000, "oauth-admin");

oauthAdminRouter.use("*", apiLimiter);

oauthAdminRouter.get("/clients", async (c) => {
  try {
    const authHeader = c.req.header("authorization");
    // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return c.json({ error: "Missing token" }, 401);
    const supabase = getAuthenticatedClient(token);
    const oauth = (supabase.auth as any).oauth as SupabaseOAuthAdmin;
    const { data, error } = await oauth.listClients();
    if (error) throw error;
    return c.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});

oauthAdminRouter.get("/authorized-apps", async (c) => {
  try {
    const authHeader = c.req.header("authorization");
    // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return c.json({ error: "Missing token" }, 401);
    const supabase = getAuthenticatedClient(token);
    const oauth = (supabase.auth as any).oauth as SupabaseOAuthAdmin;
    const { data, error } = await oauth.listAuthorizedApps();
    if (error) throw error;
    return c.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});

oauthAdminRouter.post("/clients", async (c) => {
  try {
    const authHeader = c.req.header("authorization");
    // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return c.json({ error: "Missing token" }, 401);
    const { name, type, redirect_uris } = await c.req.json();
    const supabase = getAuthenticatedClient(token);
    const oauth = (supabase.auth as any).oauth as SupabaseOAuthAdmin;
    const { data, error } = await oauth.createClient({
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
    const authHeader = c.req.header("authorization");
    // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return c.json({ error: "Missing token" }, 401);
    const id = c.req.param("id");
    const supabase = getAuthenticatedClient(token);
    const oauth = (supabase.auth as any).oauth as SupabaseOAuthAdmin;
    const { error } = await oauth.deleteClient(id);
    if (error) throw error;
    return c.json({ success: true });
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});

oauthAdminRouter.post("/revoke-authorization/:id", async (c) => {
  try {
    const authHeader = c.req.header("authorization");
    // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
    const token = authHeader?.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return c.json({ error: "Missing token" }, 401);
    const id = c.req.param("id");
    const supabase = getAuthenticatedClient(token);
    const oauth = (supabase.auth as any).oauth as SupabaseOAuthAdmin;
    const { error } = await oauth.revokeAuthorization(id);
    if (error) throw error;
    return c.json({ success: true });
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    return c.json({ error: err.message }, 500);
  }
});
