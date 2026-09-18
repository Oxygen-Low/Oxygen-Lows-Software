export interface DefenderConfig {
  apiKey: string;
  apiUrl?: string;
  logOnly?: boolean; // override: always log-only regardless of server config
  offlineMode?: boolean;
  realtime?: boolean; // Enable real-time config updates via SSE streaming (default true)
  syncIntervalMs?: number; // Config sync interval in milliseconds (default 60000ms, 0 to disable)
  excludePaths?: (string | RegExp)[]; // Paths completely bypassed by Defender middleware
  skipBodyScanPaths?: (string | RegExp)[]; // Paths where body injection scanning is skipped (e.g. AI chat, encrypted data)
  autoBlockSensitivePaths?: boolean;
  sensitivePathThreshold?: number;
  sensitivePathWindowSeconds?: number;
  sensitivePathBanDurationSeconds?: number;
  batchLogging?: boolean;
  batchLoggingIntervalSeconds?: number;
  onlyLogThreats?: boolean;
  logUniqueIpsOnly?: boolean;
  uniqueIpCooldownSeconds?: number;
  edgeMode?: boolean; // Set true in serverless/edge environments (e.g. Cloudflare Workers) to disable persistent background timers
  deferRefresh?: boolean; // Set true to defer initial fetches until request handling or explicit init
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
  | "sql_injection"
  | "shell_injection"
  | "path_traversal"
  | "ssrf"
  | "sensitive_path"
  | "tor"
  | "vpn"
  | "country_block"
  | "ip_block"
  | "bot"
  | "ddos"
  | "rate_limit"
  | "allowed"
  | "threat_bruteforce"
  | "threat_dos"
  | "threat_exploit"
  | "threat_botnet";

export type BotCategory =
  | "ad_bot"
  | "ai_assistant"
  | "ai_scraper"
  | "ai_search_crawler"
  | "data_harvester";

export type ThreatActorCategory =
  "bruteforce" | "http_dos" | "http_exploit" | "botnet";

export interface AppConfig {
  appId: string;
  blockModeEnabled: boolean;
  blockSqlInjection: boolean;
  blockShellInjection: boolean;
  blockPathTraversal: boolean;
  blockSsrf: boolean;
  blockSensitivePaths: boolean;
  autoBlockSensitivePaths: boolean;
  sensitivePathThreshold: number;
  sensitivePathWindowSeconds: number;
  sensitivePathBanDurationSeconds: number;
  blockTor: boolean;
  blockVpn: boolean;
  blockCountries: string[];
  blockIps: string[];
  /** Platform-wide administrator bans enabled for this protected app. */
  blockAdminBannedIps: boolean;
  adminBannedIps: { ip: string; reason: string; bannedAt: string }[];
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
  monitorOutbound: boolean;
  batchLoggingEnabled: boolean;
  batchLoggingIntervalSeconds: number;
  onlyLogThreats: boolean;
  logUniqueIpsOnly: boolean;
  uniqueIpCooldownSeconds: number;
  eventsLimit?: number;
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
