// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCustomFonts, extractStoragePath } from "./useCustomFonts";
import { storage } from "@/lib/storage";

vi.mock("@/lib/storage", () => {
  const mockCreateSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "/api/storage/download/Storage/1/image-studio/fonts/1788694627056_norwester.otf?token=valid-token" },
    error: null,
  });
  const mockDownload = vi.fn().mockResolvedValue({
    data: {
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    },
    error: null,
  });
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: mockCreateSignedUrl,
        download: mockDownload,
      }),
    },
  };
});

describe("useCustomFonts hook", () => {
  const originalFonts = document.fonts;
  const originalFontFace = global.FontFace;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(document, "fonts", {
      value: originalFonts,
      configurable: true,
      writable: true,
    });
    global.FontFace = originalFontFace;
  });

  describe("extractStoragePath", () => {
    it("returns explicit storagePath when provided", () => {
      expect(extractStoragePath("https://oxygenlow.com/some/url", "1/fonts/norwester.otf")).toBe("1/fonts/norwester.otf");
    });

    it("extracts storagePath from public Storage URLs", () => {
      expect(
        extractStoragePath("https://oxygenlow.com/api/storage/public/Storage/1/image-studio/fonts/1788694627056_norwester.otf")
      ).toBe("1/image-studio/fonts/1788694627056_norwester.otf");
    });

    it("extracts storagePath from download Storage URLs with token query", () => {
      expect(
        extractStoragePath("/api/storage/download/Storage/1/image-studio/fonts/test.otf?token=secret123")
      ).toBe("1/image-studio/fonts/test.otf");
    });
  });

  it("successfully loads custom font when document.fonts.values() is non-iterable or fails", async () => {
    const fontsInSet: any[] = [];
    const mockFonts: any = {
      values: () => ({}),
      forEach: (cb: any) => {
        fontsInSet.forEach(cb);
      },
      add: vi.fn((fontFace: any) => {
        fontsInSet.push(fontFace);
      }),
    };

    Object.defineProperty(document, "fonts", {
      value: mockFonts,
      configurable: true,
      writable: true,
    });

    const mockLoad = vi.fn().mockResolvedValue({ family: "norwester" });
    const MockFontFace = vi.fn().mockImplementation(function (name: string, url: string) {
      return {
        family: name,
        load: mockLoad,
      };
    });
    global.FontFace = MockFontFace as any;

    const { result } = renderHook(() => useCustomFonts());

    let registeredName = "";
    await act(async () => {
      registeredName = await result.current.addCustomFont("norwester", "blob:http://test/norwester.otf");
    });

    expect(registeredName).toBe("norwester");
    expect(MockFontFace).toHaveBeenCalledWith("norwester", "url(blob:http://test/norwester.otf)");
    expect(mockLoad).toHaveBeenCalled();
    expect(mockFonts.add).toHaveBeenCalled();
    expect(result.current.customFonts).toHaveLength(1);
    expect(result.current.customFonts[0].name).toBe("norwester");
  });

  it("does not re-register a font if it is already in document.fonts", async () => {
    const mockFonts: any = {
      values: () => {
        throw new TypeError("document.fonts.values() is not iterable");
      },
      forEach: (cb: any) => {
        cb({ family: '"norwester"' });
      },
      add: vi.fn(),
    };

    Object.defineProperty(document, "fonts", {
      value: mockFonts,
      configurable: true,
      writable: true,
    });

    const MockFontFace = vi.fn();
    global.FontFace = MockFontFace as any;

    const { result } = renderHook(() => useCustomFonts());

    await act(async () => {
      await result.current.loadFontFace({
        name: "norwester",
        url: "blob:http://test/norwester.otf",
        format: "truetype",
      });
    });

    expect(MockFontFace).not.toHaveBeenCalled();
    expect(mockFonts.add).not.toHaveBeenCalled();
  });

  it("auto-heals broken /api/storage/public/Storage font URLs by creating signed URLs", async () => {
    const fontsInSet: any[] = [];
    const mockFonts: any = {
      forEach: (cb: any) => fontsInSet.forEach(cb),
      add: vi.fn((f) => fontsInSet.push(f)),
    };
    Object.defineProperty(document, "fonts", {
      value: mockFonts,
      configurable: true,
      writable: true,
    });

    const mockLoad = vi.fn().mockResolvedValue({ family: "1788694627056_norwester" });
    const MockFontFace = vi.fn().mockImplementation(function (name: string, url: string) {
      return {
        family: name,
        load: mockLoad,
      };
    });
    global.FontFace = MockFontFace as any;

    const brokenUrl = "https://oxygenlow.com/api/storage/public/Storage/1/image-studio/fonts/1788694627056_norwester.otf";
    localStorage.setItem(
      "image_studio_custom_fonts",
      JSON.stringify([
        {
          name: "1788694627056_norwester",
          url: brokenUrl,
          storagePath: "1/image-studio/fonts/1788694627056_norwester.otf",
          format: "opentype",
        },
      ])
    );

    const { result } = renderHook(() => useCustomFonts());

    await act(async () => {
      await result.current.loadFontFace({
        name: "1788694627056_norwester",
        url: brokenUrl,
        storagePath: "1/image-studio/fonts/1788694627056_norwester.otf",
        format: "opentype",
      });
    });

    expect(storage.from).toHaveBeenCalledWith("Storage");
    expect(MockFontFace).toHaveBeenCalledWith(
      "1788694627056_norwester",
      "url(/api/storage/download/Storage/1/image-studio/fonts/1788694627056_norwester.otf?token=valid-token)"
    );
    expect(mockLoad).toHaveBeenCalled();
    expect(mockFonts.add).toHaveBeenCalled();
  });

  it("falls back to downloading binary buffer if fontFace.load() rejects", async () => {
    const fontsInSet: any[] = [];
    const mockFonts: any = {
      forEach: (cb: any) => fontsInSet.forEach(cb),
      add: vi.fn((f) => fontsInSet.push(f)),
    };
    Object.defineProperty(document, "fonts", {
      value: mockFonts,
      configurable: true,
      writable: true,
    });

    let fontFaceCallCount = 0;
    const MockFontFace = vi.fn().mockImplementation(function (name: string, source: any) {
      fontFaceCallCount++;
      if (typeof source === "string") {
        return {
          family: name,
          load: vi.fn().mockRejectedValue(new Error("Network error")),
        };
      }
      return {
        family: name,
        load: vi.fn().mockResolvedValue({ family: name }),
      };
    });
    global.FontFace = MockFontFace as any;

    const { result } = renderHook(() => useCustomFonts());

    await act(async () => {
      const ok = await result.current.loadFontFace({
        name: "fallback_font",
        url: "/api/storage/download/Storage/1/image-studio/fonts/fallback.otf",
        storagePath: "1/image-studio/fonts/fallback.otf",
        format: "opentype",
      });
      expect(ok).toBe(true);
    });

    // Called once with url(...), and once with buffer
    expect(fontFaceCallCount).toBe(2);
    expect(storage.from("Storage").download).toHaveBeenCalledWith("1/image-studio/fonts/fallback.otf");
    expect(mockFonts.add).toHaveBeenCalled();
  });
});
