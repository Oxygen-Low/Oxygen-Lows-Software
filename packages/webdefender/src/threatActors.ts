import { ThreatActorCategory } from "./types.js";

export interface ThreatActorMatch {
  category: ThreatActorCategory;
  feed: string;
}

interface FeedConfig {
  category: ThreatActorCategory;
  urls: string[];
}

const THREAT_FEEDS: FeedConfig[] = [
  {
    category: "bruteforce",
    urls: [
      "https://lists.blocklist.de/lists/bruteforcelogin.txt",
      "https://lists.blocklist.de/lists/ssh.txt",
    ],
  },
  {
    category: "http_dos",
    urls: [
      "https://lists.blocklist.de/lists/dos.txt",
      "https://lists.blocklist.de/lists/httprequest.txt",
    ],
  },
  {
    category: "http_exploit",
    urls: ["https://lists.blocklist.de/lists/apache.txt"],
  },
  {
    category: "botnet",
    urls: [
      "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
      "https://lists.blocklist.de/lists/bots.txt",
    ],
  },
];

export class ThreatActorDetector {
  private categoryNodes: Map<ThreatActorCategory, Set<string>> = new Map([
    ["bruteforce", new Set<string>()],
    ["http_dos", new Set<string>()],
    ["http_exploit", new Set<string>()],
    ["botnet", new Set<string>()],
  ]);
  private intervalId?: ReturnType<typeof setInterval>;
  private isRefreshing = false;

  constructor() {
    this.startRefreshInterval();
  }

  private startRefreshInterval() {
    this.refresh();
    // Refresh every hour
    this.intervalId = setInterval(() => this.refresh(), 3600000);
  }

  private parseIps(text: string): Set<string> {
    const ips = new Set<string>();
    const lines = text.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (
        !line ||
        line.startsWith("#") ||
        line.startsWith("//") ||
        line.startsWith(";")
      ) {
        continue;
      }
      // If line contains spaces/tabs/delimiters, take the first token (or check for IP)
      const token = line.split(/\s+/)[0].trim();
      // Remove any trailing port or slash if present
      const cleanIp = token.split(":")[0].split("/")[0].trim();
      if (cleanIp) {
        ips.add(cleanIp);
      }
    }
    return ips;
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      await Promise.allSettled(
        THREAT_FEEDS.map(async (feed) => {
          const categoryIps = new Set<string>();
          await Promise.allSettled(
            feed.urls.map(async (url) => {
              try {
                const controller =
                  typeof AbortController !== "undefined"
                    ? new AbortController()
                    : null;
                const timeout = setTimeout(() => controller?.abort(), 5000);
                const response = await fetch(url, {
                  signal: controller?.signal,
                });
                clearTimeout(timeout);
                if (response.ok) {
                  const text = await response.text();
                  const parsed = this.parseIps(text);
                  for (const ip of parsed) {
                    categoryIps.add(ip);
                  }
                }
              } catch (err) {
                // Silently fail on network/timeout error and keep existing nodes
              }
            }),
          );
          if (categoryIps.size > 0) {
            this.categoryNodes.set(feed.category, categoryIps);
          }
        }),
      );
    } finally {
      this.isRefreshing = false;
    }
  }

  checkThreatActor(ip: string): ThreatActorMatch | null {
    if (!ip) return null;
    const cleanIp = ip.trim();

    // Check categories in order: bruteforce, http_dos, http_exploit, botnet
    const categories: ThreatActorCategory[] = [
      "bruteforce",
      "http_dos",
      "http_exploit",
      "botnet",
    ];
    for (const cat of categories) {
      const set = this.categoryNodes.get(cat);
      if (set && set.has(cleanIp)) {
        return { category: cat, feed: cat };
      }
    }
    return null;
  }

  addThreatIp(category: ThreatActorCategory, ip: string): void {
    const set = this.categoryNodes.get(category);
    if (set) {
      set.add(ip.trim());
    }
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    for (const set of this.categoryNodes.values()) {
      set.clear();
    }
  }
}
