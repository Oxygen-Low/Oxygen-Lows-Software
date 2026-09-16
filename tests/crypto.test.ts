import { describe, it, expect, beforeAll } from "vitest";
import { ChatCrypto } from "../client/services/crypto";
import { webcrypto } from "node:crypto";

beforeAll(() => {
  if (!globalThis.window) {
    (globalThis as any).window = { crypto: webcrypto };
  } else if (!globalThis.window.crypto) {
    (globalThis.window as any).crypto = webcrypto;
  }
});

describe("ChatCrypto Service (E2EE)", () => {
  it("generates valid ECDH P-256 keypair", async () => {
    const keyPair = await ChatCrypto.generateKeyPair();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
    expect(typeof keyPair.publicKey).toBe("string");
    expect(typeof keyPair.privateKey).toBe("string");
  });

  it("derives symmetric AES-GCM 256 shared secret between two parties", async () => {
    const alice = await ChatCrypto.generateKeyPair();
    const bob = await ChatCrypto.generateKeyPair();

    // Alice computes shared key using Bob's public key
    const aliceSharedKey = await ChatCrypto.deriveSharedKey(alice.privateKey, bob.publicKey);

    // Bob computes shared key using Alice's public key
    const bobSharedKey = await ChatCrypto.deriveSharedKey(bob.privateKey, alice.publicKey);

    // Alice encrypts a secret message
    const plaintext = "Hello Bob! This is an end-to-end encrypted secret message 🛡️";
    const encrypted = await ChatCrypto.encryptMessage(plaintext, aliceSharedKey);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(plaintext);

    // Bob decrypts the message
    const decrypted = await ChatCrypto.decryptMessage(encrypted, bobSharedKey);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with incorrect shared key", async () => {
    const alice = await ChatCrypto.generateKeyPair();
    const bob = await ChatCrypto.generateKeyPair();
    const eve = await ChatCrypto.generateKeyPair();

    const aliceShared = await ChatCrypto.deriveSharedKey(alice.privateKey, bob.publicKey);
    const eveShared = await ChatCrypto.deriveSharedKey(eve.privateKey, alice.publicKey);

    const plaintext = "Top secret intel";
    const encrypted = await ChatCrypto.encryptMessage(plaintext, aliceShared);

    await expect(ChatCrypto.decryptMessage(encrypted, eveShared)).rejects.toThrow();
  });

  it("generates and imports raw AES-256-GCM room keys for group chats", async () => {
    const roomKeyBase64 = await ChatCrypto.generateRoomKey();
    expect(roomKeyBase64).toBeDefined();
    expect(typeof roomKeyBase64).toBe("string");

    const importedKey = await ChatCrypto.importRoomKey(roomKeyBase64);
    expect(importedKey).toBeDefined();

    const text = "Group room announcement!";
    const encrypted = await ChatCrypto.encryptMessage(text, importedKey);
    const decrypted = await ChatCrypto.decryptMessage(encrypted, importedKey);
    expect(decrypted).toBe(text);
  });
});
