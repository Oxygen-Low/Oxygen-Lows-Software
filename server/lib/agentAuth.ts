import crypto from "node:crypto";
import type { Context, Next } from "hono";
import { getTableRows } from "./dataStore.ts";
import { getSecretKey } from "./auth.ts";

export interface AgentTokenPayload {
  purpose: "agent_session";
  agentId: string;
  username: string;
  ownerUserId: string;
  role: "agent_account";
  exp: number;
}

export function generateAgentToken(
  agent: { id: string; username: string; owner_user_id: string },
  expiresInDays: number = 30,
): string {
  const secret = getSecretKey();
  const payload: AgentTokenPayload = {
    purpose: "agent_session",
    agentId: String(agent.id),
    username: agent.username,
    ownerUserId: String(agent.owner_user_id),
    role: "agent_account",
    exp: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `ag_${encodedPayload}.${signature}`;
}

export function verifyAgentToken(token: string): AgentTokenPayload | null {
  try {
    if (!token || !token.startsWith("ag_")) return null;
    const cleanToken = token.slice(3);
    const [encodedPayload, signature] = cleanToken.split(".");
    if (!encodedPayload || !signature) return null;

    const secret = getSecretKey();
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url");

    if (signature.length !== expectedSignature.length) return null;
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
    if (!isValid) return null;

    const payload: AgentTokenPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8"),
    );

    if (payload.purpose !== "agent_session" || payload.role !== "agent_account") {
      return null;
    }

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function generateRandomPassword(length: number = 24): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

export function generateVerificationCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Remove ambiguous characters
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

const PBKDF2_ITERATIONS =
  process.env.NODE_ENV === "test" || process.env.VITEST ? 100 : 100000;

export function hashAgentPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512")
    .toString("hex");
}

export function verifyAgentPassword(
  password: string,
  storedVerifier: string,
  salt: string,
): boolean {
  try {
    const hash = hashAgentPassword(password, salt);
    const hashBuf = Buffer.from(hash, "hex");
    const storedBuf = Buffer.from(storedVerifier, "hex");
    if (hashBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, storedBuf);
  } catch {
    return false;
  }
}

export async function requireAgentAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!token) {
    return c.json({ error: "Missing Agent authorization header" }, 401);
  }

  const payload = verifyAgentToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired agent token" }, 401);
  }

  const accounts = getTableRows("agent_accounts");
  const agent = accounts.find((a: any) => String(a.id) === String(payload.agentId));
  if (!agent) {
    return c.json({ error: "Agent account not found" }, 401);
  }

  if (agent.status === "suspended") {
    return c.json({ error: "Agent account is suspended" }, 403);
  }

  c.set("agent", agent);
  c.set("agentId", String(agent.id));
  await next();
}
