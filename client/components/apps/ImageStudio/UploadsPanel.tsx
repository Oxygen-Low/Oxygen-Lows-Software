import React, { useState, useRef } from "react";
import { Upload, FolderOpen, Trash2, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

interface UploadedAsset {
  id: string;
  name: string;
  url: string;
  storagePath?: string;
  width: number;
  height: number;
}

interface UploadsPanelProps {
  onAddImageToCanvas: (src: string, width: number, height: number, storagePath?: string) => void;
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
          const publicUrl = storage.from("Storage").getPublicUrl(path).data.publicUrl;
          finalUrl = publicUrl;
          storagePath = path;
          toast.success(t("imageStudio.fileUploaded", undefined, "File saved to your Storage!"));
        } else {
          console.warn("Storage upload error, using local buffer:", uploadResult.error);
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
      toast.error(t("imageStudio.uploadFailed", undefined, "Failed to load image file."));
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
      const publicUrl = storage.from("Storage").getPublicUrl(file.name).data.publicUrl;
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

        const updated = [asset, ...assets.filter((a) => a.storagePath !== file.name)];
        saveAssets(updated);
        onAddImageToCanvas(publicUrl, width, height, file.name);
      };
      img.src = publicUrl;
    } catch (err) {
      toast.error(t("imageStudio.storageLoadError", undefined, "Error loading file from Storage"));
    }
  };

  const handleDeleteAsset = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = assets.filter((a) => a.id !== id);
    saveAssets(updated);
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
              {t("imageStudio.dropHelp", undefined, "Drag & drop or click to upload")}
            </p>
          </div>
        </div>

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
              <span>{t("imageStudio.browseStorage", undefined, "Browse My Storage Files")}</span>
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
          <div className="text-center py-8 text-muted-foreground border border-border/50 rounded-lg p-3 bg-card/20">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">
              {t("imageStudio.noUploadsYet", undefined, "No uploaded files yet. Upload images above to start composing!")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
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
                className="group relative aspect-square rounded-lg border border-border overflow-hidden bg-background/50 hover:border-primary/60 cursor-pointer transition-all hover:scale-[1.02]"
              >
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Delete button */}
                <button
                  onClick={(e) => handleDeleteAsset(e, asset.id)}
                  title={t("imageStudio.deleteAsset", undefined, "Remove from tray")}
                  className="absolute top-1 right-1 p-1 rounded bg-black/70 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                {/* Name Label */}
                <div className="absolute bottom-0 inset-x-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-[10px] text-white/90 truncate font-medium">
                    {asset.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
