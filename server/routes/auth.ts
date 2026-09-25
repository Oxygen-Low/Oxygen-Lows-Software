import { Hono } from "hono";
import {
  getNextUserId,
  initUserFolder,
  getUserById,
  getUserByUsernameOrEmail,
  getProfileByUserId,
  updateUserAuthVerifier,
  getUserByOAuthProvider,
  linkUserOAuth,
  unlinkUserOAuth,
  getUserOAuthStatus,
} from "../lib/dataStore.ts";
import {
  generateSalt,
  hashAuthVerifier,
  verifyAuthToken,
  generateToken,
  resolveUserFromToken,
  localAuthMiddleware,
  generateOAuthState,
  verifyOAuthState,
} from "../lib/auth.ts";
import {
  createQuickSignInSession,
  getQuickSignInById,
  getQuickSignInByCode,
  approveQuickSignInSession,
  rejectQuickSignInSession,
} from "../lib/quickSignIn.ts";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {
  getRpId,
  getExpectedOrigin,
  RP_NAME,
  saveChallenge,
  consumeChallenge,
  getUserPasskeys,
  saveUserPasskey,
  renameUserPasskey,
  deleteUserPasskey,
  updatePasskeyCounter,
  findUserByPasskeyId,
  type StoredPasskey,
} from "../lib/passkeys.ts";

export const authRouter = new Hono();

/**
 * Allowed OAuth error query parameters according to RFC 6749 and common provider specs.
 */
export const ALLOWED_OAUTH_ERRORS = [
  "access_denied",
  "invalid_request",
  "unauthorized_client",
  "unsupported_response_type",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
  "application_suspended",
  "redirect_uri_mismatch",
  "interaction_required",
  "login_required",
  "account_selection_required",
  "consent_required",
];

/**
 * Sanitizes OAuth error parameters by verifying against an allowlist to prevent open redirect and parameter injection.
 */
export function sanitizeOAuthError(error: unknown): string {
  if (typeof error === "string" && ALLOWED_OAUTH_ERRORS.includes(error)) {
    return error;
  }
  return "oauth_failed";
}

/**
 * Allowed application route prefixes for safe post-auth redirection.
 */
export const ALLOWED_RETURN_PREFIXES = [
  "/apps",
  "/characters",
  "/security",
  "/passwords",
  "/games",
  "/friends",
  "/chat",
  "/account",
  "/storage",
  "/customize",
  "/support",
  "/privacy",
  "/terms",
  "/download",
  "/admin",
  "/users",
];

/**
 * Validates and sanitizes a returnTo path to prevent open redirect vulnerabilities.
 * Ensures the destination is a safe, relative internal path matching allowed application routes.
 */
export function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value) {
    return "/apps";
  }
  const trimmed = value.trim();
  // Disallow non-relative paths, protocol-relative paths, backslashes, UNC paths, and schemes
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\") ||
    trimmed.includes(":")
  ) {
    return "/apps";
  }
  const segment = "/" + trimmed.slice(1).split(/[/?#]/)[0];
  if (ALLOWED_RETURN_PREFIXES.includes(segment)) {
    return trimmed;
  }
  return "/apps";
}

export const ALLOWED_REDIRECT_BASES = [
  "oxygenlows://auth",
  "/auth",
  "oxygenlows://security",
  "/security",
];

export function getSafeRedirectBase(
  base: string,
  fallback: "/auth" | "/security" = "/auth",
): string {
  return ALLOWED_REDIRECT_BASES.includes(base) ? base : fallback;
}

/**
 * Register a new local account using client-derived zero-knowledge auth token
 */
authRouter.post("/register", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { username, email, authToken, password } = body;

    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length < 3
    ) {
      return c.json(
        { error: "Username must be at least 3 characters long" },
        400,
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return c.json({ error: "A valid email address is required" }, 400);
    }

    const tokenInput = authToken || password;
    if (
      !tokenInput ||
      typeof tokenInput !== "string" ||
      tokenInput.length < 6
    ) {
      return c.json(
        { error: "Password must be at least 6 characters long" },
        400,
      );
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Disallow impersonation of admin by adding a hyphen
    if (cleanUsername.toLowerCase() === "oxygen-low") {
      return c.json({ error: "Username is already taken" }, 400);
    }

    // Check for existing username or email
    const existing =
      getUserByUsernameOrEmail(cleanUsername) ||
      getUserByUsernameOrEmail(cleanEmail);
    if (existing) {
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return c.json({ error: "Username is already taken" }, 400);
      }
      return c.json({ error: "Email is already registered" }, 400);
    }

    const userId = getNextUserId();
    const authSalt = generateSalt();
    const authVerifier = hashAuthVerifier(tokenInput, authSalt);
    const role = String(userId) === "1" ? "admin" : "user";

    const user = initUserFolder(userId, {
      username: cleanUsername,
      email: cleanEmail,
      authVerifier,
      authSalt,
      role,
    });

    const token = generateToken(user);
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        created_at: user.created_at,
        user_metadata: {
          username: user.username,
          full_name: user.username,
          role: user.role,
        },
      },
    };

    return c.json({
      user: session.user,
      token,
      session,
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Registration failed" }, 500);
  }
});

/**
 * Sign in to a local account
 */
authRouter.post("/login", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { login, authToken, password } = body;

    if (!login) {
      return c.json({ error: "Username or email is required" }, 400);
    }

    const user = getUserByUsernameOrEmail(login);
    if (!user) {
      return c.json({ error: "Invalid username or password" }, 400);
    }

    // Check if account has wiped credentials and needs migration
    if (!user.auth_verifier) {
      return c.json({
        needsMigration: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
      });
    }

    const tokenInput = authToken || password;
    if (!tokenInput) {
      return c.json({ error: "Username/email and password are required" }, 400);
    }

    const valid = verifyAuthToken(tokenInput, user.auth_verifier, user.auth_salt);
    if (!valid) {
      return c.json({ error: "Invalid username or password" }, 400);
    }

    const token = generateToken(user);
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: String(user.id) === "1" ? "admin" : user.role || "user",
        created_at: user.created_at,
        user_metadata: {
          username: user.username,
          full_name: user.username,
          role: String(user.id) === "1" ? "admin" : user.role || "user",
        },
      },
    };

    return c.json({
      user: session.user,
      token,
      session,
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Login failed" }, 500);
  }
});

/**
 * Migrate account credentials: sets new zero-knowledge auth verifier
 */
authRouter.post("/migrate-account", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { login, authToken, password } = body;
    const tokenInput = authToken || password;

    if (!login || !tokenInput) {
      return c.json(
        { error: "Username/email and new password are required" },
        400,
      );
    }

    const user = getUserByUsernameOrEmail(login);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const authSalt = generateSalt();
    const authVerifier = hashAuthVerifier(tokenInput, authSalt);
    const updated = updateUserAuthVerifier(user.id, authVerifier, authSalt);
    if (!updated) {
      return c.json({ error: "Failed to update user credentials" }, 500);
    }

    const token = generateToken({
      id: String(updated.id),
      username: String(updated.username),
      email: String(updated.email),
      role: updated.role,
    });
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        role: String(updated.id) === "1" ? "admin" : updated.role || "user",
        user_metadata: {
          username: updated.username,
          full_name: updated.username,
          role: String(updated.id) === "1" ? "admin" : updated.role || "user",
        },
      },
    };

    return c.json({
      user: session.user,
      token,
      session,
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Migration failed" }, 500);
  }
});

/**
 * Change password for authenticated users
 */
authRouter.post("/change-password", localAuthMiddleware, async (c: any) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { currentAuthToken, newAuthToken } = body;

    if (!currentAuthToken || !newAuthToken) {
      return c.json(
        { error: "Current and new passwords are required" },
        400,
      );
    }

    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    if (dbUser.auth_verifier) {
      const valid = verifyAuthToken(
        currentAuthToken,
        dbUser.auth_verifier,
        dbUser.auth_salt,
      );
      if (!valid) {
        return c.json({ error: "Current password is incorrect" }, 400);
      }
    }

    const authSalt = generateSalt();
    const authVerifier = hashAuthVerifier(newAuthToken, authSalt);
    updateUserAuthVerifier(user.id, authVerifier, authSalt);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to change password" }, 500);
  }
});

/**
 * Get current session details
 */
authRouter.get("/session", async (c) => {
  try {
    let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
    if (!token) {
      token = c.req.query("token");
    }

    if (!token) {
      return c.json({ session: null, user: null });
    }

    const user = await resolveUserFromToken(token);
    if (!user) {
      return c.json({ session: null, user: null });
    }

    const profile = getProfileByUserId(user.id);
    const oauth = getUserOAuthStatus(user.id);

    return c.json({
      session: {
        access_token: token,
        token_type: "bearer",
        user,
      },
      user: {
        ...user,
        profile,
        oauth,
      },
    });
  } catch (err: any) {
    return c.json({ session: null, user: null, error: err.message });
  }
});

/**
 * Logout
 */
authRouter.post("/logout", async (c) => {
  return c.json({ success: true });
});

function getGoogleRedirectUri(c: any): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const host =
    c.req.header("x-forwarded-host") ||
    c.req.header("host") ||
    "localhost:3000";
  const protoHeader =
    c.req.header("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const protocol = protoHeader.split(",")[0].trim();
  return `${protocol}://${host}/api/auth/oauth/google/callback`;
}

function getGithubRedirectUri(c: any): string {
  if (process.env.GITHUB_REDIRECT_URI) {
    return process.env.GITHUB_REDIRECT_URI;
  }
  const host =
    c.req.header("x-forwarded-host") ||
    c.req.header("host") ||
    "localhost:3000";
  const protoHeader =
    c.req.header("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const protocol = protoHeader.split(",")[0].trim();
  return `${protocol}://${host}/api/auth/oauth/github/callback`;
}

/**
 * Get OAuth configuration status
 */
authRouter.get("/oauth/config", (c) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  return c.json({
    google: {
      enabled: Boolean(googleClientId && googleClientSecret),
    },
    github: {
      enabled: Boolean(githubClientId && githubClientSecret),
    },
  });
});

/**
 * Initiate linking of a Google account (requires authentication and password verification)
 */
authRouter.post(
  "/oauth/google/init-link",
  localAuthMiddleware,
  async (c: any) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;

      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to link an external account" },
          400,
        );
      }

      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }

      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt,
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return c.json(
          { error: "Google OAuth is not configured on the server" },
          500,
        );
      }

      const state = generateOAuthState({
        action: "link",
        userId: String(user.id),
      });

      const redirectUri = getGoogleRedirectUri(c);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        access_type: "online",
        prompt: "select_account",
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return c.json({ url: authUrl });
    } catch (err: any) {
      return c.json(
        { error: err.message || "Failed to initialize Google linking" },
        500,
      );
    }
  },
);

/**
 * Start Google OAuth sign-in flow
 */
authRouter.get("/oauth/google/login", (c) => {
  const platform =
    c.req.query("platform") ||
    (c.req.query("mobile") === "1" ? "mobile" : undefined);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const errorTarget =
      platform === "mobile"
        ? "oxygenlows://auth?error=" +
          encodeURIComponent("Google OAuth is not configured on the server")
        : "/auth?error=" +
          encodeURIComponent("Google OAuth is not configured on the server");
    return c.redirect(errorTarget);
  }

  const returnTo = getSafeReturnTo(c.req.query("returnTo"));
  const state = generateOAuthState({
    action: "login",
    returnTo,
    platform,
  });

  const redirectUri = getGoogleRedirectUri(c);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return c.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
});

/**
 * Google OAuth Callback
 */
authRouter.get("/oauth/google/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const errorParam = c.req.query("error");

  const state = stateParam ? verifyOAuthState(stateParam) : null;
  const isMobile = state?.platform === "mobile";
  const authBase = isMobile ? "oxygenlows://auth" : "/auth";
  const securityBase = isMobile ? "oxygenlows://security" : "/security";

  if (errorParam) {
    if (state?.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_failed`);
    }
    const safeError = sanitizeOAuthError(errorParam);
    const targetBase = getSafeRedirectBase(authBase, "/auth");
    return c.redirect(`${targetBase}?error=${encodeURIComponent(safeError)}`);
  }

  if (!code || !stateParam || !state) {
    return c.redirect("/auth?error=invalid_or_expired_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_unconfigured`);
    }
    return c.redirect(`${authBase}?error=oauth_unconfigured`);
  }

  try {
    const redirectUri = getGoogleRedirectUri(c);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_token_failed`);
      }
      return c.redirect(`${authBase}?error=oauth_token_failed`);
    }

    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );
    const googleUser: any = await userRes.json();
    if (!userRes.ok || !googleUser.sub) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_user_failed`);
      }
      return c.redirect(`${authBase}?error=oauth_user_failed`);
    }

    const googleId = String(googleUser.sub);
    const googleEmail = String(googleUser.email || "");

    if (state.action === "link") {
      const targetUserId = state.userId;
      if (!targetUserId) {
        return c.redirect(`${securityBase}?error=invalid_user`);
      }

      const existingUser = getUserByOAuthProvider("google", googleId);
      if (existingUser && String(existingUser.id) !== String(targetUserId)) {
        return c.redirect(`${securityBase}?error=oauth_already_linked`);
      }

      linkUserOAuth(targetUserId, "google", {
        id: googleId,
        email: googleEmail,
      });

      return c.redirect(`${securityBase}?oauth=linked`);
    }

    if (state.action === "login") {
      const linkedUser = getUserByOAuthProvider("google", googleId);
      if (!linkedUser) {
        return c.redirect(`${authBase}?error=oauth_not_linked`);
      }

      const token = generateToken(linkedUser);
      const safeReturnTo = getSafeReturnTo(state.returnTo);
      const targetBase = getSafeRedirectBase(authBase, "/auth");
      return c.redirect(
        `${targetBase}?oauth_token=${encodeURIComponent(token)}&requires_unlock=true&returnTo=${encodeURIComponent(safeReturnTo)}`,
      );
    }

    return c.redirect(authBase);
  } catch (err: any) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_exception`);
    }
    return c.redirect(
      `${authBase}?error=${encodeURIComponent(err.message || "oauth_exception")}`,
    );
  }
});

/**
 * Unlink Google account (requires authentication and password verification)
 */
authRouter.post(
  "/oauth/google/unlink",
  localAuthMiddleware,
  async (c: any) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;

      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to unlink an external account" },
          400,
        );
      }

      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }

      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt,
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }

      unlinkUserOAuth(user.id, "google");
      return c.json({ success: true });
    } catch (err: any) {
      return c.json(
        { error: err.message || "Failed to unlink Google account" },
        500,
      );
    }
  },
);

/**
 * Initiate linking of a GitHub account (requires authentication and password verification)
 */
authRouter.post(
  "/oauth/github/init-link",
  localAuthMiddleware,
  async (c: any) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;

      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to link an external account" },
          400,
        );
      }

      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }

      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt,
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }

      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return c.json(
          { error: "GitHub OAuth is not configured on the server" },
          500,
        );
      }

      const state = generateOAuthState({
        action: "link",
        userId: String(user.id),
      });

      const redirectUri = getGithubRedirectUri(c);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state,
      });

      const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
      return c.json({ url: authUrl });
    } catch (err: any) {
      return c.json(
        { error: err.message || "Failed to initialize GitHub linking" },
        500,
      );
    }
  },
);

/**
 * Start GitHub OAuth sign-in flow
 */
authRouter.get("/oauth/github/login", (c) => {
  const platform =
    c.req.query("platform") ||
    (c.req.query("mobile") === "1" ? "mobile" : undefined);
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    const errorTarget =
      platform === "mobile"
        ? "oxygenlows://auth?error=" +
          encodeURIComponent("GitHub OAuth is not configured on the server") +
          "&provider=github"
        : "/auth?error=" +
          encodeURIComponent("GitHub OAuth is not configured on the server") +
          "&provider=github";
    return c.redirect(errorTarget);
  }

  const returnTo = getSafeReturnTo(c.req.query("returnTo"));
  const state = generateOAuthState({
    action: "login",
    returnTo,
    platform,
  });

  const redirectUri = getGithubRedirectUri(c);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });

  return c.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );
});

/**
 * GitHub OAuth Callback
 */
authRouter.get("/oauth/github/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const errorParam = c.req.query("error");

  const state = stateParam ? verifyOAuthState(stateParam) : null;
  const isMobile = state?.platform === "mobile";
  const authBase = isMobile ? "oxygenlows://auth" : "/auth";
  const securityBase = isMobile ? "oxygenlows://security" : "/security";

  if (errorParam) {
    if (state?.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_failed&provider=github`);
    }
    const safeError = sanitizeOAuthError(errorParam);
    const targetBase = getSafeRedirectBase(authBase, "/auth");
    return c.redirect(
      `${targetBase}?error=${encodeURIComponent(safeError)}&provider=github`,
    );
  }

  if (!code || !stateParam || !state) {
    return c.redirect("/auth?error=invalid_or_expired_state&provider=github");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_unconfigured&provider=github`);
    }
    return c.redirect(`${authBase}?error=oauth_unconfigured&provider=github`);
  }

  try {
    const redirectUri = getGithubRedirectUri(c);
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_token_failed&provider=github`);
      }
      return c.redirect(`${authBase}?error=oauth_token_failed&provider=github`);
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "User-Agent": "Oxygen-Lows-Software",
        Accept: "application/vnd.github+json",
      },
    });
    const githubUser: any = await userRes.json();
    if (!userRes.ok || !githubUser.id) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_user_failed&provider=github`);
      }
      return c.redirect(`${authBase}?error=oauth_user_failed&provider=github`);
    }

    const githubId = String(githubUser.id);
    let githubEmail = String(githubUser.email || "");

    if (!githubEmail) {
      try {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            "User-Agent": "Oxygen-Lows-Software",
            Accept: "application/vnd.github+json",
          },
        });
        if (emailsRes.ok) {
          const emailsJson: any = await emailsRes.json();
          if (Array.isArray(emailsJson) && emailsJson.length > 0) {
            const primary =
              emailsJson.find((e: any) => e.primary && e.verified) ||
              emailsJson.find((e: any) => e.verified) ||
              emailsJson[0];
            githubEmail = primary?.email ? String(primary.email) : "";
          }
        }
      } catch {}
    }

    if (!githubEmail && githubUser.login) {
      githubEmail = `${githubUser.login}@users.noreply.github.com`;
    }

    if (state.action === "link") {
      const targetUserId = state.userId;
      if (!targetUserId) {
        return c.redirect(`${securityBase}?error=invalid_user&provider=github`);
      }

      const existingUser = getUserByOAuthProvider("github", githubId);
      if (existingUser && String(existingUser.id) !== String(targetUserId)) {
        return c.redirect(`${securityBase}?error=oauth_already_linked&provider=github`);
      }

      linkUserOAuth(targetUserId, "github", {
        id: githubId,
        email: githubEmail,
      });

      return c.redirect(`${securityBase}?oauth=linked&provider=github`);
    }

    if (state.action === "login") {
      const linkedUser = getUserByOAuthProvider("github", githubId);
      if (!linkedUser) {
        return c.redirect(`${authBase}?error=oauth_not_linked&provider=github`);
      }

      const token = generateToken(linkedUser);
      const safeReturnTo = getSafeReturnTo(state.returnTo);
      const targetBase = getSafeRedirectBase(authBase, "/auth");
      return c.redirect(
        `${targetBase}?oauth_token=${encodeURIComponent(token)}&requires_unlock=true&returnTo=${encodeURIComponent(safeReturnTo)}`,
      );
    }

    return c.redirect(authBase);
  } catch (err: any) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_exception&provider=github`);
    }
    return c.redirect(
      `${authBase}?error=${encodeURIComponent(err.message || "oauth_exception")}&provider=github`,
    );
  }
});

/**
 * Unlink GitHub account (requires authentication and password verification)
 */
authRouter.post(
  "/oauth/github/unlink",
  localAuthMiddleware,
  async (c: any) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;

      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to unlink an external account" },
          400,
        );
      }

      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }

      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt,
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }

      unlinkUserOAuth(user.id, "github");
      return c.json({ success: true });
    } catch (err: any) {
      return c.json(
        { error: err.message || "Failed to unlink GitHub account" },
        500,
      );
    }
  },
);

/**
 * Create a new Quick Sign In session (called by unauthenticated device)
 */
authRouter.post("/quick-sign-in/create", async (c) => {
  try {
    const rawIp =
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      "127.0.0.1";
    const ip = rawIp.split(",")[0].trim();
    const userAgent = c.req.header("user-agent") || "Unknown Device";

    const session = createQuickSignInSession({ ip, userAgent });
    return c.json({
      sessionId: session.sessionId,
      code: session.code,
      expiresAt: session.expiresAt,
    });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to create quick sign-in session" },
      500,
    );
  }
});

/**
 * Poll quick sign in status (called by unauthenticated device)
 */
authRouter.get("/quick-sign-in/poll", async (c) => {
  try {
    const sessionId = c.req.query("sessionId");
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    const session = getQuickSignInById(sessionId);
    if (!session) {
      return c.json({ status: "expired", error: "Session not found or expired" }, 404);
    }

    if (session.status === "approved" && session.authData) {
      return c.json({
        status: "approved",
        session: session.authData.session,
        token: session.authData.token,
        user: session.authData.user,
      });
    }

    return c.json({
      status: session.status,
      expiresAt: session.expiresAt,
    });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to poll quick sign-in status" },
      500,
    );
  }
});

/**
 * Verify a 6-character code (called by authenticated device)
 */
authRouter.post("/quick-sign-in/verify", localAuthMiddleware, async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;

    if (!code || typeof code !== "string") {
      return c.json({ error: "Code is required" }, 400);
    }

    const session = getQuickSignInByCode(code);
    if (!session || session.status !== "pending") {
      return c.json(
        { error: "Invalid or expired quick sign-in code", valid: false },
        400,
      );
    }

    return c.json({
      valid: true,
      code: session.code,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ip: session.ip,
      userAgent: session.userAgent,
    });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to verify quick sign-in code" },
      500,
    );
  }
});

/**
 * Approve a quick sign in request (called by authenticated device)
 */
authRouter.post("/quick-sign-in/approve", localAuthMiddleware, async (c: any) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;

    if (!code || typeof code !== "string") {
      return c.json({ error: "Code is required" }, 400);
    }

    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    const token = generateToken(dbUser);
    const sessionData = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: dbUser.id,
        email: dbUser.email,
        username: dbUser.username,
        role: dbUser.role,
        user_metadata: {
          username: dbUser.username,
          full_name: dbUser.username,
          role: dbUser.role,
        },
      },
    };

    const approved = approveQuickSignInSession(code, {
      user: sessionData.user,
      token,
      session: sessionData,
    });

    if (!approved) {
      return c.json(
        { error: "Failed to approve session. Code may be invalid or expired." },
        400,
      );
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to approve quick sign-in" },
      500,
    );
  }
});

/**
 * Reject a quick sign in request (called by authenticated device)
 */
authRouter.post("/quick-sign-in/reject", localAuthMiddleware, async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;

    if (!code || typeof code !== "string") {
      return c.json({ error: "Code is required" }, 400);
    }

    const rejected = rejectQuickSignInSession(code);
    return c.json({ success: rejected });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to reject quick sign-in" },
      500,
    );
  }
});

/**
 * Passkey Registration: Generate creation options
 */
authRouter.post(
  "/passkey/register-options",
  localAuthMiddleware,
  async (c: any) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;

      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to register a passkey" },
          400,
        );
      }

      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }

      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt,
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }

      const userPasskeys = getUserPasskeys(user.id);
      const excludeCredentials = userPasskeys.map((pk) => ({
        id: pk.id,
        transports: pk.transports as any,
      }));

      const rpID = getRpId(c);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userName: dbUser.username || dbUser.email,
        userID: new TextEncoder().encode(String(user.id)),
        userDisplayName: dbUser.username || dbUser.email,
        attestationType: "none",
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      saveChallenge(options.challenge, String(user.id));

      return c.json({ options });
    } catch (err: any) {
      return c.json(
        {
          error:
            err.message || "Failed to generate passkey registration options",
        },
        500,
      );
    }
  },
);

/**
 * Passkey Registration: Verify attestation response and save credential
 */
authRouter.post(
  "/passkey/register-verify",
  localAuthMiddleware,
  async (c: any) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { response, nickname } = body;

      if (!response) {
        return c.json({ error: "Registration response is required" }, 400);
      }

      const rpID = getRpId(c);
      const expectedOrigin = getExpectedOrigin(c);

      let clientChallenge: string | undefined;
      try {
        const clientData = JSON.parse(
          Buffer.from(response.response.clientDataJSON, "base64url").toString(
            "utf-8",
          ),
        );
        clientChallenge = clientData.challenge;
      } catch {
        // Fallback
      }

      if (
        !clientChallenge ||
        !consumeChallenge(clientChallenge, String(user.id))
      ) {
        return c.json(
          { error: "Invalid or expired registration challenge" },
          400,
        );
      }

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: clientChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return c.json(
          { error: "Passkey registration verification failed" },
          400,
        );
      }

      const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
        verification.registrationInfo;

      const defaultName = `Passkey (${new Date().toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })})`;
      const cleanName =
        typeof nickname === "string" && nickname.trim().length > 0
          ? nickname.trim()
          : defaultName;

      const newPasskey: StoredPasskey = {
        id: credential.id,
        name: cleanName,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response?.transports || credential.transports,
        aaguid,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };

      saveUserPasskey(user.id, newPasskey);

      return c.json({
        success: true,
        passkey: {
          id: newPasskey.id,
          name: newPasskey.name,
          createdAt: newPasskey.createdAt,
          lastUsedAt: newPasskey.lastUsedAt,
        },
      });
    } catch (err: any) {
      return c.json(
        { error: err.message || "Failed to verify passkey registration" },
        500,
      );
    }
  },
);

/**
 * Passkey Login: Generate authentication options
 */
authRouter.get("/passkey/login-options", async (c) => {
  try {
    const rpID = getRpId(c);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: [],
    });

    saveChallenge(options.challenge);

    return c.json({ options });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Failed to generate login options" },
      500,
    );
  }
});

/**
 * Passkey Login: Verify assertion response and issue session
 */
authRouter.post("/passkey/login-verify", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { response } = body;

    if (!response || !response.id) {
      return c.json({ error: "Passkey response is required" }, 400);
    }

    const match = findUserByPasskeyId(response.id);
    if (!match) {
      return c.json({ error: "Passkey not recognized on this device" }, 400);
    }

    const { user, passkey } = match;
    const rpID = getRpId(c);
    const expectedOrigin = getExpectedOrigin(c);

    let clientChallenge: string | undefined;
    try {
      const clientData = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64url").toString(
          "utf-8",
        ),
      );
      clientChallenge = clientData.challenge;
    } catch {
      // Fallback
    }

    if (!clientChallenge || !consumeChallenge(clientChallenge)) {
      return c.json({ error: "Invalid or expired login challenge" }, 400);
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        transports: passkey.transports as any,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return c.json({ error: "Passkey verification failed" }, 400);
    }

    updatePasskeyCounter(
      user.id,
      passkey.id,
      verification.authenticationInfo.newCounter,
    );

    const token = generateToken(user);
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: String(user.id) === "1" ? "admin" : user.role || "user",
        user_metadata: {
          username: user.username,
          full_name: user.username,
          role: String(user.id) === "1" ? "admin" : user.role || "user",
        },
      },
    };

    return c.json({
      user: session.user,
      token,
      session,
      requires_unlock: true,
      error: null,
    });
  } catch (err: any) {
    return c.json(
      { error: err.message || "Passkey sign in failed" },
      500,
    );
  }
});

/**
 * List Passkeys (Authenticated)
 */
authRouter.get("/passkey/list", localAuthMiddleware, async (c: any) => {
  try {
    const user = c.get("user");
    const passkeys = getUserPasskeys(user.id).map(
      ({ id, name, createdAt, lastUsedAt, deviceType, backedUp }) => ({
        id,
        name,
        createdAt,
        lastUsedAt,
        deviceType,
        backedUp,
      }),
    );
    return c.json({ passkeys });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to list passkeys" }, 500);
  }
});

/**
 * Rename Passkey (Authenticated)
 */
authRouter.post("/passkey/rename", localAuthMiddleware, async (c: any) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { credentialId, name } = body;

    if (!credentialId || typeof credentialId !== "string") {
      return c.json({ error: "Credential ID is required" }, 400);
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "Passkey name is required" }, 400);
    }

    const updated = renameUserPasskey(user.id, credentialId, name.trim());
    if (!updated) {
      return c.json({ error: "Passkey not found" }, 404);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to rename passkey" }, 500);
  }
});

/**
 * Delete Passkey (Authenticated + Password Verification)
 */
authRouter.post("/passkey/delete", localAuthMiddleware, async (c: any) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { credentialId, password, authToken } = body;

    if (!credentialId || typeof credentialId !== "string") {
      return c.json({ error: "Credential ID is required" }, 400);
    }

    const tokenInput = authToken || password;
    if (!tokenInput) {
      return c.json(
        { error: "Password is required to delete a passkey" },
        400,
      );
    }

    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    if (dbUser.auth_verifier) {
      const valid = verifyAuthToken(
        tokenInput,
        dbUser.auth_verifier,
        dbUser.auth_salt,
      );
      if (!valid) {
        return c.json({ error: "Incorrect password" }, 400);
      }
    }

    const deleted = deleteUserPasskey(user.id, credentialId);
    if (!deleted) {
      return c.json({ error: "Passkey not found" }, 404);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to delete passkey" }, 500);
  }
});
