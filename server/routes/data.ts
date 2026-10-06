import { Hono } from "hono";
import {
  queryTable,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
  callRpc,
} from "../lib/dataStore.ts";
import { localAuthMiddleware, resolveUserFromToken } from "../lib/auth.ts";

export const dataRouter = new Hono<{ Variables: { dataBody: Record<string, any> } }>();

// Internal global/auth tables must only be accessed by their dedicated routers.
const PUBLIC_TABLES = new Set(["profiles", "profile_pictures", "public_assets", "public_characters", "follows", "public_asset_likes", "public_character_likes"]);
const USER_TABLES = new Set([
  ...PUBLIC_TABLES, "user_preferences", "data_saves", "data_save_categories", "chats", "chatbot_messages",
  "characters", "universes", "races", "user_passwords", "vpn_configs", "support_tickets", "support_messages",
  "friendships", "friends", "blocks", "asset_verifications", "user_models", "user_api_keys", "projects",
  "user_games", "games", "game_library", "installed_games", "custom_games", "user_playtime", "game_playtime",
  "playtime", "playtimes", "user_presence", "game_presence", "presence", "presences", "game_conflicts",
]);

dataRouter.use("*", async (c, next) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Invalid JSON" }, 400);
  c.set("dataBody", body);
  const token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (c.req.path.endsWith("/rpc")) {
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return next();
  }
  if (typeof body.table !== "string") return c.json({ error: "Table name is required" }, 400);
  body.table = body.table.trim().toLowerCase();
  if (!USER_TABLES.has(body.table)) return c.json({ error: "Unauthorized" }, 403);
  const query = c.req.path.endsWith("/query");
  if (!user && (!query || !PUBLIC_TABLES.has(body.table))) return c.json({ error: "Unauthorized" }, 401);
  if (!query && ["public_assets", "public_characters", "asset_verifications"].includes(body.table)) return c.json({ error: "Unauthorized" }, 403);
  if (!query && body.data !== undefined) {
    const items = Array.isArray(body.data) ? body.data : [body.data];
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return c.json({ error: "Invalid JSON" }, 400);
      if (item.user_id !== undefined && String(item.user_id) !== String(user!.id)) return c.json({ error: "Unauthorized" }, 403);
      if (c.req.path.endsWith("/insert") || c.req.path.endsWith("/upsert")) {
        item.user_id = String(user!.id);
      }
      if (["profiles", "profile_pictures"].includes(body.table)) {
        item.id = String(user!.id);
        for (const key of ["role", "is_admin", "verified", "is_verified", "suspended", "status"]) delete item[key];
      }
      if (["characters", "universes", "races"].includes(body.table)) {
        if (item.is_public === true || item.is_verified_public === true) return c.json({ error: "Unauthorized" }, 403);
      }
      if (body.table === "support_messages") item.sender_id = String(user!.id);
      if (body.table === "asset_verifications" && (item.status || item.verified || item.is_verified)) return c.json({ error: "Unauthorized" }, 403);
    }
  }
  await next();
});

// Optional auth for public queries, required for mutations
dataRouter.post("/query", async (c) => {
  try {
    const body = c.get("dataBody");
    const {
      table,
      filters,
      orFilters,
      order,
      limit,
      offset,
      single,
      select,
      count: countType,
      head,
    } = body;

    if (!table) {
      return c.json({ data: null, error: "Table name is required" }, 400);
    }

    // Try resolving user token if provided
    let userId: string | undefined;
    const authHeader = c.req.header("Authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace(/^Bearer /i, "");
        const user = await import("../lib/auth.ts").then((m) =>
          m.resolveUserFromToken(token),
        );
        if (user) {
          userId = user.id;
        }
      } catch {}
    }

    const result = queryTable({
      table,
      filters,
      orFilters,
      order,
      limit,
      offset,
      single,
      userId,
      select,
      head,
    });

    if (head && result && typeof result === "object" && "count" in result) {
      return c.json({ data: result.data, count: result.count, error: null });
    }

    let countVal: number | null = null;
    if (countType) {
      const allMatching = queryTable({
        table,
        filters,
        orFilters,
        userId,
      });
      countVal = Array.isArray(allMatching) ? allMatching.length : 0;
    }

    return c.json({ data: result, count: countVal, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Query failed" }, 500);
  }
});

dataRouter.post("/insert", localAuthMiddleware, async (c) => {
  try {
    const body = c.get("dataBody");
    const { table, data } = body;
    const userId = c.get("userId" as any);

    if (!table || data === undefined) {
      return c.json({ data: null, error: "Table and data are required" }, 400);
    }

    const result = insertTable(table, data, userId);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Insert failed" }, 500);
  }
});

dataRouter.post("/update", localAuthMiddleware, async (c) => {
  try {
    const body = c.get("dataBody");
    const { table, filters = [], orFilters = [], data } = body;
    const userId = c.get("userId" as any);

    if (!table || data === undefined) {
      return c.json({ data: null, error: "Table and data are required" }, 400);
    }

    const result = updateTable(table, filters, data, userId, orFilters);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Update failed" }, 500);
  }
});

dataRouter.post("/upsert", localAuthMiddleware, async (c) => {
  try {
    const body = c.get("dataBody");
    const { table, data, onConflict } = body;
    const userId = c.get("userId" as any);

    if (!table || data === undefined) {
      return c.json({ data: null, error: "Table and data are required" }, 400);
    }

    const result = upsertTable(table, data, userId, onConflict);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Upsert failed" }, 500);
  }
});

dataRouter.post("/delete", localAuthMiddleware, async (c) => {
  try {
    const body = c.get("dataBody");
    const { table, filters = [], orFilters = [] } = body;
    const userId = c.get("userId" as any);

    if (!table) {
      return c.json({ data: null, error: "Table is required" }, 400);
    }

    const result = deleteTable(table, filters, userId, orFilters);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Delete failed" }, 500);
  }
});

dataRouter.post("/rpc", async (c) => {
  try {
    const body = c.get("dataBody");
    const fn = body.fn || body.functionName;
    const args = body.args || {};

    if (!fn) {
      return c.json({ data: null, error: "Function name is required" }, 400);
    }

    let userId: string | undefined;
    const authHeader = c.req.header("Authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace(/^Bearer /i, "");
        const user = await import("../lib/auth.ts").then((m) =>
          m.resolveUserFromToken(token),
        );
        if (user) {
          userId = user.id;
        }
      } catch {}
    }

    const data = callRpc(fn, args, userId);
    return c.json({ data, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "RPC failed" }, 500);
  }
});
