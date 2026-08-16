export interface DefenderConfig {
  apiKey: string;
  apiUrl?: string; // defaults to 'https://oxygenlow.com'
  logOnly?: boolean; // override: always log-only regardless of server config
  onBlocked?: (event: BlockedEvent) => void;
  onError?: (error: Error) => void;
}

export interface BlockedEvent {
  type: EventType;
  ip: string;
  method: string;
  path: string;
  reason: string;
  blocked: boolean;
}

export type EventType = 
  | 'sql_injection' | 'shell_injection' | 'path_traversal' | 'ssrf'
  | 'tor' | 'country_block' | 'bot' | 'ddos' | 'rate_limit' | 'allowed';

export type BotCategory = 
  | 'ad_bot' | 'ai_assistant' | 'ai_scraper' | 'ai_search_crawler' | 'data_harvester';

export interface AppConfig {
  appId: string;
  blockModeEnabled: boolean;
  blockSqlInjection: boolean;
  blockShellInjection: boolean;
  blockPathTraversal: boolean;
  blockSsrf: boolean;
  blockTor: boolean;
  blockCountries: string[];
  blockAdBots: boolean;
  blockAiAssistants: boolean;
  blockAiScrapers: boolean;
  blockAiSearchCrawlers: boolean;
  blockDataHarvesters: boolean;
  ddosProtection: boolean;
  ddosThresholdRpm: number;
  routes: RouteConfig[];
}

export interface RouteConfig {
  id: string;
  method: string;
  path: string;
  rateLimitEnabled: boolean;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
}

export interface OutboundConnection {
  host: string;
  port: number;
  protocol: string;
}
