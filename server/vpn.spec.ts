import request from "supertest";
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";

const app = express();
app.use(express.json());

// Mock VPN route for unit testing
app.post("/api/vpn/auth", async (req, res) => {
  const { user_id, access_token } = req.body;
  if (!user_id || !access_token) {
    return res.status(400).json({ success: false, error: "Missing authentication parameters." });
  }
  if (user_id === "test-user-id" && access_token === "valid-token") {
    return res.json({ success: true, message: "Authentication successful." });
  }
  return res.status(401).json({ success: false, error: "Invalid credentials or unauthorized token." });
});

describe("VPN Server Auth API Tests", () => {
  it("should fail authentication if user_id or access_token is missing", async () => {
    const res = await request(app)
      .post("/api/vpn/auth")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should authenticate correctly with valid credentials", async () => {
    const res = await request(app)
      .post("/api/vpn/auth")
      .send({ user_id: "test-user-id", access_token: "valid-token" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should deny access with invalid credentials", async () => {
    const res = await request(app)
      .post("/api/vpn/auth")
      .send({ user_id: "invalid", access_token: "invalid" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
