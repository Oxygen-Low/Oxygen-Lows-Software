export interface CidrBlock {
  network: number;
  mask: number;
}

export function ipToNumber(ip: string): number | null {
  const parts = ip.split('.');
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
  const [ipStr, prefixStr] = cidr.split('/');
  if (!prefixStr) return null;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const ipNum = ipToNumber(ipStr.trim());
  if (ipNum === null) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  return { network, mask };
}

// Curated seed list of known commercial VPN server IPs and CIDRs (VPNBook, NordVPN, Surfshark, Mullvad, ProtonVPN, etc.)
const SEED_VPN_IPS = [
  // VPNBook known server IPs
  '198.7.58.196',
  '198.7.58.197',
  '198.7.58.198',
  '198.7.58.199',
  '198.7.58.200',
  '178.238.224.78',
  '178.238.224.79',
  '178.238.224.80',
  '178.238.224.81',
  '94.23.238.163',
  '198.245.51.218',
  '198.245.51.219',
  '142.4.215.116',
  '51.254.218.157',
  '51.254.218.158',
  '195.154.219.141',
  '195.154.219.142',
  '176.31.240.217',
  '176.31.240.218',
  '176.31.240.219'
];

const SEED_VPN_CIDRS = [
  // NordVPN / Tefincom subnets
  '185.128.24.0/22',
  '185.220.100.0/22',
  '89.187.160.0/20',
  '193.189.100.0/23',
  '194.35.233.0/24',
  '194.26.29.0/24',
  '194.147.140.0/24',
  '185.242.6.0/24',
  // Mullvad subnets
  '185.213.154.0/24',
  '185.213.155.0/24',
  '193.32.127.0/24',
  '193.32.248.0/24',
  // Surfshark subnets
  '156.146.32.0/20',
  '185.246.128.0/22',
  '146.70.0.0/16',
  // ProtonVPN subnets
  '185.159.157.0/24',
  '185.159.158.0/24',
  '194.126.177.0/24',
  '185.107.56.0/24'
];

const VPN_FEEDS = [
  'https://raw.githubusercontent.com/ejrv/VPNs/master/vpn-ipv4.txt',
  'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/ipv4.txt'
];

export class VpnDetector {
  private vpnIps: Set<string> = new Set();
  private vpnCidrs: CidrBlock[] = [];
  private intervalId?: ReturnType<typeof setInterval>;
  private isRefreshing = false;

  constructor() {
    this.initSeedData();
    this.startRefreshInterval();
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
  }

  private startRefreshInterval() {
    this.refresh();
    // Refresh every hour
    this.intervalId = setInterval(() => this.refresh(), 3600000);
  }

  private parseLines(text: string): { ips: Set<string>; cidrs: CidrBlock[] } {
    const ips = new Set<string>();
    const cidrs: CidrBlock[] = [];
    const lines = text.split('\n');

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith(';')) {
        continue;
      }
      const token = line.split(/\s+/)[0].trim();
      if (token.includes('/')) {
        const cidr = parseCidr(token);
        if (cidr) {
          cidrs.push(cidr);
        }
      } else {
        const cleanIp = token.split(':')[0].trim();
        if (cleanIp) {
          ips.add(cleanIp);
        }
      }
    }

    return { ips, cidrs };
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      await Promise.allSettled(
        VPN_FEEDS.map(async (url) => {
          try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeout = setTimeout(() => controller?.abort(), 5000);
            const response = await fetch(url, { signal: controller?.signal });
            clearTimeout(timeout);

            if (response.ok) {
              const text = await response.text();
              const { ips, cidrs } = this.parseLines(text);

              for (const ip of ips) {
                this.vpnIps.add(ip);
              }
              for (const cidr of cidrs) {
                this.vpnCidrs.push(cidr);
              }
            }
          } catch (err) {
            // Silently fail on network/timeout error and keep existing IP/CIDR sets
          }
        })
      );
    } finally {
      this.isRefreshing = false;
    }
  }

  isVpn(ip: string): boolean {
    if (!ip) return false;
    const cleanIp = ip.trim().split(':')[0].trim();
    if (!cleanIp) return false;

    // 1. Exact IP lookup
    if (this.vpnIps.has(cleanIp)) {
      return true;
    }

    // 2. CIDR subnet check
    const ipNum = ipToNumber(cleanIp);
    if (ipNum !== null) {
      for (const cidr of this.vpnCidrs) {
        if (((ipNum & cidr.mask) >>> 0) === cidr.network) {
          return true;
        }
      }
    }

    return false;
  }

  addVpnIp(ip: string): void {
    if (!ip) return;
    const cleanIp = ip.trim().split(':')[0].trim();
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
  }
}
