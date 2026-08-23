import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const agentSearchRouter = new Hono();

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const HORDE_URL = "https://oai.stablehorde.net/v1/chat/completions";
const HORDE_FAST_MODEL = "google/gemma-4-31b";
const CLOUDFLARE_SMART_MODEL = "@cf/nvidia/nemotron-3-120b-a12b";

// Max research tool rounds with Horde (up to 100 calls)
const MAX_RESEARCH_ROUNDS = 100;
// Global total context token ceiling across the entire research payload combined (~4 chars per token)
const MAX_TOTAL_CONTEXT_TOKENS = 4000;
const MAX_TOTAL_CONTEXT_CHARS = MAX_TOTAL_CONTEXT_TOKENS * 4; // 16,000 characters total

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.*)$/i);
  return match ? match[1].trim() : null;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua":
    '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtmlTags(input: unknown): string {
  if (typeof input !== "string") return "";
  let text = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  // Prefer main content container if present
  const mainMatch =
    text.match(
      /<div id="mw-content-text"[^>]*>([\s\S]*?)<\/div>\s*<div class="printfooter"/i,
    ) || text.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  if (mainMatch) {
    text = mainMatch[1];
  }

  let prev = "";
  do {
    prev = text;
    text = text.replace(/<[^<>]*>/g, " ");
  } while (text !== prev);

  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let clean = input.trim();
  if (!clean) return null;

  // Strip markdown links e.g. [text](https://url)
  const mdMatch = clean.match(/\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
  if (mdMatch) clean = mdMatch[1];

  // Strip wrapping quotes, brackets, backticks
  clean = clean.replace(/^[<"'\`\(\[]+|[>"'\`\)\]]+$/g, "").trim();

  // Handle DuckDuckGo redirect URLs e.g. //duckduckgo.com/l/?uddg=https%3A%2F%2F...
  if (clean.includes("uddg=")) {
    try {
      const match = clean.match(/uddg=([^&]+)/);
      if (match) clean = decodeURIComponent(match[1]);
    } catch {}
  }

  // Prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(clean)) {
    if (clean.startsWith("//")) {
      clean = "https:" + clean;
    } else {
      clean = "https://" + clean;
    }
  }

  // Force https
  if (clean.startsWith("http://")) {
    clean = "https://" + clean.slice(7);
  }

  return clean;
}

function isSafeUrl(urlString: string): boolean {
  const cleanUrl = normalizeUrl(urlString);
  if (!cleanUrl) return false;

  try {
    const url = new URL(cleanUrl);
    if (url.protocol !== "https:") return false;

    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "metadata.google.internal" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    ) {
      return false;
    }

    const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const parts = ipMatch.slice(1).map(Number);
      if (parts[0] === 127) return false;
      if (parts[0] === 10) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      if (
        parts[0] === 169 &&
        parts[1] === 254 &&
        parts[2] === 169 &&
        parts[3] === 254
      )
        return false;
    }

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
      description:
        "Search the web for information. Returns text snippets and URLs from search results.",
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
      description:
        "Fetch and read the text content of a web page URL. Returns the page text (fits within the 4000 total token budget).",
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
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) throw new Error("Search request failed");

    const html = await res.text();
    const snippets: string[] = [];
    const urls: string[] = [];

    // Extract snippets and their matching hrefs
    const snippetRegex =
      /class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 10) {
      const cleanSnippet = stripHtmlTags(match[2]).trim();
      const normalizedHref = normalizeUrl(match[1]);
      if (cleanSnippet) {
        snippets.push(cleanSnippet);
        if (normalizedHref) urls.push(normalizedHref);
      }
    }

    // Fallback if snippet links weren't found
    if (urls.length === 0) {
      const urlRegex =
        /class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = urlRegex.exec(html)) !== null && urls.length < 10) {
        const normalizedHref = normalizeUrl(match[1]);
        if (normalizedHref) urls.push(normalizedHref);
      }
    }

    if (snippets.length === 0) {
      const genericSnippetRegex =
        /class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
      while (
        (match = genericSnippetRegex.exec(html)) !== null &&
        snippets.length < 10
      ) {
        const cleanSnippet = stripHtmlTags(match[1]).trim();
        if (cleanSnippet) snippets.push(cleanSnippet);
      }
    }

    return { snippets, urls };
  } catch (err) {
    return "Error: Failed to perform web search. The search engine might be blocking the request.";
  }
}

async function fetchPageContent(rawUrl: string, maxChars: number = 6000) {
  const cleanUrl = normalizeUrl(rawUrl);
  if (!cleanUrl || !isSafeUrl(cleanUrl)) {
    return "Error: Invalid or blocked URL. Cannot fetch localhost or internal IPs.";
  }
  try {
    const res = await fetch(cleanUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const text = await res.text();
      const clean = stripHtmlTags(text);
      if (clean.length > 50) {
        return clean.substring(0, maxChars);
      }
    }

    // If direct HTML returned 403 / non-200 and it's a wiki page, try MediaWiki API endpoints
    if (cleanUrl.includes("/wiki/")) {
      try {
        const u = new URL(cleanUrl);
        const title = u.pathname.split("/wiki/")[1];
        if (title) {
          const apiEndpoints = [
            `${u.origin}/w/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
            `${u.origin}/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`,
            `${u.origin}/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
            `${u.origin}/w/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`,
          ];

          for (const endpoint of apiEndpoints) {
            try {
              const apiRes = await fetch(endpoint, {
                headers: {
                  "User-Agent": BROWSER_HEADERS["User-Agent"],
                  Accept: "application/json,text/html,*/*",
                },
                signal: AbortSignal.timeout(4000),
              });
              if (apiRes.ok) {
                const data = await apiRes.json();
                if (data?.parse?.text?.["*"]) {
                  const parsedText = stripHtmlTags(data.parse.text["*"]);
                  if (parsedText.length > 50)
                    return parsedText.substring(0, maxChars);
                }
                const pages = data?.query?.pages || {};
                for (const k in pages) {
                  if (pages[k]?.extract) {
                    return stripHtmlTags(pages[k].extract).substring(
                      0,
                      maxChars,
                    );
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return stripHtmlTags(text).substring(0, maxChars);
  } catch (err: any) {
    return `Error: Failed to fetch page content from ${cleanUrl} (${err.message || "network failed"}).`;
  }
}

function sseEvent(data: string): string {
  return `data: ${data}\n\n`;
}

function sseJson(obj: any): string {
  return sseEvent(JSON.stringify(obj));
}

function getTotalResearchChars(
  searches: any[],
  pages: Array<{ url: string; content: string }>,
): number {
  let total = 0;
  for (const s of searches) {
    if (s.snippets && Array.isArray(s.snippets)) {
      for (const snip of s.snippets) total += snip.length;
    }
  }
  for (const p of pages) {
    total += p.content.length;
  }
  return total;
}

function parseHordeAction(data: any): { tool: string; args: any } | null {
  const msg = data.result || data.choices?.[0]?.message;
  if (!msg) return null;

  // 1. Check standard OpenAI tool_calls
  if (
    msg.tool_calls &&
    Array.isArray(msg.tool_calls) &&
    msg.tool_calls.length > 0
  ) {
    const tc = msg.tool_calls[0];
    const name = tc.name || tc.function?.name || "";
    let args: any = {};
    const rawArgs = tc.arguments || tc.function?.arguments;
    if (typeof rawArgs === "string") {
      try {
        args = JSON.parse(rawArgs);
      } catch {}
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
      if (
        toolName === "done" ||
        toolName === "finish" ||
        toolName === "none" ||
        parsed.done === true
      ) {
        return { tool: "done", args: {} };
      }
      if (
        toolName === "web_search" ||
        toolName === "search" ||
        toolName === "search_web"
      ) {
        return {
          tool: "web_search",
          args: { query: parsed.query || parsed.q || parsed.search || "" },
        };
      }
      if (
        toolName === "fetch_page" ||
        toolName === "fetch" ||
        toolName === "read_page" ||
        toolName === "read"
      ) {
        return {
          tool: "fetch_page",
          args: { url: parsed.url || parsed.link || "" },
        };
      }
    }
  } catch {}

  // 3. If response indicates completion
  if (/^(done|research complete|information gathered)/i.test(content)) {
    return { tool: "done", args: {} };
  }

  return null;
}

agentSearchRouter.post(
  "/",
  rateLimiter(10, 60_000, "agent-search"),
  async (c) => {
    try {
      const authHeader = c.req.header("Authorization");
      const token = extractBearerToken(authHeader);
      if (!token)
        return c.json({ error: "Missing or invalid authorization token" }, 401);

      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) return c.json({ error: "Unauthorized" }, 401);

      let body;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON" }, 400);
      }

      const {
        query,
        responseFormat,
        images,
        stream = true,
        researchOnly = false,
      } = body;

      if (typeof query !== "string" || !query.trim()) {
        return c.json({ error: "query is required and must be a string" }, 400);
      }
      if (query.length > 1000) {
        return c.json(
          { error: "query exceeds maximum length of 1000 characters" },
          400,
        );
      }

      if (typeof responseFormat !== "string" || !responseFormat.trim()) {
        return c.json(
          { error: "responseFormat is required and must be a string" },
          400,
        );
      }
      if (responseFormat.length > 100) {
        return c.json(
          { error: "responseFormat exceeds maximum length of 100 characters" },
          400,
        );
      }

      if (images !== undefined) {
        if (!Array.isArray(images) || images.length > 5) {
          return c.json(
            { error: "images must be an array with a maximum of 5 items" },
            400,
          );
        }
        for (const img of images) {
          if (!img || typeof img.data !== "string") {
            return c.json({ error: "invalid image format" }, 400);
          }
          if (img.data.length > 10 * 1024 * 1024) {
            return c.json(
              { error: "image data exceeds maximum size of 10MB" },
              400,
            );
          }
        }
      }

      // Read Cloudflare credentials for smart summary/conclusion (only needed if synthesizing)
      const rawEnv = (c.env || {}) as any;
      let cloudflareId = "";
      let cloudflareToken = "";
      for (const [key, value] of Object.entries(rawEnv)) {
        const cleanKey = key.trim().toLowerCase();
        if (cleanKey === "cloudflare_id")
          cloudflareId = (value as string).trim();
        if (cleanKey === "cloudflare_token")
          cloudflareToken = (value as string).trim();
      }
      const procEnv =
        typeof process !== "undefined" ? process.env : ({} as any);
      if (!cloudflareId) cloudflareId = (procEnv.CLOUDFLARE_ID || "").trim();
      if (!cloudflareToken)
        cloudflareToken = (procEnv.CLOUDFLARE_TOKEN || "").trim();

      if (!researchOnly && (!cloudflareId || !cloudflareToken)) {
        return c.json(
          { error: "Agent search is temporarily unavailable" },
          500,
        );
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
              const imgRes = await fetch(img.data, {
                signal: AbortSignal.timeout(8000),
              });
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

      const allSearches: any[] = [];
      const fetchedPages: Array<{ url: string; content: string }> = [];

      // Horde prompt for fast tool decisions
      const hordeMessages: any[] = [
        {
          role: "system",
          content: `You are a fast autonomous research agent. Your goal is to gather facts from the web to answer the user's query up to a 4000 total context token budget.

Available actions (respond ONLY with a single JSON object):
1. Search the web:
{"action": "web_search", "query": "<search query>"}

2. Fetch and read a webpage:
{"action": "fetch_page", "url": "https://..."}

3. Finished research (enough facts gathered):
{"action": "done"}`,
        },
        {
          role: "user",
          content: `Research topic: "${query}". What is your first research action?`,
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
            max_tokens: 200,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`AI Horde error ${res.status}:`, errText);
          throw new Error(`AI Horde error: ${res.status}`);
        }
        return res;
      }

      const cloudflareUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareId}/ai/v1/chat/completions`;

      async function callCloudflareSmart(
        synthesisMessages: any[],
        streamMode: boolean,
      ) {
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
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(
            `Cloudflare smart synthesis error ${res.status}:`,
            errText,
          );
          throw new Error(`Search synthesis error: ${res.status}`);
        }
        return res;
      }

      // Build research context text strictly capped at 4000 total context tokens
      function buildResearchContext(): string {
        let researchContext = "";

        if (allSearches.length > 0) {
          researchContext += "\n--- WEB SEARCH RESULTS ---\n";
          for (let idx = 0; idx < allSearches.length; idx++) {
            const s = allSearches[idx];
            let block = `\n[Search #${idx + 1}: "${s.query}"]\n`;
            if (s.snippets && Array.isArray(s.snippets)) {
              s.snippets.forEach((snip: string, sIdx: number) => {
                const url = s.urls?.[sIdx] ? ` (Source: ${s.urls[sIdx]})` : "";
                block += `- ${snip}${url}\n`;
              });
            } else if (s.error) {
              block += `- (Search error: ${s.error})\n`;
            }

            if ((researchContext + block).length > MAX_TOTAL_CONTEXT_CHARS) {
              const available = Math.max(
                0,
                MAX_TOTAL_CONTEXT_CHARS - researchContext.length,
              );
              researchContext += block.substring(0, available);
              break;
            }
            researchContext += block;
          }
        }

        if (
          fetchedPages.length > 0 &&
          researchContext.length < MAX_TOTAL_CONTEXT_CHARS
        ) {
          researchContext += "\n--- WEBPAGES READ ---\n";
          for (let idx = 0; idx < fetchedPages.length; idx++) {
            const p = fetchedPages[idx];
            const block = `\n[Webpage #${idx + 1}: ${p.url}]\n${p.content}\n`;
            if ((researchContext + block).length > MAX_TOTAL_CONTEXT_CHARS) {
              const available = Math.max(
                0,
                MAX_TOTAL_CONTEXT_CHARS - researchContext.length,
              );
              researchContext += block.substring(0, available);
              break;
            }
            researchContext += block;
          }
        }
        return researchContext;
      }

      // Build synthesis messages strictly capped at 4000 total context tokens
      function buildSynthesisMessages() {
        const researchContext = buildResearchContext();

        const systemPrompt = `You are an expert research synthesizer. Using the gathered real-time web research findings below (capped at 4000 total context tokens), synthesize a high-quality, comprehensive, and well-structured response in the requested format.

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
            content:
              userContent.length === 1 ? userContent[0].text : userContent,
          },
        ];
      }

      // ─── Non-streaming mode ───
      if (!stream) {
        // 1. Fast tool calling loop with AI Horde (up to 100 calls or 4000 total tokens)
        for (let i = 0; i < MAX_RESEARCH_ROUNDS; i++) {
          // If total context has reached 4000 tokens, conclude research early
          if (
            getTotalResearchChars(allSearches, fetchedPages) >=
            MAX_TOTAL_CONTEXT_CHARS
          ) {
            break;
          }

          let action: { tool: string; args: any } | null = null;

          try {
            const hordeRes = await callHorde(hordeMessages);
            const data = await hordeRes.json();
            action = parseHordeAction(data);
          } catch {
            // If Horde times out or fails, fallback to direct query search
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
            const searchRes = await performWebSearch(
              action.args.query || query,
            );
            if (typeof searchRes === "string") {
              allSearches.push({
                query: action.args.query || query,
                error: searchRes,
              });
            } else {
              allSearches.push({
                query: action.args.query || query,
                ...searchRes,
              });
            }
            toolResult = searchRes;
          } else if (action.tool === "fetch_page") {
            const currentTotal = getTotalResearchChars(
              allSearches,
              fetchedPages,
            );
            const remainingBudget = Math.max(
              1000,
              MAX_TOTAL_CONTEXT_CHARS - currentTotal,
            );
            const pageRes = await fetchPageContent(
              action.args.url,
              remainingBudget,
            );
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
            content: `Tool result for ${action.tool}:\n${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}\n\nNext action? (Respond with JSON action or {"action": "done"})`,
          });

          // Prune older history to stay within 4000 context token limits across 100 calls
          if (hordeMessages.length > 16) {
            hordeMessages.splice(2, hordeMessages.length - 16);
          }
        }

        // Ensure baseline search exists
        if (allSearches.length === 0) {
          const directSearch = await performWebSearch(query);
          if (typeof directSearch !== "string") {
            allSearches.push({ query, ...directSearch });
          }
        }

        const researchContext = buildResearchContext();

        if (researchOnly) {
          return c.json({
            result: researchContext,
            context: researchContext,
            searches: allSearches,
            pages: fetchedPages,
            totalPointsUsed: 0,
          });
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
        const finalResult =
          typeof finalMsg?.content === "string" ? finalMsg.content : "";

        // Calculate points ONLY from Cloudflare Smart synthesis call
        const usage = cfData.usage || {};
        const synthInputTokens =
          usage.prompt_tokens ||
          Math.floor(JSON.stringify(synthMsgs).length / 4);
        const synthOutputTokens =
          usage.completion_tokens || Math.floor(finalResult.length / 4);
        const totalTokens = synthInputTokens + synthOutputTokens;
        const p_amount = Math.max(10, Math.floor(totalTokens / 10));

        const { data: success, error: rpcError } = await supabase.rpc(
          "spend_points",
          { p_amount },
        );
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
          await write(
            sseJson({
              type: "status",
              message: "Connecting to fast research agent...",
            }),
          );

          // 1. Tool execution loop using AI Horde Fast (up to 100 calls or 4000 total tokens)
          for (let i = 0; i < MAX_RESEARCH_ROUNDS; i++) {
            // If total context has reached 4000 total tokens, conclude research early
            if (
              getTotalResearchChars(allSearches, fetchedPages) >=
              MAX_TOTAL_CONTEXT_CHARS
            ) {
              await write(
                sseJson({
                  type: "status",
                  message:
                    "4000 total context token research limit reached. Synthesizing results...",
                }),
              );
              break;
            }

            await write(
              sseJson({
                type: "status",
                message:
                  i === 0
                    ? "Formulating research query and planning search strategy..."
                    : `Analyzing findings & planning next research step (Round ${i + 1}/${MAX_RESEARCH_ROUNDS})...`,
              }),
            );

            let action: { tool: string; args: any } | null = null;

            try {
              const hordeRes = await callHorde(hordeMessages);
              const data = await hordeRes.json();
              action = parseHordeAction(data);
            } catch (hordeErr) {
              console.warn(
                "AI Horde call timed out or failed, falling back to direct search",
                hordeErr,
              );
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
            await write(
              sseJson({
                type: "tool_call",
                name: action.tool,
                args: action.args,
              }),
            );

            if (action.tool === "web_search") {
              const searchQuery = action.args.query || query;
              await write(
                sseJson({
                  type: "status",
                  message: `Searching web for: "${searchQuery}"...`,
                }),
              );
              const searchRes = await performWebSearch(searchQuery);
              if (typeof searchRes === "string") {
                allSearches.push({ query: searchQuery, error: searchRes });
              } else {
                allSearches.push({ query: searchQuery, ...searchRes });
              }
              toolResult = searchRes;
              const snippetCount =
                typeof searchRes === "object" && searchRes.snippets
                  ? searchRes.snippets.length
                  : 0;
              await write(
                sseJson({
                  type: "status",
                  message:
                    typeof searchRes === "string"
                      ? "Search completed. Analyzing findings..."
                      : `Found ${snippetCount} search results for "${searchQuery}". Processing insights...`,
                }),
              );
            } else if (action.tool === "fetch_page") {
              await write(
                sseJson({
                  type: "status",
                  message: `Fetching and reading webpage: ${action.args.url}...`,
                }),
              );
              const currentTotal = getTotalResearchChars(
                allSearches,
                fetchedPages,
              );
              const remainingBudget = Math.max(
                1000,
                MAX_TOTAL_CONTEXT_CHARS - currentTotal,
              );
              const pageRes = await fetchPageContent(
                action.args.url,
                remainingBudget,
              );
              if (
                typeof pageRes === "string" &&
                !pageRes.startsWith("Error:")
              ) {
                fetchedPages.push({ url: action.args.url, content: pageRes });
              }
              toolResult = pageRes;
              await write(
                sseJson({
                  type: "status",
                  message:
                    typeof toolResult === "string" &&
                    toolResult.startsWith("Error:")
                      ? "Webpage read attempt completed. Continuing research..."
                      : `Successfully read page content. Extracting key data...`,
                }),
              );
            } else {
              toolResult = "Error: Unknown tool";
            }

            await write(
              sseJson({
                type: "tool_result",
                name: action.tool,
                result: toolResult,
              }),
            );

            hordeMessages.push({
              role: "assistant",
              content: JSON.stringify({ action: action.tool, ...action.args }),
            });
            hordeMessages.push({
              role: "user",
              content: `Tool result for ${action.tool}:\n${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}\n\nNext action? (Respond with JSON action or {"action": "done"})`,
            });

            // Prune older history to stay within 4000 context token limits across 100 calls
            if (hordeMessages.length > 16) {
              hordeMessages.splice(2, hordeMessages.length - 16);
            }
          }

          // If no searches occurred, execute direct web search as baseline
          if (allSearches.length === 0) {
            await write(
              sseJson({
                type: "tool_call",
                name: "web_search",
                args: { query },
              }),
            );
            await write(
              sseJson({
                type: "status",
                message: `Searching web for: "${query}"...`,
              }),
            );
            const directSearch = await performWebSearch(query);
            if (typeof directSearch === "string") {
              allSearches.push({ query, error: directSearch });
            } else {
              allSearches.push({ query, ...directSearch });
            }
            await write(
              sseJson({
                type: "tool_result",
                name: "web_search",
                result: directSearch,
              }),
            );
          }

          const researchContext = buildResearchContext();

          if (researchOnly) {
            await write(
              sseJson({
                type: "research_complete",
                context: researchContext,
                searches: allSearches,
                pages: fetchedPages,
              }),
            );
            await write(
              sseJson({
                type: "result",
                content: researchContext,
                searches: allSearches,
                totalPointsUsed: 0,
              }),
            );
            await write(sseEvent("[DONE]"));
            return;
          }

          // 2. Final Synthesis using Cloudflare Smart model
          await write(
            sseJson({
              type: "status",
              message:
                "Synthesizing comprehensive final answer with Cloudflare Smart model...",
            }),
          );

          const synthMsgs = buildSynthesisMessages();
          let streamRes: Response;
          try {
            streamRes = await callCloudflareSmart(synthMsgs, true);
          } catch (e) {
            await write(
              sseJson({ type: "error", message: "Search synthesis error" }),
            );
            return;
          }

          if (!streamRes.body) {
            await write(
              sseJson({ type: "error", message: "Empty synthesis stream" }),
            );
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
                  const token =
                    parsed.response ||
                    parsed.choices?.[0]?.delta?.content ||
                    "";
                  if (token) {
                    finalContent += token;
                    await write(sseJson({ type: "delta", content: token }));
                  }
                } catch (e) {}
              }
            }
          }

          // Calculate points solely on the Cloudflare Smart synthesis call
          const synthInputTokens = Math.floor(
            JSON.stringify(synthMsgs).length / 4,
          );
          const synthOutputTokens = Math.floor(finalContent.length / 4);
          const estimatedTokens = synthInputTokens + synthOutputTokens;
          const p_amount = Math.max(10, Math.floor(estimatedTokens / 10));

          const { data: success, error: rpcError } = await supabase.rpc(
            "spend_points",
            { p_amount },
          );
          if (rpcError || !success) {
            console.error("Agent search points deduction failed", rpcError);
          }

          await write(
            sseJson({
              type: "result",
              content: finalContent,
              searches: allSearches,
              totalPointsUsed: p_amount,
            }),
          );
          await write(sseEvent("[DONE]"));
        } catch (err) {
          await write(
            sseJson({ type: "error", message: "Internal server error" }),
          );
        } finally {
          writer.close();
        }
      };

      // Run the streaming loop asynchronously
      streamLoop();

      return new Response(readable);
    } catch (err) {
      console.error("Agent Search 500 Error:", err);
      return c.json(
        {
          error: "Internal server error",
          details: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  },
);
