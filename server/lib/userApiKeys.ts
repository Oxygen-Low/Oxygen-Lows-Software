import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, queryTable, upsertTable, deleteTable, DataFilter } from "./dataStore.ts";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

let cachedServerSecretKey: Buffer | null = null;

/**
 * Derives or retrieves a 32-byte master encryption key for server-side API key encryption.
 */
export function getServerEncryptionKey(): Buffer {
  if (cachedServerSecretKey) return cachedServerSecretKey;

  const envSecret =
    process.env.SERVER_API_KEY_ENCRYPTION_SECRET ||
    process.env.SERVER_ENCRYPTION_SECRET ||
    process.env.ENCRYPTION_KEY;

  if (envSecret && envSecret.trim().length >= 16) {
    cachedServerSecretKey = crypto
      .createHash("sha256")
      .update(envSecret.trim())
      .digest();
    return cachedServerSecretKey;
  }

  // Persist a server vault key on disk under Data directory
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const vaultKeyPath = path.join(DATA_DIR, ".server_vault_key");
    if (fs.existsSync(vaultKeyPath)) {
      const hex = fs.readFileSync(vaultKeyPath, "utf-8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(hex)) {
        cachedServerSecretKey = Buffer.from(hex, "hex");
        return cachedServerSecretKey;
      }
    }

    const generatedBytes = crypto.randomBytes(32);
    try {
      fs.writeFileSync(vaultKeyPath, generatedBytes.toString("hex"), {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch {}
    cachedServerSecretKey = generatedBytes;
    return cachedServerSecretKey;
  } catch {
    // Fallback in-memory key if disk access fails
    cachedServerSecretKey = crypto.createHash("sha256").update("oxygen_low_server_fallback_key").digest();
    return cachedServerSecretKey;
  }
}

/**
 * Creates a safe display prefix / fingerprint for an API key.
 */
export function maskApiKey(rawKey: string): string {
  if (!rawKey || typeof rawKey !== "string") return "";
  const clean = rawKey.trim();
  if (clean.length >= 16) {
    return `${clean.slice(0, 7)}...${clean.slice(-4)}`;
  }
  if (clean.length >= 8) {
    return `${clean.slice(0, 4)}...${clean.slice(-2)}`;
  }
  return `${clean.slice(0, 2)}...`;
}

/**
 * Encrypts a plaintext API key with the server's AES-256-GCM master key.
 */
export function encryptServerKey(rawKey: string): {
  encrypted_key: string;
  prefix: string;
} {
  const clean = rawKey.trim();
  if (!clean) throw new Error("API key cannot be empty");

  const key = getServerEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(clean, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Serialized format: v1:base64(iv):base64(authTag):base64(ciphertext)
  const serialized = `v1:${iv.toString("base64")}:${authTag.toString(
    "base64",
  )}:${encrypted.toString("base64")}`;

  return {
    encrypted_key: serialized,
    prefix: maskApiKey(clean),
  };
}

/**
 * Decrypts a server-encrypted API key string back into plaintext.
 */
export function decryptServerKey(serialized: string): string | null {
  if (!serialized || typeof serialized !== "string") return null;

  // Handle v1 serialized format
  if (serialized.startsWith("v1:")) {
    try {
      const parts = serialized.split(":");
      if (parts.length !== 4) return null;
      const iv = Buffer.from(parts[1], "base64");
      const authTag = Buffer.from(parts[2], "base64");
      const ciphertext = Buffer.from(parts[3], "base64");

      const key = getServerEncryptionKey();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Stores or updates a user's server-encrypted API key for a provider.
 */
export async function setUserApiKey(
  userId: string | number,
  provider: string,
  rawKey: string,
): Promise<{ success: boolean; prefix: string; provider: string }> {
  const cleanUserId = String(userId).trim();
  const cleanProvider = provider.toLowerCase().trim();
  const cleanKey = rawKey.trim();

  if (!cleanUserId) throw new Error("User ID is required");
  if (!cleanProvider) throw new Error("Provider is required");
  if (!cleanKey) throw new Error("API key is required");

  const { encrypted_key, prefix } = encryptServerKey(cleanKey);
  const now = new Date().toISOString();

  // Query existing record to preserve ID if present
  const existing = await queryTable({
    table: "user_api_keys",
    userId: cleanUserId,
    filters: [{ column: "provider", op: "eq", value: cleanProvider }],
    single: true,
  });

  const record = {
    id: existing?.id || crypto.randomUUID(),
    user_id: cleanUserId,
    provider: cleanProvider,
    encrypted_key,
    prefix,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  await upsertTable("user_api_keys", record, cleanUserId, "provider");

  return {
    success: true,
    provider: cleanProvider,
    prefix,
  };
}

/**
 * Retrieves the decrypted API key for a specific user and provider.
 */
export async function getUserApiKey(
  userId: string | number,
  provider: string,
): Promise<string | null> {
  const cleanUserId = String(userId).trim();
  const cleanProvider = provider.toLowerCase().trim();
  if (!cleanUserId || !cleanProvider) return null;

  const result = await queryTable({
    table: "user_api_keys",
    userId: cleanUserId,
    filters: [{ column: "provider", op: "eq", value: cleanProvider }],
    single: true,
  });

  if (!result || !result.encrypted_key) return null;
  return decryptServerKey(result.encrypted_key);
}

/**
 * Lists all configured API key metadata for a user (without exposing raw keys).
 */
export async function getAllUserApiKeys(
  userId: string | number,
): Promise<Array<{ id: string; provider: string; prefix: string; updated_at: string }>> {
  const cleanUserId = String(userId).trim();
  if (!cleanUserId) return [];

  const records = (await queryTable({
    table: "user_api_keys",
    userId: cleanUserId,
  })) as any[];

  if (!Array.isArray(records)) return [];

  return records.map((r) => ({
    id: r.id || `${r.provider}`,
    provider: r.provider,
    prefix: r.prefix || (r.encrypted_key ? "configured" : ""),
    updated_at: r.updated_at || r.created_at || new Date().toISOString(),
  }));
}

/**
 * Deletes a stored API key for a user and provider.
 */
export async function deleteUserApiKey(
  userId: string | number,
  provider: string,
): Promise<boolean> {
  const cleanUserId = String(userId).trim();
  const cleanProvider = provider.toLowerCase().trim();
  if (!cleanUserId || !cleanProvider) return false;

  const filters: DataFilter[] = [
    { column: "provider", op: "eq", value: cleanProvider },
  ];

  await deleteTable("user_api_keys", filters, cleanUserId);

  return true;
}
