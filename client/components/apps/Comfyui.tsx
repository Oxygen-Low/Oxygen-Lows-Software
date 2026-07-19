import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase, getAuthenticatedClient } from "@/lib/supabase";
import {
  Plus,
  Trash2,
  Mic,
  MicOff,
  Wand2,
  Image as ImageIcon,
  Loader2,
  Download,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  url?: string;
}

export function ComfyuiApp() {
  const { session } = useAuth();
  const [prompts, setPrompts] = useState<string[]>([""]);
  const [generating, setGenerating] = useState(false);
  const [existingImages, setExistingImages] = useState<StorageFile[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  // STT Recording States
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sttMode, setSttMode] = useState<"native" | "server" | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const nativeRecognitionRef = useRef<any>(null);

  // Fetch past ComfyUI generations from storage
  const fetchPastGenerations = async () => {
    if (!session?.user?.id) return;
    setLoadingImages(true);
    try {
      const authenticatedClient = getAuthenticatedClient(session.access_token);
      const { data: files, error } = await authenticatedClient.storage
        .from("Storage")
        .list(session.user.id);
      if (error) throw error;

      // Filter only comfyui PNG images
      const comfyFiles = (files || [])
        .filter((f) => f.name.startsWith("comfyui_") && f.name.endsWith(".png"))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (comfyFiles.length > 0) {
        const filePaths = comfyFiles.map((f) => `${session.user.id}/${f.name}`);
        const { data: signedData, error: signedError } = await authenticatedClient.storage
          .from("Storage")
          .createSignedUrls(filePaths, 3600);

        if (signedError) throw signedError;

        const enrichedFiles = comfyFiles.map((f, idx) => ({
          name: f.name,
          id: f.id,
          created_at: f.created_at,
          url: signedData?.[idx]?.signedUrl || undefined,
        }));
        setExistingImages(enrichedFiles);
      } else {
        setExistingImages([]);
      }
    } catch (e: any) {
      console.error("Error fetching past generations:", e);
    } finally {
      setLoadingImages(false);
    }
  };

  useEffect(() => {
    fetchPastGenerations();
  }, [session]);

  const handleAddPrompt = () => {
    setPrompts([...prompts, ""]);
  };

  const handleRemovePrompt = (idx: number) => {
    if (prompts.length <= 1) return;
    const next = [...prompts];
    next.splice(idx, 1);
    setPrompts(next);
  };

  const handlePromptChange = (idx: number, value: string) => {
    const next = [...prompts];
    next[idx] = value;
    setPrompts(next);
  };

  const handleGenerate = async () => {
    const filteredPrompts = prompts.map((p) => p.trim()).filter(Boolean);
    if (filteredPrompts.length === 0) {
      toast.error("Please enter at least one non-empty prompt.");
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/ai/comfy-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ prompts: filteredPrompts }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Generation failed");
      }

      toast.success("Images generated and saved to storage!");
      await fetchPastGenerations();
    } catch (e: any) {
      toast.error(e.message || "Something went wrong during generation.");
    } finally {
      setGenerating(false);
    }
  };

  // Start Speech Recognition
  const startRecording = async (index: number) => {
    // Check if browser native speech recognition is available
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const isXbox = navigator.userAgent.includes("Xbox");

    if (SpeechRecognition && !isXbox) {
      // Use Browser Native Speech Recognition
      try {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = "en-US";

        rec.onstart = () => {
          setRecordingIndex(index);
          setIsRecording(true);
          setSttMode("native");
        };

        rec.onresult = (event: any) => {
          const resultText = event.results[0][0].transcript;
          if (resultText) {
            handlePromptChange(index, resultText);
            toast.success("Speech recognized!");
          }
        };

        rec.onerror = (event: any) => {
          console.error("Native STT error:", event.error);
          toast.error(`Native Speech Recognition error: ${event.error}`);
          stopRecording();
        };

        rec.onend = () => {
          stopRecording();
        };

        nativeRecognitionRef.current = rec;
        rec.start();
      } catch (err: any) {
        console.error("Failed to start native recognition:", err);
        // Fallback to server side
        startServerRecording(index);
      }
    } else {
      // Fallback to Server-side STT (Multer + Python STT)
      startServerRecording(index);
    }
  };

  const startServerRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        await handleServerSTT(index, audioBlob);

        // Stop all tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      setRecordingIndex(index);
      setIsRecording(true);
      setSttMode("server");
      mediaRecorder.start();
    } catch (err: any) {
      console.error("Failed to start server-side recording:", err);
      toast.error("Microphone access denied or unsupported on this browser.");
    }
  };

  const handleServerSTT = async (index: number, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.wav");

    const sttToast = toast.loading("Processing audio on server...");
    try {
      const response = await fetch("/api/ai/stt", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Server STT failed");
      }

      const data = await response.json();
      if (data.text) {
        handlePromptChange(index, data.text);
        toast.success("Speech recognized!", { id: sttToast });
      } else {
        throw new Error("No transcription text returned");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Speech transcription failed, falling back to mock text.", { id: sttToast });
      // Edge case mock fallback
      handlePromptChange(index, "A beautiful floating island with cascading waterfalls");
    }
  };

  const stopRecording = () => {
    if (sttMode === "native" && nativeRecognitionRef.current) {
      nativeRecognitionRef.current.stop();
      nativeRecognitionRef.current = null;
    } else if (sttMode === "server" && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    setRecordingIndex(null);
    setSttMode(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-cyan-400" />
            <div>
              <CardTitle className="text-2xl text-white">ComfyUI Generator</CardTitle>
              <CardDescription className="text-slate-400">
                Execute batch image generations with ComfyUI. Inputs are saved directly to your cloud Storage.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <label className="text-sm font-semibold text-slate-300">Prompts to Generate</label>
            <div className="space-y-3">
              {prompts.map((prompt, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="text-xs font-mono text-slate-500 w-6">#{idx + 1}</span>
                  <Input
                    placeholder="Describe the image you want to generate..."
                    value={prompt}
                    onChange={(e) => handlePromptChange(idx, e.target.value)}
                    disabled={generating}
                    className="flex-1 bg-slate-950 border-slate-800 text-white"
                  />

                  {/* Microphone Button */}
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={generating || (isRecording && recordingIndex !== idx)}
                    onClick={() => {
                      if (isRecording && recordingIndex === idx) {
                        stopRecording();
                      } else {
                        startRecording(idx);
                      }
                    }}
                    aria-label="Toggle speech to text"
                    title="Speech to Text input"
                    className={cn(
                      "border-slate-800 transition-colors",
                      isRecording && recordingIndex === idx
                        ? "bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30"
                        : "bg-slate-950 text-slate-400 hover:text-white"
                    )}
                  >
                    {isRecording && recordingIndex === idx ? (
                      <MicOff className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </Button>

                  {/* Delete Button */}
                  <Button
                    variant="destructive"
                    size="icon"
                    disabled={generating || prompts.length <= 1}
                    onClick={() => handleRemovePrompt(idx)}
                    aria-label="Delete prompt"
                    title="Delete prompt"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-2">
              <Button
                variant="outline"
                onClick={handleAddPrompt}
                disabled={generating}
                className="border-slate-800 text-slate-300 hover:bg-slate-800/50"
              >
                <Plus className="w-4 h-4 mr-2" /> Add Prompt
              </Button>

              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-cyan-500 hover:bg-cyan-600 text-white font-medium"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Generating in ComfyUI...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" /> Generate All
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generation History Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">ComfyUI Generation History</h3>
            <p className="text-sm text-slate-400">All images are permanently saved in your cloud storage bucket.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPastGenerations}
            disabled={loadingImages}
            className="border-slate-800 text-slate-400"
          >
            {loadingImages ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>
        </div>

        {loadingImages ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : existingImages.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {existingImages.map((img) => (
              <Card key={img.id} className="bg-slate-950 border-slate-800 overflow-hidden group">
                <div className="aspect-square bg-slate-900 flex items-center justify-center overflow-hidden relative">
                  {img.url ? (
                    <img
                      src={img.url}
                      alt={img.name}
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-slate-700" />
                  )}
                </div>
                <CardHeader className="p-4">
                  <CardTitle className="text-xs text-white truncate" title={img.name}>
                    {img.name}
                  </CardTitle>
                  <CardDescription className="text-[10px] text-slate-500">
                    {new Date(img.created_at).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex gap-2">
                  {img.url ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                        asChild
                      >
                        <a href={img.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" /> View
                        </a>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="bg-slate-800 hover:bg-slate-700 text-white"
                        asChild
                        title="Download image"
                        aria-label="Download image"
                      >
                        <a href={img.url} download={img.name}>
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 bg-slate-800 text-white opacity-50 cursor-not-allowed"
                      disabled
                    >
                      Unavailable
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
            <ImageIcon className="w-12 h-12 mx-auto text-slate-700 mb-4 opacity-50" />
            <p className="text-slate-500 text-sm">No generated ComfyUI images found yet.</p>
            <p className="text-slate-600 text-xs mt-1">Submit prompts above to start generating artwork!</p>
          </div>
        )}
      </div>
    </div>
  );
}
