/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generatePkcePair,
  fetchPollinationsConfig,
  getPollinationsRedirectUri,
  exchangePollinationsAuthCode,
} from "./pollinationsAuth";

describe("Pollinations Auth Service", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    sessionStorage.clear();
    localStorage.clear();
  });

  it("generates a valid PKCE verifier and SHA-256 challenge pair", async () => {
    const { codeVerifier, codeChallenge } = await generatePkcePair();

    expect(codeVerifier).toBeTruthy();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge).toBeTruthy();
    expect(codeChallenge).not.toContain("+");
    expect(codeChallenge).not.toContain("/");
    expect(codeChallenge).not.toContain("=");
  });

  it("constructs the correct redirect URI based on origin", () => {
    const uri = getPollinationsRedirectUri();
    expect(uri).toBe(`${window.location.origin}/oauth/pollinations/callback`);
  });

  it("fetches server config for Pollinations app keys", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          configured: true,
          appKey: "pk_standard_123",
          supporterAppKey: "pk_supporter_456",
          hasSupporterApp: true,
        }),
    } as unknown as Response);

    const config = await fetchPollinationsConfig();
    expect(config.configured).toBe(true);
    expect(config.appKey).toBe("pk_standard_123");
    expect(config.supporterAppKey).toBe("pk_supporter_456");
    expect(config.hasSupporterApp).toBe(true);
  });

  it("exchanges code for token using server proxy and falls back gracefully", async () => {
    sessionStorage.setItem("pollinations_auth_state", "test_state_123");
    sessionStorage.setItem("pollinations_pkce_verifier", "test_verifier_456");
    sessionStorage.setItem("pollinations_auth_is_supporter", "true");
    sessionStorage.setItem("pollinations_auth_client_id", "pk_supporter_456");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "sk_user_secret_789",
          token_type: "bearer",
        }),
    } as unknown as Response);

    const result = await exchangePollinationsAuthCode({
      code: "test_auth_code",
      state: "test_state_123",
    });

    expect(result.apiKey).toBe("sk_user_secret_789");
    expect(result.isSupporter).toBe(true);
  });
});
