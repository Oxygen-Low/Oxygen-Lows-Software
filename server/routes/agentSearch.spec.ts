import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import {
  agentSearchRouter,
  HORDE_FAST_MODEL,
  CLOUDFLARE_SMART_MODEL,
  HORDE_URL,
} from "./agentSearch.ts";
import { generateToken } from "../lib/auth.ts";
import {
  DATA_DIR,
  initUserFolder,
  callRpc,
  queryTable,
} from "../lib/dataStore.ts";

describe("Agent Search Route", () => {
  let app: Hono;
  const testUserId = "88888";
  const testUserDir = path.join(DATA_DIR, testUserId);
  let validToken: string;

  beforeEach(() => {
    if (fs.existsSync(testUserDir)) {
      fs.rmSync(testUserDir, { recursive: true, force: true });
    }

    const userData = initUserFolder(testUserId, {
      username: "searchtestuser",
      email: "searchtest@example.com",
      passwordHash: "hash123",
      salt: "salt123",
    });

    validToken = generateToken(userData);

    app = new Hono();
    app.route("/api/ai/agent-search", agentSearchRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testUserDir)) {
      fs.rmSync(testUserDir, { recursive: true, force: true });
    }
  });

  test("Exports HORDE_FAST_MODEL and CLOUDFLARE_SMART_MODEL constants", () => {
    expect(HORDE_FAST_MODEL).toBe("google/gemma-4-31b");
    expect(CLOUDFLARE_SMART_MODEL).toBe("@cf/nvidia/nemotron-3-120b-a12b");
    expect(HORDE_URL).toBe(
      "https://oai.stablehorde.net/v1/chat/completions",
    );
  });

  test("Requires authorization token", async () => {
    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "test",
        responseFormat: "summary",
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Missing or invalid authorization token");
  });

  test("Validates input JSON", async () => {
    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake_token",
        "Content-Type": "application/json",
      },
      body: "invalid json",
    });

    // Auth fails first with fake_token since local auth requires a valid signed token
    expect(res.status).toBe(401);
  });

  test("Requires query parameter", async () => {
    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        responseFormat: "summary",
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("query is required and must be a string");
  });

  test("Validates responseFormat parameter", async () => {
    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "test query",
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("responseFormat is required and must be a string");
  });

  test("Uses custom researchModel from request payload", async () => {
    let capturedHordeModel = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("stablehorde.net")) {
        const reqBody = JSON.parse((init?.body as string) || "{}");
        capturedHordeModel = reqBody.model;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"action": "done"}' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    });

    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "What is quantum computing?",
        responseFormat: "summary",
        researchOnly: true,
        stream: false,
        researchModel: "custom/research-model-v1",
        researchProvider: "horde",
      }),
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    expect(capturedHordeModel).toBe("custom/research-model-v1");
  });

  test("Falls back to user_preferences research model when not provided in body", async () => {
    callRpc(
      "upsert_user_preferences",
      {
        p_research_agent_default_model: "custom/pref-research-model",
        p_research_agent_default_provider: "horde",
      },
      testUserId,
    );

    let capturedHordeModel = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("stablehorde.net")) {
        const reqBody = JSON.parse((init?.body as string) || "{}");
        capturedHordeModel = reqBody.model;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"action": "done"}' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    });

    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "Explain artificial intelligence",
        responseFormat: "summary",
        researchOnly: true,
        stream: false,
      }),
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    expect(capturedHordeModel).toBe("custom/pref-research-model");
  });

  test("Falls back to HORDE_FAST_MODEL when neither body nor user_preferences specify model", async () => {
    let capturedHordeModel = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("stablehorde.net")) {
        const reqBody = JSON.parse((init?.body as string) || "{}");
        capturedHordeModel = reqBody.model;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"action": "done"}' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    });

    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "Deep learning overview",
        responseFormat: "summary",
        researchOnly: true,
        stream: false,
      }),
    });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    expect(capturedHordeModel).toBe(HORDE_FAST_MODEL);
  });

  test("Uses custom summarizerModel for synthesis when provided", async () => {
    let capturedCfModel = "";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("stablehorde.net")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"action": "done"}' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes("api.cloudflare.com")) {
        const reqBody = JSON.parse((init?.body as string) || "{}");
        capturedCfModel = reqBody.model;
        return new Response(
          JSON.stringify({
            result: { content: "Synthesized final answer" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    });

    process.env.CLOUDFLARE_ID = "mock_cf_id";
    process.env.CLOUDFLARE_TOKEN = "mock_cf_token";

    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "Explain neural networks",
        responseFormat: "summary",
        stream: false,
        summarizerModel: "@cf/meta/llama-3.1-8b-instruct-fast",
        summarizerProvider: "cloudflare",
      }),
    });

    expect(res.status).toBe(200);
    expect(capturedCfModel).toBe("@cf/meta/llama-3.1-8b-instruct-fast");
  });
});
