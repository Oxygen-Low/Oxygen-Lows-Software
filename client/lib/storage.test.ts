/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CustomStorageClient, storage, customStorage } from "./storage";

vi.mock("./localSession", () => ({
  getLocalSession: () => ({
    access_token: "test-token",
    token_type: "bearer",
    user: { id: "test-user-id", email: "test@example.com", username: "testuser" },
  }),
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
        json: () =>
          Promise.resolve({ data: { path: "u1/test.txt" }, error: null }),
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

    it("handles binary ArrayBuffer / Uint8Array uploads", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({ data: { path: "u1/archive.zip" }, error: null }),
      });
      global.fetch = mockFetch;

      const binaryData = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
      const client = new CustomStorageClient();
      const res = await client
        .from("Storage")
        .upload("u1/archive.zip", binaryData.buffer);

      expect(res.error).toBeNull();
      expect(res.data?.path).toBe("u1/archive.zip");
    });

    it("gracefully handles HTML error responses without throwing JSON parse error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: () =>
          Promise.reject(
            new SyntaxError("Unexpected token '<', \"<html> <h\"... is not valid JSON"),
          ),
        text: () =>
          Promise.resolve(
            "<html> <head><title>500 Internal Server Error</title></head><body><h1>Internal Server Error</h1></body></html>",
          ),
      });
      global.fetch = mockFetch;

      const file = new Blob(["zip content"], { type: "application/zip" });
      const client = new CustomStorageClient();
      const res = await client.from("Storage").upload("u1/large.zip", file);

      expect(res.data).toBeNull();
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error?.message).toContain("Server error (500)");
      expect(res.error?.message).not.toContain("Unexpected token '<'");
    });

    it("handles 413 Payload Too Large error with a clear message", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 413,
        ok: false,
        json: () => Promise.reject(new Error("Not JSON")),
        text: () =>
          Promise.resolve(
            "<html><head><title>413 Request Entity Too Large</title></head><body><h1>413 Request Entity Too Large</h1></body></html>",
          ),
      });
      global.fetch = mockFetch;

      const smallFile = new Blob(["small content"], { type: "application/zip" });
      const client = new CustomStorageClient();
      const res = await client.from("Storage").upload("u1/file.zip", smallFile);

      expect(res.data).toBeNull();
      expect(res.error?.message).toContain("413 Payload Too Large");
    });

    it("automatically chunks files larger than 5MB", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({ data: { path: "u1/large.zip" }, error: null }),
      });
      global.fetch = mockFetch;

      // 6 MB blob
      const largeData = new Uint8Array(6 * 1024 * 1024);
      const largeBlob = new Blob([largeData], { type: "application/zip" });

      const client = new CustomStorageClient();
      const res = await client.from("Storage").upload("u1/large.zip", largeBlob);

      expect(res.error).toBeNull();
      expect(res.data?.path).toBe("u1/large.zip");
      // 6MB should be split into 2 chunks (4MB + 2MB)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/storage/upload-chunk/Storage/u1/large.zip",
        expect.anything(),
      );
    });

    it("handles 400 JSON errors correctly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: () =>
          Promise.resolve({
            error: "Quota exceeded. Maximum 1GB allowed per user.",
          }),
      });
      global.fetch = mockFetch;

      const file = new Blob(["content"], { type: "application/zip" });
      const client = new CustomStorageClient();
      const res = await client.from("Storage").upload("u1/large.zip", file);

      expect(res.data).toBeNull();
      expect(res.error?.message).toBe(
        "Quota exceeded. Maximum 1GB allowed per user.",
      );
    });
  });

  describe("list", () => {
    it("posts to list endpoint and returns items", async () => {
      const mockItems = [
        {
          id: "1",
          name: "test.mp3",
          metadata: { size: 1024, mimetype: "audio/mp3" },
          created_at: "",
          updated_at: "",
        },
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
      expect(res.data.publicUrl).toBe(
        "/api/storage/public/public-assets/image.png",
      );
    });

    it("creates signed URL by requesting signed-urls endpoint", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({
            data: [
              {
                signedUrl:
                  "/api/storage/download/Storage/u1/file.txt?token=test-token",
              },
            ],
            error: null,
          }),
      });
      global.fetch = mockFetch;

      const client = new CustomStorageClient();
      const res = await client
        .from("Storage")
        .createSignedUrl("u1/file.txt", 3600);

      expect(res.error).toBeNull();
      expect(res.data?.signedUrl).toBe(
        "/api/storage/download/Storage/u1/file.txt?token=test-token",
      );
    });
  });
});
