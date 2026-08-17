import { describe, it, expect } from 'vitest';
import { detectBot } from './bots';

describe('detectBot', () => {
  it('should return false for empty or falsy user agent', () => {
    expect(detectBot('')).toEqual({ isBot: false });
    expect(detectBot(undefined as any)).toEqual({ isBot: false });
    expect(detectBot(null as any)).toEqual({ isBot: false });
  });

  it('should return false for regular browser user agents', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0';
    const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15';

    expect(detectBot(chrome)).toEqual({ isBot: false });
    expect(detectBot(firefox)).toEqual({ isBot: false });
    expect(detectBot(safari)).toEqual({ isBot: false });
  });

  it('should detect ad bots', () => {
    const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) AdsBot-Google';
    expect(detectBot(ua)).toEqual({
      isBot: true,
      category: 'ad_bot',
      match: 'AdsBot-Google'
    });
  });

  it('should detect AI assistants', () => {
    const ua = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot';
    expect(detectBot(ua)).toEqual({
      isBot: true,
      category: 'ai_assistant',
      match: 'ChatGPT-User'
    });
  });

  it('should detect AI scrapers', () => {
    const ua = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0; +https://openai.com/gptbot';
    expect(detectBot(ua)).toEqual({
      isBot: true,
      category: 'ai_scraper',
      match: 'GPTBot'
    });
  });

  it('should detect AI search crawlers', () => {
    const ua = 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)';
    expect(detectBot(ua)).toEqual({
      isBot: true,
      category: 'ai_search_crawler',
      match: 'OAI-SearchBot'
    });
  });

  it('should detect data harvesters', () => {
    const ua = 'EmailCollector/1.0';
    expect(detectBot(ua)).toEqual({
      isBot: true,
      category: 'data_harvester',
      match: 'EmailCollector'
    });
  });

  it('should be case-insensitive', () => {
    const ua = 'mozilla/5.0 (compatible; chatgpt-user/1.0)';
    expect(detectBot(ua)).toEqual({
      isBot: true,
      category: 'ai_assistant',
      match: 'ChatGPT-User'
    });
  });
});
