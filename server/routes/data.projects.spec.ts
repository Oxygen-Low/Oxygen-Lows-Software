import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { dataRouter } from "./data.ts";
import {
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
} from "../lib/dataStore.ts";
vi.mock("../lib/auth.ts", () => ({
  localAuthMiddleware: async (_c: any, next: any) => next(),
}));
vi.mock("../lib/dataStore.ts", () => ({
  queryTable: vi.fn(),
  insertTable: vi.fn(),
  updateTable: vi.fn(),
  upsertTable: vi.fn(),
  deleteTable: vi.fn(),
  callRpc: vi.fn(),
}));
describe("generic project mutation protection", () => {
  const app = new Hono().route("/api/data", dataRouter);
  it.each(["insert", "update", "upsert", "delete"])(
    "blocks %s for projects",
    async (operation) => {
      const res = await app.request(`/api/data/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "PROJECTS", data: { agents: [] } }),
      });
      expect(res.status).toBe(400);
      for (const fn of [insertTable, updateTable, upsertTable, deleteTable])
        expect(fn).not.toHaveBeenCalled();
    },
  );
});
