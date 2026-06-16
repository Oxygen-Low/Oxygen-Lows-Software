import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMasterKey, encrypt, decrypt } from './crypto';

// Mock window.crypto for Node environment
if (typeof window === 'undefined') {
  (global as any).window = {
    crypto: require('crypto').webcrypto
  };
}

describe('Crypto Library', () => {
  it('should generate a masterkey of correct length', () => {
    const key32 = generateMasterKey(32);
    expect(key32.length).toBe(32);

    const key64 = generateMasterKey(64);
    expect(key64.length).toBe(64);
  });

  it('should encrypt and decrypt a string correctly', async () => {
    const masterKey = 'test-master-key-12345678901234567890';
    const originalText = 'Hello, World! This is a secret message.';

    const encrypted = await encrypt(originalText, masterKey);
    expect(encrypted).not.toBe(originalText);

    const decrypted = await decrypt(encrypted, masterKey);
    expect(decrypted).toBe(originalText);
  });

  it('should fail to decrypt with wrong key', async () => {
    const masterKey = 'correct-key';
    const wrongKey = 'wrong-key';
    const originalText = 'Secret';

    const encrypted = await encrypt(originalText, masterKey);

    await expect(decrypt(encrypted, wrongKey)).rejects.toThrow('Invalid masterkey or corrupted data');
  });
});
