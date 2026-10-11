import { useCallback } from "react";
import { useTranslation } from "@/contexts/LanguageContext";

export type MusicT = (key: string, params?: Record<string, string | number>) => string;

/** Translator scoped to the `musicStudio` locale namespace. */
export function useMusicT(): MusicT {
  const { t } = useTranslation();
  return useCallback(
    (key: string, params?: Record<string, string | number>) => t(`musicStudio.${key}`, params),
    [t],
  );
}
