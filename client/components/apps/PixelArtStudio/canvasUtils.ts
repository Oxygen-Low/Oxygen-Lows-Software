import { PixelFrame, PixelLayer } from "./types";

export function getIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function getCoords(index: number, width: number): { x: number; y: number } {
  return {
    x: index % width,
    y: Math.floor(index / width),
  };
}

export function createBlankLayer(name = "Layer 1", width = 32, height = 32, id?: string): PixelLayer {
  return {
    id: id || `layer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    visible: true,
    opacity: 1,
    pixels: new Array(width * height).fill(""),
  };
}

export function createBlankFrame(name = "Frame 1", width = 32, height = 32, id?: string): PixelFrame {
  return {
    id: id || `frame-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    layers: [createBlankLayer("Layer 1", width, height)],
  };
}

/**
 * Bresenham's Line Algorithm
 */
export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let currX = x0;
  let currY = y0;

  while (true) {
    points.push({ x: currX, y: currY });
    if (currX === x1 && currY === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      currX += sx;
    }
    if (e2 < dx) {
      err += dx;
      currY += sy;
    }
  }

  return points;
}

/**
 * Bresenham / Midpoint Circle Algorithm
 */
export function getCirclePixels(
  xc: number,
  yc: number,
  radius: number,
  filled = false
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const pointSet = new Set<string>();

  const addPoint = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!pointSet.has(key)) {
      pointSet.add(key);
      points.push({ x, y });
    }
  };

  if (filled) {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          addPoint(xc + x, yc + y);
        }
      }
    }
    return points;
  }

  let x = 0;
  let y = radius;
  let d = 3 - 2 * radius;

  const drawSymmetric = (cx: number, cy: number, px: number, py: number) => {
    addPoint(cx + px, cy + py);
    addPoint(cx - px, cy + py);
    addPoint(cx + px, cy - py);
    addPoint(cx - px, cy - py);
    addPoint(cx + py, cy + px);
    addPoint(cx - py, cy + px);
    addPoint(cx + py, cy - px);
    addPoint(cx - py, cy - px);
  };

  drawSymmetric(xc, yc, x, y);

  while (y >= x) {
    x++;
    if (d > 0) {
      y--;
      d = d + 4 * (x - y) + 10;
    } else {
      d = d + 4 * x + 6;
    }
    drawSymmetric(xc, yc, x, y);
  }

  return points;
}

/**
 * Rectangle stroke or fill
 */
export function getRectanglePixels(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled = false
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

/**
 * Flood Fill (BFS 4-direction)
 */
export function floodFill(
  pixels: string[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: string
): string[] {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return pixels;

  const startIndex = getIndex(startX, startY, width);
  const targetColor = pixels[startIndex] || "";

  if (targetColor.toLowerCase() === fillColor.toLowerCase()) return pixels;

  const newPixels = [...pixels];
  const queue: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);
  visited[startIndex] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const idx = getIndex(x, y, width);
    newPixels[idx] = fillColor;

    const neighbors: [number, number][] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = getIndex(nx, ny, width);
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          const neighborColor = pixels[nIdx] || "";
          if (neighborColor.toLowerCase() === targetColor.toLowerCase()) {
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  return newPixels;
}

/**
 * Adjust Lightness of HEX color (lighten > 0, darken < 0)
 */
export function adjustColorLightness(hexColor: string, percent: number): string {
  if (!hexColor || !hexColor.startsWith("#")) return hexColor;
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  const num = parseInt(hex, 16);
  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return (
    "#" +
    ((1 << 24) + (r << 16) + (g << 8) + b)
      .toString(16)
      .slice(1)
      .toUpperCase()
  );
}

/**
 * Color Swap
 */
export function colorSwap(pixels: string[], fromColor: string, toColor: string): string[] {
  const normFrom = fromColor.toLowerCase();
  return pixels.map((c) => (c.toLowerCase() === normFrom ? toColor : c));
}

/**
 * Composite visible layers of a frame into an RGBA flat ImageData-compatible buffer or 2D canvas
 */
export function compositeFramePixels(frame: PixelFrame, width: number, height: number): Uint8ClampedArray {
  const totalPixels = width * height;
  const rgba = new Uint8ClampedArray(totalPixels * 4);

  // Layers rendered bottom to top
  for (const layer of frame.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;

    for (let i = 0; i < totalPixels; i++) {
      const color = layer.pixels[i];
      if (!color || !color.startsWith("#")) continue;

      let hex = color.replace("#", "");
      if (hex.length === 3) {
        hex = hex.split("").map((c) => c + c).join("");
      }
      const num = parseInt(hex, 16);
      const srcR = num >> 16;
      const srcG = (num >> 8) & 0xff;
      const srcB = num & 0xff;
      const srcA = Math.round(layer.opacity * 255);

      const offset = i * 4;
      const destR = rgba[offset];
      const destG = rgba[offset + 1];
      const destB = rgba[offset + 2];
      const destA = rgba[offset + 3];

      if (destA === 0 || srcA === 255) {
        rgba[offset] = srcR;
        rgba[offset + 1] = srcG;
        rgba[offset + 2] = srcB;
        rgba[offset + 3] = srcA;
      } else {
        // Alpha blending
        const aNorm = srcA / 255;
        const daNorm = destA / 255;
        const outA = aNorm + daNorm * (1 - aNorm);
        if (outA > 0) {
          rgba[offset] = Math.round((srcR * aNorm + destR * daNorm * (1 - aNorm)) / outA);
          rgba[offset + 1] = Math.round((srcG * aNorm + destG * daNorm * (1 - aNorm)) / outA);
          rgba[offset + 2] = Math.round((srcB * aNorm + destB * daNorm * (1 - aNorm)) / outA);
          rgba[offset + 3] = Math.round(outA * 255);
        }
      }
    }
  }

  return rgba;
}

/**
 * Render a frame onto an HTMLCanvasElement with nearest-neighbor crisp scaling
 */
export function renderFrameToCanvas(
  frame: PixelFrame,
  width: number,
  height: number,
  scale = 1
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  // Create 1:1 image data
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) return canvas;

  const rgba = compositeFramePixels(frame, width, height);
  const imgData = baseCtx.createImageData(width, height);
  imgData.data.set(rgba);
  baseCtx.putImageData(imgData, 0, 0);

  // Draw scaled
  ctx.drawImage(baseCanvas, 0, 0, width * scale, height * scale);
  return canvas;
}

/**
 * Render a sprite sheet combining all frames horizontally
 */
export function renderSpriteSheet(
  frames: PixelFrame[],
  width: number,
  height: number,
  scale = 1,
  columns?: number
): HTMLCanvasElement {
  const totalFrames = frames.length;
  const cols = columns && columns > 0 ? Math.min(columns, totalFrames) : totalFrames;
  const rows = Math.ceil(totalFrames / cols);

  const canvas = document.createElement("canvas");
  canvas.width = cols * width * scale;
  canvas.height = rows * height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  frames.forEach((frame, idx) => {
    const frameCanvas = renderFrameToCanvas(frame, width, height, scale);
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    ctx.drawImage(frameCanvas, col * width * scale, row * height * scale);
  });

  return canvas;
}
