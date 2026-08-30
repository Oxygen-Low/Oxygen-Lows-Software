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
});
