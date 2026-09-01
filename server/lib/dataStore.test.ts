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
  saveTableRows,
  queryTable,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
  callRpc,
  getActiveUserIds,
  cleanupExpiredClosedTickets,
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
    expect(fs.existsSync(path.join(testUserDir, "preferences.json"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(testUserDir, "datastore", "saves.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(testUserDir, "chatbot", "chats.json"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(testUserDir, "passwords", "passwords.json")),
    ).toBe(true);
  });

  it("should assign admin role to user id 1", () => {
    const user1Dir = path.join(DATA_DIR, "1");
    try {
      const user = initUserFolder("1", {
        username: "adminuser",
        email: "adminuser@example.com",
        passwordHash: "hash123",
        salt: "salt123",
      });

      expect(user.id).toBe("1");
      expect(user.role).toBe("admin");

      const retrieved = getUserById("1");
      expect(retrieved?.role).toBe("admin");
    } finally {
      if (fs.existsSync(user1Dir)) {
        fs.rmSync(user1Dir, { recursive: true, force: true });
      }
    }
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
    expect(pointsStatus.points).toBeGreaterThan(0);
    expect(pointsStatus.available).toBeGreaterThan(0);
    expect(pointsStatus.given).toBeGreaterThan(0);
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
        {
          id: "f-1",
          user_id: testUserId,
          friend_id: "user-2",
          status: "accepted",
        },
        {
          id: "f-2",
          user_id: "user-3",
          friend_id: testUserId,
          status: "pending",
        },
        {
          id: "f-3",
          user_id: "user-4",
          friend_id: "user-5",
          status: "accepted",
        },
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
    const deleted = deleteTable("friendships", [], testUserId, [
      `and(user_id.eq.${testUserId},friend_id.eq.user-2),and(user_id.eq.user-2,friend_id.eq.${testUserId})`,
    ]);
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
    expect(fs.existsSync(path.join(testUserDir, "models", "models.json"))).toBe(
      true,
    );
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
    expect(initialPrefs.research_agent_default_model).toBe(
      "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
    );
    expect(initialPrefs.research_agent_default_provider).toBe("horde");
    expect(initialPrefs.research_summarizer_default_model).toBe(
      "@cf/nvidia/nemotron-3-120b-a12b",
    );
    expect(initialPrefs.research_summarizer_default_provider).toBe(
      "cloudflare",
    );

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

  it("should correctly calculate dynamic points and split usage when a new account is created with >50% points remaining", () => {
    const user1Id = "901";
    const user2Id = "902";
    const u1Dir = path.join(DATA_DIR, user1Id);
    const u2Dir = path.join(DATA_DIR, user2Id);
    if (fs.existsSync(u1Dir)) fs.rmSync(u1Dir, { recursive: true, force: true });
    if (fs.existsSync(u2Dir)) fs.rmSync(u2Dir, { recursive: true, force: true });

    try {
      // Initialize user 1
      initUserFolder(user1Id, {
        username: "split_user1",
        email: "split1@example.com",
        passwordHash: "hash1",
        salt: "salt1",
      });

      // User 1 alone: should have full 10,000 pool
      const initialStatus1 = callRpc("get_points_status", { p_active_user_ids: [user1Id] }, user1Id);
      expect(initialStatus1.given).toBe(10000);
      expect(initialStatus1.available).toBe(10000);

      // User 1 spends 2,000 points (8,000 remaining, which is > 50% remaining)
      const spendRes1 = callRpc("spend_points", { p_amount: 2000, p_active_user_ids: [user1Id] }, user1Id);
      expect(spendRes1.success).toBe(true);
      expect(spendRes1.available).toBe(8000);
      expect(spendRes1.given).toBe(10000);

      // Now a new account (User 2) is created
      initUserFolder(user2Id, {
        username: "split_user2",
        email: "split2@example.com",
        passwordHash: "hash2",
        salt: "salt2",
        last_points_usage: new Date().toISOString(),
      });

      // Now active users count is 2 -> base share becomes 5,000 each
      // User 1 had spent 2,000 points today -> user 1 available becomes 5,000 - 2,000 = 3,000
      const updatedStatus1 = callRpc("get_points_status", { p_active_user_ids: [user1Id, user2Id] }, user1Id);
      expect(updatedStatus1.given).toBe(5000);
      expect(updatedStatus1.available).toBe(3000);

      // User 2 (new account) -> user 2 available is 5,000 - 0 = 5,000
      const initialStatus2 = callRpc("get_points_status", { p_active_user_ids: [user1Id, user2Id] }, user2Id);
      expect(initialStatus2.given).toBe(5000);
      expect(initialStatus2.available).toBe(5000);

      // Set up friendship between user1 and user2
      saveTableRows("friendships", user1Id, [
        { id: "f1", user_id: user1Id, friend_id: user2Id, status: "accepted" },
      ]);
      saveTableRows("friendships", user2Id, [
        { id: "f1", user_id: user1Id, friend_id: user2Id, status: "accepted" },
      ]);

      // User 1 gives 500 points to User 2
      const giftRes = callRpc("give_points", { p_receiver_id: user2Id, p_amount: 500, p_active_user_ids: [user1Id, user2Id] }, user1Id);
      expect(giftRes.success).toBe(true);
      expect(giftRes.available).toBe(2500); // 3000 - 500
      expect(giftRes.given).toBe(4500); // 5000 - 500

      // User 2 receives the gift
      const giftedStatus2 = callRpc("get_points_status", { p_active_user_ids: [user1Id, user2Id] }, user2Id);
      expect(giftedStatus2.given).toBe(5500); // 5000 + 500
      expect(giftedStatus2.available).toBe(5500); // 5000 + 500
    } finally {
      if (fs.existsSync(u1Dir)) fs.rmSync(u1Dir, { recursive: true, force: true });
      if (fs.existsSync(u2Dir)) fs.rmSync(u2Dir, { recursive: true, force: true });
    }
  });

  describe("Support Tickets Handling", () => {
    it("should default support ticket status to Open when inserted without status", () => {
      initUserFolder(testUserId, {
        username: "ticketuser",
        email: "ticket@example.com",
        passwordHash: "h",
        salt: "s",
      });

      const ticket = insertTable(
        "support_tickets",
        {
          title: "Test Ticket",
          description: "Help",
          priority: "Medium",
          type: "Bug Report",
        },
        testUserId,
      );

      expect(ticket.status).toBe("Open");

      const rows = getTableRows("support_tickets", testUserId);
      expect(rows[0].status).toBe("Open");
    });

    it("should cascade delete support messages when support ticket is deleted", () => {
      initUserFolder(testUserId, {
        username: "ticketuser2",
        email: "ticket2@example.com",
        passwordHash: "h",
        salt: "s",
      });

      const ticket = insertTable(
        "support_tickets",
        {
          id: "ticket-100",
          title: "Deletable Ticket",
          priority: "Low",
          type: "Suggestion",
        },
        testUserId,
      );

      insertTable(
        "support_messages",
        {
          id: "msg-100",
          ticket_id: "ticket-100",
          sender_id: testUserId,
          message: "Hello support",
        },
        testUserId,
      );

      insertTable(
        "support_messages",
        {
          id: "msg-200",
          ticket_id: "ticket-other",
          sender_id: testUserId,
          message: "Other message",
        },
        testUserId,
      );

      expect(getTableRows("support_tickets", testUserId).length).toBe(1);
      expect(getTableRows("support_messages", testUserId).length).toBe(2);

      // Delete ticket-100
      deleteTable(
        "support_tickets",
        [{ field: "id", operator: "eq", value: "ticket-100" }],
        testUserId,
      );

      expect(getTableRows("support_tickets", testUserId).length).toBe(0);
      const remainingMessages = getTableRows("support_messages", testUserId);
      expect(remainingMessages.length).toBe(1);
      expect(remainingMessages[0].id).toBe("msg-200");
    });

    it("should automatically purge closed tickets and messages after 3 days with cleanupExpiredClosedTickets", () => {
      initUserFolder(testUserId, {
        username: "ticketuser3",
        email: "ticket3@example.com",
        passwordHash: "h",
        salt: "s",
      });

      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      // Expired closed ticket (closed 4 days ago)
      insertTable(
        "support_tickets",
        {
          id: "ticket-old-closed",
          title: "Old Closed Ticket",
          status: "Closed",
          closed_at: fourDaysAgo,
        },
        testUserId,
      );
      insertTable(
        "support_messages",
        {
          id: "msg-old-closed",
          ticket_id: "ticket-old-closed",
          sender_id: testUserId,
          message: "Old msg",
        },
        testUserId,
      );

      // Recent closed ticket (closed 1 day ago)
      insertTable(
        "support_tickets",
        {
          id: "ticket-recent-closed",
          title: "Recent Closed Ticket",
          status: "Closed",
          closed_at: oneDayAgo,
        },
        testUserId,
      );
      insertTable(
        "support_messages",
        {
          id: "msg-recent-closed",
          ticket_id: "ticket-recent-closed",
          sender_id: testUserId,
          message: "Recent msg",
        },
        testUserId,
      );

      // Active open ticket (created 5 days ago, but open)
      insertTable(
        "support_tickets",
        {
          id: "ticket-open",
          title: "Open Ticket",
          status: "Open",
          created_at: fourDaysAgo,
        },
        testUserId,
      );
      insertTable(
        "support_messages",
        {
          id: "msg-open",
          ticket_id: "ticket-open",
          sender_id: testUserId,
          message: "Open msg",
        },
        testUserId,
      );

      // Run cleanup
      const cleanedCount = cleanupExpiredClosedTickets();
      expect(cleanedCount).toBe(1);

      const remainingTickets = getTableRows("support_tickets", testUserId);
      expect(remainingTickets.map((t) => t.id).sort()).toEqual(
        ["ticket-open", "ticket-recent-closed"].sort(),
      );

      const remainingMessages = getTableRows("support_messages", testUserId);
      expect(remainingMessages.map((m) => m.id).sort()).toEqual(
        ["msg-open", "msg-recent-closed"].sort(),
      );
    });
  });
});
