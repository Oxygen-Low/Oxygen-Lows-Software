import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OxygenAuth, OxygenAuthError } from "./index.js";

describe("OxygenAuth Universal Client SDK", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws error if initialized without clientId", () => {
    expect(() => new OxygenAuth({ clientId: "" })).toThrow(OxygenAuthError);
  });

  it("builds correct authorization URL with scopes and state", () => {
    const auth = new OxygenAuth({
      clientId: "ol_app_1234567890abcdef",
      baseUrl: "https://oxygenlow.com",
    });

    const url = auth.getAuthorizationUrl({
      redirectUri: "http://localhost:3000/callback",
      scopes: ["username", "email", "bio"],
      state: "csrf_token_abc",
    });

    expect(url).toContain("https://oxygenlow.com/oauth/authorize");
    expect(url).toContain("client_id=ol_app_1234567890abcdef");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback");
    expect(url).toContain("scope=username+email+bio");
    expect(url).toContain("state=csrf_token_abc");
  });

  it("throws if redirectUri is missing in getAuthorizationUrl", () => {
    const auth = new OxygenAuth({ clientId: "ol_app_test" });
    expect(() => auth.getAuthorizationUrl({ redirectUri: "" })).toThrow(
      OxygenAuthError,
    );
  });

  it("exchanges authorization code for token and user profile", async () => {
    const auth = new OxygenAuth({
      clientId: "ol_app_test",
      apiKey: "ol_sec_test",
      baseUrl: "https://test.oxygenlow.com",
    });

    const mockResponse = {
      access_token: "ol_at_dummy_token",
      token_type: "Bearer",
      expires_in: 2592000,
      scope: "username email",
      user: {
        id: "42",
        username: "johndoe",
        email: "john@example.com",
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as any);

    const res = await auth.exchangeCode({
      code: "ol_code_12345",
      redirectUri: "http://localhost:3000/callback",
    });

    expect(res.accessToken).toBe("ol_at_dummy_token");
    expect(res.tokenType).toBe("Bearer");
    expect(res.expiresIn).toBe(2592000);
    expect(res.user.username).toBe("johndoe");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.oxygenlow.com/api/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: "ol_app_test",
          client_secret: "ol_sec_test",
          code: "ol_code_12345",
          redirect_uri: "http://localhost:3000/callback",
        }),
      }),
    );
  });

  it("throws OxygenAuthError when token exchange returns non-200", async () => {
    const auth = new OxygenAuth({
      clientId: "ol_app_test",
      apiKey: "ol_sec_test",
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "invalid_grant",
        error_description: "Authorization code has expired",
      }),
    } as any);

    await expect(
      auth.exchangeCode({ code: "expired_code" }),
    ).rejects.toThrow("Authorization code has expired");
  });

  it("fetches user info using bearer access token", async () => {
    const auth = new OxygenAuth({ clientId: "ol_app_test" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "100",
        username: "alice",
        email: "alice@example.com",
      }),
    } as any);

    const user = await auth.getUserInfo("ol_at_token_abc");
    expect(user.id).toBe("100");
    expect(user.username).toBe("alice");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://oxygenlow.com/api/oauth/userinfo",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer ol_at_token_abc",
          Accept: "application/json",
        },
      }),
    );
  });

  it("verifies and revokes tokens", async () => {
    const auth = new OxygenAuth({ clientId: "ol_app_test" });

    // Verify valid
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "100", username: "alice" }),
    } as any);
    const validCheck = await auth.verifyToken("valid_token");
    expect(validCheck.valid).toBe(true);
    expect(validCheck.user?.username).toBe("alice");

    // Verify invalid
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_token" }),
    } as any);
    const invalidCheck = await auth.verifyToken("invalid_token");
    expect(invalidCheck.valid).toBe(false);

    // Revoke
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as any);
    const revoked = await auth.revokeToken("token_to_revoke");
    expect(revoked).toBe(true);
  });
});
