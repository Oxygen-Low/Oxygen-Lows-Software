import { useState, useEffect, useCallback } from "react";
import { CustomFont } from "../types";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "image_studio_custom_fonts";

export function extractStoragePath(url: string, storagePath?: string): string | undefined {
  if (storagePath) return storagePath;
  if (!url) return undefined;
  const match = url.match(/\/(?:public|download)\/Storage\/(.+?)(?:\?.*)?$/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return undefined;
}

export function useCustomFonts() {
  const { session } = useAuth();
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const loadFontFace = useCallback(async (font: CustomFont): Promise<boolean> => {
    try {
      if (typeof window === "undefined" || !("fonts" in document)) return false;

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

      if (isAlreadyRegistered) return true;

      const effectiveStoragePath = extractStoragePath(font.url, font.storagePath);
      let targetUrl = font.url;

      // Auto-heal broken public storage URLs if storagePath is known
      const isBrokenStorageUrl = targetUrl.includes("/api/storage/public/Storage");
      if (effectiveStoragePath && isBrokenStorageUrl) {
        try {
          const { data } = await storage
            .from("Storage")
            .createSignedUrl(effectiveStoragePath, 60 * 60 * 24 * 7);
          if (data?.signedUrl) {
            targetUrl = data.signedUrl;
            setCustomFonts((prev) => {
              const updated = prev.map((f) =>
                f.name === font.name
                  ? { ...f, url: targetUrl, storagePath: effectiveStoragePath }
                  : f,
              );
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
              } catch {}
              return updated;
            });
          }
        } catch {}
      }

      // First attempt: load via FontFace URL
      try {
        const fontFace = new FontFace(font.name, `url(${targetUrl})`);
        const loaded = await fontFace.load();
        document.fonts.add(loaded);
        return true;
      } catch (firstErr) {
        // Fallback: If URL load failed and we have storagePath, download file binary and load from buffer
        if (effectiveStoragePath) {
          try {
            if (effectiveStoragePath.includes('..')) {
              throw new Error('Invalid storage path');
            }
            const { data: blob, error: downloadErr } = await storage
              .from("Storage")
              .download(effectiveStoragePath);
            if (!downloadErr && blob) {
              const buffer = await blob.arrayBuffer();
              const binaryFontFace = new FontFace(font.name, buffer);
              const loaded = await binaryFontFace.load();
              document.fonts.add(loaded);
              return true;
            }
          } catch (downloadErr) {
            console.warn(`Fallback buffer download failed for ${font.name}:`, downloadErr);
          }
        }
        console.warn(`Failed to load custom font ${font.name}:`, firstErr);
        return false;
      }
    } catch (e) {
      console.warn(`Failed to load custom font ${font.name}:`, e);
      return false;
    }
  }, []);

  // Load registered fonts on mount or when session changes
  useEffect(() => {
    customFonts.forEach((font) => {
      loadFontFace(font);
    });
  }, [customFonts, loadFontFace, session?.user?.id]);

  const addCustomFont = useCallback(
    async (
      name: string,
      url: string,
      storagePath?: string,
      format = "truetype",
    ) => {
      const cleanName = name.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim() || "CustomFont";
      const effectiveStoragePath = extractStoragePath(url, storagePath);
      let effectiveUrl = url;

      if (effectiveStoragePath && effectiveUrl.includes("/api/storage/public/Storage")) {
        try {
          if (effectiveStoragePath.includes('..')) {
            throw new Error('Invalid storage path');
          }
          const { data } = await storage
            .from("Storage")
            .createSignedUrl(effectiveStoragePath, 60 * 60 * 24 * 7);
          if (data?.signedUrl) {
            effectiveUrl = data.signedUrl;
          }
        } catch {}
      }

      const newFont: CustomFont = {
        name: cleanName,
        url: effectiveUrl,
        storagePath: effectiveStoragePath,
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
