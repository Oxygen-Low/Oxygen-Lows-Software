import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  Send,
  Plus,
  Trash2,
  Loader2,
  Bot,
  User,
  FileCode,
  X,
  Copy,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useAiModels } from "@/hooks/useAiModels";
import { toast } from "sonner";
import { encrypt, decrypt, getMasterKey } from "@/lib/crypto";
import { UnlockModal } from "@/components/UnlockModal";

interface Chat {
  id: string;
  title: string;
  created_at: string;
  style: string;
  llm_character_id: string | null;
  user_character_id: string | null;
  is_encrypted?: boolean;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatStyle {
  id: string;
  title: string;
  description: string;
  prompt: string;
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

const parseArtifacts = (content: string): Artifact[] => {
  const artifacts: Artifact[] = [];
  const regex =
    /`\/([^/]+)\/\/([^/]+)\/`[\s\n]*\/\/\/\/([\s\S]*?)(?:\\\\\\\\|$)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    artifacts.push({
      id: Math.random().toString(36).substr(2, 9),
      filename: match[1],
      language: match[2],
      content: match[3].trim(),
    });
  }
  return artifacts;
};

const formatModelLabel = (provider: string, modelId: string) => {
  if (provider === "ollama") return "ollama/" + modelId;
  if (provider === "lmstudio") return "lmstudio/" + modelId;
  if (provider === "koboldcpp" || provider === "kobold")
    return "koboldcpp/" + modelId;
  return provider + " - " + modelId;
};

const ArtifactSidebar = ({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <div
      className={cn(
        "border-l border-slate-800 bg-slate-900 transition-all duration-300 flex flex-col",
        isMaximized ? "fixed inset-0 z-50" : "w-[450px]",
      )}
    >
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-3">
          <FileCode className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">
              {artifact.filename}
            </h3>
            <p className="text-[10px] text-slate-500 uppercase font-mono">
              {artifact.language}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            onClick={() => {
              navigator.clipboard.writeText(artifact.content);
              toast.success("Copied to clipboard");
            }}
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            onClick={() => setIsMaximized(!isMaximized)}
          >
            {isMaximized ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={artifact.language}
            customStyle={{
              margin: 0,
              background: "transparent",
              fontSize: "13px",
              lineHeight: "1.6",
            }}
          >
            {artifact.content}
          </SyntaxHighlighter>
        </div>
      </ScrollArea>
    </div>
  );
};

export const ChatbotApp = () => {
  const { session } = useAuth();
  const { models, selectedModel, selectedProvider, setSelection } =
    useAiModels();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [styles, setStyles] = useState<ChatStyle[]>([]);
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
  const [isEncryptionEnabled, setIsEncryptionEnabled] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastParsedLengthRef = useRef(0);
  const isTypingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;

    const [{ data: prefs }, { data: styleList }, { data: chars }] =
      await Promise.all([
        supabase
          .from("user_preferences")
          .select("encryption_settings")
          .eq("user_id", session.user.id)
          .single(),
        supabase.rpc("get_chat_styles"),
        supabase
          .from("characters")
          .select("id, name, display_name, is_encrypted")
          .eq("user_id", session.user.id),
      ]);

    const enabled = prefs?.encryption_settings?.chats || false;
    setIsEncryptionEnabled(enabled);

    if (styleList) setStyles(styleList);

    const key = getMasterKey();
    if (enabled && !key) {
      setShowUnlockModal(true);
    } else {
      const { data: chatList } = await supabase
        .from("chats")
        .select("*")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false });
      if (chatList) {
        const processedChats = await Promise.all(
          chatList.map(async (c) => {
            if (!c.is_encrypted) return c;
            try {
              if (!key) throw new Error("No key");
              return { ...c, title: await decrypt(c.title, key) };
            } catch (e) {
              return { ...c, title: "[Encrypted]" };
            }
          }),
        );
        setChats(processedChats);
      }

      if (chars) {
        const processedChars = await Promise.all(
          chars.map(async (c) => {
            if (!c.is_encrypted) return c;
            try {
              if (!key) throw new Error("No key");
              return {
                ...c,
                display_name: c.display_name
                  ? await decrypt(c.display_name, key)
                  : null,
                name: await decrypt(c.name, key),
              };
            } catch (e) {
              return { ...c, name: "[Encrypted]" };
            }
          }),
        );
        setAvailableCharacters(processedChars);
      }
    }
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!currentChatId) {
      setMessages([]);
      setSelectedLlmCharacter(null);
      setSelectedUserCharacter(null);
      return;
    }

    const fetchMessages = async () => {
      const { data: msgList } = await supabase
        .from("chat_messages")
        .select("role, content, is_encrypted")
        .eq("chat_id", currentChatId)
        .order("created_at", { ascending: true });

      if (msgList) {
        const key = getMasterKey();
        const processedMessages = await Promise.all(
          msgList.map(async (m) => {
            if (!m.is_encrypted) return m;
            try {
              if (!key) throw new Error("No key");
              return { ...m, content: await decrypt(m.content, key) };
            } catch (e) {
              return { ...m, content: "[Encrypted Content]" };
            }
          }),
        );
        setMessages(processedMessages as Message[]);
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
      setShowUnlockModal(true);
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

    const userMessage: Message = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
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
        const masterKey = getMasterKey();
        if (masterKey) {
          if (userInts.api_key)
            decryptedKey = await decrypt(userInts.api_key, masterKey);
          if (userInts.base_url)
            decryptedBaseUrl = await decrypt(userInts.base_url, masterKey);
        }
      }

      const key = getMasterKey();
      if (isEncryptionEnabled && !key) {
        setShowUnlockModal(true);
        return;
      }
      const { error: userInsertError } = await supabase
        .from("chat_messages")
        .insert({
          chat_id: currentChatId,
          role: "user",
          content:
            isEncryptionEnabled && key ? await encrypt(input, key) : input,
          is_encrypted: isEncryptionEnabled,
        });
      if (userInsertError) throw userInsertError;

      const style = styles.find((s) => s.id === selectedStyle);

      const token = (await supabase.auth.getSession()).data.session
        ?.access_token;
      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          messages: newMessages,
          systemPrompt: style?.prompt,
          stream: true,
          llm_character_id: selectedLlmCharacter,
          user_character_id: selectedUserCharacter,
          apiKey: decryptedKey,
          baseUrl: decryptedBaseUrl,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to get response");
        } else {
          const errorText = await response.text();
          if (
            errorText.includes("<!DOCTYPE html>") ||
            errorText.includes("<html>")
          ) {
            throw new Error(
              "The AI service returned an unexpected HTML error. This usually means the service is down, misconfigured, or blocked by a firewall.",
            );
          }
          throw new Error(`Server error: ${errorText.substring(0, 100)}`);
        }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      let fullContent = "";
      setMessages([...newMessages, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          if (line.includes("[DONE]")) continue;

          try {
            const data = JSON.parse(line.slice(6));
            let delta = "";

            if (
              selectedProvider === "openai" ||
              selectedProvider === "openrouter" ||
              selectedProvider === "grok" ||
              selectedProvider === "custom" ||
              selectedProvider === "stablehorde" ||
              selectedProvider === "lmstudio" ||
              selectedProvider === "koboldcpp" ||
              selectedProvider === "kobold"
            ) {
              delta = data.choices?.[0]?.delta?.content || "";
            } else if (selectedProvider === "anthropic") {
              delta = data.delta?.text || "";
            } else if (selectedProvider === "ollama") {
              delta =
                data.message?.content ||
                data.output?.content ||
                data.output?.text ||
                "";
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
      <UnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        onUnlock={() => {
          setShowUnlockModal(false);
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
                className={cn(
                  "group flex items-center justify-between p-3 rounded-lg cursor-pointer",
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
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="pt-4 border-t border-slate-800 space-y-4 overflow-y-auto">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Model
            </label>
            <select
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
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Style
            </label>
            <div className="space-y-1">
              {styles.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedStyle(s.id);
                    updateChatSetting({ style: s.id });
                  }}
                  className={cn(
                    "p-2 rounded cursor-pointer",
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
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              LLM Character
            </label>
            <select
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
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              User Character
            </label>
            <select
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
                {messages.map((m, i) => {
                  const artifacts =
                    m.role === "assistant" ? parseArtifacts(m.content) : [];
                  const displayContent = (m.content || "").replace(
                    /`\/([^/]+)\/\/([^/]+)\/`[\s\n]*\/\/\/\/([\s\S]*?)(?:\\\\\\\\|$)/g,
                    "",
                  );

                  return (
                    <div
                      key={i}
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
                          <User className="w-4 h-4 text-white" />
                        ) : (
                          <Bot className="w-4 h-4 text-cyan-400" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div
                          className={cn(
                            "p-4 rounded-2xl text-sm prose prose-invert max-w-none",
                            m.role === "user"
                              ? "bg-cyan-600/10 border border-cyan-500/20 text-white"
                              : "bg-slate-900 border border-slate-800 text-slate-200",
                          )}
                        >
                          <ReactMarkdown
                            components={{
                              code({
                                node,
                                inline,
                                className,
                                children,
                                ...props
                              }: any) {
                                const match = /language-(\w+)/.exec(
                                  className || "",
                                );
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
                            {artifacts.map((art, idx) => (
                              <Button
                                key={idx}
                                variant="outline"
                                size="sm"
                                className="h-9 bg-slate-900/50 border-slate-800 hover:bg-slate-800 text-xs"
                                onClick={() => setActiveArtifact(art)}
                              >
                                <FileCode className="w-3.5 h-3.5 mr-2 text-cyan-400" />
                                {art.filename}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
};

export default ChatbotApp;
