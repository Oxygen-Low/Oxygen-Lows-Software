import { Hono } from "hono";
import { getAuthenticatedClient } from "../lib/supabase.ts";

export const adminSupportRouter = new Hono();

// Get all support tickets
adminSupportRouter.get("/tickets", async (c) => {
  try {
    const token = c.req.header("authorization")?.split(" ")[1];
    const supabase = getAuthenticatedClient(token);
    
    const { data: tickets, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const userIds = [...new Set(tickets.map((t: any) => t.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", userIds);

    const ticketsWithProfiles = tickets.map((t: any) => ({
      ...t,
      profiles: profiles?.find((p: any) => p.user_id === t.user_id) || null
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
    const token = c.req.header("authorization")?.split(" ")[1];
    const supabase = getAuthenticatedClient(token);

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
    const token = c.req.header("authorization")?.split(" ")[1];
    const supabase = getAuthenticatedClient(token);

    const { data: messages, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const senderIds = [...new Set(messages.map((m: any) => m.sender_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", senderIds);

    const messagesWithProfiles = messages.map((m: any) => ({
      ...m,
      profiles: profiles?.find((p: any) => p.user_id === m.sender_id) || null
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
    const supabase = getAuthenticatedClient(token);
    
    if (!message) {
      return c.json({ error: "Message is required" }, 400);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const { data, error } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: id,
        sender_id: user.id,
        message
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
    const token = c.req.header("authorization")?.split(" ")[1];
    const supabase = getAuthenticatedClient(token);
    
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
