import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { proxyRouter } from "./proxy";
import { Hono } from "hono";

// Create an app wrapper around the router
const app = new Hono();
app.route("/api/proxy", proxyRouter);

describe("Proxy Route - SSRF Protection", () => {
  beforeEach(() => {
    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue("mock response"),
    } as unknown as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should allow a valid external URL", async () => {
    const res = await app.request("/api/proxy/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("mock response");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should reject an invalid URL", async () => {
    const res = await app.request("/api/proxy/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Invalid URL");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should reject a non-http/https protocol", async () => {
    const res = await app.request("/api/proxy/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "file:///etc/passwd" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Invalid protocol");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should reject localhost", async () => {
    const res = await app.request("/api/proxy/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost:3000/api/secrets" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Access to internal/private networks is blocked");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should reject private IPs (e.g., 10.x.x.x)", async () => {
    const res = await app.request("/api/proxy/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://10.0.0.1/admin" }),
    });

    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should reject cloud metadata IP (169.254.x.x)", async () => {
    const res = await app.request("/api/proxy/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://169.254.169.254/latest/meta-data/" }),
    });

    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
