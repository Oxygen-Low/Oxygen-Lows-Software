import { describe, it, expect } from "vitest";
import { vpnRouter } from "./vpn";

describe("VPN Router Endpoints", () => {
  it("rejects private/loopback IP for ping", async () => {
    const req = new Request("http://localhost/ping?host=127.0.0.1");
    const res = await vpnRouter.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Private or loopback");
  });

  it("rejects private/loopback IP for geocode", async () => {
    const req = new Request("http://localhost/geocode?ip=192.168.1.1");
    const res = await vpnRouter.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Private or loopback");
  });

  it("rejects localhost hostname for geocode", async () => {
    const req = new Request("http://localhost/geocode?ip=localhost");
    const res = await vpnRouter.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Private or loopback");
  });

  it("rejects invalid characters in host/IP", async () => {
    const req = new Request("http://localhost/geocode?ip=invalid%20host;rm%20-rf");
    const res = await vpnRouter.fetch(req);
    expect(res.status).toBe(400);
  });
});
