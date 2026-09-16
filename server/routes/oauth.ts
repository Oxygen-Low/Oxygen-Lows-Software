import { Hono } from "hono";
import type { Context, Next } from "hono";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getTableRows,
  insertTable,
  updateTable,
  deleteTable,
  getUserById,
  getProfileByUserId,
  type OAuthAppRecord,
  type OAuthCodeRecord,
  type OAuthGrantRecord,
  type OAuthTokenRecord,
} from "../lib/dataStore.ts";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const oauthRouter = new Hono<{
  Variables: { user: any; userId: string };
}>();

const authLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many OAuth requests. Please try again later.",
});

export const SUPPORTED_SCOPES = [
  "username",
  "display_name",
  "email",
  "profile_picture",
  "bio",
] as const;

export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  try {
    const computed = hashApiKey(rawKey);
    const hashBuf = Buffer.from(computed, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (hashBuf.length !== storedBuf.length) return false;
    return timingSafeEqual(hashBuf, storedBuf);
  } catch {
    return false;
  }
}

export function isValidRedirectUri(rawUri: string): boolean {
  try {
    const parsed = new URL(rawUri);
    // Hash fragments are forbidden in OAuth 2.0 redirect URIs
    if (parsed.hash) return false;

    // Allow localhost/127.0.0.1 over http
    const isLocal =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";

    if (isLocal) {
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    }

    // Production domains require https
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function publicOAuthApp(app: any) {
  const { api_key_hash: _hash, ...safeApp } = app;
  return safeApp;
}

export function buildScopedUser(user: any, profile: any, scopes: string[]) {
  const scoped: Record<string, any> = {
    id: String(user.id),
  };

  if (scopes.includes("username")) {
    scoped.username = user.username;
  }

  if (scopes.includes("display_name")) {
    scoped.display_name = profile?.display_name || user.username;
  }

  if (scopes.includes("email")) {
    scoped.email = user.email;
  }

  if (scopes.includes("profile_picture")) {
    scoped.profile_picture_url = profile?.avatar_url || null;
  }

  if (scopes.includes("bio")) {
    scoped.bio = profile?.bio || "";
  }

  return scoped;
}

// Middleware for user authentication
async function requireUserAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
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
  c.set("userId", String(user.id));
  await next();
}

// Optional user auth helper (doesn't fail if unauthenticated)
async function optionalUserAuth(c: Context) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) return null;
  return await resolveUserFromToken(token);
}

// ===========================================================================
// 1. Developer App Management Endpoints
// ===========================================================================

// GET /api/oauth/apps - List apps created by developer
oauthRouter.get("/apps", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const apps = getTableRows("oauth_apps", userId);
  return c.json(apps.map(publicOAuthApp));
});

// POST /api/oauth/apps - Create new OAuth application
oauthRouter.post("/apps", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const { name, description, redirect_uris, allowed_scopes, website_url } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "Application name is required" }, 400);
  }

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return c.json(
      { error: "At least one valid redirect URI is required" },
      400,
    );
  }

  for (const uri of redirect_uris) {
    if (typeof uri !== "string" || !isValidRedirectUri(uri.trim())) {
      return c.json(
        {
          error: `Invalid redirect URI: ${uri}. Production URIs must use HTTPS, while localhost permits HTTP.`,
        },
        400,
      );
    }
  }

  const cleanUris = redirect_uris.map((u: string) => u.trim());

  let scopes = ["username", "display_name"];
  if (Array.isArray(allowed_scopes) && allowed_scopes.length > 0) {
    const valid = allowed_scopes.filter((s: string) =>
      SUPPORTED_SCOPES.includes(s as any),
    );
    if (valid.length > 0) scopes = Array.from(new Set(valid));
  }

  const appId = randomUUID();
  const clientId = "ol_app_" + randomBytes(16).toString("hex");
  const rawApiKey = "ol_sec_" + randomBytes(32).toString("hex");
  const apiKeyHash = hashApiKey(rawApiKey);
  const apiKeyPrefix = rawApiKey.substring(0, 10) + "...";
  const now = new Date().toISOString();

  const newApp: OAuthAppRecord = {
    id: appId,
    user_id: userId,
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : "",
    client_id: clientId,
    api_key_hash: apiKeyHash,
    api_key_prefix: apiKeyPrefix,
    redirect_uris: cleanUris,
    allowed_scopes: scopes,
    website_url: typeof website_url === "string" ? website_url.trim() : "",
    created_at: now,
    updated_at: now,
  };

  insertTable("oauth_apps", newApp, userId);

  return c.json({
    app: publicOAuthApp(newApp),
    apiKey: rawApiKey,
  }, 201);
});

// PUT /api/oauth/apps/:id - Update application settings
oauthRouter.put("/apps/:id", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { name, description, redirect_uris, allowed_scopes, website_url } = body;

  const apps = getTableRows("oauth_apps", userId);
  const existingApp = apps.find((a: any) => a.id === appId);

  if (!existingApp) {
    return c.json({ error: "Application not found" }, 404);
  }

  const updates: Partial<OAuthAppRecord> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof name === "string" && name.trim()) {
    updates.name = name.trim();
  }

  if (description !== undefined) {
    updates.description = typeof description === "string" ? description.trim() : "";
  }

  if (website_url !== undefined) {
    updates.website_url = typeof website_url === "string" ? website_url.trim() : "";
  }

  if (Array.isArray(redirect_uris)) {
    if (redirect_uris.length === 0) {
      return c.json({ error: "At least one redirect URI is required" }, 400);
    }
    for (const uri of redirect_uris) {
      if (typeof uri !== "string" || !isValidRedirectUri(uri.trim())) {
        return c.json(
          {
            error: `Invalid redirect URI: ${uri}. Production URIs must use HTTPS, while localhost permits HTTP.`,
          },
          400,
        );
      }
    }
    updates.redirect_uris = redirect_uris.map((u: string) => u.trim());
  }

  if (Array.isArray(allowed_scopes)) {
    const valid = allowed_scopes.filter((s: string) =>
      SUPPORTED_SCOPES.includes(s as any),
    );
    if (valid.length > 0) {
      updates.allowed_scopes = Array.from(new Set(valid));
    }
  }

  const updatedRows = updateTable(
    "oauth_apps",
    [{ field: "id", operator: "eq", value: appId }],
    updates,
    userId,
  );

  return c.json(publicOAuthApp(updatedRows[0] || { ...existingApp, ...updates }));
});

// POST /api/oauth/apps/:id/regenerate-key - Regenerate secret API key
oauthRouter.post(
  "/apps/:id/regenerate-key",
  authLimiter,
  requireUserAuth,
  async (c) => {
    const userId = c.get("userId");
    const appId = c.req.param("id");

    const apps = getTableRows("oauth_apps", userId);
    const existingApp = apps.find((a: any) => a.id === appId);

    if (!existingApp) {
      return c.json({ error: "Application not found" }, 404);
    }

    const rawApiKey = "ol_sec_" + randomBytes(32).toString("hex");
    const apiKeyHash = hashApiKey(rawApiKey);
    const apiKeyPrefix = rawApiKey.substring(0, 10) + "...";

    updateTable(
      "oauth_apps",
      [{ field: "id", operator: "eq", value: appId }],
      {
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        updated_at: new Date().toISOString(),
      },
      userId,
    );

    return c.json({
      apiKey: rawApiKey,
      apiKeyPrefix,
    });
  },
);

// DELETE /api/oauth/apps/:id - Delete application
oauthRouter.delete("/apps/:id", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");

  const apps = getTableRows("oauth_apps", userId);
  const existingApp = apps.find((a: any) => a.id === appId);

  if (!existingApp) {
    return c.json({ error: "Application not found" }, 404);
  }

  deleteTable("oauth_apps", [{ field: "id", operator: "eq", value: appId }], userId);

  return c.json({ success: true });
});

// GET /api/oauth/apps/:id/stats - Authorization statistics for app
oauthRouter.get("/apps/:id/stats", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");

  const apps = getTableRows("oauth_apps", userId);
  const existingApp = apps.find((a: any) => a.id === appId);

  if (!existingApp) {
    return c.json({ error: "Application not found" }, 404);
  }

  const allGrants = getTableRows("oauth_grants");
  const appGrants = allGrants.filter(
    (g: any) => g.app_id === appId || g.client_id === existingApp.client_id,
  );

  const distinctUsers = new Set(appGrants.map((g: any) => String(g.user_id)));

  const allTokens = getTableRows("oauth_tokens");
  const activeTokens = allTokens.filter(
    (t: any) =>
      (t.app_id === appId || t.client_id === existingApp.client_id) &&
      !t.revoked &&
      t.expires_at > Date.now(),
  );

  return c.json({
    total_authorized_users: distinctUsers.size,
    active_tokens: activeTokens.length,
  });
});

// ===========================================================================
// 2. User Consent & Authorization Flow Endpoints
// ===========================================================================

// GET /api/oauth/authorize-details - Validates params for consent screen
oauthRouter.get("/authorize-details", authLimiter, async (c) => {
  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const requestedScopeRaw = c.req.query("scope");

  if (!clientId) {
    return c.json({ error: "Missing client_id parameter" }, 400);
  }

  if (!redirectUri) {
    return c.json({ error: "Missing redirect_uri parameter" }, 400);
  }

  const allApps = getTableRows("oauth_apps");
  const app = allApps.find(
    (a: any) => a.client_id === clientId || a.id === clientId,
  );

  if (!app) {
    return c.json({ error: "Invalid client_id" }, 400);
  }

  // Verify redirect URI is in app's allowed list
  const cleanRedirectUri = redirectUri.trim();
  const uriMatched = (app.redirect_uris || []).some(
    (allowed: string) => allowed.toLowerCase() === cleanRedirectUri.toLowerCase(),
  );

  if (!uriMatched) {
    return c.json(
      {
        error:
          "The redirect URI provided does not match any registered redirect URIs for this application.",
      },
      400,
    );
  }

  // Determine effective scopes
  const allowedScopes = app.allowed_scopes || ["username", "display_name"];
  let requestedScopes = allowedScopes;

  if (requestedScopeRaw && typeof requestedScopeRaw === "string") {
    const parsed = requestedScopeRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      requestedScopes = parsed.filter((s: string) =>
        allowedScopes.includes(s),
      );
    }
  }

  // Check if current user is logged in and if they've already consented
  const currentUser = await optionalUserAuth(c);
  let userConsented = false;

  if (currentUser) {
    const userGrants = getTableRows("oauth_grants", currentUser.id);
    const existingGrant = userGrants.find(
      (g: any) => g.app_id === app.id || g.client_id === app.client_id,
    );
    if (existingGrant) {
      const grantScopes: string[] = existingGrant.scopes || [];
      const hasAllScopes = requestedScopes.every((s: string) =>
        grantScopes.includes(s),
      );
      if (hasAllScopes) {
        userConsented = true;
      }
    }
  }

  // Get developer profile for display
  const devProfile = getProfileByUserId(app.user_id);
  const devUser = getUserById(app.user_id);

  return c.json({
    app: {
      id: app.id,
      client_id: app.client_id,
      name: app.name,
      description: app.description || "",
      website_url: app.website_url || "",
      developer_username: devUser?.username || devProfile?.username || "Developer",
    },
    requested_scopes: requestedScopes,
    user_consented: userConsented,
    logged_in: Boolean(currentUser),
    user: currentUser
      ? {
          id: String(currentUser.id),
          username: currentUser.username,
          email: currentUser.email,
        }
      : null,
  });
});

// POST /api/oauth/authorize - End-user submits consent (or auto-approves)
oauthRouter.post("/authorize", authLimiter, requireUserAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const { client_id, redirect_uri, scope, state, action } = body;

  if (!client_id || !redirect_uri) {
    return c.json({ error: "client_id and redirect_uri are required" }, 400);
  }

  const allApps = getTableRows("oauth_apps");
  const app = allApps.find(
    (a: any) => a.client_id === client_id || a.id === client_id,
  );

  if (!app) {
    return c.json({ error: "Invalid client_id" }, 400);
  }

  const cleanRedirectUri = redirect_uri.trim();
  const uriMatched = (app.redirect_uris || []).some(
    (allowed: string) => allowed.toLowerCase() === cleanRedirectUri.toLowerCase(),
  );

  if (!uriMatched) {
    return c.json({ error: "Redirect URI is not allowed" }, 400);
  }

  // Handle user denying consent
  if (action === "deny") {
    const url = new URL(cleanRedirectUri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set(
      "error_description",
      "The user denied authorization for this request",
    );
    if (state) url.searchParams.set("state", state);
    return c.json({ redirect_url: url.toString() });
  }

  // Determine granted scopes
  const allowedScopes = app.allowed_scopes || ["username", "display_name"];
  let grantedScopes = allowedScopes;
  if (scope && typeof scope === "string") {
    const parsed = scope
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      grantedScopes = parsed.filter((s: string) => allowedScopes.includes(s));
    }
  }

  const now = new Date().toISOString();

  // Remember / upsert grant for user
  const userGrants = getTableRows("oauth_grants", user.id);
  const existingGrant = userGrants.find(
    (g: any) => g.app_id === app.id || g.client_id === app.client_id,
  );

  if (existingGrant) {
    const mergedScopes = Array.from(
      new Set([...(existingGrant.scopes || []), ...grantedScopes]),
    );
    updateTable(
      "oauth_grants",
      [{ field: "id", operator: "eq", value: existingGrant.id }],
      { scopes: mergedScopes, updated_at: now },
      user.id,
    );
  } else {
    const newGrant: OAuthGrantRecord = {
      id: randomUUID(),
      app_id: app.id,
      client_id: app.client_id,
      user_id: String(user.id),
      scopes: grantedScopes,
      created_at: now,
      updated_at: now,
    };
    insertTable("oauth_grants", newGrant, user.id);
  }

  // Generate short-lived authorization code (5 minutes expiry)
  const code = "ol_code_" + randomBytes(32).toString("hex");
  const codeRecord: OAuthCodeRecord = {
    code,
    app_id: app.id,
    client_id: app.client_id,
    user_id: String(user.id),
    redirect_uri: cleanRedirectUri,
    scopes: grantedScopes,
    state: typeof state === "string" ? state : undefined,
    expires_at: Date.now() + 5 * 60 * 1000,
    used: false,
    created_at: now,
  };

  insertTable("oauth_codes", codeRecord, user.id);

  // Build redirect URL
  const url = new URL(cleanRedirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return c.json({ redirect_url: url.toString() });
});

// ===========================================================================
// 3. User Grant Management (In Account Settings)
// ===========================================================================

// GET /api/oauth/user/grants - List applications authorized by the current user
oauthRouter.get("/user/grants", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const grants = getTableRows("oauth_grants", userId);
  const allApps = getTableRows("oauth_apps");

  const result = grants.map((g: any) => {
    const app = allApps.find(
      (a: any) => a.id === g.app_id || a.client_id === g.client_id,
    );
    return {
      id: g.id,
      app_id: g.app_id,
      client_id: g.client_id,
      app_name: app?.name || "Unknown Application",
      description: app?.description || "",
      website_url: app?.website_url || "",
      scopes: g.scopes || [],
      created_at: g.created_at,
    };
  });

  return c.json(result);
});

// DELETE /api/oauth/user/grants/:id - Revoke user authorization for an app
oauthRouter.delete(
  "/user/grants/:id",
  authLimiter,
  requireUserAuth,
  async (c) => {
    const userId = c.get("userId");
    const grantId = c.req.param("id");

    const grants = getTableRows("oauth_grants", userId);
    const targetGrant = grants.find((g: any) => g.id === grantId);

    if (!targetGrant) {
      return c.json({ error: "Grant not found" }, 404);
    }

    deleteTable(
      "oauth_grants",
      [{ field: "id", operator: "eq", value: grantId }],
      userId,
    );

    // Also revoke any active tokens for this user and app
    const tokens = getTableRows("oauth_tokens", userId);
    for (const t of tokens) {
      if (
        t.app_id === targetGrant.app_id ||
        t.client_id === targetGrant.client_id
      ) {
        updateTable(
          "oauth_tokens",
          [{ field: "token", operator: "eq", value: t.token }],
          { revoked: true },
          userId,
        );
      }
    }

    return c.json({ success: true });
  },
);

// ===========================================================================
// 4. Developer API / SDK Endpoints
// ===========================================================================

// POST /api/oauth/token - Exchange authorization code for token + user profile
oauthRouter.post("/token", authLimiter, async (c) => {
  let body: Record<string, any> = {};

  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await c.req.json().catch(() => ({}));
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    body = await c.req.parseBody().catch(() => ({}));
  } else {
    // Attempt json fallback
    body = await c.req.json().catch(async () => {
      return await c.req.parseBody().catch(() => ({}));
    });
  }

  // Extract client credentials from body or Authorization header (Basic / Bearer)
  let clientId = body.client_id;
  let clientSecret = body.client_secret || body.api_key;
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const grantType = body.grant_type;

  const authHeader = c.req.header("Authorization");
  if (authHeader) {
    if (authHeader.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), "base64").toString(
          "utf-8",
        );
        const [u, p] = decoded.split(":");
        if (!clientId) clientId = u;
        if (!clientSecret) clientSecret = p;
      } catch {}
    } else if (authHeader.toLowerCase().startsWith("bearer ") && !clientSecret) {
      clientSecret = authHeader.slice(7);
    }
  }

  if (grantType !== "authorization_code") {
    return c.json(
      {
        error: "unsupported_grant_type",
        error_description: "Grant type must be authorization_code",
      },
      400,
    );
  }

  if (!clientId || !clientSecret) {
    return c.json(
      {
        error: "invalid_client",
        error_description: "Client credentials (client_id and client_secret) are required",
      },
      401,
    );
  }

  if (!code) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Authorization code is required",
      },
      400,
    );
  }

  // Validate client app
  const allApps = getTableRows("oauth_apps");
  const app = allApps.find(
    (a: any) => a.client_id === clientId || a.id === clientId,
  );

  if (!app) {
    return c.json(
      { error: "invalid_client", error_description: "Unknown client" },
      401,
    );
  }

  if (!verifyApiKey(clientSecret, app.api_key_hash)) {
    return c.json(
      { error: "invalid_client", error_description: "Invalid client_secret / API key" },
      401,
    );
  }

  // Look up code across users
  const allCodes = getTableRows("oauth_codes");
  const codeRecord = allCodes.find((rec: any) => rec.code === code);

  if (!codeRecord) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Invalid authorization code",
      },
      400,
    );
  }

  if (codeRecord.used) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code has already been used",
      },
      400,
    );
  }

  if (codeRecord.expires_at < Date.now()) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code has expired",
      },
      400,
    );
  }

  if (
    codeRecord.app_id !== app.id &&
    codeRecord.client_id !== app.client_id
  ) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Code was not issued to this client",
      },
      400,
    );
  }

  if (
    redirectUri &&
    codeRecord.redirect_uri.toLowerCase() !== redirectUri.trim().toLowerCase()
  ) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Redirect URI does not match authorization request",
      },
      400,
    );
  }

  // Mark code as used
  updateTable(
    "oauth_codes",
    [{ field: "code", operator: "eq", value: code }],
    { used: true },
    codeRecord.user_id,
  );

  // Fetch target user & profile
  const user = getUserById(codeRecord.user_id);
  if (!user) {
    return c.json(
      { error: "server_error", error_description: "User account not found" },
      500,
    );
  }

  const profile = getProfileByUserId(codeRecord.user_id);

  // Generate access token (30 days)
  const token = "ol_at_" + randomBytes(32).toString("hex");
  const expiresIn = 30 * 24 * 60 * 60; // 30 days in seconds
  const now = new Date().toISOString();

  const tokenRecord: OAuthTokenRecord = {
    token,
    app_id: app.id,
    client_id: app.client_id,
    user_id: String(user.id),
    scopes: codeRecord.scopes || [],
    expires_at: Date.now() + expiresIn * 1000,
    revoked: false,
    created_at: now,
  };

  insertTable("oauth_tokens", tokenRecord, user.id);

  const scopedUser = buildScopedUser(user, profile, codeRecord.scopes || []);

  return c.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: (codeRecord.scopes || []).join(" "),
    user: scopedUser,
  });
});

// GET /api/oauth/userinfo - Fetch user profile with bearer token
oauthRouter.get("/userinfo", authLimiter, async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return c.json(
      { error: "invalid_token", error_description: "Missing access token" },
      401,
    );
  }

  const allTokens = getTableRows("oauth_tokens");
  const tokenRecord = allTokens.find((t: any) => t.token === token);

  if (!tokenRecord) {
    return c.json(
      { error: "invalid_token", error_description: "Unknown access token" },
      401,
    );
  }

  if (tokenRecord.revoked) {
    return c.json(
      { error: "invalid_token", error_description: "Token has been revoked" },
      401,
    );
  }

  if (tokenRecord.expires_at < Date.now()) {
    return c.json(
      { error: "invalid_token", error_description: "Token has expired" },
      401,
    );
  }

  const user = getUserById(tokenRecord.user_id);
  if (!user) {
    return c.json(
      { error: "server_error", error_description: "User not found" },
      404,
    );
  }

  const profile = getProfileByUserId(tokenRecord.user_id);
  const scopedUser = buildScopedUser(user, profile, tokenRecord.scopes || []);

  return c.json(scopedUser);
});

// POST /api/oauth/revoke - Revoke an access token
oauthRouter.post("/revoke", authLimiter, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  let token = body.token || body.access_token;

  if (!token) {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return c.json({ error: "Missing token parameter" }, 400);
  }

  const allTokens = getTableRows("oauth_tokens");
  const tokenRecord = allTokens.find((t: any) => t.token === token);

  if (tokenRecord) {
    updateTable(
      "oauth_tokens",
      [{ field: "token", operator: "eq", value: token }],
      { revoked: true },
      tokenRecord.user_id,
    );
  }

  return c.json({ success: true });
});
