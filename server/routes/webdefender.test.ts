import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { defenderRouter } from "./webdefender.ts";
import { authRouter } from "./auth.ts";

const app = new Hono();
app.route("/api/auth", authRouter);
app.route("/api/webdefender", defenderRouter);

describe("WebDefender with local/migrated accounts", () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  let authToken = "";
  let createdAppId = "";
  let createdApiKey = "";
  let createdRouteId = "";
  let createdOutboundId = "";

  it("should register a local account and retrieve an ol_ auth token", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `defuser_${uniqueSuffix}`,
        email: `defuser_${uniqueSuffix}@example.com`,
        password: "securePassword123",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(json.token.startsWith("ol_")).toBe(true);
    authToken = json.token;
  });

  it("should list apps for the migrated/local account (initially empty)", async () => {
    const res = await app.request("/api/webdefender/apps", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(0);
  });

  it("should create a new protected app", async () => {
    const res = await app.request("/api/webdefender/apps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: "My Production Server",
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    createdAppId = json.id;
    createdApiKey = json.apiKey;

    expect(json.id).toBeDefined();
    expect(json.name).toBe("My Production Server");
    expect(json.apiKey).toBeDefined();
    expect(json.apiKey.startsWith("def_")).toBe(true);
    expect(json.api_key_prefix).toBeDefined();
  });

  it("should list the newly created app in /api/webdefender/apps", async () => {
    const res = await app.request("/api/webdefender/apps", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.length).toBe(1);
    expect(json[0].id).toBe(createdAppId);
    expect(json[0].name).toBe("My Production Server");
  });

  it("should get app details with config by ID", async () => {
    const res = await app.request(`/api/webdefender/apps/${createdAppId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(createdAppId);
    expect(json.defender_config).toBeDefined();
    expect(json.defender_config.length).toBeGreaterThan(0);
    expect(json.defender_config[0].block_sql_injection).toBe(true);
  });

  it("should toggle block mode on the app", async () => {
    const res = await app.request(
      `/api/webdefender/apps/${createdAppId}/block-mode`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ enabled: true }),
      },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.block_mode_enabled).toBe(true);
    expect(json.block_mode_enabled_at).toBeDefined();
  });

  it("should update security configuration", async () => {
    const res = await app.request(
      `/api/webdefender/apps/${createdAppId}/config`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          block_sql_injection: false,
          block_countries: ["KP", "IR"],
          events_limit: 100,
        }),
      },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.block_sql_injection).toBe(false);
    expect(json.block_countries).toEqual(["KP", "IR"]);
    expect(json.events_limit).toBe(100);
  });

  it("should verify the API key from the NPM package endpoint", async () => {
    const res = await app.request("/api/webdefender/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createdApiKey}`,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(createdAppId);
    expect(json.name).toBe("My Production Server");
    expect(json.block_mode_enabled).toBe(true);
    expect(json.config.block_sql_injection).toBe(false);
    expect(json.config.block_countries).toEqual(["KP", "IR"]);
  });

  it("should register routes via package endpoint", async () => {
    const res = await app.request("/api/webdefender/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createdApiKey}`,
      },
      body: JSON.stringify({
        routes: [
          { method: "GET", path: "/api/users" },
          { method: "POST", path: "/api/login" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.registered).toBe(2);
  });

  it("should fetch registered routes via UI endpoint", async () => {
    const res = await app.request(
      `/api/webdefender/apps/${createdAppId}/routes`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.length).toBe(2);
    expect(json.some((r: any) => r.path === "/api/users")).toBe(true);

    const loginRoute = json.find((r: any) => r.path === "/api/login");
    expect(loginRoute).toBeDefined();
    createdRouteId = loginRoute.id;
  });

  it("should update rate limit on a route via UI endpoint", async () => {
    const res = await app.request(`/api/webdefender/routes/${createdRouteId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        rateLimitEnabled: true,
        rateLimitRequests: 5,
        rateLimitWindowSeconds: 30,
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rate_limit_enabled).toBe(true);
    expect(json.rate_limit_requests).toBe(5);
    expect(json.rate_limit_window_seconds).toBe(30);
  });

  it("should log and retrieve security events", async () => {
    const eventRes = await app.request("/api/webdefender/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createdApiKey}`,
      },
      body: JSON.stringify({
        eventType: "sql_injection",
        ip: "198.51.100.22",
        countryCode: "US",
        method: "POST",
        path: "/api/login",
        blocked: true,
        requestBodySnippet: "username=' OR 1=1--",
      }),
    });

    expect(eventRes.status).toBe(201);

    const getRes = await app.request(
      `/api/webdefender/apps/${createdAppId}/events?limit=50`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(getRes.status).toBe(200);
    const json = await getRes.json();
    expect(json.events.length).toBe(1);
    expect(json.events[0].event_type).toBe("sql_injection");
    expect(json.events[0].blocked).toBe(true);
    expect(json.total).toBe(1);
  });

  it("should log, retrieve, toggle, and delete outbound connections", async () => {
    const outRes = await app.request("/api/webdefender/outbound", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createdApiKey}`,
      },
      body: JSON.stringify({
        host: "api.stripe.com",
        port: 443,
        protocol: "tcp",
        ip: "54.187.205.235",
      }),
    });

    expect(outRes.status).toBe(200);

    const getRes = await app.request(
      `/api/webdefender/apps/${createdAppId}/outbound`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(getRes.status).toBe(200);
    const json = await getRes.json();
    expect(json.length).toBe(1);
    expect(json[0].host).toBe("api.stripe.com");
    createdOutboundId = json[0].id;

    const putRes = await app.request(
      `/api/webdefender/outbound/${createdOutboundId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ allowed: false }),
      },
    );

    expect(putRes.status).toBe(200);
    const putJson = await putRes.json();
    expect(putJson.allowed).toBe(false);

    const delRes = await app.request(
      `/api/webdefender/outbound/${createdOutboundId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(delRes.status).toBe(204);
  });

  it("should rotate the API key", async () => {
    const res = await app.request(
      `/api/webdefender/apps/${createdAppId}/rotate-key`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.apiKey).toBeDefined();
    expect(json.apiKey).not.toBe(createdApiKey);
    expect(json.apiKeyPrefix).toBeDefined();

    const oldVerifyRes = await app.request("/api/webdefender/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createdApiKey}`,
      },
    });
    expect(oldVerifyRes.status).toBe(401);

    const newVerifyRes = await app.request("/api/webdefender/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${json.apiKey}`,
      },
    });
    expect(newVerifyRes.status).toBe(200);
  });

  it("should delete the app", async () => {
    const res = await app.request(`/api/webdefender/apps/${createdAppId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.status).toBe(204);

    const listRes = await app.request("/api/webdefender/apps", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    const listJson = await listRes.json();
    expect(listJson.length).toBe(0);
  });
});
