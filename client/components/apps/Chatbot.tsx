import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Send, Bot, User, Trash2, Loader2, Cpu, Palette } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message { role: "system" | "user" | "assistant"; content: string; }
interface Chat { id: string; title: string; style: string; updated_at: string; }
interface Style { id: string; title: string; description: string; }
interface Model { provider: string; model_id: string; }

export function ChatbotApp() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("GeneralAssistant");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("chats").select("*").order("updated_at", { ascending: false }).then(({data}) => data && setChats(data));
    supabase.from("user_models").select("*").then(({data}) => {
        if (data && data.length > 0) {
            setModels(data);
            setSelectedModel(data[0].model_id);
            setSelectedProvider(data[0].provider);
        }
    });
    fetch("/api/ai/styles").then(res => res.json()).then(data => setStyles(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentChatId) {
      supabase.from("chat_messages").select("*").eq("chat_id", currentChatId).order("created_at", { ascending: true })
        .then(({data}) => data && setMessages(data));
    } else setMessages([]);
  }, [currentChatId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleCreateChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("chats").insert({ user_id: user.id, title: "New Chat", style: selectedStyle }).select().single();
    if (data) { setChats([data, ...chats]); setCurrentChatId(data.id); }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentChatId || isTyping) return;
    const userMsg: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]); setInput(""); setIsTyping(true);
    try {
      await supabase.from("chat_messages").insert({ chat_id: currentChatId, ...userMsg });
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ provider: selectedProvider, model: selectedModel, messages: [...messages.slice(-10), userMsg], style: selectedStyle, historyPersisted: true, stream: false })
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || data.candidates?.[0]?.content?.parts?.[0]?.text || (typeof data === 'string' ? data : "Error");
      const assistantMsg: Message = { role: "assistant", content };
      setMessages(prev => [...prev, assistantMsg]);
      await supabase.from("chat_messages").insert({ chat_id: currentChatId, ...assistantMsg });
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", currentChatId);
    } catch (e: any) { toast.error(e.message); } finally { setIsTyping(false); }
  };

  return (
    <div className="flex h-[700px] gap-6 bg-slate-950/30 rounded-2xl border border-slate-800 p-6">
      <div className="w-64 flex flex-col gap-4 border-r border-slate-800 pr-6">
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
        <div className="pt-4 border-t border-slate-800 space-y-4">
          <div><label className="text-[10px] font-bold text-slate-500 uppercase">Model</label>
            <select className="w-full bg-slate-900 text-xs text-white p-2 rounded" value={`${selectedProvider}:${selectedModel}`} onChange={e => { const [p, m] = e.target.value.split(":"); setSelectedProvider(p); setSelectedModel(m); }}>
              {models.map((m, i) => <option key={i} value={`${m.provider}:${m.model_id}`}>{m.provider} - {m.model_id}</option>)}
            </select>
          </div>
          <div><label className="text-[10px] font-bold text-slate-500 uppercase">Style</label>
            <div className="space-y-1">{styles.map(s => <div key={s.id} onClick={() => setSelectedStyle(s.id)} className={cn("p-2 rounded cursor-pointer", selectedStyle === s.id ? "bg-slate-800 ring-1 ring-cyan-500/50" : "hover:bg-slate-900")}><p className="text-xs font-bold text-white">{s.title}</p><p className="text-[10px] text-slate-500 truncate">{s.description}</p></div>)}</div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {!currentChatId ? <div className="flex-1 flex flex-col items-center justify-center text-slate-500"><Bot className="w-12 h-12 mb-4" /><p>Select a chat to start</p></div> : <>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 py-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex gap-4 max-w-[85%]", m.role === "user" ? "ml-auto flex-row-reverse" : "")}>
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", m.role === "user" ? "bg-cyan-600" : "bg-slate-800")}>{m.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-cyan-400" />}</div>
                  <div className={cn("p-4 rounded-2xl text-sm", m.role === "user" ? "bg-cyan-600/10 border border-cyan-500/20 text-white" : "bg-slate-900 border border-slate-800 text-slate-200")}>{m.content}</div>
                </div>
              ))}
              {isTyping && <div className="flex gap-4"><div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center"><Loader2 className="w-4 h-4 text-cyan-400 animate-spin" /></div><div className="p-4 rounded-2xl bg-slate-900 border border-slate-800"><span className="animate-pulse">...</span></div></div>}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <div className="pt-6 border-t border-slate-800 relative">
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendMessage()} placeholder="Ask anything..." className="w-full bg-slate-900/50 pl-4 pr-12 py-6" />
            <Button onClick={handleSendMessage} disabled={!input.trim() || isTyping} className="absolute right-2 top-1/2 -translate-y-1/2 bg-cyan-600 h-10 w-10 p-0" aria-label="Send message"><Send className="w-4 h-4" /></Button>
          </div>
        </>}
      </div>
    </div>
  );
}
