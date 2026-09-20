import {
  DefenderConfig,
  AppConfig,
  BlockedEvent,
  EventType,
  OutboundConnection,
  RouteConfig,
  RateLimitInfo,
} from "./types.js";
import { TorDetector } from "./tor.js";
import { VpnDetector, matchesIpOrCidr } from "./vpn.js";
import { ThreatActorDetector } from "./threatActors.js";
import { OutboundMonitor } from "./outbound.js";
import { RateLimiter } from "./rateLimiter.js";
import { discoverRoutes } from "./routeDiscovery.js";
import { scanRequest } from "./scanner/injection.js";
import { detectBot } from "./scanner/bots.js";
import { getCountryCode } from "./scanner/geo.js";
import { detectSensitivePath } from "./scanner/sensitivePaths.js";

export interface IncomingRequest {
  ip: string;
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  body: string;
  headers: Record<string, string | string[] | undefined>;
  userAgent: string;
  skipBodyScan?: boolean;
}

function isPathMatch(path: string, patterns?: (string | RegExp)[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => {
    if (typeof p === "string") return path.startsWith(p);
    if (p instanceof RegExp) return p.test(path);
    return false;
  });
}

export interface RequestResult {
  blocked: boolean;
  statusCode?: number;
  reason?: string;
  eventType?: EventType;
  rateLimitInfo?: RateLimitInfo;
  logPromise?: Promise<any>;
}

class RouteTrieNode {
  children = new Map<string, RouteTrieNode>();
  routes: RouteConfig[] = [];
}

export class DefenderClient {
  private config: DefenderConfig;
  private appConfig: AppConfig | null = null;
  private exactRoutes = new Map<string, Map<string, RouteConfig>>();
  private prefixRoutes = new Map<string, RouteTrieNode>();
  private torDetector: TorDetector;
  private vpnDetector: VpnDetector;
  private threatActorDetector: ThreatActorDetector;
  private outboundMonitor: OutboundMonitor;
  private rateLimiter: RateLimiter;
  private temporaryBans = new Map<string, { expiresAt: number; reason: string }>();
  private sensitivePathAttempts = new Map<string, number[]>();
  private batchBuffer: any[] = [];
  private batchTimer?: ReturnType<typeof setTimeout>;
  private uniqueIpCache = new Map<string, number>();
  private uniqueIpPruneInterval?: ReturnType<typeof setInterval>;
  private apiUrl: string;
  private isInitialized = false;
  private configSyncIntervalId?: ReturnType<typeof setInterval>;
  private realtimeAbortController?: AbortController;
  private realtimeReconnectTimeout?: ReturnType<typeof setTimeout>;

  constructor(config: DefenderConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || "https://oxygenlow.com";
    const autoRefresh = !config.deferRefresh && !config.edgeMode;
    this.torDetector = new TorDetector({ autoRefresh });
    this.vpnDetector = new VpnDetector({ autoRefresh });
    this.threatActorDetector = new ThreatActorDetector({ autoRefresh });
    this.rateLimiter = new RateLimiter({ autoCleanup: autoRefresh });
    this.outboundMonitor = new OutboundMonitor(
      (conn) => this.reportOutbound(conn),
      new URL(this.apiUrl).hostname,
    );
    if (autoRefresh) {
      this.uniqueIpPruneInterval = setInterval(() => {
        this.pruneUniqueIpCache();
      }, 60000);
      if (typeof this.uniqueIpPruneInterval.unref === "function") {
        this.uniqueIpPruneInterval.unref();
      }
    }
  }

  private buildRouteCache(routes: RouteConfig[]) {
    this.exactRoutes.clear();
    this.prefixRoutes.clear();

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const method = (route.method || "").toUpperCase();

      let exactMap = this.exactRoutes.get(method);
      if (!exactMap) {
        exactMap = new Map();
        this.exactRoutes.set(method, exactMap);
      }
      exactMap.set(route.path, route);

      const prefix = route.path.replace(/:\w+/g, "");

      let root = this.prefixRoutes.get(method);
      if (!root) {
        root = new RouteTrieNode();
        this.prefixRoutes.set(method, root);
      }

      let node = root;
      for (const char of prefix) {
        let child = node.children.get(char);
        if (!child) {
          child = new RouteTrieNode();
          node.children.set(char, child);
        }
        node = child;
      }
      node.routes.push(route);
    }
  }

  private normalizeConfig(raw: any): AppConfig {
    const cfg = raw.config || {};
    const routes = (raw.routes || []).map((r: any) => ({
      id: r.id,
      method: r.method,
      path: r.path,
      rateLimitEnabled: r.rate_limit_enabled ?? false,
      rateLimitRequests: r.rate_limit_requests ?? 100,
      rateLimitWindowSeconds: r.rate_limit_window_seconds ?? 60,
    }));

    this.buildRouteCache(routes);

    return {
      appId: raw.id,
      blockModeEnabled: raw.block_mode_enabled ?? false,
      blockSqlInjection: cfg.block_sql_injection ?? true,
      blockShellInjection: cfg.block_shell_injection ?? true,
      blockPathTraversal: cfg.block_path_traversal ?? true,
      blockSsrf: cfg.block_ssrf ?? true,
      blockXss: cfg.block_xss ?? true,
      blockNosqlInjection: cfg.block_nosql_injection ?? true,
      blockPrototypePollution: cfg.block_prototype_pollution ?? true,
      blockSensitivePaths: cfg.block_sensitive_paths ?? true,
      autoBlockSensitivePaths:
        this.config.autoBlockSensitivePaths ??
        cfg.auto_block_sensitive_paths ??
        true,
      sensitivePathThreshold:
        this.config.sensitivePathThreshold ??
        cfg.sensitive_path_threshold ??
        3,
      sensitivePathWindowSeconds:
        this.config.sensitivePathWindowSeconds ??
        cfg.sensitive_path_window_seconds ??
        20,
      sensitivePathBanDurationSeconds:
        this.config.sensitivePathBanDurationSeconds ??
        cfg.sensitive_path_ban_duration_seconds ??
        600,
      blockTor: cfg.block_tor ?? true,
      blockVpn: cfg.block_vpn ?? true,
      blockCountries: cfg.block_countries ?? [],
      blockIps: cfg.block_ips ?? [],
      allowlistIps: Array.isArray(cfg.allowlist_ips) ? cfg.allowlist_ips : [],
      blockAdminBannedIps: cfg.block_admin_banned_ips ?? true,
      adminBannedIps: Array.isArray(raw.admin_banned_ips)
        ? raw.admin_banned_ips.map((ban: any) => ({
            ip: ban.ip,
            reason: ban.reason,
            bannedAt: ban.banned_at,
          }))
        : [],
      blockAdBots: cfg.block_ad_bots ?? false,
      blockAiAssistants: cfg.block_ai_assistants ?? false,
      blockAiScrapers: cfg.block_ai_scrapers ?? true,
      blockAiSearchCrawlers: cfg.block_ai_search_crawlers ?? false,
      blockDataHarvesters: cfg.block_data_harvesters ?? true,
      blockBruteforce: cfg.block_bruteforce ?? true,
      blockHttpDos: cfg.block_http_dos ?? true,
      blockHttpExploit: cfg.block_http_exploit ?? true,
      blockBotnets: cfg.block_botnets ?? true,
      ddosProtection: cfg.ddos_protection ?? true,
      ddosThresholdRpm: cfg.ddos_threshold_rpm ?? 1000,
      monitorOutbound: cfg.monitor_outbound ?? true,
      batchLoggingEnabled:
        this.config.batchLogging ??
        cfg.batch_logging_enabled ??
        true,
      batchLoggingIntervalSeconds:
        this.config.batchLoggingIntervalSeconds ??
        cfg.batch_logging_interval_seconds ??
        20,
      onlyLogThreats:
        this.config.onlyLogThreats ??
        cfg.only_log_threats ??
        false,
      logUniqueIpsOnly:
        this.config.logUniqueIpsOnly ??
        cfg.log_unique_ips_only ??
        false,
      uniqueIpCooldownSeconds:
        this.config.uniqueIpCooldownSeconds ??
        cfg.unique_ip_cooldown_seconds ??
        300,
      eventsLimit: cfg.events_limit ?? 50,
      routes,
    };
  }

  async init(app?: any): Promise<void> {
    if (this.isInitialized) return;

    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      this.appConfig = this.normalizeConfig({
        block_mode_enabled: true,
        config: {},
      });
      this.isInitialized = true;
      return;
    }

    try {
      // 1. Validate API key
      const response = await fetch(`${this.apiUrl}/api/webdefender/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to verify API key: ${response.statusText}`);
      }

      this.appConfig = this.normalizeConfig(await response.json());

      // 3. Register routes if app is provided
      if (app && this.appConfig) {
        const routes = discoverRoutes(app);
        if (routes.length > 0) {
          try {
            await fetch(`${this.apiUrl}/api/webdefender/register`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.config.apiKey}`,
              },
              body: JSON.stringify({ routes }),
            });

            // Refetch config to get the populated route IDs and rate limits
            const verifyRes = await fetch(
              `${this.apiUrl}/api/webdefender/verify`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${this.config.apiKey}`,
                },
              },
            );
            if (verifyRes.ok) {
              this.appConfig = this.normalizeConfig(await verifyRes.json());
            }
          } catch (e) {
            console.error("[Defender] Route registration failed:", e);
          }
        }
      }

      // 5. Install outbound monitor if enabled
      this.syncOutboundMonitor();
      this.isInitialized = true;

      // In edge/deferred mode, start detectors' initial data fetch now that we are initialized
      if (this.config.deferRefresh || this.config.edgeMode) {
        this.torDetector.startRefreshInterval();
        this.vpnDetector.startRefreshInterval();
        this.threatActorDetector.startRefreshInterval();
      }

      // 6. Start real-time config stream and periodic sync (disabled in edgeMode)
      if (!this.config.edgeMode) {
        this.startRealtimeSync();
        this.startConfigSync();
      }
    } catch (error) {
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
      console.error("[Defender] Initialization failed:", error);
    }
  }

  private syncOutboundMonitor(): void {
    if (this.appConfig?.monitorOutbound !== false) {
      this.outboundMonitor.install();
    } else {
      this.outboundMonitor.uninstall();
    }
  }

  private startRealtimeSync(): void {
    if (this.config.realtime === false) return;
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) return;

    this.stopRealtimeSync();

    this.realtimeAbortController = new AbortController();
    const signal = this.realtimeAbortController.signal;

    (async () => {
      try {
        const response = await fetch(
          `${this.apiUrl}/api/webdefender/config-stream`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              Accept: "text/event-stream",
            },
            signal,
          },
        );

        if (!response.ok || !response.body) {
          throw new Error(`SSE stream failed: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "message";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event:")) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith("data:")) {
              const dataStr = trimmed.slice(5).trim();
              if (currentEvent === "config" && dataStr) {
                try {
                  const rawConfig = JSON.parse(dataStr);
                  this.appConfig = this.normalizeConfig(rawConfig);
                  this.syncOutboundMonitor();
                } catch (_) {}
              }
              currentEvent = "message";
            }
          }
        }
      } catch (_) {
        if (signal.aborted) return;
        this.realtimeReconnectTimeout = setTimeout(() => {
          if (!this.realtimeAbortController?.signal.aborted) {
            this.startRealtimeSync();
          }
        }, 5000);
      }
    })();
  }

  private stopRealtimeSync(): void {
    if (this.realtimeReconnectTimeout) {
      clearTimeout(this.realtimeReconnectTimeout);
      this.realtimeReconnectTimeout = undefined;
    }
    if (this.realtimeAbortController) {
      this.realtimeAbortController.abort();
      this.realtimeAbortController = undefined;
    }
  }

  private startConfigSync(): void {
    if (this.configSyncIntervalId) {
      clearInterval(this.configSyncIntervalId);
      this.configSyncIntervalId = undefined;
    }
    const syncInterval =
      this.config.syncIntervalMs !== undefined
        ? this.config.syncIntervalMs
        : 60000;
    if (syncInterval > 0) {
      this.configSyncIntervalId = setInterval(
        () => this.refreshConfig(),
        syncInterval,
      );
    }
  }

  async refreshConfig(): Promise<void> {
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/webdefender/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (response.ok) {
        this.appConfig = this.normalizeConfig(await response.json());
        this.syncOutboundMonitor();
      }
    } catch (error) {
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
    }
  }

  private reportOutbound(conn: OutboundConnection) {
    if (this.appConfig?.monitorOutbound === false) {
      return;
    }

    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }

    fetch(`${this.apiUrl}/api/webdefender/outbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(conn),
    }).catch(() => {});
  }

  private pruneUniqueIpCache(): void {
    if (this.uniqueIpCache.size === 0) return;
    const cooldownMs = (this.appConfig?.uniqueIpCooldownSeconds ?? 300) * 1000;
    const now = Date.now();
    for (const [ip, ts] of this.uniqueIpCache.entries()) {
      if (now - ts > cooldownMs) {
        this.uniqueIpCache.delete(ip);
      }
    }
    if (this.uniqueIpCache.size > 50000) {
      const excess = this.uniqueIpCache.size - 50000;
      let count = 0;
      for (const key of this.uniqueIpCache.keys()) {
        this.uniqueIpCache.delete(key);
        count++;
        if (count >= excess) break;
      }
    }
  }

  hasPendingLogs(): boolean {
    return this.batchBuffer.length > 0;
  }

  async flushBatchAsync(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    if (this.batchBuffer.length === 0) return;

    const eventsToSend = this.batchBuffer;
    this.batchBuffer = [];

    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }

    try {
      await fetch(`${this.apiUrl}/api/webdefender/event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(eventsToSend),
      });
    } catch (_) {}
  }

  flushBatch(): void {
    this.flushBatchAsync().catch(() => {});
  }

  private logEvent(event: BlockedEvent, req?: Partial<IncomingRequest>) {
    if (this.config.onBlocked && event.blocked) {
      this.config.onBlocked(event);
    }

    // 1. Only log threats check
    const isThreat = event.type !== "allowed" || event.blocked;
    if (this.appConfig?.onlyLogThreats && !isThreat) {
      return;
    }

    // 2. Only log unique IPs check (with cooldown)
    const cleanIp = (event.ip || "").trim().toLowerCase();
    if (this.appConfig?.logUniqueIpsOnly && cleanIp) {
      const now = Date.now();
      const cooldownMs = (this.appConfig.uniqueIpCooldownSeconds || 300) * 1000;
      if (!isThreat) {
        const lastLogged = this.uniqueIpCache.get(cleanIp);
        if (lastLogged && now - lastLogged < cooldownMs) {
          return;
        }
        this.uniqueIpCache.set(cleanIp, now);
      } else {
        this.uniqueIpCache.set(cleanIp, now);
      }
    }

    const detectedCountry =
      getCountryCode(req?.headers) ||
      (typeof req?.query?.countryCode === "string"
        ? req.query.countryCode
        : null);

    const payload = {
      eventType: event.type,
      ip: event.ip,
      countryCode: detectedCountry || null,
      method: event.method,
      path: event.path,
      blocked: event.blocked,
      requestBodySnippet: req?.body ? req.body.substring(0, 500) : null,
    };

    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }

    // 3. Batch logging
    if (this.appConfig?.batchLoggingEnabled) {
      this.batchBuffer.push(payload);
      if (this.batchBuffer.length >= 500) {
        return this.flushBatchAsync();
      } else if (this.config.edgeMode) {
        // In edge mode (e.g. Cloudflare Workers) there are no persistent
        // background timers. Flush immediately and return the promise so the
        // caller can pass it to ctx.waitUntil for non-blocking telemetry.
        return this.flushBatchAsync();
      } else if (!this.batchTimer) {
        const intervalMs =
          Math.max(1, this.appConfig.batchLoggingIntervalSeconds || 20) * 1000;
        this.batchTimer = setTimeout(() => {
          this.batchTimer = undefined;
          this.flushBatch();
        }, intervalMs);
        if (typeof this.batchTimer.unref === "function") {
          this.batchTimer.unref();
        }
      }
      return;
    }

    return fetch(`${this.apiUrl}/api/webdefender/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  private getMatchingRoute(
    method: string,
    path: string,
  ): RouteConfig | undefined {
    if (!this.appConfig || !this.appConfig.routes) return undefined;

    method = method.toUpperCase();

    const exactMap = this.exactRoutes.get(method);
    if (exactMap) {
      const exact = exactMap.get(path);
      if (exact) return exact;
    }

    const root = this.prefixRoutes.get(method);
    if (root) {
      let node: RouteTrieNode | undefined = root;
      let bestMatch: RouteConfig | undefined = undefined;

      if (node.routes.length > 0) {
        bestMatch = node.routes[0];
      }

      for (const char of path) {
        node = node.children.get(char);
        if (!node) break;
        if (node.routes.length > 0) {
          bestMatch = node.routes[0];
        }
      }

      return bestMatch;
    }

    return undefined;
  }

  async handleRequest(req: IncomingRequest): Promise<RequestResult> {
    if (isPathMatch(req.path, this.config.excludePaths)) {
      return { blocked: false, eventType: "allowed" };
    }

    if (!this.appConfig) {
      return { blocked: false, eventType: "allowed" };
    }

    const { ip, method, path, query, body, headers, userAgent } = req;
    const cleanIp = (ip || "").trim().toLowerCase();

    // -1. IP Allowlist (Trusted IPs & CIDR subnets bypass all WAF rules, bots, and rate limits)
    const combinedAllowlist = [
      ...(this.config.allowlistIps || []),
      ...(this.appConfig.allowlistIps || []),
    ];
    if (cleanIp && matchesIpOrCidr(cleanIp, combinedAllowlist)) {
      return { blocked: false, eventType: "allowed" };
    }

    let isBlocked = false;
    let blockReason = "";
    let eventType: EventType = "allowed";

    const fail = (type: EventType, reason: string) => {
      eventType = type;
      blockReason = reason;
      isBlocked = true;
    };

    // 0a. Temporary IP bans (e.g. repeated sensitive path probe violations)
    if (!isBlocked && cleanIp) {
      const ban = this.temporaryBans.get(cleanIp);
      if (ban) {
        if (Date.now() < ban.expiresAt) {
          fail("ip_block", ban.reason);
        } else {
          this.temporaryBans.delete(cleanIp);
        }
      }
    }

    // 0. Platform-wide administrator IP bans (supports CIDR notation)
    if (
      !isBlocked &&
      this.appConfig.blockAdminBannedIps &&
      this.appConfig.adminBannedIps.length > 0 &&
      cleanIp
    ) {
      const bannedIpsList = this.appConfig.adminBannedIps.map((item) => item.ip);
      if (matchesIpOrCidr(cleanIp, bannedIpsList)) {
        const matchedBan = this.appConfig.adminBannedIps.find((item) =>
          matchesIpOrCidr(cleanIp, [item.ip]),
        );
        fail(
          "ip_block",
          `Administrator-banned IP: ${matchedBan?.reason || "Restricted by platform admin"}`,
        );
      }
    }

    // 1. Individual IP & CIDR Check
    if (
      !isBlocked &&
      this.appConfig.blockIps &&
      this.appConfig.blockIps.length > 0 &&
      cleanIp
    ) {
      if (matchesIpOrCidr(cleanIp, this.appConfig.blockIps)) {
        fail("ip_block", `IP blocked: ${ip}`);
      }
    }

    // 1. IP Geo Check (via CDN headers)
    if (
      !isBlocked &&
      this.appConfig.blockCountries &&
      this.appConfig.blockCountries.length > 0
    ) {
      const countryCode = getCountryCode(headers);
      if (countryCode && this.appConfig.blockCountries.includes(countryCode)) {
        fail("country_block", `Country blocked: ${countryCode}`);
      }
    }

    // 2. TOR Check
    if (!isBlocked && this.appConfig.blockTor) {
      if (this.torDetector.isTorExitNode(ip)) {
        fail("tor", "TOR exit node detected");
      }
    }

    // 2b. Known VPN Check
    if (!isBlocked && this.appConfig.blockVpn) {
      if (this.vpnDetector.isVpn(ip)) {
        fail("vpn", "VPN connection detected");
      }
    }

    // 3. Known Threat Actor Check
    if (!isBlocked) {
      const threatActor = this.threatActorDetector.checkThreatActor(ip);
      if (threatActor) {
        let shouldBlock = false;
        let eventType: EventType = "threat_botnet";
        switch (threatActor.category) {
          case "bruteforce":
            shouldBlock = this.appConfig.blockBruteforce;
            eventType = "threat_bruteforce";
            break;
          case "http_dos":
            shouldBlock = this.appConfig.blockHttpDos;
            eventType = "threat_dos";
            break;
          case "http_exploit":
            shouldBlock = this.appConfig.blockHttpExploit;
            eventType = "threat_exploit";
            break;
          case "botnet":
            shouldBlock = this.appConfig.blockBotnets;
            eventType = "threat_botnet";
            break;
        }
        if (shouldBlock) {
          const categoryLabels: Record<string, string> = {
            bruteforce: "Bruteforce attacker",
            http_dos: "HTTP DoS attacker",
            http_exploit: "HTTP Exploit attacker",
            botnet: "Botnet Actor",
          };
          fail(
            eventType,
            `Known threat actor detected: ${categoryLabels[threatActor.category] || threatActor.category}`,
          );
        }
      }
    }

    // 4. Bot Detection
    if (!isBlocked) {
      const botResult = detectBot(userAgent);
      if (botResult.isBot && botResult.category) {
        let blockBot = false;
        switch (botResult.category) {
          case "ad_bot":
            blockBot = this.appConfig.blockAdBots;
            break;
          case "ai_assistant":
            blockBot = this.appConfig.blockAiAssistants;
            break;
          case "ai_scraper":
            blockBot = this.appConfig.blockAiScrapers;
            break;
          case "ai_search_crawler":
            blockBot = this.appConfig.blockAiSearchCrawlers;
            break;
          case "data_harvester":
            blockBot = this.appConfig.blockDataHarvesters;
            break;
        }
        if (blockBot) {
          fail(
            "bot",
            `Blocked bot category: ${botResult.category} (${botResult.match})`,
          );
        }
      }
    }

    // 5. Injection Scanning
    if (!isBlocked) {
      const skipBody =
        req.skipBodyScan ||
        isPathMatch(path, this.config.skipBodyScanPaths);
      const scanBody = skipBody ? "" : body;
      const scanRes = scanRequest(method, path, query, scanBody, headers);
      for (const threat of scanRes.threats) {
        let shouldBlock = false;
        switch (threat.type) {
          case "sql_injection":
            shouldBlock = this.appConfig.blockSqlInjection;
            break;
          case "shell_injection":
            shouldBlock = this.appConfig.blockShellInjection;
            break;
          case "path_traversal":
            shouldBlock = this.appConfig.blockPathTraversal;
            break;
          case "ssrf":
            shouldBlock = this.appConfig.blockSsrf;
            break;
          case "xss":
            shouldBlock = this.appConfig.blockXss;
            break;
          case "nosql_injection":
            shouldBlock = this.appConfig.blockNosqlInjection;
            break;
          case "prototype_pollution":
            shouldBlock = this.appConfig.blockPrototypePollution;
            break;
        }

        if (shouldBlock) {
          fail(
            threat.type,
            `Threat detected: ${threat.type} (pattern: ${threat.pattern})`,
          );
          break;
        }
      }
    }

    // 5b. Sensitive Path Probe Detection
    if (!isBlocked && this.appConfig.blockSensitivePaths) {
      const sensitiveMatch = detectSensitivePath(path);
      if (sensitiveMatch) {
        fail(
          "sensitive_path",
          `Sensitive path probe detected: ${sensitiveMatch.path} (category: ${sensitiveMatch.category})`,
        );

        if (this.appConfig.autoBlockSensitivePaths && cleanIp) {
          const now = Date.now();
          const windowMs =
            (this.appConfig.sensitivePathWindowSeconds ?? 20) * 1000;
          const threshold = this.appConfig.sensitivePathThreshold ?? 3;
          const banDurationSeconds =
            this.appConfig.sensitivePathBanDurationSeconds ?? 600;

          const recentAttempts = (
            this.sensitivePathAttempts.get(cleanIp) || []
          ).filter((ts) => now - ts <= windowMs);
          recentAttempts.push(now);

          if (recentAttempts.length >= threshold) {
            const durationMinutes = Math.round(banDurationSeconds / 60);
            const durationStr =
              durationMinutes >= 1
                ? `${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`
                : `${banDurationSeconds} seconds`;
            this.temporaryBans.set(cleanIp, {
              expiresAt: now + banDurationSeconds * 1000,
              reason: `IP temporarily blocked for ${durationStr}: repeated sensitive path attempts`,
            });
            this.sensitivePathAttempts.delete(cleanIp);
          } else {
            this.sensitivePathAttempts.set(cleanIp, recentAttempts);
          }
        }
      }
    }

    let rateLimitInfo: RateLimitInfo | undefined;

    // 6. Global DDoS Check
    if (
      !isBlocked &&
      this.appConfig.ddosProtection &&
      this.appConfig.ddosThresholdRpm > 0
    ) {
      const { allowed, resetAt } = this.rateLimiter.check(
        `global:${ip}`,
        this.appConfig.ddosThresholdRpm,
        60,
      );
      if (!allowed) {
        fail("ddos", "Global DDoS rate limit exceeded");
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((resetAt - Date.now()) / 1000),
        );
        rateLimitInfo = {
          limit: this.appConfig.ddosThresholdRpm,
          remaining: 0,
          resetAt,
          retryAfterSeconds,
        };
      }
    }

    // 7. Route Specific Rate Limit
    if (!isBlocked) {
      const route = this.getMatchingRoute(method, path);
      if (route && route.rateLimitEnabled) {
        const { allowed, resetAt } = this.rateLimiter.check(
          `route:${route.id}:${ip}`,
          route.rateLimitRequests,
          route.rateLimitWindowSeconds,
        );
        if (!allowed) {
          fail("rate_limit", `Route rate limit exceeded for ${path}`);
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((resetAt - Date.now()) / 1000),
          );
          rateLimitInfo = {
            limit: route.rateLimitRequests,
            remaining: 0,
            resetAt,
            retryAfterSeconds,
          };
        }
      }
    }

    // Determine final block action
    const actualBlock =
      isBlocked && this.appConfig.blockModeEnabled && !this.config.logOnly;

    const isRateLimit =
      (eventType as any) === "rate_limit" || (eventType as any) === "ddos";
    const statusCode =
      actualBlock && isRateLimit
        ? 429
        : actualBlock
          ? 403
          : undefined;

    const logPromise = this.logEvent(
      {
        type: eventType,
        ip,
        method,
        path,
        reason: isBlocked ? blockReason : "",
        blocked: actualBlock,
      },
      req,
    );

    return {
      blocked: actualBlock,
      statusCode,
      reason: isBlocked ? blockReason : undefined,
      eventType,
      rateLimitInfo: actualBlock ? rateLimitInfo : undefined,
      logPromise: logPromise instanceof Promise ? logPromise : undefined,
    };
  }

  getConfig(): DefenderConfig {
    return this.config;
  }

  destroy(): void {
    this.stopRealtimeSync();
    if (this.configSyncIntervalId) {
      clearInterval(this.configSyncIntervalId);
      this.configSyncIntervalId = undefined;
    }
    this.flushBatch();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
    if (this.uniqueIpPruneInterval) {
      clearInterval(this.uniqueIpPruneInterval);
      this.uniqueIpPruneInterval = undefined;
    }
    this.uniqueIpCache.clear();
    this.batchBuffer = [];
    this.torDetector.destroy();
    this.vpnDetector.destroy();
    this.threatActorDetector.destroy();
    this.outboundMonitor.uninstall();
    this.rateLimiter.destroy();
    this.temporaryBans.clear();
    this.sensitivePathAttempts.clear();
  }
}
