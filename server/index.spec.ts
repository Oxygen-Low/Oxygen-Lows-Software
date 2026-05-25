import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "./index";

describe("Server", () => {
  const app = createServer();

  it("GET /api/ping should return 200 and ping message", async () => {
    const response = await request(app).get("/api/ping");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "ping" });
  });

  it("GET /api/demo should return 200 and demo message", async () => {
    const response = await request(app).get("/api/demo");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("message");
    expect(response.body.message).toContain("Hello from Express server");
  });
});
