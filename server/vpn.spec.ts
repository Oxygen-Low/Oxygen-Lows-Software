import request from "supertest";
import { describe, it, expect } from "vitest";
import { app } from "./vpnServer";

describe("VPN Server API Tests", () => {
  it("should fail authentication if user_id or access_token is missing", async () => {
    const res = await request(app)
      .post("/api/vpn/auth")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return server status on the root path with CORS header", async () => {
    const res = await request(app)
      .get("/");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.body.status).toBe("online");
  });
});
