import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  initUserFolder,
  queryTable,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
  callRpc,
  normalizeUserPreferences,
  getTableRows,
} from "./dataStore.ts";
import { Hono } from "hono";
import {
  agentSearchRouter,
  HORDE_FAST_MODEL,
  CLOUDFLARE_SMART_MODEL,
} from "../routes/agentSearch.ts";
import { generateToken } from "./auth.ts";

describe("Challenger 2 Empirical Stress & Edge Case Test Suite", () => {
  const userA = "99901";
  const userB = "99902";
  const userDirA = path.join(DATA_DIR, userA);
  const userDirB = path.join(DATA_DIR, userB);

  beforeEach(() => {
    // Clean up test directories
    if (fs.existsSync(userDirA)) {
      fs.rmSync(userDirA, { recursive: true, force: true });
    }
    if (fs.existsSync(userDirB)) {
      fs.rmSync(userDirB, { recursive: true, force: true });
    }

    // Initialize test users
    initUserFolder(userA, {
      username: "stress_alice",
      email: "alice@stress.test",
      passwordHash: "hashA",
      salt: "saltA",
    });

    initUserFolder(userB, {
      username: "stress_bob",
      email: "bob@stress.test",
      passwordHash: "hashB",
      salt: "saltB",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(userDirA)) {
      fs.rmSync(userDirA, { recursive: true, force: true });
    }
    if (fs.existsSync(userDirB)) {
      fs.rmSync(userDirB, { recursive: true, force: true });
    }
  });

  describe("1. DataStore Durability & Atomicity for user_models", () => {
    test("Bulk insertion durability and disk file consistency", () => {
      const modelsFilePath = path.join(userDirA, "models", "models.json");
      expect(fs.existsSync(modelsFilePath)).toBe(true);

      const count = 50;
      const createdIds: string[] = [];

      for (let i = 0; i < count; i++) {
        const item = insertTable(
          "user_models",
          {
            id: `bulk-mod-${i}`,
            provider: i % 2 === 0 ? "openai" : "anthropic",
            model_id: `custom-model-${i}`,
            name: `Custom Model ${i}`,
          },
          userA,
        );
        createdIds.push(item.id);
      }

      // Verify directly on disk by reading raw file
      const rawContent = fs.readFileSync(modelsFilePath, "utf-8");
      const parsedOnDisk = JSON.parse(rawContent);
      expect(Array.isArray(parsedOnDisk)).toBe(true);
      expect(parsedOnDisk).toHaveLength(count);

      // Verify queryTable returns all rows
      const queryResult = queryTable({
        table: "user_models",
        userId: userA,
      });
      expect(queryResult).toHaveLength(count);
    });

    test("Sequential rapid updates and upserts maintain data integrity without corruption", () => {
      // Insert initial 10 records
      for (let i = 0; i < 10; i++) {
        insertTable(
          "user_models",
          {
            id: `model-${i}`,
            provider: "local",
            model_id: `llama3:${i}b`,
            name: `Llama 3 ${i}B`,
          },
          userA,
        );
      }

      // Update odd records
      for (let i = 1; i < 10; i += 2) {
        updateTable(
          "user_models",
          [{ field: "id", operator: "eq", value: `model-${i}` }],
          { name: `Updated Llama 3 ${i}B`, provider: "ollama" },
          userA,
        );
      }

      // Upsert existing and new records
      upsertTable(
        "user_models",
        {
          id: "model-1",
          model_id: "llama3:1b-v2",
          name: "Llama 3 1B v2",
        },
        userA,
        "id",
      );

      upsertTable(
        "user_models",
        {
          id: "model-new-11",
          provider: "google",
          model_id: "gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
        },
        userA,
        "id",
      );

      const all = queryTable({ table: "user_models", userId: userA });
      expect(all).toHaveLength(11);

      const m1 = all.find((m: any) => m.id === "model-1");
      expect(m1.name).toBe("Llama 3 1B v2");
      expect(m1.model_id).toBe("llama3:1b-v2");

      const m3 = all.find((m: any) => m.id === "model-3");
      expect(m3.provider).toBe("ollama");
      expect(m3.name).toBe("Updated Llama 3 3B");

      const mNew = all.find((m: any) => m.id === "model-new-11");
      expect(mNew.provider).toBe("google");
      expect(mNew.model_id).toBe("gemini-2.5-pro");
    });
  });

  describe("2. Filtering Capabilities on user_models (queryTable)", () => {
    beforeEach(() => {
      // Seed rich dataset for userA
      const seedData = [
        { id: "m-1", provider: "openai", model_id: "gpt-4o", name: "GPT-4o Omnimodel", created_at: "2026-01-01T00:00:00Z" },
        { id: "m-2", provider: "openai", model_id: "gpt-4o-mini", name: "GPT-4o Mini", created_at: "2026-01-02T00:00:00Z" },
        { id: "m-3", provider: "openai", model_id: "o1-preview", name: "o1 Preview", created_at: "2026-01-03T00:00:00Z" },
        { id: "m-4", provider: "anthropic", model_id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", created_at: "2026-01-04T00:00:00Z" },
        { id: "m-5", provider: "anthropic", model_id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", created_at: "2026-01-05T00:00:00Z" },
        { id: "m-6", provider: "google", model_id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", created_at: "2026-01-06T00:00:00Z" },
        { id: "m-7", provider: "google", model_id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", created_at: "2026-01-07T00:00:00Z" },
        { id: "m-8", provider: "openrouter", model_id: "deepseek/deepseek-r1", name: "DeepSeek R1", created_at: "2026-01-08T00:00:00Z" },
        { id: "m-9", provider: "local", model_id: "qwen2.5:32b", name: "Qwen 2.5 32B Local", created_at: "2026-01-09T00:00:00Z" },
        { id: "m-10", provider: "ollama", model_id: "llama3.3:70b", name: "Llama 3.3 70B Ollama", created_at: "2026-01-10T00:00:00Z" },
      ];

      for (const item of seedData) {
        insertTable("user_models", item, userA);
      }

      // Seed userB with isolated models
      insertTable(
        "user_models",
        { id: "m-b-1", provider: "openai", model_id: "gpt-4o", name: "Bob GPT-4o" },
        userB,
      );
      insertTable(
        "user_models",
        { id: "m-b-2", provider: "xai", model_id: "grok-2", name: "Bob Grok 2" },
        userB,
      );
    });

    test("Query by provider using eq operator", () => {
      const openaiModels = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "provider", operator: "eq", value: "openai" }],
      });
      expect(openaiModels).toHaveLength(3);
      expect(openaiModels.map((m: any) => m.model_id).sort()).toEqual([
        "gpt-4o",
        "gpt-4o-mini",
        "o1-preview",
      ]);

      const anthropicModels = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "provider", operator: "eq", value: "anthropic" }],
      });
      expect(anthropicModels).toHaveLength(2);
      expect(anthropicModels.map((m: any) => m.model_id).sort()).toEqual([
        "claude-3-5-haiku",
        "claude-3-7-sonnet",
      ]);
    });

    test("Query by provider using neq operator", () => {
      const nonOpenai = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "provider", operator: "neq", value: "openai" }],
      });
      expect(nonOpenai).toHaveLength(7);
      expect(nonOpenai.every((m: any) => m.provider !== "openai")).toBe(true);
    });

    test("Query by provider using in operator", () => {
      const selected = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "provider", operator: "in", value: ["google", "openrouter"] }],
      });
      expect(selected).toHaveLength(3);
      expect(selected.map((m: any) => m.model_id).sort()).toEqual([
        "deepseek/deepseek-r1",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
      ]);
    });

    test("Query by model_id with special characters (slashes in deepseek/deepseek-r1)", () => {
      const deepseek = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "model_id", operator: "eq", value: "deepseek/deepseek-r1" }],
        single: true,
      });
      expect(deepseek).not.toBeNull();
      expect(deepseek.id).toBe("m-8");
      expect(deepseek.provider).toBe("openrouter");
    });

    test("Query by model_id using like and ilike pattern matching", () => {
      // LIKE
      const gptModels = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "model_id", operator: "like", value: "gpt-%" }],
      });
      expect(gptModels).toHaveLength(2);
      expect(gptModels.map((m: any) => m.model_id).sort()).toEqual([
        "gpt-4o",
        "gpt-4o-mini",
      ]);

      // ILIKE (case-insensitive)
      const claudeModels = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "name", operator: "ilike", value: "%CLAUDE%" }],
      });
      expect(claudeModels).toHaveLength(2);
      expect(claudeModels.map((m: any) => m.name).sort()).toEqual([
        "Claude 3.5 Haiku",
        "Claude 3.7 Sonnet",
      ]);
    });

    test("Query with complex orFilters", () => {
      // or(provider.eq.google,provider.eq.anthropic)
      const orResult = queryTable({
        table: "user_models",
        userId: userA,
        orFilters: ["provider.eq.google,provider.eq.anthropic"],
      });
      expect(orResult).toHaveLength(4);

      // or(model_id.eq.gpt-4o,model_id.eq.deepseek/deepseek-r1)
      const specificModels = queryTable({
        table: "user_models",
        userId: userA,
        orFilters: ["model_id.eq.gpt-4o,model_id.eq.deepseek/deepseek-r1"],
      });
      expect(specificModels).toHaveLength(2);
      expect(specificModels.map((m: any) => m.model_id).sort()).toEqual([
        "deepseek/deepseek-r1",
        "gpt-4o",
      ]);
    });

    test("Ordering, pagination (limit & offset), single, and head queries", () => {
      // Order by model_id ascending
      const asc = queryTable({
        table: "user_models",
        userId: userA,
        order: { column: "model_id", ascending: true },
        limit: 3,
        offset: 0,
      });
      expect(asc).toHaveLength(3);
      expect(asc[0].model_id).toBe("claude-3-5-haiku");
      expect(asc[1].model_id).toBe("claude-3-7-sonnet");
      expect(asc[2].model_id).toBe("deepseek/deepseek-r1");

      // Pagination with offset: 3, limit: 3
      const page2 = queryTable({
        table: "user_models",
        userId: userA,
        order: { column: "model_id", ascending: true },
        limit: 3,
        offset: 3,
      });
      expect(page2).toHaveLength(3);
      expect(page2[0].model_id).toBe("gemini-2.5-flash");

      // single: true
      const singleHit = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "id", operator: "eq", value: "m-6" }],
        single: true,
      });
      expect(singleHit.model_id).toBe("gemini-2.5-pro");

      // single: true with no match
      const singleMiss = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "id", operator: "eq", value: "non-existent" }],
        single: true,
      });
      expect(singleMiss).toBeNull();

      // head: true
      const headCount = queryTable({
        table: "user_models",
        userId: userA,
        head: true,
      });
      expect(headCount).toEqual({ data: [], count: 10 });
    });

    test("Cross-user isolation: userA queries do not leak userB records", () => {
      const userAModels = queryTable({
        table: "user_models",
        userId: userA,
      });
      expect(userAModels).toHaveLength(10);
      expect(userAModels.find((m: any) => m.id === "m-b-1")).toBeUndefined();
      expect(userAModels.find((m: any) => m.id === "m-b-2")).toBeUndefined();

      const userBModels = queryTable({
        table: "user_models",
        userId: userB,
      });
      expect(userBModels).toHaveLength(2);
      expect(userBModels.map((m: any) => m.id).sort()).toEqual(["m-b-1", "m-b-2"]);

      // Aggregated query (no userId specified) aggregates across all users
      const allUsersModels = queryTable({
        table: "user_models",
      });
      expect(allUsersModels.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe("3. RPC Behavior and user_preferences Synchronization", () => {
    test("normalizeUserPreferences handles p_ prefix stripping and two-way alias synchronization", () => {
      // 1. Setting chatbot_default_model populates last_model_id
      const n1 = normalizeUserPreferences({
        p_chatbot_default_model: "gpt-4o",
        p_chatbot_default_provider: "openai",
      });
      expect(n1.chatbot_default_model).toBe("gpt-4o");
      expect(n1.last_model_id).toBe("gpt-4o");
      expect(n1.chatbot_default_provider).toBe("openai");
      expect(n1.last_provider).toBe("openai");

      // 2. Setting last_model_id populates chatbot_default_model
      const n2 = normalizeUserPreferences({
        last_model_id: "claude-3-7-sonnet",
        last_provider: "anthropic",
      });
      expect(n2.chatbot_default_model).toBe("claude-3-7-sonnet");
      expect(n2.last_model_id).toBe("claude-3-7-sonnet");
      expect(n2.chatbot_default_provider).toBe("anthropic");
      expect(n2.last_provider).toBe("anthropic");

      // 3. Null / undefined / empty input robustness
      expect(normalizeUserPreferences(null as any)).toEqual({});
      expect(normalizeUserPreferences(undefined as any)).toEqual({});
      expect(normalizeUserPreferences({})).toEqual({});
    });

    test("upsert_user_preferences RPC persists all 6 default model fields cleanly", () => {
      const rpcPayload = {
        p_user_id: userA,
        p_chatbot_default_model: "gpt-4o",
        p_chatbot_default_provider: "openai",
        p_research_agent_default_model: "claude-3-7-sonnet",
        p_research_agent_default_provider: "anthropic",
        p_research_summarizer_default_model: "gemini-2.5-pro",
        p_research_summarizer_default_provider: "google",
      };

      const result = callRpc("upsert_user_preferences", rpcPayload, userA);
      expect(result.chatbot_default_model).toBe("gpt-4o");
      expect(result.chatbot_default_provider).toBe("openai");
      expect(result.last_model_id).toBe("gpt-4o");
      expect(result.last_provider).toBe("openai");
      expect(result.research_agent_default_model).toBe("claude-3-7-sonnet");
      expect(result.research_agent_default_provider).toBe("anthropic");
      expect(result.research_summarizer_default_model).toBe("gemini-2.5-pro");
      expect(result.research_summarizer_default_provider).toBe("google");

      // Verify on-disk preferences.json
      const prefPath = path.join(userDirA, "preferences.json");
      const diskPrefs = JSON.parse(fs.readFileSync(prefPath, "utf-8"));
      expect(diskPrefs.chatbot_default_model).toBe("gpt-4o");
      expect(diskPrefs.research_agent_default_model).toBe("claude-3-7-sonnet");
      expect(diskPrefs.research_summarizer_default_model).toBe("gemini-2.5-pro");
    });

    test("Partial updates to preferences do not overwrite other fields", () => {
      // First update all fields
      callRpc(
        "upsert_user_preferences",
        {
          p_theme: "dark",
          p_volume: 80,
          p_chatbot_default_model: "gpt-4o",
          p_chatbot_default_provider: "openai",
          p_research_agent_default_model: "claude-3-7-sonnet",
          p_research_agent_default_provider: "anthropic",
          p_research_summarizer_default_model: "gemini-2.5-pro",
          p_research_summarizer_default_provider: "google",
        },
        userA,
      );

      // Now perform partial update of only summarizer model
      const partialResult = callRpc(
        "upsert_user_preferences",
        {
          p_research_summarizer_default_model: "deepseek/deepseek-r1",
          p_research_summarizer_default_provider: "openrouter",
        },
        userA,
      );

      expect(partialResult.theme).toBe("dark");
      expect(partialResult.volume).toBe(80);
      expect(partialResult.chatbot_default_model).toBe("gpt-4o");
      expect(partialResult.research_agent_default_model).toBe("claude-3-7-sonnet");
      expect(partialResult.research_summarizer_default_model).toBe("deepseek/deepseek-r1");
      expect(partialResult.research_summarizer_default_provider).toBe("openrouter");
    });

    test("Unauthorized RPC calls fail cleanly", () => {
      expect(() => {
        callRpc("upsert_user_preferences", { p_theme: "dark" }, undefined);
      }).toThrow("Unauthorized");

      const pointsRes = callRpc("spend_points", { amount: 10 }, undefined);
      expect(pointsRes.success).toBe(false);
      expect(pointsRes.error).toBe("Unauthorized");
    });
  });

  describe("4. Agent Search Route Integration & Priority Hierarchy", () => {
    let app: Hono;
    let tokenA: string;

    beforeEach(() => {
      const userAData = getTableRows("users").find((u) => u.id === userA) || {
        id: userA,
        username: "stress_alice",
        email: "alice@stress.test",
      };
      tokenA = generateToken(userAData);

      app = new Hono();
      app.route("/api/ai/agent-search", agentSearchRouter);
    });

    test("agentSearch resolves custom request body models over user preferences and defaults", async () => {
      // Configure preferences
      callRpc(
        "upsert_user_preferences",
        {
          p_research_agent_default_model: "pref-model-research",
          p_research_agent_default_provider: "horde",
          p_research_summarizer_default_model: "pref-model-summarizer",
          p_research_summarizer_default_provider: "cloudflare",
        },
        userA,
      );

      let usedHordeModel = "";
      let usedCfModel = "";

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const urlStr = String(url);
        const reqBody = JSON.parse((init?.body as string) || "{}");
        if (urlStr.includes("stablehorde.net")) {
          usedHordeModel = reqBody.model;
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"action": "done"}' } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("api.cloudflare.com")) {
          usedCfModel = reqBody.model;
          return new Response(
            JSON.stringify({
              result: { content: "Synthesized summary" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      });

      process.env.CLOUDFLARE_ID = "mock_id";
      process.env.CLOUDFLARE_TOKEN = "mock_token";

      // Case 1: Body models provided -> MUST take precedence over user_preferences
      const res1 = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Quantum physics",
          responseFormat: "summary",
          stream: false,
          researchModel: "body-override-research",
          summarizerModel: "body-override-summarizer",
        }),
      });

      expect(res1.status).toBe(200);
      expect(usedHordeModel).toBe("body-override-research");
      expect(usedCfModel).toBe("body-override-summarizer");

      // Case 2: Body models omitted -> MUST take user_preferences
      const res2 = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Quantum physics part 2",
          responseFormat: "summary",
          stream: false,
        }),
      });

      expect(res2.status).toBe(200);
      expect(usedHordeModel).toBe("pref-model-research");
      expect(usedCfModel).toBe("pref-model-summarizer");
    });

    test("agentSearch rejects requests with invalid parameters or payload constraints", async () => {
      // 1. Missing query
      const r1 = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ responseFormat: "summary" }),
      });
      expect(r1.status).toBe(400);

      // 2. Query exceeding 1000 characters
      const r2 = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "a".repeat(1001), responseFormat: "summary" }),
      });
      expect(r2.status).toBe(400);

      // 3. ResponseFormat exceeding 100 characters
      const r3 = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "valid query", responseFormat: "b".repeat(101) }),
      });
      expect(r3.status).toBe(400);

      // 4. Images array > 5 items
      const r4 = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "valid query",
          responseFormat: "summary",
          images: [
            { data: "img1" },
            { data: "img2" },
            { data: "img3" },
            { data: "img4" },
            { data: "img5" },
            { data: "img6" },
          ],
        }),
      });
      expect(r4.status).toBe(400);

      // 5. Missing auth header
      const r5 = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "valid query", responseFormat: "summary" }),
      });
      expect(r5.status).toBe(401);
    });

    test("agentSearch researchOnly mode succeeds even if Cloudflare credentials are unset", async () => {
      delete process.env.CLOUDFLARE_ID;
      delete process.env.CLOUDFLARE_TOKEN;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("stablehorde.net")) {
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
          Authorization: `Bearer ${tokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Explain string theory",
          responseFormat: "summary",
          researchOnly: true,
          stream: false,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("result");
      expect(data).toHaveProperty("searches");
      expect(data).toHaveProperty("pages");
    });
  });

  describe("5. Tricky Character Fuzzing & Filter Operator Exhaustion", () => {
    test("Handles complex unicode, slashes, and colons in model_id seamlessly", () => {
      const specialModels = [
        { id: "sp-1", provider: "local", model_id: "日本語/model:v1.0@q8", name: "日本語モデル" },
        { id: "sp-2", provider: "ollama", model_id: "qwen2.5:32b-instruct-q4_K_M", name: "Qwen 32B Ollama" },
        { id: "sp-3", provider: "openrouter", model_id: "deepseek/deepseek-r1:free", name: "DeepSeek Free" },
        { id: "sp-4", provider: "xai", model_id: "grok-2-vision-1212", name: "Grok 2 Vision" },
      ];

      for (const m of specialModels) {
        insertTable("user_models", m, userA);
      }

      // Exact match with slash and unicode
      const hitUnicode = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "model_id", operator: "eq", value: "日本語/model:v1.0@q8" }],
        single: true,
      });
      expect(hitUnicode).not.toBeNull();
      expect(hitUnicode.name).toBe("日本語モデル");

      // ILIKE match on model_id
      const hitQwen = queryTable({
        table: "user_models",
        userId: userA,
        filters: [{ field: "model_id", operator: "ilike", value: "%QWEN2.5%" }],
      });
      expect(hitQwen).toHaveLength(1);
      expect(hitQwen[0].id).toBe("sp-2");

      // Multiple deletions by ID
      const del = deleteTable("user_models", [{ field: "id", operator: "eq", value: "sp-1" }], userA);
      expect(del).toHaveLength(1);

      const remaining = queryTable({ table: "user_models", userId: userA });
      expect(remaining.find((r: any) => r.id === "sp-1")).toBeUndefined();
    });
  });
});
