import { describe, it, expect, vi } from "vitest";
import { DefenderClient } from "./webdefender.js";
import { createDefender } from "./hono.js";

describe("WebDefender path exclusions and skipBodyScanPaths", () => {
  const mockAppConfig = {
    id: "app-test",
    block_mode_enabled: true,
    config: {
      block_ssrf: true,
      block_sql_injection: true,
      block_shell_injection: true,
      block_path_traversal: true,
    },
    routes: [],
  };

  it("should completely bypass check for routes matching excludePaths", async () => {
    const client = new DefenderClient({
      apiKey: "test-key",
      offlineMode: true,
      excludePaths: ["/api/ai", /^\/internal\//],
    });
    // Manually inject appConfig for offline unit testing
    (client as any).appConfig = (client as any).normalizeConfig(mockAppConfig);

    const res1 = await client.handleRequest({
      ip: "1.2.3.4",
      method: "POST",
      path: "/api/ai/proxy",
      query: {},
      body: JSON.stringify({ prompt: "http://127.0.0.1:8080" }),
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(res1.blocked).toBe(false);
    expect(res1.eventType).toBe("allowed");

    const res2 = await client.handleRequest({
      ip: "1.2.3.4",
      method: "GET",
      path: "/internal/metrics",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(res2.blocked).toBe(false);
    expect(res2.eventType).toBe("allowed");
  });

  it("should skip body injection scan for routes matching skipBodyScanPaths but keep path/query checks", async () => {
    const client = new DefenderClient({
      apiKey: "test-key",
      offlineMode: true,
      skipBodyScanPaths: ["/api/ai/proxy"],
    });
    (client as any).appConfig = (client as any).normalizeConfig(mockAppConfig);

    // Body contains SSRF (e.g. user chatting about localhost/private IP)
    const chatMsgRes = await client.handleRequest({
      ip: "1.2.3.4",
      method: "POST",
      path: "/api/ai/proxy",
      query: {},
      body: JSON.stringify({
        messages: [{ role: "user", content: "How do I connect to http://127.0.0.1:11434?" }],
      }),
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(chatMsgRes.blocked).toBe(false);
    expect(chatMsgRes.eventType).toBe("allowed");

    // But query parameter containing SQLi should still be caught!
    const sqliQueryRes = await client.handleRequest({
      ip: "1.2.3.4",
      method: "POST",
      path: "/api/ai/proxy",
      query: { q: "UNION SELECT password FROM admin" },
      body: "clean body",
      headers: {},
      userAgent: "Mozilla/5.0",
    });

    expect(sqliQueryRes.blocked).toBe(true);
    expect(sqliQueryRes.eventType).toBe("sql_injection");
  });

  it("should respect skipBodyScan boolean in IncomingRequest", async () => {
    const client = new DefenderClient({
      apiKey: "test-key",
      offlineMode: true,
    });
    (client as any).appConfig = (client as any).normalizeConfig(mockAppConfig);

    const res = await client.handleRequest({
      ip: "1.2.3.4",
      method: "POST",
      path: "/custom-endpoint",
      query: {},
      body: "cat /etc/passwd; rm -rf /",
      headers: {},
      userAgent: "Mozilla/5.0",
      skipBodyScan: true,
    });

    expect(res.blocked).toBe(false);
    expect(res.eventType).toBe("allowed");
  });
});
