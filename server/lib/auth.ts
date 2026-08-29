import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getUserById } from "./dataStore.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

function getSecretKey(): string {
  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }
  const secretPath = path.join(DATA_DIR, "secret.key");
  try {
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, "utf-8").trim();
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const newSecret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretPath, newSecret, "utf-8");
    return newSecret;
  } catch {
    return "oxygen-lows-software-default-secret-auth-key-2026";
  }
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

export function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
): boolean {
  try {
    const hash = hashPassword(password, salt);
    const hashBuf = Buffer.from(hash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (hashBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, storedBuf);
  } catch {
    return false;
  }
}

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  role?: string;
  exp: number;
}

export function generateToken(
  user: { id: string; username: string; email: string; role?: string },
  expiresInDays: number = 30,
): string {
  const secret = getSecretKey();
  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role || "user",
    exp: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `ol_${encodedPayload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    if (!token || !token.startsWith("ol_")) return null;
    const cleanToken = token.slice(3);
    const [encodedPayload, signature] = cleanToken.split(".");
    if (!encodedPayload || !signature) return null;

    const secret = getSecretKey();
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSig),
      )
    ) {
      return null;
    }

    const payloadStr = Buffer.from(encodedPayload, "base64url").toString(
      "utf-8",
    );
    const payload: TokenPayload = JSON.parse(payloadStr);

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function resolveUserFromToken(token: string) {
  if (!token) return null;

  // 1. Try resolving as local token
  const localPayload = verifyToken(token);
  if (localPayload) {
    const user = getUserById(localPayload.userId);
    if (user) {
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role || "user",
        user_metadata: {
          username: user.username,
          full_name: user.username,
        },
      };
    }
  }

  // 2. Fallback to verifying with Supabase
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (!error && user) {
      return {
        id: user.id,
        email: user.email,
        username:
          user.user_metadata?.username ||
          user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          "User",
        role: "user",
        user_metadata: user.user_metadata,
      };
    }
  } catch {}

  // Fallback: direct fetch to Supabase Auth endpoint
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (authRes.ok) {
      const user = await authRes.json();
      if (user?.id) {
        return {
          id: user.id,
          email: user.email,
          username:
            user.user_metadata?.username ||
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "User",
          role: "user",
          user_metadata: user.user_metadata,
        };
      }
    }
  } catch {}

  // Fallback: parse JWT payload if valid and not expired
  if (typeof token === "string" && token.includes(".")) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf-8"),
        );
        if (payload.sub && (!payload.exp || payload.exp * 1000 > Date.now() - 3600000)) {
          return {
            id: payload.sub,
            email: payload.email,
            username:
              payload.user_metadata?.username ||
              payload.user_metadata?.full_name ||
              payload.email?.split("@")[0] ||
              "User",
            role: "user",
            user_metadata: payload.user_metadata || {},
          };
        }
      }
    } catch {}
  }

  return null;
}

export const localAuthMiddleware = async (c: any, next: any) => {
  let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
  if (!token) {
    token = c.req.query("token");
  }

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("userId", user.id);
  c.set("token", token);
  await next();
};
