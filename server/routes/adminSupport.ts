import express from "express";
import { createClient } from "@supabase/supabase-js";

export const adminSupportRouter = express.Router();

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SECRET!;

const getAdminSupabase = () => {
  return createClient(supabaseUrl, supabaseServiceKey);
};

// Get all support tickets
adminSupportRouter.get("/tickets", async (req, res) => {
  try {
    const supabase = getAdminSupabase();
    
    // We fetch the tickets and join with profiles to get user info if possible
    const { data: tickets, error } = await supabase
      .from("support_tickets")
      .select(`
        *,
        profiles:user_id ( username, avatar_url )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ tickets });
  } catch (error: any) {
    console.error("Error fetching support tickets:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific ticket
adminSupportRouter.get("/tickets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getAdminSupabase();

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select(`
        *,
        profiles:user_id ( username, avatar_url )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    res.json({ ticket });
  } catch (error: any) {
    console.error("Error fetching specific ticket:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a specific ticket
adminSupportRouter.get("/tickets/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getAdminSupabase();

    const { data: messages, error } = await supabase
      .from("support_messages")
      .select(`
        *,
        profiles:sender_id ( username, avatar_url )
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json({ messages });
  } catch (error: any) {
    console.error("Error fetching ticket messages:", error);
    res.status(500).json({ error: error.message });
  }
});

// Post a new message to a ticket
adminSupportRouter.post("/tickets/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const adminUser = res.locals.user;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: id,
        sender_id: adminUser.id,
        message
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: data });
  } catch (error: any) {
    console.error("Error posting ticket message:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update ticket status
adminSupportRouter.patch("/tickets/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !["Open", "Closed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("support_tickets")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ticket: data });
  } catch (error: any) {
    console.error("Error updating ticket status:", error);
    res.status(500).json({ error: error.message });
  }
});
