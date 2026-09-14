import { useState, useRef, useEffect } from "react";
import {
  Scissors,
  CheckCircle2,
  Trash2,
  Loader2,
  Download,
  UploadCloud,
  MonitorUp,
  Play,
  Pause,
  RotateCcw,
  Film,
  Music,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { fetchFile, toBlobURL } from "@ffmpeg/util";
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
    const instance = new FFmpeg();
    const cdnBaseUrls = [
      "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm",
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
    ];

    let lastError: any = null;
    for (const baseURL of cdnBaseUrls) {
      try {
        const coreURL = await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript",
        );
        const wasmURL = await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm",
        );
        await instance.load({
          coreURL,
          wasmURL,
        });
        if (instance.loaded) {
          ffmpegInstance = instance;
          return instance;
        }
      } catch (err) {
        console.warn(`[FFmpeg] Failed to load from ${baseURL}:`, err);
        lastError = err;
      }
    }

    try {
      await instance.load();
      ffmpegInstance = instance;
      return instance;
    } catch (err) {
      ffmpegLoadPromise = null;
      throw lastError || err;
    }
  })();

  return ffmpegLoadPromise;
};

const SUPPORTED_FORMATS = {
  audio: ["mp3", "wav", "aac", "ogg", "m4a", "flac", "aiff"],
  video: ["mp4", "webm", "mov", "mkv", "avi"],
};

const formatSeconds = (sec: number): string => {
  if (isNaN(sec) || sec < 0) return "00:00.0";
  const minutes = Math.floor(sec / 60);
  const remainingSec = (sec % 60).toFixed(1);
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds =
    remainingSec.indexOf(".") === 1
      ? `0${remainingSec}`
      : remainingSec;
  return `${paddedMinutes}:${paddedSeconds}`;
};

export function FileTrimmerApp() {
  const { session } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"audio" | "video" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [targetFormat, setTargetFormat] = useState<string>("");

  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const [progress, setProgress] = useState(0);

  const [trimmedUrl, setTrimmedUrl] = useState<string | null>(null);
  const [trimmedBlob, setTrimmedBlob] = useState<Blob | null>(null);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount or file reset
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);
    };
  }, [previewUrl, trimmedUrl]);

  const determineFileType = (
    filename: string,
    mimeType: string,
  ): "audio" | "video" | null => {
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (SUPPORTED_FORMATS.audio.includes(ext)) return "audio";
    if (SUPPORTED_FORMATS.video.includes(ext)) return "video";

    return null;
  };

  const handleFileSelect = (selectedFile: File) => {
    const type = determineFileType(selectedFile.name, selectedFile.type);
    if (!type) {
      toast.error("Unsupported file type. Please select an Audio or Video file.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);

    const url = URL.createObjectURL(selectedFile);
    const ext = selectedFile.name.split(".").pop()?.toLowerCase() || (type === "video" ? "mp4" : "mp3");

    setFile(selectedFile);
    setStoragePath(null);
    setFileType(type);
    setPreviewUrl(url);
    setTargetFormat(ext);
    setDuration(0);
    setStartTime(0);
    setEndTime(0);
    setCurrentTime(0);
    setTrimmedUrl(null);
    setTrimmedBlob(null);
    setProgress(0);
    setIsPlayingPreview(false);
  };

  const handleStorageFileSelect = async (storageFile: any) => {
    try {
      setIsTrimming(true);
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
        toast.error("Unsupported file type. Please select an Audio or Video file.");
        setIsTrimming(false);
        return;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);

      const url = URL.createObjectURL(fileFromBlob);
      const ext = storageFile.name.split(".").pop()?.toLowerCase() || (type === "video" ? "mp4" : "mp3");

      setFile(fileFromBlob);
      setStoragePath(storageFile.name);
      setFileType(type);
      setPreviewUrl(url);
      setTargetFormat(ext);
      setDuration(0);
      setStartTime(0);
      setEndTime(0);
      setCurrentTime(0);
      setTrimmedUrl(null);
      setTrimmedBlob(null);
      setProgress(0);
      setIsPlayingPreview(false);
      toast.dismiss();
      toast.success("File loaded from storage");
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to load file from storage");
      console.error(error);
    } finally {
      setIsTrimming(false);
    }
  };

  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      const mediaDur = mediaRef.current.duration;
      if (!isNaN(mediaDur) && mediaDur > 0) {
        const roundedDur = Math.round(mediaDur * 10) / 10;
        setDuration(roundedDur);
        setEndTime(roundedDur);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      const curr = mediaRef.current.currentTime;
      setCurrentTime(curr);

      // If playing a preview cut, stop when reached endTime
      if (isPlayingPreview && curr >= endTime) {
        mediaRef.current.pause();
        setIsPlayingPreview(false);
      }
    }
  };

  const togglePreviewCut = () => {
    if (!mediaRef.current) return;
    if (isPlayingPreview) {
      mediaRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      mediaRef.current.currentTime = startTime;
      mediaRef.current
        .play()
        .then(() => setIsPlayingPreview(true))
        .catch(() => setIsPlayingPreview(false));
    }
  };

  const setStartToCurrent = () => {
    if (!mediaRef.current) return;
    const curr = Math.min(Math.round(mediaRef.current.currentTime * 10) / 10, endTime);
    setStartTime(curr);
  };

  const setEndToCurrent = () => {
    if (!mediaRef.current) return;
    const curr = Math.max(Math.round(mediaRef.current.currentTime * 10) / 10, startTime);
    setEndTime(curr);
  };

  const trimFile = async () => {
    if (!file || !fileType) return;
    if (startTime >= endTime) {
      toast.error("Start time must be less than end time.");
      return;
    }

    setIsTrimming(true);
    setProgress(0);
    setTrimmedUrl(null);
    setTrimmedBlob(null);
    toast.loading("Trimming file with WebAssembly FFmpeg...");

    let ffmpegRef: FFmpeg | null = null;
    const progressCallback = ({ progress }: { progress: number }) => {
      setProgress(Math.round(Math.max(0, Math.min(1, progress)) * 100));
    };

    try {
      const ffmpeg = await loadFfmpeg();
      ffmpegRef = ffmpeg;
      ffmpeg.on("progress", progressCallback);

      const ext = file.name.split(".").pop() || (fileType === "video" ? "mp4" : "mp3");
      const outExt = targetFormat || ext;
      const inputName = `input_${Date.now()}.${ext}`;
      const outputName = `output_${Date.now()}.${outExt}`;

      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const startStr = startTime.toFixed(2);
      const endStr = endTime.toFixed(2);

      let success = false;

      // Try fast stream copy first if same container
      if (outExt.toLowerCase() === ext.toLowerCase()) {
        try {
          await ffmpeg.exec([
            "-ss",
            startStr,
            "-to",
            endStr,
            "-i",
            inputName,
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            outputName,
          ]);
          success = true;
        } catch (copyErr) {
          console.warn("Stream copy trimming failed, falling back to transcode:", copyErr);
        }
      }

      // If stream copy was not attempted or failed, re-encode
      if (!success) {
        const transcodeArgs = [
          "-ss",
          startStr,
          "-to",
          endStr,
          "-i",
          inputName,
        ];

        if (fileType === "video") {
          transcodeArgs.push("-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac");
        }

        transcodeArgs.push(outputName);
        await ffmpeg.exec(transcodeArgs);
      }

      const data = await ffmpeg.readFile(outputName);

      // Clean up files in FFmpeg FS
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (cleanupErr) {
        console.warn("FFmpeg cleanup:", cleanupErr);
      }

      let mimeType = "application/octet-stream";
      if (fileType === "audio") mimeType = `audio/${outExt}`;
      else if (fileType === "video") mimeType = `video/${outExt}`;

      const resBlob = new Blob([new Uint8Array(data as unknown as ArrayBuffer)], {
        type: mimeType,
      });
      const url = URL.createObjectURL(resBlob);

      if (trimmedUrl) {
        URL.revokeObjectURL(trimmedUrl);
      }

      setTrimmedBlob(resBlob);
      setTrimmedUrl(url);

      // If loaded from storage, replace or save
      if (storagePath && session?.user) {
        toast.loading("Saving trimmed file to storage...");
        const baseName = storagePath.replace(/\.[^/.]+$/, "");
        const newFilename = `${baseName}_trimmed.${outExt}`;

        const uploadRes = await storage.upload("Storage", newFilename, resBlob);
        if (uploadRes.error) {
          toast.dismiss();
          toast.error("Failed to save trimmed file to storage.");
        } else {
          toast.dismiss();
          toast.success("Trimmed file saved to storage!");
        }
      } else {
        toast.dismiss();
        toast.success("Trimming complete!");
      }
    } catch (error) {
      console.error(error);
      toast.dismiss();
      toast.error("An error occurred while trimming the file.");
    } finally {
      if (ffmpegRef) {
        ffmpegRef.off("progress", progressCallback);
      }
      setIsTrimming(false);
      setProgress(0);
    }
  };

  const handleDownload = () => {
    if (!trimmedUrl || !file) return;
    const a = document.createElement("a");
    a.href = trimmedUrl;
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const ext = targetFormat || file.name.split(".").pop() || "mp4";
    a.download = `${baseName}_trimmed.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);

    setFile(null);
    setStoragePath(null);
    setFileType(null);
    setPreviewUrl(null);
    setTrimmedUrl(null);
    setTrimmedBlob(null);
    setDuration(0);
    setStartTime(0);
    setEndTime(0);
    setCurrentTime(0);
    setProgress(0);
    setIsPlayingPreview(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const trimDuration = Math.max(0, endTime - startTime);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl">
              <Scissors className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-xl text-white">File Trimmer</CardTitle>
              <CardDescription className="text-slate-400">
                Trim Audio and Video files locally in your browser.
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
                <label className="block border-2 border-dashed border-slate-700 rounded-xl p-12 text-center hover:bg-slate-800/50 transition-colors cursor-pointer group">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,video/*"
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
                    Supports Audio (MP3, WAV, AAC, OGG, M4A, FLAC) and Video (MP4, WebM, MOV, MKV, AVI)
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
                      Trimmed files can be saved directly back to your storage
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
              {/* File details banner */}
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-cyan-500/10 rounded-lg shrink-0">
                    {fileType === "video" ? (
                      <Film className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <Music className="w-5 h-5 text-cyan-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • {fileType?.toUpperCase()}
                      {duration > 0 && ` • Duration: ${formatSeconds(duration)}`}
                      {storagePath && " (Storage)"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearFile}
                  className="shrink-0 text-slate-400 hover:text-red-400"
                  disabled={isTrimming}
                  aria-label="Remove file"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {!trimmedUrl ? (
                <div className="space-y-6">
                  {/* Media Preview Player */}
                  {previewUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-700 bg-black/60 p-2 flex flex-col items-center justify-center">
                      {fileType === "video" ? (
                        <video
                          ref={mediaRef as React.RefObject<HTMLVideoElement>}
                          src={previewUrl}
                          controls
                          className="w-full max-h-[360px] rounded-lg"
                          onLoadedMetadata={handleLoadedMetadata}
                          onTimeUpdate={handleTimeUpdate}
                        />
                      ) : (
                        <div className="w-full py-6 px-4 flex flex-col items-center gap-3">
                          <Music className="w-12 h-12 text-cyan-400/80 animate-pulse" />
                          <audio
                            ref={mediaRef as React.RefObject<HTMLAudioElement>}
                            src={previewUrl}
                            controls
                            className="w-full"
                            onLoadedMetadata={handleLoadedMetadata}
                            onTimeUpdate={handleTimeUpdate}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Trimming Timeline & Controls */}
                  <div className="space-y-4 p-5 rounded-xl bg-slate-800/40 border border-slate-700/80">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        Trim Interval
                      </span>
                      <div className="text-xs text-slate-400 flex items-center gap-4">
                        <span>Current: <strong className="text-cyan-300">{formatSeconds(currentTime)}</strong></span>
                        <span>Length: <strong className="text-emerald-400">{formatSeconds(trimDuration)}</strong></span>
                      </div>
                    </div>

                    {/* Timeline progress range bar */}
                    {duration > 0 && (
                      <div className="relative w-full h-3 bg-slate-700/60 rounded-full overflow-hidden">
                        <div
                          className="absolute h-full bg-cyan-500/30"
                          style={{
                            left: `${(startTime / duration) * 100}%`,
                            width: `${(trimDuration / duration) * 100}%`,
                          }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-white"
                          style={{
                            left: `${(currentTime / duration) * 100}%`,
                          }}
                        />
                      </div>
                    )}

                    {/* Start and End Time Input Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Start Time */}
                      <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="start-time" className="text-xs font-semibold text-slate-300">
                            Start Time (seconds)
                          </Label>
                          <span className="text-xs text-cyan-400 font-mono">
                            {formatSeconds(startTime)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            id="start-time"
                            type="number"
                            min="0"
                            max={endTime}
                            step="0.1"
                            value={startTime}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setStartTime(Math.max(0, Math.min(val, endTime)));
                            }}
                            disabled={isTrimming}
                            className="bg-slate-800 border-slate-700 text-white"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={setStartToCurrent}
                            disabled={isTrimming}
                            title="Set start to current playback time"
                            className="shrink-0 text-xs"
                          >
                            Set Current
                          </Button>
                        </div>
                      </div>

                      {/* End Time */}
                      <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="end-time" className="text-xs font-semibold text-slate-300">
                            End Time (seconds)
                          </Label>
                          <span className="text-xs text-cyan-400 font-mono">
                            {formatSeconds(endTime)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            id="end-time"
                            type="number"
                            min={startTime}
                            max={duration || 99999}
                            step="0.1"
                            value={endTime}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setEndTime(Math.max(startTime, duration ? Math.min(val, duration) : val));
                            }}
                            disabled={isTrimming}
                            className="bg-slate-800 border-slate-700 text-white"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={setEndToCurrent}
                            disabled={isTrimming}
                            title="Set end to current playback time"
                            className="shrink-0 text-xs"
                          >
                            Set Current
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Preview Cut Button & Format selection */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={togglePreviewCut}
                        disabled={isTrimming || startTime >= endTime}
                        className="border-slate-700 hover:bg-slate-800 text-slate-200"
                      >
                        {isPlayingPreview ? (
                          <>
                            <Pause className="w-4 h-4 mr-2 text-amber-400" />
                            Pause Preview
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2 text-cyan-400" />
                            Preview Cut ({formatSeconds(startTime)} - {formatSeconds(endTime)})
                          </>
                        )}
                      </Button>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Output Format:</span>
                        <Select
                          value={targetFormat}
                          onValueChange={setTargetFormat}
                          disabled={isTrimming}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs bg-slate-800 border-slate-700">
                            <SelectValue placeholder="Format" />
                          </SelectTrigger>
                          <SelectContent>
                            {(fileType === "video"
                              ? SUPPORTED_FORMATS.video
                              : SUPPORTED_FORMATS.audio
                            ).map((fmt) => (
                              <SelectItem key={fmt} value={fmt}>
                                {fmt.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Trimming Progress or Action Button */}
                  {isTrimming ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-slate-400">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          Trimming media...
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={trimFile}
                      disabled={startTime >= endTime}
                    >
                      <Scissors className="w-4 h-4 mr-2" />
                      Trim File ({formatSeconds(trimDuration)})
                    </Button>
                  )}
                </div>
              ) : (
                /* Trimming Complete Screen */
                <div className="p-6 bg-cyan-500/5 rounded-xl border border-cyan-500/20 text-center space-y-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-white mb-1">
                      Trimming Complete
                    </h4>
                    <p className="text-sm text-slate-400">
                      {storagePath && session?.user
                        ? "Trimmed file has been saved to your storage."
                        : "Your trimmed media file is ready to download."}
                    </p>
                  </div>

                  {/* Playback of trimmed result */}
                  <div className="rounded-xl overflow-hidden border border-slate-700 bg-black/60 p-2 my-4 max-w-xl mx-auto">
                    {fileType === "video" ? (
                      <video
                        src={trimmedUrl}
                        controls
                        className="w-full max-h-[300px] rounded-lg"
                      />
                    ) : (
                      <div className="py-4 px-2">
                        <audio src={trimmedUrl} controls className="w-full" />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center gap-3 pt-2">
                    <Button onClick={handleDownload}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Trimmed File
                    </Button>
                    <Button variant="outline" onClick={clearFile}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Trim Another
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
