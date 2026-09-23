import { describe, it, expect } from "vitest";
import { createServer, getLinkHeaders } from "./index";

describe("getLinkHeaders", () => {
  it("should return a correctly formatted Link header string", () => {
    const linkHeaders = getLinkHeaders();
    expect(typeof linkHeaders).toBe("string");

    // Check targets and types
    expect(linkHeaders).toContain('</.well-known/api-catalog>; rel="api-catalog"');
    expect(linkHeaders).toContain('</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.0"');
    expect(linkHeaders).toContain('</api/docs>; rel="service-doc"; type="text/html"');
    expect(linkHeaders).toContain('</llms.txt>; rel="describedby"; type="text/plain"');
    expect(linkHeaders).toContain('</auth.md>; rel="describedby"; type="text/markdown"');
    expect(linkHeaders).toContain('</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"');
    expect(linkHeaders).toContain('</.well-known/oauth-authorization-server>; rel="oauth-authorization-server"');

    // Check format (joined by comma)
    expect(linkHeaders.split(", ").length).toBe(7);
  });
});

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

  describe("Agent Discovery & Link Response Headers (RFC 8288 / RFC 9727)", () => {
    it("GET / should return 404 (handled by Vite in prod) and RFC 8288 Link headers with registered relation types", async () => {
      const response = await app.request("/");
      expect(response.status).toBe(404);
      const linkHeader = response.headers.get("Link");
      expect(linkHeader).toBeDefined();
      expect(linkHeader).toBeTruthy();

      // Check registered relation types per RFC 8288 and RFC 9727
      expect(linkHeader).toContain('rel="api-catalog"');
      expect(linkHeader).toContain('rel="service-desc"');
      expect(linkHeader).toContain('rel="service-doc"');
      expect(linkHeader).toContain('rel="describedby"');

      // Check targets
      expect(linkHeader).toContain("</.well-known/api-catalog>");
      expect(linkHeader).toContain("</api/openapi.json>");
      expect(linkHeader).toContain("</api/docs>");
      expect(linkHeader).toContain("</llms.txt>");
      expect(linkHeader).toContain("</auth.md>");
    });

    it("HEAD / should return Link headers", async () => {
      const response = await app.request("/", { method: "HEAD" });
      const linkHeader = response.headers.get("Link");
      expect(linkHeader).toBeDefined();
      expect(linkHeader).toContain('rel="api-catalog"');
      expect(linkHeader).toContain('rel="service-desc"');
      expect(linkHeader).toContain('rel="service-doc"');
      expect(linkHeader).toContain('rel="describedby"');
    });

    it("GET / with Accept: text/markdown should return 200 markdown and Link headers", async () => {
      const response = await app.request("/", {
        headers: { Accept: "text/markdown" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/markdown");
      const linkHeader = response.headers.get("Link");
      expect(linkHeader).toBeDefined();
      expect(linkHeader).toContain('rel="api-catalog"');
      expect(linkHeader).toContain('rel="service-desc"');
      expect(linkHeader).toContain('rel="service-doc"');
      expect(linkHeader).toContain('rel="describedby"');
    });

    it("GET /.well-known/api-catalog should return RFC 9727 linkset JSON", async () => {
      const response = await app.request("/.well-known/api-catalog");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "application/linkset+json",
      );
      const body = await response.json();
      expect(body).toHaveProperty("linkset");
      expect(Array.isArray(body.linkset)).toBe(true);
    });

    it("GET /api/openapi.json should return OpenAPI 3.0 specification", async () => {
      const response = await app.request("/api/openapi.json");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(
        "application/vnd.oai.openapi+json",
      );
      const body = await response.json();
      expect(body).toHaveProperty("openapi", "3.0.3");
      expect(body).toHaveProperty("info");
      expect(body).toHaveProperty("paths");
      expect(body.paths).toHaveProperty("/health");
      expect(body.paths).toHaveProperty("/.well-known/api-catalog");
      expect(body.paths).toHaveProperty("/v1/chat/completions");
      expect(body.paths).toHaveProperty("/v1/images/generations");
      expect(body.paths).toHaveProperty("/v1/models");
    });

    it("GET /api/docs should return API documentation HTML with Free AI API section", async () => {
      const response = await app.request("/api/docs");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/html");
      const body = await response.text();
      expect(body).toContain("API Documentation");
      expect(body).toContain("/.well-known/api-catalog");
      expect(body).toContain("/api/openapi.json");
      expect(body).toContain("Free OpenAI-Compatible AI API");
      expect(body).toContain("/v1/chat/completions");
      expect(body).toContain("/v1/images/generations");
    });

    it("GET /llms.txt should return 200 plain text", async () => {
      const response = await app.request("/llms.txt");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/plain");
      const body = await response.text();
      expect(body).toContain("Oxygen Low's Software");
    });

    it("GET /auth.md should return 200 markdown guide", async () => {
      const response = await app.request("/auth.md");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/markdown");
      const body = await response.text();
      expect(body).toContain("auth.md");
    });

    it("should not emit Strict-Transport-Security header by default to prevent reverse-proxy duplication", async () => {
      const response = await app.request("/");
      expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    });

    it("should emit Strict-Transport-Security header when ENABLE_APP_HSTS is set to true", async () => {
      process.env.ENABLE_APP_HSTS = "true";
      const hstsApp = createServer();
      const response = await hstsApp.request("/");
      expect(response.headers.get("Strict-Transport-Security")).toBe(
        "max-age=63072000; includeSubDomains; preload",
      );
      delete process.env.ENABLE_APP_HSTS;
    });
  });
});
