import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  getNextUserId,
  initUserFolder,
  getUserById,
  getUserByUsernameOrEmail,
  getTableRows,
  queryTable,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
  callRpc,
} from "./dataStore.ts";

describe("dataStore", () => {
  const testUserId = "99999";
  const testUserDir = path.join(DATA_DIR, testUserId);

  beforeEach(() => {
    if (fs.existsSync(testUserDir)) {
      fs.rmSync(testUserDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testUserDir)) {
      fs.rmSync(testUserDir, { recursive: true, force: true });
    }
  });

  it("should generate sequential user IDs starting from 1 or above", () => {
    const id1 = getNextUserId();
    const id2 = getNextUserId();
    expect(parseInt(id2, 10)).toBe(parseInt(id1, 10) + 1);
  });

  it("should initialize a user folder with proper subdirectories and initial files", () => {
    const user = initUserFolder(testUserId, {
      username: "testuser99",
      email: "testuser99@example.com",
      passwordHash: "hash123",
      salt: "salt123",
    });

    expect(user.id).toBe(testUserId);
    expect(user.username).toBe("testuser99");
    expect(fs.existsSync(path.join(testUserDir, "user.json"))).toBe(true);
    expect(fs.existsSync(path.join(testUserDir, "profile.json"))).toBe(true);
    expect(fs.existsSync(path.join(testUserDir, "preferences.json"))).toBe(true);
    expect(fs.existsSync(path.join(testUserDir, "datastore", "saves.json"))).toBe(true);
    expect(fs.existsSync(path.join(testUserDir, "chatbot", "chats.json"))).toBe(true);
    expect(fs.existsSync(path.join(testUserDir, "passwords", "passwords.json"))).toBe(true);
  });

  it("should retrieve user by ID and by username/email", () => {
    initUserFolder(testUserId, {
      username: "lookupuser",
      email: "lookup@example.com",
      passwordHash: "hash456",
      salt: "salt456",
    });

    const userById = getUserById(testUserId);
    expect(userById?.username).toBe("lookupuser");

    const userByUsername = getUserByUsernameOrEmail("lookupuser");
    expect(userByUsername?.id).toBe(testUserId);

    const userByEmail = getUserByUsernameOrEmail("LOOKUP@EXAMPLE.COM");
    expect(userByEmail?.id).toBe(testUserId);
  });

  it("should perform CRUD operations on user tables", () => {
    initUserFolder(testUserId, {
      username: "cruduser",
      email: "crud@example.com",
      passwordHash: "hash789",
      salt: "salt789",
    });

    // 1. Insert
    const saveItem = insertTable(
      "data_saves",
      { id: "save-1", key: "test_key", value: "test_value" },
      testUserId,
    );
    expect(saveItem.id).toBe("save-1");
    expect(saveItem.key).toBe("test_key");

    // 2. Query
    const queryResult = queryTable({
      table: "data_saves",
      filters: [{ field: "key", operator: "eq", value: "test_key" }],
      userId: testUserId,
    });
    expect(queryResult).toHaveLength(1);
    expect(queryResult[0].value).toBe("test_value");

    // 3. Update
    const updated = updateTable(
      "data_saves",
      [{ field: "id", operator: "eq", value: "save-1" }],
      { value: "updated_value" },
      testUserId,
    );
    expect(updated[0].value).toBe("updated_value");

    // 4. Upsert
    const upserted = upsertTable(
      "data_saves",
      { id: "save-1", value: "upserted_value" },
      testUserId,
      "id",
    );
    expect(upserted.value).toBe("upserted_value");

    // 5. Delete
    const deleted = deleteTable(
      "data_saves",
      [{ field: "id", operator: "eq", value: "save-1" }],
      testUserId,
    );
    expect(deleted).toHaveLength(1);

    const afterDelete = queryTable({
      table: "data_saves",
      filters: [{ field: "id", operator: "eq", value: "save-1" }],
      userId: testUserId,
    });
    expect(afterDelete).toHaveLength(0);
  });

  it("should handle RPC calls properly", () => {
    initUserFolder(testUserId, {
      username: "rpcuser",
      email: "rpc@example.com",
      passwordHash: "hashrpc",
      salt: "saltrpc",
    });

    const pointsStatus = callRpc("get_points_status", {}, testUserId);
    expect(pointsStatus.points).toBe(100);
    expect(pointsStatus.daily_claim_available).toBe(true);

    const updatedPrefs = callRpc(
      "upsert_user_preferences",
      { theme: "light", volume: 90 },
      testUserId,
    );
    expect(updatedPrefs.theme).toBe("light");
    expect(updatedPrefs.volume).toBe(90);
  });

  it("should support orFilters and head options in queryTable and deleteTable", () => {
    initUserFolder(testUserId, {
      username: "filteruser",
      email: "filter@example.com",
      passwordHash: "hashfilter",
      salt: "saltfilter",
    });

    insertTable(
      "friendships",
      [
        { id: "f-1", user_id: testUserId, friend_id: "user-2", status: "accepted" },
        { id: "f-2", user_id: "user-3", friend_id: testUserId, status: "pending" },
        { id: "f-3", user_id: "user-4", friend_id: "user-5", status: "accepted" },
      ],
      testUserId,
    );

    // Test orFilters with simple OR
    const orResult = queryTable({
      table: "friendships",
      orFilters: [`user_id.eq.${testUserId},friend_id.eq.${testUserId}`],
      userId: testUserId,
    });
    expect(orResult).toHaveLength(2);

    // Test orFilters with nested and(...)
    const andOrResult = queryTable({
      table: "friendships",
      orFilters: [
        `and(user_id.eq.${testUserId},friend_id.eq.user-2),and(user_id.eq.user-2,friend_id.eq.${testUserId})`,
      ],
      userId: testUserId,
    });
    expect(andOrResult).toHaveLength(1);
    expect(andOrResult[0].id).toBe("f-1");

    // Test head query option
    const headResult = queryTable({
      table: "friendships",
      userId: testUserId,
      head: true,
    });
    expect(headResult).toEqual({ data: [], count: 3 });

    // Test deleteTable with orFilters
    const deleted = deleteTable(
      "friendships",
      [],
      testUserId,
      [`and(user_id.eq.${testUserId},friend_id.eq.user-2),and(user_id.eq.user-2,friend_id.eq.${testUserId})`],
    );
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe("f-1");

    const remaining = queryTable({
      table: "friendships",
      userId: testUserId,
    });
    expect(remaining).toHaveLength(2);
  });

  it("should support user_models table initialization and full CRUD operations", () => {
    initUserFolder(testUserId, {
      username: "modelsuser",
      email: "models@example.com",
      passwordHash: "hashmodels",
      salt: "saltmodels",
    });

    // Check models directory and models.json initialized
    expect(fs.existsSync(path.join(testUserDir, "models", "models.json"))).toBe(true);
    const initialModels = queryTable({
      table: "user_models",
      userId: testUserId,
    });
    expect(initialModels).toEqual([]);

    // 1. Insert custom models
    const model1 = insertTable(
      "user_models",
      {
        id: "mod-1",
        provider: "openai",
        model_id: "gpt-4o",
        name: "GPT-4o Omnimodel",
      },
      testUserId,
    );
    const model2 = insertTable(
      "user_models",
      {
        id: "mod-2",
        provider: "anthropic",
        model_id: "claude-3-7-sonnet",
        name: "Claude 3.7 Sonnet",
      },
      testUserId,
    );
    expect(model1.id).toBe("mod-1");
    expect(model1.provider).toBe("openai");
    expect(model2.id).toBe("mod-2");
    expect(model2.provider).toBe("anthropic");

    // 2. Query with filters and ordering
    const queryAll = queryTable({
      table: "user_models",
      userId: testUserId,
      order: { column: "model_id", ascending: true },
    });
    expect(queryAll).toHaveLength(2);
    expect(queryAll[0].model_id).toBe("claude-3-7-sonnet");
    expect(queryAll[1].model_id).toBe("gpt-4o");

    const queryOpenAi = queryTable({
      table: "user_models",
      filters: [{ field: "provider", operator: "eq", value: "openai" }],
      userId: testUserId,
    });
    expect(queryOpenAi).toHaveLength(1);
    expect(queryOpenAi[0].model_id).toBe("gpt-4o");

    // 3. Update custom model
    const updated = updateTable(
      "user_models",
      [{ field: "id", operator: "eq", value: "mod-1" }],
      { name: "GPT-4o Custom Label" },
      testUserId,
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe("GPT-4o Custom Label");

    const verifyUpdate = queryTable({
      table: "user_models",
      filters: [{ field: "id", operator: "eq", value: "mod-1" }],
      userId: testUserId,
      single: true,
    });
    expect(verifyUpdate.name).toBe("GPT-4o Custom Label");

    // 4. Upsert custom model
    const upserted = upsertTable(
      "user_models",
      {
        id: "mod-3",
        provider: "openrouter",
        model_id: "deepseek/deepseek-r1",
        name: "DeepSeek R1",
      },
      testUserId,
      "id",
    );
    expect(upserted.id).toBe("mod-3");
    expect(upserted.model_id).toBe("deepseek/deepseek-r1");

    const afterUpsert = queryTable({
      table: "user_models",
      userId: testUserId,
    });
    expect(afterUpsert).toHaveLength(3);

    // 5. Delete custom model
    const deleted = deleteTable(
      "user_models",
      [{ field: "id", operator: "eq", value: "mod-2" }],
      testUserId,
    );
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe("mod-2");

    const afterDelete = queryTable({
      table: "user_models",
      userId: testUserId,
    });
    expect(afterDelete).toHaveLength(2);
    expect(afterDelete.map((m: any) => m.id)).not.toContain("mod-2");
  });

  it("should handle user_preferences default model fields and RPC with/without p_ prefixes", () => {
    initUserFolder(testUserId, {
      username: "prefuser",
      email: "pref@example.com",
      passwordHash: "hashpref",
      salt: "saltpref",
    });

    // Check initial defaults
    const initialPrefs = queryTable({
      table: "user_preferences",
      userId: testUserId,
      single: true,
    });
    expect(initialPrefs.chatbot_default_model).toBe("Fast");
    expect(initialPrefs.chatbot_default_provider).toBe("horde");
    expect(initialPrefs.research_agent_default_model).toBe("google/gemma-4-31b");
    expect(initialPrefs.research_agent_default_provider).toBe("horde");
    expect(initialPrefs.research_summarizer_default_model).toBe("@cf/nvidia/nemotron-3-120b-a12b");
    expect(initialPrefs.research_summarizer_default_provider).toBe("cloudflare");

    // Test upsert_user_preferences RPC with p_ prefixes
    const rpcResult1 = callRpc(
      "upsert_user_preferences",
      {
        p_user_id: testUserId,
        p_chatbot_default_model: "gpt-4o",
        p_chatbot_default_provider: "openai",
        p_research_agent_default_model: "claude-3-7-sonnet",
        p_research_agent_default_provider: "anthropic",
        p_research_summarizer_default_model: "gemini-2.5-pro",
        p_research_summarizer_default_provider: "google",
      },
      testUserId,
    );

    expect(rpcResult1.chatbot_default_model).toBe("gpt-4o");
    expect(rpcResult1.chatbot_default_provider).toBe("openai");
    expect(rpcResult1.last_model_id).toBe("gpt-4o");
    expect(rpcResult1.last_provider).toBe("openai");
    expect(rpcResult1.research_agent_default_model).toBe("claude-3-7-sonnet");
    expect(rpcResult1.research_agent_default_provider).toBe("anthropic");
    expect(rpcResult1.research_summarizer_default_model).toBe("gemini-2.5-pro");
    expect(rpcResult1.research_summarizer_default_provider).toBe("google");

    // Test upsert_user_preferences RPC without p_ prefixes and backward compatibility
    const rpcResult2 = callRpc(
      "upsert_user_preferences",
      {
        last_model_id: "deepseek/deepseek-r1",
        last_provider: "openrouter",
        research_agent_default_model: "Fast",
        research_agent_default_provider: "horde",
      },
      testUserId,
    );

    expect(rpcResult2.last_model_id).toBe("deepseek/deepseek-r1");
    expect(rpcResult2.last_provider).toBe("openrouter");
    expect(rpcResult2.chatbot_default_model).toBe("deepseek/deepseek-r1");
    expect(rpcResult2.chatbot_default_provider).toBe("openrouter");
    expect(rpcResult2.research_agent_default_model).toBe("Fast");
    expect(rpcResult2.research_agent_default_provider).toBe("horde");
    // Verify untouched fields preserved
    expect(rpcResult2.research_summarizer_default_model).toBe("gemini-2.5-pro");
    expect(rpcResult2.research_summarizer_default_provider).toBe("google");

    // Verify persisted directly in preferences.json
    const persisted = queryTable({
      table: "user_preferences",
      userId: testUserId,
      single: true,
    });
    expect(persisted.chatbot_default_model).toBe("deepseek/deepseek-r1");
    expect(persisted.research_agent_default_model).toBe("Fast");
    expect(persisted.research_summarizer_default_model).toBe("gemini-2.5-pro");
  });
});
