import {
  AES_KEY_BYTES,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decryptAes256Gcm,
  encryptAes256Gcm,
  generateAes256Key,
  zeroizeBytes,
} from "./crypto";
import { db } from "./db";
import { getLocalSession } from "./localSession";
import {
  ENCRYPTED_API_CATEGORIES,
  ENCRYPTED_API_TOKEN_PREFIX,
  ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX,
  isEncryptedApiCategory,
  type CreateEncryptedApiGrantRequest,
  type EncryptedApiCategory,
  type EncryptedApiGrant,
  type WrappedDataKey,
} from "@shared/encryptedApi";

const encoder = new TextEncoder();
const categoryKeys = new Map<EncryptedApiCategory, Uint8Array>();
let categoryKeysRequest: Promise<void> | null = null;

function getFetch(): typeof fetch {
  if (typeof fetch !== "function") {
    throw new Error("Fetch is not available in this environment");
  }
  return fetch;
}

async function encryptedAccessRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getLocalSession()?.access_token;
  if (!token) throw new Error("An active session is required for encrypted API access");

  const response = await getFetch()(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Encrypted API access request failed (${response.status})${body ? `: ${body}` : ""}`,
    );
  }
  return (await response.json()) as T;
}

function validateMasterKey(masterKey: Uint8Array): void {
  if (!(masterKey instanceof Uint8Array) || masterKey.length !== AES_KEY_BYTES) {
    throw new Error("A 32-byte master key is required");
  }
}

function setCachedCategoryKey(category: EncryptedApiCategory, key: Uint8Array): void {
  const previous = categoryKeys.get(category);
  if (previous && previous !== key) zeroizeBytes(previous);
  categoryKeys.set(category, new Uint8Array(key));
}

async function unwrapCategoryKey(
  category: EncryptedApiCategory,
  wrappedKey: string,
  masterKey: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await decryptAes256Gcm(wrappedKey, masterKey);
  const key = base64ToBytes(plaintext);
  if (key.length !== AES_KEY_BYTES) {
    throw new Error(`Invalid ${category} data key length`);
  }
  return key;
}

async function fetchCategoryKeys(masterKey: Uint8Array): Promise<void> {
  validateMasterKey(masterKey);
  const rows = await encryptedAccessRequest<
    Array<{ category: string; version: number; wrapped_key: string }>
  >("/api/encrypted-access/category-keys");

  for (const row of rows) {
    if (!isEncryptedApiCategory(row.category)) continue;
    if (row.version !== 1 || typeof row.wrapped_key !== "string") {
      throw new Error(`Unsupported ${row.category} data key envelope`);
    }
    setCachedCategoryKey(
      row.category,
      await unwrapCategoryKey(row.category, row.wrapped_key, masterKey),
    );
  }
}

/** Clear and zeroize all cached category data keys. */
export function clearCategoryDataKeyCache(): void {
  for (const key of categoryKeys.values()) zeroizeBytes(key);
  categoryKeys.clear();
  categoryKeysRequest = null;
}

/**
 * Fetch and unwrap a category DEK without creating one. Returns null when the
 * category has not been provisioned. This is intentionally separate from
 * ensureCategoryDataKey so normal offline reads/writes retain legacy behavior.
 */
export async function getCategoryDataKey(
  category: EncryptedApiCategory,
  masterKey: Uint8Array,
): Promise<Uint8Array | null> {
  if (!isEncryptedApiCategory(category)) {
    throw new Error("Unsupported encrypted API category");
  }
  validateMasterKey(masterKey);
  const cached = categoryKeys.get(category);
  if (cached) return new Uint8Array(cached);

  if (!categoryKeysRequest) {
    categoryKeysRequest = fetchCategoryKeys(masterKey).finally(() => {
      categoryKeysRequest = null;
    });
  }
  await categoryKeysRequest;
  const fetched = categoryKeys.get(category);
  return fetched ? new Uint8Array(fetched) : null;
}

/** Fetch an existing category DEK or create and persist an independent one. */
export async function ensureCategoryDataKey(
  category: EncryptedApiCategory,
  masterKey: Uint8Array,
): Promise<Uint8Array> {
  const existing = await getCategoryDataKey(category, masterKey);
  if (existing) return existing;

  const key = generateAes256Key();
  const wrappedKey = await encryptAes256Gcm(bytesToBase64(key), masterKey);
  const envelope: WrappedDataKey = { version: 1, wrapped_key: wrappedKey };
  await encryptedAccessRequest(
    `/api/encrypted-access/category-keys/${encodeURIComponent(category)}`,
    { method: "PUT", body: JSON.stringify(envelope) },
  );
  setCachedCategoryKey(category, key);
  zeroizeBytes(key);
  return getCategoryDataKey(category, masterKey) as Promise<Uint8Array>;
}

/** Internal best-effort lookup used by the existing category transformers. */
export async function getAvailableCategoryDataKey(
  category: EncryptedApiCategory,
  masterKey: Uint8Array,
): Promise<Uint8Array | null> {
  const cached = categoryKeys.get(category);
  if (cached) return new Uint8Array(cached);
  if (!getLocalSession()?.access_token || typeof fetch !== "function") return null;
  return getCategoryDataKey(category, masterKey);
}

export function isV2Encrypted(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX)
  );
}

export async function encryptCategoryField(
  value: string | null | undefined,
  masterKey: Uint8Array | null | undefined,
  category: EncryptedApiCategory,
): Promise<string | null | undefined> {
  if (value === null || value === undefined || value === "") return value;
  if (!masterKey) return value;
  if (
    value.startsWith("ENC:aes-256-gcm:") ||
    isV2Encrypted(value)
  ) {
    return value;
  }

  const dataKey = await getAvailableCategoryDataKey(category, masterKey);
  if (!dataKey) {
    const ciphertext = await encryptAes256Gcm(value, masterKey);
    return `ENC:aes-256-gcm:${ciphertext}`;
  }
  try {
    const ciphertext = await encryptAes256Gcm(value, dataKey);
    return `${ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX}${ciphertext}`;
  } finally {
    zeroizeBytes(dataKey);
  }
}

export async function decryptCategoryField(
  value: string | null | undefined,
  masterKey: Uint8Array | null | undefined,
  category: EncryptedApiCategory,
): Promise<string | null | undefined> {
  if (value === null || value === undefined || value === "") return value;
  const strValue = value as string;
  if (!strValue.startsWith(ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX)) {
    if (!strValue.startsWith("ENC:aes-256-gcm:") || !masterKey) return value;
    try {
      return await decryptAes256Gcm(strValue.slice("ENC:aes-256-gcm:".length), masterKey);
    } catch (error) {
      console.warn("Failed to decrypt field:", error);
      return value;
    }
  }
  if (!masterKey) return value;

  try {
    const dataKey = await getAvailableCategoryDataKey(category, masterKey);
    if (!dataKey) return value;
    try {
      return await decryptAes256Gcm(
        strValue.slice(ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX.length),
        dataKey,
      );
    } finally {
      zeroizeBytes(dataKey);
    }
  } catch (error) {
    console.warn("Failed to decrypt field:", error);
    return value;
  }
}

interface MigrationRow {
  id: string;
  [key: string]: any;
}

const migrationTables: Record<
  EncryptedApiCategory,
  Array<{ table: string; fields: string[] }>
> = {
  characters: [
    {
      table: "characters",
      fields: [
        "name",
        "short_description",
        "display_name",
        "appearance",
        "personality",
        "backstory",
        "situation",
        "hidden_description",
        "stats",
      ],
    },
  ],
  data_save: [
    { table: "data_saves", fields: ["key_name", "content"] },
    { table: "data_save_categories", fields: ["name"] },
  ],
  chatbot: [
    { table: "chats", fields: ["title", "system_prompt"] },
    { table: "chatbot_messages", fields: ["content", "reasoning"] },
  ],
};

async function updateLegacyRows(
  client: any,
  table: string,
  fields: string[],
  category: EncryptedApiCategory,
  masterKey: Uint8Array,
  userId?: string,
): Promise<number> {
  let query = client.from(table).select("*");
  if (userId && table !== "chatbot_messages") query = query.eq("user_id", userId);
  const { data: rows, error } = await query;
  if (error) throw error;

  let updatedCount = 0;
  for (const row of (rows || []) as MigrationRow[]) {
    const updates: Record<string, any> = {};
    for (const field of fields) {
      const value = row[field];
      if (value === null || value === undefined || value === "") continue;
      if (isV2Encrypted(value)) continue;
      const plaintext = value.startsWith?.("ENC:aes-256-gcm:")
        ? await decryptAes256Gcm(value.slice("ENC:aes-256-gcm:".length), masterKey)
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
      updates[field] = await encryptCategoryField(plaintext, masterKey, category);
    }
    if (Object.keys(updates).length === 0) continue;
    const { error: updateError } = await client
      .from(table)
      .update(updates)
      .eq("id", row.id);
    if (updateError) throw updateError;
    updatedCount++;
  }
  return updatedCount;
}

/**
 * Resumably convert plaintext and legacy master-key envelopes to category DEK
 * envelopes. Already-migrated rows are skipped.
 */
export async function migrateCategoryToDataKey(
  category: EncryptedApiCategory,
  masterKey: Uint8Array,
  userId?: string,
): Promise<{ updatedCount: number }> {
  if (!isEncryptedApiCategory(category)) {
    throw new Error("Passwords and API keys do not support category data keys");
  }
  await ensureCategoryDataKey(category, masterKey);

  let updatedCount = 0;
  if (category === "chatbot") {
    let query = db.from("chats").select("id");
    if (userId) query = query.eq("user_id", userId);
    const { data: chats, error } = await query;
    if (error) throw error;
    const chatIds = (chats || []).map((chat: { id: string }) => chat.id);
    updatedCount += await updateLegacyRows(
      db,
      "chats",
      ["title", "system_prompt"],
      category,
      masterKey,
      userId,
    );
    if (chatIds.length > 0) {
      let messagesQuery = db.from("chatbot_messages").select("*").in("chat_id", chatIds);
      const { data: messages, error: messagesError } = await messagesQuery;
      if (messagesError) throw messagesError;
      let messageCount = 0;
      for (const message of messages || []) {
        const updates: Record<string, any> = {};
        for (const field of ["content", "reasoning"]) {
          const value = message[field];
          if (value === null || value === undefined || value === "" || isV2Encrypted(value)) continue;
          const plaintext = value.startsWith("ENC:aes-256-gcm:")
            ? await decryptAes256Gcm(value.slice("ENC:aes-256-gcm:".length), masterKey)
            : String(value);
          updates[field] = await encryptCategoryField(plaintext, masterKey, category);
        }
        if (Object.keys(updates).length === 0) continue;
        const { error: updateError } = await db
          .from("chatbot_messages")
          .update(updates)
          .eq("id", message.id);
        if (updateError) throw updateError;
        messageCount++;
      }
      updatedCount += messageCount;
    }
  } else {
    for (const config of migrationTables[category]) {
      updatedCount += await updateLegacyRows(
        db,
        config.table,
        config.fields,
        category,
        masterKey,
        userId,
      );
    }
  }
  return { updatedCount };
}

/** Re-wrap the persisted DEK ring without changing any encrypted user data. */
export async function rewrapCategoryDataKeys(
  oldMasterKey: Uint8Array,
  newMasterKey: Uint8Array,
): Promise<void> {
  validateMasterKey(oldMasterKey);
  validateMasterKey(newMasterKey);
  if (!getLocalSession()?.access_token || typeof fetch !== "function") return;

  const rows = await encryptedAccessRequest<
    Array<{ category: string; version: number; wrapped_key: string }>
  >("/api/encrypted-access/category-keys");
  for (const row of rows) {
    if (!isEncryptedApiCategory(row.category) || row.version !== 1) continue;
    const dataKey = await unwrapCategoryKey(row.category, row.wrapped_key, oldMasterKey);
    try {
      const wrappedKey = await encryptAes256Gcm(bytesToBase64(dataKey), newMasterKey);
      await encryptedAccessRequest(
        `/api/encrypted-access/category-keys/${encodeURIComponent(row.category)}`,
        {
          method: "PUT",
          body: JSON.stringify({ version: 1, wrapped_key: wrappedKey }),
        },
      );
      setCachedCategoryKey(row.category, dataKey);
    } finally {
      zeroizeBytes(dataKey);
    }
  }
}

export interface CreateEncryptedApiGrantInput {
  name: string;
  categories: EncryptedApiCategory[];
  expires_at: string;
  masterKey: Uint8Array;
  userId?: string;
}

export interface CreatedEncryptedApiGrant {
  token: string;
  grant: EncryptedApiGrant;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function deriveGrantWrappingKey(secret: Uint8Array): Promise<Uint8Array> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) throw new Error("Web Cryptography API is not available");
  const baseKey = await cryptoObj.subtle.importKey("raw", secret as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await cryptoObj.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("oxygen-lows-software/encrypted-api/v1"),
      info: encoder.encode("category-data-key-wrap"),
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

/** Create a grant and return its raw token; only the returned value exposes it. */
export async function createEncryptedApiGrant(
  input: CreateEncryptedApiGrantInput,
): Promise<CreatedEncryptedApiGrant> {
  validateMasterKey(input.masterKey);
  const categories = [...new Set(input.categories)];
  if (
    categories.length === 0 ||
    categories.some((category) => !isEncryptedApiCategory(category))
  ) {
    throw new Error("Grants require at least one supported category");
  }

  for (const category of categories) {
    await migrateCategoryToDataKey(category, input.masterKey, input.userId);
  }

  const secret = generateAes256Key();
  try {
    const secretBase64Url = bytesToBase64Url(secret);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", secret as BufferSource);
    const wrappingKey = await deriveGrantWrappingKey(secret);
    const wrappedKeys: CreateEncryptedApiGrantRequest["wrapped_keys"] = {};
    try {
      for (const category of categories) {
        const dataKey = await ensureCategoryDataKey(category, input.masterKey);
        try {
          wrappedKeys[category] = await encryptAes256Gcm(
            bytesToBase64(dataKey),
            wrappingKey,
          );
        } finally {
          zeroizeBytes(dataKey);
        }
      }
    } finally {
      zeroizeBytes(wrappingKey);
    }

    const request: CreateEncryptedApiGrantRequest = {
      name: input.name,
      categories,
      expires_at: input.expires_at,
      token_hash: bytesToHex(new Uint8Array(digest)),
      token_prefix: secretBase64Url.slice(0, 8),
      wrapped_keys: wrappedKeys,
    };
    const { grant } = await encryptedAccessRequest<{ grant: EncryptedApiGrant }>(
      "/api/encrypted-access/keys",
      { method: "POST", body: JSON.stringify(request) },
    );
    if (!grant?.id) throw new Error("The server did not return an encrypted API grant");
    return {
      grant,
      token: `${ENCRYPTED_API_TOKEN_PREFIX}${grant.id}.${secretBase64Url}`,
    };
  } finally {
    zeroizeBytes(secret);
  }
}

export { ENCRYPTED_API_CATEGORIES };
