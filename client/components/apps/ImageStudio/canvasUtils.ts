import {
  CanvasBackground,
  CanvasLayer,
  ImageLayer,
  TextLayer,
  ShapeLayer,
  ImageFilters,
} from "./types";

export function getFilterString(filters?: ImageFilters): string {
  if (!filters) return "none";
  const parts: string[] = [];
  if (filters.brightness !== 100) parts.push(`brightness(${filters.brightness}%)`);
  if (filters.contrast !== 100) parts.push(`contrast(${filters.contrast}%)`);
  if (filters.saturation !== 100) parts.push(`saturate(${filters.saturation}%)`);
  if (filters.blur > 0) parts.push(`blur(${filters.blur}px)`);
  if (filters.grayscale > 0) parts.push(`grayscale(${filters.grayscale}%)`);
  if (filters.sepia > 0) parts.push(`sepia(${filters.sepia}%)`);
  if (filters.invert > 0) parts.push(`invert(${filters.invert}%)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: CanvasBackground,
  transparentCheckerboard = false,
) {
  if (bg.type === "transparent") {
    if (transparentCheckerboard) {
      // Draw checkerboard pattern
      const size = 20;
      for (let y = 0; y < height; y += size) {
        for (let x = 0; x < width; x += size) {
          const isEven = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0;
          ctx.fillStyle = isEven ? "#242938" : "#1a1f2c";
          ctx.fillRect(x, y, size, size);
        }
      }
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    return;
  }

  if (bg.type === "color") {
    ctx.fillStyle = bg.color || "#ffffff";
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (bg.type === "gradient") {
    const { type, angle, startColor, endColor } = bg.gradient;
    if (type === "linear") {
      const rad = ((angle - 90) * Math.PI) / 180;
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.sqrt(cx * cx + cy * cy);
      const x0 = cx - Math.cos(rad) * r;
      const y0 = cy - Math.sin(rad) * r;
      const x1 = cx + Math.cos(rad) * r;
      const y1 = cy + Math.sin(rad) * r;

      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, startColor);
      gradient.addColorStop(1, endColor);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    } else {
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.max(width, height) / 2;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, startColor);
      gradient.addColorStop(1, endColor);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  layer: ShapeLayer,
) {
  const { width, height, shapeType, fill, fillType, strokeColor, strokeWidth, cornerRadius } = layer;

  // Prepare fill style
  if (fillType === "gradient") {
    const rad = (((layer.gradientAngle || 0) - 90) * Math.PI) / 180;
    const x0 = -width / 2 + (width / 2) * (1 - Math.cos(rad));
    const y0 = -height / 2 + (height / 2) * (1 - Math.sin(rad));
    const x1 = width / 2 + (width / 2) * Math.cos(rad);
    const y1 = height / 2 + (height / 2) * Math.sin(rad);
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, layer.gradientStart || "#06b6d4");
    grad.addColorStop(1, layer.gradientEnd || "#3b82f6");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = fill || "#06b6d4";
  }

  ctx.strokeStyle = strokeColor || "transparent";
  ctx.lineWidth = strokeWidth || 0;

  ctx.beginPath();

  const hw = width / 2;
  const hh = height / 2;

  switch (shapeType) {
    case "rectangle":
      ctx.rect(-hw, -hh, width, height);
      break;

    case "rounded-rectangle": {
      const radius = Math.min(cornerRadius ?? 16, hw, hh);
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(-hw, -hh, width, height, radius);
      } else {
        ctx.rect(-hw, -hh, width, height);
      }
      break;
    }

    case "circle":
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;

    case "triangle":
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
      break;

    case "star": {
      const points = 5;
      const outerR = Math.min(hw, hh);
      const innerR = outerR * 0.45;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }

    case "line":
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      break;

    case "arrow": {
      const arrowHead = Math.min(width * 0.25, 30);
      ctx.moveTo(-hw, -hh * 0.35);
      ctx.lineTo(hw - arrowHead, -hh * 0.35);
      ctx.lineTo(hw - arrowHead, -hh * 0.8);
      ctx.lineTo(hw, 0);
      ctx.lineTo(hw - arrowHead, hh * 0.8);
      ctx.lineTo(hw - arrowHead, hh * 0.35);
      ctx.lineTo(-hw, hh * 0.35);
      ctx.closePath();
      break;
    }

    case "badge": {
      // 8-point ribbon/badge
      const outerR = Math.min(hw, hh);
      const innerR = outerR * 0.85;
      const points = 8;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / points;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
  }

  if (shapeType !== "line") {
    ctx.fill();
  }
  if (strokeWidth && strokeWidth > 0 && strokeColor && strokeColor !== "transparent") {
    ctx.stroke();
  }
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
) {
  const {
    text,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    color,
    textAlign,
    lineHeight,
    letterSpacing,
    strokeColor,
    strokeWidth,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    width,
    height,
  } = layer;

  ctx.font = `${fontStyle || "normal"} ${fontWeight || "normal"} ${fontSize}px ${fontFamily || "sans-serif"}`;
  ctx.textAlign = textAlign || "left";
  ctx.textBaseline = "middle";

  if (shadowColor && shadowBlur) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX || 0;
    ctx.shadowOffsetY = shadowOffsetY || 0;
  }

  const lines = text.split("\n");
  const computedLineHeight = fontSize * (lineHeight || 1.2);
  const totalTextHeight = lines.length * computedLineHeight;
  const startY = -totalTextHeight / 2 + computedLineHeight / 2;

  lines.forEach((line, index) => {
    let startX = 0;
    if (textAlign === "left") startX = -width / 2;
    else if (textAlign === "right") startX = width / 2;
    else startX = 0;

    const y = startY + index * computedLineHeight;

    if (strokeWidth && strokeWidth > 0 && strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(line, startX, y);
    }

    ctx.fillStyle = color || "#ffffff";
    ctx.fillText(line, startX, y);
  });
}

// Global Image Cache for instant rendering
const imageCache: Map<string, HTMLImageElement> = new Map();

export function getImageElement(src: string, onLoad?: () => void): HTMLImageElement | null {
  if (imageCache.has(src)) {
    const img = imageCache.get(src)!;
    if (img.complete && img.naturalWidth > 0) return img;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  img.onload = () => {
    imageCache.set(src, img);
    if (onLoad) onLoad();
  };
  imageCache.set(src, img);
  return null;
}

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasLayer,
  onImageLoad?: () => void,
) {
  if (!layer.isVisible) return;

  ctx.save();

  // Position at center of layer for intuitive rotation & scaling
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;

  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));

  if (layer.type === "image") {
    const imgLayer = layer as ImageLayer;
    const img = getImageElement(imgLayer.src, onImageLoad);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      const scaleX = imgLayer.flipH ? -1 : 1;
      const scaleY = imgLayer.flipV ? -1 : 1;
      ctx.scale(scaleX, scaleY);

      const filterStr = getFilterString(imgLayer.filters);
      if (filterStr !== "none") {
        ctx.filter = filterStr;
      }

      ctx.drawImage(
        img,
        -imgLayer.width / 2,
        -imgLayer.height / 2,
        imgLayer.width,
        imgLayer.height,
      );
      ctx.restore();
    } else {
      // Placeholder while loading
      ctx.fillStyle = "#334155";
      ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Loading image...", 0, 0);
    }
  } else if (layer.type === "text") {
    drawText(ctx, layer as TextLayer);
  } else if (layer.type === "shape") {
    drawShape(ctx, layer as ShapeLayer);
  }

  ctx.restore();
}
