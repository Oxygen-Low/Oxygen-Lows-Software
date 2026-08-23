import { BotCategory } from "../types.js";

export const BOT_SIGNATURES: Record<BotCategory, string[]> = {
  ad_bot: [
    "Mediapartners-Google",
    "AdsBot-Google",
    "AdsBot-Google-Mobile",
    "Adsbot/3.1",
    "facebookexternalhit",
    "FacebookBot",
    "Bingbot",
    "BingPreview",
    "AdIdxBot",
  ],
  ai_assistant: [
    "ChatGPT-User",
    "ChatGPT",
    "Claude-Web",
    "Perplexity-User",
    "YouBot",
    "cohere-ai",
    "MistralAI",
    "DuckAssistBot",
  ],
  ai_scraper: [
    "GPTBot",
    "CCBot",
    "anthropic-ai",
    "ClaudeBot",
    "cohere-ai",
    "Diffbot",
    "Bytespider",
    "PetalBot",
    "Scrapy",
    "Amazonbot",
    "Meta-ExternalAgent",
    "Meta-ExternalFetcher",
    "Timpibot",
    "VelenPublicWebCrawler",
    "Webzio-Extended",
    "Omgilibot",
  ],
  ai_search_crawler: [
    "OAI-SearchBot",
    "Google-Extended",
    "GoogleOther",
    "PerplexityBot",
    "YouBot",
    "Applebot-Extended",
    "Applebot",
  ],
  data_harvester: [
    "EmailCollector",
    "EmailSiphon",
    "EmailWolf",
    "ContactBot",
    "Harvest",
    "WebBandit",
    "WebZIP",
    "Teleport",
    "HTTrack",
    "WebCopier",
    "Xenu",
    "TurnitinBot",
    "zgrab",
  ],
};

const COMPILED_BOT_REGEXES = (
  Object.entries(BOT_SIGNATURES) as [BotCategory, string[]][]
).map(([category, signatures]) => ({
  category,
  regex: new RegExp(
    signatures.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "i",
  ),
  signatures,
}));

export function detectBot(userAgent: string): {
  isBot: boolean;
  category?: BotCategory;
  match?: string;
} {
  if (!userAgent) return { isBot: false };

  for (const { category, regex, signatures } of COMPILED_BOT_REGEXES) {
    const match = userAgent.match(regex);
    if (match) {
      const matchStr = match[0].toLowerCase();
      const original = signatures.find((s) => s.toLowerCase() === matchStr);
      return {
        isBot: true,
        category,
        match: original,
      };
    }
  }

  return { isBot: false };
}
