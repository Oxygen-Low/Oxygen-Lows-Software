import { describe, it, expect } from "vitest";
import {
  generateSalt,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
} from "./auth.ts";

describe("auth library", () => {
  it("should hash and verify passwords correctly", () => {
    const password = "mySecretPassword123!";
    const salt = generateSalt();
    expect(salt).toHaveLength(32); // 16 bytes hex

    const hash = hashPassword(password, salt);
    expect(hash).toHaveLength(128); // 64 bytes hex

    const valid = verifyPassword(password, hash, salt);
    expect(valid).toBe(true);

    const invalid = verifyPassword("wrongPassword", hash, salt);
    expect(invalid).toBe(false);
  });

  it("should generate and verify session tokens", () => {
    const user = {
      id: "42",
      username: "alex",
      email: "alex@example.com",
      role: "user",
    };

    const token = generateToken(user);
    expect(token.startsWith("ol_")).toBe(true);

    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("42");
    expect(payload?.username).toBe("alex");
    expect(payload?.email).toBe("alex@example.com");
  });

  it("should reject tampered or invalid tokens", () => {
    const user = {
      id: "42",
      username: "alex",
      email: "alex@example.com",
    };

    const token = generateToken(user);
    const tampered = token.slice(0, -4) + "abcd";
    expect(verifyToken(tampered)).toBeNull();
    expect(verifyToken("invalid.token")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("should assign admin role to user id 1", () => {
    const adminUser = {
      id: "1",
      username: "admin",
      email: "admin@example.com",
    };

    const token = generateToken(adminUser);
    const payload = verifyToken(token);
    expect(payload?.role).toBe("admin");
    expect(payload?.userId).toBe("1");
  });
});
