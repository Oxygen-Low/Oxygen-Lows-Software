import { DefenderConfig, AppConfig, BlockedEvent, EventType, OutboundConnection, RouteConfig } from './types.js';
import { TorDetector } from './tor.js';
import { VpnDetector } from './vpn.js';
import { ThreatActorDetector } from './threatActors.js';
import { OutboundMonitor } from './outbound.js';
import { RateLimiter } from './rateLimiter.js';
import { discoverRoutes } from './routeDiscovery.js';
import { scanRequest } from './scanner/injection.js';
import { detectBot } from './scanner/bots.js';
import { getCountryCode } from './scanner/geo.js';

export interface IncomingRequest {
  ip: string;
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  body: string;
  headers: Record<string, string | string[] | undefined>;
  userAgent: string;
}

export interface RequestResult {
  blocked: boolean;
  reason?: string;
  eventType?: EventType;
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
  private apiUrl: string;
  private isInitialized = false;
  private configSyncIntervalId?: ReturnType<typeof setInterval>;

  constructor(config: DefenderConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'https://oxygenlow.com';
    this.torDetector = new TorDetector();
    this.vpnDetector = new VpnDetector();
    this.threatActorDetector = new ThreatActorDetector();
    this.rateLimiter = new RateLimiter();
    this.outboundMonitor = new OutboundMonitor((conn) => this.reportOutbound(conn), new URL(this.apiUrl).hostname);
  }

  private buildRouteCache(routes: RouteConfig[]) {
    this.exactRoutes.clear();
    this.prefixRoutes.clear();

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const method = (route.method || '').toUpperCase();

      let exactMap = this.exactRoutes.get(method);
      if (!exactMap) {
        exactMap = new Map();
        this.exactRoutes.set(method, exactMap);
      }
      exactMap.set(route.path, route);

      const prefix = route.path.replace(/:\w+/g, '');

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
      blockTor: cfg.block_tor ?? true,
      blockVpn: cfg.block_vpn ?? true,
      blockCountries: cfg.block_countries ?? [],
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
      routes,
    };
  }

  async init(app?: any): Promise<void> {
    if (this.isInitialized) return;

    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === '';
    if (this.config.offlineMode || noApiKey) {
      this.appConfig = this.normalizeConfig({ block_mode_enabled: true, config: {} });
      this.isInitialized = true;
      return;
    }

    try {
      // 1. Validate API key
      const response = await fetch(`${this.apiUrl}/api/defender/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        }
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
            await fetch(`${this.apiUrl}/api/defender/register`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
              },
              body: JSON.stringify({ routes })
            });

            // Refetch config to get the populated route IDs and rate limits
            const verifyRes = await fetch(`${this.apiUrl}/api/defender/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
              }
            });
            if (verifyRes.ok) {
              this.appConfig = this.normalizeConfig(await verifyRes.json());
            }
          } catch (e) {
            console.error('[Defender] Route registration failed:', e);
          }
        }
      }

      // 5. Install outbound monitor
      this.outboundMonitor.install();
      this.isInitialized = true;

      // 6. Start periodic config sync
      this.startConfigSync();
    } catch (error) {
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
      console.error('[Defender] Initialization failed:', error);
    }
  }

  private startConfigSync(): void {
    if (this.configSyncIntervalId) {
      clearInterval(this.configSyncIntervalId);
      this.configSyncIntervalId = undefined;
    }
    const syncInterval = this.config.syncIntervalMs !== undefined ? this.config.syncIntervalMs : 60000;
    if (syncInterval > 0) {
      this.configSyncIntervalId = setInterval(() => this.refreshConfig(), syncInterval);
    }
  }

  async refreshConfig(): Promise<void> {
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === '';
    if (this.config.offlineMode || noApiKey) {
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/defender/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (response.ok) {
        this.appConfig = this.normalizeConfig(await response.json());
      }
    } catch (error) {
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
    }
  }

  private reportOutbound(conn: OutboundConnection) {
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === '';
    if (this.config.offlineMode || noApiKey) {
      return;
    }

    fetch(`${this.apiUrl}/api/defender/outbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(conn)
    }).catch(() => {});
  }

  private logEvent(event: BlockedEvent, req?: Partial<IncomingRequest>) {
    if (this.config.onBlocked && event.blocked) {
      this.config.onBlocked(event);
    }

    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === '';
    if (this.config.offlineMode || noApiKey) {
      return;
    }

    fetch(`${this.apiUrl}/api/defender/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        eventType: event.type,
        ip: event.ip,
        countryCode: req?.query?.countryCode || null,
        method: event.method,
        path: event.path,
        blocked: event.blocked,
        requestBodySnippet: req?.body ? req.body.substring(0, 500) : null
      })
    }).catch(() => {});
  }

  private getMatchingRoute(method: string, path: string): RouteConfig | undefined {
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
    if (!this.appConfig) {
      return { blocked: false, eventType: 'allowed' };
    }

    const { ip, method, path, query, body, headers, userAgent } = req;
    
    let isBlocked = false;
    let blockReason = '';
    let eventType: EventType = 'allowed';

    const fail = (type: EventType, reason: string) => {
      eventType = type;
      blockReason = reason;
      isBlocked = true;
    };

    // 1. IP Geo Check
    if (!isBlocked && this.appConfig.blockCountries && this.appConfig.blockCountries.length > 0) {
      const countryCode = await getCountryCode(ip);
      if (countryCode && this.appConfig.blockCountries.includes(countryCode)) {
        fail('country_block', `Country blocked: ${countryCode}`);
      }
    }

    // 2. TOR Check
    if (!isBlocked && this.appConfig.blockTor) {
      if (this.torDetector.isTorExitNode(ip)) {
        fail('tor', 'TOR exit node detected');
      }
    }

    // 2b. Known VPN Check
    if (!isBlocked && this.appConfig.blockVpn) {
      if (this.vpnDetector.isVpn(ip)) {
        fail('vpn', 'VPN connection detected');
      }
    }

    // 3. Known Threat Actor Check
    if (!isBlocked) {
      const threatActor = this.threatActorDetector.checkThreatActor(ip);
      if (threatActor) {
        let shouldBlock = false;
        let eventType: EventType = 'threat_botnet';
        switch (threatActor.category) {
          case 'bruteforce':
            shouldBlock = this.appConfig.blockBruteforce;
            eventType = 'threat_bruteforce';
            break;
          case 'http_dos':
            shouldBlock = this.appConfig.blockHttpDos;
            eventType = 'threat_dos';
            break;
          case 'http_exploit':
            shouldBlock = this.appConfig.blockHttpExploit;
            eventType = 'threat_exploit';
            break;
          case 'botnet':
            shouldBlock = this.appConfig.blockBotnets;
            eventType = 'threat_botnet';
            break;
        }
        if (shouldBlock) {
          const categoryLabels: Record<string, string> = {
            bruteforce: 'Bruteforce attacker',
            http_dos: 'HTTP DoS attacker',
            http_exploit: 'HTTP Exploit attacker',
            botnet: 'Botnet Actor'
          };
          fail(eventType, `Known threat actor detected: ${categoryLabels[threatActor.category] || threatActor.category}`);
        }
      }
    }

    // 4. Bot Detection
    if (!isBlocked) {
      const botResult = detectBot(userAgent);
      if (botResult.isBot && botResult.category) {
        let blockBot = false;
        switch (botResult.category) {
          case 'ad_bot': blockBot = this.appConfig.blockAdBots; break;
          case 'ai_assistant': blockBot = this.appConfig.blockAiAssistants; break;
          case 'ai_scraper': blockBot = this.appConfig.blockAiScrapers; break;
          case 'ai_search_crawler': blockBot = this.appConfig.blockAiSearchCrawlers; break;
          case 'data_harvester': blockBot = this.appConfig.blockDataHarvesters; break;
        }
        if (blockBot) {
          fail('bot', `Blocked bot category: ${botResult.category} (${botResult.match})`);
        }
      }
    }

    // 5. Injection Scanning
    if (!isBlocked) {
      const scanRes = scanRequest(method, path, query, body, headers);
      for (const threat of scanRes.threats) {
        let shouldBlock = false;
        switch (threat.type) {
          case 'sql_injection': shouldBlock = this.appConfig.blockSqlInjection; break;
          case 'shell_injection': shouldBlock = this.appConfig.blockShellInjection; break;
          case 'path_traversal': shouldBlock = this.appConfig.blockPathTraversal; break;
          case 'ssrf': shouldBlock = this.appConfig.blockSsrf; break;
        }
        
        if (shouldBlock) {
          fail(threat.type, `Threat detected: ${threat.type} (pattern: ${threat.pattern})`);
          break;
        }
      }
    }

    // 6. Global DDoS Check
    if (!isBlocked && this.appConfig.ddosProtection && this.appConfig.ddosThresholdRpm > 0) {
      const { allowed } = this.rateLimiter.check(`global:${ip}`, this.appConfig.ddosThresholdRpm, 60);
      if (!allowed) {
        fail('ddos', 'Global DDoS rate limit exceeded');
      }
    }

    // 7. Route Specific Rate Limit
    if (!isBlocked) {
      const route = this.getMatchingRoute(method, path);
      if (route && route.rateLimitEnabled) {
        const { allowed } = this.rateLimiter.check(`route:${route.id}:${ip}`, route.rateLimitRequests, route.rateLimitWindowSeconds);
        if (!allowed) {
          fail('rate_limit', `Route rate limit exceeded for ${path}`);
        }
      }
    }

    // Determine final block action
    const actualBlock = isBlocked && this.appConfig.blockModeEnabled && !this.config.logOnly;

    this.logEvent({
      type: eventType,
      ip,
      method,
      path,
      reason: isBlocked ? blockReason : '',
      blocked: actualBlock
    }, req);

    return {
      blocked: actualBlock,
      reason: isBlocked ? blockReason : undefined,
      eventType
    };
  }

  destroy(): void {
    if (this.configSyncIntervalId) {
      clearInterval(this.configSyncIntervalId);
      this.configSyncIntervalId = undefined;
    }
    this.torDetector.destroy();
    this.vpnDetector.destroy();
    this.threatActorDetector.destroy();
    this.outboundMonitor.uninstall();
    this.rateLimiter.destroy();
  }
}
