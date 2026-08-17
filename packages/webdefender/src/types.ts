export interface DefenderConfig {
  apiKey: string;
  apiUrl?: string;
  logOnly?: boolean; // override: always log-only regardless of server config
  offlineMode?: boolean;
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
  | 'tor' | 'country_block' | 'bot' | 'ddos' | 'rate_limit' | 'allowed'
  | 'threat_bruteforce' | 'threat_dos' | 'threat_exploit' | 'threat_botnet';

export type BotCategory = 
  | 'ad_bot' | 'ai_assistant' | 'ai_scraper' | 'ai_search_crawler' | 'data_harvester';

export type ThreatActorCategory =
  | 'bruteforce' | 'http_dos' | 'http_exploit' | 'botnet';

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
  blockBruteforce: boolean;
  blockHttpDos: boolean;
  blockHttpExploit: boolean;
  blockBotnets: boolean;
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
