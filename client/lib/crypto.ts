/**
 * Cryptographic utilities for AES-256 master key generation, format conversion,
 * and AES-256-GCM client-side encryption and decryption.
 */

// 256-bit key = 32 bytes
export const AES_KEY_BYTES = 32;
export const AES_GCM_IV_BYTES = 12; // 96-bit standard nonce for AES-GCM

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Simple standard BIP-39 subset wordlist for 24-word passphrase representation
const WORDLIST = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse",
  "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act",
  "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit",
  "adult", "advance", "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent",
  "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert",
  "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter",
  "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient", "anger",
  "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique",
  "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic",
  "area", "arena", "argue", "arm", "armed", "armor", "army", "around", "arrange", "arrest",
  "arrive", "arrow", "art", "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset",
  "assist", "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction",
  "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake",
  "aware", "away", "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge",
  "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar", "barely", "bargain",
  "barrel", "base", "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become",
  "beef", "before", "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit",
  "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind", "biology",
  "bird", "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless",
  "blind", "blood", "blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body",
  "boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss",
  "bottom", "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave", "bread",
  "breeze", "brick", "bridge", "brief", "bright", "bring", "brisk", "broccoli", "broken", "bronze",
  "broom", "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb",
  "bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus", "business", "busy",
  "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call",
  "calm", "camera", "camp", "can", "canal", "cancel", "candy", "cannon", "canoe", "canvas"
];

function getCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.getRandomValues === "function") {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    return globalThis.crypto;
  }
  throw new Error("Web Cryptography API is not available in this environment");
}

/**
 * Generate a cryptographically secure 256-bit (32-byte) master key.
 */
export function generateAes256Key(): Uint8Array {
  const cryptoObj = getCrypto();
  const keyBytes = new Uint8Array(AES_KEY_BYTES);
  cryptoObj.getRandomValues(keyBytes);
  return keyBytes;
}

/**
 * Convert bytes to hexadecimal string (64 characters for 256 bits).
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/\s+/g, "").toLowerCase();
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = parseInt(cleanHex.substring(i, i + 2), 16);
    if (isNaN(byte)) throw new Error("Invalid hex character");
    bytes[i / 2] = byte;
  }
  return bytes;
}

/**
 * Convert bytes to standard Base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert bytes to Base58 string.
 */
export function bytesToBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += bytes[i];
    let carry = 0;
    for (let j = 0; j < digits.length; ++j) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += "1";
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
  return str;
}

/**
 * Convert bytes into a mnemonic passphrase (24 readable words).
 */
export function bytesToPassphraseWords(bytes: Uint8Array): string {
  const words: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const wordIndex = bytes[i] % WORDLIST.length;
    words.push(WORDLIST[wordIndex]);
  }
  return words.slice(0, 24).join(" ");
}

/**
 * Format hex string into grouped chunks for visual clarity (e.g. 8-char blocks).
 */
export function formatHexChunks(hex: string): string {
  return hex.match(/.{1,8}/g)?.join(" ") || hex;
}

export const ACTIVE_MASTER_KEY_STORAGE_KEY = "oxygen_active_master_key";

/**
 * Validate whether a string is a valid 256-bit (32-byte) key (Hex or Base64).
 */
export function isValidMasterKeyString(keyStr: string): boolean {
  if (!keyStr || typeof keyStr !== "string") return false;
  const clean = keyStr.trim().replace(/\s+/g, "");

  // Check 64-character hex
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return true;
  }

  // Check Base64 that decodes to 32 bytes
  try {
    const bytes = base64ToBytes(clean);
    return bytes.length === AES_KEY_BYTES;
  } catch {
    return false;
  }
}

/**
 * Parse a master key string (Hex or Base64) into a 32-byte Uint8Array.
 */
export function parseMasterKeyString(keyStr: string): Uint8Array {
  const clean = keyStr.trim().replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return hexToBytes(clean);
  }
  try {
    const bytes = base64ToBytes(clean);
    if (bytes.length === AES_KEY_BYTES) {
      return bytes;
    }
  } catch {}
  throw new Error("Invalid master key: Must be a 64-character Hex string or 256-bit Base64 string.");
}

/**
 * Parse a .key file content (or any exported key backup text / raw key string)
 * and return the 32-byte master key as a Uint8Array.
 */
export function parseKeyFileContent(content: string): Uint8Array {
  if (!content || typeof content !== "string") {
    throw new Error("File content is empty or invalid.");
  }

  // Strip BOM and normalize line breaks
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const trimmed = normalized.trim();

  // 1. Direct validation if user provided raw key string (hex or base64)
  if (isValidMasterKeyString(trimmed)) {
    return parseMasterKeyString(trimmed);
  }

  // 2. Check for explicit Hexadecimal masterkey section from backup format
  const hexSectionMatch = normalized.match(/\[HEXADECIMAL MASTERKEY[^\]]*\]\s*([0-9a-fA-F]{64})/i);
  if (hexSectionMatch && hexSectionMatch[1]) {
    return hexToBytes(hexSectionMatch[1]);
  }

  // 3. Check for explicit Base64 masterkey section from backup format
  const base64SectionMatch = normalized.match(/\[BASE64 MASTERKEY[^\]]*\]\s*([A-Za-z0-9+/]{43}=)/i);
  if (base64SectionMatch && base64SectionMatch[1]) {
    try {
      const bytes = base64ToBytes(base64SectionMatch[1]);
      if (bytes.length === AES_KEY_BYTES) {
        return bytes;
      }
    } catch {}
  }

  // 4. Scan line by line for an exact 64-character hex string or 44-character base64 string
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[0-9a-fA-F]{64}$/.test(line)) {
      return hexToBytes(line);
    }
    if (/^[A-Za-z0-9+/]{43}=$/.test(line)) {
      try {
        const bytes = base64ToBytes(line);
        if (bytes.length === AES_KEY_BYTES) {
          return bytes;
        }
      } catch {}
    }
  }

  // 5. Scan whole text for 64-char hex word match
  const anyHexMatch = normalized.match(/\b([0-9a-fA-F]{64})\b/);
  if (anyHexMatch && anyHexMatch[1]) {
    return hexToBytes(anyHexMatch[1]);
  }

  // 6. Scan whole text for base64 32-byte key pattern
  const anyB64Match = normalized.match(/\b([A-Za-z0-9+/]{43}=)\b/);
  if (anyB64Match && anyB64Match[1]) {
    try {
      const bytes = base64ToBytes(anyB64Match[1]);
      if (bytes.length === AES_KEY_BYTES) {
        return bytes;
      }
    } catch {}
  }

  throw new Error("No valid 256-bit AES masterkey found in the provided .key file.");
}

let inMemoryMasterKeyHex: string | null = null;
const inMemoryLocalStorage: Record<string, string> = {};

/**
 * Retrieve the active master key from session storage (or in-memory fallback), if set.
 */
export function getActiveMasterKey(): Uint8Array | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      const storedHex = sessionStorage.getItem(ACTIVE_MASTER_KEY_STORAGE_KEY);
      if (storedHex && isValidMasterKeyString(storedHex)) {
        return hexToBytes(storedHex);
      }
    }
  } catch {}
  if (inMemoryMasterKeyHex && isValidMasterKeyString(inMemoryMasterKeyHex)) {
    return hexToBytes(inMemoryMasterKeyHex);
  }
  return null;
}

/**
 * Store or clear the active master key in session storage (and in-memory fallback).
 */
export function setActiveMasterKey(key: Uint8Array | string | null): void {
  const hex = key ? (typeof key === "string" ? bytesToHex(parseMasterKeyString(key)) : bytesToHex(key)) : null;
  inMemoryMasterKeyHex = hex;
  try {
    if (typeof sessionStorage !== "undefined") {
      if (!hex) {
        sessionStorage.removeItem(ACTIVE_MASTER_KEY_STORAGE_KEY);
      } else {
        sessionStorage.setItem(ACTIVE_MASTER_KEY_STORAGE_KEY, hex);
      }
    }
  } catch {}
}

/**
 * Clear the active master key from session storage and in-memory fallback.
 */
export function clearActiveMasterKey(): void {
  inMemoryMasterKeyHex = null;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(ACTIVE_MASTER_KEY_STORAGE_KEY);
    }
  } catch {}
}

export type EncryptionCategory = "characters" | "data_save" | "chatbot";

export const CATEGORY_ENCRYPTION_STORAGE_KEYS: Record<EncryptionCategory, string> = {
  characters: "oxygen_encrypt_characters",
  data_save: "oxygen_encrypt_data_save",
  chatbot: "oxygen_encrypt_chatbot",
};

/**
 * Check if encryption is enabled for a given data category.
 */
export function isCategoryEncryptionEnabled(category: EncryptionCategory): boolean {
  const key = CATEGORY_ENCRYPTION_STORAGE_KEYS[category];
  try {
    if (typeof localStorage !== "undefined") {
      const val = localStorage.getItem(key);
      if (val !== null) return val === "true";
    }
  } catch {}
  return inMemoryLocalStorage[key] === "true";
}

/**
 * Set encryption enabled state for a category.
 */
export function setCategoryEncryptionEnabled(category: EncryptionCategory, enabled: boolean): void {
  const key = CATEGORY_ENCRYPTION_STORAGE_KEYS[category];
  inMemoryLocalStorage[key] = String(enabled);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, String(enabled));
    }
  } catch {}
}

/**
 * Check if a category is locked (i.e. encryption is enabled, but no active master key is present in session).
 */
export function isCategoryLocked(category: EncryptionCategory): boolean {
  if (!isCategoryEncryptionEnabled(category)) {
    return false;
  }
  return getActiveMasterKey() === null;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns Base64 string containing: [12-byte IV + Ciphertext with 16-byte Auth Tag].
 */
export async function encryptAes256Gcm(plaintext: string, keyBytes: Uint8Array): Promise<string> {
  if (keyBytes.length !== AES_KEY_BYTES) {
    throw new Error(`Invalid key length: expected ${AES_KEY_BYTES} bytes (256 bits), got ${keyBytes.length}`);
  }

  const cryptoObj = getCrypto();
  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  cryptoObj.getRandomValues(iv);

  const cryptoKey = await cryptoObj.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encoder = new TextEncoder();
  const encodedPlaintext = encoder.encode(plaintext);

  const encryptedBuffer = await cryptoObj.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    cryptoKey,
    encodedPlaintext
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 * Input: Base64 string containing [12-byte IV + Ciphertext with 16-byte Auth Tag].
 */
export async function decryptAes256Gcm(ciphertextBase64: string, keyBytes: Uint8Array): Promise<string> {
  if (keyBytes.length !== AES_KEY_BYTES) {
    throw new Error(`Invalid key length: expected ${AES_KEY_BYTES} bytes (256 bits), got ${keyBytes.length}`);
  }

  const cryptoObj = getCrypto();
  const combined = base64ToBytes(ciphertextBase64);

  if (combined.length < AES_GCM_IV_BYTES + 16) {
    throw new Error("Ciphertext is too short or invalid");
  }

  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const encryptedData = combined.slice(AES_GCM_IV_BYTES);

  const cryptoKey = await cryptoObj.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decryptedBuffer = await cryptoObj.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    cryptoKey,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
