import type { MiddlewareHandler } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async () => ({ id: "42" })),
  localAuthMiddleware: (async (c, next) => {
    c.set("userId", "42");
    await next();
  }) satisfies MiddlewareHandler,
}));
vi.mock("../lib/dataStore.ts", () => ({
  queryTable: vi.fn(),
  insertTable: vi.fn((_table, data) => data),
  updateTable: vi.fn((_table, _filters, data) => data),
  upsertTable: vi.fn((_table, data) => data),
  deleteTable: vi.fn(),
  callRpc: vi.fn(),
}));

import { insertTable, updateTable, upsertTable } from "../lib/dataStore.ts";
import { dataRouter } from "./data";

const request = (
  operation: string,
  data: unknown,
  table = "user_preferences",
) =>
  dataRouter.request(`/${operation}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fixture",
    },
    body: JSON.stringify({ table, data }),
  });

beforeEach(() => vi.clearAllMocks());

describe("data mutation ownership", () => {
  it("passes the normalized table and sanitized profile patch to the store", async () => {
    const response = await request(
      "update",
      { id: "43", name: "Alice", role: "admin", verified: true },
      " Profiles ",
    );
    expect(response.status).toBe(200);
    expect(updateTable).toHaveBeenCalledExactlyOnceWith(
      "profiles",
      [],
      { id: "42", name: "Alice" },
      "42",
      [],
    );
  });

  it("passes a partial update to the store without adding user_id", async () => {
    const response = await request("update", { theme: "dark" });

    expect(response.status).toBe(200);
    expect(updateTable).toHaveBeenCalledExactlyOnceWith(
      "user_preferences",
      [],
      { theme: "dark" },
      "42",
      [],
    );
  });

  it.each(["42", 42])(
    "preserves an explicitly supplied matching user_id (%s)",
    async (userId) => {
      const data = { theme: "dark", user_id: userId };
      expect((await request("update", data)).status).toBe(200);
      expect(updateTable).toHaveBeenCalledExactlyOnceWith(
        "user_preferences",
        [],
        data,
        "42",
        [],
      );
    },
  );

  it.each(["insert", "upsert", "update"])(
    "rejects spoofed ownership on %s",
    async (operation) => {
      expect((await request(operation, { user_id: "43" })).status).toBe(403);
      expect(insertTable).not.toHaveBeenCalled();
      expect(upsertTable).not.toHaveBeenCalled();
      expect(updateTable).not.toHaveBeenCalled();
    },
  );

  it.each(["insert", "upsert"])(
    "sets ownership for single and batch %s payloads",
    async (operation) => {
      const write = operation === "insert" ? insertTable : upsertTable;
      for (const data of [
        { theme: "dark" },
        [{ theme: "dark" }, { volume: 80 }],
      ]) {
        expect((await request(operation, data)).status).toBe(200);
        const expected = Array.isArray(data)
          ? data.map((item) => ({ ...item, user_id: "42" }))
          : { ...data, user_id: "42" };
        expect(vi.mocked(write).mock.lastCall?.[1]).toEqual(expected);
      }
    },
  );
});
