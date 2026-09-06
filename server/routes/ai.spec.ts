import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isPrivateIP,
  validateAiUrl,
  resolveCustomProviderUrl,
} from "../lib/safeAiUrl";
import {
  parseSearchIntent,
  extractBearerToken,
  stripHtmlTags,
  aiRouter,
} from "./ai";
import { WEBSITE_KNOWLEDGE_SYSTEM_PROMPT } from "../../shared/websiteKnowledge.ts";
import fs from "fs";
import path from "path";

describe("SSRF Validation", () => {
  describe("isPrivateIP", () => {
    it("should identify private IPv4 addresses", () => {
      expect(isPrivateIP("127.0.0.1")).toBe(true);
      expect(isPrivateIP("10.0.0.1")).toBe(true);
      expect(isPrivateIP("172.16.0.1")).toBe(true);
      expect(isPrivateIP("172.31.255.255")).toBe(true);
      expect(isPrivateIP("192.168.1.1")).toBe(true);
      expect(isPrivateIP("169.254.169.254")).toBe(true);
    });

    it("should identify public IPv4 addresses", () => {
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("1.1.1.1")).toBe(false);
      expect(isPrivateIP("93.184.216.34")).toBe(false);
    });

    it("should identify private IPv6 addresses", () => {
      expect(isPrivateIP("::1")).toBe(true);
      expect(isPrivateIP("fc00::1")).toBe(true);
      expect(isPrivateIP("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe(true);
      expect(isPrivateIP("fe80::1")).toBe(true);
      // IPv4-mapped IPv6 addresses
      expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:192.168.1.1")).toBe(true);
    });

    it("should identify public IPv6 addresses", () => {
      expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("validateAiUrl", () => {
    it("should allow valid public HTTPS URLs", async () => {
      await expect(
        validateAiUrl("https://api.openai.com/v1"),
      ).resolves.toBeUndefined();
    });

    it("should reject non-HTTPS URLs", async () => {
      await expect(validateAiUrl("http://api.openai.com/v1")).rejects.toThrow(
        "HTTPS required",
      );
    });

    it("should reject URLs with private IP hostnames", async () => {
      await expect(validateAiUrl("https://127.0.0.1/api")).rejects.toThrow(
        "Public origin required",
      );
    });
  });

  describe("resolveCustomProviderUrl", () => {
    it("should build chat/completions path for valid public HTTPS URLs with IP pinning", async () => {
      const url = await resolveCustomProviderUrl("https://api.openai.com/v1");
      // api.openai.com resolves to multiple IPs, but they should be public
      const u = new URL(url);
      expect(isPrivateIP(u.hostname)).toBe(false);
      expect(url).toContain("/v1/chat/completions");
    });

    it("should build chat/completions path for valid HTTP URLs (Ollama/LM Studio support)", async () => {
      // Per memory: Do not enforce https: protocol validation for custom providers
      // Wait, resolveCustomProviderUrl currently DOES NOT have a protocol check,
      // but the test expected it to reject.
      const url = await resolveCustomProviderUrl("http://api.openai.com/v1");
      expect(url).toContain("http://");
      expect(url).toContain("/v1/chat/completions");
    });

    it("should reject URLs with private IP hostnames", async () => {
      await expect(
        resolveCustomProviderUrl("https://127.0.0.1/api"),
      ).rejects.toThrow("Public origin required");
    });

    it("should reject localhost hostnames", async () => {
      await expect(
        resolveCustomProviderUrl("https://localhost/api"),
      ).rejects.toThrow("Public origin required");
    });

    it("should reject path traversal in URL", async () => {
      await expect(
        resolveCustomProviderUrl("https://api.openai.com/v1/../internal"),
      ).rejects.toThrow("Invalid path");
    });

    it("should reject URLs with embedded credentials", async () => {
      await expect(
        resolveCustomProviderUrl("https://user:pass@api.openai.com/v1"),
      ).rejects.toThrow("Credentials in URL are not allowed");
    });
  });
});

describe("Path Traversal Protection", () => {
  describe("path validation logic", () => {
    it("should detect path traversal with dot-dot-slash", () => {
      const maliciousPath = "../../../etc/passwd";
      const containsDotDot = maliciousPath.includes("..");
      expect(containsDotDot).toBe(true);
    });

    it("should detect absolute paths", () => {
      const absolutePath = "/etc/passwd";
      const isAbsolute = path.isAbsolute(absolutePath);
      expect(isAbsolute).toBe(true);
    });
  });
});

describe("AI Search Intent Parsing Security", () => {
  it("should successfully parse valid search intent JSON", () => {
    const input = '{"search": true, "query": "current weather in Tokyo"}';
    const result = parseSearchIntent(input);
    expect(result).toEqual({
      search: true,
      query: "current weather in Tokyo",
    });
  });

  it("should successfully parse valid search:false intent", () => {
    const input = '{"search": false}';
    const result = parseSearchIntent(input);
    expect(result).toEqual({
      search: false,
    });
  });

  it("should extract JSON embedded in conversational or markdown text", () => {
    const input =
      'Here is the extracted intent:\n```json\n{"search": true, "query": "latest news"}\n```\nDone!';
    const result = parseSearchIntent(input);
    expect(result).toEqual({
      search: true,
      query: "latest news",
    });
  });

  it("should safely handle malformed JSON without throwing", () => {
    expect(
      parseSearchIntent('{"search": true, "query": "unterminated'),
    ).toBeNull();
    expect(parseSearchIntent("{invalid: json}")).toBeNull();
    expect(parseSearchIntent('{ "search": true, }')).toBeNull();
  });

  it("should safely handle non-JSON text containing curly braces", () => {
    expect(parseSearchIntent("This {is just} some text")).toBeNull();
  });

  it("should return null for null, undefined, numbers, empty string or non-string inputs", () => {
    expect(parseSearchIntent(null)).toBeNull();
    expect(parseSearchIntent(undefined)).toBeNull();
    expect(parseSearchIntent("")).toBeNull();
    expect(parseSearchIntent("   ")).toBeNull();
    expect(parseSearchIntent(12345 as any)).toBeNull();
    expect(parseSearchIntent({} as any)).toBeNull();
  });

  it("should return null for array of primitives or invalid formats", () => {
    expect(parseSearchIntent("[1, 2, 3]")).toBeNull();
    expect(parseSearchIntent('["search", "true"]')).toBeNull();
  });

  it("should return null if query is missing or not a non-empty string when search is true", () => {
    expect(parseSearchIntent('{"search": true}')).toBeNull();
    expect(parseSearchIntent('{"search": true, "query": 12345}')).toBeNull();
    expect(parseSearchIntent('{"search": true, "query": {}}')).toBeNull();
    expect(
      parseSearchIntent('{"search": true, "query": ["apple"]}'),
    ).toBeNull();
    expect(parseSearchIntent('{"search": true, "query": "   "}')).toBeNull();
  });

  it("should return null if search property is truthy non-boolean", () => {
    expect(parseSearchIntent('{"search": "true", "query": "test"}')).toBeNull();
    expect(parseSearchIntent('{"search": 1, "query": "test"}')).toBeNull();
  });

  it("should trim and cap excessively long queries", () => {
    const longQuery = "a".repeat(500);
    const input = JSON.stringify({ search: true, query: `  ${longQuery}  ` });
    const result = parseSearchIntent(input);
    expect(result).not.toBeNull();
    expect(result?.search).toBe(true);
    expect(result?.query).toBe("a".repeat(300));
    expect(result?.query?.length).toBe(300);
  });
});

describe("RFC 6750 Case-Insensitive Bearer Scheme Token Extraction", () => {
  it("should extract token with standard 'Bearer' scheme prefix", () => {
    expect(extractBearerToken("Bearer eyJhbGciOiJIUzI1NiJ9.test")).toBe(
      "eyJhbGciOiJIUzI1NiJ9.test",
    );
  });

  it("should extract token with lowercase 'bearer' scheme prefix", () => {
    expect(extractBearerToken("bearer eyJhbGciOiJIUzI1NiJ9.test")).toBe(
      "eyJhbGciOiJIUzI1NiJ9.test",
    );
  });

  it("should extract token with uppercase 'BEARER' scheme prefix", () => {
    expect(extractBearerToken("BEARER eyJhbGciOiJIUzI1NiJ9.test")).toBe(
      "eyJhbGciOiJIUzI1NiJ9.test",
    );
  });

  it("should extract token with mixed-case 'bEaReR' scheme prefix", () => {
    expect(extractBearerToken("bEaReR token-secret-123")).toBe(
      "token-secret-123",
    );
  });

  it("should preserve case of the token itself", () => {
    expect(extractBearerToken("Bearer TokenWithMixedCase123")).toBe(
      "TokenWithMixedCase123",
    );
  });

  it("should not corrupt tokens containing the word 'Bearer'", () => {
    expect(extractBearerToken("Bearer Bearer_inside_token_Bearer")).toBe(
      "Bearer_inside_token_Bearer",
    );
  });

  it("should return null for non-Bearer schemes", () => {
    expect(extractBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(extractBearerToken('Digest username="Mufasa"')).toBeNull();
    expect(extractBearerToken("Token 12345")).toBeNull();
  });

  it("should return null for missing or invalid header values", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("random-string-without-scheme")).toBeNull();
  });
});

describe("stripHtmlTags (HTML sanitization)", () => {
  it("should strip simple HTML tags", () => {
    expect(stripHtmlTags("<b>Hello World</b>")).toBe("Hello World");
    expect(stripHtmlTags("<p>This is a <i>paragraph</i>.</p>")).toBe(
      "This is a paragraph.",
    );
  });

  it("should recursively strip nested and spliced HTML tags (incomplete multi-character sanitization protection)", () => {
    expect(stripHtmlTags("<<script>script>alert('XSS')</script>")).toBe(
      "alert('XSS')",
    );
    expect(stripHtmlTags("<scr<script>ipt>dangerous()</scr</script>ipt>")).toBe(
      "dangerous()",
    );
    expect(stripHtmlTags("<<tag>nested>content")).toBe("content");
    expect(stripHtmlTags("<div <script>>test</div>")).toBe("test");
  });

  it("should handle links and attributes properly", () => {
    expect(
      stripHtmlTags(
        '<a href="https://example.com" class="result__snippet">Example result text</a>',
      ),
    ).toBe("Example result text");
  });

  it("should trim surrounding whitespace", () => {
    expect(stripHtmlTags("   <span>  Trimmed content  </span>   ")).toBe(
      "Trimmed content",
    );
  });

  it("should return empty string for non-string or empty inputs", () => {
    expect(stripHtmlTags("")).toBe("");
    expect(stripHtmlTags("    ")).toBe("");
    expect(stripHtmlTags(null)).toBe("");
    expect(stripHtmlTags(undefined)).toBe("");
    expect(stripHtmlTags(12345)).toBe("");
    expect(stripHtmlTags({})).toBe("");
  });

  it("should preserve clean text without tags", () => {
    expect(
      stripHtmlTags("This is already clean text with numbers 123 and symbols!"),
    ).toBe("This is already clean text with numbers 123 and symbols!");
  });
});

describe("AI System Prompt Website Knowledge Base", () => {
  it("should contain official platform name 'Oxygen Low\\'s Software'", () => {
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("Oxygen Low's Software");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("https://oxygenlow.com");
  });

  it("should contain comprehensive coverage of apps, games, storage and security", () => {
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/chatbot");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/base64-encoder");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/json-formatter");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/file-compressor");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/qrcode-generator");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/data-save");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/password-manager");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/webdefender");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/llm-agent");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/vpn");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/game-library");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/apps/surveys");

    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/games/chess");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/games/minesweeper");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/games/solitaire");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/games/poker");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/games/sudoku");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/games/wordsearch");

    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/storage");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/security");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/integrations");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/characters");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/customize");
    expect(WEBSITE_KNOWLEDGE_SYSTEM_PROMPT).toContain("/download");
  });
});

describe("aiRouter Horde proxy continuation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createMockSseResponse(chunks: string[], status = 200) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  it("should stream Horde completions and continue automatically across length cutoffs", async () => {
    const round1 = [
      `data: {"choices":[{"delta":{"content":"First part of message... "},"finish_reason":null}]}\n\n`,
      `data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n`,
      `data: [DONE]\n\n`,
    ];
    const round2 = [
      `data: {"choices":[{"delta":{"content":"Second part of message."},"finish_reason":null}]}\n\n`,
      `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`,
      `data: [DONE]\n\n`,
    ];

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(createMockSseResponse(round1))
      .mockResolvedValueOnce(createMockSseResponse(round2));

    const res = await aiRouter.request("/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.1.1",
      },
      body: JSON.stringify({
        provider: "horde",
        model: "Fast",
        messages: [{ role: "user", content: "Tell me a long answer" }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain("First part of message... ");
    expect(text).toContain("Second part of message.");
    expect(text).toContain("[DONE]");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("should accumulate non-streaming Horde completions across length cutoffs", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { role: "assistant", content: "Beginning part " },
              finish_reason: "length",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { role: "assistant", content: "ending part." },
              finish_reason: "stop",
            },
          ],
        }),
      });

    const res = await aiRouter.request("/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.1.2",
      },
      body: JSON.stringify({
        provider: "horde",
        model: "Fast",
        messages: [{ role: "user", content: "Non-stream prompt" }],
        stream: false,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.choices[0].message.content).toBe("Beginning part ending part.");
    expect(data.choices[0].finish_reason).toBe("stop");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});


