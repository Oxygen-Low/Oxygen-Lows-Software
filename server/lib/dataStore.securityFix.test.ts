import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { authRouter } from "../routes/auth.ts";
import { dataRouter } from "../routes/data.ts";
import {
  DATA_DIR,
  initUserFolder,
  insertTable,
  queryTable,
  matchesFilter,
} from "./dataStore.ts";

function buildApp() {
  const app = new Hono();
  app.route("/api/auth", authRouter);
  app.route("/api/data", dataRouter);
  return app;
}

async function registerUser(app: any, username: string, email: string) {
  const res = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password: "password123" }),
  });
  expect(res.status).toBe(200);
  const json = await res.json();
  return json;
}

describe("Data store security fixes", () => {
  const userA = "secfix-a";
  const userB = "secfix-b";
  const userC = "secfix-c";
  const dirs = [userA, userB, userC].map((id) => path.join(DATA_DIR, id));

  beforeEach(() => {
    for (const d of dirs) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    initUserFolder(userA, { username: "SecFixA", email: "secfixa@example.com" });
    initUserFolder(userB, { username: "SecFixB", email: "secfixb@example.com" });
    initUserFolder(userC, { username: "SecFixC", email: "secfixc@example.com" });
  });
  afterEach(() => {
    for (const d of dirs) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("forces API-inserted friendships to pending and blocks sender self-accept", async () => {
    const app = buildApp();
    const ts = Date.now();
    const a = await registerUser(app, `SecFixA${ts}`, `secfixa${ts}@example.com`);
    const b = await registerUser(app, `SecFixB${ts}`, `secfixb${ts}@example.com`);

    // A tries to insert directly as accepted -> must be stored pending.
    const insertRes = await app.request("/api/data/insert", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({
        table: "friendships",
        data: { user_id: a.user.id, friend_id: b.user.id, status: "accepted" },
      }),
    });
    expect(insertRes.status).toBe(200);
    const insertJson = await insertRes.json();
    expect(insertJson.data.status).toBe("pending");
    const fid = insertJson.data.id;

    // A (sender) tries to self-accept via update -> must be rejected.
    const selfAccept = await app.request("/api/data/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({
        table: "friendships",
        filters: [{ field: "id", operator: "eq", value: fid }],
        data: { status: "accepted" },
      }),
    });
    expect(selfAccept.status).toBe(403);

    // B (recipient) accepts -> succeeds.
    const accept = await app.request("/api/data/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${b.token}` },
      body: JSON.stringify({
        table: "friendships",
        filters: [{ field: "id", operator: "eq", value: fid }],
        data: { status: "accepted" },
      }),
    });
    expect(accept.status).toBe(200);
  });

  it("does not expose other users' friendships to cross-user filters", () => {
    insertTable("friendships", { user_id: userA, friend_id: userB, status: "pending" }, userA);
    const leaked = queryTable({
      table: "friendships",
      userId: userC,
      filters: [{ field: "user_id", operator: "eq", value: userA }],
    });
    expect(leaked).toEqual([]);
  });

  it("treats like/ilike values as literal text (no regex injection / ReDoS)", () => {
    expect(matchesFilter({ name: "Alice" }, { field: "name", operator: "like", value: "Ali%" })).toBe(true);
    expect(matchesFilter({ name: "Bob" }, { field: "name", operator: "like", value: "Ali%" })).toBe(false);
    expect(matchesFilter({ name: "Alice" }, { field: "name", operator: "like", value: "A.ice%" })).toBe(false);
    expect(
      matchesFilter({ name: "a".repeat(50) }, { field: "name", operator: "like", value: "(a+)+$" }),
    ).toBe(false);
    expect(matchesFilter({ name: "(a+)+$" }, { field: "name", operator: "like", value: "(a+)+$" })).toBe(true);
    expect(matchesFilter({ name: "ALICE" }, { field: "name", operator: "ilike", value: "ali%" })).toBe(true);
  });
});
