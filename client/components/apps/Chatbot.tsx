import { useState, useEffect, useRef } from "react";
import { Send, Plus, Trash2, Bot, User, Loader2, FileCode, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ArtifactSidebar } from "./ArtifactSidebar";

export interface Artifact {
  language: string;
  filename: string;
  content: string;
}

export const parseArtifacts = (content: string): Artifact[] => {
  const artifacts: Artifact[] = [];
  const regex = /`\/([^/]+)\/\/([^/]+)\/`[\s\n]*\/\/\/\/([\s\S]*?)(?:\\\\\\\\|$)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    artifacts.push({
      language: match[1],
      filename: match[2],
      content: match[3].trim()
    });
  }
  return artifacts;
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface Chat {
  id: string;
  title: string;
  style: string;
  llm_character_id?: string | null;
  user_character_id?: string | null;
  updated_at: string;
}

const styles = [
  { id: "none", title: "None", description: "Disable style system" },
  { id: "general", title: "General Assistant", description: "Helpful and concise" },
  { id: "coding", title: "Coding Expert", description: "Specialized in software development" },
  { id: "creative", title: "Creative Writer", description: "Imaginative and expressive" },
];

export const ChatbotApp = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("general");
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [models, setModels] = useState<any[]>([]);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [selectedLlmCharacter, setSelectedLlmCharacter] = useState<string | null>(null);
  const [selectedUserCharacter, setSelectedUserCharacter] = useState<string | null>(null);
  const [availableCharacters, setAvailableCharacters] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastParsedLengthRef = useRef(0);

  useEffect(() => {
    fetchChats();
    fetchModels();
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    const { data } = await supabase.from("characters").select("*").order("name");
    if (data) setAvailableCharacters(data);
  };

  const fetchChats = async () => {
    const { data } = await supabase.from("chats").select("*").order("updated_at", { ascending: false });
    if (data) setChats(data);
  };

  const fetchModels = async () => {
    const { data } = await supabase.from("user_models").select("*").order("provider");
    if (data && data.length > 0) {
      setModels(data);
      setSelectedProvider(data[0].provider);
      setSelectedModel(data[0].model_id);
    }
  };

  useEffect(() => {
    if (currentChatId) {
      fetchMessages(currentChatId);
      const chat = chats.find(c => c.id === currentChatId);
      if (chat) {
        setSelectedStyle(chat.style || "general");
        setSelectedLlmCharacter(chat.llm_character_id || null);
        setSelectedUserCharacter(chat.user_character_id || null);
      }
    } else {
      setMessages([]);
    }
  }, [currentChatId, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async (chatId: string) => {
    const { data } = await supabase.from("chat_messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true });
    if (data) setMessages(data.map(m => ({ role: m.role, content: m.content })));
  };

  const handleCreateChat = async () => {
    try {
      const { data, error } = await supabase.from("chats").insert({
        title: "New Chat",
        style: selectedStyle,
        llm_character_id: selectedLlmCharacter,
        user_character_id: selectedUserCharacter
      }).select().single();
      if (error) throw error;
      setChats([data, ...chats]);
      setCurrentChatId(data.id);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentChatId) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    lastParsedLengthRef.current = 0;

    try {
      const { error: userInsertError } = await supabase.from("chat_messages").insert({ chat_id: currentChatId, ...userMsg });
      if (userInsertError) throw new Error("Failed to persist user message");

      const llmChar = availableCharacters.find(c => c.id === selectedLlmCharacter);
      const userChar = availableCharacters.find(c => c.id === selectedUserCharacter);

      let systemPrompt = "";
      if (selectedStyle !== "none") {
        const styleObj = styles.find(s => s.id === selectedStyle);
        systemPrompt = styleObj ? styleObj.description : "";
      }

      if (llmChar) {
        systemPrompt += `\nYou are playing the character: ${llmChar.name}.
Description: ${llmChar.short_description || ""}
Appearance: ${llmChar.appearance || ""}
Personality: ${llmChar.personality || ""}
Backstory: ${llmChar.backstory || ""}`;
      }

      if (userChar) {
        systemPrompt += `\nThe person you are talking to is: ${userChar.name}.
Description: ${userChar.short_description || ""}
Appearance: ${userChar.appearance || ""}
Personality: ${userChar.personality || ""}
Backstory: ${userChar.backstory || ""}`;
      }

      const history = [...messages, userMsg];
      const chatContext = systemPrompt ? [{ role: "system", content: systemPrompt }, ...history] : history;

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatContext,
          provider: selectedProvider,
          model: selectedModel,
          stream: true
        })
      });

      if (!response.ok) throw new Error("AI request failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      let fullContent = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split("\n").filter(l => l.trim().startsWith("data: "));

        for (const line of lines) {
          const dataStr = line.replace("data: ", "");
          if (dataStr === "[DONE]") break;

          try {
            const data = JSON.parse(dataStr);
            let delta = "";
            if (selectedProvider === "openai" || selectedProvider === "openrouter" || selectedProvider === "grok" || selectedProvider === "custom") {
              delta = data.choices?.[0]?.delta?.content || "";
            } else if (selectedProvider === "anthropic") {
              delta = data.delta?.text || "";
            } else if (selectedProvider === "ollama") {
              delta = data.message?.content || data.output?.content || data.output?.text || "";
            } else if (selectedProvider === "kobold") {
              delta = data.text || data.result?.content || "";
            } else if (selectedProvider === "google") {
              delta = data.delta?.content || data.message?.content?.text || data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }

            if (delta) {
              fullContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                return [...prev.slice(0, -1), { ...last, content: fullContent }];
              });

              if (fullContent.length - lastParsedLengthRef.current > 50 || fullContent.includes("\\\\")) {
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

      await supabase.from("chat_messages").insert({ chat_id: currentChatId, role: "assistant", content: fullContent });
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", currentChatId);

    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsTyping(false);
    }
  };

  const updateChatSetting = async (updates: Partial<Chat>) => {
    if (!currentChatId) return;
    try {
      const { error } = await supabase.from("chats").update(updates).eq("id", currentChatId);
      if (error) throw error;
      setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, ...updates } : c));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex h-[700px] gap-0 bg-slate-950/30 rounded-2xl border border-slate-800 overflow-hidden text-slate-200">
      <div className="w-64 flex flex-col gap-4 border-r border-slate-800 p-6">
        <Button onClick={handleCreateChat} className="w-full bg-cyan-600"><Plus className="w-4 h-4 mr-2" /> New Chat</Button>
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {chats.map(c => (
              <div key={c.id} onClick={() => setCurrentChatId(c.id)} className={cn("group flex items-center justify-between p-3 rounded-lg cursor-pointer", currentChatId === c.id ? "bg-cyan-600/10 text-cyan-400" : "text-slate-400")}>
                <span className="truncate text-sm">{c.title}</span>
                <button onClick={e => { e.stopPropagation(); supabase.from("chats").delete().eq("id", c.id).then(() => { setChats(chats.filter(x => x.id !== c.id)); if (currentChatId === c.id) setCurrentChatId(null); }); }} className="opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="pt-4 border-t border-slate-800 space-y-4 overflow-y-auto">
          <div><label className="text-[10px] font-bold text-slate-500 uppercase">Model</label>
            <select className="w-full bg-slate-900 text-xs text-white p-2 rounded" value={`${selectedProvider}:${selectedModel}`} onChange={e => { const [p, m] = e.target.value.split(":"); setSelectedProvider(p); setSelectedModel(m); }}>
              {models.map((m, i) => <option key={i} value={`${m.provider}:${m.model_id}`}>{m.provider} - {m.model_id}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] font-bold text-slate-500 uppercase">Style</label>
            <div className="space-y-1">{styles.map(s => <div key={s.id} onClick={() => { setSelectedStyle(s.id); updateChatSetting({ style: s.id }); }} className={cn("p-2 rounded cursor-pointer", selectedStyle === s.id ? "bg-slate-800 ring-1 ring-cyan-500/50" : "hover:bg-slate-900")}><p className="text-xs font-bold text-white">{s.title}</p><p className="text-[10px] text-slate-500 truncate">{s.description}</p></div>)}</div>
          </div>
          <div><label className="text-[10px] font-bold text-slate-500 uppercase">LLM Character</label>
            <select className="w-full bg-slate-900 text-xs text-white p-2 rounded mt-1" value={selectedLlmCharacter || ""} onChange={e => { const val = e.target.value || null; setSelectedLlmCharacter(val); updateChatSetting({ llm_character_id: val }); }}>
              <option value="">None</option>
              {availableCharacters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] font-bold text-slate-500 uppercase">User Character</label>
            <select className="w-full bg-slate-900 text-xs text-white p-2 rounded mt-1" value={selectedUserCharacter || ""} onChange={e => { const val = e.target.value || null; setSelectedUserCharacter(val); updateChatSetting({ user_character_id: val }); }}>
              <option value="">None</option>
              {availableCharacters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 p-6">
        {!currentChatId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500"><Bot className="w-12 h-12 mb-4" /><p>Select a chat to start</p></div>
        ) : (
          <>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 py-4">
                {messages.map((m, i) => {
                  const artifacts = m.role === "assistant" ? parseArtifacts(m.content) : [];
                  const displayContent = (m.content || "").replace(/`\/([^/]+)\/\/([^/]+)\/`[\s\n]*\/\/\/\/([\s\S]*?)(?:\\\\\\\\|$)/g, "");

                  return (
                    <div key={i} className={cn("flex gap-4 max-w-[85%]", m.role === "user" ? "ml-auto flex-row-reverse" : "")}>
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", m.role === "user" ? "bg-cyan-600" : "bg-slate-800")}>
                        {m.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-cyan-400" />}
                      </div>
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div className={cn("p-4 rounded-2xl text-sm prose prose-invert max-w-none", m.role === "user" ? "bg-cyan-600/10 border border-cyan-500/20 text-white" : "bg-slate-900 border border-slate-800 text-slate-200")}>
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
                            {displayContent}
                          </ReactMarkdown>
                        </div>
                        {artifacts.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {artifacts.map((art, idx) => (
                              <Button key={idx} variant="outline" size="sm" className="h-9 bg-slate-900/50 border-slate-800 hover:bg-slate-800 text-xs" onClick={() => setActiveArtifact(art)}>
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
                {isTyping && <div className="flex gap-4"><div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center"><Loader2 className="w-4 h-4 text-cyan-400 animate-spin" /></div><div className="p-4 rounded-2xl bg-slate-900 border border-slate-800"><span className="animate-pulse">...</span></div></div>}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="pt-6 border-t border-slate-800 relative">
              <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendMessage()} placeholder="Ask anything..." className="w-full bg-slate-900/50 pl-4 pr-12 py-6 border-slate-700 text-white" />
              <Button onClick={handleSendMessage} disabled={!input.trim() || isTyping} className="absolute right-2 top-1/2 -translate-y-1/2 bg-cyan-600 h-10 w-10 p-0 hover:bg-cyan-700" aria-label="Send message"><Send className="w-4 h-4" /></Button>
            </div>
          </>
        )}
      </div>
      {activeArtifact && <ArtifactSidebar artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />}
    </div>
  );
};

export default ChatbotApp;
