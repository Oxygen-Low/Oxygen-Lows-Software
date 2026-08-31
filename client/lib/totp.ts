/**
 * RFC 6238 TOTP (Time-Based One-Time Password) & Base32 decoding implementation
 * using standard Web Cryptography API.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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
 * Decode an RFC 4648 Base32 string into Uint8Array bytes.
 * Handles uppercase, lowercase, whitespace, hyphens, and optional '=' padding.
 */
export function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[\s\-_=]/g, "");

  if (!clean) {
    throw new Error("Base32 string is empty");
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Encode Uint8Array bytes into RFC 4648 Base32 string.
 */
export function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export interface TotpOptions {
  time?: number; // Unix timestamp in milliseconds or seconds (auto-detected, defaults to Date.now())
  period?: number; // Time step in seconds, standard is 30
  digits?: number; // Output length, standard is 6 (or 8)
  algorithm?: "SHA-1" | "SHA-256" | "SHA-512"; // Hash algorithm, standard is SHA-1
}

export interface ParsedTotpUri {
  secret: string;
  label?: string;
  issuer?: string;
  period?: number;
  digits?: number;
  algorithm?: "SHA-1" | "SHA-256" | "SHA-512";
}

/**
 * Parse an otpauth:// URI or return cleaned secret.
 */
export function parseTotpSecret(input: string): ParsedTotpUri {
  const trimmed = input.trim();
  if (trimmed.startsWith("otpauth://")) {
    try {
      const url = new URL(trimmed);
      const secret = url.searchParams.get("secret") || "";
      const periodStr = url.searchParams.get("period");
      const digitsStr = url.searchParams.get("digits");
      const algoStr = url.searchParams.get("algorithm");
      const issuer = url.searchParams.get("issuer") || undefined;
      const label =
        decodeURIComponent(
          url.pathname.replace(/^\/\/?[^/]*\//, "").replace(/^\//, ""),
        ) || undefined;

      const period = periodStr ? parseInt(periodStr, 10) : undefined;
      const digits = digitsStr ? parseInt(digitsStr, 10) : undefined;
      let algorithm: "SHA-1" | "SHA-256" | "SHA-512" | undefined;
      if (algoStr) {
        const u = algoStr.toUpperCase();
        if (u === "SHA1" || u === "SHA-1") algorithm = "SHA-1";
        else if (u === "SHA256" || u === "SHA-256") algorithm = "SHA-256";
        else if (u === "SHA512" || u === "SHA-512") algorithm = "SHA-512";
      }

      return {
        secret: cleanTotpSecret(secret),
        label,
        issuer,
        period: period && !isNaN(period) ? period : undefined,
        digits: digits && !isNaN(digits) ? digits : undefined,
        algorithm,
      };
    } catch {
      // Fallback if URL parsing fails
    }
  }

  return { secret: cleanTotpSecret(trimmed) };
}

/**
 * Extract and clean raw Base32 secret by stripping whitespace, hyphens, and URI prefixes.
 */
export function cleanTotpSecret(secret: string): string {
  if (!secret) return "";
  const trimmed = secret.trim();
  if (trimmed.startsWith("otpauth://")) {
    const match = trimmed.match(/[?&]secret=([^&]+)/i);
    if (match && match[1]) {
      return decodeURIComponent(match[1])
        .replace(/[\s\-_=]/g, "")
        .toUpperCase();
    }
  }
  return trimmed.replace(/[\s\-_=]/g, "").toUpperCase();
}

/**
 * Validate whether a string is a valid TOTP secret (Base32 format or valid otpauth URI).
 */
export function validateTotpSecret(secret: string): boolean {
  if (!secret || typeof secret !== "string") return false;
  const clean = cleanTotpSecret(secret);
  if (clean.length < 8) return false; // Minimum secret length
  try {
    const bytes = base32ToBytes(clean);
    return bytes.length > 0;
  } catch {
    return false;
  }
}

/**
 * Generate an RFC 6238 TOTP code from a Base32 secret key.
 */
export async function generateTotp(
  secret: string,
  options: TotpOptions = {},
): Promise<string> {
  const parsed = parseTotpSecret(secret);
  const cleanSecret = parsed.secret;
  if (!cleanSecret) {
    throw new Error("Invalid TOTP secret");
  }

  const keyBytes = base32ToBytes(cleanSecret);
  const period = options.period ?? parsed.period ?? 30;
  const digits = options.digits ?? parsed.digits ?? 6;
  const algorithmName = options.algorithm ?? parsed.algorithm ?? "SHA-1";

  let timestamp = options.time ?? Date.now();
  // If timestamp is in milliseconds (> 1e11), convert to seconds
  if (timestamp > 1e11) {
    timestamp = Math.floor(timestamp / 1000);
  }

  const counter = Math.floor(timestamp / period);

  // 8-byte big-endian counter buffer
  const counterBuffer = new ArrayBuffer(8);
  const dataView = new DataView(counterBuffer);
  const high = Math.floor(counter / 0x100000000);
  const low = counter & 0xffffffff;
  dataView.setUint32(0, high, false);
  dataView.setUint32(4, low, false);

  const cryptoObj = getCrypto();
  const cryptoKey = await cryptoObj.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: { name: algorithmName } },
    false,
    ["sign"],
  );

  const signature = await cryptoObj.subtle.sign(
    "HMAC",
    cryptoKey,
    counterBuffer,
  );

  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Get remaining seconds in current TOTP interval.
 */
export function getTotpTimeRemaining(period = 30): number {
  const now = Math.floor(Date.now() / 1000);
  return period - (now % period);
}

/**
 * Get progress ratio (0 to 1) of current TOTP interval remaining.
 */
export function getTotpProgress(period = 30): number {
  const remaining = getTotpTimeRemaining(period);
  return remaining / period;
}

/**
 * Format OTP code with visual grouping (e.g. "123 456" for 6 digits).
 */
export function formatOtpCode(code: string): string {
  if (!code) return "";
  const clean = code.replace(/\s+/g, "");
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }
  if (clean.length === 8) {
    return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  }
  return clean;
}
