import { Hono } from "hono";
import { getAdminClient, getAuthenticatedClient } from "../lib/supabase.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";
const ADMIN_USER_IDS = new Set(["3cb76293-8c6c-49b9-b431-1ff5fce471ee"]);

export const adminSupportRouter = new Hono();

function getServiceRoleKey(c: any) {
  const rawEnv = (c.env || {}) as any;
  const procEnv = typeof process !== "undefined" ? process.env : ({} as any);
  return rawEnv.SUPABASE_SECRET || procEnv.SUPABASE_SECRET;
}

adminSupportRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.split(" ")[1];

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!ADMIN_USER_IDS.has(user.id)) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  await next();
});

// Get all support tickets
adminSupportRouter.get("/tickets", async (c) => {
  try {
    const supabase = getAdminClient(getServiceRoleKey(c));

    const { data: tickets, error } = await supabase
      .from("support_tickets")
      .select("*")
      .neq("status", "Closed")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const userIds = [
      ...new Set(tickets.map((t: any) => t.user_id).filter(Boolean)),
    ];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", userIds);

    const ticketsWithProfiles = tickets.map((t: any) => ({
      ...t,
      profiles: profiles?.find((p: any) => p.user_id === t.user_id) || null,
    }));

    return c.json({ tickets: ticketsWithProfiles });
  } catch (error: any) {
    console.error("Error fetching support tickets:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get a specific ticket
adminSupportRouter.get("/tickets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const supabase = getAdminClient(getServiceRoleKey(c));

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    let profile = null;
    if (ticket.user_id) {
      const { data } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("user_id", ticket.user_id)
        .single();
      profile = data;
    }

    return c.json({ ticket: { ...ticket, profiles: profile } });
  } catch (error: any) {
    console.error("Error fetching specific ticket:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Get messages for a specific ticket
adminSupportRouter.get("/tickets/:id/messages", async (c) => {
  try {
    const id = c.req.param("id");
    const supabase = getAdminClient(getServiceRoleKey(c));

    const { data: messages, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const senderIds = [
      ...new Set(messages.map((m: any) => m.sender_id).filter(Boolean)),
    ];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", senderIds);

    const messagesWithProfiles = messages.map((m: any) => ({
      ...m,
      profiles: profiles?.find((p: any) => p.user_id === m.sender_id) || null,
    }));

    return c.json({ messages: messagesWithProfiles });
  } catch (error: any) {
    console.error("Error fetching ticket messages:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Post a new message to a ticket
adminSupportRouter.post("/tickets/:id/messages", async (c) => {
  try {
    const id = c.req.param("id");
    const { message } = await c.req.json();
    const token = c.req.header("authorization")?.split(" ")[1];
    
    // We still need the authenticated client here to get the current user's ID
    const authSupabase = getAuthenticatedClient(token);
    const supabase = getAdminClient(getServiceRoleKey(c));

    if (!message) {
      return c.json({ error: "Message is required" }, 400);
    }

    const {
      data: { user },
    } = await authSupabase.auth.getUser();
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { data, error } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: id,
        sender_id: user.id,
        message,
      })
      .select()
      .single();

    if (error) throw error;

    return c.json({ message: data });
  } catch (error: any) {
    console.error("Error posting ticket message:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Update ticket status
adminSupportRouter.patch("/tickets/:id/status", async (c) => {
  try {
    const id = c.req.param("id");
    const { status } = await c.req.json();
    const supabase = getAdminClient(getServiceRoleKey(c));

    if (!status || !["Open", "Closed"].includes(status)) {
      return c.json({ error: "Invalid status" }, 400);
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return c.json({ ticket: data });
  } catch (error: any) {
    console.error("Error updating ticket status:", error);
    return c.json({ error: error.message }, 500);
  }
});
