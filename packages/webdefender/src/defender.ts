import { DefenderConfig, AppConfig, BlockedEvent, EventType, OutboundConnection, RouteConfig } from './types.js';
import { TorDetector } from './tor.js';
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

export class DefenderClient {
  private config: DefenderConfig;
  private appConfig: AppConfig | null = null;
  private torDetector: TorDetector;
  private outboundMonitor: OutboundMonitor;
  private rateLimiter: RateLimiter;
  private apiUrl: string;
  private isInitialized = false;

  constructor(config: DefenderConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'https://oxygenlow.com';
    this.torDetector = new TorDetector();
    this.rateLimiter = new RateLimiter();
    this.outboundMonitor = new OutboundMonitor((conn) => this.reportOutbound(conn));
  }

  async init(app?: any): Promise<void> {
    if (this.isInitialized) return;

    if (!this.config.apiKey || this.config.apiKey.trim() === '') {
      console.log('[Defender] No API key environment variable found. Protection is disabled.');
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

      this.appConfig = await response.json();

      // 3. Register routes if app is provided
      if (app && this.appConfig) {
        const routes = discoverRoutes(app);
        if (routes.length > 0) {
          fetch(`${this.apiUrl}/api/defender/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({ routes })
          }).catch(() => {});
        }
      }

      // 5. Install outbound monitor
      this.outboundMonitor.install();
      this.isInitialized = true;
    } catch (error) {
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
      console.error('[Defender] Initialization failed:', error);
    }
  }

  private reportOutbound(conn: OutboundConnection) {
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
        userAgent: req?.userAgent || null,
        method: event.method,
        path: event.path,
        blocked: event.blocked,
        requestBodySnippet: req?.body ? req.body.substring(0, 500) : null
      })
    }).catch(() => {});
  }

  private getMatchingRoute(method: string, path: string): RouteConfig | undefined {
    if (!this.appConfig || !this.appConfig.routes) return undefined;
    
    return this.appConfig.routes.find(
      r => r.method.toUpperCase() === method.toUpperCase() && 
      (r.path === path || path.startsWith(r.path.replace(/:\w+/g, '')))
    );
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

    // 3. Bot Detection
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

    // 4. Injection Scanning
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

    // 5. Global DDoS Check
    if (!isBlocked && this.appConfig.ddosProtection && this.appConfig.ddosThresholdRpm > 0) {
      const { allowed } = this.rateLimiter.check(`global:${ip}`, this.appConfig.ddosThresholdRpm, 60);
      if (!allowed) {
        fail('ddos', 'Global DDoS rate limit exceeded');
      }
    }

    // 6. Route Specific Rate Limit
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
    this.torDetector.destroy();
    this.outboundMonitor.uninstall();
    this.rateLimiter.destroy();
  }
}
