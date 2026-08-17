import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ThreatActorDetector } from "../../../packages/webdefender/src/threatActors";
import { DefenderClient } from "../../../packages/webdefender/src/webdefender";

describe("ThreatActorDetector", () => {
  let detector: ThreatActorDetector;

  beforeEach(() => {
    detector = new ThreatActorDetector();
  });

  afterEach(() => {
    detector.destroy();
  });

  it("identifies threat actors added to specific categories", () => {
    detector.addThreatIp("bruteforce", "198.51.100.1");
    detector.addThreatIp("http_dos", "198.51.100.2");
    detector.addThreatIp("http_exploit", "198.51.100.3");
    detector.addThreatIp("botnet", "198.51.100.4");

    expect(detector.checkThreatActor("198.51.100.1")).toEqual({ category: "bruteforce", feed: "bruteforce" });
    expect(detector.checkThreatActor("198.51.100.2")).toEqual({ category: "http_dos", feed: "http_dos" });
    expect(detector.checkThreatActor("198.51.100.3")).toEqual({ category: "http_exploit", feed: "http_exploit" });
    expect(detector.checkThreatActor("198.51.100.4")).toEqual({ category: "botnet", feed: "botnet" });
    expect(detector.checkThreatActor("8.8.8.8")).toBeNull();
  });

  it("handles null, empty, or whitespace IP gracefully", () => {
    expect(detector.checkThreatActor("")).toBeNull();
    expect(detector.checkThreatActor("   ")).toBeNull();
  });
});

describe("DefenderClient Threat Actor blocking", () => {
  it("blocks requests from known threat actors when category is enabled", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    // Access detector and add test threat IPs
    const detector = (client as any).threatActorDetector as ThreatActorDetector;
    detector.addThreatIp("bruteforce", "203.0.113.10");
    detector.addThreatIp("http_dos", "203.0.113.20");
    detector.addThreatIp("http_exploit", "203.0.113.30");
    detector.addThreatIp("botnet", "203.0.113.40");

    const req1 = await client.handleRequest({
      ip: "203.0.113.10",
      method: "POST",
      path: "/api/login",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req1.blocked).toBe(true);
    expect(req1.eventType).toBe("threat_bruteforce");
    expect(req1.reason).toContain("Bruteforce attacker");

    const req2 = await client.handleRequest({
      ip: "203.0.113.20",
      method: "GET",
      path: "/",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req2.blocked).toBe(true);
    expect(req2.eventType).toBe("threat_dos");
    expect(req2.reason).toContain("HTTP DoS attacker");

    const req3 = await client.handleRequest({
      ip: "203.0.113.30",
      method: "GET",
      path: "/index.php",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req3.blocked).toBe(true);
    expect(req3.eventType).toBe("threat_exploit");
    expect(req3.reason).toContain("HTTP Exploit attacker");

    const req4 = await client.handleRequest({
      ip: "203.0.113.40",
      method: "GET",
      path: "/data",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req4.blocked).toBe(true);
    expect(req4.eventType).toBe("threat_botnet");
    expect(req4.reason).toContain("Botnet Actor");

    client.destroy();
  });

  it("allows requests from known threat actors when category is toggled off", async () => {
    const client = new DefenderClient({ apiKey: "", offlineMode: true });
    await client.init();

    // Disable bruteforce blocking in config
    (client as any).appConfig.blockBruteforce = false;

    const detector = (client as any).threatActorDetector as ThreatActorDetector;
    detector.addThreatIp("bruteforce", "203.0.113.10");

    const req = await client.handleRequest({
      ip: "203.0.113.10",
      method: "POST",
      path: "/api/login",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0"
    });
    expect(req.blocked).toBe(false);

    client.destroy();
  });
});
