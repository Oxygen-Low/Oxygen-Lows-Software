import { describe, it, expect } from "vitest";
import { resolveCustomProviderUrl } from "./safeAiUrl";

describe("resolveCustomProviderUrl", () => {
  it("should throw an error for path traversal with /../", async () => {
    const invalidUrl = "https://example.com/api/v1/../v2/chat";
    await expect(resolveCustomProviderUrl(invalidUrl)).rejects.toThrow(
      "Invalid path",
    );
  });

  it("should throw an error for path traversal with URL encoded /%2e%2e/", async () => {
    const invalidUrl = "https://example.com/api/v1/%2e%2e/v2/chat";
    await expect(resolveCustomProviderUrl(invalidUrl)).rejects.toThrow(
      "Invalid path",
    );
  });

  it("should throw an error for path traversal with capitalized URL encoded /%2E%2E/", async () => {
    const invalidUrl = "https://example.com/api/v1/%2E%2E/v2/chat";
    await expect(resolveCustomProviderUrl(invalidUrl)).rejects.toThrow(
      "Invalid path",
    );
  });
});
