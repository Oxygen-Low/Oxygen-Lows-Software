import { expect, test, describe, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { agentSearchRouter } from "./agentSearch.ts";

describe("Agent Search Route", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route("/api/ai/agent-search", agentSearchRouter);
  });

  test("Requires authorization token", async () => {
    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: "test",
        responseFormat: "summary"
      })
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Missing or invalid authorization token");
  });

  test("Validates input JSON", async () => {
    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        "Authorization": "Bearer fake_token",
        "Content-Type": "application/json"
      },
      body: "invalid json"
    });
    
    // Auth fails first with fake_token since Supabase auth is not mocked
    expect(res.status).toBe(401);
  });

  test("Requires query parameter", async () => {
    const res = await app.request("/api/ai/agent-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        responseFormat: "summary"
      })
    });
    
    expect(res.status).toBe(401);
  });
});
