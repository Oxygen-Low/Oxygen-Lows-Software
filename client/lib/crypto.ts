import { supabase } from "@/lib/supabase";

/**
 * Cryptographic utilities for AES-256 master key generation, format conversion,
 * and AES-256-GCM client-side encryption and decryption.
 */

// 256-bit key = 32 bytes
export const AES_KEY_BYTES = 32;
export const AES_GCM_IV_BYTES = 12; // 96-bit standard nonce for AES-GCM

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Simple standard BIP-39 subset wordlist for 24-word passphrase representation
const WORDLIST = [
  "abandon",
  "ability",
  "able",
  "about",
  "above",
  "absent",
  "absorb",
  "abstract",
  "absurd",
  "abuse",
  "access",
  "accident",
  "account",
  "accuse",
  "achieve",
  "acid",
  "acoustic",
  "acquire",
  "across",
  "act",
  "action",
  "actor",
  "actress",
  "actual",
  "adapt",
  "add",
  "addict",
  "address",
  "adjust",
  "admit",
  "adult",
  "advance",
  "advice",
  "aerobic",
  "affair",
  "afford",
  "afraid",
  "again",
  "age",
  "agent",
  "agree",
  "ahead",
  "aim",
  "air",
  "airport",
  "aisle",
  "alarm",
  "album",
  "alcohol",
  "alert",
  "alien",
  "all",
  "alley",
  "allow",
  "almost",
  "alone",
  "alpha",
  "already",
  "also",
  "alter",
  "always",
  "amateur",
  "amazing",
  "among",
  "amount",
  "amused",
  "analyst",
  "anchor",
  "ancient",
  "anger",
  "angle",
  "angry",
  "animal",
  "ankle",
  "announce",
  "annual",
  "another",
  "answer",
  "antenna",
  "antique",
  "anxiety",
  "any",
  "apart",
  "apology",
  "appear",
  "apple",
  "approve",
  "april",
  "arch",
  "arctic",
  "area",
  "arena",
  "argue",
  "arm",
  "armed",
  "armor",
  "army",
  "around",
  "arrange",
  "arrest",
  "arrive",
  "arrow",
  "art",
  "artefact",
  "artist",
  "artwork",
  "ask",
  "aspect",
  "assault",
  "asset",
  "assist",
  "assume",
  "asthma",
  "athlete",
  "atom",
  "attack",
  "attend",
  "attitude",
  "attract",
  "auction",
  "audit",
  "august",
  "aunt",
  "author",
  "auto",
  "autumn",
  "average",
  "avocado",
  "avoid",
  "awake",
  "aware",
  "away",
  "awesome",
  "awful",
  "awkward",
  "axis",
  "baby",
  "bachelor",
  "bacon",
  "badge",
  "bag",
  "balance",
  "balcony",
  "ball",
  "bamboo",
  "banana",
  "banner",
  "bar",
  "barely",
  "bargain",
  "barrel",
  "base",
  "basic",
  "basket",
  "battle",
  "beach",
  "bean",
  "beauty",
  "because",
  "become",
  "beef",
  "before",
  "begin",
  "behave",
  "behind",
  "believe",
  "below",
  "belt",
  "bench",
  "benefit",
  "best",
  "betray",
  "better",
  "between",
  "beyond",
  "bicycle",
  "bid",
  "bike",
  "bind",
  "biology",
  "bird",
  "birth",
  "bitter",
  "black",
  "blade",
  "blame",
  "blanket",
  "blast",
  "bleak",
  "bless",
  "blind",
  "blood",
  "blossom",
  "blouse",
  "blue",
  "blur",
  "blush",
  "board",
  "boat",
  "body",
  "boil",
  "bomb",
  "bone",
  "bonus",
  "book",
  "boost",
  "border",
  "boring",
  "borrow",
  "boss",
  "bottom",
  "bounce",
  "box",
  "boy",
  "bracket",
  "brain",
  "brand",
  "brass",
  "brave",
  "bread",
  "breeze",
  "brick",
  "bridge",
  "brief",
  "bright",
  "bring",
  "brisk",
  "broccoli",
  "broken",
  "bronze",
  "broom",
  "brother",
  "brown",
  "brush",
  "bubble",
  "buddy",
  "budget",
  "buffalo",
  "build",
  "bulb",
  "bulk",
  "bullet",
  "bundle",
  "bunker",
  "burden",
  "burger",
  "burst",
  "bus",
  "business",
  "busy",
  "butter",
  "buyer",
  "buzz",
  "cabbage",
  "cabin",
  "cable",
  "cactus",
  "cage",
  "cake",
  "call",
  "calm",
  "camera",
  "camp",
  "can",
  "canal",
  "cancel",
  "candy",
  "cannon",
  "canoe",
  "canvas",
];

function getCrypto(): Crypto {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    typeof window.crypto.getRandomValues === "function"
  ) {
    return window.crypto;
  }
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
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
  for (let i = digits.length - 1; i >= 0; i--)
    str += BASE58_ALPHABET[digits[i]];
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
  throw new Error(
    "Invalid master key: Must be a 64-character Hex string or 256-bit Base64 string.",
  );
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
  const hexSectionMatch = normalized.match(
    /\[HEXADECIMAL MASTERKEY[^\]]*\]\s*([0-9a-fA-F]{64})/i,
  );
  if (hexSectionMatch && hexSectionMatch[1]) {
    return hexToBytes(hexSectionMatch[1]);
  }

  // 3. Check for explicit Base64 masterkey section from backup format
  const base64SectionMatch = normalized.match(
    /\[BASE64 MASTERKEY[^\]]*\]\s*([A-Za-z0-9+/]{43}=)/i,
  );
  if (base64SectionMatch && base64SectionMatch[1]) {
    try {
      const bytes = base64ToBytes(base64SectionMatch[1]);
      if (bytes.length === AES_KEY_BYTES) {
        return bytes;
      }
    } catch {}
  }

  // 4. Scan line by line for an exact 64-character hex string or 44-character base64 string
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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

  throw new Error(
    "No valid 256-bit AES masterkey found in the provided .key file.",
  );
}

let inMemoryMasterKeyHex: string | null = null;
let inMemoryKeyBytes: Uint8Array | null = null;
let cachedCryptoKey: CryptoKey | null = null;
let cachedCryptoKeyHex: string | null = null;
const inMemoryLocalStorage: Record<string, string> = {};

export const AUTO_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const AUTO_LOCK_LAST_ACTIVITY_KEY = "oxygen_master_key_last_active";
export const AUTO_LOCK_EVENT = "oxygen:masterkey:autolock";

let inMemoryLastActivity: number = Date.now();

/**
 * Record user activity to keep the masterkey active.
 */
export function recordUserActivity(): void {
  inMemoryLastActivity = Date.now();
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(
        AUTO_LOCK_LAST_ACTIVITY_KEY,
        String(inMemoryLastActivity),
      );
    }
  } catch {}
}

/**
 * Get the timestamp of the last recorded user activity.
 */
export function getLastUserActivity(): number {
  try {
    if (typeof sessionStorage !== "undefined") {
      const stored = sessionStorage.getItem(AUTO_LOCK_LAST_ACTIVITY_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) {
          return Math.max(parsed, inMemoryLastActivity);
        }
      }
    }
  } catch {}
  return inMemoryLastActivity;
}

/**
 * Helper to explicitly set the last activity timestamp for unit testing.
 */
export function setLastUserActivityForTesting(timestamp: number): void {
  inMemoryLastActivity = timestamp;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(AUTO_LOCK_LAST_ACTIVITY_KEY, String(timestamp));
    }
  } catch {}
}

const autoLockListeners: Set<() => void> = new Set();

/**
 * Check if the active masterkey has expired due to 30 minutes of inactivity.
 * Automatically clears the key and dispatches an event if expired.
 */
export function checkAutoLockExpiry(): boolean {
  const hasKey =
    inMemoryKeyBytes !== null ||
    inMemoryMasterKeyHex !== null ||
    (typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(ACTIVE_MASTER_KEY_STORAGE_KEY) !== null);

  if (!hasKey) return false;

  const now = Date.now();
  const lastActive = getLastUserActivity();

  if (now - lastActive > AUTO_LOCK_TIMEOUT_MS) {
    clearActiveMasterKey();
    autoLockListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error in autoLock listener callback:", err);
      }
    });
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      try {
        window.dispatchEvent(new CustomEvent(AUTO_LOCK_EVENT));
      } catch {}
    }
    return true;
  }
  return false;
}

/**
 * Subscribe to the masterkey auto-lock event.
 */
export function onAutoLock(callback: () => void): () => void {
  autoLockListeners.add(callback);

  let domHandler: (() => void) | null = null;
  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  ) {
    domHandler = () => callback();
    window.addEventListener(AUTO_LOCK_EVENT, domHandler);
  }

  return () => {
    autoLockListeners.delete(callback);
    if (
      domHandler &&
      typeof window !== "undefined" &&
      typeof window.removeEventListener === "function"
    ) {
      window.removeEventListener(AUTO_LOCK_EVENT, domHandler);
    }
  };
}

let autoLockListenerInitialized = false;
let autoLockCleanup: (() => void) | null = null;

/**
 * Initialize global event listeners to detect user activity and auto-lock after 30 minutes.
 */
export function initAutoLockListener(): () => void {
  if (typeof window === "undefined") return () => {};
  if (autoLockListenerInitialized && autoLockCleanup) {
    return autoLockCleanup;
  }

  let lastThrottle = 0;
  const handleActivity = () => {
    const now = Date.now();
    // Throttle activity recording to once every 2 seconds
    if (now - lastThrottle > 2000) {
      lastThrottle = now;
      recordUserActivity();
    }
  };

  const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];
  events.forEach((evt) => {
    window.addEventListener(evt, handleActivity, { passive: true });
  });

  // Periodic check every 15 seconds
  const intervalId = setInterval(() => {
    checkAutoLockExpiry();
  }, 15000);

  autoLockListenerInitialized = true;
  autoLockCleanup = () => {
    events.forEach((evt) => {
      window.removeEventListener(evt, handleActivity);
    });
    clearInterval(intervalId);
    autoLockListenerInitialized = false;
    autoLockCleanup = null;
  };

  return autoLockCleanup;
}

/**
 * Securely zeroize a Uint8Array buffer in memory.
 */
export function zeroizeBytes(bytes: Uint8Array | null | undefined): void {
  if (bytes && bytes instanceof Uint8Array) {
    bytes.fill(0);
  }
}

/**
 * Import a 256-bit key into a Web Cryptography CryptoKey object.
 * By default, extractable is set to false to prevent runtime exfiltration of raw bytes.
 */
export async function importAes256GcmCryptoKey(
  keyBytes: Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  const cryptoObj = getCrypto();
  return await cryptoObj.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    extractable,
    ["encrypt", "decrypt"],
  );
}

/**
 * Get the cached active CryptoKey or import it from active master key bytes.
 */
export async function getActiveCryptoKey(): Promise<CryptoKey | null> {
  const activeBytes = getActiveMasterKey();
  if (!activeBytes) {
    cachedCryptoKey = null;
    cachedCryptoKeyHex = null;
    return null;
  }
  const hex = bytesToHex(activeBytes);
  if (cachedCryptoKey && cachedCryptoKeyHex === hex) {
    return cachedCryptoKey;
  }
  cachedCryptoKey = await importAes256GcmCryptoKey(activeBytes, false);
  cachedCryptoKeyHex = hex;
  return cachedCryptoKey;
}

/**
 * Retrieve the active master key from session storage (or in-memory fallback), if set.
 */
export function getActiveMasterKey(): Uint8Array | null {
  checkAutoLockExpiry();
  try {
    if (typeof sessionStorage !== "undefined") {
      const storedHex = sessionStorage.getItem(ACTIVE_MASTER_KEY_STORAGE_KEY);
      if (storedHex && isValidMasterKeyString(storedHex)) {
        return hexToBytes(storedHex);
      }
    }
  } catch {}
  if (inMemoryKeyBytes && inMemoryKeyBytes.length === AES_KEY_BYTES) {
    return new Uint8Array(inMemoryKeyBytes);
  }
  if (inMemoryMasterKeyHex && isValidMasterKeyString(inMemoryMasterKeyHex)) {
    return hexToBytes(inMemoryMasterKeyHex);
  }
  return null;
}

/**
 * Store or clear the active master key in session storage (and in-memory fallback).
 */
export function setActiveMasterKey(key: Uint8Array | string | null): void {
  if (inMemoryKeyBytes) {
    zeroizeBytes(inMemoryKeyBytes);
    inMemoryKeyBytes = null;
  }
  cachedCryptoKey = null;
  cachedCryptoKeyHex = null;

  if (!key) {
    inMemoryMasterKeyHex = null;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(ACTIVE_MASTER_KEY_STORAGE_KEY);
        sessionStorage.removeItem(AUTO_LOCK_LAST_ACTIVITY_KEY);
      }
    } catch {}
    return;
  }

  let bytes: Uint8Array;
  if (typeof key === "string") {
    bytes = parseMasterKeyString(key);
  } else {
    bytes = new Uint8Array(key);
  }

  const hex = bytesToHex(bytes);
  inMemoryKeyBytes = new Uint8Array(bytes);
  inMemoryMasterKeyHex = hex;
  recordUserActivity();

  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(ACTIVE_MASTER_KEY_STORAGE_KEY, hex);
    }
  } catch {}
}

/**
 * Clear and zeroize the active master key from session storage, in-memory buffers, and crypto caches.
 */
export function clearActiveMasterKey(): void {
  if (inMemoryKeyBytes) {
    zeroizeBytes(inMemoryKeyBytes);
    inMemoryKeyBytes = null;
  }
  inMemoryMasterKeyHex = null;
  cachedCryptoKey = null;
  cachedCryptoKeyHex = null;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(ACTIVE_MASTER_KEY_STORAGE_KEY);
      sessionStorage.removeItem(AUTO_LOCK_LAST_ACTIVITY_KEY);
    }
  } catch {}
}

export type EncryptionCategory =
  "characters" | "data_save" | "chatbot" | "integrations";

export const CATEGORY_ENCRYPTION_STORAGE_KEYS: Record<
  EncryptionCategory,
  string
> = {
  characters: "oxygen_encrypt_characters",
  data_save: "oxygen_encrypt_data_save",
  chatbot: "oxygen_encrypt_chatbot",
  integrations: "oxygen_encrypt_integrations",
};

/**
 * Check if encryption is enabled for a given data category.
 */
export function isCategoryEncryptionEnabled(
  category: EncryptionCategory,
): boolean {
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
export function setCategoryEncryptionEnabled(
  category: EncryptionCategory,
  enabled: boolean,
): void {
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
export async function encryptAes256Gcm(
  plaintext: string,
  keyOrBytes: Uint8Array | CryptoKey,
): Promise<string> {
  const cryptoObj = getCrypto();
  let cryptoKey: CryptoKey;

  if (keyOrBytes instanceof Uint8Array) {
    if (keyOrBytes.length !== AES_KEY_BYTES) {
      throw new Error(
        `Invalid key length: expected ${AES_KEY_BYTES} bytes (256 bits), got ${keyOrBytes.length}`,
      );
    }
    const hex = bytesToHex(keyOrBytes);
    if (cachedCryptoKey && cachedCryptoKeyHex === hex) {
      cryptoKey = cachedCryptoKey;
    } else {
      cryptoKey = await importAes256GcmCryptoKey(keyOrBytes, false);
      if (inMemoryMasterKeyHex === hex) {
        cachedCryptoKey = cryptoKey;
        cachedCryptoKeyHex = hex;
      }
    }
  } else {
    cryptoKey = keyOrBytes;
  }

  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  cryptoObj.getRandomValues(iv);

  const encoder = new TextEncoder();
  const encodedPlaintext = encoder.encode(plaintext);

  const encryptedBuffer = await cryptoObj.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    cryptoKey,
    encodedPlaintext,
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
export async function decryptAes256Gcm(
  ciphertextBase64: string,
  keyOrBytes: Uint8Array | CryptoKey,
): Promise<string> {
  const cryptoObj = getCrypto();
  let cryptoKey: CryptoKey;

  if (keyOrBytes instanceof Uint8Array) {
    if (keyOrBytes.length !== AES_KEY_BYTES) {
      throw new Error(
        `Invalid key length: expected ${AES_KEY_BYTES} bytes (256 bits), got ${keyOrBytes.length}`,
      );
    }
    const hex = bytesToHex(keyOrBytes);
    if (cachedCryptoKey && cachedCryptoKeyHex === hex) {
      cryptoKey = cachedCryptoKey;
    } else {
      cryptoKey = await importAes256GcmCryptoKey(keyOrBytes, false);
      if (inMemoryMasterKeyHex === hex) {
        cachedCryptoKey = cryptoKey;
        cachedCryptoKeyHex = hex;
      }
    }
  } else {
    cryptoKey = keyOrBytes;
  }

  const combined = base64ToBytes(ciphertextBase64);

  if (combined.length < AES_GCM_IV_BYTES + 16) {
    throw new Error("Ciphertext is too short or invalid");
  }

  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const encryptedData = combined.slice(AES_GCM_IV_BYTES);

  const decryptedBuffer = await cryptoObj.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    cryptoKey,
    encryptedData,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

export const ENCRYPTED_PREFIX = "ENC:aes-256-gcm:";

/**
 * Check if a string value is an encrypted AES-256-GCM envelope.
 */
export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt a string field using AES-256-GCM.
 * Handles null/undefined, empty strings, and skips values that are already encrypted.
 */
export async function encryptField(
  value: string | null | undefined,
  keyBytes: Uint8Array | null | undefined,
): Promise<string | null | undefined> {
  if (value === null || value === undefined || value === "") {
    return value;
  }
  if (!keyBytes) {
    return value;
  }
  if (isEncrypted(value)) {
    return value;
  }
  const ciphertext = await encryptAes256Gcm(value, keyBytes);
  return `${ENCRYPTED_PREFIX}${ciphertext}`;
}

/**
 * Decrypt a string field.
 * Handles null/undefined, plaintext strings, and missing or failed keys gracefully.
 */
export async function decryptField(
  value: string | null | undefined,
  keyBytes: Uint8Array | null | undefined,
): Promise<string | null | undefined> {
  if (value === null || value === undefined || value === "") {
    return value;
  }
  if (!isEncrypted(value)) {
    return value;
  }
  if (!keyBytes) {
    return value;
  }
  try {
    const rawCiphertext = value.slice(ENCRYPTED_PREFIX.length);
    return await decryptAes256Gcm(rawCiphertext, keyBytes);
  } catch (err) {
    console.warn("Failed to decrypt field:", err);
    return value;
  }
}

export interface CharacterData {
  id?: string;
  user_id?: string;
  name?: string;
  short_description?: string | null;
  display_name?: string | null;
  image_path?: string | null;
  image_url?: string | null;
  appearance?: string | null;
  personality?: string | null;
  backstory?: string | null;
  hidden_description?: string | null;
  is_universe?: boolean;
  [key: string]: any;
}

export async function encryptCharacterData<T extends CharacterData>(
  char: T,
  keyBytes: Uint8Array,
): Promise<T> {
  const result: any = { ...char };
  if (char.name !== undefined)
    result.name = (await encryptField(char.name, keyBytes)) ?? char.name;
  if (char.short_description !== undefined)
    result.short_description = await encryptField(
      char.short_description,
      keyBytes,
    );
  if (char.display_name !== undefined)
    result.display_name = await encryptField(char.display_name, keyBytes);
  if (char.appearance !== undefined)
    result.appearance = await encryptField(char.appearance, keyBytes);
  if (char.personality !== undefined)
    result.personality = await encryptField(char.personality, keyBytes);
  if (char.backstory !== undefined)
    result.backstory = await encryptField(char.backstory, keyBytes);
  if (char.hidden_description !== undefined)
    result.hidden_description = await encryptField(
      char.hidden_description,
      keyBytes,
    );
  return result;
}

export async function decryptCharacterData<T extends CharacterData>(
  char: T,
  keyBytes: Uint8Array | null,
): Promise<T> {
  const result: any = { ...char };
  if (char.name !== undefined)
    result.name = (await decryptField(char.name, keyBytes)) ?? char.name;
  if (char.short_description !== undefined)
    result.short_description = await decryptField(
      char.short_description,
      keyBytes,
    );
  if (char.display_name !== undefined)
    result.display_name = await decryptField(char.display_name, keyBytes);
  if (char.appearance !== undefined)
    result.appearance = await decryptField(char.appearance, keyBytes);
  if (char.personality !== undefined)
    result.personality = await decryptField(char.personality, keyBytes);
  if (char.backstory !== undefined)
    result.backstory = await decryptField(char.backstory, keyBytes);
  if (char.hidden_description !== undefined)
    result.hidden_description = await decryptField(
      char.hidden_description,
      keyBytes,
    );
  return result;
}

export interface DataSaveData {
  id?: string;
  user_id?: string;
  key_name?: string;
  content?: string;
  category_id?: string | null;
  [key: string]: any;
}

export async function encryptDataSaveData<T extends DataSaveData>(
  item: T,
  keyBytes: Uint8Array,
): Promise<T> {
  const result: any = { ...item };
  if (item.key_name !== undefined)
    result.key_name =
      (await encryptField(item.key_name, keyBytes)) ?? item.key_name;
  if (item.content !== undefined)
    result.content =
      (await encryptField(item.content, keyBytes)) ?? item.content;
  return result;
}

export async function decryptDataSaveData<T extends DataSaveData>(
  item: T,
  keyBytes: Uint8Array | null,
): Promise<T> {
  const result: any = { ...item };
  if (item.key_name !== undefined)
    result.key_name =
      (await decryptField(item.key_name, keyBytes)) ?? item.key_name;
  if (item.content !== undefined)
    result.content =
      (await decryptField(item.content, keyBytes)) ?? item.content;
  return result;
}

export interface DataSaveCategoryData {
  id?: string;
  user_id?: string;
  name?: string;
  [key: string]: any;
}

export async function encryptDataSaveCategoryData<
  T extends DataSaveCategoryData,
>(cat: T, keyBytes: Uint8Array): Promise<T> {
  const result: any = { ...cat };
  if (cat.name !== undefined)
    result.name = (await encryptField(cat.name, keyBytes)) ?? cat.name;
  return result;
}

export async function decryptDataSaveCategoryData<
  T extends DataSaveCategoryData,
>(cat: T, keyBytes: Uint8Array | null): Promise<T> {
  const result: any = { ...cat };
  if (cat.name !== undefined)
    result.name = (await decryptField(cat.name, keyBytes)) ?? cat.name;
  return result;
}

export interface ChatData {
  id?: string;
  user_id?: string;
  title?: string;
  system_prompt?: string | null;
  [key: string]: any;
}

export async function encryptChatData<T extends ChatData>(
  chat: T,
  keyBytes: Uint8Array,
): Promise<T> {
  const result: any = { ...chat };
  if (chat.title !== undefined)
    result.title = (await encryptField(chat.title, keyBytes)) ?? chat.title;
  if (chat.system_prompt !== undefined)
    result.system_prompt = await encryptField(chat.system_prompt, keyBytes);
  return result;
}

export async function decryptChatData<T extends ChatData>(
  chat: T,
  keyBytes: Uint8Array | null,
): Promise<T> {
  const result: any = { ...chat };
  if (chat.title !== undefined)
    result.title = (await decryptField(chat.title, keyBytes)) ?? chat.title;
  if (chat.system_prompt !== undefined)
    result.system_prompt = await decryptField(chat.system_prompt, keyBytes);
  return result;
}

export interface ChatMessageData {
  id?: string;
  chat_id?: string;
  role?: string;
  content?: string;
  reasoning?: string | null;
  is_web_search?: boolean | null;
  [key: string]: any;
}

export async function encryptChatMessageData<T extends ChatMessageData>(
  msg: T,
  keyBytes: Uint8Array,
): Promise<T> {
  const result: any = { ...msg };
  if (msg.content !== undefined)
    result.content = (await encryptField(msg.content, keyBytes)) ?? msg.content;
  if (msg.reasoning !== undefined)
    result.reasoning = await encryptField(msg.reasoning, keyBytes);
  return result;
}

export async function decryptChatMessageData<T extends ChatMessageData>(
  msg: T,
  keyBytes: Uint8Array | null,
): Promise<T> {
  const result: any = { ...msg };
  if (msg.content !== undefined)
    result.content = (await decryptField(msg.content, keyBytes)) ?? msg.content;
  if (msg.reasoning !== undefined)
    result.reasoning = await decryptField(msg.reasoning, keyBytes);
  return result;
}

export interface IntegrationData {
  id?: string;
  user_id?: string;
  category?: string;
  provider?: string;
  name?: string;
  api_key?: string | null;
  base_url?: string | null;
  config?: Record<string, any> | null;
  [key: string]: any;
}

export async function encryptIntegrationData<T extends IntegrationData>(
  data: T,
  keyBytes: Uint8Array,
): Promise<T> {
  const result: any = { ...data };
  if (data.api_key !== undefined)
    result.api_key = await encryptField(data.api_key, keyBytes);
  if (data.base_url !== undefined)
    result.base_url = await encryptField(data.base_url, keyBytes);
  return result;
}

export async function decryptIntegrationData<T extends IntegrationData>(
  data: T,
  keyBytes: Uint8Array | null,
): Promise<T> {
  const result: any = { ...data };
  if (data.api_key !== undefined)
    result.api_key = await decryptField(data.api_key, keyBytes);
  if (data.base_url !== undefined)
    result.base_url = await decryptField(data.base_url, keyBytes);
  return result;
}

export interface MigrateOptions {
  category: EncryptionCategory;
  enable: boolean;
  keyBytes: Uint8Array;
  userId?: string;
  client?: any;
}

/**
 * Migrate all user data in Supabase for a given category:
 * When enabling: encrypts all unencrypted fields in Supabase.
 * When disabling: decrypts all encrypted fields in Supabase back to plaintext.
 */
export async function migrateCategoryEncryption({
  category,
  enable,
  keyBytes,
  userId,
  client,
}: MigrateOptions): Promise<{ updatedCount: number }> {
  const db = client || supabase;
  let updatedCount = 0;

  if (category === "characters") {
    let query = db.from("characters").select("*");
    if (userId) query = query.eq("user_id", userId);
    const { data: chars, error } = await query;
    if (error) throw error;

    if (chars && chars.length > 0) {
      for (const char of chars) {
        if (enable) {
          const enc = await encryptCharacterData(char, keyBytes);
          const { error: updateError } = await db
            .from("characters")
            .update({
              name: enc.name,
              short_description: enc.short_description,
              display_name: enc.display_name,
              appearance: enc.appearance,
              personality: enc.personality,
              backstory: enc.backstory,
              hidden_description: enc.hidden_description,
            })
            .eq("id", char.id);
          if (updateError) throw updateError;
          updatedCount++;
        } else {
          const dec = await decryptCharacterData(char, keyBytes);
          const { error: updateError } = await db
            .from("characters")
            .update({
              name: dec.name,
              short_description: dec.short_description,
              display_name: dec.display_name,
              appearance: dec.appearance,
              personality: dec.personality,
              backstory: dec.backstory,
              hidden_description: dec.hidden_description,
            })
            .eq("id", char.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }
    }
  } else if (category === "data_save") {
    let querySaves = db.from("data_saves").select("*");
    if (userId) querySaves = querySaves.eq("user_id", userId);
    const { data: saves, error: savesError } = await querySaves;
    if (savesError) throw savesError;

    if (saves && saves.length > 0) {
      for (const save of saves) {
        if (enable) {
          const enc = await encryptDataSaveData(save, keyBytes);
          const { error: updateError } = await db
            .from("data_saves")
            .update({
              key_name: enc.key_name,
              content: enc.content,
            })
            .eq("id", save.id);
          if (updateError) throw updateError;
          updatedCount++;
        } else {
          const dec = await decryptDataSaveData(save, keyBytes);
          const { error: updateError } = await db
            .from("data_saves")
            .update({
              key_name: dec.key_name,
              content: dec.content,
            })
            .eq("id", save.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }
    }

    let queryCats = db.from("data_save_categories").select("*");
    if (userId) queryCats = queryCats.eq("user_id", userId);
    const { data: cats, error: catsError } = await queryCats;
    if (catsError) throw catsError;

    if (cats && cats.length > 0) {
      for (const cat of cats) {
        if (enable) {
          const enc = await encryptDataSaveCategoryData(cat, keyBytes);
          const { error: updateError } = await db
            .from("data_save_categories")
            .update({ name: enc.name })
            .eq("id", cat.id);
          if (updateError) throw updateError;
          updatedCount++;
        } else {
          const dec = await decryptDataSaveCategoryData(cat, keyBytes);
          const { error: updateError } = await db
            .from("data_save_categories")
            .update({ name: dec.name })
            .eq("id", cat.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }
    }
  } else if (category === "chatbot") {
    let queryChats = db.from("chats").select("*");
    if (userId) queryChats = queryChats.eq("user_id", userId);
    const { data: chats, error: chatsError } = await queryChats;
    if (chatsError) throw chatsError;

    if (chats && chats.length > 0) {
      const chatIds = chats.map((c: any) => c.id);
      for (const chat of chats) {
        if (enable) {
          const enc = await encryptChatData(chat, keyBytes);
          const { error: updateError } = await db
            .from("chats")
            .update({
              title: enc.title,
              system_prompt: enc.system_prompt,
            })
            .eq("id", chat.id);
          if (updateError) throw updateError;
          updatedCount++;
        } else {
          const dec = await decryptChatData(chat, keyBytes);
          const { error: updateError } = await db
            .from("chats")
            .update({
              title: dec.title,
              system_prompt: dec.system_prompt,
            })
            .eq("id", chat.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }

      if (chatIds.length > 0) {
        const { data: msgs, error: msgsError } = await db
          .from("chat_messages")
          .select("*")
          .in("chat_id", chatIds);
        if (msgsError) throw msgsError;

        if (msgs && msgs.length > 0) {
          for (const msg of msgs) {
            if (enable) {
              const enc = await encryptChatMessageData(msg, keyBytes);
              const { error: updateError } = await db
                .from("chat_messages")
                .update({
                  content: enc.content,
                  reasoning: enc.reasoning,
                })
                .eq("id", msg.id);
              if (updateError) throw updateError;
              updatedCount++;
            } else {
              const dec = await decryptChatMessageData(msg, keyBytes);
              const { error: updateError } = await db
                .from("chat_messages")
                .update({
                  content: dec.content,
                  reasoning: dec.reasoning,
                })
                .eq("id", msg.id);
              if (updateError) throw updateError;
              updatedCount++;
            }
          }
        }
      }
    }
  } else if (category === "integrations") {
    let queryIntegrations = db.from("user_integrations").select("*");
    if (userId) queryIntegrations = queryIntegrations.eq("user_id", userId);
    const { data: list, error: integrationsError } = await queryIntegrations;
    if (integrationsError) throw integrationsError;

    if (list && list.length > 0) {
      for (const item of list) {
        if (enable) {
          const enc = await encryptIntegrationData(item, keyBytes);
          const { error: updateError } = await db
            .from("user_integrations")
            .update({
              api_key: enc.api_key,
              base_url: enc.base_url,
            })
            .eq("id", item.id);
          if (updateError) throw updateError;
          updatedCount++;
        } else {
          const dec = await decryptIntegrationData(item, keyBytes);
          const { error: updateError } = await db
            .from("user_integrations")
            .update({
              api_key: dec.api_key,
              base_url: dec.base_url,
            })
            .eq("id", item.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }
    }
  }

  return { updatedCount };
}

export interface RotateKeyOptions {
  oldKeyBytes: Uint8Array;
  newKeyBytes: Uint8Array;
  userId?: string;
  client?: any;
}

/**
 * Rotate the master key: decrypt all data across all enabled categories using the old key,
 * and then immediately re-encrypt using the new key.
 */
export async function rotateMasterKey({
  oldKeyBytes,
  newKeyBytes,
  userId,
  client,
}: RotateKeyOptions): Promise<{ updatedCount: number }> {
  const db = client || supabase;
  let updatedCount = 0;

  const categories: EncryptionCategory[] = [
    "characters",
    "data_save",
    "chatbot",
    "integrations",
  ];

  for (const category of categories) {
    if (!isCategoryEncryptionEnabled(category)) continue;

    if (category === "characters") {
      let query = db.from("characters").select("*");
      if (userId) query = query.eq("user_id", userId);
      const { data: chars, error } = await query;
      if (error) throw error;

      if (chars && chars.length > 0) {
        for (const char of chars) {
          const dec = await decryptCharacterData(char, oldKeyBytes);
          const enc = await encryptCharacterData(dec, newKeyBytes);
          const { error: updateError } = await db
            .from("characters")
            .update({
              name: enc.name,
              short_description: enc.short_description,
              display_name: enc.display_name,
              appearance: enc.appearance,
              personality: enc.personality,
              backstory: enc.backstory,
              hidden_description: enc.hidden_description,
            })
            .eq("id", char.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }
    } else if (category === "data_save") {
      let querySaves = db.from("data_saves").select("*");
      if (userId) querySaves = querySaves.eq("user_id", userId);
      const { data: saves, error: savesError } = await querySaves;
      if (savesError) throw savesError;

      if (saves && saves.length > 0) {
        for (const save of saves) {
          const dec = await decryptDataSaveData(save, oldKeyBytes);
          const enc = await encryptDataSaveData(dec, newKeyBytes);
          const { error: updateError } = await db
            .from("data_saves")
            .update({
              key_name: enc.key_name,
              content: enc.content,
            })
            .eq("id", save.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }

      let queryCats = db.from("data_save_categories").select("*");
      if (userId) queryCats = queryCats.eq("user_id", userId);
      const { data: cats, error: catsError } = await queryCats;
      if (catsError) throw catsError;

      if (cats && cats.length > 0) {
        for (const cat of cats) {
          const dec = await decryptDataSaveCategoryData(cat, oldKeyBytes);
          const enc = await encryptDataSaveCategoryData(dec, newKeyBytes);
          const { error: updateError } = await db
            .from("data_save_categories")
            .update({ name: enc.name })
            .eq("id", cat.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }
    } else if (category === "chatbot") {
      let queryChats = db.from("chats").select("*");
      if (userId) queryChats = queryChats.eq("user_id", userId);
      const { data: chats, error: chatsError } = await queryChats;
      if (chatsError) throw chatsError;

      if (chats && chats.length > 0) {
        const chatIds = chats.map((c: any) => c.id);
        for (const chat of chats) {
          const dec = await decryptChatData(chat, oldKeyBytes);
          const enc = await encryptChatData(dec, newKeyBytes);
          const { error: updateError } = await db
            .from("chats")
            .update({
              title: enc.title,
              system_prompt: enc.system_prompt,
            })
            .eq("id", chat.id);
          if (updateError) throw updateError;
          updatedCount++;
        }

        if (chatIds.length > 0) {
          const { data: msgs, error: msgsError } = await db
            .from("chat_messages")
            .select("*")
            .in("chat_id", chatIds);
          if (msgsError) throw msgsError;

          if (msgs && msgs.length > 0) {
            for (const msg of msgs) {
              const dec = await decryptChatMessageData(msg, oldKeyBytes);
              const enc = await encryptChatMessageData(dec, newKeyBytes);
              const { error: updateError } = await db
                .from("chat_messages")
                .update({
                  content: enc.content,
                  reasoning: enc.reasoning,
                })
                .eq("id", msg.id);
              if (updateError) throw updateError;
              updatedCount++;
            }
          }
        }
      }
    } else if (category === "integrations") {
      let queryIntegrations = db.from("user_integrations").select("*");
      if (userId) queryIntegrations = queryIntegrations.eq("user_id", userId);
      const { data: list, error: integrationsError } = await queryIntegrations;
      if (integrationsError) throw integrationsError;

      if (list && list.length > 0) {
        for (const item of list) {
          const dec = await decryptIntegrationData(item, oldKeyBytes);
          const enc = await encryptIntegrationData(dec, newKeyBytes);
          const { error: updateError } = await db
            .from("user_integrations")
            .update({
              api_key: enc.api_key,
              base_url: enc.base_url,
            })
            .eq("id", item.id);
          if (updateError) throw updateError;
          updatedCount++;
        }
      }
    }
  }

  return { updatedCount };
}
