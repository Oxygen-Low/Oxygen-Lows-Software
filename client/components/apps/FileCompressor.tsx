import { useState } from "react";
import {
  FileBox,
  Settings2,
  Zap,
  CheckCircle2,
  ArrowRight,
  File,
  Trash2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import imageCompression from "browser-image-compression";

export function FileCompressorApp() {
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [quality, setQuality] = useState(70);
  const [targetSizeMB, setTargetSizeMB] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    originalSize: number;
    newSize: number;
    name: string;
  } | null>(null);

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
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("Storage")
        .download(selectedFile.name);

      if (downloadError) throw downloadError;

      let compressedBlob: Blob;

      if (selectedFile.metadata.mimetype.startsWith("image/")) {
        const options = {
          maxSizeMB: targetSizeMB ? parseFloat(targetSizeMB) : 10,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          initialQuality: quality / 100,
          onProgress: (p: number) => setProgress(p),
        };
        compressedBlob = await imageCompression(fileData as File, options);
      } else if (selectedFile.metadata.mimetype.startsWith("audio/")) {
        // FFmpeg.wasm would be better for audio, but for now we'll just mock it or skip
        // In a real app, you'd use @ffmpeg/ffmpeg
        throw new Error(
          "Audio compression is not yet implemented in this demo.",
        );
      } else {
        throw new Error("Unsupported file type");
      }

      // Upload the compressed version back (overwriting or new name)
      const newPath = selectedFile.name.replace(/(\.[^.]+)$/, `_compressed$1`);
      const { error: uploadError } = await supabase.storage
        .from("Storage")
        .upload(newPath, compressedBlob, { upsert: true });

      if (uploadError) throw uploadError;

      setResult({
        originalSize: selectedFile.metadata.size,
        newSize: compressedBlob.size,
        name: selectedFile.name,
      });
      toast.success("Success");
    } catch (error: any) {
      console.error("Compression error:", error);
      toast.error(error.message || "Error");
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
                      <span className="font-medium text-white">
                        {selectedFile.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatSize(selectedFile.metadata.size)}
                      </span>
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
                    <p className="text-sm font-medium text-white">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatSize(selectedFile.metadata.size)} •{" "}
                      {selectedFile.metadata.mimetype}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedFile(null)}
                  className="text-slate-500 hover:text-red-500"
                  aria-label="Delete File"
                  title="Delete File"
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
              Adjust quality and target size.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label className="text-white">Quality</Label>
                <span className="text-cyan-400 text-sm font-medium">
                  {quality}%
                </span>
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
                      quality === q &&
                        "bg-cyan-500/10 text-cyan-400 border-cyan-500/50",
                    )}
                  >
                    {q}%
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-white">Target Size (MB, optional)</Label>
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
            </div>

            <Button
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold h-12"
              disabled={!selectedFile || compressing}
              onClick={handleCompress}
            >
              {compressing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Compressing your file... {progress > 0 ? `${progress}%` : ""}
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
                    <span className="text-2xl font-bold text-white">
                      {progress}%
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-white font-medium">
                    Compressing your file...
                  </p>
                  <p className="text-slate-500 text-sm">
                    This may take a moment depending on the file size.
                  </p>
                  <Progress value={progress} className="h-2 bg-slate-800" />
                </div>
              </div>
            ) : result ? (
              <div className="w-full space-y-8 p-6">
                <div className="p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
                  <CheckCircle2 className="w-16 h-16 text-cyan-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Success
                  </h3>
                  <p className="text-slate-400">
                    File has been compressed and updated in storage.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Original Size</span>
                    <span className="text-white font-medium">
                      {formatSize(result.originalSize)}
                    </span>
                  </div>
                  <ArrowRight className="w-6 h-6 text-slate-700 mx-auto" />
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-cyan-500/30">
                    <span className="text-slate-400">New Size</span>
                    <div className="text-right">
                      <span className="text-cyan-400 font-bold block">
                        {formatSize(result.newSize)}
                      </span>
                      <span className="text-xs text-green-500 font-medium">
                        {`Saved ${Math.round((1 - result.newSize / result.originalSize) * 100)}%`}
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
                <p className="text-lg font-medium text-slate-400">
                  Ready to compress
                </p>
                <p className="max-w-[250px] mx-auto">
                  Select a file and adjust settings to see results here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
