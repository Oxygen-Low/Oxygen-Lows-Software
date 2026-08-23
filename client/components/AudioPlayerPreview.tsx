import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { storage } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface AudioPlayerPreviewProps {
  src?: string;
  filePath?: string;
  bucket?: string;
  fileName?: string;
  className?: string;
  autoPlay?: boolean;
}

export function AudioPlayerPreview({
  src,
  filePath,
  bucket = "Storage",
  fileName,
  className,
  autoPlay = false,
}: AudioPlayerPreviewProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(src || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Resolve audio URL from props or Supabase
  const resolveAudioUrl = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    // If src is already provided and valid, try it first
    if (src && src.startsWith("http")) {
      setAudioUrl(src);
      setIsLoading(false);
      return;
    }

    if (!filePath && !fileName) {
      setIsLoading(false);
      return;
    }

    try {
      const cleanPath = (filePath || fileName || "").replace(/^\/+/, "");

      // 1. Try to create signed URL from the specified bucket
      const { data: signedData, error: signedErr } = await storage
        .from(bucket)
        .createSignedUrl(cleanPath, 3600)
        .catch(() => ({ data: null, error: true }));

      if (!signedErr && signedData?.signedUrl) {
        setAudioUrl(signedData.signedUrl);
        return;
      }

      // 2. If signed URL fails or for public bucket, try public URL
      if (bucket === "public-assets") {
        const { data: pubData } = storage
          .from("public-assets")
          .getPublicUrl(cleanPath);
        if (pubData?.publicUrl) {
          setAudioUrl(pubData.publicUrl);
          return;
        }
      }

      // 3. Fallback: Download file as Blob and create Blob URL
      const { data: blobData, error: downloadErr } = await storage
        .from(bucket)
        .download(cleanPath);

      if (!downloadErr && blobData) {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const blobUrl = URL.createObjectURL(blobData);
        blobUrlRef.current = blobUrl;
        setAudioUrl(blobUrl);
        return;
      }

      throw new Error("Unable to load audio file");
    } catch (err) {
      console.warn(
        "AudioPreview resolution failed, attempting blob fallback:",
        err,
      );
      // Try blob download fallback directly
      if (filePath || fileName) {
        try {
          const cleanPath = (filePath || fileName || "").replace(/^\/+/, "");
          const { data: blobData } = await storage
            .from(bucket)
            .download(cleanPath);
          if (blobData) {
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            const blobUrl = URL.createObjectURL(blobData);
            blobUrlRef.current = blobUrl;
            setAudioUrl(blobUrl);
            return;
          }
        } catch {
          // ignore
        }
      }
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [src, filePath, bucket, fileName]);

  useEffect(() => {
    resolveAudioUrl();
  }, [resolveAudioUrl]);

  // Audio element events
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      if (!isNaN(dur) && isFinite(dur)) {
        setDuration(dur);
      }
    }
    setIsLoading(false);
    setHasError(false);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleAudioError = async () => {
    // If audio element failed to load the HTTP signed URL (e.g. CORS/Range/403), fallback to blob download
    if (audioUrl && !audioUrl.startsWith("blob:") && (filePath || fileName)) {
      try {
        const cleanPath = (filePath || fileName || "").replace(/^\/+/, "");
        const { data: blobData, error: downloadErr } = await storage
          .from(bucket)
          .download(cleanPath);

        if (!downloadErr && blobData) {
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          const blobUrl = URL.createObjectURL(blobData);
          blobUrlRef.current = blobUrl;
          setAudioUrl(blobUrl);
          setHasError(false);
          return;
        }
      } catch {
        // ignore
      }
    }
    setIsLoading(false);
    setHasError(true);
    setIsPlaying(false);
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || hasError || isLoading) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn("Audio play failed:", err);
          handleAudioError();
        });
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div
      className={cn(
        "w-full bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2 select-none shadow-sm",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin="anonymous"
          preload="metadata"
          autoPlay={autoPlay}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={handleAudioError}
          onCanPlay={() => setIsLoading(false)}
        />
      )}

      {hasError ? (
        <div className="flex items-center justify-between text-xs text-rose-400 py-1">
          <div className="flex items-center gap-1.5 truncate">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Audio unavailable</span>
          </div>
          <button
            type="button"
            onClick={resolveAudioUrl}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
            title="Retry loading audio"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePlay}
              disabled={isLoading}
              className="w-8 h-8 rounded-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white flex items-center justify-center transition-transform active:scale-95 shrink-0 shadow-sm"
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                disabled={isLoading || duration === 0}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                aria-label="Seek audio"
              />
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
