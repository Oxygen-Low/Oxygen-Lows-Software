// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { PixelArtStudioApp } from "./PixelArtStudio";
import {
  bresenhamLine,
  getRectanglePixels,
  getCirclePixels,
  floodFill,
  adjustColorLightness,
  colorSwap,
  createBlankFrame,
  createBlankLayer,
} from "./PixelArtStudio/canvasUtils";
import { createAnimatedGifBlob } from "./PixelArtStudio/gifEncoder";
import { PALETTE_PRESETS, extractPaletteFromPixels } from "./PixelArtStudio/palettePresets";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "user-123", email: "test@example.com" } },
  }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (_key: string, _opts: any, defaultText: string) => defaultText,
  }),
}));

vi.mock("@/lib/storage", () => ({
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test.png" }, error: null }),
    }),
  },
}));

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock HTMLCanvasElement & ImageData
if (typeof (global as any).ImageData === "undefined") {
  (global as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: any, width: number, height?: number) {
      if (typeof data === "number") {
        this.width = data;
        this.height = width;
        this.data = new Uint8ClampedArray(data * width * 4);
      } else {
        this.data = data;
        this.width = width;
        this.height = height || 0;
      }
    }
  };
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(32 * 32 * 4),
    }),
    putImageData: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  });
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => {
    cb(new Blob(["mock-png"], { type: "image/png" }));
  });
});

describe("PixelArtStudio Pure Algorithms", () => {
  it("computes Bresenham lines correctly", () => {
    const pts = bresenhamLine(0, 0, 3, 0);
    expect(pts).toHaveLength(4);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("computes rectangle pixels", () => {
    const pts = getRectanglePixels(0, 0, 2, 2, false);
    expect(pts.length).toBeGreaterThan(0);
    // Unfilled 3x3 rect perimeter has 8 pixels
    expect(pts).toHaveLength(8);
  });

  it("computes circle pixels", () => {
    const pts = getCirclePixels(5, 5, 2, false);
    expect(pts.length).toBeGreaterThan(0);
  });

  it("performs flood fill on connected pixels", () => {
    const pixels = ["#000000", "#000000", "#FFFFFF", "#000000"];
    const filled = floodFill(pixels, 2, 2, 0, 0, "#FF0000");
    expect(filled[0]).toBe("#FF0000");
    expect(filled[1]).toBe("#FF0000");
    expect(filled[2]).toBe("#FFFFFF");
    expect(filled[3]).toBe("#FF0000");
  });

  it("adjusts lightness up and down", () => {
    const lighter = adjustColorLightness("#333333", 20);
    expect(lighter).not.toBe("#333333");
    expect(lighter.startsWith("#")).toBe(true);

    const darker = adjustColorLightness("#AAAAAA", -20);
    expect(darker).not.toBe("#AAAAAA");
    expect(darker.startsWith("#")).toBe(true);
  });

  it("performs color swap across pixel array", () => {
    const pixels = ["#111111", "#222222", "#111111"];
    const swapped = colorSwap(pixels, "#111111", "#999999");
    expect(swapped).toEqual(["#999999", "#222222", "#999999"]);
  });

  it("extracts unique colors from pixels", () => {
    const palette = extractPaletteFromPixels([["#111111", "#222222", "#111111", ""]]);
    expect(palette).toHaveLength(2);
    expect(palette).toContain("#111111");
    expect(palette).toContain("#222222");
  });

  it("generates a valid animated GIF blob", async () => {
    const frames = [
      {
        rgba: new Uint8ClampedArray(4 * 4 * 4),
        width: 4,
        height: 4,
        delayMs: 100,
      },
    ];
    const gifBlob = createAnimatedGifBlob(frames);
    expect(gifBlob).toBeDefined();
    expect(gifBlob.type).toBe("image/gif");
    expect(gifBlob.size).toBeGreaterThan(0);

    const buffer = await gifBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const header = String.fromCharCode(...bytes.slice(0, 6));
    expect(header).toBe("GIF89a");
  });
});

describe("PixelArtStudioApp Component", () => {
  it("renders workspace, topbar, toolbar, colors, and layers", () => {
    render(<PixelArtStudioApp />);

    expect(screen.getByPlaceholderText("Pixel Art")).toBeDefined();
    expect(screen.getAllByText("Pencil")[0]).toBeDefined();
    expect(screen.getAllByText("Eraser")[0]).toBeDefined();
    expect(screen.getByText("Palette")).toBeDefined();
    expect(screen.getByText("Layers")).toBeDefined();
  });

  it("switches drawing tools when clicked", () => {
    render(<PixelArtStudioApp />);
    const eraserBtn = screen.getAllByText("Eraser")[0];
    fireEvent.click(eraserBtn);
  });

  it("adds a new layer when clicking Add Layer", () => {
    render(<PixelArtStudioApp />);
    const addLayerBtn = screen.getAllByRole("button", { name: /Add Layer/i })[0];
    fireEvent.click(addLayerBtn);
    expect(screen.getByText("Layer 2")).toBeDefined();
  });

  it("adds a new animation frame", () => {
    render(<PixelArtStudioApp />);
    const addFrameBtn = screen.getAllByRole("button", { name: /Add New Frame/i })[0];
    fireEvent.click(addFrameBtn);
    expect(screen.getByText("#2")).toBeDefined();
  });

  it("opens the Export modal when clicking Export", async () => {
    render(<PixelArtStudioApp />);
    const exportBtn = screen.getAllByText("Export")[0];
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText("Export Pixel Artwork")).toBeDefined();
      expect(screen.getByText("PNG")).toBeDefined();
      expect(screen.getByText("Sheet")).toBeDefined();
      expect(screen.getByText("GIF")).toBeDefined();
      expect(screen.getByText("Project")).toBeDefined();
    });
  });

  it("opens the New Canvas modal and sets preset", async () => {
    render(<PixelArtStudioApp />);
    const newBtn = screen.getAllByText("New")[0];
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText("New Pixel Canvas")).toBeDefined();
      expect(screen.getByText("16x16 (Retro)")).toBeDefined();
    });
  });
});
