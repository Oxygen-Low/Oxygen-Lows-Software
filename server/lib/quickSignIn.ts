import crypto from "node:crypto";

export interface QuickSignInSession {
  id: string; // Secret session token used by the unauthenticated device to poll
  code: string; // 6-character code entered on the authenticated device
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
  ip: string;
  userAgent: string;
  authData?: {
    user: any;
    token: string;
    session: any;
  };
}

const sessionsById = new Map<string, QuickSignInSession>();
const sessionsByCode = new Map<string, string>(); // code -> id

// 5 minutes expiry window
export const QUICK_SIGN_IN_TTL_MS = 5 * 60 * 1000;

// Character set avoiding ambiguous characters (0/O, 1/I)
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateQuickSignInCode(): string {
  let code = "";
  const randomBytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    const index = randomBytes[i] % CODE_CHARS.length;
    code += CODE_CHARS[index];
  }
  return code;
}

export function cleanExpiredQuickSignInSessions() {
  const now = Date.now();
  for (const [id, session] of sessionsById.entries()) {
    if (session.expiresAt <= now) {
      sessionsByCode.delete(session.code);
      sessionsById.delete(id);
    }
  }
}

export function createQuickSignInSession(meta: {
  ip: string;
  userAgent: string;
}): { sessionId: string; code: string; expiresAt: number } {
  cleanExpiredQuickSignInSessions();

  const id = crypto.randomUUID();
  let code = generateQuickSignInCode();

  // Ensure unique active code
  let attempts = 0;
  while (sessionsByCode.has(code) && attempts < 10) {
    code = generateQuickSignInCode();
    attempts++;
  }

  const now = Date.now();
  const expiresAt = now + QUICK_SIGN_IN_TTL_MS;

  const session: QuickSignInSession = {
    id,
    code,
    createdAt: now,
    expiresAt,
    status: "pending",
    ip: meta.ip || "Unknown",
    userAgent: meta.userAgent || "Unknown Device",
  };

  sessionsById.set(id, session);
  sessionsByCode.set(code, id);

  return { sessionId: id, code, expiresAt };
}

export function getQuickSignInById(sessionId: string): QuickSignInSession | null {
  cleanExpiredQuickSignInSessions();
  const session = sessionsById.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    session.status = "expired";
    return session;
  }
  return session;
}

export function getQuickSignInByCode(code: string): QuickSignInSession | null {
  cleanExpiredQuickSignInSessions();
  const cleanCode = (code || "").trim().toUpperCase();
  const id = sessionsByCode.get(cleanCode);
  if (!id) return null;
  const session = sessionsById.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    session.status = "expired";
    return session;
  }
  return session;
}

export function approveQuickSignInSession(
  code: string,
  authData: { user: any; token: string; session: any },
): boolean {
  cleanExpiredQuickSignInSessions();
  const session = getQuickSignInByCode(code);
  if (!session || session.status !== "pending") {
    return false;
  }
  session.status = "approved";
  session.authData = authData;
  return true;
}

export function rejectQuickSignInSession(code: string): boolean {
  cleanExpiredQuickSignInSessions();
  const session = getQuickSignInByCode(code);
  if (!session || session.status !== "pending") {
    return false;
  }
  session.status = "rejected";
  return true;
}

export function clearAllQuickSignInSessions() {
  sessionsById.clear();
  sessionsByCode.clear();
}
