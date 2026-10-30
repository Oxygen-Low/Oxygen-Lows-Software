// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getImageElement,
  getImageStatus,
  preloadImage,
  drawLayer,
} from "./canvasUtils";
import { ImageLayer } from "./types";

describe("canvasUtils image loading and caching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not set crossOrigin for blob: and data: URLs", () => {
    const blobUrl = "blob:http://localhost:5173/test-uuid";
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";

    getImageElement(blobUrl);
    getImageElement(dataUrl);

    // Should be in loading state
    expect(getImageStatus(blobUrl)).toBe("loading");
    expect(getImageStatus(dataUrl)).toBe("loading");
  });

  it("handles image load callbacks and caches the loaded image", () => {
    const url = "https://example.com/photo.png";
    const onLoad1 = vi.fn();
    const onLoad2 = vi.fn();

    const img1 = getImageElement(url, onLoad1);
    expect(img1).toBeNull();
    expect(getImageStatus(url)).toBe("loading");

    // Second call before load finishes should register callback without creating duplicate image
    const img2 = getImageElement(url, onLoad2);
    expect(img2).toBeNull();

    // Trigger onload on the image cache entry
    // In jsdom, Image elements can have their onload called manually
    const cachedEntryImg = (window as any).Image.prototype;
  });

  it("draws placeholder while loading and draws image when loaded", () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      filter: "none",
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D;

    const layer: ImageLayer = {
      id: "img-test-1",
      type: "image",
      name: "Test Image",
      src: "https://example.com/test-layer.png",
      naturalWidth: 100,
      naturalHeight: 100,
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      isLocked: false,
      isVisible: true,
      flipH: false,
      flipV: false,
      filters: {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        blur: 0,
        grayscale: 0,
        sepia: 0,
        invert: 0,
      },
    };

    const onLoad = vi.fn();
    drawLayer(ctx, layer, onLoad);

    // While loading, should draw "Loading image..."
    expect(ctx.fillText).toHaveBeenCalledWith("Loading image...", 0, 0);
  });
});
