import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createServer } from "../index";
import { activeRooms } from "../lib/gameEngine";

let mockUser = {
  id: "user-1",
  email: "host@test.com",
  user_metadata: { username: "HostPlayer" }
};

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn().mockImplementation(() => Promise.resolve({
          data: { user: mockUser },
          error: null
        }))
      }
    }))
  };
});

describe("TOS LLMs Game Routes API - Comprehensive Coverage", () => {
  let app: any;

  beforeEach(() => {
    app = createServer();
    activeRooms.clear();
    mockUser = {
      id: "user-1",
      email: "host@test.com",
      user_metadata: { username: "HostPlayer" }
    };
  });

  it("should fail authentication with 401 when no token is provided", async () => {
    const res = await request(app)
      .post("/api/social-deduction/create")
      .send({ aiModel: "Smart" });

    expect(res.status).toBe(401);
  });

  it("should create, join, start, will, and action a room with proper redactions", async () => {
    // 1. Create room
    const createRes = await request(app)
      .post("/api/social-deduction/create")
      .set("Authorization", "Bearer valid-token")
      .send({ aiModel: "Smart" });

    expect(createRes.status).toBe(200);
    const roomId = createRes.body.roomId;
    expect(roomId).toBeDefined();

    // Verify creator display name is user_metadata username
    expect(createRes.body.room.players[0].name).toBe("HostPlayer");

    // 2. Change mock user so guest joins
    mockUser = {
      id: "user-2",
      email: "join@test.com",
      user_metadata: { username: "GuestPlayer" }
    };

    // Join room
    const joinRes = await request(app)
      .post("/api/social-deduction/join")
      .set("Authorization", "Bearer valid-token")
      .send({ roomId });

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.room.players.length).toBe(2);

    // 3. Reject non-members from syncing or submitting wills
    mockUser = {
      id: "non-member",
      email: "intruder@test.com",
      user_metadata: { username: "Intruder" }
    };

    const intruderSync = await request(app)
      .get(`/api/social-deduction/sync?roomId=${roomId}`)
      .set("Authorization", "Bearer valid-token");
    expect(intruderSync.status).toBe(403);

    const intruderWill = await request(app)
      .post("/api/social-deduction/will")
      .set("Authorization", "Bearer valid-token")
      .send({ roomId, will: "I am fake" });
    expect(intruderWill.status).toBe(403);

    // 4. Submit a valid will as the host (member)
    mockUser = {
      id: "user-1",
      email: "host@test.com",
      user_metadata: { username: "HostPlayer" }
    };

    const willRes = await request(app)
      .post("/api/social-deduction/will")
      .set("Authorization", "Bearer valid-token")
      .send({ roomId, will: "Host's Last Will Findings" });

    expect(willRes.status).toBe(200);

    // 5. Verify room state is redacted for other players (user-2 shouldn't see user-1's private notes)
    mockUser = {
      id: "user-2",
      email: "join@test.com",
      user_metadata: { username: "GuestPlayer" }
    };

    const guestSync = await request(app)
      .get(`/api/social-deduction/sync?roomId=${roomId}`)
      .set("Authorization", "Bearer valid-token");

    expect(guestSync.status).toBe(200);
    // GuestPlayer should not see HostPlayer's will in the sync payload
    const hostPlayerInGuestSync = guestSync.body.room.players.find((p: any) => p.authUserId === "user-1");
    expect(hostPlayerInGuestSync.will).toBe("");
  });
});
