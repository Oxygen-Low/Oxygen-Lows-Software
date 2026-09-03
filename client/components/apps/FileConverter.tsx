import { useState, useRef, useEffect } from "react";
import {
  FileBox,
  Settings2,
  Zap,
  CheckCircle2,
  ArrowRight,
  File as FileIcon,
  Trash2,
  AlertCircle,
  Loader2,
  Download,
  UploadCloud,
  MonitorUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { storage } from "@/lib/storage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { useAuth } from "@/hooks/useAuth";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

const loadFfmpeg = async (): Promise<FFmpeg> => {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  if (ffmpegLoadPromise) {
    return ffmpegLoadPromise;
  }

  ffmpegLoadPromise = (async () => {
    try {
      const instance = new FFmpeg();
      instance.on("log", ({ message }) => console.log(message));
      await instance.load();
      ffmpegInstance = instance;
      return instance;
    } catch (err) {
      ffmpegLoadPromise = null;
      throw err;
    }
  })();

  return ffmpegLoadPromise;
};

const FORMATS = {
  image: ["png", "jpeg", "webp", "tiff", "bmp", "ico", "svg", "eps"],
  audio: ["wav", "aiff", "flac", "alac", "mp3", "aac", "ogg"],
  video: ["mp4", "mov", "webm", "avi", "mkv"],
};

export function FileConverterApp() {
  const { session } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [targetFormat, setTargetFormat] = useState<string>("");
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  const [fileType, setFileType] = useState<"image" | "audio" | "video" | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (convertedUrl) {
        URL.revokeObjectURL(convertedUrl);
      }
    };
  }, [convertedUrl]);

  const getAvailableFormats = (type: "image" | "audio" | "video" | null) => {
    if (!type) return [];
    return FORMATS[type];
  };

  const determineFileType = (
    filename: string,
    mimeType: string,
  ): "image" | "audio" | "video" | null => {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (FORMATS.image.includes(ext) || ext === "jpg") return "image";
    if (FORMATS.audio.includes(ext) || ext === "m4a") return "audio";
    if (FORMATS.video.includes(ext)) return "video";

    return null;
  };

  const handleFileSelect = (selectedFile: File) => {
    const type = determineFileType(selectedFile.name, selectedFile.type);
    if (!type) {
      toast.error("Unsupported file type");
      return;
    }
    setFile(selectedFile);
    setStoragePath(null);
    setFileType(type);
    setTargetFormat(FORMATS[type][0]);
    setConvertedUrl(null);
    setConvertedBlob(null);
    setProgress(0);
  };

  const handleStorageFileSelect = async (storageFile: any) => {
    try {
      setIsConverting(true);
      toast.loading("Downloading file from storage...");

      const res = await storage.download("Storage", storageFile.name);
      if (res.error) throw res.error;

      const blob = res.data;
      if (!blob) throw new Error("No data received");

      const fileFromBlob = new File([blob], storageFile.name, {
        type: blob.type || "application/octet-stream",
      });

      const type = determineFileType(storageFile.name, blob.type);
      if (!type) {
        toast.dismiss();
        toast.error("Unsupported file type");
        setIsConverting(false);
        return;
      }

      setFile(fileFromBlob);
      setStoragePath(storageFile.name);
      setFileType(type);
      setTargetFormat(FORMATS[type][0]);
      setConvertedUrl(null);
      setConvertedBlob(null);
      setProgress(0);
      toast.dismiss();
      toast.success("File loaded from storage");
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to load file from storage");
      console.error(error);
    } finally {
      setIsConverting(false);
    }
  };

  const convertFile = async () => {
    if (!file || !targetFormat || !fileType) return;

    // Handle unsupported formats
    if (targetFormat === "svg" || targetFormat === "eps") {
      toast.error("Converting to SVG/EPS is currently a work in progress.");
      return;
    }

    setIsConverting(true);
    setProgress(0);
    setConvertedUrl(null);
    setConvertedBlob(null);
    toast.loading(`Converting to ${targetFormat.toUpperCase()}...`);

    let ffmpegRef: FFmpeg | null = null;
    const progressCallback = ({ progress }: { progress: number }) => {
      setProgress(Math.round(progress * 100));
    };

    try {
      const ffmpeg = await loadFfmpeg();
      ffmpegRef = ffmpeg;

      ffmpeg.on("progress", progressCallback);

      const inputName = `input.${file.name.split(".").pop()}`;
      const outputName = `output.${targetFormat}`;

      await ffmpeg.writeFile(inputName, await fetchFile(file));

      let ffmpegArgs: string[] = ["-i", inputName];

      if (fileType === "audio") {
        if (targetFormat === "alac") {
          ffmpegArgs.push("-acodec", "alac");
          // alac goes into m4a container generally
        }
      }

      ffmpegArgs.push(outputName);

      await ffmpeg.exec(ffmpegArgs);

      const data = await ffmpeg.readFile(outputName);

      // Determine MIME type
      let mimeType = "application/octet-stream";
      if (fileType === "image")
        mimeType = `image/${targetFormat === "jpg" ? "jpeg" : targetFormat}`;
      else if (fileType === "audio") mimeType = `audio/${targetFormat}`;
      else if (fileType === "video") mimeType = `video/${targetFormat}`;

      const convertedBlob = new Blob(
        [new Uint8Array(data as unknown as ArrayBuffer)],
        { type: mimeType },
      );
      const url = URL.createObjectURL(convertedBlob);

      if (convertedUrl) {
        URL.revokeObjectURL(convertedUrl);
      }

      setConvertedBlob(convertedBlob);
      setConvertedUrl(url);

      // If it was a storage file, automatically upload and replace
      if (storagePath && session && session.user) {
        toast.loading("Replacing file in storage...");
        const newFilename =
          storagePath.replace(/\.[^/.]+$/, "") + `.${targetFormat}`;

        const uploadRes = await storage.upload(
          "Storage",
          newFilename,
          convertedBlob,
        );

        if (uploadRes.error) {
          toast.dismiss();
          toast.error("Failed to save converted file to storage");

          if (convertedUrl) {
            URL.revokeObjectURL(convertedUrl);
          }
          setConvertedUrl(null);
          setConvertedBlob(null);
        } else {
          // Only remove old if extension changed
          if (storagePath !== newFilename) {
            await storage.remove("Storage", [storagePath]);
          }

          toast.dismiss();
          toast.success("File converted and saved to storage!");
          setStoragePath(newFilename);
        }
      } else {
        toast.dismiss();
        toast.success("Conversion complete!");
      }
    } catch (error) {
      console.error(error);
      toast.dismiss();
      toast.error("An error occurred during conversion.");
    } finally {
      if (ffmpegRef) {
        ffmpegRef.off("progress", progressCallback);
      }
      setIsConverting(false);
      setProgress(0);
    }
  };

  const handleDownload = () => {
    if (!convertedUrl || !file) return;
    const a = document.createElement("a");
    a.href = convertedUrl;
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    a.download = `${baseName}.${targetFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const clearFile = () => {
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
    }
    setFile(null);
    setStoragePath(null);
    setFileType(null);
    setConvertedUrl(null);
    setConvertedBlob(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl">
              <Zap className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-xl text-white">
                File Converter
              </CardTitle>
              <CardDescription className="text-slate-400">
                Convert Images, Audio, and Video files locally in your browser.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!file ? (
            <Tabs defaultValue="local" className="w-full">
              <TabsList
                className={cn(
                  "grid w-full mb-6",
                  session ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                <TabsTrigger value="local">Local Device</TabsTrigger>
                {session ? (
                  <TabsTrigger value="storage">Storage</TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="local">
                <label
                  className="block border-2 border-dashed border-slate-700 rounded-xl p-12 text-center hover:bg-slate-800/50 transition-colors cursor-pointer group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MonitorUp className="w-8 h-8 text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Click to select a file
                  </h3>
                  <p className="text-sm text-slate-400">
                    Supports Images, Audio, and Video files
                  </p>
                </label>
              </TabsContent>

              {session ? (
                <TabsContent value="storage">
                  <div className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center flex flex-col items-center">
                    <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                      <UploadCloud className="w-8 h-8 text-cyan-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Select from Storage
                    </h3>
                    <p className="text-sm text-slate-400 mb-6">
                      Converted files will automatically replace the original in
                      storage
                    </p>
                    <StorageFileSelector
                      onSelect={handleStorageFileSelect}
                      trigger={
                        <Button variant="outline">Browse Storage</Button>
                      }
                    />
                  </div>
                </TabsContent>
              ) : null}
            </Tabs>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-cyan-500/10 rounded-lg shrink-0">
                    <FileIcon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • {fileType}
                      {storagePath && " (Storage)"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  className="shrink-0 text-slate-400 hover:text-red-400"
                  disabled={isConverting}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {!convertedUrl && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="target-format"
                      className="text-sm font-medium text-slate-300"
                    >
                      Target Format
                    </label>
                    <Select
                      value={targetFormat}
                      onValueChange={setTargetFormat}
                      disabled={isConverting}
                    >
                      <SelectTrigger id="target-format" className="w-full">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableFormats(fileType).map((fmt) => (
                          <SelectItem key={fmt} value={fmt}>
                            {fmt.toUpperCase()}
                            {(fmt === "svg" || fmt === "eps") && " (WIP)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isConverting ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-slate-400">
                        <span>Converting...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={convertFile}
                      disabled={!targetFormat}
                    >
                      Convert File
                    </Button>
                  )}
                </div>
              )}

              {convertedUrl && (
                <div className="p-6 bg-cyan-500/5 rounded-xl border border-cyan-500/20 text-center space-y-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-white mb-1">
                      Conversion Complete
                    </h4>
                    <p className="text-sm text-slate-400">
                      {storagePath && session && session.user
                        ? "File has been saved to your storage."
                        : "Your file is ready to download."}
                    </p>
                  </div>

                  <div className="flex justify-center gap-3 pt-2">
                    <Button onClick={handleDownload}>
                      <Download className="w-4 h-4 mr-2" />
                      Download File
                    </Button>
                    <Button variant="outline" onClick={clearFile}>
                      Convert Another
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
