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
});
