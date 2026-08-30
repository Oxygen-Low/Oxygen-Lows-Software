import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getAdminClient } from "../lib/supabase.ts";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getTableRows,
  saveTableRows,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
} from "../lib/dataStore.ts";
import type { Context, Next } from "hono";

export const defenderRouter = new Hono<{
  Variables: { defenderApp: any; user: any; userId: string };
}>();

// SSE Config Listeners for Real-Time SDK Updates
type ConfigListener = (data: any) => void;
const configListeners = new Map<string, Set<ConfigListener>>();

export function addConfigListener(appId: string, listener: ConfigListener) {
  let listeners = configListeners.get(appId);
  if (!listeners) {
    listeners = new Set();
    configListeners.set(appId, listeners);
  }
  listeners.add(listener);
}

export function removeConfigListener(appId: string, listener: ConfigListener) {
  const listeners = configListeners.get(appId);
  if (listeners) {
    listeners.delete(listener);
    if (listeners.size === 0) {
      configListeners.delete(appId);
    }
  }
}

export async function broadcastConfigUpdate(appId: string) {
  const listeners = configListeners.get(appId);
  if (!listeners || listeners.size === 0) return;

  try {
    let app: any = null;
    let config: any = null;
    let routes: any[] = [];

    // Check local dataStore
    const allApps = getTableRows("defender_apps");
    const localApp = allApps.find((a: any) => a.id === appId);
    if (localApp) {
      app = localApp;
      const allConfigs = getTableRows("defender_config", app.user_id);
      config = allConfigs.find((c: any) => c.app_id === appId) || {};
      const allRoutes = getTableRows("defender_routes", app.user_id);
      routes = allRoutes.filter((r: any) => r.app_id === appId);
    } else {
      // Supabase fallback
      try {
        const supabase = getAdminClient();
        const { data: sbApp } = await supabase
          .from("defender_apps")
          .select("*, defender_config(*), defender_routes(*)")
          .eq("id", appId)
          .single();
        if (sbApp) {
          app = sbApp;
          config = Array.isArray(app.defender_config)
            ? app.defender_config[0] || {}
            : app.defender_config || {};
          routes = app.defender_routes || [];
        }
      } catch {}
    }

    if (!app) return;

    const payload = {
      id: app.id,
      name: app.name,
      block_mode_enabled: app.block_mode_enabled,
      config,
      routes,
    };

    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error("[Defender] Error broadcasting to listener:", err);
      }
    }
  } catch (err) {
    console.error("[Defender] Failed to broadcast config update:", err);
  }
}

// Helper to hash API keys
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Middleware for NPM package API Key auth
async function requireApiKey(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
  const rawKey = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
  if (!rawKey) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const hash = hashApiKey(rawKey);

  // 1. Check local data store first
  const allApps = getTableRows("defender_apps");
  let app = allApps.find((a: any) => a.api_key_hash === hash);

  if (app) {
    const allConfigs = getTableRows("defender_config", app.user_id);
    const config = allConfigs.find((cfg: any) => cfg.app_id === app.id) || null;
    const allRoutes = getTableRows("defender_routes", app.user_id);
    const routes = allRoutes.filter((r: any) => r.app_id === app.id);

    app = {
      ...app,
      defender_config: config ? [config] : [],
      defender_routes: routes,
      _isLocal: true,
    };
  } else {
    // 2. Fallback to Supabase
    try {
      const supabase = getAdminClient();
      const { data: sbApp, error } = await supabase
        .from("defender_apps")
        .select("*, defender_config(*), defender_routes(*)")
        .eq("api_key_hash", hash)
        .single();

      if (!error && sbApp) {
        app = sbApp;
      }
    } catch {}
  }

  if (!app) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  c.set("defenderApp", app);
  await next();
}

// Middleware for UI auth
async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("userId", user.id);
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

  if (!app.first_request_at) {
    const now = new Date().toISOString();
    app.first_request_at = now;
    if (app._isLocal) {
      updateTable(
        "defender_apps",
        [{ field: "id", operator: "eq", value: app.id }],
        { first_request_at: now },
        app.user_id,
      );
    } else {
      try {
        const supabase = getAdminClient();
        await supabase
          .from("defender_apps")
          .update({ first_request_at: now })
          .eq("id", app.id);
      } catch {}
    }
  }

  const config = Array.isArray(app.defender_config)
    ? app.defender_config[0] || {}
    : app.defender_config || {};

  return c.json({
    id: app.id,
    name: app.name,
    block_mode_enabled: app.block_mode_enabled,
    config: config,
    routes: app.defender_routes || [],
  });
});

// 1b. GET /config-stream - Real-time SSE stream of app config updates for SDK
defenderRouter.get("/config-stream", requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  return streamSSE(c, async (stream) => {
    let freshConfig: any = {};
    let freshRoutes: any[] = [];
    let blockModeEnabled = app.block_mode_enabled;
    let appName = app.name;

    if (app._isLocal) {
      const allApps = getTableRows("defender_apps", app.user_id);
      const curApp = allApps.find((a: any) => a.id === app.id);
      if (curApp) {
        blockModeEnabled = curApp.block_mode_enabled;
        appName = curApp.name;
      }
      const allConfigs = getTableRows("defender_config", app.user_id);
      freshConfig = allConfigs.find((cfg: any) => cfg.app_id === app.id) || {};
      freshRoutes = getTableRows("defender_routes", app.user_id).filter(
        (r: any) => r.app_id === app.id,
      );
    } else {
      try {
        const supabase = getAdminClient();
        const { data: freshApp } = await supabase
          .from("defender_apps")
          .select("*, defender_config(*), defender_routes(*)")
          .eq("id", app.id)
          .single();

        if (freshApp) {
          appName = freshApp.name;
          blockModeEnabled = freshApp.block_mode_enabled;
          freshConfig = Array.isArray(freshApp.defender_config)
            ? freshApp.defender_config[0] || {}
            : freshApp.defender_config || {};
          freshRoutes = freshApp.defender_routes || [];
        }
      } catch {}
    }

    await stream.writeSSE({
      event: "config",
      data: JSON.stringify({
        id: app.id,
        name: appName,
        block_mode_enabled: blockModeEnabled,
        config: freshConfig,
        routes: freshRoutes,
      }),
    });

    const listener = async (payload: any) => {
      try {
        await stream.writeSSE({
          event: "config",
          data: JSON.stringify(payload),
        });
      } catch (_) {
        // stream closed
      }
    };

    addConfigListener(app.id, listener);

    stream.onAbort(() => {
      removeConfigListener(app.id, listener);
    });

    // Keepalive ping loop
    while (!stream.aborted) {
      await stream.sleep(30000);
      try {
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch (_) {
        break;
      }
    }
    removeConfigListener(app.id, listener);
  });
});

// 2. POST /register - Register/sync routes
defenderRouter.post("/register", packageLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const body = await c.req.json().catch(() => ({}));
  const routes = body.routes || [];

  if (!Array.isArray(routes) || routes.length === 0) {
    return c.json({ registered: 0 });
  }

  if (app._isLocal) {
    const existingRoutes = getTableRows("defender_routes", app.user_id);
    let registeredCount = 0;

    for (const r of routes) {
      const match = existingRoutes.find(
        (er: any) =>
          er.app_id === app.id &&
          er.method === r.method &&
          er.path === r.path,
      );
      if (!match) {
        const newRoute = {
          id: randomUUID(),
          app_id: app.id,
          user_id: app.user_id,
          method: r.method,
          path: r.path,
          rate_limit_enabled: false,
          rate_limit_requests: 100,
          rate_limit_window_seconds: 60,
          created_at: new Date().toISOString(),
        };
        existingRoutes.push(newRoute);
        registeredCount++;
      }
    }

    saveTableRows("defender_routes", app.user_id, existingRoutes);
    broadcastConfigUpdate(app.id).catch(() => {});
    return c.json({ registered: registeredCount });
  } else {
    // Supabase fallback
    const supabase = getAdminClient();
    const insertData = routes.map((r: any) => ({
      app_id: app.id,
      method: r.method,
      path: r.path,
    }));

    const { data, error } = await supabase
      .from("defender_routes")
      .upsert(insertData, {
        onConflict: "app_id, method, path",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    broadcastConfigUpdate(app.id).catch(() => {});
    return c.json({ registered: data?.length || 0 });
  }
});

// 3. POST /event - Log an inbound security event
defenderRouter.post("/event", eventLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const body = await c.req.json().catch(() => ({}));

  // Try to match route_id
  const matchingRoute = (app.defender_routes || []).find(
    (r: any) => r.method === body.method && r.path === body.path,
  );

  const eventRecord = {
    id: randomUUID(),
    app_id: app.id,
    user_id: app.user_id,
    route_id: matchingRoute?.id || null,
    event_type: body.eventType,
    ip: body.ip,
    country_code: body.countryCode,
    method: body.method,
    path: body.path,
    blocked: Boolean(body.blocked),
    request_body_snippet: body.requestBodySnippet || null,
    created_at: new Date().toISOString(),
  };

  if (app._isLocal) {
    const existingEvents = getTableRows("defender_events", app.user_id);
    existingEvents.unshift(eventRecord);

    const config = Array.isArray(app.defender_config)
      ? app.defender_config[0] || {}
      : app.defender_config || {};
    const maxEvents = Math.min(1000, Math.max(1, config.events_limit || 50));

    const appEvents = existingEvents.filter((e: any) => e.app_id === app.id).slice(0, maxEvents);
    const otherEvents = existingEvents.filter((e: any) => e.app_id !== app.id);
    saveTableRows("defender_events", app.user_id, [...appEvents, ...otherEvents]);

    return c.json({}, 201);
  } else {
    // Supabase fallback
    const supabase = getAdminClient();
    const { error } = await supabase.from("defender_events").insert({
      app_id: app.id,
      route_id: matchingRoute?.id || null,
      event_type: body.eventType,
      ip: body.ip,
      country_code: body.countryCode,
      method: body.method,
      path: body.path,
      blocked: body.blocked,
      request_body_snippet: body.requestBodySnippet,
    });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    try {
      const config = Array.isArray(app.defender_config)
        ? app.defender_config[0] || {}
        : app.defender_config || {};
      const maxEvents = Math.min(1000, Math.max(1, config.events_limit || 50));
      const { data: excess } = await supabase
        .from("defender_events")
        .select("id")
        .eq("app_id", app.id)
        .order("created_at", { ascending: false })
        .range(maxEvents, maxEvents + 20);

      if (excess && excess.length > 0) {
        await supabase
          .from("defender_events")
          .delete()
          .in(
            "id",
            excess.map((e: any) => e.id),
          );
      }
    } catch (_) {}

    return c.json({}, 201);
  }
});

// 4. POST /outbound - Log/upsert an outbound connection
defenderRouter.post("/outbound", eventLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const body = await c.req.json().catch(() => ({}));

  if (app._isLocal) {
    const existingOutbound = getTableRows("defender_outbound", app.user_id);
    const existing = existingOutbound.find(
      (o: any) =>
        o.app_id === app.id &&
        o.host === body.host &&
        (o.port || 80) === (body.port || 80) &&
        (o.protocol || "tcp") === (body.protocol || "tcp"),
    );

    if (existing) {
      existing.last_seen = new Date().toISOString();
      existing.request_count = (existing.request_count || 1) + 1;
      if (body.ip) existing.ip = body.ip;
    } else {
      existingOutbound.push({
        id: randomUUID(),
        app_id: app.id,
        user_id: app.user_id,
        host: body.host,
        ip: body.ip || null,
        port: body.port || 80,
        protocol: body.protocol || "tcp",
        request_count: 1,
        allowed: true,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });
    }

    saveTableRows("defender_outbound", app.user_id, existingOutbound);
    return c.json({}, 200);
  } else {
    // Supabase fallback
    const supabase = getAdminClient();
    const { data: existing } = await supabase
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
          ip: body.ip || existing.ip,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("defender_outbound").insert({
        app_id: app.id,
        host: body.host,
        ip: body.ip,
        port: body.port || 80,
        protocol: body.protocol || "tcp",
        request_count: 1,
        last_seen: new Date().toISOString(),
      });
    }

    return c.json({}, 200);
  }
});

// ============================================================================
// UI Endpoints
// ============================================================================

const uiLimiter = rateLimiter(30, 60000, "def_ui");

// 5. GET /apps - List user's defender apps
defenderRouter.get("/apps", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  let apps = getTableRows("defender_apps", user.id);

  // If local apps is empty, check Supabase as fallback
  if (apps.length === 0) {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("defender_apps")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!error && data && data.length > 0) {
        apps = data;
      }
    } catch {}
  }

  apps.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return c.json(apps);
});

// 6. POST /apps - Create new protected app
defenderRouter.post("/apps", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const { name } = await c.req.json().catch(() => ({}));

  if (!name) return c.json({ error: "Name is required" }, 400);

  const rawKey = "def_" + randomBytes(16).toString("hex");
  const apiKeyHash = hashApiKey(rawKey);
  const apiKeyPrefix = rawKey.substring(0, 8);
  const appId = randomUUID();
  const now = new Date().toISOString();

  const newApp = {
    id: appId,
    user_id: user.id,
    name,
    api_key_hash: apiKeyHash,
    api_key_prefix: apiKeyPrefix,
    api_key: rawKey,
    block_mode_enabled: false,
    block_mode_enabled_at: null,
    first_request_at: null,
    created_at: now,
  };

  insertTable("defender_apps", newApp, user.id);

  const defaultConfig = {
    id: randomUUID(),
    app_id: appId,
    user_id: user.id,
    block_sql_injection: true,
    block_shell_injection: true,
    block_path_traversal: true,
    block_ssrf: true,
    block_tor: true,
    block_vpn: true,
    block_countries: [],
    block_ips: [],
    block_ad_bots: false,
    block_ai_assistants: false,
    block_ai_scrapers: true,
    block_ai_search_crawlers: false,
    block_data_harvesters: true,
    block_bruteforce: true,
    block_http_dos: true,
    block_http_exploit: true,
    block_botnets: true,
    ddos_protection: true,
    ddos_threshold_rpm: 1000,
    events_limit: 50,
    created_at: now,
  };

  insertTable("defender_config", defaultConfig, user.id);

  return c.json(
    {
      ...newApp,
      apiKey: rawKey,
    },
    201,
  );
});

// 7. DELETE /apps/:id - Delete app
defenderRouter.delete("/apps/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  deleteTable("defender_apps", [{ field: "id", operator: "eq", value: id }], user.id);
  deleteTable("defender_config", [{ field: "app_id", operator: "eq", value: id }], user.id);
  deleteTable("defender_routes", [{ field: "app_id", operator: "eq", value: id }], user.id);
  deleteTable("defender_events", [{ field: "app_id", operator: "eq", value: id }], user.id);
  deleteTable("defender_outbound", [{ field: "app_id", operator: "eq", value: id }], user.id);

  try {
    const supabase = getAdminClient();
    await supabase.from("defender_apps").delete().eq("id", id).eq("user_id", user.id);
  } catch {}

  return c.body(null, 204);
});

// 8. GET /apps/:id - Get single app with config
defenderRouter.get("/apps/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  const apps = getTableRows("defender_apps", user.id);
  const app = apps.find((a: any) => a.id === id);

  if (app) {
    const configs = getTableRows("defender_config", user.id);
    const config = configs.find((cfg: any) => cfg.app_id === id) || null;
    return c.json({
      ...app,
      defender_config: config ? [config] : [],
    });
  }

  // Supabase fallback
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("defender_apps")
      .select("*, defender_config(*)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!error && data) return c.json(data);
  } catch {}

  return c.json({ error: "App not found" }, 404);
});

// 9. PUT /apps/:id/block-mode - Toggle block mode
defenderRouter.put("/apps/:id/block-mode", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const { enabled } = await c.req.json().catch(() => ({}));

  const apps = getTableRows("defender_apps", user.id);
  const app = apps.find((a: any) => a.id === id);

  if (app) {
    const updateData: any = { block_mode_enabled: Boolean(enabled) };
    if (enabled && !app.block_mode_enabled_at) {
      updateData.block_mode_enabled_at = new Date().toISOString();
    }
    const updated = updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: id }],
      updateData,
      user.id,
    );
    broadcastConfigUpdate(id).catch(() => {});
    return c.json(updated[0] || { ...app, ...updateData });
  }

  // Supabase fallback
  try {
    const supabase = getAdminClient();
    const { data: sbApp } = await supabase
      .from("defender_apps")
      .select("block_mode_enabled_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    const updateData: any = { block_mode_enabled: Boolean(enabled) };
    if (enabled && sbApp && !sbApp.block_mode_enabled_at) {
      updateData.block_mode_enabled_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("defender_apps")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    broadcastConfigUpdate(id).catch(() => {});
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 10. PUT /apps/:id/config - Update security config
defenderRouter.put("/apps/:id/config", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const allowedKeys = [
    "block_sql_injection",
    "block_shell_injection",
    "block_path_traversal",
    "block_ssrf",
    "block_tor",
    "block_vpn",
    "block_countries",
    "block_ips",
    "block_ad_bots",
    "block_ai_assistants",
    "block_ai_scrapers",
    "block_ai_search_crawlers",
    "block_data_harvesters",
    "block_bruteforce",
    "block_http_dos",
    "block_http_exploit",
    "block_botnets",
    "ddos_protection",
    "ddos_threshold_rpm",
    "events_limit",
  ];

  const updatePayload: Record<string, any> = { app_id: id, user_id: user.id };
  for (const key of allowedKeys) {
    if (key in body) {
      if (key === "events_limit") {
        updatePayload[key] = Math.min(
          1000,
          Math.max(1, parseInt(body[key]) || 50),
        );
      } else {
        updatePayload[key] = body[key];
      }
    }
  }

  const result = upsertTable("defender_config", updatePayload, user.id, "app_id");

  // If events_limit was configured, prune any existing events exceeding the new limit
  if (updatePayload.events_limit !== undefined) {
    const existingEvents = getTableRows("defender_events", user.id);
    const appEvents = existingEvents.filter((e: any) => e.app_id === id);
    const otherEvents = existingEvents.filter((e: any) => e.app_id !== id);
    if (appEvents.length > updatePayload.events_limit) {
      const pruned = appEvents.slice(0, updatePayload.events_limit);
      saveTableRows("defender_events", user.id, [...pruned, ...otherEvents]);
    }
  }

  broadcastConfigUpdate(id).catch(() => {});
  return c.json(result[0] || updatePayload);
});

// 11. GET /apps/:id/routes - List routes for app
defenderRouter.get("/apps/:id/routes", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  let routes = getTableRows("defender_routes", user.id).filter((r: any) => r.app_id === id);

  if (routes.length === 0) {
    try {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from("defender_routes")
        .select("*")
        .eq("app_id", id)
        .order("path", { ascending: true });
      if (data && data.length > 0) routes = data;
    } catch {}
  }

  routes.sort((a: any, b: any) => (a.path || "").localeCompare(b.path || ""));
  return c.json(routes);
});

// 12. PUT /routes/:routeId - Update route rate limit config
defenderRouter.put("/routes/:routeId", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const routeId = c.req.param("routeId");
  const body = await c.req.json().catch(() => ({}));

  const updateData: any = {};
  if (body.rateLimitEnabled !== undefined || body.rate_limit_enabled !== undefined) {
    updateData.rate_limit_enabled = body.rateLimitEnabled ?? body.rate_limit_enabled;
  }
  if (body.rateLimitRequests !== undefined || body.rate_limit_requests !== undefined) {
    updateData.rate_limit_requests = body.rateLimitRequests ?? body.rate_limit_requests;
  }
  if (body.rateLimitWindowSeconds !== undefined || body.rate_limit_window_seconds !== undefined) {
    updateData.rate_limit_window_seconds =
      body.rateLimitWindowSeconds ?? body.rate_limit_window_seconds;
  }

  const updated = updateTable(
    "defender_routes",
    [{ field: "id", operator: "eq", value: routeId }],
    updateData,
    user.id,
  );

  let updatedRoute = updated[0];
  if (!updatedRoute) {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("defender_routes")
        .update(updateData)
        .eq("id", routeId)
        .select("*")
        .single();
      if (!error && data) updatedRoute = data;
    } catch {}
  }

  if (updatedRoute && updatedRoute.app_id) {
    broadcastConfigUpdate(updatedRoute.app_id).catch(() => {});
  }
  return c.json(updatedRoute || {});
});

// 13. GET /apps/:id/events - Get event log with pagination + filters
defenderRouter.get("/apps/:id/events", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query("limit") || "1000")),
    1000,
  );
  const eventType = c.req.query("eventType");
  const blockedStr = c.req.query("blocked");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  let events = getTableRows("defender_events", user.id).filter((e: any) => e.app_id === id);

  if (events.length === 0) {
    try {
      const supabase = getAdminClient();
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
      const { data, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (data) {
        return c.json({
          events: data,
          total: count,
          page,
          limit,
        });
      }
    } catch {}
  }

  if (eventType) {
    events = events.filter((e: any) => e.event_type === eventType);
  }
  if (blockedStr !== undefined && blockedStr !== "") {
    events = events.filter((e: any) => String(e.blocked) === blockedStr);
  }
  if (startDate) {
    events = events.filter((e: any) => new Date(e.created_at) >= new Date(startDate));
  }
  if (endDate) {
    events = events.filter((e: any) => new Date(e.created_at) <= new Date(endDate));
  }

  events.sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const total = events.length;
  const from = (page - 1) * limit;
  const paginatedEvents = events.slice(from, from + limit);

  return c.json({
    events: paginatedEvents,
    total,
    page,
    limit,
  });
});

// 14. GET /apps/:id/outbound - List outbound connections
defenderRouter.get("/apps/:id/outbound", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  let outbound = getTableRows("defender_outbound", user.id).filter(
    (o: any) => o.app_id === id,
  );

  if (outbound.length === 0) {
    try {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from("defender_outbound")
        .select("*")
        .eq("app_id", id)
        .order("last_seen", { ascending: false });
      if (data && data.length > 0) outbound = data;
    } catch {}
  }

  outbound.sort(
    (a: any, b: any) =>
      new Date(b.last_seen || 0).getTime() - new Date(a.last_seen || 0).getTime(),
  );
  return c.json(outbound);
});

// 15. PUT /outbound/:id - Toggle allow/deny for outbound
defenderRouter.put("/outbound/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const { allowed } = await c.req.json().catch(() => ({}));

  const updated = updateTable(
    "defender_outbound",
    [{ field: "id", operator: "eq", value: id }],
    { allowed: Boolean(allowed) },
    user.id,
  );

  let updatedOutbound = updated[0];
  if (!updatedOutbound) {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("defender_outbound")
        .update({ allowed: Boolean(allowed) })
        .eq("id", id)
        .select("*")
        .single();
      if (!error && data) updatedOutbound = data;
    } catch {}
  }

  return c.json(updatedOutbound || {});
});

// 16. DELETE /outbound/:id - Remove outbound entry
defenderRouter.delete("/outbound/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  deleteTable(
    "defender_outbound",
    [{ field: "id", operator: "eq", value: id }],
    user.id,
  );

  try {
    const supabase = getAdminClient();
    await supabase.from("defender_outbound").delete().eq("id", id);
  } catch {}

  return c.body(null, 204);
});

// 17. POST /apps/:id/rotate-key - Rotate API key
defenderRouter.post(
  "/apps/:id/rotate-key",
  uiLimiter,
  requireAuth,
  async (c) => {
    const user = c.get("user" as any);
    const id = c.req.param("id");

    const rawKey = "def_" + randomBytes(16).toString("hex");
    const apiKeyHash = hashApiKey(rawKey);
    const apiKeyPrefix = rawKey.substring(0, 8);

    const updated = updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: id }],
      {
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        api_key: rawKey,
      },
      user.id,
    );

    if (updated.length === 0) {
      try {
        const supabase = getAdminClient();
        await supabase
          .from("defender_apps")
          .update({
            api_key_hash: apiKeyHash,
            api_key_prefix: apiKeyPrefix,
          })
          .eq("id", id);
      } catch {}
    }

    broadcastConfigUpdate(id).catch(() => {});

    return c.json({
      apiKey: rawKey,
      apiKeyPrefix,
    });
  },
);

