import React, { useRef, useState } from "react";
import {
  Type,
  Heading1,
  Heading2,
  AlignLeft,
  FolderOpen,
  Upload,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { SYSTEM_FONTS, CustomFont } from "./types";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

interface TextPanelProps {
  onAddTextLayer: (
    preset: "heading" | "subheading" | "body",
    fontFamily?: string,
  ) => void;
  customFonts: CustomFont[];
  onAddCustomFont: (
    name: string,
    url: string,
    storagePath?: string,
    format?: string,
  ) => Promise<string>;
}

export const TextPanel: React.FC<TextPanelProps> = ({
  onAddTextLayer,
  customFonts,
  onAddCustomFont,
}) => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const processFontFile = async (file: File) => {
    setIsUploading(true);
    try {
      const fontName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-\s]/g, "");
      let url = URL.createObjectURL(file);
      let storagePath: string | undefined;

      // Upload to Storage if logged in
      if (userId) {
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/image-studio/fonts/${Date.now()}_${cleanFileName}`;

        const uploadResult = await storage.from("Storage").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });

        if (!uploadResult.error) {
          url = storage.from("Storage").getPublicUrl(path).data.publicUrl;
          storagePath = path;
          toast.success(t("imageStudio.fontUploaded", undefined, "Custom font saved to Storage!"));
        }
      }

      await onAddCustomFont(fontName, url, storagePath);
      toast.success(`${fontName} ${t("imageStudio.fontLoaded", undefined, "loaded successfully!")}`);
    } catch (e) {
      toast.error(t("imageStudio.fontLoadFailed", undefined, "Failed to load font file."));
      console.error(e);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFontInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFontFile(files[0]);
    }
    if (fontInputRef.current) {
      fontInputRef.current.value = "";
    }
  };

  const handleSelectFontFromStorage = async (file: any) => {
    try {
      const fontName = file.name.split("/").pop()?.replace(/\.[^/.]+$/, "") || "CustomFont";
      const publicUrl = storage.from("Storage").getPublicUrl(file.name).data.publicUrl;
      await onAddCustomFont(fontName, publicUrl, file.name);
      toast.success(`${fontName} ${t("imageStudio.fontLoaded", undefined, "loaded successfully!")}`);
    } catch {
      toast.error(t("imageStudio.fontLoadFailed", undefined, "Failed to load font file."));
    }
  };

  return (
    <div className="space-y-5 p-3">
      {/* Typography Presets */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("imageStudio.addText", undefined, "Add Text")}
        </div>

        <button
          onClick={() => onAddTextLayer("heading")}
          className="w-full p-3 rounded-lg border border-border bg-card/60 hover:bg-accent text-left transition-all hover:scale-[1.01] flex items-center gap-3 group"
        >
          <Heading1 className="w-5 h-5 text-primary shrink-0" />
          <div>
            <div className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
              {t("imageStudio.addHeading", undefined, "Add a heading")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("imageStudio.headingDesc", undefined, "Large title text")}
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddTextLayer("subheading")}
          className="w-full p-2.5 rounded-lg border border-border bg-card/60 hover:bg-accent text-left transition-all hover:scale-[1.01] flex items-center gap-3 group"
        >
          <Heading2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
              {t("imageStudio.addSubheading", undefined, "Add a subheading")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("imageStudio.subheadingDesc", undefined, "Medium section subtitle")}
            </div>
          </div>
        </button>

        <button
          onClick={() => onAddTextLayer("body")}
          className="w-full p-2.5 rounded-lg border border-border bg-card/60 hover:bg-accent text-left transition-all hover:scale-[1.01] flex items-center gap-3 group"
        >
          <AlignLeft className="w-4 h-4 text-muted-foreground shrink-0" />
          <div>
            <div className="text-xs font-medium text-foreground">
              {t("imageStudio.addBodyText", undefined, "Add a little bit of body text")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("imageStudio.bodyDesc", undefined, "Paragraph / body copy")}
            </div>
          </div>
        </button>
      </div>

      {/* Custom Fonts via Storage */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>{t("imageStudio.customFonts", undefined, "Custom Fonts (via Storage)")}</span>
        </div>

        <input
          ref={fontInputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden"
          onChange={handleFontInputChange}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fontInputRef.current?.click()}
            className="text-xs gap-1.5 h-8 border-border bg-card/60 hover:bg-accent"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-primary" />
            )}
            <span>{t("imageStudio.uploadFont", undefined, "Upload Font")}</span>
          </Button>

          <StorageFileSelector
            allowedExtensions={[".ttf", ".otf", ".woff", ".woff2"]}
            onSelect={handleSelectFontFromStorage}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8 border-border bg-card/60 hover:bg-accent"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>{t("imageStudio.storageFont", undefined, "Storage Fonts")}</span>
              </Button>
            }
          />
        </div>

        {/* List of Custom Fonts */}
        {customFonts.length > 0 && (
          <div className="space-y-1 mt-2">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              {t("imageStudio.loadedCustomFonts", undefined, "Loaded Custom Fonts")}
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {customFonts.map((cf) => (
                <button
                  key={cf.name}
                  onClick={() => onAddTextLayer("heading", cf.name)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-background/50 hover:bg-accent border border-border/50 text-left transition-colors"
                >
                  <span
                    className="text-xs text-foreground truncate"
                    style={{ fontFamily: cf.name }}
                  >
                    {cf.name}
                  </span>
                  <span className="text-[10px] text-primary font-mono shrink-0 ml-1">
                    {t("imageStudio.apply", undefined, "Add")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* System Fonts Overview */}
      <div className="space-y-1 pt-2 border-t border-border">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          {t("imageStudio.standardFonts", undefined, "System & Web Fonts")}
        </div>
        <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
          {SYSTEM_FONTS.map((font) => (
            <button
              key={font.name}
              onClick={() => onAddTextLayer("heading", font.name)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-accent border border-transparent hover:border-border text-left transition-colors"
            >
              <span className="text-xs text-foreground" style={{ fontFamily: font.font }}>
                {font.name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">Aa</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
