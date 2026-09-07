import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authRouter } from "./auth.ts";

const app = new Hono();
app.route("/api/auth", authRouter);

describe("authRouter", () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  it("should register a new local user successfully", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `reguser_${uniqueSuffix}`,
        email: `reguser_${uniqueSuffix}@example.com`,
        password: "securePassword123",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user).toBeDefined();
    expect(json.token).toBeDefined();
    expect(json.token.startsWith("ol_")).toBe(true);
    expect(json.user.username).toBe(`reguser_${uniqueSuffix}`);
  });

  it("should reject registration with invalid fields or duplicate username", async () => {
    // Short username
    const res1 = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "ab",
        email: "ab@example.com",
        password: "securePassword123",
      }),
    });
    expect(res1.status).toBe(400);

    // Duplicate username
    const res2 = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `reguser_${uniqueSuffix}`,
        email: `another_${uniqueSuffix}@example.com`,
        password: "securePassword123",
      }),
    });
    expect(res2.status).toBe(400);
  });

  it("should login with username or email and verify session", async () => {
    // Login with username
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: `reguser_${uniqueSuffix}`,
        password: "securePassword123",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();

    // Verify session
    const sessionRes = await app.request("/api/auth/session", {
      method: "GET",
      headers: { Authorization: `Bearer ${json.token}` },
    });
    expect(sessionRes.status).toBe(200);
    const sessionJson = await sessionRes.json();
    expect(sessionJson.user.username).toBe(`reguser_${uniqueSuffix}`);
  });

  it("should reject invalid login credentials", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: `reguser_${uniqueSuffix}`,
        password: "wrongPassword!",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("should detect unmigrated account and migrate credentials successfully", async () => {
    const migSuffix = Date.now().toString().slice(-6) + "_mig";
    // Register user with null auth_verifier (simulate wiped account)
    const { initUserFolder, getNextUserId } = await import("../lib/dataStore.ts");
    const uid = getNextUserId();
    initUserFolder(uid, {
      username: `miguser_${migSuffix}`,
      email: `miguser_${migSuffix}@example.com`,
      authVerifier: null,
      authSalt: null,
    });

    // Attempt login -> should return needsMigration: true
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: `miguser_${migSuffix}`,
      }),
    });
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.needsMigration).toBe(true);
    expect(loginJson.user.username).toBe(`miguser_${migSuffix}`);

    // Call migrate-account with new password
    const migRes = await app.request("/api/auth/migrate-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: `miguser_${migSuffix}`,
        password: "newSecurePassword456!",
      }),
    });
    expect(migRes.status).toBe(200);
    const migJson = await migRes.json();
    expect(migJson.token).toBeDefined();

    // Now login should succeed with the new password
    const postMigLoginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: `miguser_${migSuffix}`,
        password: "newSecurePassword456!",
      }),
    });
    expect(postMigLoginRes.status).toBe(200);
    const postMigLoginJson = await postMigLoginRes.json();
    expect(postMigLoginJson.token).toBeDefined();
  });
});
