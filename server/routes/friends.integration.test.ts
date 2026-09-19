import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authRouter } from "./auth.ts";
import { dataRouter } from "./data.ts";

const app = new Hono();
app.route("/api/auth", authRouter);
app.route("/api/data", dataRouter);

describe("Friends and Profiles Integration", () => {
  const timestamp = Date.now();
  const userAUsername = `Alice_${timestamp}`;
  const userBUsername = `Bob_${timestamp}`;
  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let userBId: string;
  let friendshipId: string;

  it("should register two users successfully", async () => {
    // Register User A
    const resA = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userAUsername,
        email: `alice_${timestamp}@example.com`,
        password: "password123",
      }),
    });
    expect(resA.status).toBe(200);
    const jsonA = await resA.json();
    tokenA = jsonA.token;
    userAId = jsonA.user.id;

    // Register User B (mixed case)
    const resB = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: userBUsername,
        email: `bob_${timestamp}@example.com`,
        password: "password123",
      }),
    });
    expect(resB.status).toBe(200);
    const jsonB = await resB.json();
    tokenB = jsonB.token;
    userBId = jsonB.user.id;

    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
  });

  it("should allow User A to find User B by username even when authenticated as User A", async () => {
    // Exact case search
    const queryRes = await app.request("/api/data/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        table: "profiles",
        filters: [{ field: "username", operator: "eq", value: userBUsername }],
        single: true,
      }),
    });

    expect(queryRes.status).toBe(200);
    const queryJson = await queryRes.json();
    expect(queryJson.data).not.toBeNull();
    expect(queryJson.data.user_id).toBe(userBId);
  });

  it("should find User B case-insensitively (lowercased search query)", async () => {
    const queryRes = await app.request("/api/data/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        table: "profiles",
        filters: [
          {
            field: "username",
            operator: "eq",
            value: userBUsername.toLowerCase(),
          },
        ],
        single: true,
      }),
    });

    expect(queryRes.status).toBe(200);
    const queryJson = await queryRes.json();
    expect(queryJson.data).not.toBeNull();
    expect(queryJson.data.user_id).toBe(userBId);
  });

  it("should send a friend request and verify bidirectional visibility", async () => {
    // User A sends friend request to User B
    const insertRes = await app.request("/api/data/insert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        table: "friendships",
        data: {
          user_id: userAId,
          friend_id: userBId,
          status: "pending",
        },
      }),
    });

    expect(insertRes.status).toBe(200);
    const insertJson = await insertRes.json();
    expect(insertJson.data).toBeDefined();
    friendshipId = insertJson.data.id;
    expect(friendshipId).toBeDefined();

    // User B fetches their friendships
    const rpcRes = await app.request("/api/data/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        functionName: "get_my_friendships",
        args: {},
      }),
    });

    expect(rpcRes.status).toBe(200);
    const rpcJson = await rpcRes.json();
    expect(Array.isArray(rpcJson.data)).toBe(true);
    const incoming = rpcJson.data.find((f: any) => f.id === friendshipId);
    expect(incoming).toBeDefined();
    expect(incoming.status).toBe("pending");
    expect(incoming.user_id).toBe(userAId);
    expect(incoming.friend_id).toBe(userBId);
    expect(incoming.profile).toBeDefined();
    expect(incoming.profile.username).toBe(userAUsername);
  });

  it("should accept friend request and update status for both users", async () => {
    // User B accepts friend request
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

    // User A checks friendships
    const rpcResA = await app.request("/api/data/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        functionName: "get_my_friendships",
        args: {},
      }),
    });

    expect(rpcResA.status).toBe(200);
    const rpcJsonA = await rpcResA.json();
    const acceptedFriendshipA = rpcJsonA.data.find(
      (f: any) => f.id === friendshipId,
    );
    expect(acceptedFriendshipA).toBeDefined();
    expect(acceptedFriendshipA.status).toBe("accepted");
    expect(acceptedFriendshipA.profile.username).toBe(userBUsername);

    // User B checks friendships
    const rpcResB = await app.request("/api/data/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        functionName: "get_my_friendships",
        args: {},
      }),
    });

    expect(rpcResB.status).toBe(200);
    const rpcJsonB = await rpcResB.json();
    const acceptedFriendshipB = rpcJsonB.data.find(
      (f: any) => f.id === friendshipId,
    );
    expect(acceptedFriendshipB).toBeDefined();
    expect(acceptedFriendshipB.status).toBe("accepted");
    expect(acceptedFriendshipB.profile.username).toBe(userAUsername);
  });

  it("should correctly resolve get_my_followers", async () => {
    // User A follows User B
    const followRes = await app.request("/api/data/insert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        table: "follows",
        data: {
          follower_id: userAId,
          following_id: userBId,
        },
      }),
    });
    expect(followRes.status).toBe(200);

    // User B calls get_my_followers
    const followersRes = await app.request("/api/data/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        functionName: "get_my_followers",
        args: {},
      }),
    });

    expect(followersRes.status).toBe(200);
    const followersJson = await followersRes.json();
    expect(Array.isArray(followersJson.data)).toBe(true);
    const follower = followersJson.data.find(
      (f: any) => f.follower_id === userAId,
    );
    expect(follower).toBeDefined();
    expect(follower.profile.username).toBe(userAUsername);
  });
});
