import { Hono } from "hono";
import { getAuthenticatedClient, getAdminClient } from "../lib/supabase.ts";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { createHash, randomBytes } from "node:crypto";
import type { Context, Next } from "hono";

export const defenderRouter = new Hono();

// Helper to hash API keys
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Middleware for NPM package API Key auth
async function requireApiKey(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  
  const rawKey = authHeader.substring(7);
  const hash = hashApiKey(rawKey);

  const supabase = getAdminClient();
  const { data: app, error } = await supabase
    .from("defender_apps")
    .select("*, defender_config(*), defender_routes(*)")
    .eq("api_key_hash", hash)
    .single();

  if (error || !app) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  c.set("defenderApp", app);
  await next();
}

// Middleware for UI JWT auth
async function requireJwt(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.substring(7);
  const supabase = getAuthenticatedClient(token);
  
  c.set("supabase", supabase);
  await next();
}

// ============================================================================
// NPM Package Endpoints
// ============================================================================

// Rate limiters
const packageLimiter = rateLimiter(60, 60000, "def_pkg");
const eventLimiter = rateLimiter(200, 60000, "def_evt");

// 1. POST /verify - Verify API key and return app config
defenderRouter.post("/verify", packageLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const supabase = getAdminClient();
  
  if (!app.first_request_at) {
    await supabase
      .from("defender_apps")
      .update({ first_request_at: new Date().toISOString() })
      .eq("id", app.id);
  }

  return c.json({
    id: app.id,
    name: app.name,
    block_mode_enabled: app.block_mode_enabled,
    config: app.defender_config?.[0] || {},
    routes: app.defender_routes || []
  });
});

// 2. POST /register - Register/sync routes
defenderRouter.post("/register", packageLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const body = await c.req.json();
  const routes = body.routes || [];
  
  if (!Array.isArray(routes) || routes.length === 0) {
    return c.json({ registered: 0 });
  }

  const supabase = getAdminClient();
  
  const insertData = routes.map(r => ({
    app_id: app.id,
    method: r.method,
    path: r.path
  }));

  const { data, error } = await supabase
    .from("defender_routes")
    .upsert(insertData, { onConflict: "app_id, method, path", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ registered: data?.length || 0 });
});

// 3. POST /event - Log an inbound security event
defenderRouter.post("/event", eventLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const body = await c.req.json();
  const supabase = getAdminClient();

  // Try to match route_id
  const matchingRoute = (app.defender_routes || []).find(
    (r: any) => r.method === body.method && r.path === body.path
  );

  const { error } = await supabase
    .from("defender_events")
    .insert({
      app_id: app.id,
      route_id: matchingRoute?.id || null,
      event_type: body.eventType,
      ip: body.ip,
      country_code: body.countryCode,
      user_agent: body.userAgent,
      method: body.method,
      path: body.path,
      blocked: body.blocked,
      request_body_snippet: body.requestBodySnippet
    });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({}, 201);
});

// 4. POST /outbound - Log/upsert an outbound connection
defenderRouter.post("/outbound", eventLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const body = await c.req.json();
  const supabase = getAdminClient();

  // Actually UPSERT logic - handled at DB level or check first
  const { data: existing, error: searchError } = await supabase
    .from("defender_outbound")
    .select("*")
    .eq("app_id", app.id)
    .eq("host", body.host)
    .eq("port", body.port || 80)
    .eq("protocol", body.protocol || "tcp")
    .single();
    
  if (existing) {
    await supabase
      .from("defender_outbound")
      .update({
        last_seen: new Date().toISOString(),
        request_count: (existing.request_count || 1) + 1,
        ip: body.ip || existing.ip
      })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("defender_outbound")
      .insert({
        app_id: app.id,
        host: body.host,
        ip: body.ip,
        port: body.port || 80,
        protocol: body.protocol || "tcp",
        request_count: 1,
        last_seen: new Date().toISOString()
      });
  }

  return c.json({}, 200);
});

// ============================================================================
// UI Endpoints
// ============================================================================

const uiLimiter = rateLimiter(30, 60000, "def_ui");

// 5. GET /apps - List user's defender apps
defenderRouter.get("/apps", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("defender_apps")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 6. POST /apps - Create new protected app
defenderRouter.post("/apps", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const { name } = await c.req.json();
  
  if (!name) return c.json({ error: "Name is required" }, 400);

  const rawKey = "def_" + randomBytes(16).toString("hex");
  const apiKeyHash = hashApiKey(rawKey);
  const apiKeyPrefix = rawKey.substring(0, 8);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase
    .from("defender_apps")
    .insert({
      user_id: user.id,
      name,
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix
    })
    .select("*")
    .single();

  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    ...data,
    apiKey: rawKey
  }, 201);
});

// 7. DELETE /apps/:id - Delete app
defenderRouter.delete("/apps/:id", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");

  const { error } = await supabase
    .from("defender_apps")
    .delete()
    .eq("id", id);

  if (error) return c.json({ error: error.message }, 500);
  return c.body(null, 204);
});

// 8. GET /apps/:id - Get single app with config
defenderRouter.get("/apps/:id", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");

  const { data, error } = await supabase
    .from("defender_apps")
    .select("*, defender_config(*)")
    .eq("id", id)
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 9. PUT /apps/:id/block-mode - Toggle block mode
defenderRouter.put("/apps/:id/block-mode", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  const { enabled } = await c.req.json();

  const { data: app } = await supabase
    .from("defender_apps")
    .select("block_mode_enabled_at")
    .eq("id", id)
    .single();

  const updateData: any = { block_mode_enabled: enabled };
  
  if (enabled && app && !app.block_mode_enabled_at) {
    updateData.block_mode_enabled_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("defender_apps")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 10. PUT /apps/:id/config - Update security config
defenderRouter.put("/apps/:id/config", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  const body = await c.req.json();

  const { data, error } = await supabase
    .from("defender_config")
    .update(body)
    .eq("app_id", id)
    .select("*")
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 11. GET /apps/:id/routes - List routes for app
defenderRouter.get("/apps/:id/routes", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");

  const { data, error } = await supabase
    .from("defender_routes")
    .select("*")
    .eq("app_id", id)
    .order("path", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 12. PUT /routes/:routeId - Update route rate limit config
defenderRouter.put("/routes/:routeId", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const routeId = c.req.param("routeId");
  const body = await c.req.json();

  const { data, error } = await supabase
    .from("defender_routes")
    .update({
      rate_limit_enabled: body.rateLimitEnabled,
      rate_limit_requests: body.rateLimitRequests,
      rate_limit_window_seconds: body.rateLimitWindowSeconds
    })
    .eq("id", routeId)
    .select("*")
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 13. GET /apps/:id/events - Get event log with pagination + filters
defenderRouter.get("/apps/:id/events", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const eventType = c.req.query("eventType");
  const blockedStr = c.req.query("blocked");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  let query = supabase
    .from("defender_events")
    .select("*", { count: "exact" })
    .eq("app_id", id);

  if (eventType) query = query.eq("event_type", eventType);
  if (blockedStr) query = query.eq("blocked", blockedStr === "true");
  if (startDate) query = query.gte("created_at", startDate);
  if (endDate) query = query.lte("created_at", endDate);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    events: data,
    total: count,
    page,
    limit
  });
});

// 14. GET /apps/:id/outbound - List outbound connections
defenderRouter.get("/apps/:id/outbound", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");

  const { data, error } = await supabase
    .from("defender_outbound")
    .select("*")
    .eq("app_id", id)
    .order("last_seen", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 15. PUT /outbound/:id - Toggle allow/deny for outbound
defenderRouter.put("/outbound/:id", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  const { allowed } = await c.req.json();

  const { data, error } = await supabase
    .from("defender_outbound")
    .update({ allowed })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// 16. DELETE /outbound/:id - Remove outbound entry
defenderRouter.delete("/outbound/:id", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");

  const { error } = await supabase
    .from("defender_outbound")
    .delete()
    .eq("id", id);

  if (error) return c.json({ error: error.message }, 500);
  return c.body(null, 204);
});

// 17. POST /apps/:id/rotate-key - Rotate API key
defenderRouter.post("/apps/:id/rotate-key", uiLimiter, requireJwt, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");

  const rawKey = "def_" + randomBytes(16).toString("hex");
  const apiKeyHash = hashApiKey(rawKey);
  const apiKeyPrefix = rawKey.substring(0, 8);

  const { error } = await supabase
    .from("defender_apps")
    .update({
      api_key_hash: apiKeyHash,
      api_key_prefix: apiKeyPrefix
    })
    .eq("id", id);

  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    apiKey: rawKey,
    apiKeyPrefix
  });
});
