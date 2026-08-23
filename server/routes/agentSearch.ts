import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const agentSearchRouter = new Hono();

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.*)$/i);
  return match ? match[1].trim() : null;
}

function stripHtmlTags(input: unknown): string {
  if (typeof input !== "string") return "";
  let prev = "";
  let sanitized = input;
  do {
    prev = sanitized;
    sanitized = sanitized.replace(/<[^<>]*>/g, "");
  } while (sanitized !== prev);
  return sanitized.trim();
}

function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;

    const host = url.hostname;
    if (host === "localhost" || host === "metadata.google.internal") return false;

    const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const parts = ipMatch.slice(1).map(Number);
      if (parts[0] === 127) return false;
      if (parts[0] === 10) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      if (parts[0] === 169 && parts[1] === 254 && parts[2] === 169 && parts[3] === 254) return false;
    }

    if (host === "[::1]" || host === "::1") return false;

    return true;
  } catch {
    return false;
  }
}

const SEARCH_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for information. Returns text snippets and URLs from search results.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_page",
      description: "Fetch and read the text content of a web page URL. Returns the page text (truncated to 8KB).",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The HTTPS URL of the page to fetch",
          },
        },
        required: ["url"],
      },
    },
  },
];

async function performWebSearch(query: string) {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error("Search request failed");

    const html = await res.text();
    const snippets: string[] = [];
    const urls: string[] = [];

    const snippetRegex = /class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 8) {
      snippets.push(stripHtmlTags(match[1]));
    }

    const urlRegex = /class="result__url"[^>]*>([\s\S]*?)<\/a>/g;
    while ((match = urlRegex.exec(html)) !== null && urls.length < 8) {
      urls.push(stripHtmlTags(match[1]).trim());
    }

    return { snippets, urls };
  } catch (err) {
    return { error: "Failed to perform web search" };
  }
}

async function fetchPageContent(url: string) {
  if (!isSafeUrl(url)) return { error: "Invalid or blocked URL" };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const cleanText = stripHtmlTags(text);
    return cleanText.substring(0, 8192);
  } catch (err) {
    return { error: "Failed to fetch page content" };
  }
}

function sseEvent(data: string): string {
  return `data: ${data}\n\n`;
}

function sseJson(obj: any): string {
  return sseEvent(JSON.stringify(obj));
}

agentSearchRouter.post("/", rateLimiter(10, 60_000, "agent-search"), async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const token = extractBearerToken(authHeader);
    if (!token) return c.json({ error: "Missing or invalid authorization token" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return c.json({ error: "Unauthorized" }, 401);

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { query, responseFormat, images, stream = true } = body;

    if (typeof query !== "string" || !query.trim()) {
      return c.json({ error: "query is required and must be a string" }, 400);
    }
    if (query.length > 1000) {
      return c.json({ error: "query exceeds maximum length of 1000 characters" }, 400);
    }

    if (typeof responseFormat !== "string" || !responseFormat.trim()) {
      return c.json({ error: "responseFormat is required and must be a string" }, 400);
    }
    if (responseFormat.length > 100) {
      return c.json({ error: "responseFormat exceeds maximum length of 100 characters" }, 400);
    }

    if (images !== undefined) {
      if (!Array.isArray(images) || images.length > 5) {
        return c.json({ error: "images must be an array with a maximum of 5 items" }, 400);
      }
      for (const img of images) {
        if (!img || typeof img.data !== "string") {
          return c.json({ error: "invalid image format" }, 400);
        }
        if (img.data.length > 10 * 1024 * 1024) {
          return c.json({ error: "image data exceeds maximum size of 10MB" }, 400);
        }
      }
    }

    const rawEnv = (c.env || {}) as any;
    let cloudflareId = "";
    let cloudflareToken = "";
    for (const [key, value] of Object.entries(rawEnv)) {
      const cleanKey = key.trim().toLowerCase();
      if (cleanKey === "cloudflare_id") cloudflareId = (value as string).trim();
      if (cleanKey === "cloudflare_token") cloudflareToken = (value as string).trim();
    }
    const procEnv = typeof process !== "undefined" ? process.env : ({} as any);
    if (!cloudflareId) cloudflareId = (procEnv.CLOUDFLARE_ID || "").trim();
    if (!cloudflareToken) cloudflareToken = (procEnv.CLOUDFLARE_TOKEN || "").trim();

    if (!cloudflareId || !cloudflareToken) {
      return c.json({ error: "Agent search is temporarily unavailable" }, 500);
    }

    const userContent: any[] = [{ type: "text", text: query }];
    if (images) {
      for (const img of images) {
        if (img.data.startsWith("https://")) {
          try {
            const imgRes = await fetch(img.data, { signal: AbortSignal.timeout(10000) });
            if (imgRes.ok) {
              const buf = await imgRes.arrayBuffer();
              const b64 = Buffer.from(buf).toString("base64");
              userContent.push({ type: "image", image: b64 });
            }
          } catch {}
        } else {
          userContent.push({ type: "image", image: img.data });
        }
      }
    }

    const messages: any[] = [
      {
        role: "system",
        content: `You are an expert research agent. Your task is to search the web and synthesize a well-researched response.

You have access to these tools:
- web_search(query): Search the web for information
- fetch_page(url): Read the full text of a web page

Instructions:
1. Analyze the user's query and plan your research strategy
2. Use web_search to find relevant information
3. Use fetch_page to read promising pages in detail when needed
4. Once you have enough information, write your final response

Response format requested: ${responseFormat}

Write your final response in the requested format. Be thorough, accurate, and cite your sources where possible.`,
      },
      {
        role: "user",
        content: userContent.length === 1 ? userContent[0].text : userContent,
      },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const allSearches: any[] = [];
    const MAX_ITERATIONS = 10;
    let finalResult = "";

    const cloudflareUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareId}/ai/v1/chat/completions`;

    async function callCloudflare(msgs: any[], streamMode: boolean) {
      const res = await fetch(cloudflareUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cloudflareToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "@cf/qwen/qwen3.8-27b",
          messages: msgs,
          tools: streamMode ? undefined : SEARCH_TOOLS,
          stream: streamMode,
        }),
      });
      if (!res.ok) throw new Error(`Search service error: ${res.status}`);
      return res;
    }

    function extractMessage(data: any) {
      return data.result || data.choices?.[0]?.message;
    }

    function extractToolCalls(msg: any) {
      if (!msg) return [];
      // OpenAI format: msg.tool_calls
      if (msg.tool_calls && msg.tool_calls.length > 0) return msg.tool_calls;
      return [];
    }

    function parseToolArgs(tc: any): any {
      if (typeof tc.arguments === "string") {
        try { return JSON.parse(tc.arguments); } catch { return {}; }
      }
      if (tc.arguments && typeof tc.arguments === "object") return tc.arguments;
      // Also check function.arguments (some Cloudflare formats)
      if (tc.function?.arguments) {
        if (typeof tc.function.arguments === "string") {
          try { return JSON.parse(tc.function.arguments); } catch { return {}; }
        }
        return tc.function.arguments;
      }
      return {};
    }

    function getToolName(tc: any): string {
      return tc.name || tc.function?.name || "unknown";
    }

    function getToolId(tc: any): string {
      return tc.id || `call_${Date.now()}`;
    }

    // ─── Non-streaming mode ───
    if (!stream) {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        let res: Response;
        try {
          res = await callCloudflare(messages, false);
        } catch (e) {
          return c.json({ error: "Search service error" }, 502);
        }

        const data = await res.json();
        const usage = data.usage || {};
        totalInputTokens += usage.prompt_tokens || Math.floor(JSON.stringify(messages).length / 4);
        const msg = extractMessage(data);
        totalOutputTokens += usage.completion_tokens || Math.floor(JSON.stringify(msg).length / 4);

        if (!msg) break;

        const toolCalls = extractToolCalls(msg);

        if (toolCalls.length > 0) {
          messages.push(msg);

          for (const tc of toolCalls) {
            const args = parseToolArgs(tc);
            const name = getToolName(tc);
            let toolResult;

            if (name === "web_search") {
              const searchRes = await performWebSearch(args.query);
              allSearches.push({ query: args.query, ...searchRes });
              toolResult = searchRes;
            } else if (name === "fetch_page") {
              toolResult = await fetchPageContent(args.url);
            } else {
              toolResult = { error: "Unknown tool" };
            }

            messages.push({
              role: "tool",
              tool_call_id: getToolId(tc),
              content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
            });
          }
        } else {
          finalResult = msg.content || "";
          break;
        }
      }

      const estimatedTokens = totalInputTokens + totalOutputTokens;
      const p_amount = Math.max(10, Math.floor(estimatedTokens / 10));
      const { data: success, error: rpcError } = await supabase.rpc("spend_points", { p_amount });
      if (rpcError || !success) {
        console.error("Agent search points deduction failed", rpcError);
      }

      return c.json({
        result: finalResult,
        searches: allSearches,
        totalPointsUsed: p_amount,
      });
    }

    // ─── Streaming mode ───
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const write = (s: string) => writer.write(encoder.encode(s));

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    const streamLoop = async () => {
      try {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          let res: Response;
          try {
            res = await callCloudflare(messages, false);
          } catch (e) {
            await write(sseJson({ type: "error", message: "Search service error" }));
            break;
          }

          const data = await res.json();
          const usage = data.usage || {};
          totalInputTokens += usage.prompt_tokens || Math.floor(JSON.stringify(messages).length / 4);
          const msg = extractMessage(data);
          totalOutputTokens += usage.completion_tokens || Math.floor(JSON.stringify(msg).length / 4);

          if (!msg) break;

          const toolCalls = extractToolCalls(msg);

          if (toolCalls.length > 0) {
            messages.push(msg);
            await write(sseJson({ type: "status", message: "Planning search..." }));

            for (const tc of toolCalls) {
              const args = parseToolArgs(tc);
              const name = getToolName(tc);
              let toolResult;

              await write(sseJson({ type: "tool_call", name, args }));

              if (name === "web_search") {
                const searchRes = await performWebSearch(args.query);
                allSearches.push({ query: args.query, ...searchRes });
                toolResult = searchRes;
              } else if (name === "fetch_page") {
                await write(sseJson({ type: "status", message: "Reading page..." }));
                toolResult = await fetchPageContent(args.url);
              } else {
                toolResult = { error: "Unknown tool" };
              }

              const preview = typeof toolResult === "string"
                ? toolResult.substring(0, 200) + "..."
                : toolResult;
              await write(sseJson({ type: "tool_result", name, result: preview }));

              messages.push({
                role: "tool",
                tool_call_id: getToolId(tc),
                content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
              });
            }
          } else {
            // Final answer — re-call with streaming for token-by-token output
            await write(sseJson({ type: "status", message: "Synthesizing results..." }));

            let streamRes: Response;
            try {
              streamRes = await callCloudflare(messages, true);
            } catch (e) {
              await write(sseJson({ type: "error", message: "Search service error" }));
              break;
            }

            if (!streamRes.body) break;

            const reader = streamRes.body.getReader();
            const decoder = new TextDecoder();
            let finalContent = "";
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (let line of lines) {
                line = line.trim();
                if (line === "data: [DONE]") continue;
                if (line.startsWith("data: ")) {
                  try {
                    const parsed = JSON.parse(line.substring(6));
                    const token = parsed.response || parsed.choices?.[0]?.delta?.content || "";
                    if (token) {
                      finalContent += token;
                      await write(sseJson({ type: "delta", content: token }));
                    }
                  } catch (e) {}
                }
              }
            }

            totalOutputTokens += Math.floor(finalContent.length / 4);

            const estimatedTokens = totalInputTokens + totalOutputTokens;
            const p_amount = Math.max(10, Math.floor(estimatedTokens / 10));
            const { data: success, error: rpcError } = await supabase.rpc("spend_points", { p_amount });
            if (rpcError || !success) {
              console.error("Agent search points deduction failed", rpcError);
            }

            await write(sseJson({
              type: "result",
              content: finalContent,
              searches: allSearches,
              totalPointsUsed: p_amount,
            }));
            await write(sseEvent("[DONE]"));

            break;
          }
        }
      } catch (err) {
        await write(sseJson({ type: "error", message: "Internal server error" }));
      } finally {
        writer.close();
      }
    };

    // Run the streaming loop asynchronously
    streamLoop();

    return new Response(readable);
  } catch (err) {
    console.error("Agent Search 500 Error:", err);
    return c.json({ error: "Internal server error", details: err instanceof Error ? err.message : String(err) }, 500);
  }
});
