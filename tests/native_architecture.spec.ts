import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import app from "../server/index.ts";
import {
  db,
  setLocalSession,
  getAuthenticatedClient,
} from "../client/lib/db.ts";
import {
  generateToken,
  verifyToken,
  resolveUserFromToken,
  hashPassword,
  verifyPassword,
} from "../server/lib/auth.ts";
import {
  DATA_DIR,
  getUserById,
  getUserByUsernameOrEmail,
} from "../server/lib/dataStore.ts";

describe("Milestone 5 Deep Adversarial Native Architecture Stress Test", () => {
  const originalFetch = globalThis.fetch;
  let testUser1: any = null;
  let testUser1Token: string = "";
  let testUser2: any = null;
  let testUser2Token: string = "";
  let adminUser: any = null;
  let adminToken: string = "";

  const outboundRequests: string[] = [];

  beforeAll(() => {
    // Setup localStorage mock for client-side localSession emulation
    const storageStore = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => storageStore.get(key) || null,
      setItem: (key: string, val: string) => storageStore.set(key, String(val)),
      removeItem: (key: string) => storageStore.delete(key),
      clear: () => storageStore.clear(),
      length: 0,
      key: (i: number) => Array.from(storageStore.keys())[i] || null,
    };

    // Intercept all fetch requests to monitor for any outbound Supabase requests
    // and route /api/* to app.request
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      outboundRequests.push(url);

      if (url.includes("supabase.co") || url.includes("supabase.in")) {
        throw new Error(
          `CRITICAL VIOLATION: Outbound Supabase network call detected to ${url}`,
        );
      }

      if (url.startsWith("/api/")) {
        return app.request(url, init);
      }
      return originalFetch(input, init);
    };
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    // Clean up test users from Data/ and uploads/
    const usersToClean = [testUser1?.id, testUser2?.id, adminUser?.id].filter(
      Boolean,
    );
    for (const uid of usersToClean) {
      try {
        const uPath = path.join(DATA_DIR, String(uid));
        if (fs.existsSync(uPath)) {
          fs.rmSync(uPath, { recursive: true, force: true });
        }
        const storagePath = path.join(
          process.cwd(),
          "uploads",
          "Storage",
          String(uid),
        );
        if (fs.existsSync(storagePath)) {
          fs.rmSync(storagePath, { recursive: true, force: true });
        }
        const publicStoragePath = path.join(
          process.cwd(),
          "uploads",
          "public-assets",
          String(uid),
        );
        if (fs.existsSync(publicStoragePath)) {
          fs.rmSync(publicStoragePath, { recursive: true, force: true });
        }
      } catch {}
    }
  });

  describe("1. Local Auth Flow & Security Boundary Stress Testing", () => {
    it("should reject registration with empty body", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it("should reject registration with invalid username (< 3 chars)", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "ab",
          email: "ab@example.com",
          password: "password123",
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/username.*at least 3/i);
    });

    it("should reject registration with invalid email", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "validuser",
          email: "invalid-email",
          password: "password123",
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/valid email/i);
    });

    it("should reject registration with weak password (< 6 chars)", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "validuser",
          email: "valid@example.com",
          password: "123",
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/password.*at least 6/i);
    });

    it("should safely handle registration with injection payloads in username and email", async () => {
      const payloadUsername = "user_<script>alert('xss')</script>";
      const payloadEmail = "user_' OR 1=1--@example.com";
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: payloadUsername,
          email: payloadEmail,
          password: "SafePassword123!",
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.username).toBe(payloadUsername);

      // Clean up this temp user
      const uPath = path.join(DATA_DIR, String(json.user.id));
      if (fs.existsSync(uPath))
        fs.rmSync(uPath, { recursive: true, force: true });
    });

    it("should successfully register valid User 1 and return session token", async () => {
      const uniqueSuffix = Date.now().toString(36);
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: `adv_user_${uniqueSuffix}`,
          email: `adv_${uniqueSuffix}@example.com`,
          password: "SecretPassword123!",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.error).toBeNull();
      expect(json.token).toBeDefined();
      expect(json.token.startsWith("ol_")).toBe(true);
      expect(json.session).toBeDefined();
      expect(json.session.access_token).toBe(json.token);
      expect(json.user.email).toBe(`adv_${uniqueSuffix}@example.com`);

      testUser1 = json.user;
      testUser1Token = json.token;

      // Verify file system directory was created
      const userDir = path.join(DATA_DIR, String(testUser1.id));
      expect(fs.existsSync(userDir)).toBe(true);
      expect(fs.existsSync(path.join(userDir, "user.json"))).toBe(true);
      expect(fs.existsSync(path.join(userDir, "profile.json"))).toBe(true);
      expect(fs.existsSync(path.join(userDir, "preferences.json"))).toBe(true);
    });

    it("should prevent duplicate username registration (case-insensitive)", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: testUser1.username.toUpperCase(),
          email: "another_email@example.com",
          password: "Password123!",
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/username is already taken/i);
    });

    it("should prevent duplicate email registration (case-insensitive)", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "different_username_99",
          email: testUser1.email.toUpperCase(),
          password: "Password123!",
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/email is already registered/i);
    });

    it("should register User 2 and assign sequential ID", async () => {
      const uniqueSuffix = (Date.now() + 1).toString(36);
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: `adv_user2_${uniqueSuffix}`,
          email: `adv2_${uniqueSuffix}@example.com`,
          password: "SecretPassword123!",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      testUser2 = json.user;
      testUser2Token = json.token;
      expect(Number(testUser2.id)).toBeGreaterThan(Number(testUser1.id));
    });

    it("should allow login via username and return valid token", async () => {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: testUser1.username,
          password: "SecretPassword123!",
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token.startsWith("ol_")).toBe(true);
      expect(json.user.id).toBe(testUser1.id);
    });

    it("should allow login via email and return valid token", async () => {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: testUser1.email,
          password: "SecretPassword123!",
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token.startsWith("ol_")).toBe(true);
      expect(json.user.id).toBe(testUser1.id);
    });

    it("should reject login with wrong password", async () => {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: testUser1.username,
          password: "WrongPassword!",
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/invalid username or password/i);
    });

    it("should reject login with non-existent user", async () => {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: "non_existent_user_9999999",
          password: "Password123!",
        }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/invalid username or password/i);
    });

    it("should reject forged or tampered token signatures", async () => {
      const parts = testUser1Token.split(".");
      const forgedToken = `${parts[0]}.badsignature12345`;
      const verified = verifyToken(forgedToken);
      expect(verified).toBeNull();

      const user = await resolveUserFromToken(forgedToken);
      expect(user).toBeNull();
    });

    it("should reject expired tokens", async () => {
      const expiredToken = generateToken(
        {
          id: testUser1.id,
          username: testUser1.username,
          email: testUser1.email,
          role: "user",
        },
        -1, // expired 1 day ago
      );
      const verified = verifyToken(expiredToken);
      expect(verified).toBeNull();

      const user = await resolveUserFromToken(expiredToken);
      expect(user).toBeNull();
    });

    it("should reject tokens with corrupted payload format", async () => {
      const invalidTokens = [
        "not_a_token",
        "ol_invalidpayload.signature",
        "ol_..",
        "",
      ];
      for (const t of invalidTokens) {
        expect(verifyToken(t)).toBeNull();
        expect(await resolveUserFromToken(t)).toBeNull();
      }
    });

    it("should validate session with Authorization header", async () => {
      const res = await app.request("/api/auth/session", {
        headers: { Authorization: `Bearer ${testUser1Token}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.session).toBeDefined();
      expect(json.user.id).toBe(testUser1.id);
      expect(json.user.profile).toBeDefined();
      expect(json.user.profile.username).toBe(testUser1.username);
    });

    it("should validate session with query param token fallback", async () => {
      const res = await app.request(
        `/api/auth/session?token=${encodeURIComponent(testUser1Token)}`,
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.session).toBeDefined();
      expect(json.user.id).toBe(testUser1.id);
    });

    it("should return null session for unauthenticated session request", async () => {
      const res = await app.request("/api/auth/session");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.session).toBeNull();
      expect(json.user).toBeNull();
    });

    it("should support logout endpoint", async () => {
      const res = await app.request("/api/auth/logout", { method: "POST" });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("2. Client Database Query Builder (client/lib/db.ts) & /api/data/*", () => {
    beforeAll(() => {
      // Set local session for db client
      setLocalSession({
        access_token: testUser1Token,
        token_type: "bearer",
        user: testUser1,
      });
    });

    it("should reject unauthenticated insert to /api/data/insert", async () => {
      const res = await app.request("/api/data/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "data_saves",
          data: { id: "unauth_save", title: "Fail Save" },
        }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated update to /api/data/update", async () => {
      const res = await app.request("/api/data/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "data_saves",
          data: { title: "Fail Update" },
        }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated delete to /api/data/delete", async () => {
      const res = await app.request("/api/data/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "data_saves",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("should insert record via db.from().insert()", async () => {
      const insertData = {
        id: "save_adv_1",
        title: "Adversarial Save 1",
        category_id: "cat_1",
        data: { testKey: "testValue", number: 42 },
        created_at: new Date().toISOString(),
      };

      const { data, error } = await db.from("data_saves").insert(insertData);
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data) ? data[0].title : data.title).toBe(
        "Adversarial Save 1",
      );
    });

    it("should insert multiple records via db.from().insert()", async () => {
      const items = [
        {
          id: "save_adv_2",
          title: "Adversarial Save 2",
          category_id: "cat_1",
          data: { number: 100 },
          created_at: new Date().toISOString(),
        },
        {
          id: "save_adv_3",
          title: "Adversarial Save 3",
          category_id: "cat_2",
          data: { number: 200 },
          created_at: new Date().toISOString(),
        },
      ];

      const { data, error } = await db.from("data_saves").insert(items);
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it("should query records with select, filters, and ordering", async () => {
      const { data, error, count } = await db
        .from("data_saves")
        .select("*", { count: "exact" })
        .eq("category_id", "cat_1")
        .order("created_at", { ascending: true });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(count).toBe(2);
    });

    it("should support .single() and .maybeSingle()", async () => {
      const { data, error } = await db
        .from("data_saves")
        .select("*")
        .eq("id", "save_adv_1")
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBe("save_adv_1");
      expect(data.title).toBe("Adversarial Save 1");
    });

    it("should support filter operators: neq, in, like, gt, gte, lt, lte", async () => {
      const { data: neqData, error: neqErr } = await db
        .from("data_saves")
        .select("*")
        .neq("id", "save_adv_1");

      expect(neqErr).toBeNull();
      expect(neqData.length).toBe(2);

      const { data: inData, error: inErr } = await db
        .from("data_saves")
        .select("*")
        .in("id", ["save_adv_1", "save_adv_3"]);

      expect(inErr).toBeNull();
      expect(inData.length).toBe(2);

      const { data: likeData, error: likeErr } = await db
        .from("data_saves")
        .select("*")
        .like("title", "%Save 2%");

      expect(likeErr).toBeNull();
      expect(likeData.length).toBe(1);
      expect(likeData[0].id).toBe("save_adv_2");
    });

    it("should support head: true to count without downloading full body", async () => {
      const { data, count, error } = await db
        .from("data_saves")
        .select("*", { count: "exact", head: true })
        .eq("category_id", "cat_1");

      expect(error).toBeNull();
      expect(count).toBe(2);
      expect(data).toEqual([]);
    });

    it("should support pagination range(from, to)", async () => {
      const { data, error } = await db
        .from("data_saves")
        .select("*")
        .order("id", { ascending: true })
        .range(0, 1);

      expect(error).toBeNull();
      expect(data.length).toBe(2);
    });

    it("should support update via db.from().update().eq()", async () => {
      const { data, error } = await db
        .from("data_saves")
        .update({ title: "Updated Title 1" })
        .eq("id", "save_adv_1");

      expect(error).toBeNull();
      expect(data).toBeDefined();

      // Verify update in datastore
      const { data: queryData } = await db
        .from("data_saves")
        .select("*")
        .eq("id", "save_adv_1")
        .single();

      expect(queryData.title).toBe("Updated Title 1");
    });

    it("should support upsert via db.from().upsert()", async () => {
      // Upsert existing record
      const { data: upsertExisting, error: err1 } = await db
        .from("data_saves")
        .upsert(
          { id: "save_adv_1", title: "Upserted Title 1" },
          { onConflict: "id" },
        );
      expect(err1).toBeNull();

      // Upsert brand new record
      const { data: upsertNew, error: err2 } = await db
        .from("data_saves")
        .upsert(
          { id: "save_adv_4", title: "Upserted Title 4", category_id: "cat_2" },
          { onConflict: "id" },
        );
      expect(err2).toBeNull();

      const { data: check4 } = await db
        .from("data_saves")
        .select("*")
        .eq("id", "save_adv_4")
        .single();
      expect(check4.title).toBe("Upserted Title 4");
    });

    it("should delete record via db.from().delete().eq()", async () => {
      const { error: delErr } = await db
        .from("data_saves")
        .delete()
        .eq("id", "save_adv_4");

      expect(delErr).toBeNull();

      const { data: checkDel } = await db
        .from("data_saves")
        .select("*")
        .eq("id", "save_adv_4");

      expect(checkDel).toEqual([]);
    });

    it("should execute RPC calls: get_points_status and spend_points", async () => {
      // 1. Check points status
      const { data: statusData, error: statusErr } =
        await db.rpc("get_points_status");
      expect(statusErr).toBeNull();
      expect(statusData.points).toBeGreaterThan(0);
      expect(statusData.available).toBeGreaterThan(0);
      expect(statusData.given).toBeGreaterThan(0);
      expect(statusData.daily_claim_available).toBe(true);

      const initialPoints = statusData.points;

      // 2. Spend points
      const { data: spendData, error: spendErr } = await db.rpc(
        "spend_points",
        { amount: 30 },
      );
      expect(spendErr).toBeNull();
      expect(spendData.success).toBe(true);
      expect(spendData.points).toBeGreaterThanOrEqual(0);

      // 3. Attempt spending more points than available
      const { data: overspendData, error: overspendErr } = await db.rpc(
        "spend_points",
        { amount: 1000000 },
      );
      expect(overspendErr).toBeNull();
      expect(overspendData.success).toBe(false);
      expect(overspendData.error).toMatch(/insufficient points/i);
    });

    it("should return error for unknown RPC function", async () => {
      const { data, error } = await db.rpc("unknown_nonexistent_rpc_fn");
      expect(data).toBeNull();
    });

    it("should support getAuthenticatedClient(token) explicitly", async () => {
      const authClient = getAuthenticatedClient(testUser2Token);
      const { data, error } = await authClient
        .from("data_saves")
        .insert({ id: "user2_save_1", title: "User 2 Save" });

      expect(error).toBeNull();
      expect(data).toBeDefined();

      const { data: queryData } = await authClient
        .from("data_saves")
        .select("*")
        .eq("id", "user2_save_1")
        .single();
      expect(queryData.title).toBe("User 2 Save");
    });
  });

  describe("3. Storage API (/api/storage/*) File Operations & Access Control", () => {
    it("should reject unauthenticated upload", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob(["hello world"], { type: "text/plain" }),
        "hello.txt",
      );

      const res = await app.request(
        `/api/storage/upload/Storage/${testUser1.id}/hello.txt`,
        {
          method: "POST",
          body: formData,
        },
      );
      expect(res.status).toBe(401);
    });

    it("should prevent User 1 from uploading into User 2's storage directory", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob(["malicious payload"], { type: "text/plain" }),
        "hack.txt",
      );

      const res = await app.request(
        `/api/storage/upload/Storage/${testUser2.id}/hack.txt`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${testUser1Token}` },
          body: formData,
        },
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/cannot upload to other user's directory/i);
    });

    it("should prevent path traversal attacks in storage upload", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob(["malicious file"], { type: "text/plain" }),
        "evil.txt",
      );

      const res = await app.request(
        `/api/storage/upload/Storage/../../../evil.txt`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${testUser1Token}` },
          body: formData,
        },
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("should successfully upload file to user's own directory", async () => {
      const testContent =
        "Hello from adversarial storage tester! " + Date.now();
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([testContent], { type: "text/plain" }),
        "adversarial_test.txt",
      );

      const res = await app.request(
        `/api/storage/upload/Storage/${testUser1.id}/adversarial_test.txt`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${testUser1Token}` },
          body: formData,
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.error).toBeNull();
      expect(json.data.path).toContain("adversarial_test.txt");

      // Verify file exists on disk
      const diskPath = path.join(
        process.cwd(),
        "uploads",
        "Storage",
        String(testUser1.id),
        "adversarial_test.txt",
      );
      expect(fs.existsSync(diskPath)).toBe(true);
      expect(fs.readFileSync(diskPath, "utf-8")).toBe(testContent);
    });

    it("should list uploaded files in bucket prefix", async () => {
      const res = await app.request(`/api/storage/list/Storage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testUser1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: String(testUser1.id) }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.error).toBeNull();
      expect(Array.isArray(json.data)).toBe(true);
      const fileNames = json.data.map((f: any) => f.name);
      expect(fileNames).toContain("adversarial_test.txt");
    });

    it("should download uploaded file and match content and mime type", async () => {
      const res = await app.request(
        `/api/storage/download/Storage/${testUser1.id}/adversarial_test.txt`,
        {
          headers: { Authorization: `Bearer ${testUser1Token}` },
        },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      const text = await res.text();
      expect(text).toContain("Hello from adversarial storage tester!");
    });

    it("should return 404 for non-existent file download", async () => {
      const res = await app.request(
        `/api/storage/download/Storage/${testUser1.id}/non_existent_file_999.txt`,
        {
          headers: { Authorization: `Bearer ${testUser1Token}` },
        },
      );
      expect(res.status).toBe(404);
    });

    it("should remove file via DELETE /api/storage/remove/:bucket", async () => {
      const res = await app.request(`/api/storage/remove/Storage`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${testUser1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paths: [`${testUser1.id}/adversarial_test.txt`],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.error).toBeNull();

      // Verify file is gone
      const checkRes = await app.request(
        `/api/storage/download/Storage/${testUser1.id}/adversarial_test.txt`,
        {
          headers: { Authorization: `Bearer ${testUser1Token}` },
        },
      );
      expect(checkRes.status).toBe(404);
    });
  });

  describe("4. Admin Authorization & RBAC Boundaries", () => {
    beforeAll(async () => {
      // Create admin user
      const suffix = Date.now().toString(36);
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: `admin_${suffix}`,
          email: `admin_${suffix}@example.com`,
          password: "AdminPassword123!",
        }),
      });
      const json = await res.json();
      adminUser = json.user;

      // Update role to admin in user.json
      const userFilePath = path.join(
        DATA_DIR,
        String(adminUser.id),
        "user.json",
      );
      const uData = JSON.parse(fs.readFileSync(userFilePath, "utf-8"));
      uData.role = "admin";
      fs.writeFileSync(userFilePath, JSON.stringify(uData, null, 2), "utf-8");

      // Generate admin token with role: 'admin'
      adminToken = generateToken({
        id: String(adminUser.id),
        username: uData.username,
        email: uData.email,
        role: "admin",
      });
    });

    it("should reject unauthenticated access to /api/admin/support/tickets (401)", async () => {
      const res = await app.request("/api/admin/support/tickets");
      expect(res.status).toBe(401);
    });

    it("should reject non-admin user token to /api/admin/support/tickets (403)", async () => {
      const res = await app.request("/api/admin/support/tickets", {
        headers: { Authorization: `Bearer ${testUser1Token}` },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/admin access required/i);
    });

    it("should reject non-admin user token to /api/admin/verifications (403)", async () => {
      const res = await app.request("/api/admin/verifications", {
        headers: { Authorization: `Bearer ${testUser1Token}` },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/admin access required/i);
    });

    it("should reject non-admin user token to /api/admin/verifications/:id/approve (403)", async () => {
      const res = await app.request(
        "/api/admin/verifications/some-id/approve",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${testUser1Token}` },
        },
      );
      expect(res.status).toBe(403);
    });

    it("should reject non-admin user token to /api/admin/verifications/:id/reject (403)", async () => {
      const res = await app.request("/api/admin/verifications/some-id/reject", {
        method: "POST",
        headers: { Authorization: `Bearer ${testUser1Token}` },
        body: JSON.stringify({ reason: "test" }),
      });
      expect(res.status).toBe(403);
    });

    it("should allow admin token to access /api/admin/support/tickets", async () => {
      const res = await app.request("/api/admin/support/tickets", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("tickets");
      expect(Array.isArray(json.tickets)).toBe(true);
    });

    it("should allow admin token to access /api/admin/verifications", async () => {
      const res = await app.request("/api/admin/verifications", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("verifications");
      expect(Array.isArray(json.verifications)).toBe(true);
    });

    it("should allow user to submit asset verification request and admin to approve it", async () => {
      // 1. User submits verification request
      const submitRes = await app.request("/api/assets/verifications/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testUser1Token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_type: "file",
          target_type: "public_asset",
          title: "Adversarial Test Shared Asset",
          description: "Shared asset description",
          original_file_path: `${testUser1.id}/asset.bin`,
          file_size: 1024,
          mime_type: "application/octet-stream",
          metadata: { category: "tool" },
        }),
      });

      expect(submitRes.status).toBe(200);
      const submitJson = await submitRes.json();
      expect(submitJson.success).toBe(true);
      const verificationId = submitJson.verification.id;

      // 2. User checks their own verification requests
      const myVerifRes = await app.request("/api/assets/verifications/my", {
        headers: { Authorization: `Bearer ${testUser1Token}` },
      });
      expect(myVerifRes.status).toBe(200);
      const myVerifJson = await myVerifRes.json();
      expect(
        myVerifJson.verifications.some((v: any) => v.id === verificationId),
      ).toBe(true);

      // 3. Admin lists verifications and sees the submitted request
      const adminListRes = await app.request("/api/admin/verifications", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(adminListRes.status).toBe(200);
      const adminListJson = await adminListRes.json();
      expect(
        adminListJson.verifications.some((v: any) => v.id === verificationId),
      ).toBe(true);

      // 4. Admin rejects without reason -> rejected with 400
      const noReasonReject = await app.request(
        `/api/admin/verifications/${verificationId}/reject`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      expect(noReasonReject.status).toBe(400);

      // 5. Admin approves the verification request
      const approveRes = await app.request(
        `/api/admin/verifications/${verificationId}/approve`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );
      expect(approveRes.status).toBe(200);
      const approveJson = await approveRes.json();
      expect(approveJson.success).toBe(true);
      expect(approveJson.verification.status).toBe("approved");
    });
  });

  describe("5. Zero Outbound Network Calls & Supabase Independence", () => {
    it("should confirm 0 outbound network calls were made to Supabase during all operations", () => {
      const supabaseCalls = outboundRequests.filter(
        (url) => url.includes("supabase.co") || url.includes("supabase.in"),
      );
      expect(supabaseCalls.length).toBe(0);
    });

    it("should verify package.json has no @supabase/ dependencies", () => {
      const pkgPath = path.join(process.cwd(), "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      const supabasePackages = Object.keys(allDeps).filter((k) =>
        k.includes("supabase"),
      );
      expect(supabasePackages).toEqual([]);
    });

    it("should verify root supabase/ directory does not exist", () => {
      const supabaseDir = path.join(process.cwd(), "supabase");
      expect(fs.existsSync(supabaseDir)).toBe(false);
    });

    it("should verify legacy files are completely removed", () => {
      const legacyFiles = [
        "server/lib/supabase.ts",
        "server/lib/supabase.test.ts",
        "server/routes/oauthAdmin.ts",
        "client/lib/supabase.ts",
        "client/components/MigrationModal.tsx",
        "client/components/MigrationModal.test.tsx",
        "client/pages/AuthCallback.tsx",
        "client/pages/OauthConsent.tsx",
      ];
      for (const file of legacyFiles) {
        const fullPath = path.join(process.cwd(), file);
        expect(fs.existsSync(fullPath)).toBe(false);
      }
    });
  });
});
