import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
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
import {
  getActiveDefenderBannedIps,
  publicDefenderBannedIp,
} from "../lib/defenderBannedIps.ts";
import { TorDetector } from "../../packages/webdefender/src/tor.ts";
import { VpnDetector } from "../../packages/webdefender/src/vpn.ts";
import { ThreatActorDetector } from "../../packages/webdefender/src/threatActors.ts";

export const torDetector = new TorDetector();
export const vpnDetector = new VpnDetector();
export const threatActorDetector = new ThreatActorDetector();

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
    // Check local dataStore
    const allApps = getTableRows("defender_apps");
    const localApp = allApps.find((a: any) => a.id === appId);
    if (!localApp) return;

    const app = localApp;
    const allConfigs = getTableRows("defender_config", app.user_id);
    const config = allConfigs.find((c: any) => c.app_id === appId) || {};
    const allRoutes = getTableRows("defender_routes", app.user_id);
    const routes = allRoutes.filter((r: any) => r.app_id === appId);

    const payload = {
      id: app.id,
      name: app.name,
      block_mode_enabled: app.block_mode_enabled,
      config,
      routes,
      admin_banned_ips: config.block_admin_banned_ips !== false
        ? getActiveDefenderBannedIps().map(publicDefenderBannedIp)
        : [],
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

/** Refresh every connected SDK after a platform-wide ban changes. */
export async function broadcastAllDefenderConfigUpdates() {
  const appIds = getTableRows("defender_apps").map((app: any) => app.id);
  await Promise.all(appIds.map((appId: string) => broadcastConfigUpdate(appId)));
}

function packageConfigPayload(app: any, config: any, routes: any[]) {
  return {
    id: app.id,
    name: app.name,
    block_mode_enabled: app.block_mode_enabled,
    config,
    routes,
    admin_banned_ips: config.block_admin_banned_ips !== false
      ? getActiveDefenderBannedIps().map(publicDefenderBannedIp)
      : [],
  };
}

const ABUSEIPDB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function publicDefenderApp(app: any) {
  const {
    api_key: _apiKey,
    api_key_hash: _apiKeyHash,
    abuseipdb_api_key: _abuseIpDbKey,
    ...safeApp
  } = app;
  return {
    ...safeApp,
    abuseipdb_configured: Boolean(_abuseIpDbKey),
  };
}

async function checkAbuseIpDbAndMaybeBlock(app: any, ip: unknown, config: any) {
  if (!config.auto_block_abuseipdb || !app.abuseipdb_api_key || typeof ip !== "string") return;
  const cleanIp = ip.trim();
  if (!cleanIp || !isIP(cleanIp)) return;

  const now = Date.now();
  const records = getTableRows("defender_ip_blocks", app.user_id);
  const previous = records.find(
    (record: any) => record.app_id === app.id && record.ip === cleanIp,
  );
  if (previous?.checked_at && now - new Date(previous.checked_at).getTime() < ABUSEIPDB_CACHE_TTL_MS) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(cleanIp)}&maxAgeInDays=90`,
      {
        headers: {
          Accept: "application/json",
          Key: app.abuseipdb_api_key,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      console.warn(`[Defender] AbuseIPDB check failed (${response.status}) for ${cleanIp}`);
      return;
    }
    const payload: any = await response.json();
    const abuseConfidenceScore = Number(payload?.data?.abuseConfidenceScore || 0);
    const checkedAt = new Date().toISOString();
    const updatedRecord = {
      ...(previous || { id: randomUUID(), app_id: app.id, user_id: app.user_id, ip: cleanIp }),
      checked_at: checkedAt,
      abuse_confidence_score: abuseConfidenceScore,
      auto_blocked: abuseConfidenceScore > 0,
    };
    if (previous) {
      updateTable(
        "defender_ip_blocks",
        [{ field: "id", operator: "eq", value: previous.id }],
        updatedRecord,
        app.user_id,
      );
    } else {
      insertTable("defender_ip_blocks", updatedRecord, app.user_id);
    }

    if (abuseConfidenceScore > 0) {
      const currentConfig = getTableRows("defender_config", app.user_id).find(
        (cfg: any) => cfg.app_id === app.id,
      ) || { app_id: app.id, user_id: app.user_id, block_ips: [] };
      const blockIps = Array.isArray(currentConfig.block_ips) ? currentConfig.block_ips : [];
      if (!blockIps.some((blockedIp: string) => blockedIp.trim().toLowerCase() === cleanIp.toLowerCase())) {
        upsertTable(
          "defender_config",
          { ...currentConfig, block_ips: [...blockIps, cleanIp] },
          app.user_id,
          "app_id",
        );
        broadcastConfigUpdate(app.id).catch(() => {});
      }
    }
  } catch (error) {
    console.warn(`[Defender] AbuseIPDB check error for ${cleanIp}:`, error);
  } finally {
    clearTimeout(timeout);
  }
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

  // Check local data store
  const allApps = getTableRows("defender_apps");
  const localApp = allApps.find((a: any) => {
    if (!a.api_key_hash) return false;
    const actual = createHash('sha256').update(hash).digest();
    const expected = createHash('sha256').update(a.api_key_hash).digest();
    return timingSafeEqual(actual, expected);
  });

  if (!localApp) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const allConfigs = getTableRows("defender_config", localApp.user_id);
  const config =
    allConfigs.find((cfg: any) => cfg.app_id === localApp.id) || null;
  const allRoutes = getTableRows("defender_routes", localApp.user_id);
  const routes = allRoutes.filter((r: any) => r.app_id === localApp.id);

  const app = {
    ...localApp,
    defender_config: config ? [config] : [],
    defender_routes: routes,
    _isLocal: true,
  };

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
const knownThreatsLimiter = rateLimiter(5000, 60000, "def_threats");

// 1. POST /verify - Verify API key and return app config
defenderRouter.post("/verify", packageLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");

  if (!app.first_request_at) {
    const now = new Date().toISOString();
    app.first_request_at = now;
    updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: app.id }],
      { first_request_at: now },
      app.user_id,
    );
  }

  const config = Array.isArray(app.defender_config)
    ? app.defender_config[0] || {}
    : app.defender_config || {};

  return c.json(packageConfigPayload(app, config, app.defender_routes || []));
});

// Public directory API. It deliberately exposes only active, public-safe fields.
defenderRouter.get("/banned-ips", async (c) => {
  const bannedIps = getActiveDefenderBannedIps().map(publicDefenderBannedIp);
  return c.json({ banned_ips: bannedIps, total: bannedIps.length });
});

export async function evaluateIpThreat(ip: string) {
  const cleanIp = (ip || "").trim().toLowerCase();

  // 1. Check administrator-banned IPs
  const activeBans = getActiveDefenderBannedIps();
  const banMatch = activeBans.find(
    (item) => (item.ip || "").trim().toLowerCase() === cleanIp,
  );
  const isBanned = !!banMatch;
  const bannedReason = banMatch ? banMatch.reason : null;

  // 2. Check Threat Actor detector
  const threatActorMatch = threatActorDetector.checkThreatActor(cleanIp);
  const isThreatActor = !!threatActorMatch;
  const threatCategory = threatActorMatch ? threatActorMatch.category : null;

  // 3. Known threat is true if banned OR recognized threat actor
  const isKnownThreat = isBanned || isThreatActor;

  // 4. Check TOR exit node
  let isTor = torDetector.isTorExitNode(cleanIp);
  if (!isTor && typeof (torDetector as any).isTorExitNodeAsync === "function") {
    isTor = await torDetector.isTorExitNodeAsync(cleanIp);
  }

  // 5. Check VPN network (Tor nodes and excluded cloud/DNS infrastructure are not VPNs)
  const isVpn = !isTor && vpnDetector.isVpn(cleanIp);

  return {
    ip: cleanIp,
    is_known_threat: isKnownThreat,
    is_tor: isTor,
    is_vpn: isVpn,
    details: {
      banned: isBanned,
      banned_reason: bannedReason,
      threat_actor: isThreatActor,
      threat_category: threatCategory,
    },
  };
}

// Public Known Threats API - Evaluates IP against banned IPs, threat actors, TOR exit nodes, and VPN networks
defenderRouter.get("/known-threats", knownThreatsLimiter, async (c) => {
  const ipParam = c.req.query("ip");
  if (ipParam === undefined || ipParam === null || ipParam.trim() === "") {
    return c.json({ error: "IP address is required" }, 400);
  }
  const cleanIp = ipParam.trim();
  if (!isIP(cleanIp)) {
    return c.json({ error: "Invalid IP address format" }, 400);
  }
  const result = await evaluateIpThreat(cleanIp);
  return c.json(result);
});

defenderRouter.post("/known-threats", knownThreatsLimiter, async (c) => {
  let ip: string | undefined;
  try {
    const body = await c.req.json();
    ip = body?.ip;
  } catch {
    return c.json({ error: "IP address is required" }, 400);
  }

  if (typeof ip !== "string" || ip.trim() === "") {
    return c.json({ error: "IP address is required" }, 400);
  }

  const cleanIp = ip.trim();
  if (!isIP(cleanIp)) {
    return c.json({ error: "Invalid IP address format" }, 400);
  }

  const result = await evaluateIpThreat(cleanIp);
  return c.json(result);
});

// 1b. GET /config-stream - Real-time SSE stream of app config updates for SDK
defenderRouter.get("/config-stream", requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  return streamSSE(c, async (stream) => {
    let freshConfig: any = {};
    let freshRoutes: any[] = [];
    let blockModeEnabled = app.block_mode_enabled;
    let appName = app.name;

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

    await stream.writeSSE({
      event: "config",
      data: JSON.stringify(packageConfigPayload(
        { id: app.id, name: appName, block_mode_enabled: blockModeEnabled },
        freshConfig,
        freshRoutes,
      )),
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

  const existingRoutes = getTableRows("defender_routes", app.user_id);
  let registeredCount = 0;

  for (const r of routes) {
    const match = existingRoutes.find(
      (er: any) =>
        er.app_id === app.id && er.method === r.method && er.path === r.path,
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
});

// 3. POST /event - Log inbound security event(s) (single or batch array)
defenderRouter.post("/event", eventLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const body = await c.req.json().catch(() => ({}));
  const rawEvents: any[] = Array.isArray(body) ? body : [body];

  if (rawEvents.length === 0) {
    return c.json({ logged: 0 }, 201);
  }

  const existingEvents = getTableRows("defender_events", app.user_id);
  const config = Array.isArray(app.defender_config)
    ? app.defender_config[0] || {}
    : app.defender_config || {};

  const now = new Date().toISOString();
  const createdRecords: any[] = [];

  for (const item of rawEvents) {
    if (!item || typeof item !== "object") continue;

    const matchingRoute = (app.defender_routes || []).find(
      (r: any) => r.method === item.method && r.path === item.path,
    );

    const eventRecord = {
      id: randomUUID(),
      app_id: app.id,
      user_id: app.user_id,
      route_id: matchingRoute?.id || null,
      event_type: item.eventType,
      ip: item.ip,
      country_code: item.countryCode || null,
      method: item.method,
      path: item.path,
      blocked: Boolean(item.blocked),
      request_body_snippet: item.requestBodySnippet || null,
      created_at: now,
    };

    createdRecords.push(eventRecord);

    if (item.blocked && item.ip) {
      checkAbuseIpDbAndMaybeBlock(app, item.ip, config).catch(() => {});
    }
  }

  existingEvents.unshift(...createdRecords);

  const maxEvents = Math.min(1000, Math.max(1, config.events_limit || 50));
  const appEvents = existingEvents
    .filter((e: any) => e.app_id === app.id)
    .slice(0, maxEvents);
  const otherEvents = existingEvents.filter((e: any) => e.app_id !== app.id);
  saveTableRows("defender_events", app.user_id, [...appEvents, ...otherEvents]);

  return c.json({ logged: createdRecords.length }, 201);
});

// 4. POST /outbound - Log/upsert an outbound connection
defenderRouter.post("/outbound", eventLimiter, requireApiKey, async (c) => {
  const app = c.get("defenderApp");
  const config = Array.isArray(app.defender_config)
    ? app.defender_config[0] || {}
    : app.defender_config || {};
  if (config.monitor_outbound === false) {
    return c.json({}, 200);
  }

  const body = await c.req.json().catch(() => ({}));

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
});

// ============================================================================
// UI Endpoints
// ============================================================================

const uiLimiter = rateLimiter(30, 60000, "def_ui");

// 5. GET /apps - List user's defender apps
defenderRouter.get("/apps", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const apps = getTableRows("defender_apps", user.id);
  apps.sort(
    (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return c.json(apps.map(publicDefenderApp));
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
    abuseipdb_api_key: null,
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
    block_sensitive_paths: true,
    auto_block_sensitive_paths: true,
    sensitive_path_threshold: 3,
    sensitive_path_window_seconds: 20,
    sensitive_path_ban_duration_seconds: 600,
    block_tor: true,
    block_vpn: true,
    block_countries: [],
    block_ips: [],
    block_admin_banned_ips: true,
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
    monitor_outbound: true,
    batch_logging_enabled: true,
    batch_logging_interval_seconds: 20,
    only_log_threats: false,
    log_unique_ips_only: false,
    unique_ip_cooldown_seconds: 300,
    events_limit: 50,
    auto_block_abuseipdb: false,
    created_at: now,
  };

  insertTable("defender_config", defaultConfig, user.id);

  return c.json(
    {
      ...publicDefenderApp(newApp),
      apiKey: rawKey,
    },
    201,
  );
});

// 7. DELETE /apps/:id - Delete app
defenderRouter.delete("/apps/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  deleteTable(
    "defender_apps",
    [{ field: "id", operator: "eq", value: id }],
    user.id,
  );
  deleteTable(
    "defender_config",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id,
  );
  deleteTable(
    "defender_routes",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id,
  );
  deleteTable(
    "defender_events",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id,
  );
  deleteTable(
    "defender_outbound",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id,
  );
  deleteTable(
    "defender_ip_blocks",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id,
  );

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
      ...publicDefenderApp(app),
      defender_config: config ? [config] : [],
    });
  }

  return c.json({ error: "App not found" }, 404);
});

// 9. PUT /apps/:id/block-mode - Toggle block mode
defenderRouter.put(
  "/apps/:id/block-mode",
  uiLimiter,
  requireAuth,
  async (c) => {
    const user = c.get("user" as any);
    const id = c.req.param("id");
    const { enabled } = await c.req.json().catch(() => ({}));

    const apps = getTableRows("defender_apps", user.id);
    const app = apps.find((a: any) => a.id === id);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

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
  },
);

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
    "block_sensitive_paths",
    "auto_block_sensitive_paths",
    "sensitive_path_threshold",
    "sensitive_path_window_seconds",
    "sensitive_path_ban_duration_seconds",
    "block_tor",
    "block_vpn",
    "block_countries",
    "block_ips",
    "block_admin_banned_ips",
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
    "monitor_outbound",
    "events_limit",
    "auto_block_abuseipdb",
    "batch_logging_enabled",
    "batch_logging_interval_seconds",
    "only_log_threats",
    "log_unique_ips_only",
    "unique_ip_cooldown_seconds",
  ];

  const updatePayload: Record<string, any> = { app_id: id, user_id: user.id };
  for (const key of allowedKeys) {
    if (key in body) {
      if (key === "events_limit") {
        updatePayload[key] = Math.min(
          1000,
          Math.max(1, parseInt(body[key]) || 50),
        );
      } else if (key === "sensitive_path_threshold") {
        updatePayload[key] = Math.max(1, parseInt(body[key]) || 3);
      } else if (key === "sensitive_path_window_seconds") {
        updatePayload[key] = Math.max(1, parseInt(body[key]) || 20);
      } else if (key === "sensitive_path_ban_duration_seconds") {
        updatePayload[key] = Math.max(1, parseInt(body[key]) || 600);
      } else if (key === "batch_logging_interval_seconds") {
        updatePayload[key] = Math.min(
          300,
          Math.max(1, parseInt(body[key]) || 20),
        );
      } else if (key === "unique_ip_cooldown_seconds") {
        updatePayload[key] = Math.min(
          86400,
          Math.max(1, parseInt(body[key]) || 300),
        );
      } else if (
        key === "batch_logging_enabled" ||
        key === "only_log_threats" ||
        key === "log_unique_ips_only"
      ) {
        updatePayload[key] = Boolean(body[key]);
      } else {
        updatePayload[key] = body[key];
      }
    }
  }

  const result = upsertTable(
    "defender_config",
    updatePayload,
    user.id,
    "app_id",
  );

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

// 10b. PUT /apps/:id/abuseipdb - Set or clear the per-app AbuseIPDB key
defenderRouter.put("/apps/:id/abuseipdb", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const { apiKey } = await c.req.json().catch(() => ({}));
  const app = getTableRows("defender_apps", user.id).find((item: any) => item.id === id);
  if (!app) return c.json({ error: "App not found" }, 404);
  if (apiKey !== null && apiKey !== undefined && (typeof apiKey !== "string" || apiKey.trim().length < 10)) {
    return c.json({ error: "A valid AbuseIPDB API key is required" }, 400);
  }
  const key = typeof apiKey === "string" ? apiKey.trim() : null;
  const updated = updateTable(
    "defender_apps",
    [{ field: "id", operator: "eq", value: id }],
    { abuseipdb_api_key: key },
    user.id,
  );
  if (!key) {
    const configs = getTableRows("defender_config", user.id);
    const config = configs.find((item: any) => item.app_id === id);
    if (config?.auto_block_abuseipdb) {
      upsertTable(
        "defender_config",
        { ...config, auto_block_abuseipdb: false },
        user.id,
        "app_id",
      );
      broadcastConfigUpdate(id).catch(() => {});
    }
  }
  // A changed key must not inherit the previous provider's seven-day cache.
  deleteTable(
    "defender_ip_blocks",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id,
  );
  return c.json(publicDefenderApp(updated[0] || { ...app, abuseipdb_api_key: key }));
});

// 11. GET /apps/:id/routes - List routes for app
defenderRouter.get("/apps/:id/routes", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");

  const routes = getTableRows("defender_routes", user.id).filter(
    (r: any) => r.app_id === id,
  );
  routes.sort((a: any, b: any) => (a.path || "").localeCompare(b.path || ""));
  return c.json(routes);
});

// 12. PUT /routes/:routeId - Update route rate limit config
defenderRouter.put("/routes/:routeId", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const routeId = c.req.param("routeId");
  const body = await c.req.json().catch(() => ({}));

  const updateData: any = {};
  if (
    body.rateLimitEnabled !== undefined ||
    body.rate_limit_enabled !== undefined
  ) {
    updateData.rate_limit_enabled =
      body.rateLimitEnabled ?? body.rate_limit_enabled;
  }
  if (
    body.rateLimitRequests !== undefined ||
    body.rate_limit_requests !== undefined
  ) {
    updateData.rate_limit_requests =
      body.rateLimitRequests ?? body.rate_limit_requests;
  }
  if (
    body.rateLimitWindowSeconds !== undefined ||
    body.rate_limit_window_seconds !== undefined
  ) {
    updateData.rate_limit_window_seconds =
      body.rateLimitWindowSeconds ?? body.rate_limit_window_seconds;
  }

  const updated = updateTable(
    "defender_routes",
    [{ field: "id", operator: "eq", value: routeId }],
    updateData,
    user.id,
  );

  const updatedRoute = updated[0];
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

  let events = getTableRows("defender_events", user.id).filter(
    (e: any) => e.app_id === id,
  );

  if (eventType) {
    events = events.filter((e: any) => e.event_type === eventType);
  }
  if (blockedStr !== undefined && blockedStr !== "") {
    events = events.filter((e: any) => String(e.blocked) === blockedStr);
  }
  if (startDate) {
    events = events.filter(
      (e: any) => new Date(e.created_at) >= new Date(startDate),
    );
  }
  if (endDate) {
    events = events.filter(
      (e: any) => new Date(e.created_at) <= new Date(endDate),
    );
  }

  events.sort(
    (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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

  const outbound = getTableRows("defender_outbound", user.id).filter(
    (o: any) => o.app_id === id,
  );

  outbound.sort(
    (a: any, b: any) =>
      new Date(b.last_seen || 0).getTime() -
      new Date(a.last_seen || 0).getTime(),
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

  return c.json(updated[0] || {});
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

    updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: id }],
      {
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        api_key: rawKey,
      },
      user.id,
    );

    broadcastConfigUpdate(id).catch(() => {});

    return c.json({
      apiKey: rawKey,
      apiKeyPrefix,
    });
  },
);
