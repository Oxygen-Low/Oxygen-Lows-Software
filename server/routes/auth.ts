import { Hono } from "hono";
import {
  getNextUserId,
  initUserFolder,
  getUserById,
  getUserByUsernameOrEmail,
  getProfileByUserId,
} from "../lib/dataStore.ts";
import {
  generateSalt,
  hashPassword,
  verifyPassword,
  generateToken,
  resolveUserFromToken,
  localAuthMiddleware,
} from "../lib/auth.ts";

export const authRouter = new Hono();

/**
 * Register a new local account
 */
authRouter.post("/register", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { username, email, password } = body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return c.json(
        { error: "Username must be at least 3 characters long" },
        400,
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return c.json({ error: "A valid email address is required" }, 400);
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return c.json(
        { error: "Password must be at least 6 characters long" },
        400,
      );
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check for existing username or email
    const existing = getUserByUsernameOrEmail(cleanUsername) || getUserByUsernameOrEmail(cleanEmail);
    if (existing) {
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return c.json({ error: "Username is already taken" }, 400);
      }
      return c.json({ error: "Email is already registered" }, 400);
    }

    const userId = getNextUserId();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const role = String(userId) === "1" ? "admin" : "user";

    const user = initUserFolder(userId, {
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      salt,
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
        user_metadata: {
          username: user.username,
          full_name: user.username,
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
    const { login, password } = body;

    if (!login || !password) {
      return c.json({ error: "Username/email and password are required" }, 400);
    }

    const user = getUserByUsernameOrEmail(login);
    if (!user) {
      return c.json({ error: "Invalid username or password" }, 400);
    }

    const valid = verifyPassword(password, user.password_hash, user.salt);
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
        user_metadata: {
          username: user.username,
          full_name: user.username,
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
