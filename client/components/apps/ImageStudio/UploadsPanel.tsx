import React, { useState, useRef } from "react";
import {
  Upload,
  FolderOpen,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import { generateImage, AspectRatio } from "@/services/imageGen";

interface UploadedAsset {
  id: string;
  name: string;
  url: string;
  storagePath?: string;
  width: number;
  height: number;
}

interface UploadsPanelProps {
  onAddImageToCanvas: (
    src: string,
    width: number,
    height: number,
    storagePath?: string,
  ) => void;
}

const LOCAL_ASSETS_KEY = "image_studio_recent_uploads";

export const UploadsPanel: React.FC<UploadsPanelProps> = ({
  onAddImageToCanvas,
}) => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<UploadedAsset[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_ASSETS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isUploading, setIsUploading] = useState(false);

  // AI Generation Dialog State
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiModel, setAiModel] = useState("quality");
  const [aiAspect, setAiAspect] = useState<AspectRatio>("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");

  const saveAssets = (newAssets: UploadedAsset[]) => {
    setAssets(newAssets);
    try {
      localStorage.setItem(LOCAL_ASSETS_KEY, JSON.stringify(newAssets));
    } catch {}
  };

  const processImageFile = async (file: File) => {
    setIsUploading(true);
    try {
      const img = new Image();
      const localUrl = URL.createObjectURL(file);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = localUrl;
      });

      const width = img.naturalWidth || 800;
      const height = img.naturalHeight || 600;

      let finalUrl = localUrl;
      let storagePath: string | undefined;

      // If user is authenticated, upload directly to their Storage bucket
      if (userId) {
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/image-studio/uploads/${Date.now()}_${cleanFileName}`;

        const uploadResult = await storage.from("Storage").upload(path, file, {
          contentType: file.type,
          upsert: true,
        });

        if (!uploadResult.error) {
          const publicUrl = storage.from("Storage").getPublicUrl(path).data
            .publicUrl;
          finalUrl = publicUrl;
          storagePath = path;
          toast.success(
            t("imageStudio.fileUploaded", undefined, "File saved to your Storage!"),
          );
        } else {
          console.warn(
            "Storage upload error, using local buffer:",
            uploadResult.error,
          );
        }
      }

      const newAsset: UploadedAsset = {
        id: Date.now().toString(),
        name: file.name,
        url: finalUrl,
        storagePath,
        width,
        height,
      };

      const updated = [newAsset, ...assets];
      saveAssets(updated);

      // Automatically place on canvas
      onAddImageToCanvas(finalUrl, width, height, storagePath);
    } catch (err: any) {
      toast.error(
        t("imageStudio.uploadFailed", undefined, "Failed to load image file."),
      );
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processImageFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith("image/")) {
      processImageFile(files[0]);
    }
  };

  const handleSelectFromStorage = async (file: any) => {
    try {
      const publicUrl = storage.from("Storage").getPublicUrl(file.name).data
        .publicUrl;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const width = img.naturalWidth || 800;
        const height = img.naturalHeight || 600;

        const asset: UploadedAsset = {
          id: Date.now().toString(),
          name: file.name.split("/").pop() || "storage-image",
          url: publicUrl,
          storagePath: file.name,
          width,
          height,
        };

        const updated = [
          asset,
          ...assets.filter((a) => a.storagePath !== file.name),
        ];
        saveAssets(updated);
        onAddImageToCanvas(publicUrl, width, height, file.name);
      };
      img.src = publicUrl;
    } catch {
      toast.error(
        t(
          "imageStudio.storageLoadError",
          undefined,
          "Error loading file from Storage",
        ),
      );
    }
  };

  const handleDeleteAsset = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = assets.filter((a) => a.id !== id);
    saveAssets(updated);
  };

  const handleGenerateAi = async () => {
    if (!aiPrompt.trim()) {
      toast.error(t("imageStudio.promptRequired", undefined, "Please enter a prompt"));
      return;
    }

    setIsGenerating(true);
    setGenStatus(t("imageStudio.generating", undefined, "Generating..."));

    try {
      const result = await generateImage(
        {
          model: aiModel,
          prompt: aiPrompt.trim(),
          aspectRatio: aiAspect,
        },
        (progress) => {
          if (progress.message) setGenStatus(progress.message);
        },
      );

      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || 512;
        const height = img.naturalHeight || 512;

        const asset: UploadedAsset = {
          id: Date.now().toString(),
          name: `AI: ${aiPrompt.slice(0, 20)}`,
          url: result.url,
          storagePath: result.storagePath,
          width,
          height,
        };

        const updated = [asset, ...assets];
        saveAssets(updated);
        onAddImageToCanvas(result.url, width, height, result.storagePath);
        toast.success(t("imageStudio.aiGenSuccess", undefined, "AI image created and placed on canvas!"));
        setAiDialogOpen(false);
        setAiPrompt("");
      };
      img.src = result.url;
    } catch (e: any) {
      toast.error(
        e.message ||
          t("imageStudio.aiGenFailed", undefined, "Failed to generate image. Please try again."),
      );
    } finally {
      setIsGenerating(false);
      setGenStatus("");
    }
  };

  return (
    <div className="space-y-4 p-3">
      {/* Upload Buttons & Dropzone */}
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border hover:border-primary/70 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-card/40 hover:bg-card transition-all text-center group"
        >
          {isUploading ? (
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          ) : (
            <Upload className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
          )}
          <div>
            <p className="text-xs font-semibold text-foreground">
              {t("imageStudio.dropImagesHere", undefined, "Upload Custom Image")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t(
                "imageStudio.dropHelp",
                undefined,
                "Drag & drop or click to upload",
              )}
            </p>
          </div>
        </div>

        {/* Generate with AI Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAiDialogOpen(true)}
          className="w-full gap-2 text-xs border-cyan-500/40 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/15"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t("imageStudio.generateAi", undefined, "Generate with AI")}</span>
        </Button>

        {/* Browse User Storage Button */}
        <StorageFileSelector
          allowedTypes={["image"]}
          onSelect={handleSelectFromStorage}
          trigger={
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs border-border bg-card/60 hover:bg-accent"
            >
              <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {t(
                  "imageStudio.browseStorage",
                  undefined,
                  "Browse My Storage Files",
                )}
              </span>
            </Button>
          }
        />
      </div>

      {/* Asset Grid */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>{t("imageStudio.myUploads", undefined, "My Uploads")}</span>
          <span className="font-mono text-[10px]">{assets.length}</span>
        </div>

        {assets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground border border-border/50 rounded-lg p-3 bg-card/20">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">
              {t(
                "imageStudio.noUploadsYet",
                undefined,
                "No uploaded files yet. Upload images above to start composing!",
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
            {assets.map((asset) => (
              <div
                key={asset.id}
                onClick={() =>
                  onAddImageToCanvas(
                    asset.url,
                    asset.width,
                    asset.height,
                    asset.storagePath,
                  )
                }
                className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-slate-900 cursor-pointer hover:border-primary/80 transition-all hover:scale-[1.02]"
              >
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                />

                {/* Overlay & Delete Button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-1.5">
                  <span className="text-[10px] text-white truncate max-w-[70%] drop-shadow">
                    {asset.name}
                  </span>
                  <button
                    onClick={(e) => handleDeleteAsset(e, asset.id)}
                    title={t(
                      "imageStudio.deleteAsset",
                      undefined,
                      "Remove from tray",
                    )}
                    className="w-6 h-6 rounded bg-rose-600/80 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Generator Modal */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-[460px] bg-popover border-border text-popover-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{t("imageStudio.generateWithAi", undefined, "Generate Image with AI")}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">
                {t("imageStudio.prompt", undefined, "Prompt")}
              </Label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={t(
                  "imageStudio.promptPlaceholder",
                  undefined,
                  "A futuristic cyber city with glowing neon billboards and raining reflections...",
                )}
                rows={3}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">
                  {t("imageStudio.styleModel", undefined, "Style Preset")}
                </Label>
                <Select value={aiModel} onValueChange={setAiModel}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="quality">Quality (SDXL)</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                    <SelectItem value="anime">Anime</SelectItem>
                    <SelectItem value="realistic">Realistic</SelectItem>
                    <SelectItem value="cartoon">Cartoon</SelectItem>
                    <SelectItem value="pixel-art">Pixel Art</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-muted-foreground">
                  {t("imageStudio.aspectRatio", undefined, "Aspect Ratio")}
                </Label>
                <Select
                  value={aiAspect}
                  onValueChange={(v) => setAiAspect(v as AspectRatio)}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    <SelectItem value="4:3">4:3 (Standard)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {genStatus && (
              <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="text-xs">{genStatus}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAiDialogOpen(false)}
              className="text-xs"
            >
              {t("imageStudio.close", undefined, "Cancel")}
            </Button>
            <Button
              size="sm"
              disabled={isGenerating || !aiPrompt.trim()}
              onClick={handleGenerateAi}
              className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              <span>{t("imageStudio.generate", undefined, "Generate & Insert")}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
