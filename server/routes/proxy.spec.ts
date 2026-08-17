import { describe, it, expect, vi, beforeEach } from "vitest";
import { proxyRouter } from "./proxy";

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn((_url: string, _key: string, options?: any) => {
      const authHeader = options?.global?.headers?.Authorization || "";
      const token = authHeader.replace(/^Bearer /i, "");
      return {
        auth: {
          getUser: vi.fn(async () => {
            if (token === "valid-token") {
              return {
                data: { user: { id: "user-123", email: "test@example.com" } },
                error: null,
              };
            }
            return {
              data: { user: null },
              error: { message: "Invalid token" },
            };
          }),
        },
      };
    }),
  };
});

describe("Proxy Route Security & Functionality", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const makeAuthRequest = (body: any, token: string = "valid-token") => {
    return new Request("http://localhost/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  };

  it("rejects unauthenticated requests without Authorization header", async () => {
    const req = new Request("http://localhost/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://api.github.com/zen" }),
    });
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("rejects requests with invalid bearer token", async () => {
    const req = makeAuthRequest(
      { url: "https://api.github.com/zen" },
      "invalid-token",
    );
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("rejects invalid JSON payloads", async () => {
    const req = new Request("http://localhost/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-token",
      },
      body: "invalid-json{",
    });
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON payload");
  });

  it("rejects missing url", async () => {
    const req = makeAuthRequest({});
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing url");
  });

  it("rejects invalid url format", async () => {
    const req = makeAuthRequest({ url: "not-a-valid-url" });
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid url");
  });

  it("rejects non-HTTPS URLs", async () => {
    const req = makeAuthRequest({ url: "http://api.github.com/zen" });
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Only HTTPS URLs are allowed");
  });

  it("rejects URLs with embedded credentials", async () => {
    const req = makeAuthRequest({
      url: "https://admin:secret@api.github.com/zen",
    });
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Credentials in URL are not allowed");
  });

  it("rejects URLs with non-standard ports", async () => {
    const req = makeAuthRequest({ url: "https://api.github.com:8080/zen" });
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid port");
  });

  it("rejects path traversal attempts", async () => {
    const req1 = makeAuthRequest({
      url: "https://api.github.com/repos/../secret",
    });
    const res1 = await proxyRouter.fetch(req1);
    expect(res1.status).toBe(400);
    const data1 = await res1.json();
    expect(data1.error).toBe("Invalid path");

    const req2 = makeAuthRequest({
      url: "https://api.github.com/repos/%2e%2e/secret",
    });
    const res2 = await proxyRouter.fetch(req2);
    expect(res2.status).toBe(400);
    const data2 = await res2.json();
    expect(data2.error).toBe("Invalid path");
  });

  it("rejects internal and private IP hostnames", async () => {
    const privateHosts = [
      "https://127.0.0.1/api",
      "https://10.0.0.1/api",
      "https://172.16.0.1/api",
      "https://192.168.1.1/api",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/api",
      "https://0.0.0.0/api",
      "https://metadata.google.internal/computeMetadata/v1",
    ];

    for (const url of privateHosts) {
      const req = makeAuthRequest({ url });
      const res = await proxyRouter.fetch(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Internal or private IPs not allowed");
    }
  });

  it("rejects non-allowlisted domains and subdomain hijacking attempts", async () => {
    const unallowedUrls = [
      "https://evil.com/payload",
      "https://google.com/search",
      "https://attacker-api.github.com/test",
      "https://subdomain.api.github.com/test",
      "https://sub.raw.githubusercontent.com/test",
      "https://custom.registry.npmjs.org/test",
    ];

    for (const url of unallowedUrls) {
      const req = makeAuthRequest({ url });
      const res = await proxyRouter.fetch(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Domain not allowed");
    }
  });

  it("rejects disallowed HTTP methods", async () => {
    const req = makeAuthRequest({
      url: "https://api.github.com/zen",
      options: { method: "CONNECT" },
    });
    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("HTTP method not allowed");
  });

  it("successfully forwards valid requests to allowlisted domains with redirect: error", async () => {
    const globalFetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Keep it logically awesome." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeAuthRequest({
      url: "https://api.github.com/zen",
      options: {
        method: "GET",
        headers: {
          Accept: "application/json",
          Host: "spoofed-host.com", // should be stripped
        },
      },
    });

    const res = await proxyRouter.fetch(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Keep it logically awesome.");

    expect(globalFetchSpy).toHaveBeenCalledTimes(1);
    const [fetchedUrl, fetchOptions] = globalFetchSpy.mock.calls[0];
    expect(fetchedUrl).toBe("https://api.github.com/zen");
    expect(fetchOptions?.redirect).toBe("error");
    expect(fetchOptions?.headers).toEqual({ Accept: "application/json" });
  });
});
