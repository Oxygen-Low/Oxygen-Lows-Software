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
      let isAlreadyRegistered = false;
      const targetFamily = font.name.replace(/^["']|["']$/g, "").trim().toLowerCase();

      if (typeof document.fonts.forEach === "function") {
        document.fonts.forEach((f: FontFace) => {
          const registeredFamily = f.family?.replace(/^["']|["']$/g, "").trim().toLowerCase();
          if (registeredFamily === targetFamily) {
            isAlreadyRegistered = true;
          }
        });
      } else {
        try {
          const fontsArr = Array.from(document.fonts as unknown as Iterable<FontFace>);
          isAlreadyRegistered = fontsArr.some((f) => {
            const registeredFamily = f.family?.replace(/^["']|["']$/g, "").trim().toLowerCase();
            return registeredFamily === targetFamily;
          });
        } catch {
          // Fall through if iteration is not supported
        }
      }

      if (isAlreadyRegistered) return;

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
