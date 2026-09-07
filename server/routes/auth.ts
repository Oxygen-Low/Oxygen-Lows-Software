import { Hono } from "hono";
import {
  getNextUserId,
  initUserFolder,
  getUserById,
  getUserByUsernameOrEmail,
  getProfileByUserId,
  updateUserAuthVerifier,
} from "../lib/dataStore.ts";
import {
  generateSalt,
  hashAuthVerifier,
  verifyAuthToken,
  generateToken,
  resolveUserFromToken,
  localAuthMiddleware,
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

    return c.json({
      session: {
        access_token: token,
        token_type: "bearer",
        user,
      },
      user: {
        ...user,
        profile,
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
