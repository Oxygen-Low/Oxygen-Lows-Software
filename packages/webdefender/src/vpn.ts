export interface CidrBlock {
  network: number;
  mask: number;
}

export function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const byte = parseInt(parts[i], 10);
    if (isNaN(byte) || byte < 0 || byte > 255) return null;
    num = (num << 8) | byte;
  }
  return num >>> 0;
}

export function parseCidr(cidr: string): CidrBlock | null {
  const [ipStr, prefixStr] = cidr.split("/");
  if (!prefixStr) return null;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const ipNum = ipToNumber(ipStr.trim());
  if (ipNum === null) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  return { network, mask };
}

export function isIpInCidr(ipNum: number, cidr: CidrBlock): boolean {
  return (ipNum & cidr.mask) >>> 0 === cidr.network;
}

export function matchesIpOrCidr(ip: string, patterns: string[]): boolean {
  if (!ip || !patterns || patterns.length === 0) return false;
  const cleanIp = (ip || "").trim().toLowerCase();
  const ipNum = ipToNumber(cleanIp);

  for (let i = 0; i < patterns.length; i++) {
    const rawPattern = (patterns[i] || "").trim();
    if (!rawPattern) continue;

    if (rawPattern.includes("/")) {
      if (ipNum !== null) {
        const cidr = parseCidr(rawPattern);
        if (cidr && isIpInCidr(ipNum, cidr)) {
          return true;
        }
      }
    } else {
      if (rawPattern.toLowerCase() === cleanIp) {
        return true;
      }
    }
  }

  return false;
}

// Curated seed list of known commercial VPN server IPs and CIDRs (VPNBook, NordVPN, Surfshark, Mullvad, ProtonVPN, etc.)
const SEED_VPN_IPS = [
  // VPNBook known server IPs
  "198.7.58.196",
  "198.7.58.197",
  "198.7.58.198",
  "198.7.58.199",
  "198.7.58.200",
  "178.238.224.78",
  "178.238.224.79",
  "178.238.224.80",
  "178.238.224.81",
  "94.23.238.163",
  "198.245.51.218",
  "198.245.51.219",
  "142.4.215.116",
  "51.254.218.157",
  "51.254.218.158",
  "195.154.219.141",
  "195.154.219.142",
  "176.31.240.217",
  "176.31.240.218",
  "176.31.240.219",
];

const SEED_VPN_CIDRS = [
  // NordVPN / Tefincom subnets
  "185.128.24.0/22",
  "89.187.160.0/20",
  "193.189.100.0/23",
  "194.35.233.0/24",
  "194.26.29.0/24",
  "194.147.140.0/24",
  "185.242.6.0/24",
  // Mullvad subnets
  "185.213.154.0/24",
  "185.213.155.0/24",
  "193.32.127.0/24",
  "193.32.248.0/24",
  // Surfshark subnets
  "156.146.32.0/20",
  "185.246.128.0/22",
  "146.70.0.0/16",
  // ProtonVPN subnets
  "185.159.157.0/24",
  "185.159.158.0/24",
  "194.126.177.0/24",
  "185.107.56.0/24",
];

// Well-known Public Anycast DNS Resolvers and Standard Cloud/Datacenter Infrastructure.
// These must NEVER be misidentified as commercial VPNs.
export const EXCLUDED_NON_VPN_IPS = [
  // Google Public DNS
  "8.8.8.8",
  "8.8.4.4",
  // Cloudflare DNS
  "1.1.1.1",
  "1.0.0.1",
  // Quad9 DNS
  "9.9.9.9",
  "149.112.112.112",
  // OpenDNS
  "208.67.222.222",
  "208.67.220.220",
  // AdGuard DNS
  "94.140.14.14",
  "94.140.15.15",
];

export const EXCLUDED_NON_VPN_CIDRS = [
  // Google Public DNS
  "8.8.8.0/24",
  "8.8.4.0/24",
  // Cloudflare DNS
  "1.1.1.0/24",
  "1.0.0.0/24",
  // Quad9 DNS
  "9.9.9.0/24",
  "149.112.112.0/24",
  // OpenDNS
  "208.67.220.0/23",
  // Standard AWS Cloud / EC2 Infrastructure
  "54.224.0.0/11",
  "54.239.0.0/16",
  "52.0.0.0/11",
  "3.0.0.0/9",
  // Standard Google Infrastructure / GCP
  "142.250.0.0/15",
  "172.217.0.0/16",
  "216.58.192.0/19",
  // Tor relay networks (Tor nodes are classified as is_tor, never is_vpn)
  "185.220.100.0/22",
];

const VPN_FEEDS = [
  "https://api.mullvad.net/www/relays/all/",
];

export class VpnDetector {
  private vpnIps: Set<string> = new Set();
  private vpnCidrs: CidrBlock[] = [];
  private excludedIps: Set<string> = new Set();
  private excludedCidrs: CidrBlock[] = [];
  private intervalId?: ReturnType<typeof setInterval>;
  private isRefreshing = false;

  constructor(options?: { autoRefresh?: boolean }) {
    this.initSeedData();
    if (options?.autoRefresh !== false) {
      this.startRefreshInterval();
    }
  }

  private initSeedData() {
    for (const ip of SEED_VPN_IPS) {
      this.vpnIps.add(ip);
    }
    for (const cidrStr of SEED_VPN_CIDRS) {
      const cidr = parseCidr(cidrStr);
      if (cidr) {
        this.vpnCidrs.push(cidr);
      }
    }
    for (const ip of EXCLUDED_NON_VPN_IPS) {
      this.excludedIps.add(ip);
    }
    for (const cidrStr of EXCLUDED_NON_VPN_CIDRS) {
      const cidr = parseCidr(cidrStr);
      if (cidr) {
        this.excludedCidrs.push(cidr);
      }
    }
  }

  startRefreshInterval(): void {
    if (this.intervalId) return;
    this.refresh();
    // Refresh every hour
    this.intervalId = setInterval(() => this.refresh(), 3600000);
    if (this.intervalId && typeof this.intervalId === "object" && "unref" in this.intervalId) {
      (this.intervalId as any).unref();
    }
  }

  private parseLines(text: string): { ips: Set<string>; cidrs: CidrBlock[] } {
    const ips = new Set<string>();
    const cidrs: CidrBlock[] = [];
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
      const token = line.split(/\s+/)[0].trim();
      if (token.includes("/")) {
        const cidr = parseCidr(token);
        if (cidr) {
          cidrs.push(cidr);
        }
      } else {
        const cleanIp = token.split(":")[0].trim();
        if (cleanIp) {
          ips.add(cleanIp);
        }
      }
    }

    return { ips, cidrs };
  }

  isExcluded(ip: string): boolean {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;

    if (this.excludedIps.has(cleanIp)) {
      return true;
    }

    const ipNum = ipToNumber(cleanIp);
    if (ipNum !== null) {
      for (const cidr of this.excludedCidrs) {
        if ((ipNum & cidr.mask) >>> 0 === cidr.network) {
          return true;
        }
      }
    }

    return false;
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      await Promise.allSettled(
        VPN_FEEDS.map(async (url) => {
          try {
            const controller =
              typeof AbortController !== "undefined"
                ? new AbortController()
                : null;
            const timeout = setTimeout(() => controller?.abort(), 5000);
            const response = await fetch(url, {
              signal: controller?.signal,
              headers: { "User-Agent": "WebDefender/1.0" },
            });
            clearTimeout(timeout);

            if (response.ok) {
              const text = await response.text();
              if (url.includes("mullvad.net") || text.trim().startsWith("[")) {
                try {
                  const data = JSON.parse(text);
                  if (Array.isArray(data)) {
                    for (const relay of data) {
                      if (relay.ipv4_addr_in && !this.isExcluded(relay.ipv4_addr_in)) {
                        this.vpnIps.add(relay.ipv4_addr_in);
                      }
                    }
                  }
                } catch {
                  // Silently ignore JSON parsing error
                }
              } else {
                const { ips, cidrs } = this.parseLines(text);
                for (const ip of ips) {
                  if (!this.isExcluded(ip)) {
                    this.vpnIps.add(ip);
                  }
                }
                for (const cidr of cidrs) {
                  this.vpnCidrs.push(cidr);
                }
              }
            }
          } catch (err) {
            // Silently fail on network/timeout error and keep existing IP/CIDR sets
          }
        }),
      );
    } finally {
      this.isRefreshing = false;
    }
  }

  isVpn(ip: string): boolean {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;

    // 0. Explicit exclusion check (Public DNS, Standard Cloud / Datacenter Infrastructure, Tor)
    if (this.isExcluded(cleanIp)) {
      return false;
    }

    // 1. Exact IP lookup
    if (this.vpnIps.has(cleanIp)) {
      return true;
    }

    // 2. CIDR subnet check
    const ipNum = ipToNumber(cleanIp);
    if (ipNum !== null) {
      for (const cidr of this.vpnCidrs) {
        if ((ipNum & cidr.mask) >>> 0 === cidr.network) {
          return true;
        }
      }
    }

    return false;
  }

  addVpnIp(ip: string): void {
    if (!ip) return;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (cleanIp) {
      this.vpnIps.add(cleanIp);
    }
  }

  addVpnCidr(cidrStr: string): void {
    const cidr = parseCidr(cidrStr);
    if (cidr) {
      this.vpnCidrs.push(cidr);
    }
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.vpnIps.clear();
    this.vpnCidrs = [];
    this.excludedIps.clear();
    this.excludedCidrs = [];
  }
}
