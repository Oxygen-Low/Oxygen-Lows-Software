import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getTableRows,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
} from "../lib/dataStore.ts";
import type { Context, Next } from "hono";
import { scanSite } from "../lib/simplecookiesScanner.ts";
import {
  DEFAULT_BANNER_CONFIG,
  type CookieDeclarationEntry,
} from "../../packages/simplecookies/src/types.ts";

export const simplecookiesRouter = new Hono<{
  Variables: { project: any; user: any; userId: string };
}>();

// ---------------------------------------------------------------------------
// Helpers (mirrors webdefender.ts patterns)
// ---------------------------------------------------------------------------

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function hashForStorage(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function publicProject(project: any) {
  const { api_key: _apiKey, api_key_hash: _apiKeyHash, ...safe } = project;
  return safe;
}

function findProjectByApiKey(rawKey: string) {
  const hash = hashApiKey(rawKey);
  const all = getTableRows("simplecookies_projects");
  return (
    all.find((a: any) => {
      if (!a.api_key_hash) return false;
      const actual = createHash("sha256").update(hash).digest();
      const expected = createHash("sha256").update(a.api_key_hash).digest();
      try {
        return timingSafeEqual(actual, expected);
      } catch {
        return false;
      }
    }) || null
  );
}

function loadConfig(projectId: string, userId: string): any {
  const rows = getTableRows("simplecookies_config", userId);
  return rows.find((c: any) => c.project_id === projectId) || null;
}

function loadDeclaration(projectId: string, userId: string): CookieDeclarationEntry[] {
  const rows = getTableRows("simplecookies_declaration", userId);
  const row = rows.find((c: any) => c.project_id === projectId);
  if (!row) return [];
  return Array.isArray(row.cookies) ? row.cookies : [];
}

function packagePayload(project: any, config: any, declaration: any[]) {
  const mergedConfig = { ...DEFAULT_BANNER_CONFIG, ...(config || {}) };
  const showPoweredBy =
    typeof config?.show_powered_by === "boolean"
      ? config.show_powered_by
      : typeof config?.showPoweredBy === "boolean"
        ? config.showPoweredBy
        : DEFAULT_BANNER_CONFIG.showPoweredBy;
  mergedConfig.showPoweredBy = showPoweredBy;
  mergedConfig.show_powered_by = showPoweredBy;
  return {
    id: project.id,
    name: project.name,
    domain: project.domain ?? null,
    firstRequestAt: project.first_request_at ?? null,
    config: mergedConfig,
    declaration,
  };
}

// SSE listeners (mirrors defender config-stream)
type ConfigListener = (data: any) => void;
const configListeners = new Map<string, Set<ConfigListener>>();

export function addSimpleCookiesConfigListener(projectId: string, listener: ConfigListener) {
  let set = configListeners.get(projectId);
  if (!set) {
    set = new Set();
    configListeners.set(projectId, set);
  }
  set.add(listener);
}

export function removeSimpleCookiesConfigListener(projectId: string, listener: ConfigListener) {
  const set = configListeners.get(projectId);
  if (set) {
    set.delete(listener);
    if (set.size === 0) configListeners.delete(projectId);
  }
}

export async function broadcastSimpleCookiesConfigUpdate(projectId: string) {
  const listeners = configListeners.get(projectId);
  if (!listeners?.size) return;
  const project = getTableRows("simplecookies_projects").find((p: any) => p.id === projectId);
  if (!project) return;
  const payload = packagePayload(
    project,
    loadConfig(projectId, project.user_id),
    loadDeclaration(projectId, project.user_id),
  );
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch {
      // stream closed
    }
  }
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

async function requireApiKey(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const rawKey = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
  if (!rawKey) return c.json({ error: "Missing or invalid Authorization header" }, 401);

  const project = findProjectByApiKey(rawKey);
  if (!project) return c.json({ error: "Invalid API key" }, 401);

  c.set("project", project);
  await next();
}

async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) return c.json({ error: "Missing or invalid Authorization header" }, 401);
  const user = await resolveUserFromToken(token);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  c.set("userId", user.id);
  await next();
}

// ---------------------------------------------------------------------------
// Rate limiters (abuse-only; no product quotas — unlimited by design)
// ---------------------------------------------------------------------------

const packageLimiter = rateLimiter(300, 60_000, "sc_pkg");
const consentLimiter = rateLimiter(600, 60_000, "sc_consent");
const uiLimiter = rateLimiter(60, 60_000, "sc_ui");
const scanLimiter = rateLimiter(5, 60_000, "sc_scan");

// ---------------------------------------------------------------------------
// NPM package endpoints
// ---------------------------------------------------------------------------

simplecookiesRouter.post("/verify", packageLimiter, requireApiKey, async (c) => {
  const project = c.get("project");

  if (!project.first_request_at) {
    const now = new Date().toISOString();
    updateTable(
      "simplecookies_projects",
      [{ field: "id", operator: "eq", value: project.id }],
      { first_request_at: now },
      project.user_id,
    );
    project.first_request_at = now;
  }

  const config = loadConfig(project.id, project.user_id);
  const declaration = loadDeclaration(project.id, project.user_id);
  return c.json(packagePayload(project, config, declaration));
});

simplecookiesRouter.get("/config-stream", requireApiKey, async (c) => {
  const project = c.get("project");
  return streamSSE(c, async (stream) => {
    const current = getTableRows("simplecookies_projects").find(
      (p: any) => p.id === project.id,
    ) || project;
    await stream.writeSSE({
      event: "config",
      data: JSON.stringify(
        packagePayload(
          current,
          loadConfig(current.id, current.user_id),
          loadDeclaration(current.id, current.user_id),
        ),
      ),
    });

    const listener = async (payload: any) => {
      try {
        await stream.writeSSE({ event: "config", data: JSON.stringify(payload) });
      } catch {
        // stream closed
      }
    };
    addSimpleCookiesConfigListener(project.id, listener);
    stream.onAbort(() => removeSimpleCookiesConfigListener(project.id, listener));

    while (!stream.aborted) {
      await stream.sleep(30_000);
      try {
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch {
        break;
      }
    }
    removeSimpleCookiesConfigListener(project.id, listener);
  });
});

const ALLOWED_CATEGORIES = new Set(["necessary", "preferences", "statistics", "marketing", "custom"]);

function sanitizeDeclaration(cookies: unknown): CookieDeclarationEntry[] {
  if (!Array.isArray(cookies)) return [];
  const out: CookieDeclarationEntry[] = [];
  for (const item of cookies.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = String(r.name ?? "").trim().slice(0, 120);
    if (!name) continue;
    const category = String(r.category ?? "necessary");
    out.push({
      name,
      provider: String(r.provider ?? "First-party").trim().slice(0, 120) || "First-party",
      purpose: String(r.purpose ?? "").trim().slice(0, 500),
      expiry: String(r.expiry ?? "Session").trim().slice(0, 80) || "Session",
      category: (ALLOWED_CATEGORIES.has(category) ? category : "necessary") as CookieDeclarationEntry["category"],
    });
  }
  return out;
}

simplecookiesRouter.post("/consent", consentLimiter, requireApiKey, async (c) => {
  const project = c.get("project");
  const body = (await c.req.json().catch(() => ({}))) as any;
  const rawItems: any[] = Array.isArray(body) ? body : [body];
  const items = rawItems.filter((i) => i && typeof i === "object").slice(0, 50);
  if (items.length === 0) return c.json({ logged: 0 }, 201);

  const now = new Date().toISOString();
  const existing = getTableRows("simplecookies_consents", project.user_id);
  const created: any[] = [];

  for (const item of items) {
    const consentId = String(item.consentId ?? item.consent_id ?? randomUUID()).slice(0, 128);
    const sel = item.selection && typeof item.selection === "object" ? item.selection : {};
    const record = {
      id: randomUUID(),
      project_id: project.id,
      user_id: project.user_id,
      consent_id: consentId,
      necessary: true,
      preferences: Boolean(sel.preferences),
      statistics: Boolean(sel.statistics),
      marketing: Boolean(sel.marketing),
      custom: Boolean(sel.custom),
      policy_version: Math.max(1, parseInt(String(item.policyVersion ?? item.policy_version ?? 1)) || 1),
      language: String(item.language ?? "en").slice(0, 16),
      user_agent_hash: hashForStorage(c.req.header("user-agent") || ""),
      country_code:
        typeof item.countryCode === "string" && /^[A-Z]{2}$/i.test(item.countryCode)
          ? item.countryCode.toUpperCase()
          : null,
      created_at: now,
    };
    created.push(record);
    existing.unshift(record);
  }

  // Keep at most 2000 consents per project (app-level, not product quota).
  const projectConsents = existing.filter((e: any) => e.project_id === project.id).slice(0, 2000);
  const others = existing.filter((e: any) => e.project_id !== project.id);
  const { saveTableRows } = await import("../lib/dataStore.ts");
  saveTableRows("simplecookies_consents", project.user_id, [...projectConsents, ...others]);

  return c.json({ logged: created.length }, 201);
});

// Public declaration page (no secrets, no API keys).
simplecookiesRouter.get("/declaration/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const project = getTableRows("simplecookies_projects").find((p: any) => p.id === projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);
  const config = loadConfig(projectId, project.user_id);
  return c.json({
    name: project.name,
    domain: project.domain ?? null,
    policy_version: config?.policy_version ?? 1,
    banner_title: config?.title ?? DEFAULT_BANNER_CONFIG.title,
    banner_text: config?.text ?? DEFAULT_BANNER_CONFIG.text,
    declaration: loadDeclaration(projectId, project.user_id),
    updated_at: project.updated_at ?? project.created_at ?? null,
  });
});

// ---------------------------------------------------------------------------
// UI endpoints (dashboard)
// ---------------------------------------------------------------------------

simplecookiesRouter.get("/projects", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const projects = getTableRows("simplecookies_projects", user.id);
  projects.sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return c.json(projects.map(publicProject));
});

simplecookiesRouter.post("/projects", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const body = (await c.req.json().catch(() => ({}))) as any;
  const name = String(body.name ?? "").trim().slice(0, 120);
  const domain = String(body.domain ?? "").trim().slice(0, 255) || null;
  if (!name) return c.json({ error: "Name is required" }, 400);

  const rawKey = "sk_" + randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const projectId = randomUUID();

  const project = {
    id: projectId,
    user_id: user.id,
    name,
    domain,
    api_key_hash: hashApiKey(rawKey),
    api_key_prefix: rawKey.substring(0, 8),
    api_key: rawKey,
    first_request_at: null,
    created_at: now,
    updated_at: now,
  };
  insertTable("simplecookies_projects", project, user.id);

  insertTable(
    "simplecookies_config",
    {
      id: randomUUID(),
      project_id: projectId,
      user_id: user.id,
      ...DEFAULT_BANNER_CONFIG,
      show_powered_by: DEFAULT_BANNER_CONFIG.showPoweredBy,
      created_at: now,
      updated_at: now,
    },
    user.id,
  );

  insertTable(
    "simplecookies_declaration",
    { id: randomUUID(), project_id: projectId, user_id: user.id, cookies: [], created_at: now, updated_at: now },
    user.id,
  );

  return c.json({ ...publicProject(project), apiKey: rawKey }, 201);
});

simplecookiesRouter.get("/projects/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);
  const config = loadConfig(id, user.id);
  const mergedConfig = { ...DEFAULT_BANNER_CONFIG, ...(config || {}) };
  const showPoweredBy =
    typeof config?.show_powered_by === "boolean"
      ? config.show_powered_by
      : typeof config?.showPoweredBy === "boolean"
        ? config.showPoweredBy
        : DEFAULT_BANNER_CONFIG.showPoweredBy;
  mergedConfig.showPoweredBy = showPoweredBy;
  mergedConfig.show_powered_by = showPoweredBy;
  return c.json({
    ...publicProject(project),
    config: mergedConfig,
    declaration: loadDeclaration(id, user.id),
  });
});

simplecookiesRouter.delete("/projects/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  // Ownership check before deleting anything (IDOR-safe).
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);

  deleteTable("simplecookies_projects", [{ field: "id", operator: "eq", value: id }], user.id);
  deleteTable("simplecookies_config", [{ field: "project_id", operator: "eq", value: id }], user.id);
  deleteTable("simplecookies_declaration", [{ field: "project_id", operator: "eq", value: id }], user.id);
  deleteTable("simplecookies_consents", [{ field: "project_id", operator: "eq", value: id }], user.id);
  return c.body(null, 204);
});

const CONFIG_ALLOWED_KEYS = [
  "title",
  "text",
  "accept_label",
  "reject_label",
  "customize_label",
  "save_label",
  "show_customize",
  "position",
  "accent",
  "background",
  "text_color",
  "dark_mode",
  "language",
  "policy_version",
  "retention_days",
  "consent_mode",
  "respect_dnt",
  "show_powered_by",
  "showPoweredBy",
  "categories",
] as const;

simplecookiesRouter.put("/projects/:id/config", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as any;
  const updatePayload: Record<string, any> = {
    project_id: id,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  for (const key of CONFIG_ALLOWED_KEYS) {
    if (!(key in body)) continue;
    const value = (body as any)[key];
    if (key === "policy_version") {
      updatePayload[key] = Math.min(100000, Math.max(1, parseInt(String(value)) || 1));
    } else if (key === "retention_days") {
      updatePayload[key] = Math.min(3650, Math.max(1, parseInt(String(value)) || 365));
    } else if (key === "position") {
      const pos = String(value || "bottom");
      updatePayload[key] = ["bottom", "top", "left", "right", "center"].includes(pos) ? pos : "bottom";
    } else if (["show_customize", "dark_mode", "consent_mode", "respect_dnt", "show_powered_by", "showPoweredBy"].includes(key)) {
      updatePayload[key] = Boolean(value);
      if (key === "show_powered_by") {
        updatePayload.showPoweredBy = Boolean(value);
      } else if (key === "showPoweredBy") {
        updatePayload.show_powered_by = Boolean(value);
      }
    } else if (key === "categories") {
      // Only merge tenant-provided category configs; keep labels/descriptions bounded.
      if (value && typeof value === "object") {
        const merged: Record<string, any> = {};
        for (const cat of ["necessary", "preferences", "statistics", "marketing", "custom"]) {
          const incoming = (value as any)[cat];
          merged[cat] = {
            label: String(incoming?.label ?? DEFAULT_BANNER_CONFIG.categories[cat as keyof typeof DEFAULT_BANNER_CONFIG.categories].label).slice(0, 80),
            description: String(incoming?.description ?? DEFAULT_BANNER_CONFIG.categories[cat as keyof typeof DEFAULT_BANNER_CONFIG.categories].description).slice(0, 500),
            enabled: Boolean(incoming?.enabled ?? DEFAULT_BANNER_CONFIG.categories[cat as keyof typeof DEFAULT_BANNER_CONFIG.categories].enabled),
          };
        }
        merged.necessary = { ...merged.necessary, enabled: true };
        updatePayload[key] = merged;
      }
    } else if (["accent", "background", "text_color"].includes(key)) {
      const color = String(value ?? "").trim().slice(0, 32);
      updatePayload[key] = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : DEFAULT_BANNER_CONFIG[key as "accent" | "background" | "textColor" as keyof typeof DEFAULT_BANNER_CONFIG] as any;
    } else {
      updatePayload[key] = String(value ?? "").trim().slice(0, 2000);
    }
  }

  const result = upsertTable("simplecookies_config", updatePayload, user.id, "project_id");
  updateTable(
    "simplecookies_projects",
    [{ field: "id", operator: "eq", value: id }],
    { updated_at: new Date().toISOString() },
    user.id,
  );
  broadcastSimpleCookiesConfigUpdate(id).catch(() => {});
  return c.json(result[0] || updatePayload);
});

simplecookiesRouter.put("/projects/:id/declaration", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as any;
  const cookies = sanitizeDeclaration(body.cookies ?? body.declaration ?? []);
  const result = upsertTable(
    "simplecookies_declaration",
    {
      project_id: id,
      user_id: user.id,
      cookies,
      updated_at: new Date().toISOString(),
    },
    user.id,
    "project_id",
  );
  broadcastSimpleCookiesConfigUpdate(id).catch(() => {});
  return c.json(result[0] || { project_id: id, cookies });
});

simplecookiesRouter.post("/projects/:id/scan", scanLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as any;
  const url = String(body.url ?? project.domain ?? "").trim();
  if (!url) return c.json({ error: "URL is required" }, 400);

  try {
    const result = await scanSite(url);
    return c.json(result);
  } catch {
    // Generic message — no internal/upstream detail to clients.
    return c.json({ error: "Scan failed. Check the URL is public and returns HTML." }, 400);
  }
});

simplecookiesRouter.get("/projects/:id/consents", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);

  const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "100") || 100));

  let consents = getTableRows("simplecookies_consents", user.id).filter(
    (e: any) => e.project_id === id,
  );
  consents.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = consents.length;
  const from = (page - 1) * limit;
  return c.json({ consents: consents.slice(from, from + limit), total, page, limit });
});

simplecookiesRouter.get("/projects/:id/stats", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);

  const consents = getTableRows("simplecookies_consents", user.id).filter(
    (e: any) => e.project_id === id,
  );
  const total = consents.length;
  const count = (fn: (e: any) => boolean) => consents.filter(fn).length;
  const fullyGranted = count((e) => e.preferences && e.statistics && e.marketing && e.custom);
  const acceptanceRate = total ? Math.round((fullyGranted / total) * 1000) / 10 : 0;

  return c.json({
    total,
    fully_granted: fullyGranted,
    acceptance_rate: acceptanceRate,
    per_category: {
      preferences: count((e) => e.preferences),
      statistics: count((e) => e.statistics),
      marketing: count((e) => e.marketing),
      custom: count((e) => e.custom),
    },
  });
});

simplecookiesRouter.post("/projects/:id/rotate-key", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user" as any);
  const id = c.req.param("id");
  const project = getTableRows("simplecookies_projects", user.id).find(
    (p: any) => p.id === id,
  );
  if (!project) return c.json({ error: "Project not found" }, 404);

  const rawKey = "sk_" + randomBytes(16).toString("hex");
  updateTable(
    "simplecookies_projects",
    [{ field: "id", operator: "eq", value: id }],
    {
      api_key_hash: hashApiKey(rawKey),
      api_key_prefix: rawKey.substring(0, 8),
      api_key: rawKey,
      updated_at: new Date().toISOString(),
    },
    user.id,
  );
  return c.json({ apiKey: rawKey, apiKeyPrefix: rawKey.substring(0, 8) });
});
