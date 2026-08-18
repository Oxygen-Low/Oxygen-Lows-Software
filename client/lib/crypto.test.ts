import { describe, it, expect } from "vitest";
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
  getActiveMasterKey,
  setActiveMasterKey,
  clearActiveMasterKey,
  isCategoryEncryptionEnabled,
  setCategoryEncryptionEnabled,
  isCategoryLocked,
  parseKeyFileContent,
} from "./crypto";

describe("Crypto Utilities (AES-256)", () => {
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
});
