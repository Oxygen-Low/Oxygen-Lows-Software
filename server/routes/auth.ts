import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  DATA_DIR,
  getNextUserId,
  initUserFolder,
  getUserById,
  getUserByUsernameOrEmail,
  saveTableRows,
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

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export const authRouter = new Hono();

// Helper to copy directory contents
function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

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

    const user = initUserFolder(userId, {
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      salt,
      role: "user",
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

/**
 * Migrate Google / Supabase account to local account
 */
authRouter.post("/migrate", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { supabaseToken, masterKey, username, email, password } = body;

    if (!supabaseToken) {
      return c.json({ error: "Supabase authentication token is required for migration" }, 400);
    }

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return c.json({ error: "A valid username of at least 3 characters is required" }, 400);
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return c.json({ error: "A password of at least 6 characters is required" }, 400);
    }

    // Verify Supabase Token
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${supabaseToken}` } },
      auth: { persistSession: false },
    });

    let sbUser: any = null;

    try {
      const { data, error } = await supabase.auth.getUser(supabaseToken);
      if (!error && data?.user) {
        sbUser = data.user;
      }
    } catch {}

    // Fallback: direct fetch to Supabase Auth endpoint
    if (!sbUser) {
      try {
        const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${supabaseToken}`,
          },
        });
        if (authRes.ok) {
          const userJson = await authRes.json();
          if (userJson?.id) {
            sbUser = userJson;
          }
        }
      } catch {}
    }

    // Fallback: parse JWT payload if token has not expired
    if (!sbUser && typeof supabaseToken === "string" && supabaseToken.includes(".")) {
      try {
        const parts = supabaseToken.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf-8"),
          );
          if (payload.sub && (!payload.exp || payload.exp * 1000 > Date.now() - 3600000)) {
            sbUser = {
              id: payload.sub,
              email: payload.email,
              user_metadata: payload.user_metadata || {},
            };
          }
        }
      } catch {}
    }

    if (!sbUser) {
      return c.json({ error: "Failed to authenticate Google / Supabase account" }, 401);
    }

    const cleanUsername = username.trim();
    const cleanEmail = (email || sbUser.email || "").trim().toLowerCase();

    // Check if user already exists locally
    const existing = getUserByUsernameOrEmail(cleanUsername) || getUserByUsernameOrEmail(cleanEmail);
    if (existing) {
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return c.json({ error: "Username is already taken. Please choose another." }, 400);
      }
      return c.json({ error: "An account with this email is already registered locally." }, 400);
    }

    // Allocate sequential integer user ID
    const newUserId = getNextUserId();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    const newUser = initUserFolder(newUserId, {
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      salt,
      role: "user",
    });

    // Fetch all user data from Supabase
    const [
      profileRes,
      picRes,
      prefRes,
      dataSavesRes,
      catsRes,
      chatsRes,
      messagesRes,
      charsRes,
      universesRes,
      passwordsRes,
      ticketsRes,
      vpnRes,
      integrationsRes,
      publicAssetsRes,
      publicCharsRes,
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", sbUser.id).single(),
      supabase.from("profile_pictures").select("*").eq("user_id", sbUser.id).single(),
      supabase.from("user_preferences").select("*").eq("user_id", sbUser.id).single(),
      supabase.from("data_saves").select("*").eq("user_id", sbUser.id),
      supabase.from("data_save_categories").select("*").eq("user_id", sbUser.id),
      supabase.from("chats").select("*").eq("user_id", sbUser.id),
      supabase.from("chat_messages").select("*").eq("user_id", sbUser.id),
      supabase.from("characters").select("*").eq("user_id", sbUser.id),
      supabase.from("universes").select("*").eq("user_id", sbUser.id),
      supabase.from("user_passwords").select("*").eq("user_id", sbUser.id),
      supabase.from("support_tickets").select("*").eq("user_id", sbUser.id),
      supabase.from("vpn_configs").select("*").eq("user_id", sbUser.id),
      supabase.from("user_integrations").select("*").eq("user_id", sbUser.id),
      supabase.from("public_assets").select("*").eq("user_id", sbUser.id),
      supabase.from("public_characters").select("*").eq("user_id", sbUser.id),
    ]);

    // Save profile data
    const profile = {
      id: newUserId,
      user_id: newUserId,
      username: cleanUsername,
      email: cleanEmail,
      display_name: profileRes.data?.display_name || cleanUsername,
      bio: profileRes.data?.bio || "",
      language: profileRes.data?.language || "English",
      additional_languages: profileRes.data?.additional_languages || [],
      avatar_url: picRes.data?.avatar_url || profileRes.data?.avatar_url || null,
      created_at: profileRes.data?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveTableRows("profiles", newUserId, [profile]);

    // Save preferences
    if (prefRes.data) {
      const prefs = {
        ...prefRes.data,
        id: newUserId,
        user_id: newUserId,
      };
      saveTableRows("user_preferences", newUserId, [prefs]);
    }

    // Map and save data saves & categories
    if (catsRes.data && catsRes.data.length > 0) {
      const updatedCats = catsRes.data.map((c: any) => ({
        ...c,
        user_id: newUserId,
      }));
      saveTableRows("data_save_categories", newUserId, updatedCats);
    }

    if (dataSavesRes.data && dataSavesRes.data.length > 0) {
      const updatedSaves = dataSavesRes.data.map((s: any) => ({
        ...s,
        user_id: newUserId,
      }));
      saveTableRows("data_saves", newUserId, updatedSaves);
    }

    // Map and save chatbot chats & messages
    if (chatsRes.data && chatsRes.data.length > 0) {
      const updatedChats = chatsRes.data.map((c: any) => ({
        ...c,
        user_id: newUserId,
      }));
      saveTableRows("chats", newUserId, updatedChats);
    }

    if (messagesRes.data && messagesRes.data.length > 0) {
      const updatedMessages = messagesRes.data.map((m: any) => ({
        ...m,
        user_id: newUserId,
      }));
      saveTableRows("chat_messages", newUserId, updatedMessages);
    }

    // Map and save characters & universes
    if (charsRes.data && charsRes.data.length > 0) {
      const updatedChars = charsRes.data.map((c: any) => ({
        ...c,
        user_id: newUserId,
      }));
      saveTableRows("characters", newUserId, updatedChars);
    }

    if (universesRes.data && universesRes.data.length > 0) {
      const updatedUniverses = universesRes.data.map((u: any) => ({
        ...u,
        user_id: newUserId,
      }));
      saveTableRows("universes", newUserId, updatedUniverses);
    }

    // Map and save user passwords
    if (passwordsRes.data && passwordsRes.data.length > 0) {
      const updatedPasswords = passwordsRes.data.map((p: any) => ({
        ...p,
        user_id: newUserId,
      }));
      saveTableRows("user_passwords", newUserId, updatedPasswords);
    }

    // Map and save support tickets
    if (ticketsRes.data && ticketsRes.data.length > 0) {
      const updatedTickets = ticketsRes.data.map((t: any) => ({
        ...t,
        user_id: newUserId,
      }));
      saveTableRows("support_tickets", newUserId, updatedTickets);
    }

    // Map and save VPN configs
    if (vpnRes.data && vpnRes.data.length > 0) {
      const updatedVpn = vpnRes.data.map((v: any) => ({
        ...v,
        user_id: newUserId,
      }));
      saveTableRows("vpn_configs", newUserId, updatedVpn);
    }

    // Map and save integrations
    if (integrationsRes.data && integrationsRes.data.length > 0) {
      const updatedIntegrations = integrationsRes.data.map((i: any) => ({
        ...i,
        user_id: newUserId,
      }));
      saveTableRows("user_integrations", newUserId, updatedIntegrations);
    }

    // Map and save public assets
    if (publicAssetsRes.data && publicAssetsRes.data.length > 0) {
      const updatedAssets = publicAssetsRes.data.map((a: any) => ({
        ...a,
        user_id: newUserId,
      }));
      saveTableRows("public_assets", newUserId, updatedAssets);
    }

    // Migrate storage files
    const oldStorageDir = path.join(process.cwd(), "uploads", "Storage", sbUser.id);
    const newStorageDir = path.join(process.cwd(), "uploads", "Storage", newUserId);
    const userDataStorageDir = path.join(DATA_DIR, newUserId, "storage");
    if (fs.existsSync(oldStorageDir)) {
      copyDirRecursive(oldStorageDir, newStorageDir);
      copyDirRecursive(oldStorageDir, userDataStorageDir);
    }

    // Migrate public asset files
    const oldPublicDir = path.join(process.cwd(), "uploads", "public-assets", sbUser.id);
    const newPublicDir = path.join(process.cwd(), "uploads", "public-assets", newUserId);
    const userDataPublicDir = path.join(DATA_DIR, newUserId, "public_assets");
    if (fs.existsSync(oldPublicDir)) {
      copyDirRecursive(oldPublicDir, newPublicDir);
      copyDirRecursive(oldPublicDir, userDataPublicDir);
    }

    const token = generateToken(newUser);
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        user_metadata: {
          username: newUser.username,
          full_name: newUser.username,
        },
      },
    };

    return c.json({
      success: true,
      user: session.user,
      token,
      session,
      masterKey: masterKey || null,
      error: null,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Migration failed" }, 500);
  }
});
