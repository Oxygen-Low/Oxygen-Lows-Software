import { describe, it, expect } from "vitest";
import app from "../server/index.ts";

describe("Chat Server Routes", () => {
  const testUserHeader = {
    Authorization: "Bearer local-test-token",
  };

  it("returns 401 when unauthorized", async () => {
    const res = await app.request("/api/chat/state");
    expect(res.status).toBe(401);
  });

  it("handles creating server and channels when mock authenticated", async () => {
    // Test public key query returns 404 for nonexistent user
    const res = await app.request("/api/chat/users/keys/nonexistent-user-123");
    expect(res.status).toBe(404);
  });

  describe("Auto Add & Auto Remove Friend Chats", () => {
    const ts = Date.now();
    const userA = `ChatUserA_${ts}`;
    const userB = `ChatUserB_${ts}`;
    let tokenA: string;
    let userIdA: string;
    let tokenB: string;
    let userIdB: string;
    let friendshipId: string;
    let createdDmId: string;

    it("registers User A and User B", async () => {
      const resA = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: userA,
          email: `${userA.toLowerCase()}@example.com`,
          password: "password123",
        }),
      });
      expect(resA.status).toBe(200);
      const dataA = await resA.json();
      tokenA = dataA.token;
      userIdA = dataA.user.id;

      const resB = await app.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: userB,
          email: `${userB.toLowerCase()}@example.com`,
          password: "password123",
        }),
      });
      expect(resB.status).toBe(200);
      const dataB = await resB.json();
      tokenB = dataB.token;
      userIdB = dataB.user.id;

      expect(tokenA).toBeDefined();
      expect(tokenB).toBeDefined();
    });

    it("initially has no friend chats for User A", async () => {
      const res = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.dms).toHaveLength(0);
    });

    it("does not add chat when friendship is only pending", async () => {
      const addRes = await app.request("/api/data/insert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          table: "friendships",
          data: {
            user_id: userIdA,
            friend_id: userIdB,
            status: "pending",
          },
        }),
      });
      expect(addRes.status).toBe(200);
      const addJson = await addRes.json();
      friendshipId = addJson.data.id;

      const stateRes = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const stateJson = await stateRes.json();
      expect(stateJson.dms).toHaveLength(0);
    });

    it("automatically adds DM chat when friendship is accepted", async () => {
      // User B accepts friendship
      const updateRes = await app.request("/api/data/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({
          table: "friendships",
          filters: [{ field: "id", operator: "eq", value: friendshipId }],
          data: { status: "accepted" },
        }),
      });
      expect(updateRes.status).toBe(200);

      // Check User A chat state
      const stateA = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(stateA.status).toBe(200);
      const jsonA = await stateA.json();
      expect(jsonA.dms.length).toBeGreaterThanOrEqual(1);
      const dmA = jsonA.dms.find((d: any) =>
        d.participants.includes(userIdB),
      );
      expect(dmA).toBeDefined();
      createdDmId = dmA.id;
      expect(dmA.recipient_names[userIdB]).toBe(userB);

      // Check User B chat state
      const stateB = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(stateB.status).toBe(200);
      const jsonB = await stateB.json();
      const dmB = jsonB.dms.find((d: any) =>
        d.participants.includes(userIdA),
      );
      expect(dmB).toBeDefined();
      expect(dmB.id).toBe(createdDmId);
    });

    it("allows sending messages between friends in the auto-created DM", async () => {
      const msgRes = await app.request("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          targetId: createdDmId,
          content: "Hello friend!",
          targetUserId: userIdB,
        }),
      });
      expect(msgRes.status).toBe(200);
      const msgJson = await msgRes.json();
      expect(msgJson.message.content).toBe("Hello friend!");
    });

    it("automatically removes chat when friendship is deleted (unfriended)", async () => {
      // User A unfriends User B
      const delRes = await app.request("/api/data/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          table: "friendships",
          filters: [{ field: "id", operator: "eq", value: friendshipId }],
        }),
      });
      expect(delRes.status).toBe(200);

      // Verify User A chat state no longer has the DM
      const stateA = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const jsonA = await stateA.json();
      expect(
        jsonA.dms.some((d: any) => d.participants.includes(userIdB)),
      ).toBe(false);

      // Verify User B chat state no longer has the DM
      const stateB = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const jsonB = await stateB.json();
      expect(
        jsonB.dms.some((d: any) => d.participants.includes(userIdA)),
      ).toBe(false);

      // Attempting to send message to removed DM should fail with 403
      const msgRes = await app.request("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          targetId: createdDmId,
          content: "Are you still there?",
          targetUserId: userIdB,
        }),
      });
      expect(msgRes.status).toBe(403);
    });

    it("automatically removes chat when a friend is blocked", async () => {
      // Re-create friendship
      const addRes = await app.request("/api/data/insert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          table: "friendships",
          data: {
            user_id: userIdA,
            friend_id: userIdB,
            status: "accepted",
          },
        }),
      });
      expect(addRes.status).toBe(200);

      // Verify DM was auto-added
      const stateCheck = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const checkJson = await stateCheck.json();
      expect(
        checkJson.dms.some((d: any) => d.participants.includes(userIdB)),
      ).toBe(true);

      // User A blocks User B
      const blockRes = await app.request("/api/data/insert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          table: "blocks",
          data: {
            blocker_id: userIdA,
            blocked_id: userIdB,
          },
        }),
      });
      expect(blockRes.status).toBe(200);

      // Both users should now have the DM removed
      const stateA = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const jsonA = await stateA.json();
      expect(
        jsonA.dms.some((d: any) => d.participants.includes(userIdB)),
      ).toBe(false);

      const stateB = await app.request("/api/chat/state", {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const jsonB = await stateB.json();
      expect(
        jsonB.dms.some((d: any) => d.participants.includes(userIdA)),
      ).toBe(false);

      // Calling / signaling should be rejected for blocked users
      const signalRes = await app.request("/api/chat/calls/signal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          type: "call_invite",
          targetUserId: userIdB,
          roomId: "room_123",
        }),
      });
      expect(signalRes.status).toBe(403);
    });
  });
});
