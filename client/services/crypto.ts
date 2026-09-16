/**
 * End-to-End Encryption (E2EE) Service using Web Crypto API.
 * Supports ECDH key generation, key exchange, and AES-256-GCM encryption/decryption.
 */

export interface KeyPairData {
  publicKey: string; // Base64 SPKI
  privateKey: string; // Base64 PKCS8
}

export interface EncryptedPayload {
  iv: string; // Base64 12-byte IV
  ciphertext: string; // Base64 ciphertext
  v: number; // version
}

const STORAGE_KEY = "oxygen_chat_e2ee_keys";
const SHARED_KEY_CACHE = new Map<string, CryptoKey>();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class ChatCrypto {
  /**
   * Generates a new ECDH P-256 key pair.
   */
  static async generateKeyPair(): Promise<KeyPairData> {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey", "deriveBits"]
    );

    const pubSpki = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privPkcs8 = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    return {
      publicKey: arrayBufferToBase64(pubSpki),
      privateKey: arrayBufferToBase64(privPkcs8),
    };
  }

  /**
   * Gets or generates the current user's local keypair from localStorage.
   */
  static async getOrCreateLocalKeyPair(): Promise<KeyPairData> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: KeyPairData = JSON.parse(stored);
        if (parsed.publicKey && parsed.privateKey) {
          return parsed;
        }
      }
    } catch {
      // Ignore read error, regenerate
    }

    const newKeyPair = await this.generateKeyPair();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeyPair));
    } catch {
      // Storage unavailable
    }
    return newKeyPair;
  }

  /**
   * Imports a Base64 SPKI public key.
   */
  static async importPublicKey(spkiBase64: string): Promise<CryptoKey> {
    const buffer = base64ToArrayBuffer(spkiBase64);
    return window.crypto.subtle.importKey(
      "spki",
      buffer,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      []
    );
  }

  /**
   * Imports a Base64 PKCS8 private key.
   */
  static async importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
    const buffer = base64ToArrayBuffer(pkcs8Base64);
    return window.crypto.subtle.importKey(
      "pkcs8",
      buffer,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey", "deriveBits"]
    );
  }

  /**
   * Derives a shared AES-GCM 256-bit CryptoKey between a local private key and a peer's public key.
   */
  static async deriveSharedKey(localPrivKeyBase64: string, peerPubKeyBase64: string): Promise<CryptoKey> {
    const cacheKey = `${localPrivKeyBase64}:${peerPubKeyBase64}`;
    if (SHARED_KEY_CACHE.has(cacheKey)) {
      return SHARED_KEY_CACHE.get(cacheKey)!;
    }

    const privKey = await this.importPrivateKey(localPrivKeyBase64);
    const pubKey = await this.importPublicKey(peerPubKeyBase64);

    const sharedKey = await window.crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: pubKey,
      },
      privKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      ["encrypt", "decrypt"]
    );

    SHARED_KEY_CACHE.set(cacheKey, sharedKey);
    return sharedKey;
  }

  /**
   * Encrypts plaintext message with an AES-GCM shared key.
   */
  static async encryptMessage(plaintext: string, sharedKey: CryptoKey): Promise<EncryptedPayload> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      sharedKey,
      data
    );

    return {
      iv: arrayBufferToBase64(iv.buffer),
      ciphertext: arrayBufferToBase64(encrypted),
      v: 1,
    };
  }

  /**
   * Decrypts an EncryptedPayload using an AES-GCM shared key.
   */
  static async decryptMessage(payload: EncryptedPayload, sharedKey: CryptoKey): Promise<string> {
    const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
    const ciphertext = base64ToArrayBuffer(payload.ciphertext);

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      sharedKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Generates a symmetric AES-256-GCM key for group chat rooms.
   */
  static async generateRoomKey(): Promise<string> {
    const key = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
    const raw = await window.crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(raw);
  }

  /**
   * Imports a raw AES-GCM room key string.
   */
  static async importRoomKey(rawBase64: string): Promise<CryptoKey> {
    const buffer = base64ToArrayBuffer(rawBase64);
    return window.crypto.subtle.importKey(
      "raw",
      buffer,
      {
        name: "AES-GCM",
      },
      false,
      ["encrypt", "decrypt"]
    );
  }
}
