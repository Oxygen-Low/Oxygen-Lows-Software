import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const agentSearchRouter = new Hono();

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const HORDE_URL = "https://oai.stablehorde.net/v1/chat/completions";
const HORDE_FAST_MODEL = "google/gemma-4-31b";
const CLOUDFLARE_SMART_MODEL = "@cf/qwen/qwen3.8-27b";

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

    const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)$/);
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
    return "Error: Failed to perform web search. The search engine might be blocking the request.";
  }
}

async function fetchPageContent(url: string) {
  if (!isSafeUrl(url)) return "Error: Invalid or blocked URL. Cannot fetch localhost or internal IPs.";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const cleanText = stripHtmlTags(text);
    return cleanText.substring(0, 8192);
  } catch (err) {
    return "Error: Failed to fetch page content. The website may be down, blocking bots, or timed out.";
  }
}

function sseEvent(data: string): string {
  return `data: ${data}\n\n`;
}

function sseJson(obj: any): string {
  return sseEvent(JSON.stringify(obj));
}

function parseHordeAction(data: any): { tool: string; args: any } | null {
  const msg = data.result || data.choices?.[0]?.message;
  if (!msg) return null;

  // 1. Check standard OpenAI tool_calls
  if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    const tc = msg.tool_calls[0];
    const name = tc.name || tc.function?.name || "";
    let args: any = {};
    const rawArgs = tc.arguments || tc.function?.arguments;
    if (typeof rawArgs === "string") {
      try { args = JSON.parse(rawArgs); } catch {}
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs;
    }
    if (name) return { tool: name, args };
  }

  // 2. Check JSON content in msg.content
  const content = typeof msg.content === "string" ? msg.content.trim() : "";
  if (!content) return null;

  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const toolName = parsed.action || parsed.tool || parsed.name;
      if (toolName === "done" || toolName === "finish" || toolName === "none" || parsed.done === true) {
        return { tool: "done", args: {} };
      }
      if (toolName === "web_search" || toolName === "search" || toolName === "search_web") {
        return {
          tool: "web_search",
          args: { query: parsed.query || parsed.q || parsed.search || "" }
        };
      }
      if (toolName === "fetch_page" || toolName === "fetch" || toolName === "read_page" || toolName === "read") {
        return {
          tool: "fetch_page",
          args: { url: parsed.url || parsed.link || "" }
        };
      }
    }
  } catch {}

  // 3. If response starts with "Done" or gives a final answer without tools, mark done
  if (/^(done|research complete|information gathered)/i.test(content)) {
    return { tool: "done", args: {} };
  }

  return null;
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

    // Read Cloudflare credentials for smart summary/conclusion
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

    // Check if user has Horde integration key
    let hordeApiKey = "0000000000";
    try {
      const { data: hordeInt } = await supabase
        .from("user_integrations")
        .select("api_key")
        .eq("provider", "horde")
        .single();
      if (hordeInt?.api_key) hordeApiKey = hordeInt.api_key;
    } catch {}

    // Prepare multimodal user images for vision
    const userImages: string[] = [];
    if (images) {
      for (const img of images) {
        if (img.data.startsWith("https://")) {
          try {
            const imgRes = await fetch(img.data, { signal: AbortSignal.timeout(10000) });
            if (imgRes.ok) {
              const buf = await imgRes.arrayBuffer();
              const b64 = Buffer.from(buf).toString("base64");
              userImages.push(b64);
            }
          } catch {}
        } else {
          userImages.push(img.data);
        }
      }
    }

    const MAX_ITERATIONS = 10;
    const allSearches: any[] = [];
    const fetchedPages: Array<{ url: string; content: string }> = [];

    // Horde prompt for fast tool decisions
    const hordeMessages: any[] = [
      {
        role: "system",
        content: `You are a fast autonomous research agent. Your goal is to gather information from the web to answer the user query.

Available actions (reply with a single JSON object):
1. Search the web:
{"action": "web_search", "query": "<search query>"}

2. Fetch and read a webpage:
{"action": "fetch_page", "url": "https://..."}

3. Finished research (you have gathered enough facts/sources):
{"action": "done"}

Rules:
- Respond ONLY with the JSON object for the next action.
- Plan targeted search queries.
- When you have enough information, reply with {"action": "done"}.`,
      },
      {
        role: "user",
        content: `Query to research: "${query}". Determine the first research action.`,
      },
    ];

    async function callHorde(msgs: any[]) {
      const res = await fetch(HORDE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hordeApiKey}`,
        },
        body: JSON.stringify({
          model: HORDE_FAST_MODEL,
          messages: msgs,
          tools: SEARCH_TOOLS,
          temperature: 0.2,
          max_tokens: 300,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`AI Horde error ${res.status}:`, errText);
        throw new Error(`AI Horde error: ${res.status}`);
      }
      return res;
    }

    const cloudflareUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareId}/ai/v1/chat/completions`;

    async function callCloudflareSmart(synthesisMessages: any[], streamMode: boolean) {
      const res = await fetch(cloudflareUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cloudflareToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CLOUDFLARE_SMART_MODEL,
          messages: synthesisMessages,
          stream: streamMode,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Cloudflare smart synthesis error ${res.status}:`, errText);
        throw new Error(`Search synthesis error: ${res.status}`);
      }
      return res;
    }

    // Build the synthesis messages for Cloudflare Smart
    function buildSynthesisMessages() {
      let researchContext = "";

      if (allSearches.length > 0) {
        researchContext += "\n--- WEB SEARCH RESULTS ---\n";
        allSearches.forEach((s, idx) => {
          researchContext += `\n[Search #${idx + 1}: "${s.query}"]\n`;
          if (s.snippets && Array.isArray(s.snippets)) {
            s.snippets.forEach((snip: string, sIdx: number) => {
              const url = s.urls?.[sIdx] ? ` (Source: ${s.urls[sIdx]})` : "";
              researchContext += `- ${snip}${url}\n`;
            });
          } else if (s.error) {
            researchContext += `- (Search error: ${s.error})\n`;
          }
        });
      }

      if (fetchedPages.length > 0) {
        researchContext += "\n--- WEBPAGES READ ---\n";
        fetchedPages.forEach((p, idx) => {
          researchContext += `\n[Webpage #${idx + 1}: ${p.url}]\n${p.content}\n`;
        });
      }

      const systemPrompt = `You are an expert research synthesizer. Using the gathered real-time web research findings below, synthesize a high-quality, comprehensive, and well-structured response in the requested format.

Requested response format: ${responseFormat}

Guidelines:
- Base your response on the provided research findings.
- Be accurate, clear, and cite sources where relevant.
- Follow the requested format: ${responseFormat}.`;

      const userContent: any[] = [
        {
          type: "text",
          text: `User Query: ${query}\n\n${researchContext || "No external search results found."}`,
        },
      ];

      for (const imgB64 of userImages) {
        userContent.push({ type: "image", image: imgB64 });
      }

      return [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userContent.length === 1 ? userContent[0].text : userContent,
        },
      ];
    }

    // ─── Non-streaming mode ───
    if (!stream) {
      // 1. Tool calling loop with AI Horde Fast
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        let hordeRes: Response;
        let action: { tool: string; args: any } | null = null;

        try {
          hordeRes = await callHorde(hordeMessages);
          const data = await hordeRes.json();
          action = parseHordeAction(data);
        } catch {
          // If Horde fails on first turn, fallback to direct search query
          if (i === 0) {
            action = { tool: "web_search", args: { query } };
          } else {
            break;
          }
        }

        if (!action || action.tool === "done") {
          break;
        }

        let toolResult: any;
        if (action.tool === "web_search") {
          const searchRes = await performWebSearch(action.args.query || query);
          if (typeof searchRes === "string") {
            allSearches.push({ query: action.args.query || query, error: searchRes });
          } else {
            allSearches.push({ query: action.args.query || query, ...searchRes });
          }
          toolResult = searchRes;
        } else if (action.tool === "fetch_page") {
          const pageRes = await fetchPageContent(action.args.url);
          if (typeof pageRes === "string" && !pageRes.startsWith("Error:")) {
            fetchedPages.push({ url: action.args.url, content: pageRes });
          }
          toolResult = pageRes;
        } else {
          toolResult = "Error: Unknown tool";
        }

        hordeMessages.push({
          role: "assistant",
          content: JSON.stringify({ action: action.tool, ...action.args }),
        });
        hordeMessages.push({
          role: "user",
          content: `Tool result for ${action.tool}:\n${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}\n\nWhat is your next action? (Respond with JSON action or {"action": "done"})`,
        });
      }

      // If no search was run, run at least one search for the query
      if (allSearches.length === 0) {
        const directSearch = await performWebSearch(query);
        if (typeof directSearch !== "string") {
          allSearches.push({ query, ...directSearch });
        }
      }

      // 2. Synthesis with Cloudflare Smart model
      const synthMsgs = buildSynthesisMessages();
      let cfRes: Response;
      try {
        cfRes = await callCloudflareSmart(synthMsgs, false);
      } catch (e) {
        return c.json({ error: "Search synthesis error" }, 502);
      }

      const cfData = await cfRes.json();
      const finalMsg = cfData.result || cfData.choices?.[0]?.message;
      const finalResult = typeof finalMsg?.content === "string" ? finalMsg.content : "";

      // Calculate points ONLY from Cloudflare Smart synthesis call
      const usage = cfData.usage || {};
      const synthInputTokens = usage.prompt_tokens || Math.floor(JSON.stringify(synthMsgs).length / 4);
      const synthOutputTokens = usage.completion_tokens || Math.floor(finalResult.length / 4);
      const totalTokens = synthInputTokens + synthOutputTokens;
      const p_amount = Math.max(10, Math.floor(totalTokens / 10));

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
        await write(sseJson({ type: "status", message: "Connecting to AI Horde fast research agent..." }));

        // 1. Tool execution loop using AI Horde Fast
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          await write(sseJson({
            type: "status",
            message: i === 0
              ? "Formulating research query and planning search strategy..."
              : `Analyzing findings & planning next research step (Round ${i + 1}/${MAX_ITERATIONS})...`
          }));

          let hordeRes: Response;
          let action: { tool: string; args: any } | null = null;

          try {
            hordeRes = await callHorde(hordeMessages);
            const data = await hordeRes.json();
            action = parseHordeAction(data);
          } catch {
            // Fallback for first turn if Horde is busy
            if (i === 0) {
              action = { tool: "web_search", args: { query } };
            } else {
              break;
            }
          }

          if (!action || action.tool === "done") {
            break;
          }

          let toolResult: any;
          await write(sseJson({ type: "tool_call", name: action.tool, args: action.args }));

          if (action.tool === "web_search") {
            const searchQuery = action.args.query || query;
            await write(sseJson({
              type: "status",
              message: `Searching web for: "${searchQuery}"...`
            }));
            const searchRes = await performWebSearch(searchQuery);
            if (typeof searchRes === "string") {
              allSearches.push({ query: searchQuery, error: searchRes });
            } else {
              allSearches.push({ query: searchQuery, ...searchRes });
            }
            toolResult = searchRes;
            const snippetCount = typeof searchRes === "object" && searchRes.snippets ? searchRes.snippets.length : 0;
            await write(sseJson({
              type: "status",
              message: typeof searchRes === "string"
                ? "Search completed with warnings. Analyzing findings..."
                : `Found ${snippetCount} search results for "${searchQuery}". Processing insights...`
            }));
          } else if (action.tool === "fetch_page") {
            await write(sseJson({
              type: "status",
              message: `Fetching and reading webpage: ${action.args.url}...`
            }));
            const pageRes = await fetchPageContent(action.args.url);
            if (typeof pageRes === "string" && !pageRes.startsWith("Error:")) {
              fetchedPages.push({ url: action.args.url, content: pageRes });
            }
            toolResult = pageRes;
            await write(sseJson({
              type: "status",
              message: typeof toolResult === "string" && toolResult.startsWith("Error:")
                ? "Webpage read attempt completed. Continuing research..."
                : `Successfully read page content. Extracting key data...`
            }));
          } else {
            toolResult = "Error: Unknown tool";
          }

          await write(sseJson({ type: "tool_result", name: action.tool, result: toolResult }));

          hordeMessages.push({
            role: "assistant",
            content: JSON.stringify({ action: action.tool, ...action.args }),
          });
          hordeMessages.push({
            role: "user",
            content: `Tool result for ${action.tool}:\n${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}\n\nWhat is your next action? (Respond with JSON action or {"action": "done"})`,
          });
        }

        // If no searches occurred, execute direct web search as baseline
        if (allSearches.length === 0) {
          await write(sseJson({ type: "tool_call", name: "web_search", args: { query } }));
          await write(sseJson({ type: "status", message: `Searching web for: "${query}"...` }));
          const directSearch = await performWebSearch(query);
          if (typeof directSearch === "string") {
            allSearches.push({ query, error: directSearch });
          } else {
            allSearches.push({ query, ...directSearch });
          }
          await write(sseJson({ type: "tool_result", name: "web_search", result: directSearch }));
        }

        // 2. Final Synthesis using Cloudflare Smart model
        await write(sseJson({
          type: "status",
          message: "Synthesizing comprehensive final answer with Cloudflare Smart model..."
        }));

        const synthMsgs = buildSynthesisMessages();
        let streamRes: Response;
        try {
          streamRes = await callCloudflareSmart(synthMsgs, true);
        } catch (e) {
          await write(sseJson({ type: "error", message: "Search synthesis error" }));
          return;
        }

        if (!streamRes.body) {
          await write(sseJson({ type: "error", message: "Empty synthesis stream" }));
          return;
        }

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

        // Calculate points solely on the Cloudflare Smart synthesis call
        const synthInputTokens = Math.floor(JSON.stringify(synthMsgs).length / 4);
        const synthOutputTokens = Math.floor(finalContent.length / 4);
        const estimatedTokens = synthInputTokens + synthOutputTokens;
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
