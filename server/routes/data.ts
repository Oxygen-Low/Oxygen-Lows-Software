import { Hono } from "hono";
import {
  queryTable,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
  callRpc,
} from "../lib/dataStore.ts";
import { localAuthMiddleware } from "../lib/auth.ts";

export const dataRouter = new Hono();

// Optional auth for public queries, required for mutations
dataRouter.post("/query", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
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
    const body = await c.req.json().catch(() => ({}));
    const { table, data } = body;
    const userId = c.get("userId" as any);

    if (!table || data === undefined) {
      return c.json(
        { data: null, error: "Table and data are required" },
        400,
      );
    }

    const result = insertTable(table, data, userId);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Insert failed" }, 500);
  }
});

dataRouter.post("/update", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, filters = [], orFilters = [], data } = body;
    const userId = c.get("userId" as any);

    if (!table || data === undefined) {
      return c.json(
        { data: null, error: "Table and data are required" },
        400,
      );
    }

    const result = updateTable(table, filters, data, userId, orFilters);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Update failed" }, 500);
  }
});

dataRouter.post("/upsert", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, data, onConflict } = body;
    const userId = c.get("userId" as any);

    if (!table || data === undefined) {
      return c.json(
        { data: null, error: "Table and data are required" },
        400,
      );
    }

    const result = upsertTable(table, data, userId, onConflict);
    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: err.message || "Upsert failed" }, 500);
  }
});

dataRouter.post("/delete", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
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
    const body = await c.req.json().catch(() => ({}));
    const { fn, args = {} } = body;

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
