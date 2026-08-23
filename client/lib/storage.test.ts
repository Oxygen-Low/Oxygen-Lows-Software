/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CustomStorageClient, storage, customStorage } from "./storage";

const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: "test-token" } },
});

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

describe("Client Storage Library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports singleton instance as storage and customStorage", () => {
    expect(storage).toBeInstanceOf(CustomStorageClient);
    expect(customStorage).toBe(storage);
  });

  describe("upload", () => {
    it("sends multipart form data to upload endpoint with auth token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ data: { path: "u1/test.txt" }, error: null }),
      });
      global.fetch = mockFetch;

      const file = new Blob(["content"], { type: "text/plain" });
      const client = new CustomStorageClient();
      const res = await client.from("Storage").upload("u1/test.txt", file);

      expect(res.error).toBeNull();
      expect(res.data?.path).toBe("u1/test.txt");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/storage/upload/Storage/u1/test.txt",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-token" },
        }),
      );
    });
  });

  describe("list", () => {
    it("posts to list endpoint and returns items", async () => {
      const mockItems = [
        { id: "1", name: "test.mp3", metadata: { size: 1024, mimetype: "audio/mp3" }, created_at: "", updated_at: "" },
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ data: mockItems, error: null }),
      });
      global.fetch = mockFetch;

      const client = new CustomStorageClient();
      const res = await client.from("Storage").list("u1");

      expect(res.error).toBeNull();
      expect(res.data).toEqual(mockItems);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/storage/list/Storage",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
          body: JSON.stringify({ path: "u1" }),
        }),
      );
    });
  });

  describe("remove", () => {
    it("calls delete on remove endpoint", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ data: ["u1/file.txt"], error: null }),
      });
      global.fetch = mockFetch;

      const client = new CustomStorageClient();
      const res = await client.from("Storage").remove(["u1/file.txt"]);

      expect(res.error).toBeNull();
      expect(res.data).toEqual(["u1/file.txt"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/storage/remove/Storage",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ paths: ["u1/file.txt"] }),
        }),
      );
    });
  });

  describe("getPublicUrl and createSignedUrl", () => {
    it("constructs public URL correctly", () => {
      const client = new CustomStorageClient();
      const res = client.from("public-assets").getPublicUrl("image.png");
      expect(res.data.publicUrl).toBe("/api/storage/public/public-assets/image.png");
    });

    it("creates signed URL by requesting signed-urls endpoint", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ signedUrl: "/api/storage/download/Storage/u1/file.txt?token=test-token" }],
            error: null,
          }),
      });
      global.fetch = mockFetch;

      const client = new CustomStorageClient();
      const res = await client.from("Storage").createSignedUrl("u1/file.txt", 3600);

      expect(res.error).toBeNull();
      expect(res.data?.signedUrl).toBe("/api/storage/download/Storage/u1/file.txt?token=test-token");
    });
  });
});
