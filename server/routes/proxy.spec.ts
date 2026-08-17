import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { proxyRouter } from "./proxy";
import { createClient } from "@supabase/supabase-js";

// Mock Supabase client
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(),
      },
    })),
  };
});

// Mock validateAiUrl
vi.mock("../lib/safeAiUrl.js", () => {
  return {
    validateAiUrl: vi.fn(async (url) => {
      // Just a simple mock, real one throws if invalid. We can just let it pass or throw based on URL.
      if (url.includes("malicious")) throw new Error("Invalid or unsafe URL");
      return;
    }),
  };
});

describe("Proxy Router", () => {
  let app: Hono;
  let mockGetUser: any;

  beforeEach(() => {
    app = new Hono();
    app.route("/proxy", proxyRouter);

    // Setup fetch mock
    global.fetch = vi.fn();

    // Setup supabase mock
    mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: "test-user" } },
      error: null,
    });

    (createClient as any).mockReturnValue({
      auth: {
        getUser: mockGetUser,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const makeRequest = async (body?: any, headers: Record<string, string> = { Authorization: "Bearer valid-token" }) => {
    return app.request("/proxy/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it("should return 401 if Authorization header is missing", async () => {
    const res = await makeRequest({ url: "https://api.github.com" }, {});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("should return 401 if Authorization header does not start with Bearer", async () => {
    const res = await makeRequest({ url: "https://api.github.com" }, { Authorization: "InvalidToken" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("should return 401 if Supabase auth fails", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Auth failed") });
    const res = await makeRequest({ url: "https://api.github.com" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("should return 400 if url is missing from body", async () => {
    const res = await makeRequest({});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing url" });
  });

  it("should return 400 if url is invalid format", async () => {
    const res = await makeRequest({ url: "not-a-url" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid url" });
  });

  it("should return 400 if protocol is not HTTPS", async () => {
    const res = await makeRequest({ url: "http://api.github.com" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Only HTTPS URLs are allowed" });
  });

  it("should return 400 if hostname is localhost", async () => {
    const res = await makeRequest({ url: "https://localhost/api" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Internal or private IPs not allowed" });
  });

  it("should return 400 if hostname is a private IP", async () => {
    const res = await makeRequest({ url: "https://192.168.1.1/api" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Internal or private IPs not allowed" });
  });

  it("should return 403 if domain is not allowed", async () => {
    const res = await makeRequest({ url: "https://example.com/api" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Domain not allowed" });
  });

  it("should return 400 if validateAiUrl throws", async () => {
    const res = await makeRequest({ url: "https://api.github.com/malicious" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid or unsafe URL" });
  });

  it("should call fetch and return response for valid request", async () => {
    const mockFetchResponse = new Response("mock response text", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
    (global.fetch as any).mockResolvedValueOnce(mockFetchResponse);

    const res = await makeRequest({
      url: "https://api.github.com/users",
      options: {
        method: "POST",
        headers: { "X-Custom": "test" },
        body: { data: 123 }
      }
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("mock response text");

    expect(global.fetch).toHaveBeenCalledWith("https://api.github.com/users", expect.objectContaining({
      method: "POST",
      headers: { "X-Custom": "test" },
      body: JSON.stringify({ data: 123 }),
      redirect: "manual"
    }));
  });

  it("should return 500 if fetch throws an error", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network Error"));

    const res = await makeRequest({ url: "https://api.github.com/users" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Network Error" });
  });
});
