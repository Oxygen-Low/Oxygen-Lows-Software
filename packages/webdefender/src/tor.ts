import { CidrBlock, ipToNumber, parseCidr } from "./vpn.js";

// Curated seed list of well-known established Tor exit nodes and exit relay subnets
export const SEED_TOR_IPS = [
  "185.220.101.5",
  "198.96.155.3",
  "171.25.193.20",
  "185.220.100.241",
  "185.220.101.55",
  "171.25.193.25",
  "198.98.51.189",
  "80.67.167.81",
  "109.70.100.4",
  "89.58.26.216",
  "185.220.102.8",
  "185.220.103.11",
  "198.96.155.12",
  "171.25.193.77",
];

export const SEED_TOR_CIDRS = [
  // Applied Privacy / Zwiebelfreunde dedicated Tor exit relay subnets
  "185.220.100.0/22",
  "171.25.193.0/24",
  "198.96.155.0/24",
  "109.70.100.0/24",
  "185.100.84.0/22",
];

export class TorDetector {
  private exitNodes: Set<string> = new Set();
  private exitCidrs: CidrBlock[] = [];
  private nonExitNodes: Set<string> = new Set();
  private intervalId?: ReturnType<typeof setInterval>;
  private isRefreshing = false;

  constructor() {
    this.initSeedData();
    this.startRefreshInterval();
  }

  private initSeedData() {
    for (const ip of SEED_TOR_IPS) {
      this.exitNodes.add(ip);
    }
    for (const cidrStr of SEED_TOR_CIDRS) {
      const cidr = parseCidr(cidrStr);
      if (cidr) {
        this.exitCidrs.push(cidr);
      }
    }
  }

  private startRefreshInterval() {
    this.refresh();
    // Refresh every hour
    this.intervalId = setInterval(() => this.refresh(), 3600000);
    if (this.intervalId && typeof this.intervalId === "object" && "unref" in this.intervalId) {
      (this.intervalId as any).unref();
    }
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      let text = "";
      try {
        const response = await fetch(
          "https://check.torproject.org/exit-addresses",
        );
        if (response.ok) {
          text = await response.text();
        }
      } catch {
        // Fallback below
      }

      // If primary feed failed or was empty, attempt fallback feed
      if (!text) {
        try {
          const fallbackRes = await fetch(
            "https://raw.githubusercontent.com/SecOps-Institute/Tor-IP-Addresses/master/tor-exit-nodes.lst",
          );
          if (fallbackRes.ok) {
            text = await fallbackRes.text();
          }
        } catch {
          // Keep existing nodes on failure
        }
      }

      if (text) {
        const newNodes = new Set<string>();
        // Always retain seed exit nodes
        for (const seedIp of SEED_TOR_IPS) {
          newNodes.add(seedIp);
        }

        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;

          if (trimmed.startsWith("ExitAddress ")) {
            const parts = trimmed.split(" ");
            if (parts.length >= 2) {
              const ip = parts[1].trim();
              if (ip) newNodes.add(ip);
            }
          } else {
            const token = trimmed.split(/\s+/)[0].trim();
            if (token && !token.includes("/")) {
              newNodes.add(token);
            }
          }
        }

        if (newNodes.size > 0) {
          this.exitNodes = newNodes;
        }
      }
    } catch (error) {
      // Silently fail on network error and keep existing set
    } finally {
      this.isRefreshing = false;
    }
  }

  isTorExitNode(ip: string): boolean {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;

    // 1. Exact IP lookup
    if (this.exitNodes.has(cleanIp)) {
      return true;
    }

    // 2. CIDR subnet check
    const ipNum = ipToNumber(cleanIp);
    if (ipNum !== null) {
      for (const cidr of this.exitCidrs) {
        if ((ipNum & cidr.mask) >>> 0 === cidr.network) {
          return true;
        }
      }
    }

    return false;
  }

  async isTorExitNodeAsync(ip: string): Promise<boolean> {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;

    if (this.isTorExitNode(cleanIp)) {
      return true;
    }

    // Fast return if already checked and confirmed non-Tor
    if (this.nonExitNodes.has(cleanIp)) {
      return false;
    }

    // Real-time DNSBL check via Tor official DNSEL service
    try {
      const parts = cleanIp.split(".");
      if (parts.length === 4) {
        const dns = await import("node:dns");
        const reversed = [...parts].reverse().join(".");
        const query = `${reversed}.dnsel.torproject.org`;
        const result = await Promise.race([
          dns.promises.resolve4(query),
          new Promise<string[]>((_, reject) =>
            setTimeout(() => reject(new Error("DNSEL Timeout")), 1000),
          ),
        ]);
        if (Array.isArray(result) && result.includes("127.0.0.2")) {
          this.addExitNode(cleanIp);
          return true;
        }
      }
    } catch {
      // Ignore DNSEL resolution failure
    }

    this.nonExitNodes.add(cleanIp);
    return false;
  }

  addExitNode(ip: string): void {
    if (ip) {
      const cleanIp = ip.trim().split(":")[0].trim();
      if (cleanIp) {
        this.exitNodes.add(cleanIp);
        this.nonExitNodes.delete(cleanIp);
      }
    }
  }

  addExitCidr(cidrStr: string): void {
    const cidr = parseCidr(cidrStr);
    if (cidr) {
      this.exitCidrs.push(cidr);
    }
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.exitNodes.clear();
    this.exitCidrs = [];
    this.nonExitNodes.clear();
  }
}
