import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getUserById, getAllUserIds } from "./dataStore.ts";

export interface StoredPasskey {
  id: string; // Base64URL credential ID
  name: string; // Friendly nickname
  publicKey: string; // Base64URL encoded public key
  counter: number;
  deviceType?: "singleDevice" | "multiDevice";
  backedUp?: boolean;
  transports?: string[];
  aaguid?: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const RP_NAME = "Oxygen Low's Software";

export function getRpId(c: any): string {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
  if (process.env.RP_ID) return process.env.RP_ID;
  const host =
    c?.req?.header("x-forwarded-host") ||
    c?.req?.header("host") ||
    "localhost";
  return host.split(":")[0];
}

export function getExpectedOrigin(c: any): string {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN;
  if (process.env.RP_ORIGIN) return process.env.RP_ORIGIN;
  const host =
    c?.req?.header("x-forwarded-host") ||
    c?.req?.header("host") ||
    "localhost:3000";
  const protoHeader =
    c?.req?.header("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const protocol = protoHeader.split(",")[0].trim();
  return `${protocol}://${host}`;
}

// ---------------------------------------------------------------------------
// In-Memory Challenge Store (TTL: 5 minutes)
// ---------------------------------------------------------------------------

interface ChallengeEntry {
  challenge: string;
  userId?: string;
  exp: number;
}

const challengeMap = new Map<string, ChallengeEntry>();

// Prune expired challenges periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of challengeMap.entries()) {
    if (val.exp < now) {
      challengeMap.delete(key);
    }
  }
}, 60000);
if (typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}

export function saveChallenge(
  challenge: string,
  userId?: string,
  ttlMs = 5 * 60 * 1000,
): void {
  challengeMap.set(challenge, {
    challenge,
    userId,
    exp: Date.now() + ttlMs,
  });
}

export function consumeChallenge(
  challenge: string,
  expectedUserId?: string,
): boolean {
  if (!challenge) return false;
  const entry = challengeMap.get(challenge);
  if (!entry) return false;

  challengeMap.delete(challenge);

  if (entry.exp < Date.now()) {
    return false;
  }

  if (expectedUserId !== undefined && entry.userId !== String(expectedUserId)) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Passkey Storage & Credential Indexing
// ---------------------------------------------------------------------------

const credentialIndex = new Map<string, string>(); // credentialID -> userId
let indexInitialized = false;

function getUserPasskeysPath(userId: string | number): string {
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) {
    throw new Error("Invalid user ID");
  }
  const base = path.resolve(DATA_DIR);
  const resolved = path.resolve(base, safeId, "passkeys.json");
  const rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

function ensureIndexInitialized(): void {
  if (indexInitialized) return;
  try {
    const userIds = getAllUserIds();
    for (const uid of userIds) {
      try {
        const p = getUserPasskeysPath(uid);
        if (fs.existsSync(p)) {
          const list: StoredPasskey[] = JSON.parse(fs.readFileSync(p, "utf-8"));
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item?.id) {
                credentialIndex.set(item.id, uid);
              }
            }
          }
        }
      } catch {
        // ignore corrupted or invalid user passkey file
      }
    }
  } catch {
    // ignore
  }
  indexInitialized = true;
}

export function invalidatePasskeyIndex(): void {
  credentialIndex.clear();
  indexInitialized = false;
}

export function getUserPasskeys(userId: string | number): StoredPasskey[] {
  try {
    const p = getUserPasskeysPath(userId);
    if (!fs.existsSync(p)) return [];
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeUserPasskeys(
  userId: string | number,
  passkeys: StoredPasskey[],
): void {
  const p = getUserPasskeysPath(userId);
  const userDir = path.dirname(p);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  fs.writeFileSync(p, JSON.stringify(passkeys, null, 2), "utf-8");
}

export function saveUserPasskey(
  userId: string | number,
  passkey: StoredPasskey,
): void {
  const current = getUserPasskeys(userId);
  const filtered = current.filter((pk) => pk.id !== passkey.id);
  filtered.push(passkey);
  writeUserPasskeys(userId, filtered);

  credentialIndex.set(passkey.id, String(userId));
}

export function renameUserPasskey(
  userId: string | number,
  credentialId: string,
  newName: string,
): boolean {
  const current = getUserPasskeys(userId);
  const target = current.find((pk) => pk.id === credentialId);
  if (!target) return false;

  target.name = newName.trim();
  writeUserPasskeys(userId, current);
  return true;
}

export function deleteUserPasskey(
  userId: string | number,
  credentialId: string,
): boolean {
  const current = getUserPasskeys(userId);
  const filtered = current.filter((pk) => pk.id !== credentialId);
  if (filtered.length === current.length) return false;

  writeUserPasskeys(userId, filtered);
  credentialIndex.delete(credentialId);
  return true;
}

export function updatePasskeyCounter(
  userId: string | number,
  credentialId: string,
  counter: number,
): void {
  const current = getUserPasskeys(userId);
  const target = current.find((pk) => pk.id === credentialId);
  if (target) {
    target.counter = counter;
    target.lastUsedAt = new Date().toISOString();
    writeUserPasskeys(userId, current);
  }
}

export function findUserByPasskeyId(credentialId: string): {
  user: any;
  passkey: StoredPasskey;
} | null {
  if (!credentialId) return null;
  ensureIndexInitialized();

  let userId = credentialIndex.get(credentialId);

  // If not found in index, perform a fresh scan of user files in case of external change
  if (!userId) {
    const userIds = getAllUserIds();
    for (const uid of userIds) {
      const list = getUserPasskeys(uid);
      const match = list.find((pk) => pk.id === credentialId);
      if (match) {
        credentialIndex.set(credentialId, uid);
        userId = uid;
        break;
      }
    }
  }

  if (!userId) return null;

  const user = getUserById(userId);
  if (!user) return null;

  const passkeys = getUserPasskeys(userId);
  const passkey = passkeys.find((pk) => pk.id === credentialId);
  if (!passkey) return null;

  return { user, passkey };
}
