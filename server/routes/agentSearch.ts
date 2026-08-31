import { Hono } from "hono";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import { queryTable, callRpc } from "../lib/dataStore.ts";

export const agentSearchRouter = new Hono();

export const HORDE_URL = "https://oai.stablehorde.net/v1/chat/completions";
export const HORDE_FAST_MODEL = "google/gemma-4-31b";
export const CLOUDFLARE_SMART_MODEL = "@cf/nvidia/nemotron-3-120b-a12b";

export const HORDE_MODELS_MAP: Record<string, string[]> = {
  TitleGen: ["koboldcpp/Llama-3.2-1B-Instruct"],
  Fast: ["google/gemma-4-31b"],
  Smart: ["koboldcpp/Behemoth-128B-v3b-Q4_K_M"],
};

export function resolveHordeModel(model: string): string {
  return HORDE_MODELS_MAP[model]?.[0] || model;
}

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
  if (!data) return null;
  const msg = data.result || data.choices?.[0]?.message;

  // 1. Check standard OpenAI / Cloudflare tool_calls
  const toolCalls = msg?.tool_calls || data.tool_calls;
  if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    const tc = toolCalls[0];
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

  // 2. Check text content
  let content = "";
  if (typeof msg?.content === "string") {
    content = msg.content.trim();
  } else if (typeof data.content === "string") {
    content = data.content.trim();
  } else if (Array.isArray(data.content)) {
    content = data.content
      .map((c: any) => c.text || "")
      .join("")
      .trim();
  } else if (data.candidates?.[0]?.content?.parts) {
    content = data.candidates[0].content.parts
      .map((p: any) => p.text || "")
      .join("")
      .trim();
  } else if (typeof data.result === "string") {
    content = data.result.trim();
  } else if (data.result?.response) {
    content = data.result.response.trim();
  } else if (typeof data.response === "string") {
    content = data.response.trim();
  }

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

async function callModelProvider({
  provider,
  model,
  messages,
  stream = false,
  tools,
  userId,
  cloudflareId,
  cloudflareToken,
  hordeApiKey,
  signal,
}: {
  provider: string;
  model: string;
  messages: any[];
  stream?: boolean;
  tools?: any[];
  userId?: string;
  cloudflareId?: string;
  cloudflareToken?: string;
  hordeApiKey?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  let integration: any = null;
  if (userId) {
    try {
      const ints = queryTable({
        table: "user_integrations",
        userId,
        filters: [{ field: "provider", operator: "eq", value: provider }],
      });
      if (Array.isArray(ints) && ints[0]) {
        integration = ints[0];
      }
    } catch {}
  }

  const apiKey = integration?.api_key;

  if (
    !apiKey &&
    provider !== "horde" &&
    !provider.includes("horde") &&
    provider !== "cloudflare"
  ) {
    throw new Error(
      `Provider '${provider}' is not configured. Please configure an API key in Integrations.`,
    );
  }

  let targetUrl = "";
  let requestBody: any = { stream, tools };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider === "horde" || provider.includes("horde")) {
    targetUrl = HORDE_URL;
    const actualModel = resolveHordeModel(model);
    requestBody = {
      model: actualModel,
      messages,
      tools,
      temperature: 0.2,
      max_tokens: tools ? 200 : 2048,
    };
    headers["Authorization"] =
      `Bearer ${hordeApiKey || apiKey || "0000000000"}`;
  } else if (provider === "cloudflare") {
    if (!cloudflareId || !cloudflareToken) {
      throw new Error("Cloudflare AI is temporarily unavailable.");
    }
    targetUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareId}/ai/v1/chat/completions`;
    requestBody = {
      model,
      messages,
      stream,
      tools,
    };
    headers["Authorization"] = `Bearer ${cloudflareToken}`;
  } else if (provider === "openai") {
    targetUrl = "https://api.openai.com/v1/chat/completions";
    requestBody = { ...requestBody, model, messages };
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "anthropic") {
    targetUrl = "https://api.anthropic.com/v1/messages";
    const systemMessages = messages.filter((m: any) => m.role === "system");
    const systemContent = systemMessages
      .map((m: any) => m.content)
      .join("\n\n");
    const transformedMessages = messages.filter(
      (m: any) => m.role !== "system",
    );
    requestBody = {
      model,
      messages: transformedMessages,
      max_tokens: tools ? 300 : 4096,
      system: systemContent || undefined,
    };
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider === "google") {
    const action = stream
      ? "streamGenerateContent?alt=sse&"
      : "generateContent?";
    targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}key=${apiKey}`;
    requestBody = {
      systemInstruction: {
        parts: messages
          .filter((m: any) => m.role === "system")
          .map((m: any) => ({ text: m.content })),
      },
      contents: messages
        .filter((m: any) => m.role !== "system")
        .map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      tools: tools
        ? tools.map((t: any) => ({ function_declarations: [t.function] }))
        : undefined,
    };
  } else if (provider === "openrouter") {
    targetUrl = "https://openrouter.ai/api/v1/chat/completions";
    requestBody = { ...requestBody, model, messages };
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "grok") {
    targetUrl = "https://api.x.ai/v1/chat/completions";
    requestBody = { ...requestBody, model, messages };
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    throw new Error(`Unsupported provider '${provider}'.`);
  }

  const res = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `AI provider (${provider}) error: HTTP ${res.status}${errText ? ` - ${errText.slice(0, 100)}` : ""}`,
    );
  }

  return res;
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

      const user = await resolveUserFromToken(token);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

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
        researchModel,
        researchProvider,
        summarizerModel,
        summarizerProvider,
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

      // Resolve user model preferences if not explicitly provided in request body
      let userPrefs: any = {};
      try {
        const prefs = queryTable({
          table: "user_preferences",
          userId: user.id,
        });
        if (Array.isArray(prefs) && prefs[0]) {
          userPrefs = prefs[0];
        }
      } catch {}

      const effectiveResearchModel =
        (typeof researchModel === "string" && researchModel.trim()) ||
        userPrefs.research_agent_default_model ||
        userPrefs.research_agent_model_id ||
        HORDE_FAST_MODEL;

      const effectiveResearchProvider =
        (typeof researchProvider === "string" && researchProvider.trim()) ||
        userPrefs.research_agent_default_provider ||
        userPrefs.research_agent_provider ||
        "horde";

      const effectiveSummarizerModel =
        (typeof summarizerModel === "string" && summarizerModel.trim()) ||
        userPrefs.research_summarizer_default_model ||
        userPrefs.research_summarizer_model_id ||
        CLOUDFLARE_SMART_MODEL;

      const effectiveSummarizerProvider =
        (typeof summarizerProvider === "string" && summarizerProvider.trim()) ||
        userPrefs.research_summarizer_default_provider ||
        userPrefs.research_summarizer_provider ||
        "cloudflare";

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

      if (
        (effectiveResearchProvider === "cloudflare" ||
          (!researchOnly && effectiveSummarizerProvider === "cloudflare")) &&
        (!cloudflareId || !cloudflareToken)
      ) {
        return c.json(
          { error: "Agent search is temporarily unavailable" },
          500,
        );
      }

      if (
        effectiveResearchProvider !== "horde" &&
        !effectiveResearchProvider.includes("horde") &&
        effectiveResearchProvider !== "cloudflare"
      ) {
        let intg = null;
        try {
          const ints = queryTable({
            table: "user_integrations",
            userId: user.id,
            filters: [
              {
                field: "provider",
                operator: "eq",
                value: effectiveResearchProvider,
              },
            ],
          });
          if (Array.isArray(ints) && ints[0]?.api_key) intg = ints[0];
        } catch {}
        if (!intg) {
          return c.json(
            {
              error: `Provider '${effectiveResearchProvider}' is not configured. Please configure an API key in Integrations.`,
            },
            400,
          );
        }
      }

      if (
        !researchOnly &&
        effectiveSummarizerProvider !== "horde" &&
        !effectiveSummarizerProvider.includes("horde") &&
        effectiveSummarizerProvider !== "cloudflare"
      ) {
        let intg = null;
        try {
          const ints = queryTable({
            table: "user_integrations",
            userId: user.id,
            filters: [
              {
                field: "provider",
                operator: "eq",
                value: effectiveSummarizerProvider,
              },
            ],
          });
          if (Array.isArray(ints) && ints[0]?.api_key) intg = ints[0];
        } catch {}
        if (!intg) {
          return c.json(
            {
              error: `Provider '${effectiveSummarizerProvider}' is not configured. Please configure an API key in Integrations.`,
            },
            400,
          );
        }
      }

      // Check if user has Horde integration key
      let hordeApiKey = "0000000000";
      try {
        const hordeInts = queryTable({
          table: "user_integrations",
          userId: user.id,
          filters: [{ field: "provider", operator: "eq", value: "horde" }],
        });
        if (Array.isArray(hordeInts) && hordeInts[0]?.api_key) {
          hordeApiKey = hordeInts[0].api_key;
        }
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

      // Research prompt for tool decisions
      const researchMessages: any[] = [
        {
          role: "system",
          content: `You are an autonomous research agent. Your goal is to gather facts from the web to answer the user's query up to a 4000 total context token budget.

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
        // 1. Tool calling research loop (up to 100 calls or 4000 total tokens)
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
            const res = await callModelProvider({
              provider: effectiveResearchProvider,
              model: effectiveResearchModel,
              messages: researchMessages,
              tools: SEARCH_TOOLS,
              userId: user.id,
              cloudflareId,
              cloudflareToken,
              hordeApiKey,
              signal: AbortSignal.timeout(10000),
            });
            const data = await res.json();
            action = parseHordeAction(data);
          } catch {
            // If model call times out or fails, fallback to direct query search on first round
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

          researchMessages.push({
            role: "assistant",
            content: JSON.stringify({ action: action.tool, ...action.args }),
          });
          researchMessages.push({
            role: "user",
            content: `Tool result for ${action.tool}:\n${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}\n\nNext action? (Respond with JSON action or {"action": "done"})`,
          });

          // Prune older history to stay within 4000 context token limits across 100 calls
          if (researchMessages.length > 16) {
            researchMessages.splice(2, researchMessages.length - 16);
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

        // 2. Synthesis step
        const synthMsgs = buildSynthesisMessages();
        let synthRes: Response;
        try {
          synthRes = await callModelProvider({
            provider: effectiveSummarizerProvider,
            model: effectiveSummarizerModel,
            messages: synthMsgs,
            stream: false,
            userId: user.id,
            cloudflareId,
            cloudflareToken,
            hordeApiKey,
            signal: AbortSignal.timeout(60000),
          });
        } catch (e: any) {
          return c.json({ error: e?.message || "Search synthesis error" }, 502);
        }

        const synthData = await synthRes.json();
        let finalResult = "";
        const finalMsg = synthData.result || synthData.choices?.[0]?.message;
        if (typeof finalMsg?.content === "string") {
          finalResult = finalMsg.content;
        } else if (typeof synthData.content === "string") {
          finalResult = synthData.content;
        } else if (Array.isArray(synthData.content)) {
          finalResult = synthData.content
            .map((item: any) => item.text || "")
            .join("");
        } else if (synthData.candidates?.[0]?.content?.parts) {
          finalResult = synthData.candidates[0].content.parts
            .map((p: any) => p.text || "")
            .join("");
        } else if (typeof synthData.result === "string") {
          finalResult = synthData.result;
        } else if (synthData.result?.response) {
          finalResult = synthData.result.response;
        } else if (typeof synthData.response === "string") {
          finalResult = synthData.response;
        }

        let p_amount = 0;
        if (effectiveSummarizerProvider === "cloudflare") {
          const usage = synthData.usage || {};
          const synthInputTokens =
            usage.prompt_tokens ||
            Math.floor(JSON.stringify(synthMsgs).length / 4);
          const synthOutputTokens =
            usage.completion_tokens || Math.floor(finalResult.length / 4);
          const totalTokens = synthInputTokens + synthOutputTokens;
          p_amount = Math.max(10, Math.floor(totalTokens / 10));

          const rpcRes = callRpc("spend_points", { p_amount }, user.id);
          if (!rpcRes || !rpcRes.success) {
            console.error("Agent search points deduction failed", rpcRes);
          }
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
              message: "Connecting to research agent...",
            }),
          );

          // 1. Tool execution loop (up to 100 calls or 4000 total tokens)
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
              const res = await callModelProvider({
                provider: effectiveResearchProvider,
                model: effectiveResearchModel,
                messages: researchMessages,
                tools: SEARCH_TOOLS,
                userId: user.id,
                cloudflareId,
                cloudflareToken,
                hordeApiKey,
                signal: AbortSignal.timeout(10000),
              });
              const data = await res.json();
              action = parseHordeAction(data);
            } catch (modelErr) {
              console.warn(
                "Research model call timed out or failed, falling back to direct search",
                modelErr,
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

            researchMessages.push({
              role: "assistant",
              content: JSON.stringify({ action: action.tool, ...action.args }),
            });
            researchMessages.push({
              role: "user",
              content: `Tool result for ${action.tool}:\n${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}\n\nNext action? (Respond with JSON action or {"action": "done"})`,
            });

            // Prune older history to stay within 4000 context token limits across 100 calls
            if (researchMessages.length > 16) {
              researchMessages.splice(2, researchMessages.length - 16);
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

          // 2. Final Synthesis
          await write(
            sseJson({
              type: "status",
              message: "Synthesizing comprehensive final answer...",
            }),
          );

          const synthMsgs = buildSynthesisMessages();
          let streamRes: Response;
          try {
            streamRes = await callModelProvider({
              provider: effectiveSummarizerProvider,
              model: effectiveSummarizerModel,
              messages: synthMsgs,
              stream: true,
              userId: user.id,
              cloudflareId,
              cloudflareToken,
              hordeApiKey,
              signal: AbortSignal.timeout(60000),
            });
          } catch (e: any) {
            await write(
              sseJson({
                type: "error",
                message: e?.message || "Search synthesis error",
              }),
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
                    parsed.delta?.text ||
                    parsed.candidates?.[0]?.content?.parts?.[0]?.text ||
                    "";
                  if (token) {
                    finalContent += token;
                    await write(sseJson({ type: "delta", content: token }));
                  }
                } catch (e) {}
              }
            }
          }

          let p_amount = 0;
          if (effectiveSummarizerProvider === "cloudflare") {
            const synthInputTokens = Math.floor(
              JSON.stringify(synthMsgs).length / 4,
            );
            const synthOutputTokens = Math.floor(finalContent.length / 4);
            const estimatedTokens = synthInputTokens + synthOutputTokens;
            p_amount = Math.max(10, Math.floor(estimatedTokens / 10));

            const rpcRes = callRpc("spend_points", { p_amount }, user.id);
            if (!rpcRes || !rpcRes.success) {
              console.error("Agent search points deduction failed", rpcRes);
            }
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
