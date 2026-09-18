import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authRouter } from "./auth.ts";
import {
  saveUserPasskey,
  getUserPasskeys,
  deleteUserPasskey,
  findUserByPasskeyId,
  renameUserPasskey,
  updatePasskeyCounter,
  saveChallenge,
  consumeChallenge,
  getRpId,
  getExpectedOrigin,
  invalidatePasskeyIndex,
  type StoredPasskey,
} from "../lib/passkeys.ts";

const app = new Hono();
app.route("/api/auth", authRouter);

describe("Passkeys (WebAuthn) API & Lib", () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  let authToken = "";
  let userId = "";
  const username = `passkey_user_${uniqueSuffix}`;
  const password = "securePassword123";
  const email = `passkey_${uniqueSuffix}@example.com`;

  beforeEach(() => {
    invalidatePasskeyIndex();
  });

  it("should register a user for passkey testing", async () => {
    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    expect(regRes.status).toBe(200);
    const regData = await regRes.json();
    expect(regData.token).toBeDefined();
    authToken = regData.token;
    userId = regData.user.id;
  });

  it("should generate login options publicly", async () => {
    const res = await app.request("/api/auth/passkey/login-options", {
      headers: { host: "localhost:3000" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.options).toBeDefined();
    expect(data.options.challenge).toBeDefined();
    expect(data.options.rpId).toBe("localhost");
  });

  it("should require authentication and password verification for register-options", async () => {
    // 1. Without auth
    const unauthRes = await app.request("/api/auth/passkey/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    expect(unauthRes.status).toBe(401);

    // 2. Without password
    const noPassRes = await app.request("/api/auth/passkey/register-options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(noPassRes.status).toBe(400);
    const noPassData = await noPassRes.json();
    expect(noPassData.error).toContain("Password is required");

    // 3. With wrong password
    const wrongPassRes = await app.request("/api/auth/passkey/register-options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ password: "wrongpassword" }),
    });
    expect(wrongPassRes.status).toBe(400);
    const wrongPassData = await wrongPassRes.json();
    expect(wrongPassData.error).toContain("Incorrect password");

    // 4. With correct password
    const validRes = await app.request("/api/auth/passkey/register-options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        host: "localhost:3000",
      },
      body: JSON.stringify({ password, nickname: "My Test Device" }),
    });
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.options).toBeDefined();
    expect(validData.options.challenge).toBeDefined();
    expect(validData.options.rp.name).toBe("Oxygen Low's Software");
    expect(validData.options.rp.id).toBe("localhost");
  });

  it("should manage passkeys in data store directly and list via API", async () => {
    const mockCredId = `test_cred_${Date.now()}`;
    const mockPublicKey = Buffer.from("test-mock-public-key-bytes").toString("base64url");

    const mockPasskey: StoredPasskey = {
      id: mockCredId,
      name: "MacBook Touch ID",
      publicKey: mockPublicKey,
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      transports: ["internal"],
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    // Save passkey
    saveUserPasskey(userId, mockPasskey);

    // Verify stored passkeys
    const passkeys = getUserPasskeys(userId);
    expect(passkeys.some((pk) => pk.id === mockCredId)).toBe(true);

    // Test findUserByPasskeyId lookup
    const found = findUserByPasskeyId(mockCredId);
    expect(found).not.toBeNull();
    expect(String(found?.user.id)).toBe(String(userId));
    expect(found?.passkey.name).toBe("MacBook Touch ID");

    // List via API
    const listRes = await app.request("/api/auth/passkey/list", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(Array.isArray(listData.passkeys)).toBe(true);
    const apiPasskey = listData.passkeys.find((pk: any) => pk.id === mockCredId);
    expect(apiPasskey).toBeDefined();
    expect(apiPasskey.name).toBe("MacBook Touch ID");

    // Rename via API
    const renameRes = await app.request("/api/auth/passkey/rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        credentialId: mockCredId,
        name: "Home Office Mac",
      }),
    });
    expect(renameRes.status).toBe(200);

    const renamed = findUserByPasskeyId(mockCredId);
    expect(renamed?.passkey.name).toBe("Home Office Mac");

    // Update counter
    updatePasskeyCounter(userId, mockCredId, 5);
    const updated = findUserByPasskeyId(mockCredId);
    expect(updated?.passkey.counter).toBe(5);
    expect(updated?.passkey.lastUsedAt).toBeDefined();

    // Delete with wrong password
    const deleteWrongRes = await app.request("/api/auth/passkey/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        credentialId: mockCredId,
        password: "wrongpassword",
      }),
    });
    expect(deleteWrongRes.status).toBe(400);

    // Delete with correct password
    const deleteCorrectRes = await app.request("/api/auth/passkey/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        credentialId: mockCredId,
        password,
      }),
    });
    expect(deleteCorrectRes.status).toBe(200);

    // Verify deletion
    const afterDelete = findUserByPasskeyId(mockCredId);
    expect(afterDelete).toBeNull();
  });

  it("should handle challenges with TTL and consume correctly", () => {
    const challenge = "test_challenge_abc_123";
    saveChallenge(challenge, "user_99");

    // Matching user consumes successfully
    expect(consumeChallenge(challenge, "user_99")).toBe(true);

    // Second consumption fails (replay protection)
    expect(consumeChallenge(challenge, "user_99")).toBe(false);

    // Wrong user fails
    const challenge2 = "test_challenge_xyz_789";
    saveChallenge(challenge2, "user_100");
    expect(consumeChallenge(challenge2, "user_different")).toBe(false);
  });

  it("should determine RP ID and origin accurately", () => {
    const mockContext = {
      req: {
        header: (name: string) => {
          if (name === "host") return "app.oxygenlow.com:8443";
          if (name === "x-forwarded-proto") return "https";
          return undefined;
        },
      },
    };

    expect(getRpId(mockContext)).toBe("app.oxygenlow.com");
    expect(getExpectedOrigin(mockContext)).toBe("https://app.oxygenlow.com:8443");
  });
});
