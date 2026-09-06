import { useState, useEffect, useCallback } from "react";
import { CustomFont } from "../types";

const STORAGE_KEY = "image_studio_custom_fonts";

export function useCustomFonts() {
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const loadFontFace = useCallback(async (font: CustomFont) => {
    try {
      if (typeof window === "undefined" || !("fonts" in document)) return;

      // Check if already registered
      for (const f of document.fonts.values()) {
        if (f.family === font.name) return;
      }

      const fontFace = new FontFace(font.name, `url(${font.url})`);
      const loaded = await fontFace.load();
      document.fonts.add(loaded);
    } catch (e) {
      console.warn(`Failed to load custom font ${font.name}:`, e);
    }
  }, []);

  // Load registered fonts on mount
  useEffect(() => {
    customFonts.forEach((font) => {
      loadFontFace(font);
    });
  }, [customFonts, loadFontFace]);

  const addCustomFont = useCallback(
    async (
      name: string,
      url: string,
      storagePath?: string,
      format = "truetype",
    ) => {
      const cleanName = name.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "CustomFont";
      const newFont: CustomFont = {
        name: cleanName,
        url,
        storagePath,
        format,
      };

      await loadFontFace(newFont);

      setCustomFonts((prev) => {
        const filtered = prev.filter((f) => f.name !== cleanName);
        const updated = [...filtered, newFont];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      return cleanName;
    },
    [loadFontFace],
  );

  return {
    customFonts,
    addCustomFont,
    loadFontFace,
  };
}
