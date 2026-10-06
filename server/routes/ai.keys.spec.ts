import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiRouter } from "./ai.ts";
import { getUserApiKey, setUserApiKey, deleteUserApiKey } from "../lib/userApiKeys.ts";
import * as authModule from "../lib/auth.ts";

describe("AI Router - Server-Side API Key Management & Proxy Resolution", () => {
  const mockUser = {
    id: "user-keys-test-" + Date.now(),
    username: "testkeyuser",
    email: "testkey@oxygenlow.com",
  };

  beforeEach(() => {
    vi.spyOn(authModule, "resolveUserFromToken").mockImplementation(async (token) => {
      if (token === "valid-token") return mockUser as any;
      return null;
    });
  });

  it("rejects unauthorized GET /keys without valid token", async () => {
    const res = await aiRouter.request("/keys", {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });

  it("saves an API key securely server-side via POST /keys", async () => {
    const rawKey = "sk-test-saved-server-key-123456789";
    const res = await aiRouter.request("/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({
        provider: "openai",
        apiKey: rawKey,
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.provider).toBe("openai");
    expect(json.prefix).toContain("sk-test");

    // Verify key was saved and can be decrypted by server helper
    const decrypted = await getUserApiKey(mockUser.id, "openai");
    expect(decrypted).toBe(rawKey);
  });

  it("lists masked key prefixes via GET /keys without revealing raw secret", async () => {
    const res = await aiRouter.request("/keys", {
      method: "GET",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.keys)).toBe(true);
    const openaiKey = json.keys.find((k: any) => k.provider === "openai");
    expect(openaiKey).toBeDefined();
    expect(openaiKey.prefix).toContain("sk-test");
    // Ensure raw secret is NOT present
    expect(openaiKey.apiKey).toBeUndefined();
    expect(openaiKey.encrypted_key).toBeUndefined();
  });

  it("resolves stored server-side API key in /proxy when apiKey is omitted", async () => {
    let capturedAuthHeader = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init?: any) => {
      if (url.toString().includes("openai.com")) {
        capturedAuthHeader = init?.headers?.["Authorization"] || "";
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const res = await aiRouter.request("/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
        // apiKey omitted intentionally!
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedAuthHeader).toBe("Bearer sk-test-saved-server-key-123456789");
  });

  it("deletes a stored provider key via DELETE /keys/:provider", async () => {
    const res = await aiRouter.request("/keys/openai", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const decrypted = await getUserApiKey(mockUser.id, "openai");
    expect(decrypted).toBeNull();
  });
});
