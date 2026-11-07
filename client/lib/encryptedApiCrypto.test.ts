import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAes256Key, setCategoryEncryptionEnabled } from "./crypto";
import {
  clearCategoryDataKeyCache,
  encryptCategoryField,
  migrateCategoryToDataKey,
} from "./encryptedApiCrypto";

describe("encrypted API category fields", () => {
  beforeEach(() => {
    clearCategoryDataKeyCache();
    setCategoryEncryptionEnabled("data_save", false);
  });

  it("does not encrypt fields for a disabled category", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      encryptCategoryField("plain text", generateAes256Key(), "data_save"),
    ).resolves.toBe("plain text");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("does not migrate fields for a disabled category", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      migrateCategoryToDataKey("data_save", generateAes256Key(), "user-1"),
    ).resolves.toEqual({ updatedCount: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
