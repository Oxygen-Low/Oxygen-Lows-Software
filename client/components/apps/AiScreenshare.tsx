import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Loader2, Monitor, StopCircle, Play, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Message {
  role: "user" | "assistant" | "system";
  content: string | any[];
}

interface Model {
  provider: string;
  model_id: string;
}

interface Style {
  id: string;
  title: string;
  description: string;
}

export function AiScreenshareApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("gaming_coach");
  const [isTyping, setIsTyping] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const streamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use a ref for messages to avoid stale closures in the analysis loop
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: modelData } = await supabase.from("user_models").select("*").order("provider");
      if (modelData) {
        setModels(modelData);
        if (modelData.length > 0) {
          setSelectedProvider(modelData[0].provider);
          setSelectedModel(modelData[0].model_id);
        }
      }

      try {
        const session = await supabase.auth.getSession();
        const res = await fetch("/api/ai/styles", {
          headers: {
            "Authorization": `Bearer ${session.data.session?.access_token}`
          }
        });
        const styleData = await res.json();
        if (Array.isArray(styleData)) {
          const screenshareStyles = styleData.filter(s =>
            ["gaming_coach", "video_react", "viewer"].includes(s.id)
          );
          setStyles(screenshareStyles);
        }
      } catch (e) {
        console.error("Failed to fetch styles", e);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const stopSharing = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current);
      analysisTimeoutRef.current = null;
    }
    setIsAnalyzing(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, [stopSharing]);

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as any,
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsAnalyzing(true);

      // Start loop
      analyzeFrame();

      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (err) {
      console.error("Error starting screenshare:", err);
      toast.error("Failed to start screenshare");
    }
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current || !streamRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Compress further if image is too large (though 0.7 jpeg is usually small)
    let quality = 0.7;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);

    // 50MB is huge for a screenshot, but let s handle extreme cases
    // if dataUrl is roughly > 50MB (base64 is ~1.33x original size)
    while (dataUrl.length > 50 * 1024 * 1024 * 1.33 && quality > 0.1) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    return dataUrl;
  };

  const analyzeFrame = async () => {
    if (!streamRef.current) return;

    let success = false;
    try {
      const frame = captureFrame();
      if (!frame) return; // Will be rescheduled by finally

      setIsTyping(true);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      // Prepare multi-modal message
      const userMessage: Message = {
        role: "user",
        content: [
          { type: "text", text: "React to what is happening on my screen based on your style." },
          { type: "image_url", image_url: { url: frame } }
        ]
      };

      // Use messagesRef to get the latest state
      const historyForAi = messagesRef.current.map(m => {
        if (Array.isArray(m.content)) {
          const textPart = m.content.find(p => p.type === "text");
          return { role: m.role, content: textPart?.text || "" };
        }
        return m;
      });

      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          style: selectedStyle,
          messages: [...historyForAi, userMessage],
          stream: false
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          throw new Error(error.error || `AI request failed with status ${response.status}`);
        } else {
          const errorText = await response.text();
          if (response.status === 413) {
            throw new Error("Payload too large. The screenshot or chat history exceeds the server limit.");
          }
          throw new Error(`Server error (${response.status}): ${errorText.substring(0, 100)}...`);
        }
      }

      const data = await response.json();
      let assistantContent = "";

      // Handle different provider response formats
      if (selectedProvider === "openai" || selectedProvider === "openrouter" || selectedProvider === "grok" || selectedProvider === "custom") {
        assistantContent = data.choices?.[0]?.message?.content || "";
      } else if (selectedProvider === "anthropic") {
        assistantContent = data.content?.[0]?.text || "";
      } else if (selectedProvider === "google") {
        assistantContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else if (selectedProvider === "ollama") {
        assistantContent = data.message?.content || data.response || "";
      }

      if (assistantContent) {
        setMessages(prev => [...prev, { role: "assistant", content: assistantContent }]);
      }
      success = true;

    } catch (err: any) {
      console.error("Analysis error:", err);
      toast.error(`Analysis error: ${err.message}`);
      stopSharing();
    } finally {
      setIsTyping(false);
      // ALWAYS reschedule the loop if still sharing, even on capture failure
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
            <CardDescription>Configure your AI Screen Companion</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Vision Model</label>
              <select
                className="w-full bg-slate-950 text-sm text-white p-2 rounded border border-slate-800"
                value={`${selectedProvider}:${selectedModel}`}
                onChange={e => {
                  const [p, m] = e.target.value.split(":");
                  setSelectedProvider(p);
                  setSelectedModel(m);
                }}
                disabled={isAnalyzing}
              >
                {models.map((m, i) => (
                  <option key={i} value={`${m.provider}:${m.model_id}`}>
                    {m.provider} - {m.model_id}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                <Info className="w-3 h-3" /> Note: Only vision-capable models will work.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Style</label>
              <div className="grid grid-cols-1 gap-2">
                {styles.map(s => (
                  <div
                    key={s.id}
                    onClick={() => !isAnalyzing && setSelectedStyle(s.id)}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-all",
                      selectedStyle === s.id
                        ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700",
                      isAnalyzing && "opacity-50 cursor-not-allowed"
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
                  : "bg-cyan-600 hover:bg-cyan-700 text-white"
              )}
            >
              {isAnalyzing ? (
                <><StopCircle className="w-6 h-6 mr-2" /> Stop Analysis</>
              ) : (
                <><Play className="w-6 h-6 mr-2" /> Start AI Screenshare</>
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
              <p className="text-sm">Capture a window or screen to begin the AI reaction loop.</p>
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
                <p>Waiting for analysis to start...</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-4 max-w-[85%]", m.role === "user" ? "ml-auto flex-row-reverse hidden" : "")}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-800")}>
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  <div className="p-4 rounded-2xl text-sm bg-slate-900 border border-slate-800 text-slate-200">
                    <ReactMarkdown
                      components={{
                        code({node, inline, className, children, ...props}: any) {
                          const match = /language-(\w+)/.exec(className || "");
                          return !inline && match ? (
                            <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" {...props}>
                              {String(children).replace(/\n$/, "")}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>{children}</code>
                          );
                        }
                      }}
                    >
                      {typeof m.content === "string" ? m.content : "Capturing screen..."}
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
            {isAnalyzing ? "AI is watching and reacting every 5 seconds" : "Analysis is currently inactive"}
          </p>
        </div>
      </div>
    </div>
  );
}
