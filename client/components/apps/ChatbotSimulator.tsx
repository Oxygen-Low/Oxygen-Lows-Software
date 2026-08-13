import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Plus,
  Bot,
  Send,
  Loader2,
  Trash2,
  Code,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useAiModels } from "@/hooks/useAiModels";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { formatModelLabel, parseAiProxyError } from "@/utils/aiUtils";

const SCENARIOS = [
  {
    name: "Python Error",
    prompt: "I am trying to run this python script but it's throwing an indentation error. Can you help me fix it? \n\n```python\ndef my_func():\nprint('hello')\n```",
  },
  {
    name: "Basic Question",
    prompt: "Hey, what is the capital of France? I always forget.",
  },
  {
    name: "Coding Request",
    prompt: "Can you write a simple React component that is a counter button? It should increment by 1 when clicked.",
  },
  {
    name: "Strawberry Test",
    prompt: "How many 'r's are in the word strawberry?",
  }
];

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
}

export function ChatbotSimulatorApp() {
  const { session } = useAuth();
  const { models, selectedModel, selectedProvider, setSelection } = useAiModels();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter out the active path of messages for the current chat
  const messages = useMemo(() => {
    return allMessages.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  }, [allMessages]);

  useEffect(() => {
    fetchChats();
  }, [session?.user?.id]);

  const fetchChats = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from("simulator_chats")
      .select("*")
      .order("updated_at", { ascending: false });
    if (data) setChats(data);
  };

  useEffect(() => {
    const fetchMessages = async () => {
      if (!currentChatId) {
        setAllMessages([]);
        return;
      }
      const { data } = await supabase
        .from("simulator_chat_messages")
        .select("*")
        .eq("chat_id", currentChatId)
        .order("created_at", { ascending: true });
      if (data) {
        setAllMessages(data.map(m => ({ ...m, role: m.role as any })));
      }
    };
    fetchMessages();
  }, [currentChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const callAiStream = async (
    provider: string,
    model: string,
    msgs: Message[],
    signal: AbortSignal,
    streamCallback: (content: string) => void,
  ) => {
    let url = "/api/ai/proxy";
    
    // Auto-delete tool schema
    const tools = [
      {
        type: "function",
        function: {
          name: "finish_simulator_chat",
          description: "Call this tool when your request has been fulfilled by the AI, or when the conversation has reached a natural conclusion.",
          parameters: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description: "The reason for ending the chat."
              }
            },
            required: ["reason"]
          }
        }
      }
    ];

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
        tools: tools
      }),
    };

    const response = await fetch(url, fetchOptions);
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
              ["openai", "openrouter", "grok", "custom", "horde", "cloudflare"].includes(provider) || provider.startsWith("local-")
            ) {
              delta = data.choices?.[0]?.delta?.content || data.response || "";
              const tc = data.choices?.[0]?.delta?.tool_calls?.[0];
              if (tc) {
                if (tc.function?.name)
                  delta += `<tool_call>\n{"name": "${tc.function.name}", "args": `;
                if (tc.function?.arguments) delta += tc.function.arguments;
              }
              if (data.choices?.[0]?.finish_reason === "tool_calls") {
                delta += `\n}</tool_call>`;
              }
            } else if (provider === "google") {
              delta =
                data.delta?.content ||
                data.message?.content?.text ||
                data.candidates?.[0]?.content?.parts?.[0]?.text ||
                "";
              const fc = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
              if (fc) {
                delta += `<tool_call>\n{"name": "${fc.name}", "args": ${JSON.stringify(fc.args)}}\n</tool_call>`;
              }
            }

            if (
              provider === "anthropic" &&
              data.type === "message_delta" &&
              data.delta?.stop_reason === "tool_use"
            ) {
              delta += `\n}</tool_call>`;
            }

            if (delta) {
              fullContent += delta;
              streamCallback(fullContent);
            }
          } catch (e: any) {
             // ignore parse errors
          }
        }
      }
    }
    return fullContent;
  };

  const handleStartNewChat = async () => {
    if (!session?.user?.id) return;
    
    // Pick random scenario
    const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

    const { data: chatData, error: chatError } = await supabase
      .from("simulator_chats")
      .insert({
        user_id: session.user.id,
        title: `Simulator: ${scenario.name}`
      })
      .select()
      .single();

    if (chatError) {
      toast.error(chatError.message);
      return;
    }

    setCurrentChatId(chatData.id);
    setChats(prev => [chatData, ...prev]);

    // Insert the initial "user" message (which is actually the AI persona starting the chat)
    const { data: msgData, error: msgError } = await supabase
      .from("simulator_chat_messages")
      .insert({
        chat_id: chatData.id,
        role: "assistant", // It's stored as 'assistant' in DB so the system renders it on the left
        content: scenario.prompt
      })
      .select()
      .single();

    if (msgError) {
      toast.error(msgError.message);
      return;
    }

    setAllMessages([msgData]);
  };

  const handleDeleteChat = async (chatId: string) => {
    const { error } = await supabase.from("simulator_chats").delete().eq("id", chatId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
      setAllMessages([]);
    }
    toast.success("Chat deleted automatically.");
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping || !currentChatId) return;

    const controller = new AbortController();
    setAbortController(controller);
    
    const userContent = input;
    setInput("");
    setIsTyping(true);

    const tempUserId = "temp-user";
    const tempStreamingId = "temp-streaming";

    setAllMessages(prev => [
      ...prev,
      { id: tempUserId, role: "user", content: userContent }, // Stored as user (rendered on right)
      { id: tempStreamingId, role: "assistant", content: "" }
    ]);

    try {
      const { data: userMsgData } = await supabase
        .from("simulator_chat_messages")
        .insert({ chat_id: currentChatId, role: "user", content: userContent })
        .select().single();

      if (userMsgData) {
        setAllMessages(prev => prev.map(m => m.id === tempUserId ? userMsgData : m));
      }

      // Prepare messages for AI
      // The LLM always generates 'assistant' messages. So the LLM (playing the Clueless User) must be the 'assistant'.
      // The real human (playing the AI) must be the 'user'.
      const systemMessage = `We are playing a roleplay game. 
You are "THE CLUELESS USER". 
I (the human typing to you) am "THE AI ASSISTANT".

Your job is to act like a typical, non-expert human user asking an AI for help.
CRITICAL RULES:
1. DO NOT act like an AI. DO NOT answer your own questions. DO NOT explain code.
2. When I (THE AI ASSISTANT) provide an answer or fix your code, you must act like a normal human receiving help (e.g. say "Oh that makes sense, thanks!" or "Wow, it works perfectly now!").
3. Once I have fulfilled your request, you MUST end the simulation by outputting EXACTLY this string: <tool_call>{"name": "finish_simulator_chat", "arguments": {}}</tool_call>
Do not break character. You are the human.`;
      
      const apiMessages = [
        { role: "system", content: systemMessage },
        ...allMessages.map(m => ({
          role: m.role, // 'assistant' is Clueless User, 'user' is Real Human
          content: m.content
        })),
        { role: "user", content: userContent } // the real human just replied, so AI sees it as 'user'
      ];

      const finalContent = await callAiStream(
        "horde",
        "Fast",
        apiMessages as any,
        controller.signal,
        (content) => {
          setAllMessages(prev => prev.map(m => m.id === tempStreamingId ? { ...m, content } : m));
        }
      );

      // Check if tool was called
      let toolCalled = false;
      if (finalContent.includes("finish_simulator_chat")) {
        toolCalled = true;
      }

      const { data: assistantMsgData } = await supabase
        .from("simulator_chat_messages")
        .insert({ chat_id: currentChatId, role: "assistant", content: finalContent })
        .select().single();

      if (assistantMsgData) {
        setAllMessages(prev => prev.map(m => m.id === tempStreamingId ? assistantMsgData : m));
      }

      if (toolCalled) {
        setTimeout(() => {
          handleDeleteChat(currentChatId);
        }, 2000);
      }

    } catch (e: any) {
      toast.error(e.message);
      setAllMessages(prev => prev.filter(m => m.id !== tempStreamingId));
    } finally {
      setIsTyping(false);
      setAbortController(null);
    }
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  return (
    <div className="w-full h-full flex relative overflow-hidden bg-[#0A0A0E] text-slate-200">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-800 flex flex-col bg-[#0A0A0E] shrink-0">
        <div className="p-4 border-b border-slate-800">
          <Button onClick={handleStartNewChat} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white flex gap-2">
            <Plus className="w-4 h-4" /> New Simulation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => setCurrentChatId(chat.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors",
                currentChatId === chat.id ? "bg-cyan-500/10 text-cyan-400" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              {chat.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0A0A0E]">
        {!currentChatId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <Bot className="w-16 h-16 text-slate-700 mb-4" />
            <h2 className="text-xl font-bold text-slate-300">Chatbot Simulator</h2>
            <p className="max-w-md text-center mt-2">You are the AI. Start a new simulation to get assigned a user request and try to solve it.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {messages.map(m => {
                const isHuman = m.role === "user";
                return (
                  <div key={m.id} className={cn("flex gap-4 w-full", isHuman ? "justify-end" : "justify-start")}>
                    {!isHuman && (
                      <div className="shrink-0 pt-1">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                           <Bot className="w-4 h-4 text-cyan-400" />
                        </div>
                      </div>
                    )}
                    <div className={cn("flex flex-col gap-1 max-w-[80%]", isHuman ? "items-end" : "items-start")}>
                      <span className="text-xs text-slate-500 font-mono">
                        {isHuman ? "You (The AI)" : "The User"}
                      </span>
                      <div className={cn(
                        "p-4 rounded-2xl text-[15px] leading-relaxed",
                        isHuman ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-100 rounded-tr-sm" : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm"
                      )}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({node, inline, className, children, ...props}: any) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={vscDarkPlus as any}
                                  language={match[1]}
                                  PreTag="div"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              )
                            }
                          }}
                        >
                          {m.content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "*(The user finished the simulation)*").replace(/\{"name":\s*"finish_simulator_chat"[\s\S]*?\}/g, "*(The user finished the simulation)*")}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-slate-800 bg-[#0A0A0E]">
              <div className="max-w-4xl mx-auto flex gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type your response as the AI..."
                  disabled={isTyping}
                  className="flex-1 bg-slate-900 border-slate-700 text-white"
                />
                {isTyping ? (
                  <Button onClick={handleStop} variant="destructive" size="icon">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </Button>
                ) : (
                  <Button onClick={handleSendMessage} disabled={!input.trim()} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                    <Send className="w-5 h-5" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
