import { describe, it, expect } from "vitest";
import {
  normalizeSafetyText,
  scanTextLocally,
  scanText,
  scanImage,
  calculateSimpleImageHash,
  CSAM_TEST_CANARY,
} from "./csamGuard.ts";

describe("CSAM Safety Guard - Text Scanner", () => {
  it("normalizes leetspeak, homoglyphs, and punctuation separators", () => {
    const input = "t_3_s_t! s.t.r.1.n.g";
    const normalized = normalizeSafetyText(input);
    expect(normalized.includes("test string") || normalized.includes("teststring")).toBe(true);
  });

  it("passes completely benign prompts without false positives", async () => {
    const benignPrompts = [
      "A young boy riding a bicycle in a sunny park with his dog",
      "Schoolgirl studying in a library with books on the table, anime style",
      "Portrait of a toddler laughing, oil painting",
      "A beautiful landscape with mountains, rivers, and a forest at sunset",
      "Cyberpunk street with neon signs and flying cars",
      "A photograph of a kitten sleeping on a soft pillow",
    ];

    for (const prompt of benignPrompts) {
      const result = await scanText(prompt);
      expect(result.safe).toBe(true);
      expect(result.severity).toBe(0);
    }
  });

  it("blocks overt illicit minor-safety prompts using test canary string", async () => {
    const result = await scanText(CSAM_TEST_CANARY);
    expect(result.safe).toBe(false);
    expect(result.severity).toBeGreaterThanOrEqual(2);
    expect(result.category).toBe("CSAM/CSAE");
  });

  it("flags test canary attempts embedded within prompt text", async () => {
    const embedded = `generate art containing ${CSAM_TEST_CANARY} sample`;
    const result = await scanText(embedded);
    expect(result.safe).toBe(false);
    expect(result.severity).toBe(3);
  });
});

describe("CSAM Safety Guard - Image Scanner & Hashing", () => {
  it("calculates consistent sha256 hash for buffer", () => {
    const testBuf = Buffer.from("test-image-content");
    const hash = calculateSimpleImageHash(testBuf);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });

  it("identifies valid PNG magic bytes as safe when no violations present", async () => {
    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const result = await scanImage(pngHeader, "image/png");
    expect(result.safe).toBe(true);
    expect(result.severity).toBe(0);
  });

  it("flags corrupted / spoofed image data with mismatching magic bytes", async () => {
    const fakeImage = Buffer.from("this is just raw random text, not an image");
    const result = await scanImage(fakeImage, "image/png");
    expect(result.safe).toBe(false);
    expect(result.severity).toBe(1);
    expect(result.category).toBe("invalid_format");
  });
});
