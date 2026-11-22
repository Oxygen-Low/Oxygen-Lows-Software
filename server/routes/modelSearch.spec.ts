import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { modelSearchRouter } from "./modelSearch";

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async (token: string) =>
    token === "valid-token"
      ? { id: "user-123", email: "test@example.com", username: "test", role: "user" }
      : null,
  ),
}));

describe("Model Search Route", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("huggingface.co")) {
        return new Response(
          JSON.stringify([
            {
              id: "TheBloke/Llama-2-7B-GGUF",
              siblings: [{ rfilename: "llama-2-7b.Q4_K_M.gguf" }],
              downloads: 1000,
              likes: 20,
              description: "A GGUF model",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("modelscope.cn")) {
        return new Response(
          JSON.stringify({ Data: { Models: [{ ModelId: "qwen/Qwen2.5-7B-Instruct-GGUF", Downloads: 50 }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await modelSearchRouter.fetch(
      new Request("http://localhost/search?q=llama"),
    );
    expect(res.status).toBe(401);
  });

  it("returns merged results from both hubs", async () => {
    const res = await modelSearchRouter.fetch(
      new Request("http://localhost/search?q=llama&type=gguf", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.some((r: any) => r.source === "huggingface")).toBe(true);
    expect(data.results.some((r: any) => r.source === "modelscope")).toBe(true);
  });

  it("never fetches a user-supplied URL (SSRF hardening)", async () => {
    const res = await modelSearchRouter.fetch(
      new Request(
        "http://localhost/search?q=test&url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data",
        { headers: { Authorization: "Bearer valid-token" } },
      ),
    );
    expect(res.status).toBe(200);
    for (const call of (globalThis.fetch as any).mock.calls) {
      const url = String(call[0]);
      expect(
        url.startsWith("https://huggingface.co/api/models") ||
          url.startsWith("https://modelscope.cn/api/v1/models"),
      ).toBe(true);
      expect(url).not.toContain("169.254.169.254");
    }
  });

  it("returns an empty list for an empty query without calling upstreams", async () => {
    const res = await modelSearchRouter.fetch(
      new Request("http://localhost/search?q=", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.results).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
