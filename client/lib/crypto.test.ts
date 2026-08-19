import { describe, it, expect, vi } from "vitest";
import {
  AES_KEY_BYTES,
  generateAes256Key,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
  bytesToBase58,
  bytesToPassphraseWords,
  formatHexChunks,
  encryptAes256Gcm,
  decryptAes256Gcm,
  importAes256GcmCryptoKey,
  getActiveCryptoKey,
  zeroizeBytes,
  AUTO_LOCK_TIMEOUT_MS,
  AUTO_LOCK_LAST_ACTIVITY_KEY,
  recordUserActivity,
  getLastUserActivity,
  setLastUserActivityForTesting,
  checkAutoLockExpiry,
  onAutoLock,
  getActiveMasterKey,
  setActiveMasterKey,
  clearActiveMasterKey,
  isCategoryEncryptionEnabled,
  setCategoryEncryptionEnabled,
  isCategoryLocked,
  parseKeyFileContent,
  isEncrypted,
  encryptField,
  decryptField,
  encryptCharacterData,
  decryptCharacterData,
  encryptDataSaveData,
  decryptDataSaveData,
  encryptDataSaveCategoryData,
  decryptDataSaveCategoryData,
  encryptChatData,
  decryptChatData,
  encryptChatMessageData,
  decryptChatMessageData,
  encryptIntegrationData,
  decryptIntegrationData,
  migrateCategoryEncryption,
} from "./crypto";

describe("Crypto Utilities (AES-256)", () => {
  it("should import non-extractable AES-GCM CryptoKey by default", async () => {
    const key = generateAes256Key();
    const cryptoKey = await importAes256GcmCryptoKey(key);
    expect(cryptoKey).toBeDefined();
    expect(cryptoKey.type).toBe("secret");
    expect(cryptoKey.algorithm.name).toBe("AES-GCM");
    expect(cryptoKey.extractable).toBe(false);
  });

  it("should encrypt and decrypt using non-extractable CryptoKey object", async () => {
    const key = generateAes256Key();
    const cryptoKey = await importAes256GcmCryptoKey(key, false);
    const plaintext = "Zero-Knowledge Protected Secret";
    const ciphertext = await encryptAes256Gcm(plaintext, cryptoKey);
    expect(ciphertext).toBeDefined();
    expect(ciphertext).not.toBe(plaintext);

    const decrypted = await decryptAes256Gcm(ciphertext, cryptoKey);
    expect(decrypted).toBe(plaintext);
  });

  it("should cache and retrieve active CryptoKey", async () => {
    const key = generateAes256Key();
    clearActiveMasterKey();
    expect(await getActiveCryptoKey()).toBeNull();

    setActiveMasterKey(key);
    const cryptoKey1 = await getActiveCryptoKey();
    expect(cryptoKey1).toBeDefined();
    expect(cryptoKey1?.extractable).toBe(false);

    // Should return cached instance
    const cryptoKey2 = await getActiveCryptoKey();
    expect(cryptoKey2).toBe(cryptoKey1);

    clearActiveMasterKey();
    expect(await getActiveCryptoKey()).toBeNull();
  });

  it("should zeroize byte arrays in memory", () => {
    const key = generateAes256Key();
    expect(key.some((b) => b !== 0)).toBe(true);
    zeroizeBytes(key);
    expect(key.every((b) => b === 0)).toBe(true);
  });

  describe("Inactivity Auto-Lock (30 minutes)", () => {
    it("should define AUTO_LOCK_TIMEOUT_MS as 30 minutes", () => {
      expect(AUTO_LOCK_TIMEOUT_MS).toBe(30 * 60 * 1000);
      expect(AUTO_LOCK_TIMEOUT_MS).toBe(1800000);
    });

    it("should update and get last user activity", () => {
      const before = Date.now();
      recordUserActivity();
      const last = getLastUserActivity();
      expect(last).toBeGreaterThanOrEqual(before);
    });

    it("should auto-lock when inactive for more than 30 minutes", () => {
      const key = generateAes256Key();
      setActiveMasterKey(key);
      expect(getActiveMasterKey()).toEqual(key);

      // Simulate inactivity older than 30 minutes
      const expiredTime = Date.now() - (AUTO_LOCK_TIMEOUT_MS + 5000);
      setLastUserActivityForTesting(expiredTime);

      let autoLockFired = false;
      const unsubscribe = onAutoLock(() => {
        autoLockFired = true;
      });

      const didLock = checkAutoLockExpiry();
      expect(didLock).toBe(true);
      expect(getActiveMasterKey()).toBeNull();
      expect(autoLockFired).toBe(true);
      unsubscribe();
    });

    it("should not auto-lock when active within 30 minutes", () => {
      const key = generateAes256Key();
      setActiveMasterKey(key);
      recordUserActivity();

      const didLock = checkAutoLockExpiry();
      expect(didLock).toBe(false);
      expect(getActiveMasterKey()).toEqual(key);
      clearActiveMasterKey();
    });
  });
  it("should generate 32 bytes (256 bits) for AES-256 key", () => {
    const key = generateAes256Key();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(AES_KEY_BYTES);
    expect(key.length * 8).toBe(256);
  });

  it("should convert bytes to hex and back accurately", () => {
    const key = generateAes256Key();
    const hex = bytesToHex(key);
    expect(hex.length).toBe(64);
    const recovered = hexToBytes(hex);
    expect(recovered).toEqual(key);
  });

  it("should convert bytes to base64 and back accurately", () => {
    const key = generateAes256Key();
    const b64 = bytesToBase64(key);
    expect(b64.length).toBe(44);
    const recovered = base64ToBytes(b64);
    expect(recovered).toEqual(key);
  });

  it("should convert bytes to base58", () => {
    const key = generateAes256Key();
    const b58 = bytesToBase58(key);
    expect(b58.length).toBeGreaterThan(30);
    expect(/^[1-9A-HJ-NP-Za-km-z]+$/.test(b58)).toBe(true);
  });

  it("should format hex chunks in 8-char blocks", () => {
    const hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const chunks = formatHexChunks(hex);
    expect(chunks.split(" ").length).toBe(8);
  });

  it("should generate passphrase words from bytes", () => {
    const key = generateAes256Key();
    const words = bytesToPassphraseWords(key);
    expect(words.split(" ").length).toBe(24);
  });

  it("should encrypt and decrypt using AES-256-GCM successfully", async () => {
    const key = generateAes256Key();
    const secretMessage = "Oxygen Low's Secure Master Key Encrypted Payload";
    const ciphertext = await encryptAes256Gcm(secretMessage, key);
    expect(ciphertext).toBeDefined();
    expect(typeof ciphertext).toBe("string");
    expect(ciphertext).not.toBe(secretMessage);

    const decrypted = await decryptAes256Gcm(ciphertext, key);
    expect(decrypted).toBe(secretMessage);
  });

  it("should fail decryption if key is incorrect", async () => {
    const key1 = generateAes256Key();
    const key2 = generateAes256Key();
    const secretMessage = "Sensitive Data";
    const ciphertext = await encryptAes256Gcm(secretMessage, key1);

    await expect(decryptAes256Gcm(ciphertext, key2)).rejects.toThrow();
  });

  it("should manage active masterkey in session storage and detect category lock", () => {
    const key = generateAes256Key();
    expect(getActiveMasterKey()).toBeNull();

    setActiveMasterKey(key);
    expect(getActiveMasterKey()).toEqual(key);

    // Characters category check
    setCategoryEncryptionEnabled("characters", true);
    expect(isCategoryEncryptionEnabled("characters")).toBe(true);
    expect(isCategoryLocked("characters")).toBe(false); // Because active key is set

    clearActiveMasterKey();
    expect(getActiveMasterKey()).toBeNull();
    expect(isCategoryLocked("characters")).toBe(true); // Locked because encryption is on but no key

    setCategoryEncryptionEnabled("characters", false);
    expect(isCategoryLocked("characters")).toBe(false); // Not locked because encryption is off
  });

  describe("parseKeyFileContent", () => {
    it("should parse full exported .key file backup format", () => {
      const key = generateAes256Key();
      const hex = bytesToHex(key);
      const b64 = bytesToBase64(key);
      const b58 = bytesToBase58(key);
      const words = bytesToPassphraseWords(key);

      const exportedFile = [
        "===========================================================",
        " Oxygen Low's Software - AES-256 Masterkey Backup",
        " Generated: " + new Date().toISOString(),
        " Algorithm: AES-256 (256-bit / 32 bytes)",
        " Entropy: 256 bits (CSPRNG hardware entropy)",
        "===========================================================",
        "",
        "[HEXADECIMAL MASTERKEY - 64 CHARACTERS]",
        hex,
        "",
        "[BASE64 MASTERKEY - 44 CHARACTERS]",
        b64,
        "",
        "[BASE58 MASTERKEY]",
        b58,
        "",
        "[24-WORD PASSPHRASE REPRESENTATION]",
        words,
        "",
        "===========================================================",
        " ZERO-KNOWLEDGE NOTICE:",
        " Store this masterkey in a secure password manager (e.g., Bitwarden,",
        " 1Password, KeePass) or offline vault.",
        " Oxygen Low's Software does not store or have access to your masterkey.",
        " If you lose your masterkey, your encrypted data cannot be recovered.",
        "===========================================================",
      ].join("\n");

      const parsed = parseKeyFileContent(exportedFile);
      expect(parsed).toEqual(key);
    });

    it("should parse raw 64-char hex strings with surrounding whitespace", () => {
      const key = generateAes256Key();
      const hex = bytesToHex(key);
      const content = `  \n\t  ${hex}  \n\n`;
      expect(parseKeyFileContent(content)).toEqual(key);
    });

    it("should parse raw 44-char base64 strings with surrounding whitespace", () => {
      const key = generateAes256Key();
      const b64 = bytesToBase64(key);
      const content = `\n  ${b64}\n  `;
      expect(parseKeyFileContent(content)).toEqual(key);
    });

    it("should handle files with UTF-8 BOM", () => {
      const key = generateAes256Key();
      const hex = bytesToHex(key);
      const content = `\uFEFF${hex}`;
      expect(parseKeyFileContent(content)).toEqual(key);
    });

    it("should extract key from custom text file containing a 64-char hex key", () => {
      const key = generateAes256Key();
      const hex = bytesToHex(key);
      const content = `My Secret Master Key:\nKey = ${hex}\nKeep this safe!`;
      expect(parseKeyFileContent(content)).toEqual(key);
    });

    it("should throw error for invalid or empty file content", () => {
      expect(() => parseKeyFileContent("")).toThrow();
      expect(() => parseKeyFileContent("random words without any valid 256-bit key")).toThrow(
        "No valid 256-bit AES masterkey found"
      );
    });
  });

  describe("isEncrypted / encryptField / decryptField", () => {
    it("should detect encrypted values by prefix", () => {
      expect(isEncrypted("ENC:aes-256-gcm:someciphertext")).toBe(true);
      expect(isEncrypted("plaintext")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted(null as any)).toBe(false);
      expect(isEncrypted(undefined as any)).toBe(false);
    });

    it("should encrypt a field and produce the ENC prefix", async () => {
      const key = generateAes256Key();
      const result = await encryptField("hello world", key);
      expect(result).toMatch(/^ENC:aes-256-gcm:/);
      expect(result).not.toContain("hello world");
    });

    it("should not double-encrypt an already-encrypted field", async () => {
      const key = generateAes256Key();
      const encrypted = await encryptField("my value", key);
      const doubleEncrypt = await encryptField(encrypted, key);
      expect(doubleEncrypt).toBe(encrypted);
    });

    it("should decrypt an encrypted field back to plaintext", async () => {
      const key = generateAes256Key();
      const plain = "super secret value";
      const encrypted = await encryptField(plain, key);
      const decrypted = await decryptField(encrypted, key);
      expect(decrypted).toBe(plain);
    });

    it("should return plaintext unchanged by decryptField when not encrypted", async () => {
      const key = generateAes256Key();
      const result = await decryptField("plaintext", key);
      expect(result).toBe("plaintext");
    });

    it("should return the value unchanged when key is null for encryptField", async () => {
      const result = await encryptField("plaintext", null);
      expect(result).toBe("plaintext");
    });

    it("should return the value unchanged when key is null for decryptField", async () => {
      const encrypted = "ENC:aes-256-gcm:somefakedata";
      const result = await decryptField(encrypted, null);
      expect(result).toBe(encrypted);
    });
  });

  describe("Character data transformers", () => {
    it("should encrypt and decrypt character data correctly", async () => {
      const key = generateAes256Key();
      const char = {
        id: "char-1",
        user_id: "user-1",
        name: "Alice",
        short_description: "A brave adventurer",
        display_name: "Alice the Brave",
        appearance: "Tall with red hair",
        personality: "Courageous",
        backstory: "Born in the mountains",
        hidden_description: "Secret details",
      };

      const encrypted = await encryptCharacterData(char, key);
      expect(encrypted.id).toBe("char-1");
      expect(encrypted.user_id).toBe("user-1");
      expect(encrypted.name).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.short_description).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.display_name).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.appearance).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.personality).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.backstory).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.hidden_description).toMatch(/^ENC:aes-256-gcm:/);

      const decrypted = await decryptCharacterData(encrypted, key);
      expect(decrypted.name).toBe("Alice");
      expect(decrypted.short_description).toBe("A brave adventurer");
      expect(decrypted.appearance).toBe("Tall with red hair");
      expect(decrypted.personality).toBe("Courageous");
      expect(decrypted.backstory).toBe("Born in the mountains");
      expect(decrypted.hidden_description).toBe("Secret details");
    });

    it("should handle null/undefined fields gracefully in character data", async () => {
      const key = generateAes256Key();
      const char = { id: "char-2", name: "Bob", short_description: null, appearance: undefined };
      const encrypted = await encryptCharacterData(char, key);
      expect(encrypted.name).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.short_description).toBeNull();
      expect(encrypted.appearance).toBeUndefined();
    });
  });

  describe("DataSave data transformers", () => {
    it("should encrypt and decrypt data save fields correctly", async () => {
      const key = generateAes256Key();
      const save = { id: "save-1", key_name: "myKey", content: "myValue", user_id: "u1" };
      const encrypted = await encryptDataSaveData(save, key);
      expect(encrypted.key_name).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.content).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.id).toBe("save-1");
      expect(encrypted.user_id).toBe("u1");

      const decrypted = await decryptDataSaveData(encrypted, key);
      expect(decrypted.key_name).toBe("myKey");
      expect(decrypted.content).toBe("myValue");
    });

    it("should encrypt and decrypt data save category name", async () => {
      const key = generateAes256Key();
      const cat = { id: "cat-1", name: "My Category", user_id: "u1" };
      const encrypted = await encryptDataSaveCategoryData(cat, key);
      expect(encrypted.name).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.id).toBe("cat-1");

      const decrypted = await decryptDataSaveCategoryData(encrypted, key);
      expect(decrypted.name).toBe("My Category");
    });
  });

  describe("Chat data transformers", () => {
    it("should encrypt and decrypt chat title correctly", async () => {
      const key = generateAes256Key();
      const chat = { id: "chat-1", title: "My Chat Title", user_id: "u1" };
      const encrypted = await encryptChatData(chat, key);
      expect(encrypted.title).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.id).toBe("chat-1");

      const decrypted = await decryptChatData(encrypted, key);
      expect(decrypted.title).toBe("My Chat Title");
    });

    it("should encrypt and decrypt chat message content and reasoning", async () => {
      const key = generateAes256Key();
      const msg = {
        id: "msg-1",
        chat_id: "chat-1",
        role: "assistant",
        content: "Hello there!",
        reasoning: "Step by step reasoning...",
      };
      const encrypted = await encryptChatMessageData(msg, key);
      expect(encrypted.content).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.reasoning).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.id).toBe("msg-1");
      expect(encrypted.role).toBe("assistant");

      const decrypted = await decryptChatMessageData(encrypted, key);
      expect(decrypted.content).toBe("Hello there!");
      expect(decrypted.reasoning).toBe("Step by step reasoning...");
    });

    it("should handle null reasoning gracefully", async () => {
      const key = generateAes256Key();
      const msg = { id: "msg-2", content: "Hello", reasoning: null };
      const encrypted = await encryptChatMessageData(msg, key);
      expect(encrypted.reasoning).toBeNull();
      const decrypted = await decryptChatMessageData(encrypted, key);
      expect(decrypted.reasoning).toBeNull();
    });
  });

  describe("Integration data transformers", () => {
    it("should encrypt and decrypt integration api_key and base_url", async () => {
      const key = generateAes256Key();
      const item = {
        id: "int-1",
        user_id: "u1",
        provider: "openai",
        name: "OpenAI / ChatGPT",
        api_key: "sk-proj-test-12345",
        base_url: "https://api.openai.com/v1",
      };

      const encrypted = await encryptIntegrationData(item, key);
      expect(encrypted.api_key).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.base_url).toMatch(/^ENC:aes-256-gcm:/);
      expect(encrypted.provider).toBe("openai");

      const decrypted = await decryptIntegrationData(encrypted, key);
      expect(decrypted.api_key).toBe("sk-proj-test-12345");
      expect(decrypted.base_url).toBe("https://api.openai.com/v1");
      expect(decrypted.provider).toBe("openai");
    });

    it("should support integrations category encryption toggles", () => {
      setCategoryEncryptionEnabled("integrations", true);
      expect(isCategoryEncryptionEnabled("integrations")).toBe(true);
      setCategoryEncryptionEnabled("integrations", false);
      expect(isCategoryEncryptionEnabled("integrations")).toBe(false);
    });

    it("should migrate integrations category data", async () => {
      const key = generateAes256Key();
      const mockItems = [
        { id: "1", provider: "openai", api_key: "sk-plain-1", base_url: null },
      ];

      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: any) => resolve({ data: mockItems, error: null })),
        }),
      };

      const result = await migrateCategoryEncryption({
        category: "integrations",
        enable: true,
        keyBytes: key,
        userId: "u1",
        client: mockDb as any,
      });

      expect(result.updatedCount).toBe(1);
    });
  });
});
