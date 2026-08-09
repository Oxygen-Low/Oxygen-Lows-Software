import { describe, it, expect } from "vitest";
import { createServer } from "./index";

describe("Server", () => {
  const app = createServer();

  it("GET /api/ping should return 200 and ping message", async () => {
    const response = await app.request("/api/ping");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ message: "ping" });
  });

  it("GET /api/demo should return 200 and demo message", async () => {
    const response = await app.request("/api/demo");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("message");
    expect(body.message).toContain("Hello from Hono server");
  });
});
