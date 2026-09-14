/**
 * Pure client-side GIF89a encoder supporting animation, transparency, and looping.
 */

interface FrameData {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  delayMs: number; // in milliseconds
}

export function createAnimatedGifBlob(frames: FrameData[]): Blob {
  if (frames.length === 0) {
    return new Blob([], { type: "image/gif" });
  }

  const { width, height } = frames[0];
  const stream: number[] = [];

  const writeByte = (b: number) => stream.push(b & 0xff);
  const writeWord = (w: number) => {
    stream.push(w & 0xff);
    stream.push((w >> 8) & 0xff);
  };
  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      writeByte(s.charCodeAt(i));
    }
  };

  // Header
  writeString("GIF89a");

  // Logical Screen Descriptor
  writeWord(width);
  writeWord(height);
  // Packed: No Global Color Table here, we use local color tables per frame
  writeByte(0x00); // no GCT, color resolution 0, not sorted, GCT size 0
  writeByte(0x00); // background color index
  writeByte(0x00); // pixel aspect ratio

  // Netscape 2.0 Application Extension for looping
  writeByte(0x21); // Extension Introducer
  writeByte(0xff); // Application Extension Label
  writeByte(0x0b); // Block Size (11 bytes)
  writeString("NETSCAPE2.0");
  writeByte(0x03); // Sub-block size (3 bytes)
  writeByte(0x01); // Sub-block ID (1 = loop count)
  writeWord(0); // Loop count (0 = infinity)
  writeByte(0x00); // Block Terminator

  // Encode each frame
  for (const frame of frames) {
    encodeFrame(frame, stream);
  }

  // Trailer
  writeByte(0x3b);

  return new Blob([new Uint8Array(stream)], { type: "image/gif" });
}

function encodeFrame(frame: FrameData, stream: number[]) {
  const { rgba, width, height, delayMs } = frame;
  const numPixels = width * height;

  // Build local palette and indexed pixels
  // Transparent pixel index will be reserved at 0
  const palette: [number, number, number][] = [];
  const colorMap = new Map<string, number>();
  const indexedPixels = new Uint8Array(numPixels);

  let hasTransparent = false;
  let transparentIndex = 0;

  // Reserve index 0 for transparency
  palette.push([0, 0, 0]);

  for (let i = 0; i < numPixels; i++) {
    const offset = i * 4;
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    const a = rgba[offset + 3];

    if (a < 128) {
      hasTransparent = true;
      indexedPixels[i] = 0; // transparent index
    } else {
      const key = `${r},${g},${b}`;
      let idx = colorMap.get(key);
      if (idx === undefined) {
        if (palette.length < 256) {
          idx = palette.length;
          palette.push([r, g, b]);
          colorMap.set(key, idx);
        } else {
          // Color limit reached (256): find nearest color
          idx = findNearestColor(r, g, b, palette);
        }
      }
      indexedPixels[i] = idx;
    }
  }

  // Determine color table size (power of 2, minimum 2, maximum 256)
  let colorDepth = 1;
  while (1 << colorDepth < palette.length && colorDepth < 8) {
    colorDepth++;
  }
  const colorTableSize = 1 << colorDepth;

  // Graphic Control Extension
  stream.push(0x21); // Extension Introducer
  stream.push(0xf9); // Graphic Control Label
  stream.push(0x04); // Byte Size (4)

  // Packed: Disposal Method 2 (Restore to background), User Input 0, Transparent flag
  const disposalMethod = 2; // Restore to background so previous frames don't leave trails
  const transFlag = hasTransparent ? 1 : 0;
  stream.push((disposalMethod << 2) | transFlag);

  // Delay time in centiseconds (1/100s)
  const delayCentis = Math.max(2, Math.round(delayMs / 10));
  stream.push(delayCentis & 0xff);
  stream.push((delayCentis >> 8) & 0xff);

  // Transparent Color Index
  stream.push(hasTransparent ? transparentIndex : 0);
  stream.push(0x00); // Block Terminator

  // Image Descriptor
  stream.push(0x2c); // Image Separator
  stream.push(0, 0); // Left 0
  stream.push(0, 0); // Top 0
  stream.push(width & 0xff, (width >> 8) & 0xff);
  stream.push(height & 0xff, (height >> 8) & 0xff);

  // Local Color Table Flag (1), Interlace (0), Sort (0), Size (colorDepth - 1)
  const packedLCT = 0x80 | (colorDepth - 1);
  stream.push(packedLCT);

  // Write Local Color Table
  for (let i = 0; i < colorTableSize; i++) {
    if (i < palette.length) {
      stream.push(palette[i][0], palette[i][1], palette[i][2]);
    } else {
      stream.push(0, 0, 0);
    }
  }

  // LZW Encode Image Data
  lzwEncode(indexedPixels, Math.max(2, colorDepth), stream);
}

function findNearestColor(
  r: number,
  g: number,
  b: number,
  palette: [number, number, number][]
): number {
  let bestDist = Infinity;
  let bestIdx = 1; // start from 1 to avoid transparent index 0
  for (let i = 1; i < palette.length; i++) {
    const dr = r - palette[i][0];
    const dg = g - palette[i][1];
    const db = b - palette[i][2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
      if (dist === 0) break;
    }
  }
  return bestIdx;
}

/**
 * Standard GIF LZW compression algorithm
 */
function lzwEncode(pixels: Uint8Array, minCodeSize: number, stream: number[]) {
  stream.push(minCodeSize);

  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let maxCode = (1 << codeSize) - 1;
  let nextCode = eoiCode + 1;

  // Prefix tree / map: key -> code
  const codeTable = new Map<string, number>();

  const initTable = () => {
    codeTable.clear();
    for (let i = 0; i < clearCode; i++) {
      codeTable.set(String(i), i);
    }
    codeSize = minCodeSize + 1;
    maxCode = (1 << codeSize) - 1;
    nextCode = eoiCode + 1;
  };

  initTable();

  // Bit packing accumulator
  let curAccum = 0;
  let curBits = 0;
  const buffer: number[] = [];

  const flushBuffer = () => {
    if (buffer.length > 0) {
      stream.push(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        stream.push(buffer[i]);
      }
      buffer.length = 0;
    }
  };

  const outputCode = (code: number) => {
    curAccum |= code << curBits;
    curBits += codeSize;

    while (curBits >= 8) {
      buffer.push(curAccum & 0xff);
      curAccum >>= 8;
      curBits -= 8;
      if (buffer.length === 254) {
        flushBuffer();
      }
    }
  };

  // Start with Clear Code
  outputCode(clearCode);

  let prefix = String(pixels[0]);

  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const combined = `${prefix},${k}`;

    if (codeTable.has(combined)) {
      prefix = combined;
    } else {
      outputCode(codeTable.get(prefix)!);

      if (nextCode <= 4095) {
        codeTable.set(combined, nextCode++);
        if (nextCode > maxCode && codeSize < 12) {
          codeSize++;
          maxCode = (1 << codeSize) - 1;
        }
      } else {
        // Reset when code table is full
        outputCode(clearCode);
        initTable();
      }

      prefix = String(k);
    }
  }

  // Output remaining code
  if (prefix) {
    outputCode(codeTable.get(prefix)!);
  }

  // Output End Of Information code
  outputCode(eoiCode);

  // Flush remaining bits
  if (curBits > 0) {
    buffer.push(curAccum & 0xff);
  }
  flushBuffer();

  // Block terminator
  stream.push(0x00);
}
