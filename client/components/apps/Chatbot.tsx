import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Bot,
  Send,
  Loader2,
  Monitor,
  Code,
  Copy,
  X,
  Diamond,
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

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Chat {
  id: string;
  title: string;
  style: string;
  llm_character_id: string | null;
  user_character_id: string | null;
  is_encrypted: boolean;
}

interface Style {
  id: string;
  title: string;
  description: string;
}

interface Character {
  id: string;
  name: string;
  display_name: string | null;
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
  // Reset regex state since it's global
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

/**
 * ⚡ Bolt Performance Optimization:
 * Extracting the individual chat message rendering into a `React.memo` wrapped component.
 * This prevents the extremely expensive re-renders of `ReactMarkdown` and `SyntaxHighlighter`
 * for the entire chat history on every single token received during a streaming response.
 */
const ChatMessage = React.memo(
  ({
    message: m,
    setActiveArtifact,
  }: {
    message: Message;
    setActiveArtifact: (art: Artifact) => void;
  }) => {
    const artifacts = m.role === "assistant" ? parseArtifacts(m.content) : [];
    const displayContent = (m.content || "").replace(ARTIFACT_REGEX, "");

    return (
      <div
        className={cn(
          "flex gap-4 max-w-[85%]",
          m.role === "user" ? "ml-auto flex-row-reverse" : "",
        )}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            m.role === "user" ? "bg-cyan-600" : "bg-slate-800",
          )}
        >
          {m.role === "user" ? (
            <div className="w-4 h-4 bg-white/20 rounded-full" />
          ) : (
            <Bot className="w-4 h-4 text-cyan-400" />
          )}
        </div>
        <div
          className={cn(
            "flex flex-col gap-2 flex-1 min-w-0",
            m.role === "user" ? "items-end" : "",
          )}
        >
          <div
            className={cn(
              "p-4 rounded-2xl text-sm",
              m.role === "user"
                ? "bg-cyan-600 text-white"
                : "bg-slate-900 border border-slate-800 text-slate-200",
            )}
          >
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }: any) {
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
              {displayContent}
            </ReactMarkdown>
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

const ArtifactSidebar = ({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) => {
  return (
    <div className="w-[500px] border-l border-slate-800 bg-slate-950 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Code className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {artifact.filename}
            </h3>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              {artifact.language}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            onClick={() => {
              navigator.clipboard.writeText(artifact.content);
              toast.success("Copied to clipboard");
            }}
            aria-label="Copy to clipboard"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            onClick={onClose}
            aria-label="Close artifact"
            title="Close artifact"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-0">
          <SyntaxHighlighter
            language={artifact.language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: "24px",
              background: "transparent",
              fontSize: "13px",
            }}
          >
            {artifact.content}
          </SyntaxHighlighter>
        </div>
      </ScrollArea>
    </div>
  );
};

export function ChatbotApp() {
  const { session } = useAuth();
  const { models, selectedModel, selectedProvider, setSelection } =
    useAiModels();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef(false);
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("GeneralAssistant");
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>(
    [],
  );
  const [selectedLlmCharacter, setSelectedLlmCharacter] = useState<
    string | null
  >(null);
  const [selectedUserCharacter, setSelectedUserCharacter] = useState<
    string | null
  >(null);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [showEncryptionUnlockModal, setShowEncryptionUnlockModal] =
    useState(false);
  const [isEncryptionEnabled, setIsEncryptionEnabled] = useState(false);
  const lastParsedLengthRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
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

    const { data: stylesData } = await supabase.rpc("get_chat_styles");
    if (stylesData) setStyles(stylesData);

    const { data: chars } = await supabase
      .from("characters")
      .select("id, name, display_name, is_encrypted")
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
  };

  useEffect(() => {
    fetchData();
  }, [session?.user?.id]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!currentChatId) {
        setMessages([]);
        return;
      }

      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", currentChatId)
        .order("created_at", { ascending: true });

      if (data) {
        const masterKey = getMasterKey();
        const processed = await Promise.all(
          data.map(async (m) => {
            if (m.is_encrypted && masterKey) {
              try {
                return {
                  role: m.role,
                  content: await decrypt(m.content, masterKey),
                };
              } catch (e) {
                return { role: m.role, content: "[Encrypted Message]" };
              }
            }
            return { role: m.role, content: m.content };
          }),
        );
        setMessages(processed);
      }

      const chat = chats.find((c) => c.id === currentChatId);
      if (chat) {
        setSelectedStyle(chat.style);
        setSelectedLlmCharacter(chat.llm_character_id);
        setSelectedUserCharacter(chat.user_character_id);
      }
    };

    fetchMessages();
  }, [currentChatId, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleCreateChat = async () => {
    if (!session?.user?.id) return;
    const key = getMasterKey();
    if (isEncryptionEnabled && !key) {
      setShowEncryptionUnlockModal(true);
      return;
    }
    const title = "New Chat";
    const { data, error } = await supabase
      .from("chats")
      .insert({
        user_id: session.user.id,
        title: isEncryptionEnabled ? await encrypt(title, key!) : title,
        style: selectedStyle,
        llm_character_id: selectedLlmCharacter,
        user_character_id: selectedUserCharacter,
        is_encrypted: isEncryptionEnabled,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    const chatWithDecryptedTitle = {
      ...data,
      title: isEncryptionEnabled ? title : data.title,
    };
    setChats([chatWithDecryptedTitle, ...chats]);
    setCurrentChatId(data.id);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping || !currentChatId || !session?.user?.id)
      return;

    const key = getMasterKey();
    if (isEncryptionEnabled && !key) {
      setShowEncryptionUnlockModal(true);
      return;
    }

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const originalInput = input;
    setInput("");
    setIsTyping(true);
    isTypingRef.current = true;
    lastParsedLengthRef.current = 0;

    try {
      const { data: userInts } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("provider", selectedProvider)
        .single();
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("encryption_settings")
        .eq("user_id", session.user.id)
        .single();
      const encryptionSettings = prefs?.encryption_settings || {};

      let decryptedKey = undefined;
      let decryptedBaseUrl = undefined;

      if (userInts && encryptionSettings.integrations) {
        if (key) {
          if (userInts.api_key)
            decryptedKey = await decrypt(userInts.api_key, key);
          if (userInts.base_url)
            decryptedBaseUrl = await decrypt(userInts.base_url, key);
        }
      }

      const { error: userInsertError } = await supabase
        .from("chat_messages")
        .insert({
          chat_id: currentChatId,
          role: "user",
          content:
            isEncryptionEnabled && key
              ? await encrypt(originalInput, key)
              : originalInput,
          is_encrypted: isEncryptionEnabled,
        });
      if (userInsertError) throw userInsertError;

      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          messages: newMessages,
          style: selectedStyle,
          stream: true,
          apiKey: decryptedKey,
          baseUrl: decryptedBaseUrl,
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseAiProxyError(response);
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;
            const dataStr = line.replace("data: ", "");
            if (dataStr === "[DONE]") break;

            try {
              const data = JSON.parse(dataStr);
              let delta = "";

              if (selectedProvider === "anthropic") {
                delta = data.delta?.text || "";
              } else if (
                selectedProvider === "openai" ||
                selectedProvider === "openrouter" ||
                selectedProvider === "grok" ||
                selectedProvider === "custom" ||
                selectedProvider === "lmstudio" ||
                selectedProvider === "koboldcpp" ||
                selectedProvider === "kobold"
              ) {
                delta = data.choices?.[0]?.delta?.content || "";
              } else if (selectedProvider === "ollama") {
                delta = data.message?.content || data.response || "";
              } else if (selectedProvider === "google") {
                delta =
                  data.delta?.content ||
                  data.message?.content?.text ||
                  data.candidates?.[0]?.content?.parts?.[0]?.text ||
                  "";
              }

              if (delta) {
                fullContent += delta;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: fullContent },
                  ];
                });

                if (
                  fullContent.length - lastParsedLengthRef.current > 50 ||
                  fullContent.includes("\\\\")
                ) {
                  const arts = parseArtifacts(fullContent);
                  if (arts.length > 0) setActiveArtifact(arts[arts.length - 1]);
                  lastParsedLengthRef.current = fullContent.length;
                }
              }
            } catch (e) {
              console.error("Parse error", e);
            }
          }
        }
      }

      const { error: assistantInsertError } = await supabase
        .from("chat_messages")
        .insert({
          chat_id: currentChatId,
          role: "assistant",
          content:
            isEncryptionEnabled && key
              ? await encrypt(fullContent, key)
              : fullContent,
          is_encrypted: isEncryptionEnabled,
        });
      if (assistantInsertError) throw assistantInsertError;
      const { error: chatUpdateError } = await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", currentChatId);
      if (chatUpdateError) throw chatUpdateError;
    } catch (e: any) {
      toast.error(e.message);
      // Restore input if failed and no optimistic message saved yet?
      // The prompt said: "otherwise preserve input and notify the user"
      if (input === "") setInput(originalInput);
    } finally {
      setIsTyping(false);
      isTypingRef.current = false;
    }
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

  return (
    <div className="flex h-[700px] gap-0 bg-slate-950/30 rounded-2xl border border-slate-800 overflow-hidden text-slate-200">
      <EncryptionUnlockModal
        isOpen={showEncryptionUnlockModal}
        onClose={() => setShowEncryptionUnlockModal(false)}
        onUnlock={() => {
          setShowEncryptionUnlockModal(false);
          fetchData();
        }}
      />
      <div className="w-64 flex flex-col gap-4 border-r border-slate-800 p-6">
        <Button onClick={handleCreateChat} className="w-full bg-cyan-600">
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {chats.map((c) => (
              <div
                key={c.id}
                onClick={() => setCurrentChatId(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCurrentChatId(c.id);
                  }
                }}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
                  currentChatId === c.id
                    ? "bg-cyan-600/10 text-cyan-400"
                    : "text-slate-400",
                )}
              >
                <span className="truncate text-sm">{c.title}</span>
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
                  aria-label={`Delete chat ${c.title}`}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
                  title={`Delete chat ${c.title}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="pt-4 border-t border-slate-800 space-y-4 overflow-y-auto">
          <div>
            <label
              htmlFor="model-select"
              className="text-[10px] font-bold text-slate-500 uppercase"
            >
              Model
            </label>
            <select
              id="model-select"
              className="w-full bg-slate-900 text-xs text-white p-2 rounded"
              value={`${selectedProvider}:${selectedModel}`}
              onChange={(e) => {
                const [p, m] = e.target.value.split(":");
                setSelection(m, p);
              }}
            >
              {models.map((m) => (
                <option
                  key={`${m.provider}:${m.model_id}`}
                  value={`${m.provider}:${m.model_id}`}
                >
                  {formatModelLabel(m.provider, m.model_id)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              id="style-select-label"
              className="text-[10px] font-bold text-slate-500 uppercase"
            >
              Style
            </label>
            <div
              className="space-y-1"
              role="listbox"
              aria-labelledby="style-select-label"
            >
              {styles.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedStyle(s.id);
                    updateChatSetting({ style: s.id });
                  }}
                  role="option"
                  aria-selected={selectedStyle === s.id}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedStyle(s.id);
                      updateChatSetting({ style: s.id });
                    }
                  }}
                  className={cn(
                    "p-2 rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500/50",
                    selectedStyle === s.id
                      ? "bg-slate-800 ring-1 ring-cyan-500/50"
                      : "hover:bg-slate-900",
                  )}
                >
                  <p className="text-xs font-bold text-white">{s.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label
              htmlFor="llm-character-select"
              className="text-[10px] font-bold text-slate-500 uppercase"
            >
              LLM Character
            </label>
            <select
              id="llm-character-select"
              className="w-full bg-slate-900 text-xs text-white p-2 rounded mt-1"
              value={selectedLlmCharacter || ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setSelectedLlmCharacter(val);
                updateChatSetting({ llm_character_id: val });
              }}
            >
              <option value="">None</option>
              {availableCharacters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="user-character-select"
              className="text-[10px] font-bold text-slate-500 uppercase"
            >
              User Character
            </label>
            <select
              id="user-character-select"
              className="w-full bg-slate-900 text-xs text-white p-2 rounded mt-1"
              value={selectedUserCharacter || ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setSelectedUserCharacter(val);
                updateChatSetting({ user_character_id: val });
              }}
            >
              <option value="">None</option>
              {availableCharacters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 p-6">
        {!currentChatId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <Bot className="w-12 h-12 mb-4" />
            <p>Select a chat to start</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 py-4">
                {messages.map((m, i) => (
                  <ChatMessage
                    key={i}
                    message={m}
                    setActiveArtifact={setActiveArtifact}
                  />
                ))}
                {isTyping && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                      <span className="animate-pulse">...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="pt-6 border-t border-slate-800 relative">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isTyping && handleSendMessage()
                }
                placeholder="Ask anything..."
                className="w-full bg-slate-900/50 pl-4 pr-12 py-6 border-slate-700 text-white"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || isTyping}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-cyan-600 h-10 w-10 p-0 hover:bg-cyan-700"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
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
