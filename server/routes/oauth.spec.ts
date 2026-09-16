import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { oauthRouter, hashApiKey, isValidRedirectUri } from "./oauth.ts";
import { generateToken } from "../lib/auth.ts";
import { initUserFolder } from "../lib/dataStore.ts";

const app = new Hono();
app.route("/api/oauth", oauthRouter);

describe("OAuth & Developer Auth Router", () => {
  const devUser = {
    id: "9001",
    username: "dev_tester",
    email: "dev@example.com",
    role: "user",
  };
  const endUser = {
    id: "9002",
    username: "end_user",
    email: "enduser@example.com",
    role: "user",
  };

  const devToken = generateToken(devUser);
  const endUserToken = generateToken(endUser);

  beforeEach(() => {
    initUserFolder(devUser.id, {
      username: devUser.username,
      email: devUser.email,
      authVerifier: "test_verifier_hash",
      authSalt: "test_salt",
    });
    initUserFolder(endUser.id, {
      username: endUser.username,
      email: endUser.email,
      authVerifier: "test_verifier_hash",
      authSalt: "test_salt",
    });
  });

  describe("Utility & Validator Functions", () => {
    it("validates redirect URIs correctly", () => {
      expect(isValidRedirectUri("http://localhost:3000/callback")).toBe(true);
      expect(isValidRedirectUri("http://127.0.0.1:8080/auth")).toBe(true);
      expect(isValidRedirectUri("https://myapp.com/api/callback")).toBe(true);

      // Insecure production domain
      expect(isValidRedirectUri("http://myapp.com/api/callback")).toBe(false);
      // Fragment not allowed
      expect(isValidRedirectUri("https://myapp.com/callback#token=123")).toBe(false);
      // Malformed URI
      expect(isValidRedirectUri("not-a-url")).toBe(false);
    });

    it("hashes api keys with sha256", () => {
      const key = "ol_sec_1234567890";
      const hash = hashApiKey(key);
      expect(hash).toHaveLength(64);
      expect(hashApiKey(key)).toBe(hash);
    });
  });

  describe("Developer App Management", () => {
    let createdApp: any;
    let createdApiKey: string;

    it("rejects unauthorized app creation", async () => {
      const res = await app.request("/api/oauth/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test App" }),
      });
      expect(res.status).toBe(401);
    });

    it("validates input when creating an app", async () => {
      // Missing redirect URI
      const res1 = await app.request("/api/oauth/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({ name: "Test App", redirect_uris: [] }),
      });
      expect(res1.status).toBe(400);

      // Insecure production redirect URI
      const res2 = await app.request("/api/oauth/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({
          name: "Test App",
          redirect_uris: ["http://insecure-domain.com/callback"],
        }),
      });
      expect(res2.status).toBe(400);
    });

    it("creates an OAuth app and returns client_id + api_key once", async () => {
      const res = await app.request("/api/oauth/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({
          name: "My Awesome Game",
          description: "A developer client app",
          website_url: "https://myawesomegame.com",
          redirect_uris: [
            "http://localhost:3000/api/auth/callback",
            "https://myawesomegame.com/auth/callback",
          ],
          allowed_scopes: ["username", "display_name", "email", "profile_picture"],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.app).toBeDefined();
      expect(data.app.name).toBe("My Awesome Game");
      expect(data.app.client_id.startsWith("ol_app_")).toBe(true);
      expect(data.apiKey.startsWith("ol_sec_")).toBe(true);
      expect(data.app.api_key_hash).toBeUndefined(); // Never expose hash in public app
      expect(data.app.allowed_scopes).toContain("email");

      createdApp = data.app;
      createdApiKey = data.apiKey;
    });

    it("lists apps created by the developer", async () => {
      const res = await app.request("/api/oauth/apps", {
        headers: { Authorization: `Bearer ${devToken}` },
      });
      expect(res.status).toBe(200);
      const apps = await res.json();
      expect(Array.isArray(apps)).toBe(true);
      expect(apps.some((a: any) => a.id === createdApp.id)).toBe(true);
    });

    it("updates app settings", async () => {
      const res = await app.request(`/api/oauth/apps/${createdApp.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({
          name: "My Awesome Game (Updated)",
          description: "Updated description",
        }),
      });
      expect(res.status).toBe(200);
      const updated = await res.json();
      expect(updated.name).toBe("My Awesome Game (Updated)");
      expect(updated.description).toBe("Updated description");
    });

    it("regenerates API key", async () => {
      const res = await app.request(
        `/api/oauth/apps/${createdApp.id}/regenerate-key`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${devToken}` },
        },
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.apiKey.startsWith("ol_sec_")).toBe(true);
      expect(data.apiKey).not.toBe(createdApiKey);
      createdApiKey = data.apiKey;
    });

    it("retrieves app authorization stats", async () => {
      const res = await app.request(`/api/oauth/apps/${createdApp.id}/stats`, {
        headers: { Authorization: `Bearer ${devToken}` },
      });
      expect(res.status).toBe(200);
      const stats = await res.json();
      expect(stats.total_authorized_users).toBe(0);
      expect(stats.active_tokens).toBe(0);
    });
  });

  describe("End-to-End OAuth 2.0 Authorization Flow", () => {
    let testApp: any;
    let testApiKey: string;

    beforeEach(async () => {
      // Setup fresh test app
      const res = await app.request("/api/oauth/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({
          name: "OAuth Test Client",
          redirect_uris: ["http://localhost:5173/auth/callback"],
          allowed_scopes: ["username", "display_name", "email", "bio"],
        }),
      });
      const data = await res.json();
      testApp = data.app;
      testApiKey = data.apiKey;
    });

    it("fetches authorization details for consent screen", async () => {
      const res = await app.request(
        `/api/oauth/authorize-details?client_id=${testApp.client_id}&redirect_uri=${encodeURIComponent(
          "http://localhost:5173/auth/callback",
        )}&scope=username%20email`,
        {
          headers: { Authorization: `Bearer ${endUserToken}` },
        },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.app.name).toBe("OAuth Test Client");
      expect(data.requested_scopes).toEqual(["username", "email"]);
      expect(data.user_consented).toBe(false);
      expect(data.logged_in).toBe(true);
      expect(data.user.username).toBe(endUser.username);
    });

    it("rejects authorize-details with invalid redirect URI", async () => {
      const res = await app.request(
        `/api/oauth/authorize-details?client_id=${testApp.client_id}&redirect_uri=http://evil.com/callback`,
      );
      expect(res.status).toBe(400);
    });

    it("handles user denial of authorization", async () => {
      const res = await app.request("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${endUserToken}`,
        },
        body: JSON.stringify({
          client_id: testApp.client_id,
          redirect_uri: "http://localhost:5173/auth/callback",
          action: "deny",
          state: "xyz123",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.redirect_url).toContain("error=access_denied");
      expect(data.redirect_url).toContain("state=xyz123");
    });

    it("authorizes user, issues code, exchanges code for access token, and fetches userinfo", async () => {
      // 1. End-user authorizes app
      const authRes = await app.request("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${endUserToken}`,
        },
        body: JSON.stringify({
          client_id: testApp.client_id,
          redirect_uri: "http://localhost:5173/auth/callback",
          scope: "username email",
          action: "allow",
          state: "random_csrf_state",
        }),
      });

      expect(authRes.status).toBe(200);
      const authData = await authRes.json();
      expect(authData.redirect_url).toContain("code=ol_code_");
      expect(authData.redirect_url).toContain("state=random_csrf_state");

      const parsedUrl = new URL(authData.redirect_url);
      const code = parsedUrl.searchParams.get("code")!;
      expect(code).toBeDefined();

      // 2. Developer backend exchanges authorization code for access token using client_id + client_secret
      const tokenRes = await app.request("/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: testApp.client_id,
          client_secret: testApiKey,
          code,
          redirect_uri: "http://localhost:5173/auth/callback",
        }),
      });

      expect(tokenRes.status).toBe(200);
      const tokenData = await tokenRes.json();
      expect(tokenData.access_token.startsWith("ol_at_")).toBe(true);
      expect(tokenData.token_type).toBe("Bearer");
      expect(tokenData.expires_in).toBe(2592000); // 30 days
      expect(tokenData.user.id).toBe(endUser.id);
      expect(tokenData.user.username).toBe(endUser.username);
      expect(tokenData.user.email).toBe(endUser.email);
      // bio was not in requested scope, so should not be present
      expect(tokenData.user.bio).toBeUndefined();

      const accessToken = tokenData.access_token;

      // 3. Re-using authorization code must fail
      const reuseRes = await app.request("/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: testApp.client_id,
          client_secret: testApiKey,
          code,
          redirect_uri: "http://localhost:5173/auth/callback",
        }),
      });
      expect(reuseRes.status).toBe(400);

      // 4. Fetch user info using Bearer access token
      const userinfoRes = await app.request("/api/oauth/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(userinfoRes.status).toBe(200);
      const userInfo = await userinfoRes.json();
      expect(userInfo.id).toBe(endUser.id);
      expect(userInfo.username).toBe(endUser.username);
      expect(userInfo.email).toBe(endUser.email);

      // 5. Check user grants in account settings
      const grantsRes = await app.request("/api/oauth/user/grants", {
        headers: { Authorization: `Bearer ${endUserToken}` },
      });
      expect(grantsRes.status).toBe(200);
      const grants = await grantsRes.json();
      expect(grants.length).toBeGreaterThan(0);
      const grant = grants.find((g: any) => g.client_id === testApp.client_id);
      expect(grant).toBeDefined();
      expect(grant.app_name).toBe("OAuth Test Client");

      // 6. Revoke access token
      const revokeRes = await app.request("/api/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken }),
      });
      expect(revokeRes.status).toBe(200);

      // 7. userinfo with revoked token must fail
      const revokedUserinfoRes = await app.request("/api/oauth/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(revokedUserinfoRes.status).toBe(401);
    });

    it("allows user to revoke authorized application grant in account settings", async () => {
      // Authorize app
      await app.request("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${endUserToken}`,
        },
        body: JSON.stringify({
          client_id: testApp.client_id,
          redirect_uri: "http://localhost:5173/auth/callback",
          action: "allow",
        }),
      });

      // Get grant ID
      const listRes = await app.request("/api/oauth/user/grants", {
        headers: { Authorization: `Bearer ${endUserToken}` },
      });
      const grants = await listRes.json();
      const grant = grants.find((g: any) => g.client_id === testApp.client_id);
      expect(grant).toBeDefined();

      // Revoke grant
      const delRes = await app.request(`/api/oauth/user/grants/${grant.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${endUserToken}` },
      });
      expect(delRes.status).toBe(200);

      // Verify list is now empty of this grant
      const afterRes = await app.request("/api/oauth/user/grants", {
        headers: { Authorization: `Bearer ${endUserToken}` },
      });
      const afterGrants = await afterRes.json();
      expect(afterGrants.some((g: any) => g.id === grant.id)).toBe(false);
    });
  });
});
