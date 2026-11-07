import {
  AES_KEY_BYTES,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decryptAes256Gcm,
  encryptAes256Gcm,
  generateAes256Key,
  isCategoryEncryptionEnabled,
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

/** Error raised when an encrypted-access HTTP request is rejected. */
export class EncryptedAccessRequestError extends Error {
  readonly status: number;
  readonly serverError?: string;

  constructor(status: number, message: string, serverError?: string) {
    super(message);
    this.name = "EncryptedAccessRequestError";
    this.status = status;
    this.serverError = serverError;
  }
}

/** Return the runtime fetch implementation or fail clearly when unavailable. */
function getFetch(): typeof fetch {
  if (typeof fetch !== "function") {
    throw new Error("Fetch is not available in this environment");
  }
  return fetch;
}

/** Send an authenticated encrypted-access request and parse its JSON response. */
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
    let serverError: string | undefined;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.error === "string") serverError = parsed.error;
    } catch {
      // Non-JSON error bodies are intentionally not exposed to the user.
    }
    throw new EncryptedAccessRequestError(
      response.status,
      `Encrypted API access request failed (${response.status})${body ? `: ${body}` : ""}`,
      serverError,
    );
  }
  return (await response.json()) as T;
}

/** Ensure a usable 256-bit master key was provided. */
function validateMasterKey(masterKey: Uint8Array): void {
  if (!(masterKey instanceof Uint8Array) || masterKey.length !== AES_KEY_BYTES) {
    throw new Error("A 32-byte master key is required");
  }
}

/** Cache a category key, zeroizing any key it replaces. */
function setCachedCategoryKey(category: EncryptedApiCategory, key: Uint8Array): void {
  const previous = categoryKeys.get(category);
  if (previous && previous !== key) zeroizeBytes(previous);
  categoryKeys.set(category, new Uint8Array(key));
}

/** Decrypt and decode a category data key wrapped by the master key. */
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

/** Fetch and unwrap every provisioned category data key into the cache. */
async function fetchCategoryKeys(masterKey: Uint8Array): Promise<void> {
  validateMasterKey(masterKey);
  const response = await encryptedAccessRequest<{
    keys: Array<{ category: string; version: number; wrapped_key: string }>;
  }>("/api/encrypted-access/category-keys");
  const rows = Array.isArray(response?.keys) ? response.keys : [];

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
  try {
    await categoryKeysRequest;
  } catch (error) {
    // An unavailable endpoint with an empty cache cannot prove the category is
    // provisioned, so legacy master-key encryption remains safe to use.
    if (
      error instanceof TypeError ||
      (error instanceof EncryptedAccessRequestError &&
        (error.status === 404 || error.status === 405 || error.status >= 500))
    ) {
      return null;
    }
    throw error;
  }
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

/** Check whether a value uses the category data-key envelope format. */
export function isV2Encrypted(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(ENCRYPTED_DATA_KEY_ENVELOPE_PREFIX)
  );
}

/**
 * Encrypt a field with the category key when that category is enabled,
 * otherwise leave it in plaintext.
 */
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
  if (!isCategoryEncryptionEnabled(category)) return value;

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

/** Decrypt a category-encrypted field, preserving values that cannot be read. */
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
    {
      table: "universes",
      fields: ["name", "short_description", "display_name", "description", "lore"],
    },
    {
      table: "races",
      fields: ["name", "short_description", "display_name", "description", "traits"],
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

/** Build the encrypted replacement values for a single row. */
async function buildCategoryUpdates(
  row: MigrationRow,
  fields: string[],
  category: EncryptedApiCategory,
  masterKey: Uint8Array,
): Promise<Record<string, any>> {
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
  return updates;
}

/**
 * Update one row while conditioning the write on the values observed during
 * the read. When another writer wins the race, re-read the row and retry with
 * its latest values.
 */
async function updateLegacyRow(
  client: any,
  table: string,
  rowId: string,
  fields: string[],
  category: EncryptedApiCategory,
  masterKey: Uint8Array,
  initialRow?: MigrationRow,
): Promise<boolean> {
  const maxAttempts = 3;
  let observedRow = initialRow;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!observedRow) {
      const { data: rows, error } = await client
        .from(table)
        .select("*")
        .eq("id", rowId);
      if (error) throw error;
      const current = Array.isArray(rows) ? rows[0] : rows;
      if (!current) return false;
      observedRow = current as MigrationRow;
    }

    const updates = await buildCategoryUpdates(
      observedRow,
      fields,
      category,
      masterKey,
    );
    if (Object.keys(updates).length === 0) return false;

    let updateQuery = client.from(table).update(updates).eq("id", rowId);
    for (const field of Object.keys(updates)) {
      if (observedRow[field] !== undefined) {
        updateQuery = updateQuery.eq(field, observedRow[field]);
      }
    }
    if (observedRow.updated_at !== undefined) {
      updateQuery = updateQuery.eq("updated_at", observedRow.updated_at);
    }

    const { data: updated, error: updateError } = await updateQuery;
    if (updateError) throw updateError;
    if (!Array.isArray(updated) || updated.length > 0) return true;

    // The observed row state no longer matched; retry from fresh values.
    observedRow = undefined;
  }

  throw new Error(
    `Unable to migrate ${table} row ${rowId}: it was modified concurrently`,
  );
}

/** Migrate every matching row of a table, retrying any conflict-safe writes. */
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
    if (
      await updateLegacyRow(
        client,
        table,
        row.id,
        fields,
        category,
        masterKey,
        row,
      )
    ) {
      updatedCount++;
    }
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
  if (!isCategoryEncryptionEnabled(category)) return { updatedCount: 0 };
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
        if (
          await updateLegacyRow(
            db,
            "chatbot_messages",
            message.id,
            ["content", "reasoning"],
            category,
            masterKey,
            message,
          )
        ) {
          messageCount++;
        }
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

  const response = await encryptedAccessRequest<{
    keys: Array<{ category: string; version: number; wrapped_key: string }>;
  }>("/api/encrypted-access/category-keys");
  const rows = Array.isArray(response?.keys) ? response.keys : [];
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

/** Encode bytes as unpadded base64url for use in grant tokens. */
function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Derive the AES key that wraps category keys for a grant secret. */
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
