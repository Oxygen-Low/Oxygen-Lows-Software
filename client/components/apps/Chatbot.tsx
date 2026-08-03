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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useAiModels } from "@/hooks/useAiModels";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { encrypt, decrypt, getMasterKey } from "@/lib/crypto";
import { EncryptionUnlockModal } from "@/components/EncryptionUnlockModal";
import { formatModelLabel, parseAiProxyError } from "@/utils/aiUtils";
import { ArtifactSidebar } from "./ArtifactSidebar";

const InteractiveBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dots: any[] = [];
    const spacing = 30; // distance between dots
    const dotRadius = 1.5;
    let mouseX = -1000;
    let mouseY = -1000;
    const repelRadius = 100;
    const repelForce = 0.5;
    const returnSpeed = 0.1;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let animationFrameId: number;

    function resizeCanvas() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initDots();
    }

    function initDots() {
      dots = [];
      if (!canvas) return;
      const cols = Math.ceil(canvas.width / spacing);
      const rows = Math.ceil(canvas.height / spacing);

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          dots.push({
            x: i * spacing,
            y: j * spacing,
            originX: i * spacing,
            originY: j * spacing,
            vx: 0,
            vy: 0,
          });
        }
      }
    }

    function animateDots() {
      if (prefersReducedMotion || !canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(207, 188, 255, 0.15)"; // primary color with low opacity

      for (let i = 0; i < dots.length; i++) {
        let dot = dots[i];

        // Calculate distance from mouse
        let dx = mouseX - dot.x;
        let dy = mouseY - dot.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < repelRadius) {
          // Repel
          let force = (repelRadius - dist) / repelRadius;
          let angle = Math.atan2(dy, dx);
          let targetX = dot.x - Math.cos(angle) * force * repelForce * 50;
          let targetY = dot.y - Math.sin(angle) * force * repelForce * 50;

          dot.x += (targetX - dot.x) * 0.1;
          dot.y += (targetY - dot.y) * 0.1;
        } else {
          // Return to origin
          dot.x += (dot.originX - dot.x) * returnSpeed;
          dot.y += (dot.originY - dot.y) * returnSpeed;
        }

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(animateDots);
    }

    const handleResize = () => resizeCanvas();
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };
    const handleMouseOut = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);

    if (!prefersReducedMotion) {
      resizeCanvas();
      animationFrameId = requestAnimationFrame(animateDots);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full z-[-1] pointer-events-none"
    />
  );
};

interface Message {
  id?: string;
  parent_id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  created_at?: string;
}

interface Chat {
  id: string;
  title: string;
  llm_character_id: string | null;
  user_character_id: string | null;
  universe_id: string | null;
  is_encrypted: boolean;
}

interface Character {
  id: string;
  name: string;
  display_name: string | null;
  is_universe: boolean;
  short_description?: string | null;
  appearance?: string | null;
  personality?: string | null;
  backstory?: string | null;
}

interface Artifact {
  id: string;
  filename: string;
  language: string;
  content: string;
}

const ARTIFACT_REGEX =
  /`\/([^/]+)\/\/([^/]+)\/`[\s\n]*\/\/\/\/([\s\S]*?)(?:\\\\|$)/g;

const parseArtifacts = (content: string): Artifact[] => {
  const artifacts: Artifact[] = [];
  let match;
  ARTIFACT_REGEX.lastIndex = 0;
  while ((match = ARTIFACT_REGEX.exec(content)) !== null) {
    artifacts.push({
      id: Math.random().toString(36).substr(2, 9),
      filename: match[1],
      language: match[2],
      content: match[3].trim(),
    });
  }
  return artifacts;
};

const memoizedMarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    return !inline && match ? (
      <SyntaxHighlighter
        style={vscDarkPlus as any}
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
};

const ChatMessage = React.memo(
  ({
    message: m,
    siblings = [],
    activeSiblingIndex = 0,
    onNavigate,
    onRegenerate,
    setActiveArtifact,
  }: {
    message: Message;
    siblings?: Message[];
    activeSiblingIndex?: number;
    onNavigate?: (index: number) => void;
    onRegenerate?: () => void;
    setActiveArtifact: (art: Artifact) => void;
  }) => {
    const artifacts = m.role === "assistant" ? parseArtifacts(m.content) : [];
    let displayContent = (m.content || "").replace(ARTIFACT_REGEX, "");
    const [reasoningExpanded, setReasoningExpanded] = useState(false);

    if (m.role === "assistant" && displayContent.includes("<tool_call>")) {
      displayContent = displayContent.replace(
        /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/,
        (match, jsonStr) => {
          try {
            const data = JSON.parse(jsonStr);
            return `🔨 **Using Tool: ${data.name}**\n\`\`\`json\n${JSON.stringify(data.args, null, 2)}\n\`\`\``;
          } catch (e) {
            return match;
          }
        },
      );
    }

    if (m.role === "user") {
      return (
        <div className="flex gap-4 justify-end w-full animate-[fade-in_0.3s_ease-out] mb-4">
          <div className="flex flex-col gap-2 max-w-[80%] items-end">
            <p className="text-slate-400 text-xs font-display mr-1">User</p>
            <div className="glass-panel px-5 py-4 rounded-xl rounded-tr-sm text-[15px] leading-[1.6]">
              <ReactMarkdown components={memoizedMarkdownComponents}>
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
              <span className="material-symbols-outlined text-[16px] text-slate-400 font-family-material">
                build
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 max-w-[85%] w-full">
            <p className="text-slate-400 text-sm font-display font-medium ml-1">
              System / Tool Result
            </p>
            <div className="w-full">
              <div className="text-[13px] leading-[1.6] space-y-4 ai-message-content p-4 rounded-2xl rounded-tl-sm bg-slate-900/50 border border-slate-800 text-slate-300 font-mono overflow-auto max-h-[300px]">
                <ReactMarkdown components={memoizedMarkdownComponents}>
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
          <p className="text-white text-sm font-display font-medium ml-1">
            Chatbot
          </p>
          <div className="w-full">
            {m.reasoning && (
              <div
                className={cn(
                  "reasoning-block w-full max-w-full rounded-lg border border-white/10 bg-white/5 mb-4 overflow-hidden",
                  reasoningExpanded && "expanded",
                )}
              >
                <button
                  onClick={() => setReasoningExpanded(!reasoningExpanded)}
                  className="reasoning-header w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors text-slate-400 hover:text-white/90"
                >
                  <span className="text-xs font-mono flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] font-family-material">
                      psychology
                    </span>
                    Reasoning Process
                  </span>
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px] transition-transform duration-200 font-family-material",
                      reasoningExpanded && "rotate-180",
                    )}
                  >
                    expand_more
                  </span>
                </button>
                {reasoningExpanded && (
                  <div className="reasoning-content px-4 py-3 border-t border-white/10 text-sm text-slate-300 font-mono leading-relaxed bg-[#0F0F13]">
                    <ReactMarkdown components={memoizedMarkdownComponents}>
                      {m.reasoning}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            <div className="text-[15px] leading-[1.6] space-y-4 ai-message-content p-4 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200">
              <ReactMarkdown components={memoizedMarkdownComponents}>
                {displayContent}
              </ReactMarkdown>
            </div>
            {siblings.length > 0 && (
              <div className="flex items-center gap-2 mt-2 ml-1 text-slate-400 text-xs">
                <button
                  onClick={() => onNavigate?.(activeSiblingIndex - 1)}
                  disabled={activeSiblingIndex === 0}
                  className="hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 p-1 flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] font-family-material">
                    chevron_left
                  </span>
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
                  <span className="material-symbols-outlined text-[16px] font-family-material">
                    {activeSiblingIndex < siblings.length - 1
                      ? "chevron_right"
                      : "refresh"}
                  </span>
                </button>
              </div>
            )}
          </div>
          {artifacts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {artifacts.map((art) => (
                <button
                  key={art.id}
                  onClick={() => setActiveArtifact(art)}
                  aria-label={`View artifact ${art.filename}`}
                  title={`View artifact ${art.filename}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-cyan-500/50 transition-colors text-xs text-slate-300 focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
                >
                  <Code className="w-3 h-3 text-cyan-400" />
                  {art.filename}
                </button>
              ))}
            </div>
          )}
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
  const { models, selectedModel, selectedProvider, setSelection, hordeStatus } =
    useAiModels();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [activeChildren, setActiveChildren] = useState<Record<string, string>>(
    {},
  );
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
    while (currentId) {
      const msg = allMessages.find((m) => m.id === currentId);
      if (!msg) break;
      path.push(msg);
      currentId = activeChildren[currentId];
    }
    return path;
  }, [allMessages, activeChildren]);

  const setMessages = useCallback((
    updater: Message[] | ((prev: Message[]) => Message[]),
  ) => {
    // This is a shim for setMessages that is used by streaming updates
    if (typeof updater === "function") {
      setAllMessages((prevAll) => {
        const rootMessages = prevAll.filter((m) => !m.parent_id);
        let currentId =
          activeChildrenRef.current["root"] || rootMessages[rootMessages.length - 1]?.id;
        const path: Message[] = [];
        while (currentId) {
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
  }, []);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [pointsStatus, setPointsStatus] = useState<{
    available: number;
    given: number;
  } | null>(null);

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

  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [showEncryptionUnlockModal, setShowEncryptionUnlockModal] =
    useState(false);
  const [isEncryptionEnabled, setIsEncryptionEnabled] = useState(false);
  const lastParsedLengthRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New States for UI
  const [isReasoningEnabled, setIsReasoningEnabled] = useState(false);
  const [optionsDropdownOpen, setOptionsDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const skipNextFetchRef = useRef<string | null>(null);

  const hordeModels = useMemo(
    () => models.filter((m) => m.provider === "horde"),
    [models],
  );
  const cloudflareModels = useMemo(
    () => models.filter((m) => m.provider === "cloudflare"),
    [models],
  );
  const otherModels = useMemo(
    () =>
      models.filter(
        (m) => m.provider !== "horde" && m.provider !== "cloudflare",
      ),
    [models],
  );
  const hasHordeModels = hordeModels.length > 0;
  const hasCloudflareModels = cloudflareModels.length > 0;

  useEffect(() => {
    const fetchPoints = async () => {
      if (!session?.user?.id) return;
      const { data } = await supabase.rpc("get_points_status");
      if (data) setPointsStatus(data as any);
    };
    fetchPoints();
  }, [session?.user?.id, messages]);

  // Click outside listener for dropdowns
  const optionsDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

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
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("encryption_settings")
      .eq("user_id", session.user.id)
      .single();

    const encryptionEnabled = prefs?.encryption_settings?.enabled || false;
    setIsEncryptionEnabled(encryptionEnabled);

    const masterKey = getMasterKey();
    if (encryptionEnabled && !masterKey) {
      setShowEncryptionUnlockModal(true);
      return;
    }

    const { data: chars } = await supabase
      .from("characters")
      .select("*")
      .eq("user_id", session.user.id);

    if (chars) {
      const processedChars = await Promise.all(
        chars.map(async (c) => {
          if (c.is_encrypted && masterKey) {
            try {
              return {
                ...c,
                name: await decrypt(c.name, masterKey),
                display_name: c.display_name
                  ? await decrypt(c.display_name, masterKey)
                  : null,
                short_description: c.short_description
                  ? await decrypt(c.short_description, masterKey)
                  : null,
                appearance: c.appearance
                  ? await decrypt(c.appearance, masterKey)
                  : null,
                personality: c.personality
                  ? await decrypt(c.personality, masterKey)
                  : null,
                backstory: c.backstory
                  ? await decrypt(c.backstory, masterKey)
                  : null,
              };
            } catch (e) {
              return { ...c, name: "[Encrypted]", display_name: "[Encrypted]" };
            }
          }
          return c;
        }),
      );
      setAvailableCharacters(processedChars);
    }

    const { data: chatsData } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });

    if (chatsData) {
      const processedChats = await Promise.all(
        chatsData.map(async (c) => {
          if (c.is_encrypted && masterKey) {
            try {
              return {
                ...c,
                title: await decrypt(c.title, masterKey),
              };
            } catch (e) {
              return { ...c, title: "Encrypted Chat" };
            }
          }
          return c;
        }),
      );
      setChats(processedChats);
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
        .from("chat_messages")
        .select("*")
        .eq("chat_id", currentChatId)
        .order("created_at", { ascending: true });

      if (data) {
        const masterKey = getMasterKey();
        const processed = await Promise.all(
          data.map(async (m) => {
            let content = m.content;
            let reasoning = m.reasoning;
            if (m.is_encrypted && masterKey) {
              try {
                content = await decrypt(m.content, masterKey);
                if (m.reasoning)
                  reasoning = await decrypt(m.reasoning, masterKey);
              } catch (e) {
                content = "[Encrypted Message]";
                if (m.reasoning) reasoning = "[Encrypted Reasoning]";
              }
            }
            return {
              id: m.id,
              parent_id: m.parent_id,
              role: m.role,
              content,
              reasoning,
              created_at: m.created_at,
            };
          }),
        );

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
      const { error } = await supabase
        .from("chats")
        .update(updates)
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
    // We prompt the "Fast" model to generate a title
    const fastModel = models.find(
      (m) => m.provider === "horde" && m.model_id === "Fast",
    ) || { provider: "horde", model_id: "Fast" };

    try {
      const { data: userInts } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", session?.user?.id)
        .eq("provider", "horde")
        .maybeSingle();

      const key = getMasterKey();
      let decryptedKey = undefined;
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("encryption_settings")
        .eq("user_id", session?.user?.id)
        .single();
      const encryptionSettings = prefs?.encryption_settings || {};

      if (userInts && encryptionSettings.integrations) {
        if (key && userInts.api_key) {
          decryptedKey = await decrypt(userInts.api_key, key);
        } else if (userInts.api_key) {
          // If we have an encrypted key but no master key to decrypt it,
          // we must override it with the anonymous key so the proxy doesn't
          // send the encrypted string to AI Horde.
          decryptedKey = "0000000000";
        }
      } else if (userInts?.api_key) {
        decryptedKey = userInts.api_key;
      }

      // If we still don't have a decrypted key, explicitly set it to anonymous
      // so the backend doesn't fall back to an encrypted database key.
      if (!decryptedKey) {
        decryptedKey = "0000000000";
      }

      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          provider: fastModel.provider,
          model: fastModel.model_id,
          messages: [
            {
              role: "user",
              content: `Generate a short 3-5 word title for a chat that starts with this message: "${firstMsg}". Output ONLY the title, no quotes or prefix.`,
            },
          ],
          stream: false,
          apiKey: decryptedKey,
        }),
      });

      if (!response.ok) return;
      const data = await response.json();
      let title = "New Chat";
      if (data.choices?.[0]?.message?.content) {
        title = data.choices[0].message.content
          .trim()
          .replace(/^["']|["']$/g, "");
      }

      const encryptedTitle =
        isEncryptionEnabled && key ? await encrypt(title, key) : title;
      await supabase
        .from("chats")
        .update({ title: encryptedTitle })
        .eq("id", chatId);

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
    streamCallback: (chunk: string) => void,
  ) => {
    const { data: userInts } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", session?.user?.id)
      .eq("provider", provider)
      .maybeSingle();

    const key = getMasterKey();
    let decryptedKey = undefined;
    let decryptedBaseUrl = undefined;

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("encryption_settings")
      .eq("user_id", session?.user?.id)
      .single();
    const encryptionSettings = prefs?.encryption_settings || {};

    if (userInts && encryptionSettings.integrations && key) {
      if (userInts.api_key) decryptedKey = await decrypt(userInts.api_key, key);
      if (userInts.base_url)
        decryptedBaseUrl = await decrypt(userInts.base_url, key);
    }

    const response = await fetch("/api/ai/proxy", {
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
        apiKey: decryptedKey,
        baseUrl: decryptedBaseUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(await parseAiProxyError(response));
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let streamBuffer = "";

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
            if (provider === "anthropic") {
              delta = data.delta?.text || "";
              if (
                data.type === "content_block_start" &&
                data.content_block?.type === "tool_use"
              ) {
                delta += `<tool_call>\n{"name": "${data.content_block.name}", "args": `;
              } else if (
                data.type === "content_block_delta" &&
                data.delta?.type === "input_json_delta"
              ) {
                delta += data.delta.partial_json || "";
              }
            } else if (
              [
                "openai",
                "openrouter",
                "grok",
                "custom",
                "lmstudio",
                "koboldcpp",
                "kobold",
                "horde",
                "cloudflare",
              ].includes(provider)
            ) {
              delta = data.choices?.[0]?.delta?.content || "";
              const tc = data.choices?.[0]?.delta?.tool_calls?.[0];
              if (tc) {
                if (tc.function?.name)
                  delta += `<tool_call>\n{"name": "${tc.function.name}", "args": `;
                if (tc.function?.arguments) delta += tc.function.arguments;
              }
              if (data.choices?.[0]?.finish_reason === "tool_calls") {
                delta += `\n}</tool_call>`;
              }
            } else if (provider === "ollama") {
              delta = data.message?.content || data.response || "";
            } else if (provider === "google") {
              delta =
                data.delta?.content ||
                data.message?.content?.text ||
                data.candidates?.[0]?.content?.parts?.[0]?.text ||
                "";
              const fc =
                data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
              if (fc) {
                delta += `<tool_call>\n{"name": "${fc.name}", "args": ${JSON.stringify(fc.args)}}\n</tool_call>`;
              }
            }

            // Simple fix for Anthropic closing brace
            if (
              provider === "anthropic" &&
              data.type === "message_delta" &&
              data.delta?.stop_reason === "tool_use"
            ) {
              delta += `\n}</tool_call>`;
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
    }
    return fullContent;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping || !session?.user?.id) return;

    const key = getMasterKey();
    if (isEncryptionEnabled && !key) {
      setShowEncryptionUnlockModal(true);
      return;
    }

    let activeChatId = currentChatId;

    if (!activeChatId) {
      const title = "New Chat";
      const { data, error } = await supabase
        .from("chats")
        .insert({
          user_id: session.user.id,
          title: isEncryptionEnabled ? await encrypt(title, key!) : title,
          llm_character_id: selectedLlmCharacter,
          user_character_id: selectedUserCharacter,
          universe_id: selectedUniverse,
          is_encrypted: isEncryptionEnabled,
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      activeChatId = data.id;
      const chatWithDecryptedTitle = {
        ...data,
        title: isEncryptionEnabled ? title : data.title,
      };
      setChats((prev) => [chatWithDecryptedTitle, ...prev]);
      skipNextFetchRef.current = activeChatId;
      setCurrentChatId(activeChatId);
    }

    const controller = new AbortController();
    setAbortController(controller);

    const originalInput = input;
    const lastMessageId =
      messages.length > 0 ? messages[messages.length - 1].id : null;
    const userMessage: Message = {
      id: "temp-user",
      parent_id: lastMessageId,
      role: "user",
      content: input,
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
      },
    ]);
    activeChildrenRef.current = {
      ...activeChildrenRef.current,
      [lastMessageId || "root"]: "temp-user",
      "temp-user": "temp-streaming",
    };
    setActiveChildren(activeChildrenRef.current);
    setInput("");
    setIsTyping(true);
    isTypingRef.current = true;
    lastParsedLengthRef.current = 0;
    setQueueStatus(null);

    try {
      // 1. Title generation on first message
      let titlePromise = null;
      if (isFirstMessage) {
        titlePromise = generateChatTitle(activeChatId, originalInput);
        // If the user's primary selection is also horde, we should await the title generation
        // to prevent queuing conflicts with AI Horde's rate limiting.
        if (selectedProvider === "horde") {
          await titlePromise;
        }
      }

      // 2. Save User Message
      const { data: userMsgData, error: userInsertError } = await supabase
        .from("chat_messages")
        .insert({
          parent_id: lastMessageId,
          chat_id: activeChatId,
          role: "user",
          content:
            isEncryptionEnabled && key
              ? await encrypt(originalInput, key)
              : originalInput,
          is_encrypted: isEncryptionEnabled,
        })
        .select()
        .single();

      if (userInsertError) throw userInsertError;

      // Update temp-user id to real id in messages
      setAllMessages((prev) =>
        prev.map((m) =>
          m.id === "temp-user" ? { ...m, id: userMsgData.id } : m,
        ),
      );
      setActiveChildren((prev) => ({
        ...prev,
        [lastMessageId || "root"]: userMsgData.id,
      }));

      let finalContent = "";
      let reasoningContent = "";

      // 3. Reasoning System Logic
      let injectedSystemMessage = "";
      if (selectedLlmCharacter) {
        const char = availableCharacters.find(
          (c) => c.id === selectedLlmCharacter,
        );
        if (char) {
          injectedSystemMessage += `You are playing the role of: ${char.display_name || char.name}.\n`;
          if (char.short_description)
            injectedSystemMessage += `Description: ${char.short_description}\n`;
          if (char.appearance)
            injectedSystemMessage += `Appearance: ${char.appearance}\n`;
          if (char.personality)
            injectedSystemMessage += `Personality: ${char.personality}\n`;
          if (char.backstory)
            injectedSystemMessage += `Backstory: ${char.backstory}\n`;
        }
      }
      if (selectedUserCharacter) {
        const char = availableCharacters.find(
          (c) => c.id === selectedUserCharacter,
        );
        if (char) {
          injectedSystemMessage += `\nThe user is playing the role of: ${char.display_name || char.name}.\n`;
          if (char.short_description)
            injectedSystemMessage += `Description: ${char.short_description}\n`;
          if (char.appearance)
            injectedSystemMessage += `Appearance: ${char.appearance}\n`;
          if (char.personality)
            injectedSystemMessage += `Personality: ${char.personality}\n`;
          if (char.backstory)
            injectedSystemMessage += `Backstory: ${char.backstory}\n`;
        }
      }
      if (selectedUniverse) {
        const uni = availableCharacters.find((c) => c.id === selectedUniverse);
        if (uni) {
          injectedSystemMessage += `\nThis interaction takes place in the universe of: ${uni.display_name || uni.name}.\n`;
          if (uni.short_description)
            injectedSystemMessage += `Description: ${uni.short_description}\n`;
          if (uni.appearance)
            injectedSystemMessage += `Setting details: ${uni.appearance}\n`;
          if (uni.personality)
            injectedSystemMessage += `Tone/Atmosphere: ${uni.personality}\n`;
          if (uni.backstory)
            injectedSystemMessage += `Lore/History: ${uni.backstory}\n`;
        }
      }

      const getApiMessages = (baseMessages: Message[]): Message[] => {
        if (!injectedSystemMessage) return baseMessages;
        return [
          {
            role: "system",
            content: `[SYSTEM INSTRUCTIONS]\n${injectedSystemMessage.trim()}\n[END SYSTEM INSTRUCTIONS]`,
          },
          ...baseMessages,
        ];
      };

      let currentMessages = [...messages, userMessage];
      let iterations = 0;
      let shouldContinue = true;

      while (shouldContinue && iterations < 5) {
        iterations++;
        shouldContinue = false;

        let finalContent = "";
        let reasoningContent = "";

        if (isReasoningEnabled) {
          const reasoningMessages = [
            ...currentMessages,
            {
              role: "user",
              content:
                "Please think step-by-step about my last request. Output your internal reasoning process and analysis. DO NOT output the final response to the user yet, just your thoughts.",
            } as Message,
          ];

          reasoningContent = await callAiStream(
            selectedProvider,
            selectedModel,
            getApiMessages(reasoningMessages),
            controller.signal,
            (content) => {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                return [...prev.slice(0, -1), { ...last, reasoning: content }];
              });
            },
          );

          const finalMessages = [
            ...currentMessages,
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
            selectedProvider,
            selectedModel,
            getApiMessages(finalMessages),
            controller.signal,
            (content) => {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                return [...prev.slice(0, -1), { ...last, content }];
              });

              if (
                content.length - lastParsedLengthRef.current > 50 ||
                content.includes("\\\\")
              ) {
                const arts = parseArtifacts(content);
                if (arts.length > 0) setActiveArtifact(arts[arts.length - 1]);
                lastParsedLengthRef.current = content.length;
              }
            },
          );
        } else {
          finalContent = await callAiStream(
            selectedProvider,
            selectedModel,
            getApiMessages(currentMessages),
            controller.signal,
            (content) => {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                return [...prev.slice(0, -1), { ...last, content }];
              });

              if (
                content.length - lastParsedLengthRef.current > 50 ||
                content.includes("\\\\")
              ) {
                const arts = parseArtifacts(content);
                if (arts.length > 0) setActiveArtifact(arts[arts.length - 1]);
                lastParsedLengthRef.current = content.length;
              }
            },
          );
        }

        let insertData: any = {
          parent_id: userMsgData.id,
          chat_id: activeChatId,
          role: "assistant",
          content:
            isEncryptionEnabled && key
              ? await encrypt(finalContent, key)
              : finalContent,
          reasoning:
            isEncryptionEnabled && key && reasoningContent
              ? await encrypt(reasoningContent, key)
              : reasoningContent || null,
          is_encrypted: isEncryptionEnabled,
        };

        const { data: assistantMsgData, error: assistantInsertError } =
          await supabase
            .from("chat_messages")
            .insert(insertData)
            .select()
            .single();

        if (assistantInsertError) {
          if (
            assistantInsertError.message?.includes("reasoning") ||
            assistantInsertError.details?.includes("reasoning")
          ) {
            delete insertData.reasoning;
            const { data: retryData, error: retryError } = await supabase
              .from("chat_messages")
              .insert(insertData)
              .select()
              .single();
            if (retryError) throw retryError;
            // Update active state
            setAllMessages((prev) =>
              prev.map((m) =>
                m.id === "temp-streaming" ? { ...m, id: retryData.id } : m,
              ),
            );
            setActiveChildren((prev) => ({
              ...prev,
              [userMsgData.id]: retryData.id,
            }));
            if (retryError) throw retryError;
          } else {
            throw assistantInsertError;
          }
        } else {
          // Update active state
          setAllMessages((prev) =>
            prev.map((m) =>
              m.id === "temp-streaming" ? { ...m, id: assistantMsgData.id } : m,
            ),
          );
          setActiveChildren((prev) => ({
            ...prev,
            [userMsgData.id]: assistantMsgData.id,
          }));
        }

        const { error: chatUpdateError } = await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", activeChatId);
        if (chatUpdateError) throw chatUpdateError;
      }
    } catch (e: any) {
      toast.error(e.message);
      if (input === "") setInput(originalInput);
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
    if (isTyping || !session?.user?.id || !currentChatId || messages.length < 2)
      return;

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
    lastParsedLengthRef.current = 0;
    setQueueStatus(null);

    try {
      const key = getMasterKey();
      if (isEncryptionEnabled && !key) {
        setShowEncryptionUnlockModal(true);
        return;
      }

      let finalContent = "";
      let reasoningContent = "";

      // Re-use system message generation logic from handleSendMessage
      let injectedSystemMessage = "";
      if (selectedLlmCharacter) {
        const char = availableCharacters.find(
          (c) => c.id === selectedLlmCharacter,
        );
        if (char)
          injectedSystemMessage += `You are playing the role of: ${char.display_name || char.name}.\n`;
      }
      // Simplified system message builder for regeneration (you can expand this to full as needed)

      const getApiMessages = (baseMessages: Message[]): Message[] => {
        if (!injectedSystemMessage) return baseMessages;
        return [
          {
            role: "system",
            content: `[SYSTEM INSTRUCTIONS]\n${injectedSystemMessage.trim()}\n[END SYSTEM INSTRUCTIONS]`,
          },
          ...baseMessages,
        ];
      };

      const lastUserMessageIndex = messages.findIndex(m => m.id === lastUserMessage.id);
      let currentMessages = messages.slice(0, lastUserMessageIndex + 1);

      if (isReasoningEnabled) {
        const reasoningMessages = [
          ...currentMessages,
          {
            role: "user",
            content:
              "Please think step-by-step about my last request. Output your internal reasoning process and analysis. DO NOT output the final response to the user yet, just your thoughts.",
          } as Message,
        ];
        reasoningContent = await callAiStream(
          selectedProvider,
          selectedModel,
          getApiMessages(reasoningMessages),
          controller.signal,
          (content) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), { ...last, reasoning: content }];
            });
          },
        );
        const finalMessages = [
          ...currentMessages,
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
          selectedProvider,
          selectedModel,
          getApiMessages(finalMessages),
          controller.signal,
          (content) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), { ...last, content }];
            });
          },
        );
      } else {
        finalContent = await callAiStream(
          selectedProvider,
          selectedModel,
          getApiMessages(currentMessages),
          controller.signal,
          (content) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), { ...last, content }];
            });
          },
        );
      }

      let insertData: any = {
        chat_id: currentChatId,
        parent_id: lastUserMessage.id,
        role: "assistant",
        content:
          isEncryptionEnabled && key
            ? await encrypt(finalContent, key)
            : finalContent,
        reasoning:
          isEncryptionEnabled && key && reasoningContent
            ? await encrypt(reasoningContent, key)
            : reasoningContent || null,
        is_encrypted: isEncryptionEnabled,
      };

      const { data: assistantMsgData, error: assistantInsertError } =
        await supabase
          .from("chat_messages")
          .insert(insertData)
          .select()
          .single();

      if (assistantInsertError) throw assistantInsertError;

      setAllMessages((prev) =>
        prev.map((m) =>
          m.id === "temp-streaming" ? { ...m, id: assistantMsgData.id } : m,
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
    isEncryptionEnabled,
    selectedLlmCharacter,
    availableCharacters,
  ]);

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
    }
  };

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
          setActiveChildren((prev) => ({
            ...prev,
            [parentId]: siblings[currentIndex - 1].id!,
          }));
        } else if (e.key === "ArrowRight") {
          if (currentIndex < siblings.length - 1) {
            setActiveChildren((prev) => ({
              ...prev,
              [parentId]: siblings[currentIndex + 1].id!,
            }));
          } else {
            handleRegenerate();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allMessages, messages, isTyping, handleRegenerate]);

  const appStateClass =
    !currentChatId && messages.length === 0 ? "state-empty" : "state-active";
  const respondingClass = isTyping ? "state-responding" : "";

  return (
    <div
      className="w-full h-[calc(100vh-200px)] relative overflow-hidden rounded-xl"
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
        
        .font-family-material {
            font-family: 'Material Symbols Outlined';
        }
      `}</style>
      <EncryptionUnlockModal
        isOpen={showEncryptionUnlockModal}
        onClose={() => setShowEncryptionUnlockModal(false)}
        onUnlock={() => {
          setShowEncryptionUnlockModal(false);
          fetchData();
        }}
      />
      <InteractiveBackground />
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] orb-1 rounded-full animate-blob mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[900px] h-[900px] orb-2 rounded-full animate-blob-reverse mix-blend-screen"></div>
      </div>

      {/* Sidebar Trigger */}
      <div className="fixed inset-y-0 right-0 z-40 group flex justify-end pointer-events-none">
        <div className="w-12 h-full pointer-events-auto"></div>
        {/* Sidebar */}
        <div className="h-full w-[280px] translate-x-full group-hover:translate-x-0 transition-transform duration-300 ease-out bg-black/80 backdrop-blur-xl pointer-events-auto flex flex-col p-4 justify-between absolute right-0 shadow-2xl">
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
                        "flex items-center gap-3 px-3 py-2 rounded-lg group text-left cursor-pointer transition-colors",
                        currentChatId === c.id
                          ? "bg-white/10 text-white"
                          : "hover:bg-white/5 text-slate-400 hover:text-white",
                      )}
                      onClick={() => setCurrentChatId(c.id)}
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
                              if (currentChatId === c.id)
                                setCurrentChatId(null);
                            });
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <main
        className={cn(
          "flex-1 flex flex-col relative z-10 h-full overflow-hidden w-full transition-all duration-500",
          appStateClass,
          respondingClass,
        )}
      >
        <header className="h-[72px] shrink-0 flex items-center justify-between px-6 bg-black/40 backdrop-blur-xl absolute top-0 w-full z-20">
          <h2
            className={cn(
              "font-display font-medium text-lg text-white/90 ml-4 transition-opacity duration-300",
              !currentChatId ? "opacity-0" : "opacity-100",
            )}
          >
            {chats.find((c) => c.id === currentChatId)?.title ||
              "New Conversation"}
          </h2>
        </header>

        {/* Chat Scrolling Area */}
        <div
          className={cn(
            "flex-1 overflow-y-auto pt-[88px] pb-[160px] px-6 w-full max-w-[848px] mx-auto scroll-smooth absolute inset-0 z-10 transition-all duration-500",
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
              if (isLastAssistant && isTyping && !m.content && !m.reasoning) {
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
                      setActiveChildren((prev) => ({
                        ...prev,
                        [m.parent_id || "root"]: sibling.id!,
                      }));
                    }
                  }}
                  onRegenerate={handleRegenerate}
                  setActiveArtifact={setActiveArtifact}
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
          <div className="w-full flex flex-col items-center justify-center transform -translate-y-[10vh]">
            <h1 className="text-[48px] font-display font-semibold leading-tight tracking-tight mb-12 text-center text-transparent bg-clip-text bg-gradient-to-br from-primary to-accent pb-2">
              How can I help you?
            </h1>
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 w-full z-30 pointer-events-none h-full flex flex-col justify-end">
          <div className="h-[120px] w-full bottom-mask absolute bottom-0 left-0"></div>
          <div
            className={cn(
              "absolute left-0 right-0 mx-auto w-full max-w-[800px] px-6 pointer-events-auto transition-transform duration-500",
              !currentChatId && messages.length === 0
                ? "bottom-[40vh]"
                : "bottom-8",
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
                    <span className="material-symbols-outlined text-[20px] font-family-material">
                      add
                    </span>
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
                      {/* Reasoning Toggle */}
                      <button
                        onClick={() =>
                          setIsReasoningEnabled(!isReasoningEnabled)
                        }
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 w-full rounded-lg transition-colors group">
                          <div className="flex flex-col">
                            <span className="text-sm text-white/90 font-medium font-display">
                              Reasoning
                            </span>
                            <span className="text-[11px] text-slate-400 font-body">
                              Toggle AI thought process
                            </span>
                          </div>
                          {isReasoningEnabled && (
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
                            .filter((c) => !c.is_universe)
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
                            .filter((c) => !c.is_universe)
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

                <div
                  className="relative shrink-0 flex items-center gap-1"
                  ref={modelDropdownRef}
                >
                  <button
                    onClick={() => {
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
                    <span className="material-symbols-outlined text-[18px] font-family-material">
                      expand_more
                    </span>
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
                    <div className="max-h-[300px] overflow-y-auto no-scrollbar pb-2">
                      {hasHordeModels && (
                        <>
                          <div className="px-3 pt-3 pb-1">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-display font-medium">
                              Default Models
                            </p>
                          </div>
                          <div className="px-3 pb-1">
                            <p className="text-[11px] text-slate-400 font-display font-medium">
                              AI Horde
                            </p>
                          </div>
                          <div className="px-2 pl-3 border-l border-white/5 ml-3">
                            {hordeModels.map((m) => (
                              <button
                                key={m.model_id}
                                onClick={() => {
                                  setSelection(m.model_id, m.provider);
                                  setModelDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group relative",
                                  selectedModel === m.model_id &&
                                    selectedProvider === m.provider
                                    ? "bg-white/5"
                                    : "",
                                )}
                              >
                                <div className="text-sm text-white font-medium">
                                  {
                                    formatModelLabel(
                                      m.provider,
                                      m.model_id,
                                    ).split(" - ")[0]
                                  }
                                </div>
                                <div className="text-[11px] text-slate-400 truncate flex items-center justify-between w-full">
                                  <span>
                                    {formatModelLabel(
                                      m.provider,
                                      m.model_id,
                                    ).split(" - ")[1] || ""}
                                  </span>
                                  {hordeStatus?.[m.model_id]?.eta > 0 && (
                                    <span className="text-cyan-500/70 ml-2 whitespace-nowrap">
                                      ETA:{" "}
                                      {formatHordeEta(
                                        hordeStatus[m.model_id].eta,
                                      )}
                                    </span>
                                  )}
                                </div>
                                {selectedModel === m.model_id &&
                                  selectedProvider === m.provider && (
                                    <Check className="w-4 h-4 text-primary absolute right-3 top-1/2 -translate-y-1/2" />
                                  )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {hasCloudflareModels && (
                        <>
                          <div className="px-3 pb-1 pt-3 flex justify-between items-center">
                            <p className="text-[11px] text-slate-400 font-display font-medium">
                              Cloudflare
                            </p>
                            {pointsStatus !== null && (
                              <div className="flex flex-col items-end gap-1.5 mt-1 mr-1">
                                <span className="text-[10px] font-mono text-cyan-400 font-medium">
                                  {pointsStatus.available}/{pointsStatus.given}
                                </span>
                                <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cyan-400"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, (pointsStatus.available / pointsStatus.given) * 100))}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="px-2 pl-3 border-l border-white/5 ml-3">
                            {cloudflareModels.map((m) => (
                              <button
                                key={`${m.provider}-${m.model_id}`}
                                onClick={() => {
                                  setSelection(m.model_id, m.provider);
                                  setModelDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group relative",
                                  selectedModel === m.model_id &&
                                    selectedProvider === m.provider
                                    ? "bg-white/5"
                                    : "",
                                )}
                              >
                                <div className="text-sm text-white font-medium">
                                  {
                                    formatModelLabel(
                                      m.provider,
                                      m.model_id,
                                    ).split(" - ")[0]
                                  }
                                </div>
                                <div className="text-[11px] text-slate-400 truncate w-full pr-4">
                                  {formatModelLabel(
                                    m.provider,
                                    m.model_id,
                                  ).split(" - ")[1] || ""}
                                </div>
                                {selectedModel === m.model_id &&
                                  selectedProvider === m.provider && (
                                    <Check className="w-4 h-4 text-primary absolute right-3 top-1/2 -translate-y-1/2" />
                                  )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {otherModels.length > 0 && (
                        <>
                          <div className="px-3 pt-3 pb-1">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-display font-medium">
                              Other Models
                            </p>
                          </div>
                          <div className="px-2">
                            {otherModels.map((m) => (
                              <button
                                key={`${m.provider}-${m.model_id}`}
                                onClick={() => {
                                  setSelection(m.model_id, m.provider);
                                  setModelDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group relative",
                                  selectedModel === m.model_id &&
                                    selectedProvider === m.provider
                                    ? "bg-white/5"
                                    : "",
                                )}
                              >
                                <div className="text-sm text-white font-medium truncate pr-4">
                                  {formatModelLabel(m.provider, m.model_id)}
                                </div>
                                {selectedModel === m.model_id &&
                                  selectedProvider === m.provider && (
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

                {isTyping ? (
                  <button
                    onClick={handleStop}
                    className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 transition-colors duration-200 mr-2 flex-shrink-0"
                    aria-label="Stop generation"
                  >
                    <span className="material-symbols-outlined text-[20px] font-family-material">
                      stop
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim()}
                    className="w-10 h-10 rounded-full bg-transparent hover:bg-white/5 flex items-center justify-center text-white transition-colors duration-200 mr-2 flex-shrink-0 disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <span className="material-symbols-outlined text-[20px] font-family-material">
                      arrow_upward
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {activeArtifact && (
        <ArtifactSidebar
          artifact={activeArtifact}
          onClose={() => setActiveArtifact(null)}
        />
      )}
    </div>
  );
}

export default ChatbotApp;
