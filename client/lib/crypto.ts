/**
 * Secure client-side encryption using AES-GCM (Web Crypto API)
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_DERIVATION_ALGORITHM = 'PBKDF2';
const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Generates a random masterkey of specified length
 */
export function generateMasterKey(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  let result = '';
  const randomValues = new Uint32Array(length);
  window.crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

/**
 * Derives a CryptoKey from the masterkey string
 */
async function deriveKey(masterKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    KEY_DERIVATION_ALGORITHM,
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: KEY_DERIVATION_ALGORITHM,
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a string using the masterkey
 * Returns a base64 string containing salt, IV, and ciphertext
 */
export async function encrypt(text: string, masterKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(masterKey, salt);
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    data
  );

  const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encryptedContent), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64 string using the masterkey
 */
export async function decrypt(base64Text: string, masterKey: string): Promise<string> {
  try {
    const combined = new Uint8Array(atob(base64Text).split('').map(c => c.charCodeAt(0)));

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(masterKey, salt);
    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decryptedContent);
  } catch (e) {
    console.error('Decryption failed', e);
    throw new Error('Invalid masterkey or corrupted data');
  }
}

/**
 * Session storage helpers
 */
const STORAGE_KEY = 'oxygen_low_masterkey';

export function saveMasterKey(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function getMasterKey(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearMasterKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
