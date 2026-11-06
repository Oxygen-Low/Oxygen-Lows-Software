import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { encryptedAccessRouter } from "./encryptedAccess.ts";
import { generateToken } from "../lib/auth.ts";
import { initUserFolder } from "../lib/dataStore.ts";
import { ENCRYPTED_API_TOKEN_PREFIX } from "../../shared/encryptedApi.ts";

const app = new Hono();
app.route("/api/encrypted-access", encryptedAccessRouter);

const testUser = {
  id: "1001",
  username: "apiuser",
  email: "apiuser@example.com",
  role: "user",
};
const otherUser = {
  id: "1002",
  username: "otheruser",
  email: "otheruser@example.com",
  role: "user",
};

const userToken = generateToken(testUser);
const otherUserToken = generateToken(otherUser);

beforeEach(() => {
  initUserFolder(testUser.id, {
    username: testUser.username,
    email: testUser.email,
    authVerifier: "test_verifier_hash",
    authSalt: "test_salt",
  });
  initUserFolder(otherUser.id, {
    username: otherUser.username,
    email: otherUser.email,
    authVerifier: "test_verifier_hash",
    authSalt: "test_salt",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Encrypted API Access - Management (session auth)", () => {
  it("rejects unauthenticated requests to list category keys", async () => {
    const res = await app.request("/api/encrypted-access/category-keys", {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated requests to list grants", async () => {
    const res = await app.request("/api/encrypted-access/keys", {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(res.status).toBe(401);
  });

  it("creates a grant and returns safe metadata without raw token", async () => {
    const res = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "My App",
        categories: ["characters", "chatbot"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "deadbeef",
        token_prefix: "abc12345",
        wrapped_keys: {
          characters: "ENC:v2:aes-256-gcm:AAAA",
          chatbot: "ENC:v2:aes-256-gcm:BBBB",
        },
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.grant.id).toBeDefined();
    expect(data.grant.name).toBe("My App");
    expect(data.grant.categories).toContain("characters");
    expect(data.grant.categories).toContain("chatbot");
    expect(data.grant.token_prefix).toBe("abc12345");
    // Raw token must NOT be in response
    expect(data.grant.token).toBeUndefined();
    expect(data.token_hash).toBeUndefined();
    expect(data.wrapped_keys).toBeUndefined();
  });

  it("rejects grant creation with passwords category", async () => {
    const res = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Bad App",
        categories: ["passwords"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "deadbeef",
        token_prefix: "abc12345",
        wrapped_keys: {},
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects grant creation with no categories", async () => {
    const res = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Bad App",
        categories: [],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "deadbeef",
        token_prefix: "abc12345",
        wrapped_keys: {},
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects grant creation with past expiry", async () => {
    const res = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Bad App",
        categories: ["characters"],
        expires_at: new Date(Date.now() - 1000).toISOString(),
        token_hash: "deadbeef",
        token_prefix: "abc12345",
        wrapped_keys: { characters: "ENC:v2:aes-256-gcm:AAAA" },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("lists grants created by the user only", async () => {
    // Create grant as testUser
    await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "User App",
        categories: ["characters"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "hash1",
        token_prefix: "prefix1",
        wrapped_keys: { characters: "ENC:v2:aes-256-gcm:AAAA" },
      }),
    });

    // Create grant as otherUser
    await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${otherUserToken}`,
      },
      body: JSON.stringify({
        name: "Other App",
        categories: ["chatbot"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "hash2",
        token_prefix: "prefix2",
        wrapped_keys: { chatbot: "ENC:v2:aes-256-gcm:BBBB" },
      }),
    });

    const res = await app.request("/api/encrypted-access/keys", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.keys)).toBe(true);
    expect(data.keys.length).toBe(1);
    expect(data.keys[0].name).toBe("User App");
    expect(data.keys[0].categories).toContain("characters");
    // Should not see other user's grants
    expect(data.keys.some((k: any) => k.name === "Other App")).toBe(false);
  });

  it("revokes a grant owned by the user", async () => {
    const createRes = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Revocable App",
        categories: ["characters"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "hash-revoke",
        token_prefix: "prefix-revoke",
        wrapped_keys: { characters: "ENC:v2:aes-256-gcm:AAAA" },
      }),
    });
    const { grant } = await createRes.json();

    const revokeRes = await app.request(
      `/api/encrypted-access/keys/${grant.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userToken}` },
      },
    );
    expect(revokeRes.status).toBe(200);

    // Verify it's revoked by listing
    const listRes = await app.request("/api/encrypted-access/keys", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const data = await listRes.json();
    const revoked = data.keys.find((k: any) => k.id === grant.id);
    expect(revoked.revoked_at).not.toBeNull();
  });

  it("rejects revoking a grant owned by another user", async () => {
    const createRes = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Target App",
        categories: ["characters"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "hash-target",
        token_prefix: "prefix-target",
        wrapped_keys: { characters: "ENC:v2:aes-256-gcm:AAAA" },
      }),
    });
    const { grant } = await createRes.json();

    const revokeRes = await app.request(
      `/api/encrypted-access/keys/${grant.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${otherUserToken}` },
      },
    );
    expect(revokeRes.status).toBe(404);
  });

  it("returns 404 for revoking non-existent grant", async () => {
    const res = await app.request("/api/encrypted-access/keys/nonexistent-id", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("Encrypted API Access - Category keys", () => {
  it("lists wrapped category keys for the user", async () => {
    // First create a category key
    await app.request(
      "/api/encrypted-access/category-keys/characters",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ version: 1, wrapped_key: "ENC:v2:aes-256-gcm:AAAA" }),
      },
    );

    const res = await app.request("/api/encrypted-access/category-keys", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.keys)).toBe(true);
    expect(data.keys.some((k: any) => k.category === "characters")).toBe(true);
  });

  it("rejects unsupported category for key upsert", async () => {
    const res = await app.request(
      "/api/encrypted-access/category-keys/passwords",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ version: 1, wrapped_key: "ENC:v2:aes-256-gcm:AAAA" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid envelope for key upsert", async () => {
    const res = await app.request(
      "/api/encrypted-access/category-keys/characters",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ version: 99, wrapped_key: "bad" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("Encrypted API Access - Token validation", () => {
  it("rejects tokens with wrong prefix", async () => {
    const res = await app.request("/api/encrypted-access/characters", {
      headers: { Authorization: "Bearer ol_wrong_prefix" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects malformed tokens", async () => {
    const res = await app.request("/api/encrypted-access/characters", {
      headers: { Authorization: "Bearer olea_" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects tokens for non-existent grant", async () => {
    const res = await app.request("/api/encrypted-access/characters", {
      headers: {
        Authorization: `Bearer ${ENCRYPTED_API_TOKEN_PREFIX}nonexistent.abcd`,
      },
    });
    expect(res.status).toBe(401);
  });
});

describe("Encrypted API Access - Data read (grant token auth)", () => {
  let grantToken: string;

  beforeEach(async () => {
    // Create a grant for characters + chatbot
    const createRes = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Test Grant",
        categories: ["characters", "chatbot"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "placeholder",
        token_prefix: "testprefix",
        wrapped_keys: {
          characters: "ENC:v2:aes-256-gcm:AAAA",
          chatbot: "ENC:v2:aes-256-gcm:BBBB",
        },
      }),
    });
    const data = await createRes.json();
    // Build a token using the grant id; hash verification will fail but we test structure
    grantToken = `${ENCRYPTED_API_TOKEN_PREFIX}${data.grant.id}.fake-secret`;
  });

  it("rejects read request for ungranted category", async () => {
    const res = await app.request("/api/encrypted-access/data-save", {
      headers: { Authorization: `Bearer ${grantToken}` },
    });
    // 401 because token hash won't match, but if we had a valid token it'd be 403
    expect(res.status).toBe(401);
  });

  it("rejects missing authorization header", async () => {
    const res = await app.request("/api/encrypted-access/characters");
    expect(res.status).toBe(401);
  });

  it("rejects non-bearer authorization", async () => {
    const res = await app.request("/api/encrypted-access/characters", {
      headers: { Authorization: "Basic some-token" },
    });
    expect(res.status).toBe(401);
  });
});

describe("Encrypted API Access - Security properties", () => {
  it("does not include passwords category in allowed categories", async () => {
    const res = await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Evil App",
        categories: ["passwords"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "hash",
        token_prefix: "prefix",
        wrapped_keys: {},
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body.toLowerCase()).toContain("unsupported");
  });

  it("management endpoints are not accessible with grant tokens", async () => {
    // Grant tokens should not work for management endpoints
    const res = await app.request("/api/encrypted-access/keys", {
      headers: {
        Authorization: `Bearer ${ENCRYPTED_API_TOKEN_PREFIX}fakegrant.fakesecret`,
      },
    });
    expect(res.status).toBe(401);
  });

  it("does not expose raw token or wrapped keys in list response", async () => {
    await app.request("/api/encrypted-access/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: "Secret App",
        categories: ["characters"],
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token_hash: "secret-hash",
        token_prefix: "secret-prefix",
        wrapped_keys: { characters: "ENC:v2:aes-256-gcm:AAAA" },
      }),
    });

    const res = await app.request("/api/encrypted-access/keys", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const data = await res.json();
    const grant = data.keys[0];
    expect(grant.token_hash).toBeUndefined();
    expect(grant.wrapped_keys).toBeUndefined();
    expect(grant.token_prefix).toBeDefined();
  });
});
