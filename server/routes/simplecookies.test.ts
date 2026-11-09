import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { simplecookiesRouter } from "./simplecookies.ts";
import { authRouter } from "./auth.ts";

const app = new Hono();
app.route("/api/auth", authRouter);
app.route("/api/simplecookies", simplecookiesRouter);

describe("SimpleCookies with local accounts", () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  let authToken = "";
  let projectId = "";
  let apiKey = "";

  it("registers and creates a project with sk_ key", async () => {
    const reg = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `scuser_${uniqueSuffix}`,
        email: `scuser_${uniqueSuffix}@example.com`,
        password: "securePassword123",
      }),
    });
    expect(reg.status).toBe(200);
    authToken = (await reg.json()).token;

    const created = await app.request("/api/simplecookies/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ name: "My Site", domain: "example.com" }),
    });
    expect(created.status).toBe(201);
    const json = await created.json();
    projectId = json.id;
    apiKey = json.apiKey;
    expect(apiKey.startsWith("sk_")).toBe(true);
    expect(json.api_key_prefix).toBeDefined();
    expect(json.api_key_hash).toBeUndefined();
  });

  it("verify returns banner config + declaration", async () => {
    const res = await app.request("/api/simplecookies/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(projectId);
    expect(json.config.title).toBeTruthy();
    expect(json.config.policyVersion).toBe(1);
    expect(Array.isArray(json.declaration)).toBe(true);
  });

  it("rejects invalid API key", async () => {
    const res = await app.request("/api/simplecookies/verify", {
      method: "POST",
      headers: { Authorization: "Bearer sk_invalid" },
    });
    expect(res.status).toBe(401);
  });

  it("logs consents and reports stats", async () => {
    const logged = await app.request("/api/simplecookies/consent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        consentId: "test-consent-1",
        selection: { preferences: true, statistics: false, marketing: false, custom: false },
        policyVersion: 1,
      }),
    });
    expect(logged.status).toBe(201);
    expect((await logged.json()).logged).toBe(1);

    const stats = await app.request(
      `/api/simplecookies/projects/${projectId}/stats`,
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
    expect(stats.status).toBe(200);
    const json = await stats.json();
    expect(json.total).toBeGreaterThanOrEqual(1);
  });

  it("does not leak projects across users (IDOR)", async () => {
    const reg2 = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `scuser2_${uniqueSuffix}`,
        email: `scuser2_${uniqueSuffix}@example.com`,
        password: "securePassword123",
      }),
    });
    const token2 = (await reg2.json()).token;
    const res = await app.request(`/api/simplecookies/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(res.status).toBe(404);
  });

  it("rotates key and old key stops working", async () => {
    const rotated = await app.request(
      `/api/simplecookies/projects/${projectId}/rotate-key`,
      { method: "POST", headers: { Authorization: `Bearer ${authToken}` } },
    );
    expect(rotated.status).toBe(200);
    const newKey = (await rotated.json()).apiKey;
    expect(newKey.startsWith("sk_")).toBe(true);

    const oldVerify = await app.request("/api/simplecookies/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(oldVerify.status).toBe(401);

    const newVerify = await app.request("/api/simplecookies/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${newKey}` },
    });
    expect(newVerify.status).toBe(200);
  });

  it("updates declaration and reads public declaration", async () => {
    const put = await app.request(
      `/api/simplecookies/projects/${projectId}/declaration`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          cookies: [
            { name: "_ga", provider: "Google Analytics", purpose: "Stats", expiry: "2 years", category: "statistics" },
          ],
        }),
      },
    );
    expect(put.status).toBe(200);

    const pub = await app.request(`/api/simplecookies/declaration/${projectId}`);
    expect(pub.status).toBe(200);
    const json = await pub.json();
    expect(json.declaration).toHaveLength(1);
    expect(json.declaration[0].name).toBe("_ga");
    expect(json.api_key_hash).toBeUndefined();
  });
});
