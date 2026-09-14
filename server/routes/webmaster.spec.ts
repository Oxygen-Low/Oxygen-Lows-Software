import { describe, it, expect } from "vitest";
import { webmasterRouter } from "./webmaster";
import { parseSitemap } from "../lib/oxylowCrawler";

describe("Webmaster Router", () => {
  it("rejects unauthorized access to sites", async () => {
    const req = new Request("http://localhost/sites");
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(401);
  });

  it("rejects unauthorized access to stats", async () => {
    const req = new Request("http://localhost/stats");
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(401);
  });

  it("rejects site submission without token", async () => {
    const req = new Request("http://localhost/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    const res = await webmasterRouter.fetch(req);
    expect(res.status).toBe(401);
  });
});
