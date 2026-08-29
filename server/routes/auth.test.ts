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
});
