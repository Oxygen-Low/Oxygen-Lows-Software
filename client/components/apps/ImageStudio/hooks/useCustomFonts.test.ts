// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCustomFonts } from "./useCustomFonts";

describe("useCustomFonts hook", () => {
  const originalFonts = document.fonts;
  const originalFontFace = global.FontFace;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(document, "fonts", {
      value: originalFonts,
      configurable: true,
      writable: true,
    });
    global.FontFace = originalFontFace;
  });

  it("successfully loads custom font when document.fonts.values() is non-iterable or fails", async () => {
    const fontsInSet: any[] = [];
    const mockFonts: any = {
      // document.fonts.values() returns an object without Symbol.iterator (reproducing the WebKit bug)
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
});
