import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptServerKey,
  decryptServerKey,
  maskApiKey,
  setUserApiKey,
  getUserApiKey,
  getAllUserApiKeys,
  deleteUserApiKey,
} from "./userApiKeys.ts";

describe("Server-Side API Key Encryption & Management", () => {
  it("correctly masks API keys for safe UI display", () => {
    expect(maskApiKey("sk-proj-1234567890abcdef")).toBe("sk-proj...cdef");
    expect(maskApiKey("xai-12345678")).toBe("xai-...78");
    expect(maskApiKey("short")).toBe("sh...");
    expect(maskApiKey("")).toBe("");
  });

  it("encrypts and decrypts API keys with AES-256-GCM authenticated encryption", () => {
    const rawKey = "sk-test-secret-key-123456789";
    const { encrypted_key, prefix } = encryptServerKey(rawKey);

    expect(encrypted_key).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(prefix).toBe(maskApiKey(rawKey));

    const decrypted = decryptServerKey(encrypted_key);
    expect(decrypted).toBe(rawKey);
  });

  it("fails gracefully and returns null on corrupted or invalid ciphertext", () => {
    expect(decryptServerKey("invalid-format")).toBeNull();
    expect(decryptServerKey("v1:badiv:badtag:badcipher")).toBeNull();
  });

  it("stores, retrieves, lists, and deletes API keys per user", async () => {
    const testUserId = "test-user-" + Date.now();
    const provider = "openai";
    const key = "sk-test-user-openai-key-99999";

    // Set key
    const saveRes = await setUserApiKey(testUserId, provider, key);
    expect(saveRes.success).toBe(true);
    expect(saveRes.provider).toBe("openai");

    // Retrieve decrypted key
    const retrievedKey = await getUserApiKey(testUserId, provider);
    expect(retrievedKey).toBe(key);

    // List keys (masked)
    const allKeys = await getAllUserApiKeys(testUserId);
    expect(allKeys.length).toBeGreaterThanOrEqual(1);
    const found = allKeys.find((k) => k.provider === provider);
    expect(found).toBeDefined();
    expect(found?.prefix).toBe(maskApiKey(key));

    // Delete key
    await deleteUserApiKey(testUserId, provider);
    const afterDelete = await getUserApiKey(testUserId, provider);
    expect(afterDelete).toBeNull();
  });
});
