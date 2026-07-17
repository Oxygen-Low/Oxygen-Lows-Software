import React, { useState, useEffect, useRef } from "react";
import { Monitor, Play, StopCircle, Bot, Loader2, Info } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useAiModels } from "@/hooks/useAiModels";
import { toast } from "sonner";
import { formatModelLabel, parseAiProxyError } from "@/utils/aiUtils";

interface Message {
  role: "user" | "assistant";
  content:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface Style {
  id: string;
  title: string;
  description: string;
}

export function AiScreenshareApp() {
  const { session } = useAuth();
  const { models, selectedModel, selectedProvider, setSelection } =
    useAiModels();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("GeneralAssistant");
  const [styles, setStyles] = useState<Style[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    const fetchStyles = async () => {
      const stylesRes = await fetch("/api/ai/styles");
      const data = await stylesRes.json();
      if (data) setStyles(data);
    };
    fetchStyles();

    return () => stopSharing();
  }, []);

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as any,
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsAnalyzing(true);
      analyzeFrame();

      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (err: any) {
      console.error("Error accessing screen:", err);
      toast.error(`Could not share screen: ${err.message}`);
    }
  };

  const stopSharing = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
    setIsAnalyzing(false);
    setIsTyping(false);
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current || !streamRef.current) return null;

    const video = videoRef.current;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    // `getDisplayMedia` resolves before the video element has necessarily
    // received frame metadata. A zero-sized canvas serializes as `data:,`,
    // which is not an image and is rejected by vision providers.
    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return null;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.7);
    return image.startsWith("data:image/jpeg;base64,") ? image : null;
  };

  const analyzeFrame = async () => {
    if (!streamRef.current) return;

    const base64Image = captureFrame();
    if (!base64Image) {
      analysisTimeoutRef.current = setTimeout(analyzeFrame, 5000);
      return;
    }

    setIsTyping(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error("Not authenticated");

      const currentMessages = messagesRef.current;
      const history = currentMessages.slice(-5);

      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          style: selectedStyle,
          messages: [
            ...history,
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Look at this screenshot and react to what is happening. Be brief and helpful.",
                },
                { type: "image_url", image_url: { url: base64Image } },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseAiProxyError(response);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      let assistantContent = "";

      if (
        selectedProvider === "openai" ||
        selectedProvider === "openrouter" ||
        selectedProvider === "grok" ||
        selectedProvider === "custom" ||
        selectedProvider === "lmstudio" ||
        selectedProvider === "koboldcpp" ||
        selectedProvider === "kobold"
      ) {
        assistantContent = data.choices?.[0]?.message?.content || "";
      } else if (selectedProvider === "anthropic") {
        assistantContent = data.content?.[0]?.text || "";
      } else if (selectedProvider === "google") {
        assistantContent =
          data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else if (selectedProvider === "ollama") {
        assistantContent = data.message?.content || data.response || "";
      }

      if (assistantContent) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent },
        ]);
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      toast.error(`Analysis error: ${err.message}`);
      stopSharing();
    } finally {
      setIsTyping(false);
      if (streamRef.current) {
        analysisTimeoutRef.current = setTimeout(analyzeFrame, 5000);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[700px]">
      <div className="lg:col-span-1 space-y-6 flex flex-col">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-cyan-500" />
              Settings
            </CardTitle>
            <CardDescription>
              Configure your screen AI companion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="vision-model-select"
                className="text-xs font-bold text-slate-500 uppercase"
              >
                Vision Model
              </label>
              <select
                id="vision-model-select"
                className="w-full bg-slate-950 text-sm text-white p-2 rounded border border-slate-800"
                value={`${selectedProvider}:${selectedModel}`}
                onChange={(e) => {
                  const [p, m] = e.target.value.split(":");
                  setSelection(m, p);
                }}
                disabled={isAnalyzing}
              >
                {models.map((m, i) => (
                  <option key={i} value={`${m.provider}:${m.model_id}`}>
                    {formatModelLabel(m.provider, m.model_id)}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Note: Only vision-capable models work effectively.
              </p>
            </div>

            <div className="space-y-2">
              <label
                id="style-label"
                className="text-xs font-bold text-slate-500 uppercase"
              >
                Style
              </label>
              <div
                className="grid grid-cols-1 gap-2"
                role="listbox"
                aria-labelledby="style-label"
              >
                {styles.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => !isAnalyzing && setSelectedStyle(s.id)}
                    role="option"
                    aria-selected={selectedStyle === s.id}
                    tabIndex={isAnalyzing ? -1 : 0}
                    onKeyDown={(e) => {
                      if (
                        !isAnalyzing &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        setSelectedStyle(s.id);
                      }
                    }}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500",
                      selectedStyle === s.id
                        ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700",
                      isAnalyzing && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <p className="text-sm font-bold">{s.title}</p>
                    <p className="text-xs opacity-70">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={isAnalyzing ? stopSharing : startSharing}
              className={cn(
                "w-full py-6 text-lg font-bold transition-all",
                isAnalyzing
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-cyan-600 hover:bg-cyan-700 text-white",
              )}
            >
              {isAnalyzing ? (
                <>
                  <StopCircle className="w-6 h-6 mr-2" />
                  Stop Analysis
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 mr-2" />
                  Start Screenshare
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="flex-1 bg-slate-900/30 rounded-xl border border-slate-800 overflow-hidden relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          {!isAnalyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <Monitor className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">
                Capture a window or screen to let the AI start reacting.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 bg-slate-950/30 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-20">
                <Bot className="w-16 h-16 mb-4 opacity-10" />
                <p>Waiting for screen capture...</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-4 max-w-[85%]",
                  m.role === "user" ? "ml-auto flex-row-reverse hidden" : "",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-800",
                  )}
                >
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  <div className="p-4 rounded-2xl text-sm bg-slate-900 border border-slate-800 text-slate-200">
                    <ReactMarkdown
                      components={{
                        code({
                          node,
                          inline,
                          className,
                          children,
                          ...props
                        }: any) {
                          const match = /language-(\w+)/.exec(className || "");
                          return !inline && match ? (
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              {...props}
                            >
                              {String(children).replace(/\n$/, "")}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {typeof m.content === "string"
                        ? m.content
                        : "Capturing screen..."}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <p className="text-[10px] text-slate-500 uppercase font-bold text-center">
            {isAnalyzing
              ? "AI is watching and reacting every 5 seconds"
              : "Analysis is currently inactive"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default AiScreenshareApp;
