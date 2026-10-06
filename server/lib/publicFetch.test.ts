import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicUrl, publicLookup } from "./publicFetch";
import { isPrivateIP, assertPublicHostname } from "./safeAiUrl";

vi.mock("node:dns", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns";
afterEach(() => vi.unstubAllGlobals());

describe("public HTTP boundary", () => {
  it.each(["::1", "0:0:0:0:0:0:0:1", "::ffff:7f00:1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "fd00::1", "fe80::1", "ff02::1", "127.0.0.1", "169.254.169.254"])("rejects private address %s", (address) => {
    expect(isPrivateIP(address)).toBe(true);
    expect(() => assertPublicHostname(address.includes(":") ? `[${address}]` : address)).toThrow();
  });
  it("accepts global unicast", () => {
    expect(isPrivateIP("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIP("8.8.8.8")).toBe(false);
  });
  it("resolves a public address when options are omitted", () => {
    vi.mocked(lookup).mockImplementation(((_host: any, _options: any, cb: any) => cb(null, [{ address: "8.8.8.8", family: 4 }])) as any);
    const callback = vi.fn();

    publicLookup("example.com", callback);

    expect(callback).toHaveBeenCalledExactlyOnceWith(null, "8.8.8.8", 4);
  });
  it("forwards DNS errors when options are omitted", () => {
    const error = new Error("DNS lookup failed");
    vi.mocked(lookup).mockImplementation(((_host: any, _options: any, cb: any) => cb(error)) as any);
    const callback = vi.fn();

    publicLookup("example.com", callback);

    expect(callback).toHaveBeenCalledExactlyOnceWith(error);
  });
  it.each([
    { name: "empty answers", addresses: [] },
    { name: "mixed public and private answers", addresses: [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }] },
  ])("rejects $name when options are omitted", ({ addresses }) => {
    vi.mocked(lookup).mockImplementation(((_host: any, _options: any, cb: any) => cb(null, addresses)) as any);
    const callback = vi.fn();

    publicLookup("example.com", callback);

    expect(callback).toHaveBeenCalledExactlyOnceWith(new Error("Public origin required"));
  });
  it("preserves family filtering and all-address results with explicit options", () => {
    const ipv6 = { address: "2606:4700:4700::1111", family: 6 };
    vi.mocked(lookup).mockImplementation(((_host: any, _options: any, cb: any) => cb(null, [{ address: "8.8.8.8", family: 4 }, ipv6])) as any);
    const callback = vi.fn();

    publicLookup("example.com", { family: 6, all: true }, callback);

    expect(callback).toHaveBeenCalledExactlyOnceWith(null, [ipv6]);
  });
  it("checks actual connection DNS answers, including mixed answers", async () => {
    vi.mocked(lookup).mockImplementation(((_host: any, _options: any, cb: any) => cb(null, [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }])) as any);
    await new Promise<void>((resolve) => {
      publicLookup("rebind.example", {}, (error) => { expect(error?.message).toBe("Public origin required"); resolve(); });
    });
  });
  it("blocks redirected private destinations before making another request", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPublicUrl("https://example.com")).rejects.toThrow("Public origin required");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].redirect).toBe("manual");
  });
  it("rejects oversized response bodies and non-HTTP URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oversized")));
    await expect(fetchPublicUrl("https://example.com", {}, 4)).rejects.toThrow("too large");
    await expect(fetchPublicUrl("file:///etc/passwd")).rejects.toThrow("Invalid public URL");
  });
  it("preserves normal public responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { headers: { "content-type": "text/plain" } })));
    expect(await (await fetchPublicUrl("https://example.com")).text()).toBe("ok");
  });
});
