import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveCustomProviderUrl } from "./safeAiUrl";
import * as dns from "dns/promises";

vi.mock("dns/promises", () => ({
  lookup: vi.fn(),
}));

describe("resolveCustomProviderUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects path traversal", async () => {
    await expect(resolveCustomProviderUrl("https://example.com/../foo")).rejects.toThrow("Invalid path");
    await expect(resolveCustomProviderUrl("https://example.com/%2e%2e/foo")).rejects.toThrow("Invalid path");
    await expect(resolveCustomProviderUrl("https://example.com/%2E%2E/foo")).rejects.toThrow("Invalid path");
  });

  it("rejects invalid URL", async () => {
    await expect(resolveCustomProviderUrl("not a url")).rejects.toThrow("Invalid URL");
  });

  it("rejects credentials", async () => {
    await expect(resolveCustomProviderUrl("https://user:pass@example.com")).rejects.toThrow("Credentials in URL are not allowed");
  });

  it("rejects private hostnames before dns lookup", async () => {
    await expect(resolveCustomProviderUrl("https://localhost")).rejects.toThrow("Public origin required");
    await expect(resolveCustomProviderUrl("https://127.0.0.1")).rejects.toThrow("Public origin required");
  });

  it("rejects if dns resolves only to private IPs", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "192.168.1.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ] as any);
    await expect(resolveCustomProviderUrl("https://my-internal-service.com")).rejects.toThrow("Public origin required");
  });

  it("resolves and pins IPv4 address, and appends /chat/completions", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "192.168.1.1", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ] as any);

    const result = await resolveCustomProviderUrl("https://api.example.com/v1");
    expect(result).toBe("https://93.184.216.34/v1/chat/completions");
  });

  it("resolves and pins IPv6 address", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ] as any);

    const result = await resolveCustomProviderUrl("https://api.example.com/v1");
    expect(result).toBe("https://[2606:2800:220:1:248:1893:25c8:1946]/v1/chat/completions");
  });

  it("does not append /chat/completions if already present", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as any);

    const result = await resolveCustomProviderUrl("https://api.example.com/v1/chat/completions");
    expect(result).toBe("https://93.184.216.34/v1/chat/completions");
  });
});
