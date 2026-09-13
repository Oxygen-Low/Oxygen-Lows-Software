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

export const authRouter = new Hono();

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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.redirect(
      "/auth?error=" +
        encodeURIComponent("Google OAuth is not configured on the server"),
    );
  }

  const returnTo = c.req.query("returnTo") || "/apps";
  const state = generateOAuthState({
    action: "login",
    returnTo,
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

  if (errorParam) {
    if (state?.action === "link") {
      return c.redirect("/security?error=oauth_failed");
    }
    return c.redirect(`/auth?error=${encodeURIComponent(errorParam)}`);
  }

  if (!code || !stateParam || !state) {
    return c.redirect("/auth?error=invalid_or_expired_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (state.action === "link") {
      return c.redirect("/security?error=oauth_unconfigured");
    }
    return c.redirect("/auth?error=oauth_unconfigured");
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
        return c.redirect("/security?error=oauth_token_failed");
      }
      return c.redirect("/auth?error=oauth_token_failed");
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
        return c.redirect("/security?error=oauth_user_failed");
      }
      return c.redirect("/auth?error=oauth_user_failed");
    }

    const googleId = String(googleUser.sub);
    const googleEmail = String(googleUser.email || "");

    if (state.action === "link") {
      const targetUserId = state.userId;
      if (!targetUserId) {
        return c.redirect("/security?error=invalid_user");
      }

      const existingUser = getUserByOAuthProvider("google", googleId);
      if (existingUser && String(existingUser.id) !== String(targetUserId)) {
        return c.redirect("/security?error=oauth_already_linked");
      }

      linkUserOAuth(targetUserId, "google", {
        id: googleId,
        email: googleEmail,
      });

      return c.redirect("/security?oauth=linked");
    }

    if (state.action === "login") {
      const linkedUser = getUserByOAuthProvider("google", googleId);
      if (!linkedUser) {
        return c.redirect("/auth?error=oauth_not_linked");
      }

      const token = generateToken(linkedUser);
      const returnTo = state.returnTo || "/apps";
      return c.redirect(
        `/auth?oauth_token=${encodeURIComponent(token)}&requires_unlock=true&returnTo=${encodeURIComponent(returnTo)}`,
      );
    }

    return c.redirect("/auth");
  } catch (err: any) {
    if (state.action === "link") {
      return c.redirect("/security?error=oauth_exception");
    }
    return c.redirect(
      `/auth?error=${encodeURIComponent(err.message || "oauth_exception")}`,
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
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.redirect(
      "/auth?error=" +
        encodeURIComponent("GitHub OAuth is not configured on the server"),
    );
  }

  const returnTo = c.req.query("returnTo") || "/apps";
  const state = generateOAuthState({
    action: "login",
    returnTo,
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

  if (errorParam) {
    if (state?.action === "link") {
      return c.redirect("/security?error=oauth_failed&provider=github");
    }
    return c.redirect(
      `/auth?error=${encodeURIComponent(errorParam)}&provider=github`,
    );
  }

  if (!code || !stateParam || !state) {
    return c.redirect("/auth?error=invalid_or_expired_state&provider=github");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (state.action === "link") {
      return c.redirect("/security?error=oauth_unconfigured&provider=github");
    }
    return c.redirect("/auth?error=oauth_unconfigured&provider=github");
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
        return c.redirect("/security?error=oauth_token_failed&provider=github");
      }
      return c.redirect("/auth?error=oauth_token_failed&provider=github");
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
        return c.redirect("/security?error=oauth_user_failed&provider=github");
      }
      return c.redirect("/auth?error=oauth_user_failed&provider=github");
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
        return c.redirect("/security?error=invalid_user&provider=github");
      }

      const existingUser = getUserByOAuthProvider("github", githubId);
      if (existingUser && String(existingUser.id) !== String(targetUserId)) {
        return c.redirect("/security?error=oauth_already_linked&provider=github");
      }

      linkUserOAuth(targetUserId, "github", {
        id: githubId,
        email: githubEmail,
      });

      return c.redirect("/security?oauth=linked&provider=github");
    }

    if (state.action === "login") {
      const linkedUser = getUserByOAuthProvider("github", githubId);
      if (!linkedUser) {
        return c.redirect("/auth?error=oauth_not_linked&provider=github");
      }

      const token = generateToken(linkedUser);
      const returnTo = state.returnTo || "/apps";
      return c.redirect(
        `/auth?oauth_token=${encodeURIComponent(token)}&requires_unlock=true&returnTo=${encodeURIComponent(returnTo)}`,
      );
    }

    return c.redirect("/auth");
  } catch (err: any) {
    if (state.action === "link") {
      return c.redirect("/security?error=oauth_exception&provider=github");
    }
    return c.redirect(
      `/auth?error=${encodeURIComponent(err.message || "oauth_exception")}&provider=github`,
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
