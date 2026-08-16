import { BotCategory } from '../types.js';

export const BOT_SIGNATURES: Record<BotCategory, string[]> = {
  ad_bot: ['Mediapartners-Google', 'AdsBot-Google', 'AdsBot-Google-Mobile', 'Adsbot/3.1', 'facebookexternalhit', 'FacebookBot', 'Bingbot', 'BingPreview', 'AdIdxBot'],
  ai_assistant: ['ChatGPT-User', 'Claude-Web', 'Perplexity-User', 'YouBot', 'cohere-ai'],
  ai_scraper: ['GPTBot', 'CCBot', 'anthropic-ai', 'ClaudeBot', 'cohere-ai', 'Diffbot', 'Bytespider', 'PetalBot', 'Scrapy'],
  ai_search_crawler: ['Google-Extended', 'GoogleOther', 'PerplexityBot', 'YouBot', 'Applebot-Extended'],
  data_harvester: ['EmailCollector', 'EmailSiphon', 'EmailWolf', 'ContactBot', 'Harvest', 'WebBandit', 'WebZIP', 'Teleport', 'HTTrack', 'WebCopier', 'Xenu', 'TurnitinBot']
};

export function detectBot(userAgent: string): { isBot: boolean; category?: BotCategory; match?: string } {
  if (!userAgent) return { isBot: false };
  
  for (const [category, signatures] of Object.entries(BOT_SIGNATURES)) {
    for (const signature of signatures) {
      if (userAgent.toLowerCase().includes(signature.toLowerCase())) {
        return { 
          isBot: true, 
          category: category as BotCategory, 
          match: signature 
        };
      }
    }
  }
  
  return { isBot: false };
}
