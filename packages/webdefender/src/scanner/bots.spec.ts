import { describe, it, expect } from 'vitest';
import { detectBot } from './bots.js';

describe('detectBot', () => {
  it('should return isBot false for an empty user agent', () => {
    const result = detectBot('');
    expect(result).toEqual({ isBot: false });
  });

  it('should return isBot false for an undefined user agent', () => {
    // @ts-ignore testing undefined edge case even if typescript normally prevents it
    const result = detectBot(undefined);
    expect(result).toEqual({ isBot: false });
  });

  it('should detect a known bot (AdsBot-Google)', () => {
    const result = detectBot('Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; AdsBot-Google; +http://www.google.com/adsbot.html)');
    expect(result).toEqual({ isBot: true, category: 'ad_bot', match: 'AdsBot-Google' });
  });

  it('should detect an AI assistant bot (ChatGPT-User)', () => {
    const result = detectBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot');
    expect(result).toEqual({ isBot: true, category: 'ai_assistant', match: 'ChatGPT-User' });
  });

  it('should return isBot false for a normal user agent', () => {
    const result = detectBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    expect(result).toEqual({ isBot: false });
  });
});
