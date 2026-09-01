import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  subscribeUser,
  unsubscribeUser,
  subscribeAdmin,
  unsubscribeAdmin,
  type RealtimeChangeEvent,
} from "../lib/realtime.ts";

export const realtimeRouter = new Hono();

/**
 * GET /api/realtime
 *
 * Server-Sent Events stream for real-time support ticket / message updates.
 *
 * Auth: pass the bearer token as the `token` query parameter because browsers
 * do not allow custom headers when using the native EventSource API.
 *
 * Events emitted:
 *   "connected"        – fired once on successful connection
 *   "postgres_changes" – fired whenever a support_tickets/support_messages
 *                        row is inserted, updated, or deleted
 *   "ping"             – keep-alive heartbeat every 30 s
 */
realtimeRouter.get("/", async (c) => {
  const token =
    c.req.query("token") ??
    c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const isAdmin = user.role === "admin" || String(user.id) === "1";
  const userId = String(user.id);

  return streamSSE(c, async (stream) => {
    const listener = async (event: RealtimeChangeEvent) => {
      try {
        await stream.writeSSE({
          event: "postgres_changes",
          data: JSON.stringify(event),
        });
      } catch {
        // Stream already closed – ignore
      }
    };

    // Register subscriptions
    subscribeUser(userId, listener);
    if (isAdmin) subscribeAdmin(listener);

    // Confirm connection to the client
    try {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ userId, isAdmin }),
      });
    } catch {
      unsubscribeUser(userId, listener);
      if (isAdmin) unsubscribeAdmin(listener);
      return;
    }

    // Clean up when the client disconnects
    stream.onAbort(() => {
      unsubscribeUser(userId, listener);
      if (isAdmin) unsubscribeAdmin(listener);
    });

    // Keep-alive heartbeat loop
    while (!stream.aborted) {
      await stream.sleep(30_000);
      try {
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch {
        break;
      }
    }

    // Final cleanup in case onAbort was not fired
    unsubscribeUser(userId, listener);
    if (isAdmin) unsubscribeAdmin(listener);
  });
});
