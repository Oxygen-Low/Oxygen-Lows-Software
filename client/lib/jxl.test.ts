// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decode, encode } from "@jsquash/jxl";
import {
  imageBlobToJxlBlob,
  isJxlFormat,
  jxlBlobToPngBlob,
  JXL_MIME_TYPE,
} from "./jxl";

vi.mock("@jsquash/jxl", () => ({
  encode: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
  decode: vi.fn().mockResolvedValue({
    data: new Uint8ClampedArray([255, 0, 0, 255]),
    width: 1,
    height: 1,
  }),
}));

describe("JPEG XL helpers", () => {
  const close = vi.fn();
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray([255, 0, 0, 255]),
      width: 1,
      height: 1,
    })),
    putImageData: vi.fn(),
  };

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback?.(new Blob(["png"], { type: "image/png" })),
    );
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: vi.fn().mockResolvedValue({ width: 1, height: 1, close }),
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("recognises JXL format spellings", () => {
    expect(isJxlFormat("jxl")).toBe(true);
    expect(isJxlFormat("JXL")).toBe(true);
    expect(isJxlFormat("jpegxl")).toBe(true);
    expect(isJxlFormat("png")).toBe(false);
    expect(isJxlFormat("jpeg")).toBe(false);
  });

  it("encodes a decoded image into a JXL blob", async () => {
    const source = new Blob(["image"], { type: "image/png" });

    const result = await imageBlobToJxlBlob(source);

    expect(result.type).toBe(JXL_MIME_TYPE);
    expect(encode).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1, height: 1 }),
      expect.objectContaining({ quality: 90 }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("decodes a JXL blob into a PNG blob for FFmpeg", async () => {
    const source = new Blob(["jxl"], { type: JXL_MIME_TYPE });

    const result = await jxlBlobToPngBlob(source);

    expect(result.type).toBe("image/png");
    expect(decode).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(ctx.putImageData).toHaveBeenCalled();
  });
});
