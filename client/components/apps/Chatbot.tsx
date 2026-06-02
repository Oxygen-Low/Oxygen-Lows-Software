import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Plus,
  Send,
  Bot,
  User,
  Settings2,
  History,
  Trash2,
  Loader2,
  Cpu,
  Palette
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id?: string;
  role: "system" | "user" | "assistant";
  content: string;
  created_at?: string;
}

interface Chat {
  id: string;
  title: string;
  style: string;
  created_at: string;
}

interface Style {
  id: string;
  title: string;
  description: string;
}

interface Model {
  provider: string;
  model_id: string;
}

export function ChatbotApp() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string>("GeneralAssistant");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChats();
    fetchModels();
    fetchStyles();
  }, []);

  useEffect(() => {
    if (currentChatId) {
      fetchMessages(currentChatId);
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const fetchChats = async () => {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .order("updated_at", { ascending: false });
    if (data) setChats(data);
  };

  const fetchModels = async () => {
    const { data, error } = await supabase
      .from("user_models")
      .select("*");

    // Also check for local providers
    try {
      const res = await fetch("/api/ai/local-providers");
      const localProviders = await res.json();

      const allModels = [...(data || [])];
      for (const p of localProviders) {
        // For simplicity, we assume one model per local provider if not specified
        allModels.push({ provider: p.id, model_id: "default" });
      }

      setModels(allModels);
      if (allModels.length > 0) {
        setSelectedModel(allModels[0].model_id);
        setSelectedProvider(allModels[0].provider);
      }
    } catch (e) {
      if (data) setModels(data);
    }
  };

  const fetchStyles = async () => {
    try {
      const res = await fetch("/api/ai/styles");
      const data = await res.json();
      setStyles(data);
      return;
    } catch (e) {
      console.error("Failed to fetch styles from API, falling back");
    }

    // This is a bit of a hack since we can't easily list files in prompts/chat from client
    // In a real app, you'd have an API endpoint for this.
    // We'll hardcode the known ones and try to fetch descriptions.
    const knownStyles = ["GeneralAssistant", "CodingAssistant"];
    const loadedStyles: Style[] = [];

    for (const s of knownStyles) {
      try {
        const res = await fetch(`/prompts/chat/${s}.description`);
        const text = await res.text();
        const lines = text.split("\n");
        const title = lines.find(l => l.startsWith("Title:"))?.replace("Title:", "").trim() || s;
        const description = lines.find(l => l.startsWith("Description:"))?.replace("Description:", "").trim() || "";
        loadedStyles.push({ id: s, title, description });
      } catch (e) {
        loadedStyles.push({ id: s, title: s, description: "" });
      }
    }
    setStyles(loadedStyles);
  };

  const fetchMessages = async (chatId: string) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  };

  const handleCreateChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("chats")
      .insert({
        user_id: user.id,
        title: "New Chat",
        style: selectedStyle
      })
      .select()
      .single();

    if (data) {
      setChats([data, ...chats]);
      setCurrentChatId(data.id);
    }
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("chats").delete().eq("id", id);
    if (!error) {
      setChats(chats.filter(c => c.id !== id));
      if (currentChatId === id) setCurrentChatId(null);
      toast.success("Chat deleted");
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentChatId || isTyping) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      // 1. Save user message to DB
      await supabase.from("chat_messages").insert({
        chat_id: currentChatId,
        role: "user",
        content: userMessage.content
      });

      // 2. Call AI Proxy
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          messages: [...messages, userMessage],
          stream: false
        })
      });

      const data = await res.json();

      let assistantContent = "";
      if (data.choices?.[0]?.message?.content) {
        assistantContent = data.choices[0].message.content;
      } else if (data.content?.[0]?.text) {
        assistantContent = data.content[0].text;
      } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        assistantContent = data.candidates[0].content.parts[0].text;
      } else if (typeof data === "string") {
        assistantContent = data;
      } else {
        throw new Error("Unexpected response format");
      }

      const assistantMessage: Message = { role: "assistant", content: assistantContent };
      setMessages(prev => [...prev, assistantMessage]);

      // 3. Save assistant message to DB
      await supabase.from("chat_messages").insert({
        chat_id: currentChatId,
        role: "assistant",
        content: assistantContent
      });

      // Update chat timestamp
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", currentChatId);

    } catch (e: any) {
      toast.error(`AI Error: ${e.message}`);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-[700px] gap-6 bg-slate-950/30 rounded-2xl border border-slate-800 p-6">
      {/* Sidebar */}
      <div className="w-64 flex flex-col gap-4 border-r border-slate-800 pr-6">
        <Button onClick={handleCreateChat} className="w-full bg-cyan-600 hover:bg-cyan-700">
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>

        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setCurrentChatId(chat.id)}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all",
                  currentChatId === chat.id
                    ? "bg-cyan-600/10 border border-cyan-500/30 text-cyan-400"
                    : "hover:bg-slate-900 border border-transparent text-slate-400 hover:text-white"
                )}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{chat.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="pt-4 border-t border-slate-800 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
              <Cpu className="w-3 h-3" /> Model
            </label>
            <select
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
              value={`${selectedProvider}:${selectedModel}`}
              onChange={(e) => {
                const [p, m] = e.target.value.split(":");
                setSelectedProvider(p);
                setSelectedModel(m);
              }}
            >
              {models.map((m, idx) => (
                <option key={idx} value={`${m.provider}:${m.model_id}`}>
                  {m.provider} - {m.model_id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
              <Palette className="w-3 h-3" /> Style
            </label>
            <div className="space-y-1">
              {styles.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedStyle(s.id)}
                  className={cn(
                    "p-2 rounded-lg cursor-pointer text-left transition-all",
                    selectedStyle === s.id
                      ? "bg-slate-800 ring-1 ring-cyan-500/50"
                      : "hover:bg-slate-900"
                  )}
                >
                  <p className="text-xs font-bold text-white">{s.title}</p>
                  <p className="text-[10px] text-slate-500 line-clamp-1">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!currentChatId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center">
              <Bot className="w-8 h-8 text-slate-700" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white">No active chat</h3>
              <p className="text-sm">Select a chat or create a new one to start messaging.</p>
            </div>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 pr-4"  >
              <div className="space-y-6 py-4">
                {messages.map((m, idx) => (
                  <div key={idx} className={cn(
                    "flex gap-4 max-w-[85%]",
                    m.role === "user" ? "ml-auto flex-row-reverse" : ""
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      m.role === "user" ? "bg-cyan-600" : "bg-slate-800"
                    )}>
                      {m.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-cyan-400" />}
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-cyan-600/10 border border-cyan-500/20 text-white rounded-tr-none"
                        : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                    )}>
                      {m.content}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
                {isTyping && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="pt-6 border-t border-slate-800">
              <div className="relative group">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Ask anything..."
                  className="w-full bg-slate-900/50 border-slate-800 focus:ring-cyan-500/20 pl-4 pr-12 py-6 text-base"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-cyan-600 hover:bg-cyan-700 h-10 w-10 p-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
