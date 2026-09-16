import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  describe("Google OAuth", () => {
    const origClientId = process.env.GOOGLE_CLIENT_ID;
    const origClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    let userToken: string;
    let testUserId: string;
    let oauthSuffix: string;

    beforeEach(async () => {
      process.env.GOOGLE_CLIENT_ID = "mock-google-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "mock-google-client-secret";
      oauthSuffix = Math.random().toString(36).substring(2, 8);

      // Register test user
      const regRes = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: `oauthuser_${oauthSuffix}`,
          email: `oauthuser_${oauthSuffix}@example.com`,
          password: "testPassword123!",
        }),
      });
      const regJson = await regRes.json();
      userToken = regJson.token;
      testUserId = regJson.user.id;
    });

    it("should return config status correctly", async () => {
      const res1 = await app.request("/api/auth/oauth/config");
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.google.enabled).toBe(true);

      delete process.env.GOOGLE_CLIENT_ID;
      const res2 = await app.request("/api/auth/oauth/config");
      const json2 = await res2.json();
      expect(json2.google.enabled).toBe(false);
      process.env.GOOGLE_CLIENT_ID = "mock-google-client-id";
    });

    it("should require password re-auth to initiate Google linking", async () => {
      // Missing password
      const res1 = await app.request("/api/auth/oauth/google/init-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(res1.status).toBe(400);

      // Wrong password
      const res2 = await app.request("/api/auth/oauth/google/init-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ password: "wrongPassword" }),
      });
      expect(res2.status).toBe(400);

      // Correct password
      const res3 = await app.request("/api/auth/oauth/google/init-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ password: "testPassword123!" }),
      });
      expect(res3.status).toBe(200);
      const json3 = await res3.json();
      expect(json3.url).toBeDefined();
      expect(json3.url).toContain("accounts.google.com");
      expect(json3.url).toContain("client_id=mock-google-client-id");
      expect(json3.url).toContain("state=");
    });

    it("should initiate Google login redirect", async () => {
      const res = await app.request("/api/auth/oauth/google/login?returnTo=/apps");
      expect(res.status).toBe(302);
      const loc = res.headers.get("location");
      expect(loc).toBeDefined();
      expect(loc).toContain("accounts.google.com");
      expect(loc).toContain("client_id=mock-google-client-id");
    });

    it("should link Google account on valid callback and reject collision", async () => {
      const { generateOAuthState } = await import("../lib/auth.ts");
      const googleSub = `sub_${oauthSuffix}`;
      const googleEmail = `test_${oauthSuffix}@gmail.com`;

      // Mock fetch for Google token and userinfo
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("oauth2.googleapis.com/token")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: "mock-google-access-token" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("googleapis.com/oauth2/v3/userinfo")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ sub: googleSub, email: googleEmail }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return originalFetch(url);
      });

      try {
        const linkState = generateOAuthState({
          action: "link",
          userId: testUserId,
        });

        // 1. Link to test user
        const linkRes = await app.request(
          `/api/auth/oauth/google/callback?code=mock-code&state=${linkState}`,
        );
        expect(linkRes.status).toBe(302);
        expect(linkRes.headers.get("location")).toBe("/security?oauth=linked");

        // Verify session returns linked oauth
        const sessRes = await app.request("/api/auth/session", {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        const sessJson = await sessRes.json();
        expect(sessJson.user.oauth?.google?.linked).toBe(true);
        expect(sessJson.user.oauth?.google?.email).toBe(googleEmail);

        // 2. Collision test: Another user tries to link the same Google account
        const otherSuffix = oauthSuffix + "_2";
        const otherRegRes = await app.request("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: `otheruser_${otherSuffix}`,
            email: `otheruser_${otherSuffix}@example.com`,
            password: "password123",
          }),
        });
        const otherRegJson = await otherRegRes.json();
        const otherState = generateOAuthState({
          action: "link",
          userId: otherRegJson.user.id,
        });

        const collisionRes = await app.request(
          `/api/auth/oauth/google/callback?code=mock-code&state=${otherState}`,
        );
        expect(collisionRes.status).toBe(302);
        expect(collisionRes.headers.get("location")).toBe(
          "/security?error=oauth_already_linked",
        );

        // 3. Login test for linked account
        const loginState = generateOAuthState({
          action: "login",
          returnTo: "/apps",
        });
        const loginRes = await app.request(
          `/api/auth/oauth/google/callback?code=mock-code&state=${loginState}`,
        );
        expect(loginRes.status).toBe(302);
        const loginLoc = loginRes.headers.get("location") || "";
        expect(loginLoc).toContain("/auth?oauth_token=");
        expect(loginLoc).toContain("requires_unlock=true");

        // 4. Login test for unlinked account (NO SIGN UP WITH GOOGLE)
        const unlinkedSub = `unlinked_sub_${oauthSuffix}`;
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
          if (url.includes("oauth2.googleapis.com/token")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ access_token: "mock-google-token" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          if (url.includes("googleapis.com/oauth2/v3/userinfo")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ sub: unlinkedSub, email: "unlinked@gmail.com" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return originalFetch(url);
        });

        const unlinkedLoginRes = await app.request(
          `/api/auth/oauth/google/callback?code=mock-code&state=${loginState}`,
        );
        expect(unlinkedLoginRes.status).toBe(302);
        expect(unlinkedLoginRes.headers.get("location")).toBe(
          "/auth?error=oauth_not_linked",
        );

        // 5. Unlink with password re-auth
        const unlinkWrong = await app.request("/api/auth/oauth/google/unlink", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({ password: "wrong" }),
        });
        expect(unlinkWrong.status).toBe(400);

        const unlinkOk = await app.request("/api/auth/oauth/google/unlink", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({ password: "testPassword123!" }),
        });
        expect(unlinkOk.status).toBe(200);

        // Verify unlinked
        const postUnlinkSess = await app.request("/api/auth/session", {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        const postUnlinkJson = await postUnlinkSess.json();
        expect(postUnlinkJson.user.oauth?.google).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle mobile platform Google OAuth login and callback with deep link redirect", async () => {
      const { generateOAuthState } = await import("../lib/auth.ts");
      const googleSub = `sub_mob_${oauthSuffix}`;
      const googleEmail = `test_mob_${oauthSuffix}@gmail.com`;

      // 1. Initiate login with platform=mobile
      const loginRes = await app.request(
        "/api/auth/oauth/google/login?platform=mobile&returnTo=/apps",
      );
      expect(loginRes.status).toBe(302);
      const loc = loginRes.headers.get("location") || "";
      expect(loc).toContain("accounts.google.com");

      // 2. Link account first
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("oauth2.googleapis.com/token")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: "mock-google-access-token" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("googleapis.com/oauth2/v3/userinfo")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ sub: googleSub, email: googleEmail }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return originalFetch(url);
      });

      try {
        const linkState = generateOAuthState({
          action: "link",
          userId: testUserId,
        });
        await app.request(
          `/api/auth/oauth/google/callback?code=mock-code&state=${linkState}`,
        );

        // 3. Callback with mobile platform -> should redirect to oxygenlows://auth?oauth_token=...
        const mobileLoginState = generateOAuthState({
          action: "login",
          returnTo: "/apps",
          platform: "mobile",
        });

        const callbackRes = await app.request(
          `/api/auth/oauth/google/callback?code=mock-code&state=${mobileLoginState}`,
        );
        expect(callbackRes.status).toBe(302);
        const callbackLoc = callbackRes.headers.get("location") || "";
        expect(callbackLoc.startsWith("oxygenlows://auth")).toBe(true);
        expect(callbackLoc).toContain("oauth_token=");
        expect(callbackLoc).toContain("requires_unlock=true");

        // 4. Unlinked account on mobile -> should redirect to oxygenlows://auth?error=oauth_not_linked
        const unlinkedSub = `unlinked_mob_${oauthSuffix}`;
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
          if (url.includes("oauth2.googleapis.com/token")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ access_token: "mock-google-access-token" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          if (url.includes("googleapis.com/oauth2/v3/userinfo")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ sub: unlinkedSub, email: "unlinked@gmail.com" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return originalFetch(url);
        });

        const unlinkedRes = await app.request(
          `/api/auth/oauth/google/callback?code=mock-code&state=${mobileLoginState}`,
        );
        expect(unlinkedRes.status).toBe(302);
        expect(unlinkedRes.headers.get("location")).toBe(
          "oxygenlows://auth?error=oauth_not_linked",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("GitHub OAuth", () => {
    const origClientId = process.env.GITHUB_CLIENT_ID;
    const origClientSecret = process.env.GITHUB_CLIENT_SECRET;
    let userToken: string;
    let testUserId: string;
    let oauthSuffix: string;

    beforeEach(async () => {
      process.env.GITHUB_CLIENT_ID = "mock-github-client-id";
      process.env.GITHUB_CLIENT_SECRET = "mock-github-client-secret";
      oauthSuffix = Math.random().toString(36).substring(2, 8);

      // Register test user
      const regRes = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: `ghuser_${oauthSuffix}`,
          email: `ghuser_${oauthSuffix}@example.com`,
          password: "testPassword123!",
        }),
      });
      const regJson = await regRes.json();
      userToken = regJson.token;
      testUserId = regJson.user.id;
    });

    afterEach(() => {
      if (origClientId !== undefined) {
        process.env.GITHUB_CLIENT_ID = origClientId;
      } else {
        delete process.env.GITHUB_CLIENT_ID;
      }
      if (origClientSecret !== undefined) {
        process.env.GITHUB_CLIENT_SECRET = origClientSecret;
      } else {
        delete process.env.GITHUB_CLIENT_SECRET;
      }
    });

    it("should return GitHub config status correctly", async () => {
      const res1 = await app.request("/api/auth/oauth/config");
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.github.enabled).toBe(true);

      delete process.env.GITHUB_CLIENT_ID;
      const res2 = await app.request("/api/auth/oauth/config");
      const json2 = await res2.json();
      expect(json2.github.enabled).toBe(false);
      process.env.GITHUB_CLIENT_ID = "mock-github-client-id";
    });

    it("should require password re-auth to initiate GitHub linking", async () => {
      // Missing password
      const res1 = await app.request("/api/auth/oauth/github/init-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(res1.status).toBe(400);

      // Wrong password
      const res2 = await app.request("/api/auth/oauth/github/init-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ password: "wrongPassword" }),
      });
      expect(res2.status).toBe(400);

      // Correct password
      const res3 = await app.request("/api/auth/oauth/github/init-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ password: "testPassword123!" }),
      });
      expect(res3.status).toBe(200);
      const json3 = await res3.json();
      expect(json3.url).toBeDefined();
      expect(json3.url).toContain("github.com/login/oauth/authorize");
      expect(json3.url).toContain("client_id=mock-github-client-id");
      expect(json3.url).toContain("state=");
    });

    it("should initiate GitHub login redirect", async () => {
      const res = await app.request("/api/auth/oauth/github/login?returnTo=/apps");
      expect(res.status).toBe(302);
      const loc = res.headers.get("location");
      expect(loc).toBeDefined();
      expect(loc).toContain("github.com/login/oauth/authorize");
      expect(loc).toContain("client_id=mock-github-client-id");
    });

    it("should link GitHub account on valid callback, fetch primary email, and reject collision", async () => {
      const { generateOAuthState } = await import("../lib/auth.ts");
      const githubId = `99${oauthSuffix}`;
      const githubEmail = `test_${oauthSuffix}@github.com`;

      // Mock fetch for GitHub token, user, and emails
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("github.com/login/oauth/access_token")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: "mock-github-access-token" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("api.github.com/user/emails")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                { email: "secondary@example.com", primary: false, verified: true },
                { email: githubEmail, primary: true, verified: true },
              ]),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("api.github.com/user")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: githubId, login: `gh_${oauthSuffix}`, email: null }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return originalFetch(url);
      });

      try {
        const linkState = generateOAuthState({
          action: "link",
          userId: testUserId,
        });

        // 1. Link to test user
        const linkRes = await app.request(
          `/api/auth/oauth/github/callback?code=mock-code&state=${linkState}`,
        );
        expect(linkRes.status).toBe(302);
        expect(linkRes.headers.get("location")).toBe("/security?oauth=linked&provider=github");

        // Verify session returns linked oauth
        const sessRes = await app.request("/api/auth/session", {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        const sessJson = await sessRes.json();
        expect(sessJson.user.oauth?.github?.linked).toBe(true);
        expect(sessJson.user.oauth?.github?.email).toBe(githubEmail);

        // 2. Collision test: Another user tries to link the same GitHub account
        const otherSuffix = oauthSuffix + "_2";
        const otherRegRes = await app.request("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: `otherghuser_${otherSuffix}`,
            email: `otherghuser_${otherSuffix}@example.com`,
            password: "password123",
          }),
        });
        const otherRegJson = await otherRegRes.json();
        const otherState = generateOAuthState({
          action: "link",
          userId: otherRegJson.user.id,
        });

        const collisionRes = await app.request(
          `/api/auth/oauth/github/callback?code=mock-code&state=${otherState}`,
        );
        expect(collisionRes.status).toBe(302);
        expect(collisionRes.headers.get("location")).toBe(
          "/security?error=oauth_already_linked&provider=github",
        );

        // 3. Login test for linked account
        const loginState = generateOAuthState({
          action: "login",
          returnTo: "/apps",
        });
        const loginRes = await app.request(
          `/api/auth/oauth/github/callback?code=mock-code&state=${loginState}`,
        );
        expect(loginRes.status).toBe(302);
        const loginLoc = loginRes.headers.get("location") || "";
        expect(loginLoc).toContain("/auth?oauth_token=");
        expect(loginLoc).toContain("requires_unlock=true");

        // 4. Login test for unlinked account
        const unlinkedId = `unlinked_${oauthSuffix}`;
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
          if (url.includes("github.com/login/oauth/access_token")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ access_token: "mock-github-token" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          if (url.includes("api.github.com/user")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ id: unlinkedId, login: "unlinked", email: "unlinked@github.com" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return originalFetch(url);
        });

        const unlinkedLoginRes = await app.request(
          `/api/auth/oauth/github/callback?code=mock-code&state=${loginState}`,
        );
        expect(unlinkedLoginRes.status).toBe(302);
        expect(unlinkedLoginRes.headers.get("location")).toBe(
          "/auth?error=oauth_not_linked&provider=github",
        );

        // 5. Unlink with password re-auth
        const unlinkWrong = await app.request("/api/auth/oauth/github/unlink", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({ password: "wrong" }),
        });
        expect(unlinkWrong.status).toBe(400);

        const unlinkOk = await app.request("/api/auth/oauth/github/unlink", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({ password: "testPassword123!" }),
        });
        expect(unlinkOk.status).toBe(200);

        // Verify unlinked
        const postUnlinkSess = await app.request("/api/auth/session", {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        const postUnlinkJson = await postUnlinkSess.json();
        expect(postUnlinkJson.user.oauth?.github).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle mobile platform GitHub OAuth login and callback with deep link redirect", async () => {
      const { generateOAuthState } = await import("../lib/auth.ts");
      const githubId = `99mob_${oauthSuffix}`;
      const githubEmail = `test_mob_${oauthSuffix}@github.com`;

      // 1. Initiate login with platform=mobile
      const loginRes = await app.request(
        "/api/auth/oauth/github/login?platform=mobile&returnTo=/apps",
      );
      expect(loginRes.status).toBe(302);
      const loc = loginRes.headers.get("location") || "";
      expect(loc).toContain("github.com/login/oauth/authorize");

      // 2. Link account first
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("github.com/login/oauth/access_token")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ access_token: "mock-github-access-token" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("api.github.com/user/emails")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                { email: githubEmail, primary: true, verified: true },
              ]),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("api.github.com/user")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: githubId, login: `gh_mob_${oauthSuffix}`, email: null }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return originalFetch(url);
      });

      try {
        const linkState = generateOAuthState({
          action: "link",
          userId: testUserId,
        });
        await app.request(
          `/api/auth/oauth/github/callback?code=mock-code&state=${linkState}`,
        );

        // 3. Callback with mobile platform -> should redirect to oxygenlows://auth?oauth_token=...
        const mobileLoginState = generateOAuthState({
          action: "login",
          returnTo: "/apps",
          platform: "mobile",
        });

        const callbackRes = await app.request(
          `/api/auth/oauth/github/callback?code=mock-code&state=${mobileLoginState}`,
        );
        expect(callbackRes.status).toBe(302);
        const callbackLoc = callbackRes.headers.get("location") || "";
        expect(callbackLoc.startsWith("oxygenlows://auth")).toBe(true);
        expect(callbackLoc).toContain("oauth_token=");
        expect(callbackLoc).toContain("requires_unlock=true");

        // 4. Unlinked account on mobile -> should redirect to oxygenlows://auth?error=oauth_not_linked&provider=github
        const unlinkedId = `unlinked_mob_${oauthSuffix}`;
        globalThis.fetch = vi.fn().mockImplementation((url: string) => {
          if (url.includes("github.com/login/oauth/access_token")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ access_token: "mock-github-token" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          if (url.includes("api.github.com/user")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ id: unlinkedId, login: "unlinked", email: "unlinked@github.com" }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return originalFetch(url);
        });

        const unlinkedRes = await app.request(
          `/api/auth/oauth/github/callback?code=mock-code&state=${mobileLoginState}`,
        );
        expect(unlinkedRes.status).toBe(302);
        expect(unlinkedRes.headers.get("location")).toBe(
          "oxygenlows://auth?error=oauth_not_linked&provider=github",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
