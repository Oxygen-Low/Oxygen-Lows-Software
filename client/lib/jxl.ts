/**
 * Browser-side JPEG XL support.
 *
 * The FFmpeg.wasm core used by the file tools does not ship a libjxl encoder or
 * decoder, so JXL is handled with jSquash's libjxl WebAssembly build instead.
 * Pixels cross between the two pipelines as PNG, which every browser and the
 * FFmpeg core can read.
 */
import { decode as jxlDecode, encode as jxlEncode } from "@jsquash/jxl";

export const JXL_EXTENSION = "jxl";
export const JXL_MIME_TYPE = "image/jxl";

/** Recognise both the file extension and the longer JPEG XL spelling. */
export function isJxlFormat(format: string): boolean {
  const value = format.toLowerCase();
  return value === JXL_EXTENSION || value === "jpegxl";
}

/** Draw an image blob into a canvas and read its raw RGBA pixels. */
async function imageDataFromBlob(blob: Blob): Promise<ImageData> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      } finally {
        bitmap.close?.();
      }
    } catch {
      // Some formats (e.g. SVG in certain browsers) are not supported by
      // createImageBitmap. Fall through to the <img> decoder below.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to decode image"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Wrap raw pixels in a PNG blob so FFmpeg can consume them as an input file. */
async function pngBlobFromImageData(image: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.putImageData(image, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Unable to encode PNG")),
      "image/png",
    );
  });
}

/** Encode any browser-decodable image blob as a JPEG XL blob. */
export async function imageBlobToJxlBlob(blob: Blob): Promise<Blob> {
  const image = await imageDataFromBlob(blob);
  const encoded = await jxlEncode(image, { quality: 90 });
  return new Blob([encoded], { type: JXL_MIME_TYPE });
}

/**
 * Decode a JPEG XL blob into a PNG blob. The PNG can then be written into the
 * FFmpeg filesystem and converted to any of the other supported image types.
 */
export async function jxlBlobToPngBlob(blob: Blob): Promise<Blob> {
  const image = await jxlDecode(await blob.arrayBuffer());
  return pngBlobFromImageData(image);
}
