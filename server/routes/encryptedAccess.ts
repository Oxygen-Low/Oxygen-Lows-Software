import { Hono } from "hono";
import type { Context, Next } from "hono";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveUserFromToken, localAuthMiddleware } from "../lib/auth.ts";
import {
  getTableFilePath,
  getTableRows,
  insertTable,
  updateTable,
  deleteTable,
  readJsonFile,
  getAllUserIds,
  getUserById,
} from "../lib/dataStore.ts";
import { rateLimiter } from "../lib/rateLimiter.ts";
import {
  ENCRYPTED_API_CATEGORIES,
  type EncryptedApiCategory,
  type EncryptedApiGrant,
  type CreateEncryptedApiGrantRequest,
  ENCRYPTED_API_TOKEN_PREFIX,
  ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX,
  ENCRYPTED_API_MAX_PAGE_SIZE,
  ENCRYPTED_API_DEFAULT_PAGE_SIZE,
  ENCRYPTED_API_MAX_KEY_AGE_MS,
} from "../../shared/encryptedApi.ts";

const router = new Hono<{
  Variables: {
    userId: string;
    grant?: { user_id: string; categories: EncryptedApiCategory[]; wrapped_keys: Record<string, string> };
    secretB64Url?: string;
  };
}>();

const authLimiter = rateLimiter(30, 60 * 1000, "encrypted-api-auth");
const dataLimiter = rateLimiter(60, 60 * 1000, "encrypted-api-data");

const CATEGORY_TABLES: Record<EncryptedApiCategory, string[]> = {
  characters: ["characters", "universes", "races"],
  data_save: ["data_saves", "data_save_categories"],
  chatbot: ["chats", "chatbot_messages"],
};

const CATEGORY_DECRYPT_FIELDS: Record<EncryptedApiCategory, Record<string, string[]>> = {
  characters: {
    characters: ["name", "short_description", "display_name", "appearance", "personality", "backstory", "situation", "hidden_description", "stats"],
    universes: ["name", "short_description", "display_name", "description", "lore"],
    races: ["name", "short_description", "display_name", "description", "traits"],
  },
  data_save: {
    data_saves: ["key_name", "content"],
    data_save_categories: ["name"],
  },
  chatbot: {
    chats: ["title", "system_prompt"],
    chatbot_messages: ["content", "reasoning"],
  },
};

/** Check whether a bearer token uses the encrypted-access prefix. */
function isGrantToken(token: string): boolean {
  return token.startsWith(ENCRYPTED_API_TOKEN_PREFIX);
}

/** Split a grant token into its grant ID and secret components. */
function parseGrantToken(token: string): { grantId: string; secretB64Url: string } | null {
  if (!isGrantToken(token)) return null;
  const rest = token.slice(ENCRYPTED_API_TOKEN_PREFIX.length);
  const dotIndex = rest.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === rest.length - 1) return null;
  return { grantId: rest.slice(0, dotIndex), secretB64Url: rest.slice(dotIndex + 1) };
}

/** Decode padded or unpadded base64url data into bytes. */
function base64UrlToBytes(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/** Encode bytes as a lowercase hexadecimal string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
const GRANT_INDEX_TABLE = "encrypted_api_grant_index";

/** Treat a JSON null (or any non-object) body as an empty object. */
function normalizeJsonBody(body: unknown): Record<string, any> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, any>)
    : {};
}

/**
 * In-memory copy of the persisted grant-ID index. Authentication can then
 * resolve an owner in constant time instead of reading the index file.
 */
const grantOwnerIndex = new Map<string, string>();
let grantIndexSeeded = false;

/**
 * Build the global grant-ID index once for data that predates it, then load
 * the persisted index into memory. The persisted index remains the source of
 * truth across restarts.
 */
function ensureGrantIndexSeeded(): void {
  if (grantIndexSeeded) return;

  const indexPath = getTableFilePath(GRANT_INDEX_TABLE);
  if (indexPath && !fs.existsSync(indexPath)) {
    const entries: Array<Record<string, any>> = [];
    for (const userId of getAllUserIds()) {
      for (const grant of getTableRows("encrypted_api_grants", userId)) {
        if (grant?.id) {
          entries.push({
            id: grant.id,
            user_id: userId,
            created_at: grant.created_at || new Date().toISOString(),
          });
        }
      }
    }

    if (entries.length === 0) {
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, "[]", "utf-8");
    } else {
      for (const entry of entries) {
        insertTable(GRANT_INDEX_TABLE, entry, entry.user_id);
      }
    }
  }

  grantOwnerIndex.clear();
  for (const row of getTableRows(GRANT_INDEX_TABLE)) {
    if (row?.id && row?.user_id) {
      grantOwnerIndex.set(String(row.id), String(row.user_id));
    }
  }
  grantIndexSeeded = true;
}

/** Resolve a grant owner from the in-memory index without scanning users. */
function findGrantOwner(grantId: string): string | null {
  ensureGrantIndexSeeded();
  return grantOwnerIndex.get(grantId) ?? null;
}

// Seed legacy grants once at startup so authentication never scans user folders.
ensureGrantIndexSeeded();

const subtle = crypto.webcrypto?.subtle;
if (!subtle) {
  throw new Error("Web Crypto API is not available in this Node.js runtime");
}

/** Hash bytes with SHA-256 and return lowercase hexadecimal. */
function sha256Hex(data: Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Derive the grant wrapping key from its token secret using HKDF. */
async function deriveGrantWrappingKey(secretB64Url: string): Promise<CryptoKey> {
  const secretBytes = base64UrlToBytes(secretB64Url);
  const baseKey = await subtle.importKey("raw", secretBytes as any, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("oxygen-lows-software/encrypted-api/v1"),
      info: new TextEncoder().encode("category-data-key-wrap"),
    },
    baseKey,
    256,
  );
  return (await subtle.importKey("raw", new Uint8Array(bits as ArrayBuffer), { name: "AES-GCM" }, false, ["decrypt", "encrypt"])) as unknown as CryptoKey;
}

/** Decrypt an IV-prefixed AES-256-GCM ciphertext into UTF-8 text. */
async function aesGcmDecrypt(ciphertextB64: string, key: CryptoKey): Promise<string> {
  const raw = base64UrlToBytes(ciphertextB64);
  if (raw.length < 12 + 16) throw new Error("Ciphertext too short");
  const iv = raw.subarray(0, 12);
  const data = raw.subarray(12);
  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv: iv as any },
    key as unknown as CryptoKey,
    data as any,
  );
  return new TextDecoder().decode(decrypted);
}

/** Unwrap a base64url-encoded category key into an AES-GCM key. */
async function unwrapWrappedKey(wrappedKeyB64: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const plaintext = await aesGcmDecrypt(wrappedKeyB64, wrappingKey);
  const keyBytes = base64UrlToBytes(plaintext);
  if (keyBytes.length !== 32) throw new Error("Unwrapped key has invalid length");
  return (await subtle.importKey("raw", keyBytes as any, { name: "AES-GCM" }, false, ["decrypt", "encrypt"])) as unknown as CryptoKey;
}

/** Decrypt one encrypted field value, preserving values that cannot be read. */
async function decryptFieldValue(value: unknown, category: EncryptedApiCategory, table: string, field: string, dek: CryptoKey): Promise<any> {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value !== "string") return value;
  if (!value.startsWith(ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX)) return value;
  const ciphertext = value.slice(ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX.length);
  try {
    return await aesGcmDecrypt(ciphertext, dek);
  } catch {
    return value;
  }
}

/** Decrypt all category fields for a single record. */
async function decryptRecord(
  record: any,
  category: EncryptedApiCategory,
  table: string,
  dek: CryptoKey,
): Promise<any> {
  const fields = CATEGORY_DECRYPT_FIELDS[category]?.[table];
  if (!fields) return record;
  const result: any = { ...record };
  for (const field of fields) {
    if (result[field] !== undefined) {
      result[field] = await decryptFieldValue(result[field], category, table, field, dek);
    }
  }
  return result;
}

/**
 * Middleware: require a normal local session for management endpoints.
 */
async function requireSession(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const user = await resolveUserFromToken(token);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", String(user.id));
  await next();
}

/**
 * Middleware: authenticate an Encrypted API grant token for read-only data endpoints.
 */
async function authenticateGrant(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  const parsed = parseGrantToken(token);
  if (!parsed) return c.json({ error: "Unauthorized" }, 401);

  // Resolve the owner through the grant index instead of scanning every user.
  const foundUserId = findGrantOwner(parsed.grantId);
  if (!foundUserId) return c.json({ error: "Unauthorized" }, 401);
  const foundGrant = getTableRows("encrypted_api_grants", foundUserId).find(
    (grant: any) => grant.id === parsed.grantId,
  );
  if (!foundGrant) return c.json({ error: "Unauthorized" }, 401);

  // Verify token hash (SHA-256 of secret), rejecting malformed stored hashes.
  if (
    typeof foundGrant.token_hash !== "string" ||
    !TOKEN_HASH_PATTERN.test(foundGrant.token_hash)
  ) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const secretBytes = base64UrlToBytes(parsed.secretB64Url);
  const tokenHash = await sha256Hex(secretBytes);
  if (!crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(foundGrant.token_hash))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Check expiry
  if (new Date(foundGrant.expires_at) <= new Date()) {
    return c.json({ error: "Token expired" }, 401);
  }

  // Check revocation
  if (foundGrant.revoked_at) {
    return c.json({ error: "Token revoked" }, 401);
  }

  const categories = Array.isArray(foundGrant.categories) ? foundGrant.categories : [];
  if (!categories.every((c: unknown) => ENCRYPTED_API_CATEGORIES.includes(c as EncryptedApiCategory))) {
    return c.json({ error: "Invalid grant categories" }, 401);
  }

  const owner = getUserById(foundUserId);
  if (
    !owner ||
    owner.suspended ||
    owner.status === "suspended" ||
    !owner.auth_verifier
  ) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", foundUserId);
  c.set("grant", {
    user_id: foundUserId,
    categories: categories as EncryptedApiCategory[],
    wrapped_keys: foundGrant.wrapped_keys || {},
  });
  c.set("secretB64Url", parsed.secretB64Url);
  await next();

  // Only record usage after the downstream read succeeds.
  if (c.res.status < 400) {
    updateTable(
      "encrypted_api_grants",
      [{ field: "id", operator: "eq", value: foundGrant.id }],
      { last_used_at: new Date().toISOString() },
      foundUserId,
    );
  }
}

// ---------------------------------------------------------------------------
// Management: category key ring (session auth)
// ---------------------------------------------------------------------------

router.get(
  "/category-keys",
  authLimiter,
  requireSession,
  async (c) => {
    const userId = c.get("userId");
    const rows = getTableRows("encrypted_api_category_keys", userId);
    return c.json({
      keys: rows.map((r: any) => ({
        category: r.category,
        version: r.version,
        wrapped_key: r.wrapped_key,
      })),
    });
  },
);

router.put(
  "/category-keys/:category",
  authLimiter,
  requireSession,
  async (c) => {
    const userId = c.get("userId");
    const category = (c.req.param("category") || "").toLowerCase() as EncryptedApiCategory;
    if (!ENCRYPTED_API_CATEGORIES.includes(category)) {
      return c.json({ error: "Unsupported category" }, 400);
    }
    const body = normalizeJsonBody(await c.req.json().catch(() => ({})));
    const { version, wrapped_key } = body;
    if (version !== 1 || typeof wrapped_key !== "string") {
      return c.json({ error: "Invalid wrapped key envelope" }, 400);
    }
    const now = new Date().toISOString();
    const existing = getTableRows("encrypted_api_category_keys", userId).find((r: any) => r.category === category);
    if (existing) {
      updateTable(
        "encrypted_api_category_keys",
        [{ field: "id", operator: "eq", value: existing.id }],
        { wrapped_key, updated_at: now },
        userId,
      );
    } else {
      insertTable(
        "encrypted_api_category_keys",
        {
          id: category,
          user_id: userId,
          category,
          version: 1,
          wrapped_key,
          created_at: now,
          updated_at: now,
        },
        userId,
      );
    }
    return c.json({ success: true });
  },
);

// ---------------------------------------------------------------------------
// Management: grants (session auth)
// ---------------------------------------------------------------------------

router.get(
  "/keys",
  authLimiter,
  requireSession,
  async (c) => {
    const userId = c.get("userId");
    const rows = getTableRows("encrypted_api_grants", userId);
    const safe: EncryptedApiGrant[] = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      token_prefix: r.token_prefix,
      categories: r.categories,
      created_at: r.created_at,
      expires_at: r.expires_at,
      last_used_at: r.last_used_at,
      revoked_at: r.revoked_at,
    }));
    return c.json({ keys: safe });
  },
);

router.post(
  "/keys",
  authLimiter,
  requireSession,
  async (c) => {
    const userId = c.get("userId");
    const body = normalizeJsonBody(await c.req.json().catch(() => ({})));
    const { name, categories, expires_at, token_hash, token_prefix, wrapped_keys } =
      body as Partial<CreateEncryptedApiGrantRequest> & {
        token_hash?: string;
        token_prefix?: string;
        wrapped_keys?: Record<string, string>;
      };

    if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
      return c.json({ error: "Invalid key name" }, 400);
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      return c.json({ error: "Select at least one data category" }, 400);
    }
    const validCategories = categories.filter((c: unknown) =>
      ENCRYPTED_API_CATEGORIES.includes(c as EncryptedApiCategory),
    );
    if (validCategories.length !== categories.length) {
      return c.json({ error: "Unsupported category in selection" }, 400);
    }
    if (!expires_at || isNaN(new Date(expires_at).getTime()) || new Date(expires_at) <= new Date()) {
      return c.json({ error: "Expiry must be in the future" }, 400);
    }
    if (new Date(expires_at).getTime() - Date.now() > ENCRYPTED_API_MAX_KEY_AGE_MS) {
      return c.json({ error: "Expiry too far in the future" }, 400);
    }
    if (!token_hash || typeof token_hash !== "string") {
      return c.json({ error: "Token hash is required" }, 400);
    }
    if (!TOKEN_HASH_PATTERN.test(token_hash)) {
      return c.json({ error: "Invalid token hash" }, 400);
    }
    if (!token_prefix || typeof token_prefix !== "string") {
      return c.json({ error: "Token prefix is required" }, 400);
    }
    if (
      !wrapped_keys ||
      typeof wrapped_keys !== "object" ||
      Array.isArray(wrapped_keys)
    ) {
      return c.json({ error: "Wrapped keys are required" }, 400);
    }
    for (const category of categories) {
      const wrappedKey = (wrapped_keys as Record<string, unknown>)[category];
      if (typeof wrappedKey !== "string" || wrappedKey.length === 0) {
        return c.json({ error: `Missing wrapped key for ${category}` }, 400);
      }
    }

    const grantId = crypto.randomUUID();
    const now = new Date().toISOString();
    const grant: Record<string, any> = {
      id: grantId,
      user_id: userId,
      name: name.trim(),
      token_prefix,
      token_hash,
      categories: validCategories,
      wrapped_keys,
      created_at: now,
      expires_at,
      revoked_at: null,
      last_used_at: null,
    };
    ensureGrantIndexSeeded();
    insertTable("encrypted_api_grants", grant, userId);
    insertTable(
      GRANT_INDEX_TABLE,
      {
        id: grantId,
        user_id: userId,
        created_at: now,
      },
      userId,
    );
    grantOwnerIndex.set(grantId, userId);

    const safe: EncryptedApiGrant = {
      id: grantId,
      name: name.trim(),
      token_prefix,
      categories: validCategories,
      created_at: now,
      expires_at,
      last_used_at: null,
      revoked_at: null,
    };
    return c.json({ grant: safe }, 201);
  },
);

router.delete(
  "/keys/:id",
  authLimiter,
  requireSession,
  async (c) => {
    const userId = c.get("userId");
    const grantId = c.req.param("id");
    if (!grantId) return c.json({ error: "Grant ID is required" }, 400);
    const rows = getTableRows("encrypted_api_grants", userId);
    const existing = rows.find((r: any) => r.id === grantId);
    if (!existing) return c.json({ error: "Grant not found" }, 404);
    updateTable(
      "encrypted_api_grants",
      [{ field: "id", operator: "eq", value: grantId }],
      { revoked_at: new Date().toISOString() },
      userId,
    );
    grantOwnerIndex.delete(grantId);
    return c.json({ success: true });
  },
);

// ---------------------------------------------------------------------------
// Data read endpoints (grant token auth)
// ---------------------------------------------------------------------------

router.get(
  "/characters",
  dataLimiter,
  authenticateGrant,
  async (c) => {
    const grant = c.get("grant");
    if (!grant.categories.includes("characters")) {
      return c.json({ error: "Category not authorized" }, 403);
    }
    const result = await readCategoryData(c, "characters", grant);
    return result instanceof Response ? result : c.json(result);
  },
);

router.get(
  "/data-save",
  dataLimiter,
  authenticateGrant,
  async (c) => {
    const grant = c.get("grant");
    if (!grant.categories.includes("data_save")) {
      return c.json({ error: "Category not authorized" }, 403);
    }
    const result = await readCategoryData(c, "data_save", grant);
    return result instanceof Response ? result : c.json(result);
  },
);

router.get(
  "/chatbot",
  dataLimiter,
  authenticateGrant,
  async (c) => {
    const grant = c.get("grant");
    if (!grant.categories.includes("chatbot")) {
      return c.json({ error: "Category not authorized" }, 403);
    }
    const result = await readCategoryData(c, "chatbot", grant);
    return result instanceof Response ? result : c.json(result);
  },
);

/**
 * Collect, sort, paginate and decrypt the records visible to a grant.
 * Returns a 403 Response when the grant has no key for the category.
 */
async function readCategoryData(
  c: Context,
  category: EncryptedApiCategory,
  grant: {
    user_id: string;
    categories: EncryptedApiCategory[];
    wrapped_keys: Record<string, string>;
  },
) {
  const userId = grant.user_id;
  const tables = CATEGORY_TABLES[category];
  const rawLimit = Number.parseInt(
    c.req.query("limit") || String(ENCRYPTED_API_DEFAULT_PAGE_SIZE),
    10,
  );
  const limit = Number.isFinite(rawLimit)
    ? rawLimit < 0
      ? ENCRYPTED_API_DEFAULT_PAGE_SIZE
      : Math.min(rawLimit, ENCRYPTED_API_MAX_PAGE_SIZE)
    : ENCRYPTED_API_DEFAULT_PAGE_SIZE;
  const rawOffset = Number.parseInt(c.req.query("offset") || "0", 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  // Derive wrapping key from the grant secret, unwrap the category DEK
  const wrappedB64 = grant.wrapped_keys[category];
  if (!wrappedB64) {
    return c.json({ error: "No wrapped key for category" }, 403);
  }
  let dek: CryptoKey;
  try {
    const secretB64Url = c.get("secretB64Url");
    const wrappingKey = await deriveGrantWrappingKey(secretB64Url);
    dek = await unwrapWrappedKey(wrappedB64, wrappingKey);
  } catch (error) {
    console.error("Unable to unwrap encrypted API category key", error);
    return c.json({ error: "Unable to decrypt category key" }, 403);
  }

  const allData: Array<{ record: any; table: string }> = [];
  for (const table of tables) {
    const filePath = getTableFilePath(table, userId);
    if (!filePath) continue;
    const rows = readJsonFile<any[]>(filePath, []);
    for (const row of rows) {
      if (String(row.user_id) !== userId) continue;
      allData.push({ record: row, table });
    }
  }

  // Deterministic ordering by created_at desc, then id
  allData.sort((a, b) => {
    const aa = a.record.created_at || "";
    const bb = b.record.created_at || "";
    if (bb > aa) return -1;
    if (aa > bb) return 1;
    return String(a.record.id || "").localeCompare(String(b.record.id || ""));
  });

  const pagedEntries = allData.slice(offset, offset + limit);
  const paginated = await Promise.all(
    pagedEntries.map(async ({ record, table }) => {
      const decrypted = await decryptRecord(record, category, table, dek);
      return { ...decrypted, table };
    }),
  );
  const hasMore = limit > 0 && offset + limit < allData.length;

  return {
    data: paginated,
    category,
    pagination: {
      limit,
      offset,
      count: allData.length,
      has_more: hasMore,
    },
    note:
      "Encrypted fields are decrypted using the delegated data key for this grant. Password Vault and AI-provider credentials are never included.",
  };
}

export const encryptedAccessRouter = router;
