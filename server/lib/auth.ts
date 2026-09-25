import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getUserById } from "./dataStore.ts";

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
  } catch (err) {
    const error = new Error("Failed to read or generate AUTH_SECRET. Please set the AUTH_SECRET environment variable or ensure file system permissions.");
    (error as any).cause = err;
    throw error;
  }
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashAuthVerifier(authToken: string, salt: string): string {
  return crypto
    .pbkdf2Sync(authToken, salt, 100000, 64, "sha512")
    .toString("hex");
}

export function verifyAuthToken(
  authToken: string,
  storedVerifier: string,
  salt: string,
): boolean {
  try {
    const hash = hashAuthVerifier(authToken, salt);
    const hashBuf = Buffer.from(hash, "hex");
    const storedBuf = Buffer.from(storedVerifier, "hex");
    if (hashBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, storedBuf);
  } catch {
    return false;
  }
}

// Aliases for backward compatibility
export const hashPassword = hashAuthVerifier;
export const verifyPassword = verifyAuthToken;

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
  const role = String(user.id) === "1" ? "admin" : user.role || "user";
  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role,
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
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
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

export function generateOAuthState(
  payload: Record<string, any>,
  expiresInMs = 10 * 60 * 1000,
): string {
  const secret = getSecretKey();
  const data = {
    ...payload,
    exp: Date.now() + expiresInMs,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string): Record<string, any> | null {
  try {
    if (!state) return null;
    const [encoded, sig] = state.split(".");
    if (!encoded || !sig) return null;
    const secret = getSecretKey();
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8"),
    );
    if (typeof data.exp === "number" && data.exp < Date.now()) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function resolveUserFromToken(token: string) {
  if (!token) return null;

  // Try resolving as local token
  const localPayload = verifyToken(token);
  if (localPayload) {
    const user = getUserById(localPayload.userId);
    if (user) {
      // If user credentials were wiped or user is suspended, invalidate session
      if (user.auth_verifier === null || user.suspended || user.status === "suspended") {
        return null;
      }
      const role =
        String(user.id) === "1" || String(localPayload.userId) === "1"
          ? "admin"
          : user.role || localPayload.role || "user";
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        role,
        created_at: user.created_at,
        user_metadata: {
          username: user.username,
          full_name: user.username,
        },
      };
    }
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
