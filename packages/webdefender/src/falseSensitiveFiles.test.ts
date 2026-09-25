import { describe, expect, it } from "vitest";
import { DefenderClient } from "./webdefender.js";
import { createExpressMiddleware } from "./middleware.js";
import { createDefender as createHonoDefender } from "./hono.js";
import { createNextDefender } from "./next.js";
import { createCloudflareDefender } from "./cloudflare.js";

describe("False Sensitive Files (Decoy Honeypots)", () => {
  const baseConfig = {
    blockModeEnabled: true,
    blockSensitivePaths: true,
    autoBlockSensitivePaths: true,
    sensitivePathThreshold: 3,
    sensitivePathWindowSeconds: 20,
    sensitivePathBanDurationSeconds: 600,
    falseSensitiveFiles: true,
    blockAdminBannedIps: false,
    adminBannedIps: [],
    blockIps: ["198.51.100.99"],
    blockCountries: [],
    routes: [],
  };

  it("returns realistic false credentials and HTTP 200 for sensitive file requests", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = { ...baseConfig };

    // 1. .env probe
    const envRes = await client.handleRequest({
      ip: "192.0.2.1",
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(envRes.blocked).toBe(false);
    expect(envRes.isDecoy).toBe(true);
    expect(envRes.statusCode).toBe(200);
    expect(envRes.eventType).toBe("sensitive_path");
    expect(envRes.decoyContentType).toContain("text/plain");
    expect(envRes.decoyContent).toContain("DATABASE_URL=");
    expect(envRes.decoyContent).toContain("AWS_SECRET_ACCESS_KEY=");
    expect(envRes.decoyContent).toContain("STRIPE_SECRET_KEY=");
    expect(envRes.decoyContent).not.toContain("EXAMPLE");
    expect(envRes.decoyContent).not.toContain("Fake");

    // 2. SSH key probe
    const sshRes = await client.handleRequest({
      ip: "192.0.2.1",
      method: "GET",
      path: "/.ssh/id_rsa",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(sshRes.blocked).toBe(false);
    expect(sshRes.isDecoy).toBe(true);
    expect(sshRes.statusCode).toBe(200);
    expect(sshRes.decoyContent).toContain("BEGIN OPENSSH PRIVATE KEY");

    // 3. AWS credentials probe
    const awsRes = await client.handleRequest({
      ip: "192.0.2.1",
      method: "GET",
      path: "/.aws/credentials",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(awsRes.blocked).toBe(false);
    expect(awsRes.isDecoy).toBe(true);
    expect(awsRes.decoyContent).toContain("aws_access_key_id");

    // 4. WordPress config probe
    const wpRes = await client.handleRequest({
      ip: "192.0.2.1",
      method: "GET",
      path: "/wp-config.php",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(wpRes.blocked).toBe(false);
    expect(wpRes.isDecoy).toBe(true);
    expect(wpRes.decoyContent).toContain("DB_PASSWORD");
    expect(wpRes.decoyContentType).toContain("php");

    client.destroy();
  });

  it("serves false credentials to blocked IPs on sensitive paths, but denies access to non-sensitive paths", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = { ...baseConfig, blockIps: ["198.51.100.99"] };

    const blockedIp = "198.51.100.99";

    // 1. Blocked IP requests a sensitive path (.env) -> Receives false credentials!
    const sensitiveRes = await client.handleRequest({
      ip: blockedIp,
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "scanner/1.0",
    });

    expect(sensitiveRes.blocked).toBe(false);
    expect(sensitiveRes.isDecoy).toBe(true);
    expect(sensitiveRes.statusCode).toBe(200);
    expect(sensitiveRes.decoyContent).toContain("DATABASE_URL=");

    // 2. Blocked IP requests a non-sensitive path (/api/profile) -> Blocked with IP block!
    const regularRes = await client.handleRequest({
      ip: blockedIp,
      method: "GET",
      path: "/api/profile",
      query: {},
      body: "",
      headers: {},
      userAgent: "scanner/1.0",
    });

    expect(regularRes.blocked).toBe(true);
    expect(regularRes.eventType).toBe("ip_block");
    expect(regularRes.reason).toContain("IP blocked: 198.51.100.99");

    client.destroy();
  });

  it("returns standard 403 blocked when falseSensitiveFiles is toggled off", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    (client as any).appConfig = {
      ...baseConfig,
      falseSensitiveFiles: false,
    };

    const res = await client.handleRequest({
      ip: "192.0.2.5",
      method: "GET",
      path: "/.env",
      query: {},
      body: "",
      headers: {},
      userAgent: "curl/7.68.0",
    });

    expect(res.blocked).toBe(true);
    expect(res.isDecoy).toBeUndefined();
    expect(res.eventType).toBe("sensitive_path");
    expect(res.reason).toContain("Sensitive path probe detected");

    client.destroy();
  });

  it("works seamlessly across Express, Hono, Next.js, and Cloudflare adapters", async () => {
    // 1. Express Middleware
    const expressClient = new DefenderClient({ apiKey: "", offlineMode: true });
    (expressClient as any).appConfig = { ...baseConfig };
    const expressMiddleware = createExpressMiddleware(expressClient);

    let expressStatus = 0;
    let expressBody: any = null;
    const expressHeaders: Record<string, string> = {};
    const mockExpressReq = {
      path: "/.env",
      method: "GET",
      headers: { "x-forwarded-for": "192.0.2.10" },
      query: {},
      body: "",
    };
    const mockExpressRes = {
      setHeader: (k: string, v: string) => {
        expressHeaders[k] = v;
      },
      status: (code: number) => {
        expressStatus = code;
        return {
          send: (body: any) => {
            expressBody = body;
          },
        };
      },
    };

    let expressNextCalled = false;
    await expressMiddleware(mockExpressReq, mockExpressRes, () => {
      expressNextCalled = true;
    });

    expect(expressNextCalled).toBe(false);
    expect(expressStatus).toBe(200);
    expect(expressHeaders["Content-Type"]).toContain("text/plain");
    expect(expressBody).toContain("DATABASE_URL=");

    // 2. Cloudflare Worker Adapter
    const cfDefender = createCloudflareDefender({
      apiKey: "test",
      offlineMode: true,
      falseSensitiveFiles: true,
    });
    (cfDefender.client as any).appConfig = { ...baseConfig };

    const mockCfReq = new Request("https://example.com/.env", {
      headers: { "cf-connecting-ip": "192.0.2.20" },
    });
    const cfResponse = await cfDefender.protect(mockCfReq);

    expect(cfResponse).not.toBeNull();
    expect(cfResponse?.status).toBe(200);
    const cfBody = await cfResponse?.text();
    expect(cfBody).toContain("DATABASE_URL=");

    expressClient.destroy();
    cfDefender.client.destroy();
  });
});
