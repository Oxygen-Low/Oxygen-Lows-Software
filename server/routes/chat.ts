import { Hono } from "hono";
import { resolveUserFromToken } from "../lib/auth.ts";
import { queryTable, insertTable, updateTable } from "../lib/dataStore.ts";
import { broadcastChange } from "../lib/realtime.ts";
import crypto from "node:crypto";

export const chatRouter = new Hono();

// Auth helper
async function authenticate(c: any) {
  const token =
    c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ||
    c.req.query("token");

  if (!token) return null;
  const user = await resolveUserFromToken(token);
  return user || null;
}

/**
 * GET /api/chat/state
 * Returns user's servers, DMs, channels, and contacts.
 */
chatRouter.get("/state", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);

  // Get servers where user is member or public servers
  const allServers = (queryTable({ table: "chat_servers" }) as any[]) || [];
  const servers = allServers.filter(
    (s: any) => s.owner_id === userId || (s.members && s.members.includes(userId)) || s.is_public !== false
  );

  // Get channels for these servers
  const serverIds = servers.map((s: any) => s.id);
  const allChannels = (queryTable({ table: "chat_channels" }) as any[]) || [];
  const channels = allChannels.filter((ch: any) => serverIds.includes(ch.server_id));

  // Get DMs where user is a participant
  const allDms = (queryTable({ table: "chat_dms" }) as any[]) || [];
  const dms = allDms.filter((dm: any) => dm.participants && dm.participants.includes(userId));

  return c.json({
    user: { id: userId, username: user.username, display_name: (user as any).display_name || user.username },
    servers,
    channels,
    dms,
  });
});

/**
 * POST /api/chat/servers
 * Creates a new server with default '#general' text and 'Lobby' voice channels.
 */
chatRouter.post("/servers", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);

  const body = await c.req.json();
  const name = body.name?.trim() || "New Server";
  const icon = body.icon || "";
  const serverId = `srv_${crypto.randomUUID()}`;

  const server = {
    id: serverId,
    name,
    icon,
    owner_id: userId,
    members: [userId],
    created_at: new Date().toISOString(),
  };

  insertTable("chat_servers", server, userId);

  // Create default text channel
  const textChannel = {
    id: `chan_${crypto.randomUUID()}`,
    server_id: serverId,
    name: "general",
    type: "text",
    created_at: new Date().toISOString(),
  };
  insertTable("chat_channels", textChannel, userId);

  // Create default voice channel
  const voiceChannel = {
    id: `chan_${crypto.randomUUID()}`,
    server_id: serverId,
    name: "Lobby",
    type: "voice",
    created_at: new Date().toISOString(),
  };
  insertTable("chat_channels", voiceChannel, userId);

  return c.json({ server, channels: [textChannel, voiceChannel] });
});

/**
 * POST /api/chat/servers/:id/channels
 * Creates a new channel in a server.
 */
chatRouter.post("/servers/:id/channels", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const serverId = c.req.param("id");

  const body = await c.req.json();
  const name = (body.name || "new-channel").toLowerCase().replace(/\s+/g, "-");
  const type = body.type === "voice" ? "voice" : "text";

  const channel = {
    id: `chan_${crypto.randomUUID()}`,
    server_id: serverId,
    name,
    type,
    created_at: new Date().toISOString(),
  };

  insertTable("chat_channels", channel, String(user.id));
  return c.json({ channel });
});

/**
 * POST /api/chat/dms
 * Starts or retrieves a DM thread.
 */
chatRouter.post("/dms", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);

  const body = await c.req.json();
  const recipientId = String(body.recipientId);
  if (!recipientId || recipientId === userId) {
    return c.json({ error: "Invalid recipient" }, 400);
  }

  const allDms = (queryTable({ table: "chat_dms" }) as any[]) || [];
  const existing = allDms.find(
    (dm: any) =>
      dm.participants &&
      dm.participants.length === 2 &&
      dm.participants.includes(userId) &&
      dm.participants.includes(recipientId)
  );

  if (existing) {
    return c.json({ dm: existing });
  }

  const dm = {
    id: `dm_${crypto.randomUUID()}`,
    participants: [userId, recipientId],
    recipient_names: {
      [userId]: user.username,
      [recipientId]: body.recipientName || "Friend",
    },
    created_at: new Date().toISOString(),
  };

  insertTable("chat_dms", dm, userId);
  return c.json({ dm });
});

/**
 * GET /api/chat/messages
 * Retrieves messages for a channel or DM.
 */
chatRouter.get("/messages", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const targetId = c.req.query("targetId"); // channel_id or dm_id
  if (!targetId) return c.json({ error: "Missing targetId" }, 400);

  const allMessages = (queryTable({
    table: "chat_messages",
    filters: [{ field: "target_id", operator: "eq", value: targetId }],
    order: { column: "created_at", ascending: true },
    limit: 100,
  }) as any[]) || [];

  return c.json({ messages: allMessages });
});

/**
 * POST /api/chat/messages
 * Sends a message (E2EE encrypted or text).
 */
chatRouter.post("/messages", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);

  const body = await c.req.json();
  const targetId = body.targetId;
  const isEncrypted = !!body.isEncrypted;
  const encryptedPayload = body.encryptedPayload || null;
  const content = body.content || "";
  const attachments = body.attachments || [];

  if (!targetId || (!content && !encryptedPayload && attachments.length === 0)) {
    return c.json({ error: "Invalid message payload" }, 400);
  }

  const message = {
    id: `msg_${crypto.randomUUID()}`,
    target_id: targetId,
    sender_id: userId,
    sender_name: (user as any).display_name || user.username,
    content: isEncrypted ? "[Encrypted Message]" : content,
    is_encrypted: isEncrypted,
    encrypted_payload: encryptedPayload,
    attachments,
    reactions: {},
    created_at: new Date().toISOString(),
  };

  insertTable("chat_messages", message, userId);

  // Broadcast to target
  if (body.targetUserId) {
    broadcastChange({
      table: "chat_messages",
      event: "INSERT",
      schema: "public",
      new: message,
      old: null,
      targetUserId: String(body.targetUserId),
    });
  }

  return c.json({ message });
});

/**
 * POST /api/chat/calls/signal
 * Dispatches WebRTC signaling, ringing, and call status.
 */
chatRouter.post("/calls/signal", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);

  const body = await c.req.json();
  const { type, targetUserId, roomId, isVideo, data } = body;

  const eventPayload = {
    type,
    senderId: userId,
    senderName: (user as any).display_name || user.username,
    targetUserId,
    roomId,
    isVideo: !!isVideo,
    data,
    timestamp: Date.now(),
  };

  if (targetUserId) {
    broadcastChange({
      table: "chat_signaling",
      event: "INSERT",
      schema: "public",
      new: eventPayload,
      old: null,
      targetUserId: String(targetUserId),
    });
  }

  return c.json({ success: true, event: eventPayload });
});

/**
 * Public key registration & lookup for E2EE.
 */
chatRouter.post("/users/keys", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);

  const body = await c.req.json();
  const { publicKey } = body;
  if (!publicKey) return c.json({ error: "Missing publicKey" }, 400);

  const keyRecord = {
    user_id: userId,
    public_key: publicKey,
    updated_at: new Date().toISOString(),
  };

  const existing = (queryTable({
    table: "chat_user_keys",
    filters: [{ field: "user_id", operator: "eq", value: userId }],
  }) as any[]) || [];

  if (existing.length > 0) {
    updateTable("chat_user_keys", [{ field: "user_id", operator: "eq", value: userId }], keyRecord, userId);
  } else {
    insertTable("chat_user_keys", keyRecord, userId);
  }

  return c.json({ success: true });
});

chatRouter.get("/users/keys/:userId", async (c) => {
  const targetId = c.req.param("userId");
  const data = (queryTable({
    table: "chat_user_keys",
    filters: [{ field: "user_id", operator: "eq", value: targetId }],
  }) as any[]) || [];

  if (data.length === 0) {
    return c.json({ error: "Public key not found" }, 404);
  }

  return c.json({ publicKey: data[0].public_key });
});
