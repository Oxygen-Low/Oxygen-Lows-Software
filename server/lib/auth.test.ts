import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  generateSalt,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  resolveUserFromToken,
} from "./auth.ts";
import { getUserById } from "./dataStore.ts";

vi.mock("./dataStore.ts", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getUserById: vi.fn(),
  };
});

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

describe("resolveUserFromToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null if token is empty", async () => {
    const result = await resolveUserFromToken("");
    expect(result).toBeNull();
  });

  it("should return null if token is invalid", async () => {
    const result = await resolveUserFromToken("invalid-token");
    expect(result).toBeNull();
  });

  it("should return null if user is not found in dataStore", async () => {
    const user = { id: "99", username: "test", email: "test@example.com" };
    const token = generateToken(user);

    vi.mocked(getUserById).mockReturnValue(null);

    const result = await resolveUserFromToken(token);
    expect(result).toBeNull();
    expect(getUserById).toHaveBeenCalledWith("99");
  });

  it("should return user object if user is found", async () => {
    const tokenUser = {
      id: "42",
      username: "testuser",
      email: "test@example.com",
    };
    const token = generateToken(tokenUser);

    vi.mocked(getUserById).mockReturnValue({
      id: "42",
      username: "testuser",
      email: "test@example.com",
      role: "user",
    });

    const result = await resolveUserFromToken(token);
    expect(result).toEqual({
      id: "42",
      email: "test@example.com",
      username: "testuser",
      role: "user",
      user_metadata: {
        username: "testuser",
        full_name: "testuser",
      },
    });
    expect(getUserById).toHaveBeenCalledWith("42");
  });

  it("should assign admin role if user id is 1", async () => {
    const tokenUser = {
      id: "1",
      username: "admin",
      email: "admin@example.com",
    };
    const token = generateToken(tokenUser);

    vi.mocked(getUserById).mockReturnValue({
      id: "1",
      username: "admin",
      email: "admin@example.com",
      role: "user", // DB says user, but id is 1
    });

    const result = await resolveUserFromToken(token);
    expect(result?.role).toBe("admin");
  });

  it("should assign admin role if db user role is admin", async () => {
    const tokenUser = {
      id: "42",
      username: "admin2",
      email: "admin2@example.com",
    };
    const token = generateToken(tokenUser);

    vi.mocked(getUserById).mockReturnValue({
      id: "42",
      username: "admin2",
      email: "admin2@example.com",
      role: "admin",
    });

    const result = await resolveUserFromToken(token);
    expect(result?.role).toBe("admin");
  });
});
