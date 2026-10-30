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

  it("resolves stored server-side API key in /proxy when a masked prefix is sent in body.apiKey", async () => {
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
        apiKey: "sk-test...789", // masked fingerprint from UI
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

  it("sanitizes UI message fields, merges system prompts, resolves custom Pollinations model IDs, and falls back to non-streaming SSE when custom model rejects stream:true", async () => {
    await setUserApiKey(mockUser.id, "pollinations", "sk_pollinations_custom_test_key_123456");

    const capturedBodies: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init?: any) => {
      const urlStr = url.toString();
      if (urlStr.includes("/account/my-models")) {
        return new Response(
          JSON.stringify({
            models: [
              {
                id: "m1",
                name: "my-custom-bot",
                modelId: "community/testkeyuser/my-custom-bot",
                title: "My Custom Bot",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes("gen.pollinations.ai/v1/chat/completions")) {
        const body = JSON.parse(init?.body || "{}");
        capturedBodies.push(body);
        // Reject short un-prefixed model name with 400
        if (body.model === "my-custom-bot") {
          return new Response(
            JSON.stringify({ error: { message: "Model not found: my-custom-bot" } }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        // Reject stream:true on resolved custom model to simulate non-streaming custom endpoint
        if (body.model === "community/testkeyuser/my-custom-bot" && body.stream === true) {
          return new Response(
            JSON.stringify({ error: { message: "Upstream model does not support streaming" } }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        // Succeed on stream:false with resolved canonical model ID
        if (body.model === "community/testkeyuser/my-custom-bot" && body.stream === false) {
          return new Response(
            JSON.stringify({
              id: "chatcmpl-custom-1",
              choices: [{ message: { role: "assistant", content: "Hello from custom Pollinations model!" } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
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
        provider: "pollinations",
        model: "my-custom-bot",
        messages: [
          {
            id: "temp-sys",
            parent_id: null,
            role: "system",
            content: "Custom character prompt.",
          },
          {
            id: "temp-user",
            parent_id: "msg-0",
            role: "user",
            content: "Hi custom model!",
            is_web_search: false,
            reasoning: "",
            usedFallback: false,
          },
        ],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const sseText = await res.text();
    expect(sseText).toContain("Hello from custom Pollinations model!");
    expect(sseText).toContain("data: [DONE]");

    expect(capturedBodies.length).toBeGreaterThanOrEqual(2);
    const finalSentBody = capturedBodies[capturedBodies.length - 1];
    expect(finalSentBody.model).toBe("community/testkeyuser/my-custom-bot");
    // Verify only 1 consolidated system message exists and non-standard UI fields were stripped
    const systemMsgs = finalSentBody.messages.filter((m: any) => m.role === "system");
    expect(systemMsgs.length).toBe(1);
    expect(systemMsgs[0].content).toContain("Custom character prompt.");
    const userMsg = finalSentBody.messages.find((m: any) => m.role === "user");
    expect(userMsg).toEqual({ role: "user", content: "Hi custom model!" });
  });
});
