import { Hono } from "hono";
import crypto from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  queryTable,
  insertTable,
  updateTable,
  getProfileByUserId,
  cleanupExpiredClosedTickets,
} from "../lib/dataStore.ts";

export const adminSupportRouter = new Hono();

adminSupportRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  // A02: RFC 6750 scheme is case-insensitive; use slice to avoid partial-replace bugs
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  c.set("user" as any, user);
  await next();
});

// Get all support tickets
adminSupportRouter.get("/tickets", async (c) => {
  try {
    cleanupExpiredClosedTickets();

    const hideClosed = c.req.query("hideClosed") === "true";
    const statusParam = c.req.query("status");

    const filters: any[] = [];
    if (hideClosed) {
      filters.push({ field: "status", operator: "neq", value: "Closed" });
    } else if (statusParam && (statusParam === "Open" || statusParam === "Closed")) {
      filters.push({ field: "status", operator: "eq", value: statusParam });
    }

    const tickets = queryTable({
      table: "support_tickets",
      filters: filters.length > 0 ? filters : undefined,
      order: { column: "created_at", ascending: false },
    });

    const ticketsWithProfiles = (tickets || []).map((t: any) => {
      const profile = t.user_id ? getProfileByUserId(t.user_id) : null;
      return {
        ...t,
        profiles: profile
          ? {
              user_id: profile.user_id || profile.id,
              username: profile.username,
              avatar_url: profile.avatar_url,
            }
          : null,
      };
    });

    return c.json({ tickets: ticketsWithProfiles });
  } catch (error: any) {
    console.error("Error fetching support tickets:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get a specific ticket
adminSupportRouter.get("/tickets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const tickets = queryTable({
      table: "support_tickets",
      filters: [{ field: "id", operator: "eq", value: id }],
    });
    const ticket = tickets && tickets[0];
    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }

    let profile = null;
    if (ticket.user_id) {
      const p = getProfileByUserId(ticket.user_id);
      if (p) {
        profile = {
          user_id: p.user_id || p.id,
          username: p.username,
          avatar_url: p.avatar_url,
        };
      }
    }

    return c.json({ ticket: { ...ticket, profiles: profile } });
  } catch (error: any) {
    console.error("Error fetching specific ticket:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get messages for a specific ticket
adminSupportRouter.get("/tickets/:id/messages", async (c) => {
  try {
    const id = c.req.param("id");
    const messages = queryTable({
      table: "support_messages",
      filters: [{ field: "ticket_id", operator: "eq", value: id }],
      order: { column: "created_at", ascending: true },
    });

    const messagesWithProfiles = (messages || []).map((m: any) => {
      const p = m.sender_id ? getProfileByUserId(m.sender_id) : null;
      return {
        ...m,
        profiles: p
          ? {
              user_id: p.user_id || p.id,
              username: p.username,
              avatar_url: p.avatar_url,
            }
          : null,
      };
    });

    return c.json({ messages: messagesWithProfiles });
  } catch (error: any) {
    console.error("Error fetching ticket messages:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Post a new message to a ticket
adminSupportRouter.post("/tickets/:id/messages", async (c) => {
  try {
    const id = c.req.param("id");
    const { message } = await c.req.json().catch(() => ({}));
    const user = c.get("user" as any) as any;

    if (!message) {
      return c.json({ error: "Message is required" }, 400);
    }

    const tickets = queryTable({
      table: "support_tickets",
      filters: [{ field: "id", operator: "eq", value: id }],
    });
    const ticket = tickets && tickets[0];
    const targetUserId = ticket?.user_id || user.id;

    const newMessage = {
      id: crypto.randomUUID(),
      ticket_id: id,
      sender_id: user.id,
      message,
      created_at: new Date().toISOString(),
    };

    const inserted = insertTable("support_messages", newMessage, targetUserId);

    return c.json({
      message: Array.isArray(inserted) ? inserted[0] : inserted,
    });
  } catch (error: any) {
    console.error("Error posting ticket message:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Update ticket status
adminSupportRouter.patch("/tickets/:id/status", async (c) => {
  try {
    const id = c.req.param("id");
    const { status } = await c.req.json().catch(() => ({}));
    if (!status || !["Open", "Closed"].includes(status)) {
      return c.json({ error: "Invalid status" }, 400);
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status,
      updated_at: now,
      closed_at: status === "Closed" ? now : null,
    };

    const updated = updateTable(
      "support_tickets",
      [{ field: "id", operator: "eq", value: id }],
      updatePayload,
    );

    return c.json({ ticket: updated && updated[0] });
  } catch (error: any) {
    console.error("Error updating ticket status:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
