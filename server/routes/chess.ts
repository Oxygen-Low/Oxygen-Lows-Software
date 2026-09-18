import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import crypto from "node:crypto";

export interface ChessRoom {
  id: string;
  hostPeerId: string;
  guestPeerId?: string;
  colorPreference: "w" | "b" | "random";
  hostColor: "w" | "b";
  guestColor: "w" | "b";
  timeLimit: number; // 0 for untimed, or minutes (3, 5, 10, 15)
  createdAt: number;
  lastActive: number;
  status: "waiting" | "playing" | "finished";
}

const rooms = new Map<string, ChessRoom>();

// roomId -> Map<peerId, sendFunction>
type SseSender = (data: any) => Promise<void> | void;
const roomSubscribers = new Map<string, Map<string, SseSender>>();

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Auto-cleanup stale rooms older than 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.lastActive > 2 * 60 * 60 * 1000) {
      rooms.delete(id);
      roomSubscribers.delete(id);
    }
  }
}, 15 * 60 * 1000);

export const chessRouter = new Hono();

/**
 * POST /api/chess/room/create
 * Creates a new multiplayer room
 */
chessRouter.post("/room/create", async (c) => {
  try {
    const body = await c.req.json();
    const peerId = String(body.peerId || `peer_${crypto.randomUUID()}`);
    const colorPref: "w" | "b" | "random" = body.colorPreference || "random";
    const timeLimit = typeof body.timeLimit === "number" ? body.timeLimit : 0;

    let hostColor: "w" | "b";
    if (colorPref === "random") {
      hostColor = Math.random() < 0.5 ? "w" : "b";
    } else {
      hostColor = colorPref;
    }
    const guestColor: "w" | "b" = hostColor === "w" ? "b" : "w";

    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const room: ChessRoom = {
      id: roomId,
      hostPeerId: peerId,
      colorPreference: colorPref,
      hostColor,
      guestColor,
      timeLimit,
      createdAt: Date.now(),
      lastActive: Date.now(),
      status: "waiting",
    };

    rooms.set(roomId, room);

    return c.json({
      roomId,
      hostColor,
      guestColor,
      timeLimit,
      peerId,
    });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to create room" }, 500);
  }
});

/**
 * POST /api/chess/room/join
 * Join an existing multiplayer room
 */
chessRouter.post("/room/join", async (c) => {
  try {
    const body = await c.req.json();
    const rawRoomId = String(body.roomId || "").trim().toUpperCase();
    const peerId = String(body.peerId || `peer_${crypto.randomUUID()}`);

    const room = rooms.get(rawRoomId);
    if (!room) {
      return c.json({ error: "Room not found" }, 404);
    }

    room.lastActive = Date.now();

    // Check if re-joining
    if (room.hostPeerId === peerId) {
      return c.json({
        roomId: room.id,
        yourColor: room.hostColor,
        opponentColor: room.guestColor,
        timeLimit: room.timeLimit,
        isHost: true,
        status: room.status,
      });
    }

    if (room.guestPeerId === peerId) {
      return c.json({
        roomId: room.id,
        yourColor: room.guestColor,
        opponentColor: room.hostColor,
        timeLimit: room.timeLimit,
        isHost: false,
        status: room.status,
      });
    }

    // New guest joining
    if (room.guestPeerId && room.status === "playing") {
      return c.json({ error: "Room is already full" }, 400);
    }

    room.guestPeerId = peerId;
    room.status = "playing";

    // Notify host that guest has joined
    const peers = roomSubscribers.get(room.id);
    if (peers) {
      const hostSender = peers.get(room.hostPeerId);
      if (hostSender) {
        hostSender({
          type: "peer_joined",
          peerId,
          role: "guest",
          color: room.guestColor,
        });
      }
    }

    return c.json({
      roomId: room.id,
      yourColor: room.guestColor,
      opponentColor: room.hostColor,
      timeLimit: room.timeLimit,
      isHost: false,
      status: room.status,
    });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to join room" }, 500);
  }
});

/**
 * GET /api/chess/room/:roomId/events
 * SSE stream for real-time WebRTC signaling and room events
 */
chessRouter.get("/room/:roomId/events", async (c) => {
  const rawRoomId = c.req.param("roomId").trim().toUpperCase();
  const peerId = c.req.query("peerId");

  if (!peerId) {
    return c.json({ error: "Missing peerId" }, 400);
  }

  const room = rooms.get(rawRoomId);
  if (!room) {
    return c.json({ error: "Room not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    if (!roomSubscribers.has(rawRoomId)) {
      roomSubscribers.set(rawRoomId, new Map());
    }
    const peerMap = roomSubscribers.get(rawRoomId)!;

    const sender: SseSender = async (data: any) => {
      try {
        await stream.writeSSE({
          event: "message",
          data: JSON.stringify(data),
        });
      } catch {
        // Stream aborted or closed
      }
    };

    peerMap.set(peerId, sender);
    room.lastActive = Date.now();

    // Initial connected event
    try {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({
          roomId: rawRoomId,
          peerId,
          status: room.status,
          hasGuest: Boolean(room.guestPeerId),
        }),
      });

      // If guest connects and host is listening, or vice versa, notify
      const otherPeerId = peerId === room.hostPeerId ? room.guestPeerId : room.hostPeerId;
      if (otherPeerId && peerMap.has(otherPeerId)) {
        const otherSender = peerMap.get(otherPeerId);
        if (otherSender) {
          otherSender({
            type: "peer_connected",
            peerId,
          });
        }
      }
    } catch {
      peerMap.delete(peerId);
      return;
    }

    stream.onAbort(() => {
      peerMap.delete(peerId);
      if (peerMap.size === 0) {
        roomSubscribers.delete(rawRoomId);
      }
      // Notify other peer about disconnect
      const otherPeerId = peerId === room.hostPeerId ? room.guestPeerId : room.hostPeerId;
      if (otherPeerId) {
        const otherSender = peerMap.get(otherPeerId);
        if (otherSender) {
          otherSender({
            type: "peer_disconnected",
            peerId,
          });
        }
      }
    });

    // Heartbeat ping every 25 seconds
    while (!stream.aborted) {
      await stream.sleep(25_000);
      try {
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch {
        break;
      }
    }

    peerMap.delete(peerId);
    if (peerMap.size === 0) {
      roomSubscribers.delete(rawRoomId);
    }
  });
});

/**
 * POST /api/chess/room/:roomId/signal
 * Relays WebRTC signaling (offer, answer, ice-candidate, etc.) to peer
 */
chessRouter.post("/room/:roomId/signal", async (c) => {
  try {
    const rawRoomId = c.req.param("roomId").trim().toUpperCase();
    const body = await c.req.json();
    const { senderId, type, payload, targetId } = body;

    const room = rooms.get(rawRoomId);
    if (!room) {
      return c.json({ error: "Room not found" }, 404);
    }

    room.lastActive = Date.now();
    const peerMap = roomSubscribers.get(rawRoomId);

    if (peerMap) {
      for (const [pId, sender] of peerMap.entries()) {
        if (pId === senderId) continue; // Don't send back to sender
        if (targetId && pId !== targetId) continue; // Specific target if set

        try {
          sender({
            type,
            senderId,
            payload,
          });
        } catch {
          // Ignore failed send
        }
      }
    }

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err?.message || "Signal relay failed" }, 500);
  }
});
