import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { realtimeRouter } from "./realtime";
import { broadcastChange } from "../lib/realtime";

const app = new Hono();
app.route("/api/realtime", realtimeRouter);

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async (token: string) => {
    if (token === "admin-token") {
      return {
        id: "1",
        email: "admin@example.com",
        username: "admin",
        role: "admin",
      };
    }
    if (token === "user-token") {
      return {
        id: "user-123",
        email: "test@example.com",
        username: "user",
        role: "user",
      };
    }
    return null;
  }),
}));

describe("realtimeRouter SSE Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 Unauthorized when no token is provided", async () => {
    const res = await app.request("/api/realtime");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 Unauthorized when an invalid token is provided", async () => {
    const res = await app.request("/api/realtime?token=invalid-token");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("establishes an SSE stream with text/event-stream content type and emits connected event", async () => {
    const res = await app.request("/api/realtime?token=user-token");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const { value } = await reader!.read();
    const text = decoder.decode(value);

    expect(text).toContain("event: connected");
    expect(text).toContain('"userId":"user-123"');
    expect(text).toContain('"isAdmin":false');

    await reader!.cancel();
  });

  it("streams postgres_changes event to the connected user when broadcastChange is called", async () => {
    const res = await app.request("/api/realtime?token=user-token");
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    // Read initial "connected" event
    await reader!.read();

    // Broadcast a change targeted at this user
    broadcastChange({
      table: "support_tickets",
      event: "INSERT",
      schema: "public",
      new: { id: "ticket-999", title: "New Bug Report", user_id: "user-123" },
      old: null,
      targetUserId: "user-123",
    });

    const { value } = await reader!.read();
    const text = decoder.decode(value);

    expect(text).toContain("event: postgres_changes");
    expect(text).toContain('"id":"ticket-999"');
    expect(text).toContain('"title":"New Bug Report"');

    await reader!.cancel();
  });

  it("streams support ticket events to connected admin", async () => {
    const res = await app.request("/api/realtime?token=admin-token");
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    // Read initial "connected" event
    const initial = await reader!.read();
    const initialText = decoder.decode(initial.value);
    expect(initialText).toContain('"isAdmin":true');

    // Broadcast a ticket event owned by a different user
    broadcastChange({
      table: "support_tickets",
      event: "INSERT",
      schema: "public",
      new: { id: "ticket-888", title: "User Issue", user_id: "user-456" },
      old: null,
      targetUserId: "user-456",
    });

    const { value } = await reader!.read();
    const text = decoder.decode(value);

    expect(text).toContain("event: postgres_changes");
    expect(text).toContain('"id":"ticket-888"');

    await reader!.cancel();
  });
});
