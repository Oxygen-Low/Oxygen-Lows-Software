import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAiModels, type Model } from "@/hooks/useAiModels";
import { formatModelLabel, parseAiProxyError } from "@/utils/aiUtils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "sonner";
import {
  ChevronRight,
  Send,
  Square,
  FolderOpen,
  GitBranch,
  Terminal,
  FileSearch,
  FilePenLine,
  Eye,
  Play,
  Loader2,
  Home,
  History,
  Code,
  BrainCircuit,
  ChevronDown,
  Check,
  Search,
  FolderTree,
  Trash2,
  X,
  Plus,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  timestamp: number;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: string;
  status: "pending" | "running" | "done" | "error";
  startTime?: number;
  endTime?: number;
}

interface AgentSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  model: string;
  provider: string;
  workingDirectory: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ToolLogEntry {
  id: string;
  type: "read" | "edit" | "command" | "search" | "list" | "write";
  label: string;
  filename?: string;
  additions?: number;
  deletions?: number;
  command?: string;
  input?: string;
  output?: string;
  status: "running" | "done" | "error";
  timestamp: number;
}

// ─── Tool Definitions (sent to the model) ──────────────────────────────

const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description:
        "Read the contents of a file at the given path relative to the working directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "The relative path to the file to read, e.g. 'src/index.ts'",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description:
        "Create or overwrite a file with the given content. Creates parent directories if needed.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The relative path to the file to write",
          },
          content: {
            type: "string",
            description: "The full content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_file",
      description:
        "Edit a file by replacing a specific section. Use this instead of write_file when making small changes to existing files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The relative path to the file to edit",
          },
          old_content: {
            type: "string",
            description:
              "The exact text to find and replace (must match exactly including whitespace)",
          },
          new_content: {
            type: "string",
            description: "The replacement text",
          },
        },
        required: ["path", "old_content", "new_content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description:
        "Execute a shell command in the working directory. Returns stdout and stderr.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The command to run, e.g. 'npm install' or 'git status'",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description:
        "List all files and directories at the given path. Returns names with [DIR] prefix for directories.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "The relative path to the directory to list. Use '.' for root.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_files",
      description:
        "Search for text in files recursively. Returns matching file paths with line numbers and content snippets.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The text to search for",
          },
          path: {
            type: "string",
            description:
              "The relative directory path to search in. Use '.' for root.",
          },
        },
        required: ["query"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are an autonomous AI coding agent. You have access to tools to read files, write files, edit files, run commands, list directories, and search through codebases.

Your workflow:
1. Understand the user's request thoroughly
2. Explore the codebase to understand the structure and relevant files
3. Plan your changes
4. Implement the changes by reading, editing, and creating files
5. Verify your changes by running tests or build commands when appropriate
6. Keep going until the task is fully complete — do not stop early

Important guidelines:
- Always read files before editing them to understand the current state
- Use edit_file for small changes to existing files, write_file only for new files or complete rewrites
- Run relevant build/test commands after making changes to verify they work
- When making multiple related changes, complete all of them before stopping
- If you encounter an error, debug it and fix it — don't give up
- Explain your reasoning briefly as you work, but focus on getting the task done
- When you are finished, provide a clear summary of all changes made`;

// ─── Desktop Bridge ────────────────────────────────────────────────────

const pendingBridgeCalls = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();

let bridgeListenerInitialized = false;

function initBridgeListener() {
  if (bridgeListenerInitialized) return;
  bridgeListenerInitialized = true;

  const webview = (window as any).chrome?.webview;
  if (!webview) return;

  webview.addEventListener("message", (event: any) => {
    try {
      const data =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data.id && pendingBridgeCalls.has(data.id)) {
        const { resolve, reject } = pendingBridgeCalls.get(data.id)!;
        pendingBridgeCalls.delete(data.id);
        if (data.success) {
          resolve(data.data);
        } else {
          reject(new Error(data.error || "Bridge call failed"));
        }
      }
    } catch {
      // Ignore non-JSON messages
    }
  });
}

function callDesktopBridge(
  command: string,
  params: Record<string, any> = {},
): Promise<any> {
  return new Promise((resolve, reject) => {
    const webview = (window as any).chrome?.webview;
    if (!webview) {
      reject(new Error("Desktop bridge not available. Run in the desktop app."));
      return;
    }

    const id = crypto.randomUUID();
    pendingBridgeCalls.set(id, { resolve, reject });

    // Timeout after 60 seconds (commands can take a while)
    setTimeout(() => {
      if (pendingBridgeCalls.has(id)) {
        pendingBridgeCalls.delete(id);
        reject(new Error("Bridge call timed out"));
      }
    }, 60000);

    webview.postMessage(JSON.stringify({ command, id, ...params }));
  });
}

function isDesktopBridgeAvailable(): boolean {
  return !!(window as any).chrome?.webview;
}

// ─── Tool Executor ─────────────────────────────────────────────────────

async function executeToolCall(
  toolCall: ToolCall,
  workingDirectory: string | null,
): Promise<string> {
  if (!isDesktopBridgeAvailable()) {
    throw new Error(
      "Desktop bridge is not available. The LLM Agent requires the desktop app.",
    );
  }
  if (!workingDirectory && toolCall.name !== "select_directory") {
    throw new Error(
      "No working directory selected. Please select a project directory first.",
    );
  }

  switch (toolCall.name) {
    case "read_file":
      return await callDesktopBridge("read_file", {
        path: toolCall.arguments.path,
      });

    case "write_file":
      await callDesktopBridge("write_file", {
        path: toolCall.arguments.path,
        content: toolCall.arguments.content,
      });
      return `File written successfully: ${toolCall.arguments.path}`;

    case "edit_file": {
      const fileContent: string = await callDesktopBridge("read_file", {
        path: toolCall.arguments.path,
      });
      const oldContent = toolCall.arguments.old_content;
      const newContent = toolCall.arguments.new_content;
      if (!fileContent.includes(oldContent)) {
        throw new Error(
          `Could not find the specified content to replace in ${toolCall.arguments.path}. The old_content must match exactly.`,
        );
      }
      const updatedContent = fileContent.replace(oldContent, newContent);
      await callDesktopBridge("write_file", {
        path: toolCall.arguments.path,
        content: updatedContent,
      });
      const addLines = newContent.split("\n").length;
      const delLines = oldContent.split("\n").length;
      return `File edited: ${toolCall.arguments.path} (+${addLines} -${delLines} lines)`;
    }

    case "run_command": {
      const cmdResult = await callDesktopBridge("run_command", {
        command: toolCall.arguments.command,
      });
      // cmdResult is either a string or { stdout, stderr } object
      if (typeof cmdResult === "string") return cmdResult;
      let output = "";
      if (cmdResult.stdout) output += cmdResult.stdout;
      if (cmdResult.stderr) output += (output ? "\n" : "") + "STDERR:\n" + cmdResult.stderr;
      return output || "(no output)";
    }

    case "list_directory": {
      const entries = await callDesktopBridge("list_directory", {
        path: toolCall.arguments.path || ".",
      });
      // entries is either a string or array of { name, isDirectory }
      if (typeof entries === "string") return entries;
      if (Array.isArray(entries)) {
        return entries
          .map((e: any) => (e.isDirectory ? `[DIR] ${e.name}` : e.name))
          .join("\n");
      }
      return JSON.stringify(entries);
    }

    case "search_files": {
      const results = await callDesktopBridge("search_files", {
        query: toolCall.arguments.query,
        path: toolCall.arguments.path || ".",
      });
      // results is either a string or array of { file, line, content }
      if (typeof results === "string") return results;
      if (Array.isArray(results)) {
        if (results.length === 0) return "No matches found.";
        return results
          .map((r: any) => `${r.file}:${r.line}: ${r.content}`)
          .join("\n");
      }
      return JSON.stringify(results);
    }

    default:
      throw new Error(`Unknown tool: ${toolCall.name}`);
  }
}

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
    .replace(/(--.*|\/\/.*|&lt;!--.*?--&gt;|#.*)/g, `<span style="color:${cmt}">$1</span>`)
    .replace(
      /(".*?"|'.*?')/g,
      `<span style="color:${str}">$1</span>`,
    )
    .replace(
      /\b(function|return|if|else|for|while|class|public|private|void|int|string|bool|local|end|then|do|using|namespace|include|async|await|var|readonly|import|from|def|self|match|let|mut|break|const|super)\b/g,
      `<span style="color:${kw}">$1</span>`,
    )
    .replace(
      /\b([A-Z][a-zA-Z0-9_]*|float)\b/g,
      `<span style="color:${tp}">$1</span>`,
    )
    .replace(
      /\b([a-zA-Z_]\w*)(?=\()/g,
      `<span style="color:${fn_}">$1</span>`,
    );

  return s;
}

// ─── Animated Background Component ────────────────────────────────────

function AnimatedBackground() {
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

      for (const dot of dotsRef.current) {
        const dx = mouseRef.current.x - dot.x;
        const dy = mouseRef.current.y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < repelRadius) {
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

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
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
        const typeInterval = setInterval(() => {
          const current = text.substring(0, charIndex);
          const cursor =
            charIndex < text.length
              ? '<span class="agent-cursor">_</span>'
              : "";
          div.innerHTML = highlightCode(current) + cursor;
          charIndex++;
          if (charIndex > text.length) clearInterval(typeInterval);
        }, 10 + Math.random() * 20);

        col.appendChild(div);
        intervals.push(typeInterval);
      }

      addSnippet();
      const colInterval = setInterval(() => {
        if (col.children.length > 3 && col.firstChild) {
          col.removeChild(col.firstChild);
        }
        addSnippet();
      }, 6000 + Math.random() * 4000);
      intervals.push(colInterval);
    }

    return () => {
      intervals.forEach(clearInterval);
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 w-full h-full bg-[#0a0a0c] overflow-hidden">
      <div
        ref={parallaxRef}
        className="absolute inset-[-40px] w-[calc(100%+80px)] h-[calc(100%+80px)] transition-transform duration-100 ease-out"
      >
        <div
          ref={codeContainerRef}
          className="absolute inset-0 z-0"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 w-full h-full pointer-events-none"
        />
      </div>
    </div>
  );
}

// ─── Model Selector Dropdown ───────────────────────────────────────────

function ModelSelector({
  models,
  selectedModel,
  selectedProvider,
  onSelect,
  compact = false,
}: {
  models: Model[];
  selectedModel: string;
  selectedProvider: string;
  onSelect: (model: string, provider: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label = formatModelLabel(selectedProvider, selectedModel);

  // Group models by provider
  const hordeModels = models.filter((m) => m.provider === "horde");
  const cloudflareModels = models.filter((m) => m.provider === "cloudflare");
  const otherModels = models.filter(
    (m) => m.provider !== "horde" && m.provider !== "cloudflare",
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-full border border-slate-700 transition-colors text-sm font-medium hover:bg-slate-800 ${
          compact
            ? "px-3 py-1.5 bg-slate-900/50 text-slate-300"
            : "px-3 py-2 bg-slate-900/50 text-slate-300"
        }`}
      >
        <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
        <span className="max-w-[160px] truncate text-xs">{label}</span>
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>

      {open && (
        <div
          className={`absolute ${compact ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden`}
        >
          <ScrollArea className="max-h-[320px]">
            <div className="p-1">
              {hordeModels.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    Free Models
                  </div>
                  {hordeModels.map((m) => (
                    <button
                      key={`${m.provider}-${m.model_id}`}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                        m.model_id === selectedModel &&
                        m.provider === selectedProvider
                          ? "bg-cyan-500/10 text-cyan-400"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        onSelect(m.model_id, m.provider);
                        setOpen(false);
                      }}
                    >
                      <span>{formatModelLabel(m.provider, m.model_id)}</span>
                      {m.model_id === selectedModel &&
                        m.provider === selectedProvider && (
                          <Check className="w-3 h-3" />
                        )}
                    </button>
                  ))}
                </>
              )}
              {cloudflareModels.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1">
                    Cloudflare Workers AI
                  </div>
                  {cloudflareModels.map((m) => (
                    <button
                      key={`${m.provider}-${m.model_id}`}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                        m.model_id === selectedModel &&
                        m.provider === selectedProvider
                          ? "bg-cyan-500/10 text-cyan-400"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        onSelect(m.model_id, m.provider);
                        setOpen(false);
                      }}
                    >
                      <span>{formatModelLabel(m.provider, m.model_id)}</span>
                      {m.model_id === selectedModel &&
                        m.provider === selectedProvider && (
                          <Check className="w-3 h-3" />
                        )}
                    </button>
                  ))}
                </>
              )}
              {otherModels.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1">
                    Custom Models
                  </div>
                  {otherModels.map((m) => (
                    <button
                      key={`${m.provider}-${m.model_id}`}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                        m.model_id === selectedModel &&
                        m.provider === selectedProvider
                          ? "bg-cyan-500/10 text-cyan-400"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                      onClick={() => {
                        onSelect(m.model_id, m.provider);
                        setOpen(false);
                      }}
                    >
                      <span>{formatModelLabel(m.provider, m.model_id)}</span>
                      {m.model_id === selectedModel &&
                        m.provider === selectedProvider && (
                          <Check className="w-3 h-3" />
                        )}
                    </button>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ─── Tool Call Log Entry ───────────────────────────────────────────────

function ToolLogItem({ entry }: { entry: ToolLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isExpandable = entry.type === "command" || entry.output;

  const icon = {
    read: <Eye className="w-3.5 h-3.5" />,
    edit: <FilePenLine className="w-3.5 h-3.5 text-cyan-400/60" />,
    write: <FilePenLine className="w-3.5 h-3.5 text-green-400/60" />,
    command: <Terminal className="w-3.5 h-3.5" />,
    search: <Search className="w-3.5 h-3.5" />,
    list: <FolderTree className="w-3.5 h-3.5" />,
  }[entry.type];

  const actionLabel = {
    read: "Read",
    edit: "Edited",
    write: "Created",
    command: "Ran",
    search: "Searched",
    list: "Listed",
  }[entry.type];

  return (
    <div className="group/log">
      <button
        className={`flex items-center justify-between py-1 w-full text-left transition-colors ${isExpandable ? "cursor-pointer hover:text-white" : "cursor-default"}`}
        onClick={() => isExpandable && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-500 group-hover/log:text-cyan-400 transition-colors">
            {entry.status === "running" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              icon
            )}
          </span>
          <span className="text-xs font-mono text-slate-400 group-hover/log:text-slate-200 transition-colors">
            {actionLabel}{" "}
            <span className="text-slate-200 font-semibold">
              {entry.filename || entry.label}
            </span>
            {entry.additions !== undefined && (
              <span className="text-slate-500 ml-2">
                <span className="text-green-400">+{entry.additions}</span>{" "}
                <span className="text-red-400">-{entry.deletions || 0}</span>
              </span>
            )}
          </span>
        </div>
        {isExpandable && (
          <ChevronRight
            className={`w-3 h-3 text-slate-600 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
      </button>

      {expanded && (
        <div className="pl-7 py-3 space-y-4 border-l border-slate-800 ml-1.5 mt-1">
          {entry.input && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-1.5">
                Input
              </div>
              <div className="text-[10px] font-mono text-slate-500 bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {entry.input}
              </div>
            </div>
          )}
          {entry.output && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-1.5">
                Output
              </div>
              <div className="text-[10px] font-mono text-cyan-400/60 bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {entry.output.length > 2000
                  ? entry.output.substring(0, 2000) + "\n... (truncated)"
                  : entry.output}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Markdown Renderer ─────────────────────────────────────────────────

function AgentMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed text-slate-300"
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const inline = !match;
          if (inline) {
            return (
              <code
                className="bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300 text-xs font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              customStyle={{
                margin: "0.5rem 0",
                borderRadius: "0.5rem",
                fontSize: "12px",
                lineHeight: "1.5",
                border: "1px solid rgba(51,65,85,0.5)",
              }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          );
        },
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-200">{children}</strong>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Main LLM Agent Component ──────────────────────────────────────────

export function LLMAgentApp() {
  // Auth
  const [session, setSession] = useState<any>(null);

  // Models
  const {
    models,
    selectedModel,
    selectedProvider,
    setSelection,
    isLoading: modelsLoading,
  } = useAiModels("Fast", "horde");

  // Agent state
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [toolLog, setToolLog] = useState<ToolLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [input, setInput] = useState("");
  const [reasoningTime, setReasoningTime] = useState(0);
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reasoningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const desktopAvailable = useMemo(() => isDesktopBridgeAvailable(), []);

  // Initialize bridge listener
  useEffect(() => {
    initBridgeListener();
  }, []);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Load sessions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("agent_sessions");
      if (stored) {
        const parsed: AgentSession[] = JSON.parse(stored);
        setSessions(parsed.sort((a, b) => b.updatedAt - a.updatedAt));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save sessions to localStorage
  const saveSessions = useCallback(
    (updated: AgentSession[]) => {
      setSessions(updated);
      try {
        // Keep only last 50 sessions
        const toStore = updated
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 50);
        localStorage.setItem("agent_sessions", JSON.stringify(toStore));
      } catch {
        // ignore quota errors
      }
    },
    [],
  );

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, toolLog, streamingContent]);

  // Current session
  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) || null,
    [sessions, currentSessionId],
  );

  // ─── Directory Selection ─────────────────────────────────────────────

  const handleSelectDirectory = useCallback(async () => {
    if (!desktopAvailable) {
      toast.error("Directory selection requires the desktop app.");
      return;
    }
    try {
      const dir = await callDesktopBridge("select_directory");
      if (dir) {
        setWorkingDirectory(dir);
        toast.success(`Working directory: ${dir}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [desktopAvailable]);

  // ─── Streaming AI Call with Tool Support ─────────────────────────────

  const callAiWithTools = useCallback(
    async (
      msgs: AgentMessage[],
      signal: AbortSignal,
    ): Promise<{
      content: string;
      reasoning: string;
      toolCalls: ToolCall[];
      finishReason: string;
    }> => {
      const apiMessages = msgs
        .filter((m) => m.role !== "system" || msgs.indexOf(m) === 0)
        .map((m) => {
          if (m.role === "tool") {
            return {
              role: "tool" as const,
              content: m.content,
              tool_call_id: m.toolCallId,
            };
          }
          return {
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            ...(m.toolCalls && m.toolCalls.length > 0
              ? {
                  tool_calls: m.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function",
                    function: {
                      name: tc.name,
                      arguments: JSON.stringify(tc.arguments),
                    },
                  })),
                }
              : {}),
          };
        });

      // Determine if the provider supports native tool calling
      const supportsNativeTools = [
        "openai",
        "anthropic",
        "google",
        "openrouter",
        "grok",
      ].includes(selectedProvider);

      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        signal,
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          messages: apiMessages,
          stream: true,
          ...(supportsNativeTools ? { tools: AGENT_TOOLS } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseAiProxyError(response));
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let fullReasoning = "";
      let streamBuffer = "";
      let finishReason = "stop";

      // Tool call accumulation
      const accumulatedToolCalls: Record<
        number,
        { id: string; name: string; arguments: string }
      > = {};

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim() || !line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") break;

            try {
              const data = JSON.parse(dataStr);
              if (data.error) throw new Error(data.error);

              if (selectedProvider === "anthropic") {
                const delta = data.delta?.text || "";
                if (delta) fullContent += delta;

                if (
                  data.type === "content_block_start" &&
                  data.content_block?.type === "tool_use"
                ) {
                  const idx = data.index ?? Object.keys(accumulatedToolCalls).length;
                  accumulatedToolCalls[idx] = {
                    id: data.content_block.id || `call_${idx}`,
                    name: data.content_block.name,
                    arguments: "",
                  };
                } else if (
                  data.type === "content_block_delta" &&
                  data.delta?.type === "input_json_delta"
                ) {
                  const idx = data.index ?? Object.keys(accumulatedToolCalls).length - 1;
                  if (accumulatedToolCalls[idx]) {
                    accumulatedToolCalls[idx].arguments +=
                      data.delta.partial_json || "";
                  }
                }

                if (
                  data.type === "message_delta" &&
                  data.delta?.stop_reason === "tool_use"
                ) {
                  finishReason = "tool_calls";
                }
                if (
                  data.type === "message_delta" &&
                  data.delta?.stop_reason === "end_turn"
                ) {
                  finishReason = "stop";
                }
              } else if (selectedProvider === "google") {
                const delta =
                  data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (delta) fullContent += delta;

                const fc =
                  data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
                if (fc) {
                  const idx = Object.keys(accumulatedToolCalls).length;
                  accumulatedToolCalls[idx] = {
                    id: `call_${idx}`,
                    name: fc.name,
                    arguments: JSON.stringify(fc.args || {}),
                  };
                  finishReason = "tool_calls";
                }
              } else {
                // OpenAI-compatible providers
                const delta =
                  data.choices?.[0]?.delta?.content || data.response || "";
                if (delta) fullContent += delta;

                const reasoning = data.choices?.[0]?.delta?.reasoning || "";
                if (reasoning) fullReasoning += reasoning;

                const tc = data.choices?.[0]?.delta?.tool_calls;
                if (tc) {
                  for (const call of tc) {
                    const idx = call.index ?? 0;
                    if (!accumulatedToolCalls[idx]) {
                      accumulatedToolCalls[idx] = {
                        id: call.id || `call_${idx}`,
                        name: call.function?.name || "",
                        arguments: "",
                      };
                    }
                    if (call.function?.name && !accumulatedToolCalls[idx].name) {
                      accumulatedToolCalls[idx].name = call.function.name;
                    }
                    if (call.id && !accumulatedToolCalls[idx].id.startsWith("call")) {
                      accumulatedToolCalls[idx].id = call.id;
                    }
                    if (call.function?.arguments) {
                      accumulatedToolCalls[idx].arguments +=
                        call.function.arguments;
                    }
                  }
                }

                const fr = data.choices?.[0]?.finish_reason;
                if (fr === "tool_calls") finishReason = "tool_calls";
                else if (fr === "stop") finishReason = "stop";
              }

              // Update streaming UI
              setStreamingContent(fullContent);
              if (fullReasoning) setCurrentReasoning(fullReasoning);
            } catch (e: any) {
              if (
                e.message &&
                !e.message.includes("JSON") &&
                e.message !== "Unexpected end of JSON input"
              ) {
                console.error("Stream parse error:", e);
              }
            }
          }
        }
      }

      // If the provider doesn't support native tools, try parsing tool calls from content
      if (!supportsNativeTools && fullContent.includes("<tool_call>")) {
        const toolCallRegex =
          /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
        let match;
        while ((match = toolCallRegex.exec(fullContent)) !== null) {
          try {
            const parsed = JSON.parse(match[1]);
            const idx = Object.keys(accumulatedToolCalls).length;
            accumulatedToolCalls[idx] = {
              id: `call_${idx}`,
              name: parsed.name,
              arguments: JSON.stringify(parsed.args || parsed.arguments || {}),
            };
            finishReason = "tool_calls";
          } catch {
            // ignore
          }
        }
        // Strip tool_call tags from content
        fullContent = fullContent.replace(
          /<tool_call>[\s\S]*?<\/tool_call>/g,
          "",
        ).trim();
      }

      // Parse accumulated tool calls
      const toolCalls: ToolCall[] = Object.values(accumulatedToolCalls).map(
        (tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: (() => {
            try {
              return JSON.parse(tc.arguments);
            } catch {
              return { raw: tc.arguments };
            }
          })(),
          status: "pending" as const,
        }),
      );

      return { content: fullContent, reasoning: fullReasoning, toolCalls, finishReason };
    },
    [selectedModel, selectedProvider, session?.access_token],
  );

  // ─── Create Tool Log Entry ───────────────────────────────────────────

  const createToolLogEntry = useCallback(
    (toolCall: ToolCall): ToolLogEntry => {
      const entry: ToolLogEntry = {
        id: toolCall.id,
        type: "read",
        label: toolCall.name,
        status: "running",
        timestamp: Date.now(),
      };

      switch (toolCall.name) {
        case "read_file":
          entry.type = "read";
          entry.filename = toolCall.arguments.path;
          break;
        case "write_file":
          entry.type = "write";
          entry.filename = toolCall.arguments.path;
          entry.additions = toolCall.arguments.content?.split("\n").length || 0;
          entry.deletions = 0;
          break;
        case "edit_file":
          entry.type = "edit";
          entry.filename = toolCall.arguments.path;
          entry.additions = toolCall.arguments.new_content?.split("\n").length || 0;
          entry.deletions = toolCall.arguments.old_content?.split("\n").length || 0;
          break;
        case "run_command":
          entry.type = "command";
          entry.label = toolCall.arguments.command;
          entry.filename = toolCall.arguments.command?.split(" ")[0];
          entry.input = `$ ${toolCall.arguments.command}`;
          break;
        case "list_directory":
          entry.type = "list";
          entry.filename = toolCall.arguments.path || ".";
          break;
        case "search_files":
          entry.type = "search";
          entry.label = `"${toolCall.arguments.query}"`;
          entry.filename = toolCall.arguments.query;
          break;
      }

      return entry;
    },
    [],
  );

  // ─── Main Agentic Loop ───────────────────────────────────────────────

  const runAgentLoop = useCallback(
    async (initialMessages: AgentMessage[]) => {
      if (!session?.access_token) {
        toast.error("Please sign in first.");
        return;
      }

      setIsRunning(true);
      const abort = new AbortController();
      abortRef.current = abort;

      let currentMessages = [...initialMessages];
      let iterationCount = 0;
      const MAX_ITERATIONS = 30;

      // Start reasoning timer
      const startTime = Date.now();
      setReasoningTime(0);
      reasoningTimerRef.current = setInterval(() => {
        setReasoningTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      try {
        while (iterationCount < MAX_ITERATIONS && !abort.signal.aborted) {
          iterationCount++;
          setStreamingContent("");
          setCurrentReasoning("");

          const result = await callAiWithTools(currentMessages, abort.signal);

          // Build assistant message
          const assistantMessage: AgentMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.content,
            reasoning: result.reasoning || undefined,
            toolCalls:
              result.toolCalls.length > 0 ? result.toolCalls : undefined,
            timestamp: Date.now(),
          };

          currentMessages = [...currentMessages, assistantMessage];
          setMessages([...currentMessages]);
          setStreamingContent("");

          // If no tool calls, we're done
          if (
            result.finishReason !== "tool_calls" ||
            result.toolCalls.length === 0
          ) {
            break;
          }

          // Execute tool calls
          for (const toolCall of result.toolCalls) {
            if (abort.signal.aborted) break;

            // Add to tool log
            const logEntry = createToolLogEntry(toolCall);
            setToolLog((prev) => [...prev, logEntry]);

            try {
              const toolResult = await executeToolCall(
                toolCall,
                workingDirectory,
              );

              // Update log entry
              setToolLog((prev) =>
                prev.map((e) =>
                  e.id === logEntry.id
                    ? { ...e, status: "done" as const, output: toolResult }
                    : e,
                ),
              );

              // Update tool call status
              toolCall.status = "done";
              toolCall.result = toolResult;

              // Add tool result message
              const toolMessage: AgentMessage = {
                id: crypto.randomUUID(),
                role: "tool",
                content: toolResult,
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                timestamp: Date.now(),
              };
              currentMessages = [...currentMessages, toolMessage];
            } catch (e: any) {
              setToolLog((prev) =>
                prev.map((entry) =>
                  entry.id === logEntry.id
                    ? {
                        ...entry,
                        status: "error" as const,
                        output: `Error: ${e.message}`,
                      }
                    : entry,
                ),
              );

              toolCall.status = "error";
              toolCall.result = `Error: ${e.message}`;

              const toolErrorMessage: AgentMessage = {
                id: crypto.randomUUID(),
                role: "tool",
                content: `Error executing ${toolCall.name}: ${e.message}`,
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                timestamp: Date.now(),
              };
              currentMessages = [...currentMessages, toolErrorMessage];
            }
          }

          setMessages([...currentMessages]);
        }

        if (iterationCount >= MAX_ITERATIONS) {
          toast.info("Agent reached maximum iteration limit.");
        }
      } catch (e: any) {
        if (e.name === "AbortError") {
          toast.info("Agent stopped.");
        } else {
          toast.error(e.message || "Agent encountered an error.");
          console.error("Agent loop error:", e);
        }
      } finally {
        setIsRunning(false);
        abortRef.current = null;
        if (reasoningTimerRef.current) {
          clearInterval(reasoningTimerRef.current);
          reasoningTimerRef.current = null;
        }

        // Save session
        const sessionId = currentSessionId || crypto.randomUUID();
        const title =
          currentMessages.find((m) => m.role === "user")?.content.slice(0, 80) ||
          "Agent Session";
        const updatedSession: AgentSession = {
          id: sessionId,
          title,
          messages: currentMessages,
          model: selectedModel,
          provider: selectedProvider,
          workingDirectory,
          createdAt: currentSession?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };

        if (!currentSessionId) setCurrentSessionId(sessionId);

        saveSessions(
          [
            updatedSession,
            ...sessions.filter((s) => s.id !== sessionId),
          ].slice(0, 50),
        );
      }
    },
    [
      session?.access_token,
      callAiWithTools,
      createToolLogEntry,
      workingDirectory,
      currentSessionId,
      currentSession,
      selectedModel,
      selectedProvider,
      sessions,
      saveSessions,
    ],
  );

  // ─── Send Message ────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    if (!input.trim() || isRunning) return;

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    const systemMessage: AgentMessage = {
      id: "system-prompt",
      role: "system",
      content: SYSTEM_PROMPT + (workingDirectory
        ? `\n\nYou are working in directory: ${workingDirectory}`
        : "\n\nNo working directory has been selected yet. You can still help with planning and discussion."),
      timestamp: Date.now(),
    };

    const newMessages =
      messages.length === 0
        ? [systemMessage, userMessage]
        : [...messages, userMessage];

    setMessages(newMessages);
    setInput("");
    setShowWorkspace(true);
    setToolLog([]);

    runAgentLoop(newMessages);
  }, [input, isRunning, messages, workingDirectory, runAgentLoop]);

  // ─── Stop Agent ──────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ─── New Session ─────────────────────────────────────────────────────

  const handleNewSession = useCallback(() => {
    if (isRunning) handleStop();
    setCurrentSessionId(null);
    setMessages([]);
    setToolLog([]);
    setStreamingContent("");
    setCurrentReasoning("");
    setShowWorkspace(false);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [isRunning, handleStop]);

  // ─── Load Session ────────────────────────────────────────────────────

  const handleLoadSession = useCallback(
    (sessionId: string) => {
      const sess = sessions.find((s) => s.id === sessionId);
      if (!sess) return;
      setCurrentSessionId(sess.id);
      setMessages(sess.messages);
      setToolLog([]);
      setWorkingDirectory(sess.workingDirectory);
      setShowWorkspace(true);
    },
    [sessions],
  );

  // ─── Delete Session ──────────────────────────────────────────────────

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      saveSessions(sessions.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) handleNewSession();
    },
    [sessions, currentSessionId, saveSessions, handleNewSession],
  );

  // ─── Key Handlers ───────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ─── Formatted time ─────────────────────────────────────────────────

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  // ─── Visible messages (skip system) ──────────────────────────────────

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role !== "system" && m.role !== "tool"),
    [messages],
  );

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950">
      {/* ─── Animated Background (shown on home state) ─── */}
      {!showWorkspace && <AnimatedBackground />}

      {/* ─── Home State ─── */}
      {!showWorkspace && (
        <main className="flex-1 flex flex-col px-4 py-8 relative overflow-hidden w-full h-full max-w-7xl mx-auto z-10 justify-center">
          <div className="w-full flex flex-col items-center space-y-6 z-10 shrink-0 transition-opacity duration-500">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white text-center tracking-tight leading-tight drop-shadow-lg">
              What do you want to code today?
            </h1>

            {/* Input Area */}
            <div className="w-full max-w-4xl relative group">
              <div className="absolute -inset-1 bg-slate-700/30 rounded-[2rem] blur opacity-50 group-hover:opacity-75 transition duration-500" />
              <div className="relative flex w-full items-center bg-slate-900/60 backdrop-blur-md rounded-[1.5rem] border border-slate-700 p-2 shadow-2xl transition-all focus-within:border-cyan-500/50 focus-within:bg-slate-900/80">
                <input
                  ref={inputRef}
                  className="w-full bg-transparent border-none text-white placeholder:text-slate-500 text-base md:text-lg focus:ring-0 focus:outline-none px-2 py-3 pl-4"
                  placeholder="Describe a feature, bug, or refactor..."
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />

                <div className="pr-2 flex items-center border-r border-slate-700/30 mr-2 gap-2">
                  {/* Directory Selector */}
                  <button
                    onClick={handleSelectDirectory}
                    className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 transition-colors text-xs font-medium text-slate-400 hover:text-white"
                    title={workingDirectory || "Select working directory"}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="max-w-[120px] truncate">
                      {workingDirectory
                        ? workingDirectory.split(/[\\/]/).pop()
                        : "Select folder"}
                    </span>
                  </button>

                  {/* Model Selector */}
                  <ModelSelector
                    models={models}
                    selectedModel={selectedModel}
                    selectedProvider={selectedProvider}
                    onSelect={setSelection}
                  />
                </div>

                <div className="pr-2 pl-2">
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isRunning}
                    className="bg-white hover:bg-slate-200 text-black rounded-xl px-4 py-2 font-medium transition-colors flex items-center gap-2 lg:px-6 lg:py-3"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Desktop Warning */}
            {!desktopAvailable && (
              <p className="text-xs text-amber-400/80 text-center max-w-md">
                ⚠ Running in browser mode — file operations and command execution require the desktop app.
                The agent can still plan and discuss code.
              </p>
            )}

            {/* Recent Sessions */}
            {sessions.length > 0 && (
              <div className="w-full max-w-4xl mt-4">
                <h3 className="text-xs uppercase tracking-wider text-slate-600 font-bold mb-3">
                  Recent Sessions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sessions.slice(0, 6).map((sess) => (
                    <button
                      key={sess.id}
                      onClick={() => handleLoadSession(sess.id)}
                      className="text-left p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all group"
                    >
                      <p className="text-sm text-slate-300 font-medium line-clamp-2 mb-1 group-hover:text-white transition-colors">
                        {sess.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span>{formatTime(sess.updatedAt)}</span>
                        <span>·</span>
                        <span className="truncate">
                          {formatModelLabel(sess.provider, sess.model)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ─── Workspace State ─── */}
      {showWorkspace && (
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {/* Chat Area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center pb-40"
          >
            <div className="w-full max-w-4xl mx-auto space-y-6 pt-4">
              {visibleMessages.map((msg, idx) => (
                <div key={msg.id}>
                  {/* User Message */}
                  {msg.role === "user" && (
                    <div className="flex justify-end mb-4">
                      <div className="text-sm text-slate-300 leading-relaxed max-w-2xl bg-slate-900/80 p-4 rounded-xl border border-slate-800/50">
                        {msg.content}
                      </div>
                    </div>
                  )}

                  {/* Assistant Message */}
                  {msg.role === "assistant" && (
                    <div className="space-y-2">
                      {/* Reasoning */}
                      {msg.reasoning && (
                        <details className="group/reasoning cursor-pointer">
                          <summary className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">
                            <ChevronRight className="w-3 h-3 transition-transform group-open/reasoning:rotate-90" />
                            <BrainCircuit className="w-3 h-3" />
                            Reasoning
                          </summary>
                          <div className="space-y-2 pl-6 border-l border-slate-800 ml-1.5">
                            <p className="text-xs text-slate-500 whitespace-pre-wrap">
                              {msg.reasoning}
                            </p>
                          </div>
                        </details>
                      )}

                      {/* Tool Calls Log */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="space-y-0.5 pl-4 border-l border-slate-800/30 ml-1.5">
                          {msg.toolCalls.map((tc) => {
                            const logEntry = toolLog.find((e) => e.id === tc.id);
                            if (logEntry) {
                              return (
                                <ToolLogItem key={tc.id} entry={logEntry} />
                              );
                            }
                            // Fallback for loaded sessions without log
                            return (
                              <ToolLogItem
                                key={tc.id}
                                entry={createToolLogEntry(tc)}
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* Content */}
                      {msg.content && (
                        <div className="mt-3">
                          <AgentMarkdown content={msg.content} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming State */}
              {isRunning && (
                <div className="space-y-2">
                  {/* Live Reasoning Timer */}
                  {reasoningTime > 0 && (
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">
                      <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                      <BrainCircuit className="w-3 h-3" />
                      {streamingContent || currentReasoning
                        ? `Thinking for ${reasoningTime}s`
                        : `Working for ${reasoningTime}s`}
                    </div>
                  )}

                  {/* Live reasoning content */}
                  {currentReasoning && !streamingContent && (
                    <div className="pl-6 border-l border-slate-800 ml-1.5">
                      <p className="text-xs text-slate-500 whitespace-pre-wrap">
                        {currentReasoning}
                      </p>
                    </div>
                  )}

                  {/* Live tool log entries (current iteration) */}
                  {toolLog.filter((e) => e.status === "running").length > 0 && (
                    <div className="space-y-0.5 pl-4 border-l border-slate-800/30 ml-1.5">
                      {toolLog
                        .filter((e) => e.status === "running")
                        .map((entry) => (
                          <ToolLogItem key={entry.id} entry={entry} />
                        ))}
                    </div>
                  )}

                  {/* Streaming content */}
                  {streamingContent && (
                    <div className="mt-3">
                      <AgentMarkdown content={streamingContent} />
                      <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse rounded-sm ml-0.5" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Floating Input Area at Bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent flex justify-center pb-6 pt-16">
            <div className="w-full max-w-4xl relative group">
              <div className="absolute -inset-1 bg-slate-700/20 rounded-[2rem] blur opacity-50 group-hover:opacity-75 transition duration-500" />
              <div className="relative flex w-full items-center bg-slate-900/80 backdrop-blur-md rounded-[1.5rem] border border-slate-700/50 p-2 shadow-2xl transition-all focus-within:border-cyan-500/50">
                <div className="pl-2 flex items-center border-r border-slate-700/30 mr-2 gap-2">
                  {/* Directory indicator */}
                  {workingDirectory && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-800/50 text-[10px] text-slate-500">
                      <FolderOpen className="w-3 h-3" />
                      <span className="max-w-[80px] truncate">
                        {workingDirectory.split(/[\\/]/).pop()}
                      </span>
                    </div>
                  )}
                  <ModelSelector
                    models={models}
                    selectedModel={selectedModel}
                    selectedProvider={selectedProvider}
                    onSelect={setSelection}
                    compact
                  />
                </div>
                <input
                  className="w-full bg-transparent border-none text-white placeholder:text-slate-500 text-base md:text-lg focus:ring-0 focus:outline-none px-2 py-3"
                  placeholder="Ask a follow up..."
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isRunning}
                />
                <div className="pr-2 pl-2">
                  {isRunning ? (
                    <Button
                      onClick={handleStop}
                      className="bg-red-500/80 hover:bg-red-500 text-white rounded-xl px-4 py-2 font-medium transition-colors flex items-center gap-2"
                    >
                      <Square className="w-3 h-3" />
                      <span className="text-sm">Stop</span>
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="bg-white hover:bg-slate-200 text-black rounded-xl px-4 py-2 font-medium transition-colors flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Right Sidebar (hover-triggered) ─── */}
      <div
        className="fixed top-0 right-0 h-full w-4 hover:w-[320px] z-50 group/sidebar"
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <aside
          className={`w-[320px] h-full absolute top-0 right-0 flex flex-col border-l border-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out bg-slate-950/95 backdrop-blur-xl ${
            sidebarHovered ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800/50">
            <button
              onClick={handleNewSession}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors font-medium text-sm"
            >
              <Home className="w-4 h-4" />
              Home
            </button>
            <button
              onClick={handleNewSession}
              className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors text-sm"
              title="New session"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-8">
            {/* Working Directory */}
            {workingDirectory && (
              <div>
                <h2 className="text-xs font-bold text-slate-500 tracking-wider uppercase mb-3 flex items-center gap-2">
                  <FolderOpen className="w-3.5 h-3.5" />
                  Working Directory
                </h2>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
                      <Code className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-slate-300 truncate">
                        {workingDirectory.split(/[\\/]/).pop()}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono truncate">
                        {workingDirectory}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Session History */}
            <div>
              <h2 className="text-xs font-bold text-slate-500 tracking-wider uppercase mb-3 flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                History
              </h2>
              {sessions.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-4">
                  No sessions yet
                </p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className={`group/item relative cursor-pointer p-3 rounded-xl border transition-colors ${
                        sess.id === currentSessionId
                          ? "bg-cyan-500/5 border-cyan-500/20"
                          : "bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/60 hover:border-slate-700/50"
                      }`}
                    >
                      <button
                        onClick={() => handleLoadSession(sess.id)}
                        className="w-full text-left"
                      >
                        <p className="text-sm text-slate-300 font-medium line-clamp-2 mb-1 pr-6">
                          {sess.title}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-600 font-mono">
                          <span>{formatTime(sess.updatedAt)}</span>
                          <span>·</span>
                          <span className="truncate">
                            {formatModelLabel(sess.provider, sess.model)}
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(sess.id);
                        }}
                        className="absolute top-3 right-3 text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover/item:opacity-100"
                        title="Delete session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
