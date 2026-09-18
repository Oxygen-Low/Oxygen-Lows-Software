import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { chessRouter } from "./chess.ts";

const app = new Hono();
app.route("/api/chess", chessRouter);

describe("Chess Multiplayer Signaling Router", () => {
  let createdRoomId = "";
  const hostPeerId = "peer_host_123";
  const guestPeerId = "peer_guest_456";

  it("creates a new room with host color and time limit", async () => {
    const res = await app.request("/api/chess/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peerId: hostPeerId,
        colorPreference: "w",
        timeLimit: 10,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.roomId).toBeDefined();
    expect(data.roomId.length).toBe(6);
    expect(data.hostColor).toBe("w");
    expect(data.guestColor).toBe("b");
    expect(data.timeLimit).toBe(10);
    createdRoomId = data.roomId;
  });

  it("joins an existing room and assigns opposite color to guest", async () => {
    const res = await app.request("/api/chess/room/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: createdRoomId,
        peerId: guestPeerId,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.roomId).toBe(createdRoomId);
    expect(data.yourColor).toBe("b");
    expect(data.opponentColor).toBe("w");
    expect(data.timeLimit).toBe(10);
    expect(data.isHost).toBe(false);
  });

  it("returns 404 when attempting to join a non-existent room", async () => {
    const res = await app.request("/api/chess/room/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: "ZZZZZZ",
        peerId: "peer_stranger",
      }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Room not found");
  });

  it("returns 400 when a 3rd peer attempts to join an already full room", async () => {
    const res = await app.request("/api/chess/room/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: createdRoomId,
        peerId: "peer_third_wheel",
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Room is already full");
  });

  it("relays signaling payloads successfully", async () => {
    const res = await app.request(`/api/chess/room/${createdRoomId}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: hostPeerId,
        type: "offer",
        payload: { sdp: "v=0..." },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
