import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import {
  FileBox,
  Settings2,
  ArrowRight,
  Zap,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  File
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function FileCompressorApp() {
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [quality, setQuality] = useState(70);
  const [targetSizeMB, setTargetSizeMB] = useState<string>("");
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ originalSize: number; newSize: number; name: string } | null>(null);

  const ffmpegRef = useRef(new FFmpeg());
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const loadingPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    if (ffmpegLoaded) return;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
    const ffmpeg = ffmpegRef.current;

    ffmpeg.on("log", ({ message }) => {
      console.log(message);
    });

    ffmpeg.on("progress", ({ progress }) => {
      setProgress(Math.round(progress * 100));
    });

    loadingPromiseRef.current = (async () => {
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        setFfmpegLoaded(true);
      } catch (error) {
        console.error("FFmpeg load error:", error);
        loadingPromiseRef.current = null;
        throw error;
      }
    })();

    return loadingPromiseRef.current;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleCompress = async () => {
    if (!selectedFile) return;
    setCompressing(true);
    setProgress(0);
    setResult(null);

    try {
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from("Storage")
        .download(selectedFile.name);

      if (downloadError) throw downloadError;

      let compressedBlob: Blob;
      const mimetype = selectedFile.metadata?.mimetype || "";

      if (mimetype.startsWith("image/")) {
        const options = {
          maxSizeMB: targetSizeMB ? parseFloat(targetSizeMB) : (selectedFile.metadata.size / 1024 / 1024) * (quality / 100),
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          initialQuality: quality / 100,
          onProgress: (p: number) => setProgress(p),
        };
        compressedBlob = await imageCompression(fileBlob as any, options);
      } else if (mimetype.startsWith("audio/")) {
        try {
          await loadFFmpeg();
        } catch (error) {
          throw new Error("Failed to load FFmpeg. Please check your internet connection and CSP settings.");
        }

        const ffmpeg = ffmpegRef.current;
        const extension = selectedFile.name.split(".").pop();
        const inputName = `input.${extension}`;
        const outputName = `output.${extension}`;

        await ffmpeg.writeFile(inputName, await fetchFile(fileBlob));

        // Simple compression: adjust bitrate based on quality
        // 100% -> 320k, 70% -> 128k, 30% -> 64k
        const bitrate = Math.round((quality / 100) * 320);

        await ffmpeg.exec(["-i", inputName, "-b:a", `${bitrate}k`, outputName]);

        const data = await ffmpeg.readFile(outputName);
        compressedBlob = new Blob([data as any], { type: mimetype });
      } else {
        throw new Error("Unsupported file type for compression");
      }

      // Delete original
      const { error: deleteError } = await supabase.storage
        .from("Storage")
        .remove([selectedFile.name]);

      if (deleteError) throw deleteError;

      // Upload compressed
      const { error: uploadError } = await supabase.storage
        .from("Storage")
        .upload(selectedFile.name, compressedBlob, {
          contentType: mimetype,
          upsert: false
        });

      if (uploadError) throw uploadError;

      setResult({
        originalSize: selectedFile.metadata.size,
        newSize: compressedBlob.size,
        name: selectedFile.name
      });
      toast.success("File compressed successfully!");
    } catch (error: any) {
      console.error("Compression error:", error);
      toast.error(error.message || "Failed to compress file");
    } finally {
      setCompressing(false);
      setProgress(0);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileBox className="w-5 h-5 text-cyan-500" />
              Source File
            </CardTitle>
            <CardDescription className="text-slate-400">
              Select a file from your storage to compress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StorageFileSelector
              onSelect={setSelectedFile}
              allowedTypes={["image", "audio"]}
              trigger={
                <Button
                  variant="outline"
                  className="w-full h-24 border-dashed border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white flex flex-col gap-2"
                >
                  {selectedFile ? (
                    <>
                      <File className="w-8 h-8 text-cyan-500" />
                      <span className="font-medium text-white">{selectedFile.name}</span>
                      <span className="text-xs text-slate-500">{formatSize(selectedFile.metadata.size)}</span>
                    </>
                  ) : (
                    <>
                      <FileBox className="w-8 h-8 opacity-50" />
                      <span>Click to select from storage</span>
                    </>
                  )}
                </Button>
              }
            />
            {selectedFile && (
              <div className="flex justify-between items-center p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-900 rounded">
                    <File className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(selectedFile.metadata.size)} • {selectedFile.metadata.mimetype}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedFile(null)}
                  className="text-slate-500 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-cyan-500" />
              Compression Settings
            </CardTitle>
            <CardDescription className="text-slate-400">
              Adjust the quality and target size.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label className="text-white">Quality Preset</Label>
                <span className="text-cyan-400 text-sm font-medium">{quality}%</span>
              </div>
              <Slider
                value={[quality]}
                onValueChange={(vals) => setQuality(vals[0])}
                min={10}
                max={100}
                step={1}
                className="py-4"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[30, 50, 70, 90].map((q) => (
                  <Button
                    key={q}
                    variant="secondary"
                    size="sm"
                    onClick={() => setQuality(q)}
                    className={cn(
                      "bg-slate-950 border-slate-800 text-slate-400 hover:text-white",
                      quality === q && "bg-cyan-500/10 text-cyan-400 border-cyan-500/50"
                    )}
                  >
                    {q}%
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-white">Target Size (Optional MB)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="e.g. 0.5"
                  value={targetSizeMB}
                  onChange={(e) => setTargetSizeMB(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white"
                />
                <Button
                  variant="ghost"
                  onClick={() => setTargetSizeMB("")}
                  className="text-slate-500"
                >
                  Clear
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                If provided, we will attempt to compress the file to be under this size.
              </p>
            </div>

            <Button
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold h-12"
              disabled={!selectedFile || compressing}
              onClick={handleCompress}
            >
              {compressing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Compressing... {progress > 0 ? `${progress}%` : ""}
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Start Compression
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800 h-full">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-cyan-500" />
              Status & Results
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center min-h-[300px] text-center">
            {compressing ? (
              <div className="w-full space-y-6 px-12">
                <div className="relative h-32 w-32 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-cyan-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{progress}%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-white font-medium">Compressing your file...</p>
                  <p className="text-slate-500 text-sm">This may take a moment depending on the file size.</p>
                  <Progress value={progress} className="h-2 bg-slate-800" />
                </div>
              </div>
            ) : result ? (
              <div className="w-full space-y-8 p-6">
                <div className="p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
                  <CheckCircle2 className="w-16 h-16 text-cyan-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-white mb-2">Success!</h3>
                  <p className="text-slate-400">File has been compressed and updated in storage.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Original Size</span>
                    <span className="text-white font-medium">{formatSize(result.originalSize)}</span>
                  </div>
                  <ArrowRight className="w-6 h-6 text-slate-700 mx-auto" />
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-cyan-500/30">
                    <span className="text-slate-400">New Size</span>
                    <div className="text-right">
                      <span className="text-cyan-400 font-bold block">{formatSize(result.newSize)}</span>
                      <span className="text-xs text-green-500 font-medium">
                        -{Math.round((1 - result.newSize / result.originalSize) * 100)}% saved
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                  onClick={() => {
                    setResult(null);
                    setSelectedFile(null);
                  }}
                >
                  Compress Another File
                </Button>
              </div>
            ) : (
              <div className="text-slate-500 space-y-4">
                <div className="p-8 bg-slate-950 rounded-full mb-4">
                  <AlertCircle className="w-12 h-12 opacity-20" />
                </div>
                <p className="text-lg font-medium text-slate-400">Ready to compress</p>
                <p className="max-w-[250px] mx-auto">
                  Select a file and adjust settings to see the results here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
