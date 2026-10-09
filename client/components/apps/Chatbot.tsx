import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Plus,
  Trash2,
  Bot,
  Send,
  Loader2,
  Code,
  Copy,
  X,
  Check,
  ArrowLeft,
  MessageSquare,
  Globe,
  Sparkles,
  ImagePlus,
  Download,
  Maximize2,
  Layers,
  Wrench,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Square,
  ArrowUp,
  AlertTriangle,
  Radio,
  Mic,
  Eye,
  EyeOff,
  ExternalLink,
  Heart,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { initiatePollinationsOAuth } from "@/services/pollinationsAuth";
import {
  fetchImageModels,
  generateImage,
  ImageModelInfo,
} from "@/services/imageGen";
import {
  streamPollinationsClient,
  fetchPollinationsClient,
  createSseDeltaTranslator,
  PollinationsRateLimitError,
  PollinationsNotFoundError,
  PollinationsAuthError,
} from "@/services/pollinationsClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { db, supabase } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { useAiModels, type Model } from "@/hooks/useAiModels";
import { useLiveVoice } from "@/hooks/useLiveVoice";
import { WEBSITE_KNOWLEDGE_SYSTEM_PROMPT } from "@shared/websiteKnowledge";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeHighlighter } from "@/components/ui/CodeHighlighter";
import { formatModelLabel, parseAiProxyError } from "@/utils/aiUtils";
import { EncryptionRequiredPrompt } from "@/components/EncryptionRequiredPrompt";
import {
  isCategoryLocked,
  isCategoryEncryptionEnabled,
  getActiveMasterKey,
  encryptChatData,
  decryptChatData,
  encryptChatMessageData,
  decryptChatMessageData,
  decryptCharacterData,
} from "@/lib/crypto";

// ─── Code Snippets for Background Animation ────────────────────────────

const CODE_SNIPPETS = [
  `-- Lua pathfinding implementation
local function calculate_path(start, target)
    local open_set = {start}
    local closed_set = {}
    while #open_set > 0 do
        local current = get_lowest_f(open_set)
        if current == target then
            return construct_path(current)
        end
    end
    return nil
end`,
  `// C++ Entity Manager System
#include <iostream>
#include <vector>

class EntityManager {
private:
    std::vector<Entity*> entities;
public:
    void update(float dt) {
        for(auto e : entities) {
            e->tick(dt);
        }
    }
};`,
  `<!-- XML Server Configuration -->
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system mode="production">
        <memory_limit>4096M</memory_limit>
        <cache_enabled>true</cache_enabled>
    </system>
</configuration>`,
  `// C# Network Client Service
using System;
using System.Threading.Tasks;

public class NetworkClient {
    private readonly string _endpoint;
    
    public async Task<Response> Fetch() {
        using var client = new HttpClient();
        var result = await client.GetAsync(
            _endpoint
        );
        return await result.Content
            .ReadFromJsonAsync<Response>();
    }
}`,
  `# Python ML Pipeline
import torch
import torch.nn as nn

class Transformer(nn.Module):
    def __init__(self, d_model, nhead):
        super().__init__()
        self.encoder = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(
                d_model=d_model,
                nhead=nhead
            ),
            num_layers=6
        )`,
  `// Rust async runtime
use tokio::sync::mpsc;

async fn process_stream(
    mut rx: mpsc::Receiver<Message>
) -> Result<(), Error> {
    while let Some(msg) = rx.recv().await {
        match msg.kind {
            Kind::Data => handle(msg),
            Kind::Eof => break,
        }
    }
    Ok(())
}`,
];

// ─── Syntax Highlight Helper (for background animation) ───────────────

function highlightCode(code: string): string {
  let s = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const kw = "#c678dd";
  const fn_ = "#61afef";
  const str = "#98c379";
  const cmt = "#5c6370";
  const tp = "#e06c75";

  s = s
    .replace(
      /(--.*|\/\/.*|&lt;!--.*?--&gt;|#.*)/g,
      `<span style="color:${cmt}">$1</span>`,
    )
    .replace(/(".*?"|'.*?')/g, `<span style="color:${str}">$1</span>`)
    .replace(
      /\b(function|return|if|else|for|while|class|public|private|void|int|string|bool|local|end|then|do|using|namespace|include|async|await|var|readonly|import|from|def|self|match|let|mut|break|const|super)\b/g,
      `<span style="color:${kw}">$1</span>`,
    )
    .replace(
      /\b([A-Z][a-zA-Z0-9_]*|float)\b/g,
      `<span style="color:${tp}">$1</span>`,
    )
    .replace(/\b([a-zA-Z_]\w*)(?=\()/g, `<span style="color:${fn_}">$1</span>`);

  return s;
}

const InteractiveBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const dotsRef = useRef<
    { ox: number; oy: number; x: number; y: number; vx: number; vy: number }[]
  >([]);
  const animFrameRef = useRef<number>(0);
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const spacing = 24;
    const radius = 1.5;
    const repelRadius = 150;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initDots();
    }

    function initDots() {
      dotsRef.current = [];
      if (!canvas) return;
      for (let x = 0; x < canvas.width; x += spacing) {
        for (let y = 0; y < canvas.height; y += spacing) {
          dotsRef.current.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
        }
      }
    }

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(115, 115, 115, 0.3)";
      ctx.beginPath();

      for (const dot of dotsRef.current) {
        const dx = mouseRef.current.x - dot.x;
        const dy = mouseRef.current.y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < repelRadius && dist > 0) {
          const force = (repelRadius - dist) / repelRadius;
          dot.vx -= (dx / dist) * force * 1.5;
          dot.vy -= (dy / dist) * force * 1.5;
        }

        dot.vx += (dot.ox - dot.x) * 0.1;
        dot.vy += (dot.oy - dot.y) * 0.1;
        dot.vx *= 0.75;
        dot.vy *= 0.75;
        dot.x += dot.vx;
        dot.y += dot.vy;

        ctx.moveTo(dot.x + radius, dot.y);
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
      animFrameRef.current = requestAnimationFrame(draw);
    }

    resize();
    draw();

    const onResize = () => {
      resize();
    };
    window.addEventListener("resize", onResize);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;

      if (parallaxRef.current) {
        const px = (e.clientX / window.innerWidth - 0.5) * -30;
        const py = (e.clientY / window.innerHeight - 0.5) * -30;
        parallaxRef.current.style.transform = `translate(${px}px, ${py}px)`;
      }
    };
    document.addEventListener("mousemove", onMouseMove);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  // Initialize code columns
  useEffect(() => {
    const container = codeContainerRef.current;
    if (!container) return;

    const colWidth = 350;
    const numCols = Math.ceil(window.innerWidth / colWidth);
    const intervals: ReturnType<typeof setInterval>[] = [];

    for (let i = 0; i < numCols; i++) {
      const col = document.createElement("div");
      col.className = "agent-code-column";
      col.style.left = `${i * colWidth}px`;
      col.style.top = `${Math.random() * -200}px`;
      container.appendChild(col);

      function addSnippet() {
        const text =
          CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)];
        const div = document.createElement("div");
        div.className = "agent-code-snippet";
        if (Math.random() > 0.5) div.classList.add("agent-color-alt");

        let charIndex = 0;
        const typeInterval = setInterval(
          () => {
            const current = text.substring(0, charIndex);
            const cursor =
              charIndex < text.length
                ? '<span class="agent-cursor">_</span>'
                : "";
            div.innerHTML = highlightCode(current) + cursor;
            charIndex++;
            if (charIndex > text.length) clearInterval(typeInterval);
          },
          10 + Math.random() * 20,
        );

        col.appendChild(div);
        intervals.push(typeInterval);
      }

      addSnippet();
      const colInterval = setInterval(
        () => {
          if (col.children.length > 3 && col.firstChild) {
            col.removeChild(col.firstChild);
          }
          addSnippet();
        },
        6000 + Math.random() * 4000,
      );
      intervals.push(colInterval);
    }

    return () => {
      intervals.forEach(clearInterval);
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 w-full h-full bg-[#0a0a0c] overflow-hidden pointer-events-none">
      <div
        ref={parallaxRef}
        className="absolute inset-[-40px] w-[calc(100%+80px)] h-[calc(100%+80px)] transition-transform duration-100 ease-out pointer-events-none"
      >
        <div ref={codeContainerRef} className="absolute inset-0 z-0 pointer-events-none" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 w-full h-full pointer-events-none"
        />
      </div>
    </div>
  );
};

interface Message {
  id?: string;
  parent_id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  is_web_search?: boolean;
  web_search_status?: "searching" | "searched";
  created_at?: string;
  is_image_gen?: boolean;
  image_url?: string;
  image_model?: string;
  usedFallback?: boolean;
  fallbackModel?: string;
  fallbackReason?: string;
}

interface Chat {
  id: string;
  title: string;
  llm_character_id: string | null;
  user_character_id: string | null;
  universe_id: string | null;
}

interface Character {
  id: string;
  name: string;
  display_name: string | null;
  is_universe: boolean;
  is_race?: boolean;
  race_id?: string | null;
  universe_id?: string | null;
  short_description?: string | null;
  appearance?: string | null;
  personality?: string | null;
  backstory?: string | null;
  situation?: string | null;
  stats_enabled?: boolean;
  stats?: any;
}

const HORDE_FALLBACK_FAST_MODEL =
  "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M";
const HORDE_FALLBACK_SMART_MODEL =
  "aphrodite/TheDrummer/Behemoth-X-123B-v2.1";

const memoizedMarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    return !inline && match ? (
      <CodeHighlighter
        language={match[1]}
        PreTag="div"
        {...props}
      >
        {String(children).replace(/\n$/, "")}
      </CodeHighlighter>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

const ChatMessage = React.memo(
  ({
    message: m,
    siblings = [],
    activeSiblingIndex = 0,
    onNavigate,
    onRegenerate,
    onSpeak,
    isSpeakingThisMessage = false,
  }: {
    message: Message;
    siblings?: Message[];
    activeSiblingIndex?: number;
    onNavigate?: (index: number) => void;
    onRegenerate?: () => void;
    onSpeak?: (text: string, messageId?: string) => void;
    isSpeakingThisMessage?: boolean;
  }) => {
    const { t } = useTranslation();
    let displayContent = m.content || "";
    const [reasoningExpanded, setReasoningExpanded] = useState(false);
    const [copiedReasoning, setCopiedReasoning] = useState(false);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [copiedImage, setCopiedImage] = useState(false);

    const handleCopyReasoning = useCallback(
      async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!m.reasoning) return;
        try {
          await navigator.clipboard.writeText(m.reasoning);
          setCopiedReasoning(true);
          toast.success(
            t(
              "apps.chatbotReasoningCopied",
              undefined,
              "Reasoning copied to clipboard",
            ),
          );
          setTimeout(() => {
            setCopiedReasoning(false);
          }, 2000);
        } catch (err) {
          console.error("Failed to copy reasoning:", err);
        }
      },
      [m.reasoning, t],
    );

    if (m.role === "assistant" && displayContent.includes("<tool_call>")) {
      displayContent = displayContent.replace(
        /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g,
        (match, jsonStr) => {
          try {
            const data = JSON.parse(jsonStr);
            return `\n\n🔨 **Using Tool: ${data.name}**\n\`\`\`json\n${JSON.stringify(data.args, null, 2)}\n\`\`\`\n\n`;
          } catch (e) {
            return match;
          }
        },
      );
    }

    if (m.role === "user") {
      return (
        <div className="flex gap-4 justify-end w-full animate-[fade-in_0.3s_ease-out] mb-4 group/user-msg">
          <div className="flex flex-col gap-2 max-w-[80%] items-end">
            <div className="flex items-center gap-1.5 mr-1">
              {onSpeak && displayContent && (
                <button
                  type="button"
                  onClick={() => onSpeak(displayContent, m.id)}
                  className={cn(
                    "p-1 rounded hover:bg-white/10 transition-colors opacity-0 group-hover/user-msg:opacity-100 focus:opacity-100",
                    isSpeakingThisMessage
                      ? "opacity-100 text-primary animate-pulse"
                      : "text-slate-400 hover:text-white",
                  )}
                  title={
                    isSpeakingThisMessage
                      ? t("apps.chatbotStopSpeaking", undefined, "Stop speaking")
                      : t("apps.chatbotReadAloud", undefined, "Read aloud")
                  }
                  aria-label={
                    isSpeakingThisMessage
                      ? t("apps.chatbotStopSpeaking", undefined, "Stop speaking")
                      : t("apps.chatbotReadAloud", undefined, "Read aloud")
                  }
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}
              <p className="text-slate-400 text-xs font-display">User</p>
            </div>
            <div className="glass-panel px-5 py-4 rounded-xl rounded-tr-sm text-[15px] leading-[1.6]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={memoizedMarkdownComponents}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }

    if (m.role === "system") {
      return (
        <div className="flex gap-4 w-full mt-4 animate-[fade-in_0.3s_ease-out_0.2s_both] ai-message-container mb-4 opacity-80 hover:opacity-100 transition-opacity">
          <div className="shrink-0 pt-7">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div className="flex flex-col gap-2 max-w-[85%] w-full">
            <p className="text-slate-400 text-sm font-display font-medium ml-1">
              System / Tool Result
            </p>
            <div className="w-full">
              <div className="text-[13px] leading-[1.6] space-y-4 ai-message-content p-4 rounded-2xl rounded-tl-sm bg-slate-900/50 border border-slate-800 text-slate-300 font-mono overflow-auto max-h-[300px]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={memoizedMarkdownComponents}
                >
                  {displayContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex gap-4 w-full mt-4 animate-[fade-in_0.3s_ease-out_0.2s_both] ai-message-container mb-4">
        <div className="shrink-0 pt-7">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent shadow-[0_0_15px_rgba(207,188,255,0.5)] flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
        </div>
        <div className="flex flex-col gap-2 max-w-[85%] w-full">
          <div className="flex items-center justify-between w-full pr-1">
            <p className="text-white text-sm font-display font-medium ml-1">
              Chatbot
            </p>
            {onSpeak && displayContent && !m.is_image_gen && (
              <button
                type="button"
                onClick={() => onSpeak(displayContent, m.id)}
                className={cn(
                  "p-1.5 rounded hover:bg-white/10 transition-colors",
                  isSpeakingThisMessage
                    ? "text-primary bg-primary/10 animate-pulse"
                    : "text-slate-400 hover:text-white",
                )}
                title={
                  isSpeakingThisMessage
                    ? t("apps.chatbotStopSpeaking", undefined, "Stop speaking")
                    : t("apps.chatbotReadAloud", undefined, "Read aloud")
                }
                aria-label={
                  isSpeakingThisMessage
                    ? t("apps.chatbotStopSpeaking", undefined, "Stop speaking")
                    : t("apps.chatbotReadAloud", undefined, "Read aloud")
                }
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="w-full">
            {m.usedFallback && (
              <div className="w-full max-w-full rounded-lg border border-amber-500/30 bg-amber-500/10 mb-3 px-4 py-2 flex items-center gap-2 text-xs font-mono text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {m.fallbackReason === "auth_required"
                    ? t(
                        "apps.pollinations401FallbackNotice",
                        {
                          model:
                            m.fallbackModel ||
                            "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M",
                        },
                        `Generated via AI Horde (${m.fallbackModel || "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M"}) fallback due to Pollinations API key requirement (401).`,
                      )
                    : m.fallbackReason === "not_found"
                    ? t(
                        "apps.pollinations404FallbackNotice",
                        {
                          model:
                            m.fallbackModel ||
                            "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M",
                        },
                        `Generated via AI Horde (${m.fallbackModel || "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M"}) fallback due to Pollinations 404 error.`,
                      )
                    : t(
                        "apps.defaultModelFallbackNotice",
                        {
                          model:
                            m.fallbackModel ||
                            "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M",
                        },
                        `Generated via AI Horde (${m.fallbackModel || "koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M"}) fallback due to main default model unavailability.`,
                      )}
                </span>
              </div>
            )}
            {m.is_web_search && (
              <div className="w-full max-w-full rounded-lg border border-white/10 bg-white/5 mb-3 px-4 py-2 flex items-center gap-2 text-xs font-mono text-slate-400">
                <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>
                  {m.web_search_status === "searching"
                    ? t(
                        "apps.chatbotSearchingTheWeb",
                        undefined,
                        "Searching the web...",
                      )
                    : t(
                        "apps.chatbotSearchedTheWeb",
                        undefined,
                        "Searched The Web",
                      )}
                </span>
              </div>
            )}
            {m.reasoning && (
              <div
                className={cn(
                  "reasoning-block w-full max-w-full rounded-lg border border-white/10 bg-white/5 mb-4 overflow-hidden",
                  reasoningExpanded && "expanded",
                )}
              >
                <div
                  onClick={() => setReasoningExpanded(!reasoningExpanded)}
                  className="reasoning-header w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors text-slate-400 hover:text-white/90 cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setReasoningExpanded(!reasoningExpanded);
                    }
                  }}
                >
                  <span className="text-xs font-mono flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    {t(
                      "apps.chatbotReasoningProcess",
                      undefined,
                      "Reasoning Process",
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyReasoning}
                      className="copy-reasoning-btn p-1 px-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-mono"
                      title={t(
                        "apps.chatbotCopyReasoning",
                        undefined,
                        "Copy Reasoning",
                      )}
                      aria-label={t(
                        "apps.chatbotCopyReasoning",
                        undefined,
                        "Copy Reasoning",
                      )}
                    >
                      {copiedReasoning ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-[11px] text-green-400">
                            {t("apps.chatbotCopied", undefined, "Copied")}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">
                            {t(
                              "apps.chatbotCopyReasoning",
                              undefined,
                              "Copy Reasoning",
                            )}
                          </span>
                        </>
                      )}
                    </button>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-slate-400 transition-transform duration-200",
                        reasoningExpanded && "rotate-180",
                      )}
                    />
                  </div>
                </div>
                {reasoningExpanded && (
                  <div className="reasoning-content px-4 py-3 border-t border-white/10 text-sm text-slate-300 font-mono leading-relaxed bg-[#0F0F13]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={memoizedMarkdownComponents}
                    >
                      {m.reasoning}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            {m.is_image_gen ? (
              <div className="image-gen-card w-full max-w-md rounded-2xl border border-white/10 bg-[#121216] overflow-hidden shadow-2xl">
                {m.image_url ? (
                  <>
                    <div
                      className="relative aspect-square max-h-[380px] bg-black/50 overflow-hidden flex items-center justify-center cursor-pointer group"
                      onClick={() => setLightboxOpen(true)}
                    >
                      <img
                        src={m.image_url}
                        alt={m.content}
                        className="w-full h-full object-contain rounded-t-2xl transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                      {m.image_model && (
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] text-cyan-300 font-mono flex items-center gap-1 shadow-md">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          {m.image_model}
                        </span>
                      )}
                    </div>
                    <div className="p-3 bg-[#16161c] border-t border-white/10 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-300 line-clamp-1 italic">
                        "{m.content}"
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = m.image_url!;
                            link.download = `chatbot_image_${Date.now()}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            toast.success(
                              t(
                                "apps.imageGenDownloaded",
                                undefined,
                                "Download started!",
                              ),
                            );
                          }}
                          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title={t("common.download", undefined, "Download")}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              if (m.image_url!.startsWith("data:")) {
                                const res = await fetch(m.image_url!);
                                const blob = await res.blob();
                                await navigator.clipboard.write([
                                  new ClipboardItem({ [blob.type]: blob }),
                                ]);
                              } else {
                                await navigator.clipboard.writeText(m.image_url!);
                              }
                              setCopiedImage(true);
                              setTimeout(() => setCopiedImage(false), 2000);
                              toast.success(
                                t(
                                  "apps.imageGenCopied",
                                  undefined,
                                  "Image copied to clipboard!",
                                ),
                              );
                            } catch {
                              await navigator.clipboard.writeText(m.image_url!);
                              toast.success(
                                t(
                                  "apps.imageGenLinkCopied",
                                  undefined,
                                  "Image link copied!",
                                ),
                              );
                            }
                          }}
                          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title={t("common.copy", undefined, "Copy")}
                        >
                          {copiedImage ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.setItem(
                              "image_studio_pending_image",
                              m.image_url!,
                            );
                            if (typeof window !== "undefined") {
                              window.location.href = "/apps?app=image-studio";
                            }
                          }}
                          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title={t(
                            "apps.imageGenOpenInStudio",
                            undefined,
                            "Open in Image Studio",
                          )}
                        >
                          <Layers className="w-3.5 h-3.5 text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setLightboxOpen(true)}
                          className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title={t("apps.imageGenExpand", undefined, "Full Size")}
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    <p className="text-xs text-slate-300 font-mono">
                      {m.content || "Generating image with AI..."}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[15px] leading-[1.6] space-y-4 ai-message-content p-4 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200">
                {displayContent ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={memoizedMarkdownComponents}
                  >
                    {displayContent}
                  </ReactMarkdown>
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
            )}
            {lightboxOpen && m.image_url && (
              <div
                className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
                onClick={() => setLightboxOpen(false)}
              >
                <div
                  className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(false)}
                    className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <img
                    src={m.image_url}
                    alt={m.content}
                    className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10"
                  />
                </div>
              </div>
            )}
            {siblings.length > 0 && (
              <div className="flex items-center gap-2 mt-2 ml-1 text-slate-400 text-xs">
                <button
                  onClick={() => onNavigate?.(activeSiblingIndex - 1)}
                  disabled={activeSiblingIndex === 0}
                  className="hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 p-1 flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono select-none">
                  {activeSiblingIndex + 1} / {siblings.length}
                </span>
                <button
                  onClick={() => {
                    if (activeSiblingIndex < siblings.length - 1) {
                      onNavigate?.(activeSiblingIndex + 1);
                    } else {
                      onRegenerate?.();
                    }
                  }}
                  className="hover:text-white p-1 flex items-center justify-center transition-colors"
                  title={
                    activeSiblingIndex < siblings.length - 1
                      ? "Next"
                      : "Regenerate"
                  }
                >
                  {activeSiblingIndex < siblings.length - 1 ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <RotateCw className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

interface QueueStatus {
  eta: number;
  position: number;
  workers: number;
  totalInQueue: number;
}

const formatHordeEta = (seconds: number): string => {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);

  return parts.join(" ") || "0s";
};

export function ChatbotApp() {
  const { session } = useAuth();
  const {
    models,
    refreshModels,
    pollinationsApiKey,
    isPollinationsConfigured,
    isKeyLoading,
    setPollinationsApiKey,
    isPollinationsSupporter,
    setIsPollinationsSupporter,
    chatbotDefaultModel,
    setChatbotDefault,
    researchAgentDefaultModel,
  } = useAiModels();
  const [gateKeyInput, setGateKeyInput] = useState("");
  const [showGateKey, setShowGateKey] = useState(false);
  const [isSavingGateKey, setIsSavingGateKey] = useState(false);
  const [isConnectingGate, setIsConnectingGate] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [activeChildren, setActiveChildren] = useState<Record<string, string>>(
    {},
  );
  const [encryptionLocked, setEncryptionLocked] = useState(() =>
    isCategoryLocked("chatbot"),
  );

  useEffect(() => {
    if (pollinationsApiKey) {
      setGateKeyInput(pollinationsApiKey);
    }
  }, [pollinationsApiKey]);

  useEffect(() => {
    setEncryptionLocked(isCategoryLocked("chatbot"));
  }, []);

  const activeChildrenRef = useRef(activeChildren);
  useEffect(() => {
    activeChildrenRef.current = activeChildren;
  }, [activeChildren]);

  const messages = useMemo(() => {
    const rootMessages = allMessages.filter((m) => !m.parent_id);
    if (rootMessages.length === 0) return [];

    let currentId =
      activeChildren["root"] || rootMessages[rootMessages.length - 1]?.id;
    const path: Message[] = [];
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId) && visited.size < 5000) {
      visited.add(currentId);
      const msg = allMessages.find((m) => m.id === currentId);
      if (!msg) break;
      path.push(msg);
      currentId = activeChildren[currentId];
    }
    return path;
  }, [allMessages, activeChildren]);

  const setMessages = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      // This is a shim for setMessages that is used by streaming updates
      if (typeof updater === "function") {
        setAllMessages((prevAll) => {
          const rootMessages = prevAll.filter((m) => !m.parent_id);
          let currentId =
            activeChildrenRef.current["root"] ||
            rootMessages[rootMessages.length - 1]?.id;
          const path: Message[] = [];
          const visited = new Set<string>();
          while (currentId && !visited.has(currentId) && visited.size < 5000) {
            visited.add(currentId);
            const msg = prevAll.find((m) => m.id === currentId);
            if (!msg) break;
            path.push(msg);
            currentId = activeChildrenRef.current[currentId];
          }
          const newPath = updater(path);
          const newAll = [...prevAll];
          const lastMsg = newPath[newPath.length - 1];
          if (lastMsg && !lastMsg.id) {
            // Temporary streaming message
            const existingTempIndex = newAll.findIndex(
              (m) => m.id === "temp-streaming",
            );
            if (existingTempIndex >= 0) {
              newAll[existingTempIndex] = { ...lastMsg, id: "temp-streaming" };
            } else {
              newAll.push({ ...lastMsg, id: "temp-streaming" });
            }
          } else if (lastMsg && lastMsg.id) {
            const existingIndex = newAll.findIndex((m) => m.id === lastMsg.id);
            if (existingIndex >= 0) {
              newAll[existingIndex] = lastMsg;
            } else {
              newAll.push(lastMsg);
            }
          }
          return newAll;
        });
      } else {
        // Direct set (e.g. setMessages([]))
        if (updater.length === 0) {
          setAllMessages([]);
          setActiveChildren({});
        }
      }
    },
    [],
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  const [availableCharacters, setAvailableCharacters] = useState<Character[]>(
    [],
  );
  const [selectedLlmCharacter, setSelectedLlmCharacter] = useState<
    string | null
  >(null);
  const [selectedUserCharacter, setSelectedUserCharacter] = useState<
    string | null
  >(null);
  const [selectedUniverse, setSelectedUniverse] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { t, languageCode } = useTranslation();
  const isVoiceInputRef = useRef(false);

  const handleSendMessageRef = useRef<(textOverride?: string, fromVoice?: boolean) => Promise<void>>(async () => {});
  const handleStopRef = useRef<() => void>(() => {});

  const liveVoice = useLiveVoice({
    languageCode,
    apiKey: pollinationsApiKey,
    onSendSpeech: (transcript) => {
      if (transcript && transcript.trim()) {
        isVoiceInputRef.current = true;
        handleSendMessageRef.current(transcript, true);
      }
    },
    onInterrupt: () => {
      handleStopRef.current();
    },
  });

  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const handleSpeakMessage = useCallback(
    (text: string, messageId?: string) => {
      if (!text || !text.trim()) return;
      if (liveVoice.isSpeaking && speakingMessageId === messageId) {
        liveVoice.stopSpeaking();
        setSpeakingMessageId(null);
      } else {
        setSpeakingMessageId(messageId || null);
        liveVoice.speakText(text, () => {
          setSpeakingMessageId(null);
        });
      }
    },
    [liveVoice, speakingMessageId],
  );

  const [isReasoningEnabled, setIsReasoningEnabled] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [isImageGenEnabled, setIsImageGenEnabled] = useState(false);
  const [chatImageProvider, setChatImageProvider] = useState<"horde">("horde");
  const [chatImageModel, setChatImageModel] = useState<string>("SDXL 1.0");
  const [chatImageModels, setChatImageModels] = useState<{
    horde: ImageModelInfo[];
  }>({ horde: [] });
  const [imageModelDropdownOpen, setImageModelDropdownOpen] = useState(false);

  useEffect(() => {
    if (isImageGenEnabled && chatImageModels.horde.length === 0) {
      fetchImageModels()
        .then((data) => {
          setChatImageModels(data);
          if (data.horde.length > 0) setChatImageModel(data.horde[0].id);
        })
        .catch((e) => console.error("Failed loading image models in chatbot", e));
    }
  }, [isImageGenEnabled, chatImageModels.horde.length]);

  const [optionsDropdownOpen, setOptionsDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const skipNextFetchRef = useRef<string | null>(null);

  // ── Touch handling for right-edge-swipe and tap ──
  const TOUCH_EDGE_ZONE = 30;
  const SWIPE_THRESHOLD = 40;
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    if (window.innerWidth - x <= TOUCH_EDGE_ZONE) {
      touchStartX.current = x;
      touchStartY.current = y;
      touchStartTime.current = Date.now();
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = touchStartX.current - e.touches[0].clientX; // swipe left from right edge
    if (dx > SWIPE_THRESHOLD) {
      setSidebarOpen(true);
      touchStartX.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchStartX.current !== null) {
      const touchDuration = Date.now() - touchStartTime.current;
      const changedTouch = e.changedTouches[0];
      if (changedTouch) {
        const dx = Math.abs(touchStartX.current - changedTouch.clientX);
        const dy =
          touchStartY.current !== null
            ? Math.abs(changedTouch.clientY - touchStartY.current)
            : 0;
        if (touchDuration < 500 && dx < 20 && dy < 20) {
          setSidebarOpen(true);
        }
      }
      touchStartX.current = null;
    }
  }, []);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ── Desktop hover trigger ──
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSidebar = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setSidebarOpen(true);
  }, []);

  const scheduleSidebarClose = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setSidebarOpen(false);
    }, 300);
  }, []);

  const [userSelectedModel, setUserSelectedModel] = useState<string | null>(null);
  const selectedModel =
    userSelectedModel || chatbotDefaultModel || "inclusionai/ling-3.1-flash";
  const setSelectedModel = useCallback((modelId: string) => {
    setUserSelectedModel(modelId);
  }, []);
  const selectedProvider = "pollinations";

  const formatModelLabel = useCallback(
    (_provider: string, modelId: string) => {
      const found = models.find((m) => m.model_id === modelId);
      if (found?.name) return `${found.name} - ${modelId}`;
      return modelId;
    },
    [models],
  );

  const standardModels = useMemo(() => {
    return models.filter((m) => !m.isCustom);
  }, [models]);

  const customModels = useMemo(() => {
    return models.filter((m) => m.isCustom);
  }, [models]);

  // Click outside listener for dropdowns
  const optionsDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const imageModelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        optionsDropdownRef.current &&
        !optionsDropdownRef.current.contains(e.target as Node)
      ) {
        setOptionsDropdownOpen(false);
      }
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
      if (
        imageModelDropdownRef.current &&
        !imageModelDropdownRef.current.contains(e.target as Node)
      ) {
        setImageModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("last_model_id")
      .eq("user_id", session.user.id)
      .single();

    const { data: chars } = await supabase
      .from("characters")
      .select("*")
      .eq("user_id", session.user.id);

    const key = getActiveMasterKey();
    if (chars) {
      const decryptedChars = await Promise.all(
        chars.map((c: any) => decryptCharacterData(c, key)),
      );
      setAvailableCharacters(decryptedChars);
    }

    const { data: chatsData } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });

    if (chatsData) {
      const decryptedChats = await Promise.all(
        chatsData.map((c: any) => decryptChatData(c, key)),
      );
      setChats(decryptedChats);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!currentChatId) {
        setAllMessages([]);
        setActiveChildren({});
        return;
      }

      if (skipNextFetchRef.current === currentChatId) {
        skipNextFetchRef.current = null;
        return;
      }

      if (isTypingRef.current) return;

      const { data } = await supabase
        .from("chatbot_messages")
        .select("*")
        .eq("chat_id", currentChatId)
        .order("created_at", { ascending: true });

      if (data) {
        const key = getActiveMasterKey();
        const decryptedMessages = await Promise.all(
          data.map((m: any) => decryptChatMessageData(m, key)),
        );
        const processed = decryptedMessages.map((m) => {
          return {
            id: m.id,
            parent_id: m.parent_id,
            role: m.role,
            content: m.content,
            reasoning: m.reasoning,
            is_web_search: m.is_web_search,
            created_at: m.created_at,
          };
        });

        const newActiveChildren: Record<string, string> = {};
        processed.forEach((m) => {
          const p = m.parent_id || "root";
          // Since data is ordered by created_at, the last one processed becomes active
          newActiveChildren[p] = m.id;
        });

        setAllMessages(processed);
        setActiveChildren(newActiveChildren);
      }
    };

    fetchMessages();
  }, [currentChatId]);

  useEffect(() => {
    if (currentChatId) {
      const chat = chats.find((c) => c.id === currentChatId);
      if (chat) {
        setSelectedLlmCharacter(chat.llm_character_id);
        setSelectedUserCharacter(chat.user_character_id);
        setSelectedUniverse(chat.universe_id);
      }
    }
  }, [currentChatId, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleNewChatClick = () => {
    setCurrentChatId(null);
    setAllMessages([]);
    setActiveChildren({});
    setInput("");
  };

  const updateChatSetting = async (updates: Partial<Chat>) => {
    if (!currentChatId) return;
    try {
      let dbUpdates: any = { ...updates };
      if (isCategoryEncryptionEnabled("chatbot")) {
        const key = getActiveMasterKey();
        if (key) {
          dbUpdates = await encryptChatData(dbUpdates, key);
        }
      }
      const { error } = await supabase
        .from("chats")
        .update(dbUpdates)
        .eq("id", currentChatId);
      if (error) throw error;
      setChats((prev) =>
        prev.map((c) => (c.id === currentChatId ? { ...c, ...updates } : c)),
      );
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const generateChatTitle = async (chatId: string, firstMsg: string) => {
    try {
      let title = "New Chat";
      const isDirectKey = Boolean(
        pollinationsApiKey &&
          (pollinationsApiKey.startsWith("pk_") || pollinationsApiKey.startsWith("sk_")) &&
          !pollinationsApiKey.includes("...") &&
          pollinationsApiKey.length > 20,
      );

      if (session?.access_token) {
        try {
          const res = await fetch("/api/ai/proxy", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              provider: "pollinations",
              model: "inclusionai/ling-3.1-flash",
              messages: [
                {
                  role: "user",
                  content: `Generate a short 3-5 word title for a chat that starts with this message: "${firstMsg}". Output ONLY the title, no quotes or prefix.`,
                },
              ],
              stream: false,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text =
              data?.choices?.[0]?.message?.content || data?.content || "";
            if (text) {
              title = text.trim().replace(/^["']|["']$/g, "");
            }
          }
        } catch {}
      } else if (isDirectKey) {
        try {
          const directTitle = await fetchPollinationsClient({
            model: "inclusionai/ling-3.1-flash",
            messages: [
              {
                role: "user",
                content: `Generate a short 3-5 word title for a chat that starts with this message: "${firstMsg}". Output ONLY the title, no quotes or prefix.`,
              },
            ],
            apiKey: pollinationsApiKey || undefined,
          });
          if (directTitle) {
            title = directTitle.trim().replace(/^["']|["']$/g, "");
          }
        } catch {}
      }

      if (title === "New Chat") {
        try {
          const fetchTitleViaProxy = async (hordeModel: string) => {
            return await fetch("/api/ai/proxy", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                provider: "horde",
                model: hordeModel,
                messages: [
                  {
                    role: "user",
                    content: `Generate a short 3-5 word title for a chat that starts with this message: "${firstMsg}". Output ONLY the title, no quotes or prefix.`,
                  },
                ],
                stream: false,
                apiKey: "0000000000",
              }),
            });
          };

          let response = await fetchTitleViaProxy(HORDE_FALLBACK_FAST_MODEL);
          if (!response.ok) {
            response = await fetchTitleViaProxy(HORDE_FALLBACK_SMART_MODEL);
          }

          if (response.ok) {
            const data = await response.json();
            const hordeTitle =
              data.choices?.[0]?.message?.content?.trim() || "";
            if (hordeTitle) {
              title = hordeTitle.replace(/^["']|["']$/g, "");
            }
          }
        } catch (hordeErr) {
          console.warn("Horde title fallback failed:", hordeErr);
        }
      }

      if (session?.user?.id) {
        let dbTitle = title;
        if (isCategoryEncryptionEnabled("chatbot")) {
          const key = getActiveMasterKey();
          if (key) {
            const enc = await encryptChatData({ title }, key);
            dbTitle = enc.title || title;
          }
        }
        await supabase
          .from("chats")
          .update({ title: dbTitle })
          .eq("id", chatId);
      }

      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, title } : c)),
      );
    } catch (e) {
      console.error("Failed to generate title", e);
    }
  };

  const callAiStream = async (
    provider: string,
    model: string,
    msgs: Message[],
    signal: AbortSignal,
    streamCallback: (content: string, reasoning?: string) => void,
    onFallback?: (modelUsed?: string) => void,
  ): Promise<string> => {
    const apiKey = pollinationsApiKey;

    const streamResponseData = async (
      response: Response,
      streamProvider: string,
    ): Promise<string> => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      const toolSearch = response.headers.get("X-Tool-Search");
      if (toolSearch) {
        const query = decodeURIComponent(toolSearch);
        fullContent += `<tool_call>{"name":"Web Search", "args":{"query":"${query}"}}</tool_call>\n\n`;
        streamCallback(fullContent);
      }

      let streamBuffer = "";
      const translator = createSseDeltaTranslator();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;
            const dataStr = line.replace("data: ", "");
            if (dataStr === "[DONE]") break;

            try {
              const data = JSON.parse(dataStr);
              if (data.error) throw new Error(data.error);
              if (data.queue_info) setQueueStatus(data.queue_info);

              let delta = "";
              if (streamProvider === "google") {
                delta =
                  data.delta?.content ||
                  data.message?.content?.text ||
                  data.candidates?.[0]?.content?.parts?.[0]?.text ||
                  "";
                const fc =
                  data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
                if (fc) {
                  delta += `<tool_call>\n{"name": ${JSON.stringify(fc.name)}, "args": ${JSON.stringify(fc.args)}}\n</tool_call>`;
                }
              } else if (streamProvider === "ollama") {
                delta = data.message?.content || data.response || "";
              } else {
                delta = translator.translate(data);
              }

              if (delta) {
                setQueueStatus(null);
                fullContent += delta;
                streamCallback(fullContent);
              }
            } catch (e: any) {
              if (
                e.message &&
                e.message !== "Unexpected end of JSON input" &&
                !e.message.includes("JSON")
              ) {
                toast.error(e.message);
              }
            }
          }
        }

        const flushed = translator.flush();
        if (flushed) {
          fullContent += flushed;
          streamCallback(fullContent);
        }
      }
      return fullContent;
    };

    const runHordeFallback = async (
      fallbackModelId: string,
      reason: "rate_limit" | "not_found" | "auth_required" = "rate_limit",
    ): Promise<string> => {
      onFallback?.(fallbackModelId);
      setAllMessages((prevAll) =>
        prevAll.map((m) =>
          m.id === "temp-streaming"
            ? {
                ...m,
                usedFallback: true,
                fallbackModel: fallbackModelId,
                fallbackReason: reason,
              }
            : m,
        ),
      );
      if (reason === "auth_required") {
        toast.warning(
          t(
            "apps.pollinations401FallbackWarning",
            { model: fallbackModelId },
            `Pollinations requires an API key (HTTP 401). Falling back to AI Horde backup (${fallbackModelId}). You can add a key from enter.pollinations.ai in Models settings.`,
          ),
        );
      } else if (reason === "not_found") {
        toast.warning(
          t(
            "apps.pollinations404FallbackWarning",
            { model: fallbackModelId },
            `Pollinations returned a 404 (Not Found) error. Falling back to AI Horde backup (${fallbackModelId}). Quality may be decreased.`,
          ),
        );
      } else {
        toast.warning(
          t(
            "apps.defaultModelFallbackWarning",
            { model: fallbackModelId },
            `The main default model (Ling 3.1 Flash) is currently unavailable (rate limited). Falling back to AI Horde (${fallbackModelId}). Quality may be decreased.`,
          ),
        );
      }

      const fetchOptions: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        signal,
        body: JSON.stringify({
          provider: "horde",
          model: fallbackModelId,
          messages: msgs,
          stream: true,
        }),
      };

      const res = await fetch("/api/ai/proxy", fetchOptions);
      if (!res.ok) {
        throw new Error(await parseAiProxyError(res));
      }
      return await streamResponseData(res, "horde");
    };

    if (provider === "pollinations") {
      const isDirectKey = Boolean(
        apiKey &&
          (apiKey.startsWith("pk_") || apiKey.startsWith("sk_")) &&
          !apiKey.includes("...") &&
          apiKey.length > 20,
      );
      if (!isDirectKey && session?.access_token) {
        try {
          const fetchOptions: RequestInit = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            signal,
            body: JSON.stringify({
              provider: "pollinations",
              model: model || "inclusionai/ling-3.1-flash",
              messages: msgs,
              stream: true,
            }),
          };
          const res = await fetch("/api/ai/proxy", fetchOptions);
          if (!res.ok) {
            const errStatus = res.status;
            const errMsg = await parseAiProxyError(res);
            const is401 =
              errStatus === 401 ||
              errStatus === 403 ||
              errMsg.includes("401") ||
              errMsg.includes("403") ||
              errMsg.toLowerCase().includes("unauthorized") ||
              errMsg.toLowerCase().includes("api key");
            const is404 = errStatus === 404 || errMsg.includes("404");
            const fallbackReason: "rate_limit" | "not_found" | "auth_required" =
              is401 ? "auth_required" : is404 ? "not_found" : "rate_limit";

            try {
              return await runHordeFallback(
                HORDE_FALLBACK_FAST_MODEL,
                fallbackReason,
              );
            } catch (fastErr: any) {
              return await runHordeFallback(
                HORDE_FALLBACK_SMART_MODEL,
                fallbackReason,
              );
            }
          }
          return await streamResponseData(res, "pollinations");
        } catch (err: any) {
          if (signal.aborted) throw err;
          console.warn(
            "Pollinations proxy stream failed, falling back to Horde:",
            err,
          );
          try {
            return await runHordeFallback(
              HORDE_FALLBACK_FAST_MODEL,
              "rate_limit",
            );
          } catch (fastErr: any) {
            return await runHordeFallback(
              HORDE_FALLBACK_SMART_MODEL,
              "rate_limit",
            );
          }
        }
      }

      try {
        let directContent = "";
        await streamPollinationsClient({
          model: model || "inclusionai/ling-3.1-flash",
          messages: msgs.map((m) => ({
            role: (m.role || "user") as "system" | "user" | "assistant",
            content: m.content || "",
          })),
          signal,
          apiKey: isDirectKey ? apiKey : undefined,
          onChunk: (delta) => {
            directContent += delta;
            streamCallback(directContent);
          },
          onQueueInfo: (q) => setQueueStatus(q),
        });
        return directContent;
      } catch (err: any) {
        if (signal.aborted) throw err;
        const is401 =
          err instanceof PollinationsAuthError ||
          err?.statusCode === 401 ||
          err?.statusCode === 403 ||
          err?.message?.includes("401") ||
          err?.message?.includes("403");
        const is404 =
          err instanceof PollinationsNotFoundError ||
          err?.statusCode === 404 ||
          err?.message?.includes("404");
        const isRateLimit =
          err instanceof PollinationsRateLimitError ||
          err?.statusCode === 429;
        const is402 =
          err?.statusCode === 402 ||
          err?.message?.includes("402");

        if (is401 || is404 || isRateLimit || is402) {
          const fallbackReason: "rate_limit" | "not_found" | "auth_required" = is401
            ? "auth_required"
            : is404
            ? "not_found"
            : "rate_limit";
          try {
            return await runHordeFallback(
              HORDE_FALLBACK_FAST_MODEL,
              fallbackReason,
            );
          } catch (fastErr: any) {
            console.warn(
              "Horde Fast fallback failed, attempting Smart fallback:",
              fastErr,
            );
            return await runHordeFallback(
              HORDE_FALLBACK_SMART_MODEL,
              fallbackReason,
            );
          }
        } else {
          throw err;
        }
      }
    }

    let url = "/api/ai/proxy";
    let fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      signal,
      body: JSON.stringify({
        provider: provider,
        model: model,
        messages: msgs,
        stream: true,
        apiKey: apiKey || undefined,
      }),
    };

    if (provider.startsWith("local-")) {
      if (provider === "local-ollama")
        url = "http://127.0.0.1:11434/v1/chat/completions";
      else if (provider === "local-lmstudio")
        url = "http://127.0.0.1:1234/v1/chat/completions";
      else if (provider === "local-kobold")
        url = "http://127.0.0.1:5001/v1/chat/completions";

      fetchOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify({
          model: model,
          messages: msgs,
          stream: true,
        }),
      };
    }

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (fetchErr) {
      if (url.includes("127.0.0.1")) {
        const fallbackUrl = url.replace("127.0.0.1", "localhost");
        response = await fetch(fallbackUrl, fetchOptions);
      } else if (url.includes("localhost")) {
        const fallbackUrl = url.replace("localhost", "127.0.0.1");
        response = await fetch(fallbackUrl, fetchOptions);
      } else {
        throw fetchErr;
      }
    }

    if (!response.ok) {
      const errText = await parseAiProxyError(response);
      throw new Error(errText);
    }

    return await streamResponseData(response, provider);
  };

  const getInjectedSystemPrompt = (): string => {
    const nowObj = new Date();
    const dateStr = nowObj.toISOString().split("T")[0];
    const fullDateStr = nowObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let injected =
      `Current Date: ${dateStr} (${fullDateStr}). You are always aware of today's real-world date; do not hallucinate past training cutoffs or older years.\n\n` +
      "You can use Markdown to format your messages. This is fully supported by the chat interface.\n\n" +
      WEBSITE_KNOWLEDGE_SYSTEM_PROMPT +
      "\n\n";
    if (selectedLlmCharacter) {
      const char = availableCharacters.find(
        (c) => c.id === selectedLlmCharacter,
      );
      if (char) {
        injected += `You are playing the role of: ${char.display_name || char.name}.\n`;
        if (char.race_id) {
          const race = availableCharacters.find((c) => c.id === char.race_id);
          if (race) {
            injected += `Race / Species: ${race.display_name || race.name}\n`;
            if (race.appearance)
              injected += `Racial Traits & Physiology: ${race.appearance}\n`;
            if (race.personality)
              injected += `Racial Culture & Behaviors: ${race.personality}\n`;
            if (race.backstory)
              injected += `Racial Origins & Lore: ${race.backstory}\n`;
          }
        }
        if (char.short_description)
          injected += `Description: ${char.short_description}\n`;
        if (char.appearance) injected += `Appearance: ${char.appearance}\n`;
        if (char.personality) injected += `Personality: ${char.personality}\n`;
        if (char.backstory) injected += `Backstory: ${char.backstory}\n`;
        if (char.situation)
          injected += `Current Situation & Abilities: ${char.situation}\n`;
        if (
          char.stats_enabled &&
          char.stats &&
          typeof char.stats === "object"
        ) {
          const statLines: string[] = [];
          const statDefs = [
            { key: "str", label: "Strength (STR)" },
            { key: "dex", label: "Dexterity (DEX)" },
            { key: "con", label: "Constitution (CON)" },
            { key: "int", label: "Intelligence (INT)" },
            { key: "wis", label: "Wisdom (WIS)" },
            { key: "cha", label: "Charisma (CHA)" },
          ];
          for (const { key, label } of statDefs) {
            const val = (char.stats as any)[key];
            if (val !== undefined && val !== null && val !== "") {
              statLines.push(`- ${label}: ${val}`);
            }
          }
          if (statLines.length > 0) {
            injected += `Attributes / Stats:\n${statLines.join("\n")}\n`;
          }
        }
      }
    }
    if (selectedUserCharacter) {
      const char = availableCharacters.find(
        (c) => c.id === selectedUserCharacter,
      );
      if (char) {
        injected += `\nThe user is playing the role of: ${char.display_name || char.name}.\n`;
        if (char.race_id) {
          const race = availableCharacters.find((c) => c.id === char.race_id);
          if (race) {
            injected += `User Race / Species: ${race.display_name || race.name}\n`;
            if (race.appearance)
              injected += `User Racial Traits & Physiology: ${race.appearance}\n`;
            if (race.personality)
              injected += `User Racial Culture & Behaviors: ${race.personality}\n`;
            if (race.backstory)
              injected += `User Racial Origins & Lore: ${race.backstory}\n`;
          }
        }
        if (char.short_description)
          injected += `Description: ${char.short_description}\n`;
        if (char.appearance) injected += `Appearance: ${char.appearance}\n`;
        if (char.personality) injected += `Personality: ${char.personality}\n`;
        if (char.backstory) injected += `Backstory: ${char.backstory}\n`;
        if (char.situation)
          injected += `Current Situation & Abilities: ${char.situation}\n`;
        if (
          char.stats_enabled &&
          char.stats &&
          typeof char.stats === "object"
        ) {
          const statLines: string[] = [];
          const statDefs = [
            { key: "str", label: "Strength (STR)" },
            { key: "dex", label: "Dexterity (DEX)" },
            { key: "con", label: "Constitution (CON)" },
            { key: "int", label: "Intelligence (INT)" },
            { key: "wis", label: "Wisdom (WIS)" },
            { key: "cha", label: "Charisma (CHA)" },
          ];
          for (const { key, label } of statDefs) {
            const val = (char.stats as any)[key];
            if (val !== undefined && val !== null && val !== "") {
              statLines.push(`- ${label}: ${val}`);
            }
          }
          if (statLines.length > 0) {
            injected += `User Attributes / Stats:\n${statLines.join("\n")}\n`;
          }
        }
      }
    }
    if (selectedUniverse) {
      const uni = availableCharacters.find((c) => c.id === selectedUniverse);
      if (uni) {
        injected += `\nThis interaction takes place in the universe of: ${uni.display_name || uni.name}.\n`;
        if (uni.short_description)
          injected += `Description: ${uni.short_description}\n`;
        if (uni.appearance) injected += `Setting details: ${uni.appearance}\n`;
        if (uni.personality)
          injected += `Tone/Atmosphere: ${uni.personality}\n`;
        if (uni.backstory) injected += `Lore/History: ${uni.backstory}\n`;
      }
    }
    return injected;
  };

  const executeAiGeneration = async (
    baseChatMessages: Message[],
    signal: AbortSignal,
  ): Promise<{
    finalContent: string;
    reasoningContent: string;
    isWebSearch: boolean;
    usedFallback?: boolean;
    fallbackModel?: string;
  }> => {
    let finalContent = "";
    let reasoningContent = "";
    const effectiveProvider = selectedProvider;
    const effectiveModel = selectedModel;

    const injectedSystemPrompt = getInjectedSystemPrompt();
    const getApiMessages = (baseMessages: Message[]): Message[] => {
      if (!injectedSystemPrompt) return baseMessages;
      return [
        {
          role: "system",
          content: `[SYSTEM INSTRUCTIONS]\n${injectedSystemPrompt.trim()}\n[END SYSTEM INSTRUCTIONS]`,
        },
        ...baseMessages,
      ];
    };

    // 1. Web Search / Agentic Research (if enabled)
    if (isWebSearchEnabled) {
      setAllMessages((prevAll) =>
        prevAll.map((m) =>
          m.id === "temp-streaming"
            ? {
                ...m,
                is_web_search: true,
                web_search_status: "searching",
              }
            : m,
        ),
      );

      const planPrompt = `Formulate a targeted web search query and response format to research and answer my request.\nRespond ONLY with a valid JSON object in this exact structure:\n{\n  "query": "<search query to look up on the web>",\n  "responseFormat": "<conclusion | summary | analysis | description | comparison>"\n}`;

      const searchPlanMessages = [
        ...baseChatMessages,
        { role: "user", content: planPrompt } as Message,
      ];

      let searchPlanningText = "";
      const planOutput = await callAiStream(
        effectiveProvider,
        effectiveModel,
        getApiMessages(searchPlanMessages),
        signal,
        (content) => {
          searchPlanningText = content;
        },
      );

      let parsedQuery =
        baseChatMessages[baseChatMessages.length - 1]?.content || "";
      let parsedFormat = "conclusion";

      try {
        const match = (planOutput || searchPlanningText).match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (typeof parsed.query === "string" && parsed.query.trim()) {
            parsedQuery = parsed.query.trim();
          }
          if (
            typeof parsed.responseFormat === "string" &&
            parsed.responseFormat.trim()
          ) {
            parsedFormat = parsed.responseFormat.trim();
          }
        }
      } catch {}

      const token = session?.access_token || (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) {
        throw new Error("Please sign in to use Web Search.");
      }

      const finalResearchProvider = "pollinations";
      const finalResearchModel =
        selectedModel || researchAgentDefaultModel || "inclusionai/ling-3.1-flash";
      const finalApiKey = pollinationsApiKey || undefined;

      const agentRes = await fetch("/api/ai/agent-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: parsedQuery,
          responseFormat: parsedFormat,
          researchOnly: true,
          stream: true,
          researchModel: finalResearchModel,
          researchProvider: finalResearchProvider,
          summarizerModel: finalResearchModel,
          summarizerProvider: finalResearchProvider,
          apiKey: finalApiKey,
        }),
        signal,
      });

      if (!agentRes.ok) {
        const errText = await parseAiProxyError(agentRes);
        throw new Error(errText);
      }

      const reader = agentRes.body?.getReader();
      const decoder = new TextDecoder();
      let streamBuf = "";
      let searchFindings = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuf += decoder.decode(value, { stream: true });
          const lines = streamBuf.split("\n");
          streamBuf = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;
            const dataStr = line.replace(/^data: /, "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const data = JSON.parse(dataStr);
              if (data.type === "research_complete" && data.context) {
                searchFindings = data.context;
              } else if (data.type === "result" && data.content) {
                if (!searchFindings) searchFindings = data.content;
              } else if (data.type === "delta" && data.content) {
                searchFindings += data.content;
              }
            } catch {}
          }
        }
      }

      setAllMessages((prevAll) =>
        prevAll.map((m) =>
          m.id === "temp-streaming"
            ? {
                ...m,
                is_web_search: true,
                web_search_status: "searched",
              }
            : m,
        ),
      );

    let hadFallback = false;
    let fallbackModelUsed: string | undefined = undefined;
    const onFallback = (modelUsed?: string) => {
      hadFallback = true;
      if (modelUsed) fallbackModelUsed = modelUsed;
    };

    // Perform synthesis with the selected chatbot model
    if (isReasoningEnabled) {
      const reasoningMessages = [
        ...baseChatMessages,
        {
          role: "assistant",
          content: `Web Search Findings:\n${searchFindings || "No search findings gathered."}`,
        } as Message,
        {
          role: "user",
          content:
            "Based on the web search findings above, please think step-by-step about my last request. Output your internal reasoning process and analysis. DO NOT output the final response to the user yet, just your thoughts.",
        } as Message,
      ];

      reasoningContent = await callAiStream(
        effectiveProvider,
        effectiveModel,
        getApiMessages(reasoningMessages),
        signal,
        (content) => {
          setAllMessages((prevAll) =>
            prevAll.map((m) =>
              m.id === "temp-streaming" ? { ...m, reasoning: content } : m,
            ),
          );
        },
        onFallback,
      );

      const finalMessages = [
        ...baseChatMessages,
        {
          role: "assistant",
          content: `Web Search Findings:\n${searchFindings || "No search findings gathered."}\n\nMy internal reasoning:\n${reasoningContent}`,
        } as Message,
        {
          role: "user",
          content:
            "Great. Now based on your web search findings and reasoning, provide the final response.",
        } as Message,
      ];

      finalContent = await callAiStream(
        effectiveProvider,
        effectiveModel,
        getApiMessages(finalMessages),
        signal,
        (content) => {
          setAllMessages((prevAll) =>
            prevAll.map((m) =>
              m.id === "temp-streaming" ? { ...m, content } : m,
            ),
          );
        },
        onFallback,
      );
    } else {
      const synthesisMessages = [
        ...baseChatMessages,
        {
          role: "assistant",
          content: `Web Search Findings:\n${searchFindings || "No search findings gathered."}`,
        } as Message,
        {
          role: "user",
          content:
            "Based on the web search findings above, synthesize a high-quality, comprehensive, and well-structured response to answer my request. Cite sources where relevant.",
        } as Message,
      ];

      finalContent = await callAiStream(
        effectiveProvider,
        effectiveModel,
        getApiMessages(synthesisMessages),
        signal,
        (content) => {
          setAllMessages((prevAll) =>
            prevAll.map((m) =>
              m.id === "temp-streaming" ? { ...m, content } : m,
            ),
          );
        },
        onFallback,
      );
    }

    return {
      finalContent,
      reasoningContent: reasoningContent || null,
      isWebSearch: true,
      usedFallback: hadFallback,
      fallbackModel: fallbackModelUsed,
    };
  } else if (isReasoningEnabled) {
    let hadFallback = false;
    let fallbackModelUsed: string | undefined = undefined;
    const onFallback = (modelUsed?: string) => {
      hadFallback = true;
      if (modelUsed) fallbackModelUsed = modelUsed;
    };

    // Reasoning only (no web search)
    const reasoningMessages = [
      ...baseChatMessages,
      {
        role: "user",
        content:
          "Please think step-by-step about my last request. Output your internal reasoning process and analysis. DO NOT output the final response to the user yet, just your thoughts.",
      } as Message,
    ];

    reasoningContent = await callAiStream(
      effectiveProvider,
      effectiveModel,
      getApiMessages(reasoningMessages),
      signal,
      (content) => {
        setAllMessages((prevAll) =>
          prevAll.map((m) =>
            m.id === "temp-streaming" ? { ...m, reasoning: content } : m,
          ),
        );
      },
      onFallback,
    );

    const finalMessages = [
      ...baseChatMessages,
      {
        role: "assistant",
        content: `My internal reasoning: \n${reasoningContent}`,
      } as Message,
      {
        role: "user",
        content:
          "Great. Now based on your reasoning, provide the final response.",
      } as Message,
    ];
    finalContent = await callAiStream(
      effectiveProvider,
      effectiveModel,
      getApiMessages(finalMessages),
      signal,
      (content) => {
        setAllMessages((prevAll) =>
          prevAll.map((m) =>
            m.id === "temp-streaming" ? { ...m, content } : m,
          ),
        );
      },
      onFallback,
    );

    return {
      finalContent,
      reasoningContent,
      isWebSearch: false,
      usedFallback: hadFallback,
      fallbackModel: fallbackModelUsed,
    };
  } else {
    let hadFallback = false;
    let fallbackModelUsed: string | undefined = undefined;
    const onFallback = (modelUsed?: string) => {
      hadFallback = true;
      if (modelUsed) fallbackModelUsed = modelUsed;
    };

    // Direct completion
    finalContent = await callAiStream(
      effectiveProvider,
      effectiveModel,
      getApiMessages(baseChatMessages),
      signal,
      (content) => {
        setAllMessages((prevAll) =>
          prevAll.map((m) =>
            m.id === "temp-streaming" ? { ...m, content } : m,
          ),
        );
      },
      onFallback,
    );

    return {
      finalContent,
      reasoningContent: "",
      isWebSearch: false,
      usedFallback: hadFallback,
      fallbackModel: fallbackModelUsed,
    };
  }
  };

  const handleSendMessage = async (textOverride?: string, fromVoice: boolean = false) => {
    if (fromVoice) {
      isVoiceInputRef.current = true;
    }
    const rawInput = typeof textOverride === "string" ? textOverride : input;
    if (!rawInput.trim() || isTyping) return;

    const isGuest = !session?.user?.id;
    let activeChatId = currentChatId;

    if (!activeChatId) {
      const title = "New Chat";
      if (!isGuest) {
        let chatPayload: any = {
          user_id: session!.user.id,
          title: title,
          llm_character_id: selectedLlmCharacter,
          user_character_id: selectedUserCharacter,
          universe_id: selectedUniverse,
        };

        if (isCategoryEncryptionEnabled("chatbot")) {
          const key = getActiveMasterKey();
          if (key) {
            chatPayload = await encryptChatData(chatPayload, key);
          }
        }

        const { data, error } = await supabase
          .from("chats")
          .insert(chatPayload)
          .select()
          .single();

        if (error) {
          toast.error(error.message);
          return;
        }

        activeChatId = data.id;
        setChats((prev) => [{ ...data, title }, ...prev]);
      } else {
        activeChatId = "guest-chat-" + Math.random().toString(36).substring(2);
        setChats(
          (prev) =>
            [
              {
                id: activeChatId,
                title,
                llm_character_id: null,
                user_character_id: null,
                universe_id: null,
              },
              ...prev,
            ] as any,
        );
      }
      skipNextFetchRef.current = activeChatId;
      setCurrentChatId(activeChatId);
    }

    const controller = new AbortController();
    setAbortController(controller);

    const originalInput = rawInput;
    const lastMessageId =
      messages.length > 0 ? messages[messages.length - 1].id : null;
    const userMessage: Message = {
      id: "temp-user",
      parent_id: lastMessageId,
      role: "user",
      content: rawInput,
    };
    const isFirstMessage = messages.length === 0;

    setAllMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: "temp-streaming",
        parent_id: "temp-user",
        role: "assistant",
        content: "",
        is_web_search: isWebSearchEnabled,
        web_search_status: isWebSearchEnabled ? "searching" : undefined,
      },
    ]);
    activeChildrenRef.current = {
      ...activeChildrenRef.current,
      [lastMessageId || "root"]: "temp-user",
      "temp-user": "temp-streaming",
    };
    setActiveChildren(activeChildrenRef.current);
    if (!textOverride) setInput("");
    setIsTyping(true);
    isTypingRef.current = true;
    setQueueStatus(null);

    try {
      // 1. Title generation on first message
      if (isFirstMessage) {
        generateChatTitle(activeChatId, originalInput);
      }

      // 2. Save User Message
      let userMsgData = {
        id: "msg-" + Math.random().toString(36).substring(2),
      };
      if (!isGuest) {
        let userInsertPayload: any = {
          parent_id: lastMessageId,
          chat_id: activeChatId,
          role: "user",
          content: originalInput,
        };

        if (isCategoryEncryptionEnabled("chatbot")) {
          const key = getActiveMasterKey();
          if (key) {
            userInsertPayload = await encryptChatMessageData(
              userInsertPayload,
              key,
            );
          }
        }

        const { data, error: userInsertError } = await supabase
          .from("chatbot_messages")
          .insert(userInsertPayload)
          .select()
          .single();

        if (userInsertError) throw userInsertError;
        userMsgData = data;
      }

      // Update temp-user id to real id in messages
      setAllMessages((prev) =>
        prev.map((m) => {
          if (m.id === "temp-user") return { ...m, id: userMsgData.id };
          if (m.parent_id === "temp-user")
            return { ...m, parent_id: userMsgData.id };
          return m;
        }),
      );
      activeChildrenRef.current = {
        ...activeChildrenRef.current,
        [lastMessageId || "root"]: userMsgData.id,
        [userMsgData.id]: "temp-streaming",
      };
      setActiveChildren(activeChildrenRef.current);

      if (isImageGenEnabled) {
        setAllMessages((prev) =>
          prev.map((m) =>
            m.id === "temp-streaming"
              ? {
                  ...m,
                  content: "Generating image with AI...",
                  is_image_gen: true,
                }
              : m,
          ),
        );

        const imgResult = await generateImage(
          {
            provider: chatImageProvider,
            model: chatImageModel,
            prompt: originalInput,
            aspectRatio: "1:1",
            signal: controller.signal,
          },
          (prog) => {
            setAllMessages((prev) =>
              prev.map((m) =>
                m.id === "temp-streaming"
                  ? {
                      ...m,
                      content: prog.message || "Generating image...",
                      is_image_gen: true,
                    }
                  : m,
              ),
            );
          },
        );

        const modelDisplayName =
          chatImageModels.horde.find((m) => m.id === chatImageModel)?.name ||
          "SDXL 1.0 (Horde)";

        let insertData: any = {
          parent_id: userMsgData.id,
          chat_id: activeChatId,
          role: "assistant",
          content: originalInput,
          is_image_gen: true,
          image_url: imgResult.url,
          image_model: modelDisplayName,
        };

        let assistantMsgData = {
          id: "msg-" + Math.random().toString(36).substring(2),
        };

        if (!isGuest) {
          let assistantInsertPayload: any = { ...insertData };
          if (isCategoryEncryptionEnabled("chatbot")) {
            const key = getActiveMasterKey();
            if (key) {
              assistantInsertPayload = await encryptChatMessageData(
                assistantInsertPayload,
                key,
              );
            }
          }

          const { data, error: assistantInsertError } = await supabase
            .from("chatbot_messages")
            .insert(assistantInsertPayload)
            .select()
            .single();

          if (assistantInsertError) {
            const fallbackPayload = {
              parent_id: userMsgData.id,
              chat_id: activeChatId,
              role: "assistant",
              content: `![${originalInput}](${imgResult.url})`,
            };
            const { data: retryData, error: retryError } = await supabase
              .from("chatbot_messages")
              .insert(fallbackPayload)
              .select()
              .single();
            if (!retryError && retryData) {
              assistantMsgData = retryData;
            }
          } else {
            assistantMsgData = data;
          }
        }

        setAllMessages((prev) =>
          prev.map((m) =>
            m.id === "temp-user"
              ? { ...m, id: userMsgData.id }
              : m.id === "temp-streaming"
              ? {
                  ...m,
                  id: assistantMsgData.id,
                  parent_id: userMsgData.id,
                  content: originalInput,
                  is_image_gen: true,
                  image_url: imgResult.url,
                  image_model: modelDisplayName,
                }
              : m,
          ),
        );

        activeChildrenRef.current = {
          ...activeChildrenRef.current,
          [lastMessageId || "root"]: userMsgData.id,
          [userMsgData.id]: assistantMsgData.id,
        };
        delete activeChildrenRef.current["temp-user"];
        setActiveChildren(activeChildrenRef.current);

        if (!isGuest) {
          await supabase
            .from("chats")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", activeChatId);
        }

        if (fromVoice || isVoiceInputRef.current) {
          isVoiceInputRef.current = false;
          liveVoice.speakText("I have generated the image for you.");
        }

        return;
      }

      let currentMessages = [...messages, userMessage];
      let iterations = 0;
      let shouldContinue = true;

      while (shouldContinue && iterations < 5) {
        iterations++;
        shouldContinue = false;

        const {
          finalContent,
          reasoningContent,
          isWebSearch,
          usedFallback,
          fallbackModel,
        } = await executeAiGeneration(currentMessages, controller.signal);

        let insertData: any = {
          parent_id: userMsgData.id,
          chat_id: activeChatId,
          role: "assistant",
          content: finalContent,
          reasoning: reasoningContent || null,
          is_web_search: isWebSearch || false,
          usedFallback: usedFallback || false,
          fallbackModel: fallbackModel || null,
        };

        let assistantMsgData = {
          id: "msg-" + Math.random().toString(36).substring(2),
        };
        if (!isGuest) {
          let assistantInsertPayload: any = { ...insertData };
          if (isCategoryEncryptionEnabled("chatbot")) {
            const key = getActiveMasterKey();
            if (key) {
              assistantInsertPayload = await encryptChatMessageData(
                assistantInsertPayload,
                key,
              );
            }
          }

          const { data, error: assistantInsertError } = await supabase
            .from("chatbot_messages")
            .insert(assistantInsertPayload)
            .select()
            .single();

          if (assistantInsertError) {
            let retryPayload = { ...assistantInsertPayload };
            let hasAdjusted = false;
            if (
              assistantInsertError.message?.includes("reasoning") ||
              assistantInsertError.details?.includes("reasoning")
            ) {
              delete retryPayload.reasoning;
              hasAdjusted = true;
            }
            if (
              assistantInsertError.message?.includes("is_web_search") ||
              assistantInsertError.details?.includes("is_web_search")
            ) {
              delete retryPayload.is_web_search;
              hasAdjusted = true;
            }
            if (
              assistantInsertError.message?.includes("usedFallback") ||
              assistantInsertError.details?.includes("usedFallback")
            ) {
              delete retryPayload.usedFallback;
              hasAdjusted = true;
            }
            if (
              assistantInsertError.message?.includes("fallbackModel") ||
              assistantInsertError.details?.includes("fallbackModel")
            ) {
              delete retryPayload.fallbackModel;
              hasAdjusted = true;
            }
            if (hasAdjusted) {
              const { data: retryData, error: retryError } = await supabase
                .from("chatbot_messages")
                .insert(retryPayload)
                .select()
                .single();
              if (retryError) throw retryError;
              assistantMsgData = retryData;
            } else {
              throw assistantInsertError;
            }
          } else {
            assistantMsgData = data;
          }
        }

        // Update active state
        setAllMessages((prev) =>
          prev.map((m) =>
            m.id === "temp-user"
              ? { ...m, id: userMsgData.id }
              : m.id === "temp-streaming"
              ? {
                  ...m,
                  id: assistantMsgData.id,
                  parent_id: userMsgData.id,
                  content: finalContent,
                  reasoning: reasoningContent || undefined,
                  is_web_search: isWebSearch || false,
                  web_search_status: undefined,
                  usedFallback: usedFallback || false,
                  fallbackModel: fallbackModel || undefined,
                }
              : m,
          ),
        );
        activeChildrenRef.current = {
          ...activeChildrenRef.current,
          [lastMessageId || "root"]: userMsgData.id,
          [userMsgData.id]: assistantMsgData.id,
        };
        delete activeChildrenRef.current["temp-user"];
        setActiveChildren(activeChildrenRef.current);

        if (!isGuest) {
          const { error: chatUpdateError } = await supabase
            .from("chats")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", activeChatId);
          if (chatUpdateError) throw chatUpdateError;
        }

        if (fromVoice || isVoiceInputRef.current) {
          isVoiceInputRef.current = false;
          if (finalContent && finalContent.trim()) {
            liveVoice.speakText(finalContent);
          } else {
            liveVoice.speakText("I didn't receive a response.");
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message);
      if (input === "") setInput(originalInput);
      if (fromVoice || isVoiceInputRef.current) {
        isVoiceInputRef.current = false;
        liveVoice.speakText(
          `Sorry, an error occurred: ${e?.message || "Failed to generate response"}`,
        );
      }
      setAllMessages((prev) =>
        prev.filter((m) => m.id !== "temp-streaming" && m.id !== "temp-user"),
      );
    } finally {
      setIsTyping(false);
      isTypingRef.current = false;
      setQueueStatus(null);
      setAbortController(null);
    }
  };

  const handleRegenerate = useCallback(async () => {
    if (isTyping || !currentChatId || messages.length < 2) return;
    const isGuest = !session?.user?.id;

    // Get the last user message to regenerate from
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMessage || !lastUserMessage.id) return;

    // We basically simulate sending an empty message but we use the existing messages array
    const originalInput = ""; // Not adding a new user message

    const controller = new AbortController();
    setAbortController(controller);

    setAllMessages((prev) => [
      ...prev,
      {
        id: "temp-streaming",
        parent_id: lastUserMessage.id,
        role: "assistant",
        content: "",
        is_web_search: isWebSearchEnabled,
        web_search_status: isWebSearchEnabled ? "searching" : undefined,
      },
    ]);
    const previousActiveChild = activeChildrenRef.current[lastUserMessage.id];
    activeChildrenRef.current = {
      ...activeChildrenRef.current,
      [lastUserMessage.id]: "temp-streaming",
    };
    setActiveChildren(activeChildrenRef.current);
    setIsTyping(true);
    isTypingRef.current = true;
    setQueueStatus(null);

    try {
      const lastUserMessageIndex = messages.findIndex(
        (m) => m.id === lastUserMessage.id,
      );
      let currentMessages = messages.slice(0, lastUserMessageIndex + 1);

      const {
        finalContent,
        reasoningContent,
        isWebSearch,
        usedFallback,
        fallbackModel,
      } = await executeAiGeneration(currentMessages, controller.signal);

      let insertData: any = {
        chat_id: currentChatId,
        parent_id: lastUserMessage.id,
        role: "assistant",
        content: finalContent,
        reasoning: reasoningContent || null,
        is_web_search: isWebSearch || false,
        usedFallback: usedFallback || false,
        fallbackModel: fallbackModel || null,
      };

      let assistantMsgData = {
        id: "msg-" + Math.random().toString(36).substring(2),
      };

      if (!isGuest) {
        let assistantInsertPayload: any = { ...insertData };
        if (isCategoryEncryptionEnabled("chatbot")) {
          const key = getActiveMasterKey();
          if (key) {
            assistantInsertPayload = await encryptChatMessageData(
              assistantInsertPayload,
              key,
            );
          }
        }

        const { data, error: assistantInsertError } = await supabase
          .from("chatbot_messages")
          .insert(assistantInsertPayload)
          .select()
          .single();

        if (assistantInsertError) {
          let retryPayload = { ...assistantInsertPayload };
          let hasAdjusted = false;
          if (
            assistantInsertError.message?.includes("reasoning") ||
            assistantInsertError.details?.includes("reasoning")
          ) {
            delete retryPayload.reasoning;
            hasAdjusted = true;
          }
          if (
            assistantInsertError.message?.includes("is_web_search") ||
            assistantInsertError.details?.includes("is_web_search")
          ) {
            delete retryPayload.is_web_search;
            hasAdjusted = true;
          }
          if (
            assistantInsertError.message?.includes("usedFallback") ||
            assistantInsertError.details?.includes("usedFallback")
          ) {
            delete retryPayload.usedFallback;
            hasAdjusted = true;
          }
          if (
            assistantInsertError.message?.includes("fallbackModel") ||
            assistantInsertError.details?.includes("fallbackModel")
          ) {
            delete retryPayload.fallbackModel;
            hasAdjusted = true;
          }
          if (hasAdjusted) {
            const { data: retryData, error: retryError } = await supabase
              .from("chatbot_messages")
              .insert(retryPayload)
              .select()
              .single();
            if (retryError) throw retryError;
            assistantMsgData = retryData;
          } else {
            throw assistantInsertError;
          }
        } else {
          assistantMsgData = data;
        }
      }

      setAllMessages((prev) =>
        prev.map((m) =>
          m.id === "temp-streaming"
            ? {
                ...m,
                id: assistantMsgData.id,
                content: finalContent,
                reasoning: reasoningContent || undefined,
                is_web_search: isWebSearch || false,
                web_search_status: undefined,
                usedFallback: usedFallback || false,
                fallbackModel: fallbackModel || undefined,
              }
            : m,
        ),
      );
      activeChildrenRef.current = {
        ...activeChildrenRef.current,
        [lastUserMessage.id]: assistantMsgData.id,
      };
      setActiveChildren(activeChildrenRef.current);
    } catch (e: any) {
      toast.error(e.message);
      activeChildrenRef.current = {
        ...activeChildrenRef.current,
        [lastUserMessage.id]: previousActiveChild,
      };
      setActiveChildren(activeChildrenRef.current);
      setAllMessages((prev) => prev.filter((m) => m.id !== "temp-streaming"));
    } finally {
      setIsTyping(false);
      isTypingRef.current = false;
      setQueueStatus(null);
      setAbortController(null);
    }
  }, [
    messages,
    isTyping,
    currentChatId,
    selectedProvider,
    selectedModel,
    isReasoningEnabled,
    isWebSearchEnabled,
    selectedLlmCharacter,
    availableCharacters,
  ]);

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
    }
    liveVoice.stopSpeaking();
    liveVoice.cancelRecording();
    setSpeakingMessageId(null);
    isVoiceInputRef.current = false;
  };

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
    handleStopRef.current = handleStop;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "INPUT"
      )
        return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const latestAssistant = messages
          .slice()
          .reverse()
          .find((m) => m.role === "assistant");
        if (!latestAssistant || isTyping || !latestAssistant.id) return;

        const parentId = latestAssistant.parent_id || "root";
        const siblings = allMessages.filter(
          (m) => (m.parent_id || "root") === parentId,
        );
        const currentIndex = siblings.findIndex(
          (s) => s.id === latestAssistant.id,
        );

        if (e.key === "ArrowLeft" && currentIndex > 0) {
          activeChildrenRef.current = {
            ...activeChildrenRef.current,
            [parentId]: siblings[currentIndex - 1].id!,
          };
          setActiveChildren(activeChildrenRef.current);
        } else if (e.key === "ArrowRight") {
          if (currentIndex < siblings.length - 1) {
            activeChildrenRef.current = {
              ...activeChildrenRef.current,
              [parentId]: siblings[currentIndex + 1].id!,
            };
            setActiveChildren(activeChildrenRef.current);
          } else {
            handleRegenerate();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allMessages, messages, isTyping, handleRegenerate]);

  if (encryptionLocked) {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-4">
        <EncryptionRequiredPrompt
          category="chatbot"
          returnTo="/apps?app=chatbot"
          onUnlocked={() => setEncryptionLocked(false)}
          categoryLabel="Chatbot Chats"
        />
      </div>
    );
  }

  if (isKeyLoading) {
    return (
      <div className="relative min-h-[calc(100vh-61px)] sm:min-h-[calc(100vh-73px)] w-full flex items-center justify-center p-4 bg-slate-950 text-white overflow-hidden">
        <InteractiveBackground />
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const isConfigured =
    isPollinationsConfigured ||
    (!!pollinationsApiKey && pollinationsApiKey.trim().length > 0);

  if (!isConfigured) {
    return (
      <div className="relative min-h-[calc(100vh-61px)] sm:min-h-[calc(100vh-73px)] w-full flex items-center justify-center p-4 bg-slate-950 text-white overflow-hidden">
        <InteractiveBackground />
        <div className="relative z-10 w-full max-w-lg p-6 sm:p-8 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/10">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-display">
                {t(
                  "chatbot.pollinationsRequiredTitle",
                  undefined,
                  "Pollinations AI Setup Required",
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t(
                  "chatbot.pollinationsRequiredSubtitle",
                  undefined,
                  "Connect your API key to access Chatbot",
                )}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-800/50 space-y-2 text-slate-200">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>
                {t(
                  "chatbot.freeTierInfoTitle",
                  undefined,
                  "100% Free Models",
                )}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {t(
                "chatbot.freeTierInfoText",
                undefined,
                "Most models on Pollinations are completely free to use! Pollinations provides official free models and support for your own custom or private models.",
              )}
            </p>
          </div>

          {/* Supporter Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center shrink-0 mt-0.5">
                <Heart className="w-4 h-4 fill-pink-400/20" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  {t(
                    "account.supporterToggleTitle",
                    undefined,
                    "Support Oxygen Low's Software (+25% Pollen)",
                  )}
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {t(
                    "account.supporterToggleDescShort",
                    undefined,
                    "+25% pollen cost. 20% goes to dev for high-power models (GPT Astra, Sol) to improve the platform.",
                  )}
                </p>
              </div>
            </div>
            <Switch
              checked={isPollinationsSupporter}
              onCheckedChange={setIsPollinationsSupporter}
              aria-label="Supporter mode toggle"
            />
          </div>

          {/* 1-Click Connect Button */}
          <Button
            onClick={async () => {
              setIsConnectingGate(true);
              try {
                const result = await initiatePollinationsOAuth({
                  isSupporter: isPollinationsSupporter,
                });
                if (result?.apiKey) {
                  await setPollinationsApiKey(result.apiKey);
                  setIsPollinationsSupporter(result.isSupporter);
                  toast.success(
                    t(
                      "account.authSuccessToast",
                      undefined,
                      "Pollinations connected successfully!",
                    ),
                  );
                }
              } catch (err: any) {
                if (err?.message && !err.message.includes("closed")) {
                  toast.error(
                    err?.message ||
                      t(
                        "account.authFailedToast",
                        undefined,
                        "Failed to connect",
                      ),
                  );
                }
              } finally {
                setIsConnectingGate(false);
              }
            }}
            disabled={isConnectingGate}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold h-10 shadow-lg shadow-cyan-950/50 gap-2"
          >
            {isConnectingGate ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t(
                  "account.connectingPollinations",
                  undefined,
                  "Connecting...",
                )}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t(
                  "account.connectPollinations",
                  undefined,
                  "Connect with Pollinations (1-Click)",
                )}
              </>
            )}
          </Button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              {t("common.or", undefined, "Or")}
            </span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-300">
              {t(
                "chatbot.enterApiKeyLabel",
                undefined,
                "Enter Pollinations API Key Manually",
              )}
            </label>
            <div className="relative">
              <Input
                type={showGateKey ? "text" : "password"}
                value={gateKeyInput}
                onChange={(e) => setGateKeyInput(e.target.value)}
                placeholder="pk_... or sk_... from enter.pollinations.ai"
                className="bg-slate-950 border-slate-800 text-xs text-white font-mono pr-10 h-10"
              />
              <button
                type="button"
                onClick={() => setShowGateKey((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title={showGateKey ? "Hide key" : "Show key"}
              >
                {showGateKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                onClick={async () => {
                  if (!gateKeyInput.trim()) return;
                  setIsSavingGateKey(true);
                  try {
                    await setPollinationsApiKey(gateKeyInput.trim());
                    toast.success(
                      t(
                        "chatbot.keySavedSuccess",
                        undefined,
                        "Pollinations key connected!",
                      ),
                    );
                  } catch {
                    toast.error(
                      t("common.error", undefined, "Failed to save key"),
                    );
                  } finally {
                    setIsSavingGateKey(false);
                  }
                }}
                disabled={!gateKeyInput.trim() || isSavingGateKey}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-10 font-semibold gap-2"
              >
                {isSavingGateKey ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {t("chatbot.saveAndStart", undefined, "Save & Start Chatting")}
              </Button>

              <Link
                to="/account"
                className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors text-center"
              >
                {t("chatbot.openAccountSettings", undefined, "Account Settings")}
              </Link>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {t("chatbot.needKeyText", undefined, "Need an API key?")}
            </span>
            <a
              href="https://enter.pollinations.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline inline-flex items-center gap-1"
            >
              enter.pollinations.ai/keys
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  const appStateClass =
    !currentChatId && messages.length === 0 ? "state-empty" : "state-active";
  const respondingClass = isTyping ? "state-responding" : "";

  return (
    <div
      className="w-full h-full flex relative overflow-hidden"
      id="chatbot-app-root"
    >
      {/* Dark theme background color overriding */}
      <style>{`
        #chatbot-app-root {
          color: var(--foreground);
        }
        
        .ai-responding-glow {
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: border-color 0.3s ease;
            position: relative;
            z-index: 1;
        }
        .state-responding .ai-responding-glow {
            border-color: transparent;
        }
        @keyframes rainbow-glow-linear {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .ai-responding-glow::before {
            content: '';
            position: absolute;
            inset: -2px;
            border-radius: inherit;
            background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3, #ff0000);
            background-size: 200% 100%;
            animation: rainbow-glow-linear 2s linear infinite;
            z-index: -1;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            padding: 2px;
        }
        .state-responding .ai-responding-glow::before {
            opacity: 1;
        }
        
        .reasoning-content {
            display: none;
        }
        .reasoning-block.expanded .reasoning-content {
            display: block;
        }
        
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1) }
          33% { transform: translate(30px, -50px) scale(1.1) }
          66% { transform: translate(-20px, 20px) scale(0.9) }
          100% { transform: translate(0px, 0px) scale(1) }
        }
        @keyframes blob-reverse {
          0% { transform: translate(0px, 0px) scale(1) }
          33% { transform: translate(-30px, 50px) scale(0.9) }
          66% { transform: translate(20px, -20px) scale(1.1) }
          100% { transform: translate(0px, 0px) scale(1) }
        }
        .animate-blob {
            animation: blob 15s infinite;
        }
        .animate-blob-reverse {
            animation: blob-reverse 20s infinite;
        }
        .orb-1 {
            background: radial-gradient(circle, rgba(207,188,255,0.15) 0%, rgba(5,5,10,0) 70%);
        }
        .orb-2 {
            background: radial-gradient(circle, rgba(76,215,246,0.1) 0%, rgba(5,5,10,0) 70%);
        }
        .bottom-mask {
            background: linear-gradient(to bottom, transparent 0%, var(--background) 80%, var(--background) 100%);
        }
        
        .no-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>

      <InteractiveBackground />
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] orb-1 rounded-full animate-blob mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[900px] h-[900px] orb-2 rounded-full animate-blob-reverse mix-blend-screen"></div>
      </div>

      {/* Click / hover trigger zone along right edge */}
      <div
        className="fixed top-[61px] sm:top-[73px] right-0 w-[18px] md:w-[18px] h-[calc(100vh-61px)] sm:h-[calc(100vh-73px)] z-[49] cursor-pointer"
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleSidebarClose}
        onClick={openSidebar}
        role="button"
        tabIndex={0}
        aria-label="Open sidebar"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openSidebar();
        }}
      />

      {/* Sidebar Backdrop – click to close */}
      <div
        className={cn(
          "fixed top-[61px] sm:top-[73px] bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 z-[50]",
          sidebarOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-[61px] sm:top-[73px] right-0 h-[calc(100vh-61px)] sm:h-[calc(100vh-73px)] w-[280px] transition-transform duration-300 ease-out bg-black/90 md:bg-black/80 backdrop-blur-xl pointer-events-auto flex flex-col p-4 justify-between shadow-2xl z-[51]",
          sidebarOpen ? "translate-x-0" : "translate-x-full",
        )}
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleSidebarClose}
      >
        <div className="flex flex-col gap-6 h-full overflow-hidden">
          <div className="flex flex-col gap-4 h-full">
            <button
              onClick={handleNewChatClick}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors w-full"
            >
              <Plus className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-medium leading-normal font-display">
                New Chat
              </span>
            </button>
            <ScrollArea className="flex-1 -mx-2 px-2">
              <div className="flex flex-col gap-1 mt-2">
                <p className="text-slate-400 text-[11px] font-display font-medium uppercase tracking-[0.05em] px-3 pb-2">
                  Chats
                </p>
                {chats.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg group/chat text-left cursor-pointer transition-colors",
                      currentChatId === c.id
                        ? "bg-white/10 text-white"
                        : "hover:bg-white/5 text-slate-400 hover:text-white",
                    )}
                    onClick={() => {
                      setCurrentChatId(c.id);
                      setSidebarOpen(false);
                    }}
                  >
                    <Bot className="w-5 h-5 opacity-70" />
                    <span className="text-sm font-medium truncate flex-1 font-body">
                      {c.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        supabase
                          .from("chats")
                          .delete()
                          .eq("id", c.id)
                          .then(() => {
                            setChats(chats.filter((x) => x.id !== c.id));
                            if (currentChatId === c.id) setCurrentChatId(null);
                          });
                      }}
                      className="md:opacity-0 md:group-hover/chat:opacity-100 opacity-100 hover:text-red-400 p-1 transition-opacity"
                      aria-label="Delete chat"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main
        className={cn(
          "flex-1 flex flex-col relative z-10 h-full overflow-hidden w-full transition-all duration-500",
          appStateClass,
          respondingClass,
        )}
      >
        {/* Subtle edge hint when sidebar is closed */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Open sidebar"
          title="Open sidebar"
          onClick={openSidebar}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openSidebar();
          }}
          className={cn(
            "fixed top-1/2 right-0 -translate-y-1/2 w-1.5 h-12 rounded-l-md bg-primary/35 hover:bg-primary/75 active:bg-primary/90 z-[48] transition-all duration-300 cursor-pointer",
            sidebarOpen
              ? "opacity-0 pointer-events-none"
              : "opacity-100 pointer-events-auto",
          )}
        />

        {/* Chat Scrolling Area */}
        <div
          className={cn(
            "flex-1 overflow-y-auto pt-6 pb-[160px] px-6 w-full max-w-[848px] mx-auto scroll-smooth absolute inset-0 z-10 transition-all duration-500",
            !currentChatId && messages.length === 0
              ? "opacity-0 pointer-events-none translate-y-5"
              : "opacity-100 pointer-events-auto translate-y-0",
          )}
          id="chat-history"
        >
          <div className="flex flex-col gap-8 pb-12 w-full min-h-full justify-end">
            {messages.map((m, i) => {
              const isLastAssistant =
                i === messages.length - 1 && m.role === "assistant";
              if (
                isLastAssistant &&
                isTyping &&
                !m.content &&
                !m.reasoning &&
                !m.is_web_search
              ) {
                return (
                  <div
                    key={i}
                    className="flex gap-4 w-full mt-4 animate-[fade-in_0.3s_ease-out_0.2s_both] mb-4"
                  >
                    <div className="shrink-0 pt-7">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent shadow-[0_0_15px_rgba(207,188,255,0.5)] flex items-center justify-center animate-pulse">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%] w-full">
                      <p className="text-white text-sm font-display font-medium ml-1">
                        Chatbot{" "}
                        <span className="text-slate-400 text-xs font-normal ml-2">
                          Generating...
                        </span>
                      </p>
                      <div className="w-full">
                        <div className="text-[15px] leading-[1.6] space-y-4 p-4 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200">
                          {queueStatus ? (
                            <span className="text-slate-400 font-medium text-xs">
                              Queue Position: {queueStatus.position} | ETA:{" "}
                              {formatHordeEta(queueStatus.eta)} | Workers:{" "}
                              {queueStatus.workers} | People in Queue:{" "}
                              {queueStatus.totalInQueue}
                            </span>
                          ) : (
                            <span className="animate-pulse">...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              let siblings: Message[] = [];
              let currentIndex = 0;
              if (m.parent_id) {
                siblings = allMessages.filter(
                  (x) => x.parent_id === m.parent_id,
                );
                currentIndex = siblings.findIndex((x) => x.id === m.id);
              } else {
                siblings = allMessages.filter((x) => !x.parent_id);
                currentIndex = siblings.findIndex((x) => x.id === m.id);
              }
              return (
                <ChatMessage
                  key={i}
                  message={m}
                  siblings={siblings}
                  activeSiblingIndex={currentIndex}
                  onNavigate={(index) => {
                    const sibling = siblings[index];
                    if (sibling && sibling.id) {
                      activeChildrenRef.current = {
                        ...activeChildrenRef.current,
                        [m.parent_id || "root"]: sibling.id!,
                      };
                      setActiveChildren(activeChildrenRef.current);
                    }
                  }}
                  onRegenerate={handleRegenerate}
                  onSpeak={handleSpeakMessage}
                  isSpeakingThisMessage={
                    liveVoice.isSpeaking && speakingMessageId === m.id
                  }
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Empty State Greeting */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-all duration-500",
            !currentChatId && messages.length === 0
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-5",
          )}
        >
          <div className="w-full flex flex-col items-center justify-center transform -translate-y-[6vh] sm:-translate-y-[10vh] px-4">
            <h1 className="text-[28px] sm:text-[36px] md:text-[48px] font-display font-semibold leading-tight tracking-tight mb-6 sm:mb-12 text-center text-transparent bg-clip-text bg-gradient-to-br from-primary to-accent pb-2">
              How can I help you?
            </h1>
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 w-full z-30 pointer-events-none h-full flex flex-col justify-end">
          <div className="h-[120px] w-full bottom-mask absolute bottom-0 left-0"></div>
          <div
            className={cn(
              "absolute left-0 right-0 mx-auto w-full max-w-[800px] px-3 sm:px-6 pointer-events-auto transition-transform duration-500",
              !currentChatId && messages.length === 0
                ? "bottom-[35vh] sm:bottom-[40vh]"
                : "bottom-4 sm:bottom-8",
            )}
          >
            <div className="p-2 relative group focus-within:shadow-[0_0_20px_rgba(207,188,255,0.15)] transition-all duration-300 ai-responding-glow rounded-full bg-[#1A1A1E]">
              <div className="flex items-center w-full bg-[#1A1A1E] rounded-full relative z-10">
                <div
                  className="relative shrink-0 flex items-center ml-2"
                  ref={optionsDropdownRef}
                >
                  <button
                    onClick={() => {
                      setOptionsDropdownOpen(!optionsDropdownOpen);
                      setModelDropdownOpen(false);
                    }}
                    className="w-10 h-10 rounded-full bg-transparent hover:bg-white/5 flex items-center justify-center text-white/70 transition-all duration-200"
                    title="Toggle Options"
                  >
                    <Plus className="w-5 h-5 text-white/70" />
                  </button>
                  <div
                    className={cn(
                      "absolute left-0 w-64 bg-[#1A1A1E]/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden transition-all duration-200 z-[100] shadow-2xl",
                      appStateClass === "state-empty"
                        ? "top-[calc(100%+10px)] origin-top-left"
                        : "top-[-10px] -translate-y-full origin-bottom-left",
                      optionsDropdownOpen
                        ? "opacity-100 scale-100 pointer-events-auto"
                        : "opacity-0 scale-95 pointer-events-none",
                    )}
                  >
                    <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto no-scrollbar">
                      {/* Web Search Toggle */}
                      <button
                        onClick={() =>
                          setIsWebSearchEnabled(!isWebSearchEnabled)
                        }
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 w-full rounded-lg transition-colors group">
                          <div className="flex flex-col">
                            <span className="text-sm text-white/90 font-medium font-display flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-cyan-400" />
                              {t(
                                "apps.chatbotWebSearch",
                                undefined,
                                "Web Search",
                              )}
                            </span>
                            <span className="text-[11px] text-slate-400 font-body">
                              {t(
                                "apps.chatbotWebSearchDesc",
                                undefined,
                                "Deep agentic web research before answering",
                              )}
                            </span>
                          </div>
                          {isWebSearchEnabled && (
                            <Check className="w-4 h-4 text-primary ml-auto" />
                          )}
                        </div>
                      </button>

                      {/* Reasoning Toggle */}
                      <button
                        onClick={() =>
                          setIsReasoningEnabled(!isReasoningEnabled)
                        }
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 w-full rounded-lg transition-colors group">
                          <div className="flex flex-col">
                            <span className="text-sm text-white/90 font-medium font-display flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                              {t(
                                "apps.chatbotReasoning",
                                undefined,
                                "Reasoning Process",
                              )}
                            </span>
                            <span className="text-[11px] text-slate-400 font-body">
                              {t(
                                "apps.chatbotReasoningDesc",
                                undefined,
                                "Toggle AI thought process",
                              )}
                            </span>
                          </div>
                          {isReasoningEnabled && (
                            <Check className="w-4 h-4 text-primary ml-auto" />
                          )}
                        </div>
                      </button>

                      {/* Image Generation Toggle */}
                      <button
                        onClick={() =>
                          setIsImageGenEnabled(!isImageGenEnabled)
                        }
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 w-full rounded-lg transition-colors group">
                          <div className="flex flex-col">
                            <span className="text-sm text-white/90 font-medium font-display flex items-center gap-1.5">
                              <ImagePlus className="w-3.5 h-3.5 text-cyan-400" />
                              {t(
                                "apps.chatbotImageGen",
                                undefined,
                                "Image Generation",
                              )}
                            </span>
                            <span className="text-[11px] text-slate-400 font-body">
                              {t(
                                "apps.chatbotImageGenDesc",
                                undefined,
                                "Generate AI images with AI Horde",
                              )}
                            </span>
                          </div>
                          {isImageGenEnabled && (
                            <Check className="w-4 h-4 text-primary ml-auto" />
                          )}
                        </div>
                      </button>

                      {/* Character Selections */}
                      <div className="px-3 pt-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          User Character
                        </label>
                        <select
                          className="w-full bg-black/50 text-xs text-white p-2 rounded mt-1 border border-white/10 focus:ring-1 focus:ring-primary outline-none"
                          value={selectedUserCharacter || ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            setSelectedUserCharacter(val);
                            updateChatSetting({ user_character_id: val });
                          }}
                        >
                          <option value="">None</option>
                          {availableCharacters
                            .filter((c) => !c.is_universe && !c.is_race)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.display_name || c.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="px-3 pt-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          LLM Character
                        </label>
                        <select
                          className="w-full bg-black/50 text-xs text-white p-2 rounded mt-1 border border-white/10 focus:ring-1 focus:ring-primary outline-none"
                          value={selectedLlmCharacter || ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            setSelectedLlmCharacter(val);
                            updateChatSetting({ llm_character_id: val });
                          }}
                        >
                          <option value="">None</option>
                          {availableCharacters
                            .filter((c) => !c.is_universe && !c.is_race)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.display_name || c.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="px-3 pt-2 pb-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                          Universe
                        </label>
                        <select
                          className="w-full bg-black/50 text-xs text-white p-2 rounded mt-1 border border-white/10 focus:ring-1 focus:ring-primary outline-none"
                          value={selectedUniverse || ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            setSelectedUniverse(val);
                            updateChatSetting({ universe_id: val });
                          }}
                        >
                          <option value="">None</option>
                          {availableCharacters
                            .filter((c) => c.is_universe)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.display_name || c.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <textarea
                  className="w-full bg-transparent border-none outline-none font-body text-[15px] text-white placeholder-[#8B949E] focus:ring-0 px-4 py-3 min-h-[48px] max-h-[150px] resize-none no-scrollbar"
                  value={input}
                  rows={1}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!isTyping) handleSendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                />

                {isImageGenEnabled ? (
                  <div
                    className="relative shrink-0 flex items-center gap-1"
                    ref={imageModelDropdownRef}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setImageModelDropdownOpen(!imageModelDropdownOpen);
                        setOptionsDropdownOpen(false);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25 transition-colors text-xs text-cyan-300 font-medium"
                      title="Select Image Generation Model"
                    >
                      <ImagePlus className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="truncate max-w-[130px]">
                        {chatImageModels.horde.find(
                          (m) => m.id === chatImageModel,
                        )?.name || "SDXL 1.0 (Horde)"}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                    </button>
                    <div
                      className={cn(
                        "absolute right-0 w-72 bg-[#1A1A1E]/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden transition-all duration-200 z-[100] shadow-2xl",
                        appStateClass === "state-empty"
                          ? "top-[calc(100%+10px)] origin-top-right"
                          : "top-[-10px] -translate-y-full origin-bottom-right",
                        imageModelDropdownOpen
                          ? "opacity-100 scale-100 pointer-events-auto"
                          : "opacity-0 scale-95 pointer-events-none",
                      )}
                    >
                      <div className="max-h-[300px] overflow-y-auto no-scrollbar p-2 space-y-2">
                        <div className="px-2 pt-1 pb-0.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            AI Horde SFW (Free)
                          </span>
                        </div>
                        <div className="space-y-1">
                          {chatImageModels.horde.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setChatImageProvider("horde");
                                setChatImageModel(m.id);
                                setImageModelDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between",
                                chatImageProvider === "horde" &&
                                  chatImageModel === m.id
                                  ? "bg-primary/20 text-primary font-medium"
                                  : "text-slate-300 hover:bg-white/5",
                              )}
                            >
                              <div className="flex flex-col">
                                <span>{m.name}</span>
                                {m.workers ? (
                                  <span className="text-[10px] text-slate-500">
                                    {m.workers} workers{" "}
                                    {m.eta ? `· ~${m.eta}s` : ""}
                                  </span>
                                ) : null}
                              </div>
                              {chatImageProvider === "horde" &&
                                chatImageModel === m.id && (
                                  <Check className="w-3.5 h-3.5 text-primary" />
                                )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="relative shrink-0 flex items-center gap-1"
                    ref={modelDropdownRef}
                  >
                    <button
                    data-testid="chatbot-model-dropdown-btn"
                    onClick={() => {
                      if (!modelDropdownOpen) {
                        refreshModels?.();
                      }
                      setModelDropdownOpen(!modelDropdownOpen);
                      setOptionsDropdownOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent hover:bg-white/5 transition-colors text-sm text-white/90"
                  >
                    <span>
                      {
                        formatModelLabel(selectedProvider, selectedModel).split(
                          " - ",
                        )[0]
                      }
                    </span>
                    <ChevronDown className="w-4 h-4 text-white/70" />
                  </button>
                  <div
                    className={cn(
                      "absolute right-0 w-72 bg-[#1A1A1E]/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden transition-all duration-200 z-[100] shadow-2xl",
                      appStateClass === "state-empty"
                        ? "top-[calc(100%+10px)] origin-top-right"
                        : "top-[-10px] -translate-y-full origin-bottom-right",
                      modelDropdownOpen
                        ? "opacity-100 scale-100 pointer-events-auto"
                        : "opacity-0 scale-95 pointer-events-none",
                    )}
                  >
                    <div className="max-h-[360px] overflow-y-auto no-scrollbar pb-2">
                      {standardModels.length > 0 && (
                        <>
                          <div className="px-3 pt-3 pb-1">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-display font-medium">
                              {t("account.standardModels", undefined, "Standard Models")}
                            </p>
                            <p className="text-[10px] text-cyan-400/90 mt-0.5 leading-snug">
                              {t(
                                "account.questPollenNotice",
                                undefined,
                                "All models in this section use quest pollen, not paid pollen.",
                              )}
                            </p>
                          </div>
                          <div className="px-2">
                            {standardModels.map((m) => (
                              <button
                                key={`${m.provider}-${m.model_id}`}
                                onClick={() => {
                                  setSelectedModel(m.model_id);
                                  setModelDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group relative",
                                  selectedModel === m.model_id
                                    ? "bg-white/5"
                                    : "",
                                )}
                              >
                                <div className="text-sm text-white font-medium">
                                  {m.name || m.model_id}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate flex items-center justify-between w-full">
                                  <span>
                                    {m.model_id}
                                    {m.rate ? ` • ${m.rate}` : ""}
                                  </span>
                                </div>
                                {selectedModel === m.model_id && (
                                  <Check className="w-4 h-4 text-primary absolute right-3 top-1/2 -translate-y-1/2" />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}



                      {customModels.length > 0 && (
                        <>
                          <div className="px-3 pb-1 pt-3 flex justify-between items-center">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-display font-medium">
                              {t("account.customModels", undefined, "Custom Models")}
                            </p>
                          </div>
                          <div className="px-2">
                            {customModels.map((m) => (
                              <button
                                key={`${m.provider}-${m.model_id}`}
                                onClick={() => {
                                  setSelectedModel(m.model_id);
                                  setModelDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group relative",
                                  selectedModel === m.model_id
                                    ? "bg-white/5"
                                    : "",
                                )}
                              >
                                <div className="text-sm text-white font-medium">
                                  {m.name || m.model_id}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate w-full pr-4">
                                  {m.model_id}
                                </div>
                                {selectedModel === m.model_id && (
                                  <Check className="w-4 h-4 text-primary absolute right-3 top-1/2 -translate-y-1/2" />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    if (liveVoice.isSpeaking) {
                      liveVoice.stopSpeaking();
                      return;
                    }
                    if (liveVoice.isRecording) {
                      await liveVoice.stopRecording();
                    } else if (!liveVoice.isTranscribing) {
                      await liveVoice.startRecording();
                    }
                  }}
                  disabled={liveVoice.isTranscribing}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 mr-1 flex-shrink-0 relative",
                    liveVoice.isRecording
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse ring-2 ring-red-500/50"
                      : liveVoice.isSpeaking
                      ? "bg-primary/20 text-primary hover:bg-primary/30 animate-pulse"
                      : liveVoice.isTranscribing
                      ? "bg-white/5 text-primary"
                      : "bg-transparent hover:bg-white/5 text-white/70 hover:text-white",
                  )}
                  title={
                    liveVoice.isRecording
                      ? t("apps.chatbotStopRecording", undefined, "Stop recording (Speech to text)")
                      : liveVoice.isSpeaking
                      ? t("apps.chatbotStopSpeaking", undefined, "Stop speaking")
                      : liveVoice.isTranscribing
                      ? t("apps.chatbotTranscribing", undefined, "Transcribing...")
                      : t("apps.chatbotSpeechToText", undefined, "Speech to text")
                  }
                  aria-label={
                    liveVoice.isRecording
                      ? t("apps.chatbotStopRecording", undefined, "Stop recording (Speech to text)")
                      : liveVoice.isSpeaking
                      ? t("apps.chatbotStopSpeaking", undefined, "Stop speaking")
                      : liveVoice.isTranscribing
                      ? t("apps.chatbotTranscribing", undefined, "Transcribing...")
                      : t("apps.chatbotSpeechToText", undefined, "Speech to text")
                  }
                >
                  {liveVoice.isTranscribing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : liveVoice.isRecording ? (
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                    </span>
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                {isTyping ? (
                  <button
                    onClick={handleStop}
                    className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 transition-colors duration-200 mr-2 flex-shrink-0"
                    aria-label="Stop generation"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim()}
                    className="w-10 h-10 rounded-full bg-transparent hover:bg-white/5 flex items-center justify-center text-white transition-colors duration-200 mr-2 flex-shrink-0 disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ChatbotApp;
