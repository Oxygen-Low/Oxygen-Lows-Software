import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../lib/auth.ts", async original => ({ ...(await original<any>()), resolveUserFromToken: vi.fn(async (token: string) => token === "fixture" ? { id: "42", role: "user" } : null) }));
vi.mock("../lib/dataStore.ts", async original => ({ ...(await original<any>()), queryTable: vi.fn(() => []), insertTable: vi.fn((_table, data) => data) }));
import { dataRouter } from "./data";
import { queryTable } from "../lib/dataStore.ts";
const request = (route: string, body: any, auth = false) => dataRouter.request(route, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer fixture" } : {}) }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());

describe("generic data authorization", () => {
  it.each(["user_passwords", "user_api_keys", "user_preferences", "support_messages"])("requires auth for %s", async table => {
    expect((await request("/query", { table })).status).toBe(401);
    expect(queryTable).not.toHaveBeenCalled();
  });
  it.each(["oauth_tokens", "oauth_codes", "chat_messages", "chat_user_keys"])("denies direct access to internal table %s", async table => {
    expect((await request("/query", { table }, true)).status).toBe(403);
    expect((await request("/insert", { table, data: {} }, true)).status).toBe(403);
  });
  it("permits public profiles and scopes authenticated private reads", async () => {
    expect((await request("/query", { table: "profiles" })).status).toBe(200);
    expect((await request("/query", { table: "user_passwords" }, true)).status).toBe(200);
    expect(queryTable).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "42" }));
  });
  it("rejects spoofed ownership", async () => {
    expect((await request("/insert", { table: "data_saves", data: { user_id: "43" } }, true)).status).toBe(403);
  });
});
