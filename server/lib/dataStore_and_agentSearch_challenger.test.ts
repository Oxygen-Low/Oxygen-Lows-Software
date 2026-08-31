import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  DATA_DIR,
  initUserFolder,
  getUserById,
  queryTable,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
  callRpc,
  normalizeUserPreferences,
} from "./dataStore.ts";
import {
  agentSearchRouter,
  HORDE_FAST_MODEL,
  CLOUDFLARE_SMART_MODEL,
  HORDE_URL,
} from "../routes/agentSearch.ts";
import { generateToken } from "./auth.ts";

describe("Milestone 1 Challenger Stress & Edge-Case Test Suite", () => {
  const testUsers = ["87001", "87002", "87003", "87004", "87005"];
  let app: Hono;
  let reqSeq = 0;

  function testHeaders(token?: string) {
    reqSeq++;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      "cf-connecting-ip": `10.201.${Math.floor(reqSeq / 5)}.${(reqSeq % 200) + 1}`,
    };
  }

  beforeEach(() => {
    for (const uid of testUsers) {
      const udir = path.join(DATA_DIR, uid);
      if (fs.existsSync(udir)) {
        try {
          fs.rmSync(udir, { recursive: true, force: true });
        } catch {}
      }
      initUserFolder(uid, {
        username: `challenger_${uid}`,
        email: `challenger_${uid}@test.local`,
        passwordHash: "hash123",
        salt: "salt123",
      });
    }

    app = new Hono();
    app.route("/api/ai/agent-search", agentSearchRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const uid of testUsers) {
      const udir = path.join(DATA_DIR, uid);
      if (fs.existsSync(udir)) {
        try {
          fs.rmSync(udir, { recursive: true, force: true });
        } catch {}
      }
    }
  });

  // =========================================================================
  // SUITE 1: Multi-user operations & CRUD on user_models
  // =========================================================================
  describe("Suite 1: user_models Multi-User Isolation & Rapid CRUD", () => {
    it("handles multi-user sequential and interleaved insertions, updates, and deletes with strict isolation", () => {
      // Insert models for each of the 5 users
      for (let u = 0; u < testUsers.length; u++) {
        const uid = testUsers[u];
        for (let i = 0; i < 8; i++) {
          insertTable(
            "user_models",
            {
              id: `mod-${uid}-${i}`,
              provider: i % 2 === 0 ? "openai" : "anthropic",
              model_id: `custom-model-${u}-${i}`,
              name: `User ${uid} Model ${i}`,
            },
            uid,
          );
        }

        const userModels = queryTable({ table: "user_models", userId: uid });
        expect(userModels).toHaveLength(8);

        // Update half
        for (let i = 0; i < 4; i++) {
          updateTable(
            "user_models",
            [{ field: "id", operator: "eq", value: `mod-${uid}-${i}` }],
            { name: `Updated Name ${i}` },
            uid,
          );
        }

        const updated = queryTable({
          table: "user_models",
          userId: uid,
          filters: [
            { field: "name", operator: "like", value: "%Updated Name%" },
          ],
        });
        expect(updated).toHaveLength(4);

        // Delete odd items
        for (let i = 1; i < 8; i += 2) {
          deleteTable(
            "user_models",
            [{ field: "id", operator: "eq", value: `mod-${uid}-${i}` }],
            uid,
          );
        }

        const remaining = queryTable({ table: "user_models", userId: uid });
        expect(remaining).toHaveLength(4);
      }

      // Verify each user has strictly 4 models and no cross-user contamination
      for (const uid of testUsers) {
        const models = queryTable({ table: "user_models", userId: uid });
        expect(models).toHaveLength(4);
        for (const m of models) {
          expect(m.user_id).toBe(uid);
          expect(m.id.startsWith(`mod-${uid}-`)).toBe(true);
        }
      }
    });

    it("handles burst sequential upserts and deletes on user_models without temp file leaks", () => {
      const uid = testUsers[0];
      const modelsDir = path.join(DATA_DIR, uid, "models");

      for (let i = 0; i < 20; i++) {
        upsertTable(
          "user_models",
          {
            id: `burst-mod-${i}`,
            provider: "ollama",
            model_id: `llama3.3:70b-q${i}`,
            name: `Burst Model ${i}`,
          },
          uid,
          "id",
        );
      }

      const count = queryTable({ table: "user_models", userId: uid });
      expect(count).toHaveLength(20);

      // Delete 15 items
      for (let i = 0; i < 15; i++) {
        deleteTable(
          "user_models",
          [{ field: "id", operator: "eq", value: `burst-mod-${i}` }],
          uid,
        );
      }

      const remaining = queryTable({
        table: "user_models",
        userId: uid,
        filters: [{ field: "id", operator: "like", value: "burst-mod-%" }],
      });
      expect(remaining).toHaveLength(5);

      // Verify no dangling .tmp files in the models directory
      const filesInModels = fs.readdirSync(modelsDir);
      const tmpFiles = filesInModels.filter((f) => f.includes(".tmp"));
      expect(tmpFiles).toHaveLength(0);
      expect(filesInModels).toContain("models.json");
    });

    it("supports batch array insertion and multi-record upsert for user_models", () => {
      const uid = testUsers[1];
      const batchModels = [
        {
          id: "batch-1",
          provider: "openai",
          model_id: "o3-mini",
          name: "O3 Mini",
        },
        {
          id: "batch-2",
          provider: "google",
          model_id: "gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
        },
        { id: "batch-3", provider: "xai", model_id: "grok-3", name: "Grok 3" },
      ];

      const inserted = insertTable("user_models", batchModels, uid);
      expect(Array.isArray(inserted)).toBe(true);
      expect(inserted).toHaveLength(3);

      const queried = queryTable({
        table: "user_models",
        userId: uid,
        filters: [{ field: "id", operator: "like", value: "batch-%" }],
        order: { column: "model_id", ascending: true },
      });
      expect(queried.map((m: any) => m.model_id)).toEqual([
        "gemini-2.5-flash",
        "grok-3",
        "o3-mini",
      ]);

      // Batch upsert with modifications and 1 new record
      const upsertBatch = [
        {
          id: "batch-1",
          provider: "openai",
          model_id: "o3-mini-high",
          name: "O3 Mini High Reasoning",
        },
        {
          id: "batch-4",
          provider: "cloudflare",
          model_id: "@cf/meta/llama-3.3-70b-instruct",
          name: "CF Llama 3.3",
        },
      ];
      upsertTable("user_models", upsertBatch, uid, "id");

      const finalModels = queryTable({
        table: "user_models",
        userId: uid,
        filters: [{ field: "id", operator: "like", value: "batch-%" }],
      });
      expect(finalModels).toHaveLength(4);
      const updatedItem = finalModels.find((m: any) => m.id === "batch-1");
      expect(updatedItem.model_id).toBe("o3-mini-high");
    });
  });

  // =========================================================================
  // SUITE 2: Preference upserts with conflicting keys, partial updates, nulls & aliases
  // =========================================================================
  describe("Suite 2: Preference Upsert Normalization, Aliases, Partial Updates & Null Values", () => {
    it("normalizes empty, null, undefined or non-object inputs safely", () => {
      expect(normalizeUserPreferences(null as any)).toEqual({});
      expect(normalizeUserPreferences(undefined as any)).toEqual({});
      expect(normalizeUserPreferences("invalid" as any)).toEqual({});
      expect(normalizeUserPreferences([] as any)).toEqual({});
      expect(normalizeUserPreferences({})).toEqual({});
    });

    it("strips p_ prefix and maintains bidirectional sync between chatbot_default_model and last_model_id", () => {
      // 1. When chatbot_default_model is given, last_model_id is populated
      const res1 = normalizeUserPreferences({
        p_chatbot_default_model: "gpt-4o",
        p_chatbot_default_provider: "openai",
      });
      expect(res1.chatbot_default_model).toBe("gpt-4o");
      expect(res1.last_model_id).toBe("gpt-4o");
      expect(res1.chatbot_default_provider).toBe("openai");
      expect(res1.last_provider).toBe("openai");

      // 2. When last_model_id is given, chatbot_default_model is populated
      const res2 = normalizeUserPreferences({
        last_model_id: "claude-3-7-sonnet",
        last_provider: "anthropic",
      });
      expect(res2.last_model_id).toBe("claude-3-7-sonnet");
      expect(res2.chatbot_default_model).toBe("claude-3-7-sonnet");
      expect(res2.last_provider).toBe("anthropic");
      expect(res2.chatbot_default_provider).toBe("anthropic");

      // 3. When both are explicitly given with different values, explicit chatbot_default_model takes precedence
      const res3 = normalizeUserPreferences({
        p_chatbot_default_model: "explicit-chatbot-model",
        p_last_model_id: "legacy-model",
      });
      expect(res3.chatbot_default_model).toBe("explicit-chatbot-model");
      expect(res3.last_model_id).toBe("legacy-model");
    });

    it("preserves partial updates across multiple successive upserts without wiping existing fields", () => {
      const uid = testUsers[2];

      // Initial defaults
      const pref0 = queryTable({
        table: "user_preferences",
        userId: uid,
        single: true,
      });
      expect(pref0.theme).toBe("dark");
      expect(pref0.volume).toBe(80);
      expect(pref0.chatbot_default_model).toBe("Fast");

      // Step 1: Update theme only
      callRpc("upsert_user_preferences", { p_theme: "light" }, uid);
      let p = queryTable({
        table: "user_preferences",
        userId: uid,
        single: true,
      });
      expect(p.theme).toBe("light");
      expect(p.volume).toBe(80);
      expect(p.chatbot_default_model).toBe("Fast");

      // Step 2: Update research_agent_default_model only
      callRpc(
        "upsert_user_preferences",
        {
          p_research_agent_default_model: "claude-3-7-sonnet",
          p_research_agent_default_provider: "anthropic",
        },
        uid,
      );
      p = queryTable({ table: "user_preferences", userId: uid, single: true });
      expect(p.theme).toBe("light");
      expect(p.volume).toBe(80);
      expect(p.research_agent_default_model).toBe("claude-3-7-sonnet");
      expect(p.research_agent_default_provider).toBe("anthropic");
      expect(p.research_summarizer_default_model).toBe(
        "@cf/nvidia/nemotron-3-120b-a12b",
      );

      // Step 3: Update research_summarizer_default_model only
      callRpc(
        "upsert_user_preferences",
        {
          p_research_summarizer_default_model: "gemini-2.5-pro",
          p_research_summarizer_default_provider: "google",
        },
        uid,
      );
      p = queryTable({ table: "user_preferences", userId: uid, single: true });
      expect(p.theme).toBe("light");
      expect(p.research_agent_default_model).toBe("claude-3-7-sonnet");
      expect(p.research_summarizer_default_model).toBe("gemini-2.5-pro");
      expect(p.research_summarizer_default_provider).toBe("google");
    });

    it("handles null values, undefined fields, and extra custom preference keys", () => {
      const uid = testUsers[3];

      // Upsert with null profile_picture_path and custom arbitrary keys
      const result = callRpc(
        "upsert_user_preferences",
        {
          p_profile_picture_path: null,
          p_custom_flag: true,
          p_temperature: 0.7,
          undefined_field: undefined,
        },
        uid,
      );

      expect(result.profile_picture_path).toBeNull();
      expect(result.custom_flag).toBe(true);
      expect(result.temperature).toBe(0.7);
      expect("undefined_field" in result).toBe(false);

      const persisted = queryTable({
        table: "user_preferences",
        userId: uid,
        single: true,
      });
      expect(persisted.profile_picture_path).toBeNull();
      expect(persisted.custom_flag).toBe(true);
      expect(persisted.temperature).toBe(0.7);
    });

    it("rejects unauthorized RPC calls without userId", () => {
      expect(() => {
        callRpc("upsert_user_preferences", { p_theme: "light" }, undefined);
      }).toThrow("Unauthorized");
    });
  });

  // =========================================================================
  // SUITE 3: Agent Search Model Overrides, Fallbacks & Error Resilience
  // =========================================================================
  describe("Suite 3: Agent Search Model Overrides & Priority Hierarchy", () => {
    it("forwards arbitrary/unconventional researchModel and provider strings to backend engine", async () => {
      const uid = testUsers[4];
      const user = getUserById(uid);
      const token = generateToken(user);

      let capturedPayload: any = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).includes("stablehorde.net")) {
          capturedPayload = JSON.parse((init?.body as string) || "{}");
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"action": "done"}' } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      });

      const exoticModel = "custom-org/llama-3.1-405b-fp8:extreme_special_v2";
      const res = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Deep quantum gravity explanation",
          responseFormat: "summary",
          researchOnly: true,
          stream: false,
          researchModel: exoticModel,
          researchProvider: "custom_horde_bridge",
        }),
      });

      expect(res.status).toBe(200);
      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.model).toBe(exoticModel);
    });

    it("falls back through the complete 4-tier hierarchy for research models", async () => {
      const uid = testUsers[0];
      const user = getUserById(uid);
      const token = generateToken(user);

      let capturedModel = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).includes("stablehorde.net")) {
          const body = JSON.parse((init?.body as string) || "{}");
          capturedModel = body.model;
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"action": "done"}' } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      });

      // Tier 1: Explicit payload takes top priority even if preferences differ
      callRpc(
        "upsert_user_preferences",
        { p_research_agent_default_model: "tier2-pref-model" },
        uid,
      );

      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Tier test",
          responseFormat: "summary",
          researchOnly: true,
          stream: false,
          researchModel: "tier1-payload-model",
        }),
      });
      expect(capturedModel).toBe("tier1-payload-model");

      // Tier 2: Payload model is empty string/whitespace -> fallback to preference
      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Tier test",
          responseFormat: "summary",
          researchOnly: true,
          stream: false,
          researchModel: "   ",
        }),
      });
      expect(capturedModel).toBe("tier2-pref-model");

      // Tier 3: Preference research_agent_default_model cleared, but legacy research_agent_model_id present
      callRpc(
        "upsert_user_preferences",
        {
          p_research_agent_default_model: "",
          research_agent_model_id: "tier3-legacy-model",
        },
        uid,
      );
      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Tier test",
          responseFormat: "summary",
          researchOnly: true,
          stream: false,
        }),
      });
      expect(capturedModel).toBe("tier3-legacy-model");

      // Tier 4: Preference models completely cleared -> falls back to HORDE_FAST_MODEL
      callRpc(
        "upsert_user_preferences",
        {
          p_research_agent_default_model: "",
          research_agent_model_id: "",
        },
        uid,
      );
      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Tier test",
          responseFormat: "summary",
          researchOnly: true,
          stream: false,
        }),
      });
      expect(capturedModel).toBe(HORDE_FAST_MODEL);
    });

    it("falls back through the complete 4-tier hierarchy for summarizer models", async () => {
      const uid = testUsers[1];
      const user = getUserById(uid);
      const token = generateToken(user);

      process.env.CLOUDFLARE_ID = "cf_test_id";
      process.env.CLOUDFLARE_TOKEN = "cf_test_token";

      let capturedCfModel = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
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
          const body = JSON.parse((init?.body as string) || "{}");
          capturedCfModel = body.model;
          return new Response(
            JSON.stringify({ result: { content: "Summary output" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      });

      // Tier 1: Payload override
      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Summarizer tier test",
          responseFormat: "summary",
          stream: false,
          summarizerModel: "@cf/meta/llama-3.3-70b-instruct",
        }),
      });
      expect(capturedCfModel).toBe("@cf/meta/llama-3.3-70b-instruct");

      // Tier 2: User preference
      callRpc(
        "upsert_user_preferences",
        {
          p_research_summarizer_default_model: "@cf/qwen/qwen2.5-72b-instruct",
        },
        uid,
      );
      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Summarizer tier test",
          responseFormat: "summary",
          stream: false,
        }),
      });
      expect(capturedCfModel).toBe("@cf/qwen/qwen2.5-72b-instruct");

      // Tier 3: Legacy preference field
      callRpc(
        "upsert_user_preferences",
        {
          p_research_summarizer_default_model: "",
          research_summarizer_model_id: "@cf/mistral/mistral-7b-instruct-v0.2",
        },
        uid,
      );
      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Summarizer tier test",
          responseFormat: "summary",
          stream: false,
        }),
      });
      expect(capturedCfModel).toBe("@cf/mistral/mistral-7b-instruct-v0.2");

      // Tier 4: System default
      callRpc(
        "upsert_user_preferences",
        {
          p_research_summarizer_default_model: "",
          research_summarizer_model_id: "",
        },
        uid,
      );
      await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "Summarizer tier test",
          responseFormat: "summary",
          stream: false,
        }),
      });
      expect(capturedCfModel).toBe(CLOUDFLARE_SMART_MODEL);
    });

    it("handles non-string researchModel types (numbers, objects, booleans, null) gracefully without throwing", async () => {
      const uid = testUsers[2];
      const user = getUserById(uid);
      const token = generateToken(user);

      let capturedModel = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).includes("stablehorde.net")) {
          const body = JSON.parse((init?.body as string) || "{}");
          capturedModel = body.model;
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"action": "done"}' } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        });
      });

      // Pass invalid types: number, boolean, object, array
      const invalidTypes = [
        12345,
        true,
        { nested: "object" },
        ["array", "item"],
        null,
      ];

      for (const invalid of invalidTypes) {
        const res = await app.request("/api/ai/agent-search", {
          method: "POST",
          headers: testHeaders(token),
          body: JSON.stringify({
            query: "Robustness check",
            responseFormat: "summary",
            researchOnly: true,
            stream: false,
            researchModel: invalid,
          }),
        });

        expect(res.status).toBe(200);
        // Should fall back to user preference or default model, never crashed or undefined
        expect(typeof capturedModel).toBe("string");
        expect(capturedModel.length).toBeGreaterThan(0);
      }
    });

    it("rejects malicious or out-of-bound inputs (empty query, query > 1000 chars, responseFormat > 100 chars, > 5 images)", async () => {
      const uid = testUsers[3];
      const user = getUserById(uid);
      const token = generateToken(user);

      // Query > 1000 chars
      const longQueryRes = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "a".repeat(1001),
          responseFormat: "summary",
        }),
      });
      expect(longQueryRes.status).toBe(400);
      expect((await longQueryRes.json()).error).toContain(
        "query exceeds maximum length",
      );

      // responseFormat > 100 chars
      const longFormatRes = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
        body: JSON.stringify({
          query: "valid query",
          responseFormat: "x".repeat(101),
        }),
      });
      expect(longFormatRes.status).toBe(400);
      expect((await longFormatRes.json()).error).toContain(
        "responseFormat exceeds maximum length",
      );

      // > 5 images
      const tooManyImagesRes = await app.request("/api/ai/agent-search", {
        method: "POST",
        headers: testHeaders(token),
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
      expect(tooManyImagesRes.status).toBe(400);
      expect((await tooManyImagesRes.json()).error).toContain(
        "maximum of 5 items",
      );
    });
  });
});
