import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../lib/auth.ts", async original => ({ ...(await original<any>()), resolveUserFromToken: vi.fn(async () => ({ id: "42", role: "user" })) }));
vi.mock("../lib/storage.ts", async original => ({ ...(await original<any>()), serverStorage: { download: vi.fn(async () => ({ data: Buffer.from('<svg onload="alert(1)"/>'), error: null })), list: vi.fn(async () => ({ data: [], error: null })), createSignedUrl: vi.fn() } }));
import { storageRouter } from "./storage";
import app from "../index.ts";
import { serverStorage } from "../lib/storage.ts";
const auth = { Authorization: "Bearer fixture" };
beforeEach(() => vi.clearAllMocks());
describe("storage boundaries", () => {
  it("never exposes private buckets through public URLs", async () => {
    expect((await storageRouter.request("/public/Storage/42/secret.txt")).status).toBe(404);
    expect(serverStorage.download).not.toHaveBeenCalled();
  });
  it("blocks authenticated cross-user downloads", async () => {
    expect((await storageRouter.request("/download/Storage/43/secret.txt", { headers: auth })).status).toBe(403);
    expect(serverStorage.download).not.toHaveBeenCalled();
  });
  it("blocks cross-user listing and signed URLs", async () => {
    const post = (url: string, body: any) => storageRouter.request(url, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await post("/list/Storage", { path: "43" })).status).toBe(403);
    const response = await post("/signed-urls/Storage", { paths: ["43/secret.txt"] });
    expect((await response.json()).data[0].signedUrl).toBeNull();
    expect(serverStorage.createSignedUrl).not.toHaveBeenCalled();
  });
  it("serves own files and public assets in a sandbox", async () => {
    for (const [url, headers] of [["/download/Storage/42/image.svg", auth], ["/public/public-assets/43/image.svg", {}]] as const) {
      const response = await storageRouter.request(url, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toContain("sandbox;");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const integrated = await app.request(`/api/storage${url}`, { headers });
      expect(integrated.headers.get("content-security-policy")).toContain("sandbox;");
    }
  });
});
