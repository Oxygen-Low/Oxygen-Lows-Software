import request from "supertest";
import { describe, it, expect } from "vitest";
import { app } from "./vpnServer";

describe("VPN Server Auth API Tests", () => {
  it("should fail authentication if user_id or access_token is missing", async () => {
    const res = await request(app).post("/api/vpn/auth").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should fail /sstdp handshake without auth headers", async () => {
    const res = await request(app).get("/sstdp");
    expect(res.status).toBe(401);
  });
});
