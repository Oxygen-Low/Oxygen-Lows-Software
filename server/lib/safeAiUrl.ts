import net from "net";
import { lookup } from "dns/promises";

export const isPrivateIP = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (
      parts[0] === 0 ||
      parts[0] === 127 ||
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) ||
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) ||
      (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) ||
      (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
      (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
      parts[0] >= 224
    )
      return true;
    return false;
  } else if (net.isIPv6(ip)) {
    // URL normalizes compressed/expanded IPv6 and dotted mapped IPv4.
    const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    if (normalized.startsWith("::ffff:")) {
      const words = normalized.slice(7).split(":");
      const value = (parseInt(words[0], 16) * 65536) + parseInt(words[1], 16);
      return isPrivateIP([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join("."));
    }
    // Only global unicast; exclude reserved transition/documentation networks.
    const first = parseInt(normalized.split(":")[0], 16);
    return !(first >= 0x2000 && first <= 0x3fff) ||
      (first === 0x2001 && (parseInt(normalized.split(":")[1] || "0", 16) < 0x200 || normalized.startsWith("2001:db8:"))) || normalized.startsWith("2002:") || normalized.startsWith("3fff:");
  }
  return false;
};

const LOCALHOST_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "metadata.google.internal",
  "169.254.169.254",
]);

export function assertPublicHostname(hostname: string): void {
  hostname = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    isPrivateIP(hostname) ||
    LOCALHOST_HOSTNAMES.has(hostname.toLowerCase())
  ) {
    throw new Error("Public origin required");
  }
}

export const validateAiUrl = async (baseUrl: string): Promise<void> => {
  const u = new URL(baseUrl);
  if (u.protocol !== "https:") throw new Error("HTTPS required");
  assertPublicHostname(u.hostname);
  const addresses = await lookup(u.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIP(address)) throw new Error("Public origin required");
  }
};

export async function resolveCustomProviderUrl(
  baseUrl: string,
): Promise<string> {
  if (baseUrl.includes("/../") || /\/%2e%2e\//i.test(baseUrl)) {
    throw new Error("Invalid path");
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.username || url.password)
    throw new Error("Credentials in URL are not allowed");

  if (!["https:", "http:"].includes(url.protocol)) throw new Error("HTTP(S) required");
  assertPublicHostname(url.hostname);

  const addresses = await lookup(url.hostname, { all: true });
  const firstAddress = addresses.find((a) => !isPrivateIP(a.address));

  if (!firstAddress) {
    throw new Error("Public origin required");
  }

  // Pin the IP address to mitigate DNS rebinding
  if (net.isIPv6(firstAddress.address)) {
    url.hostname = `[${firstAddress.address}]`;
  } else {
    url.hostname = firstAddress.address;
  }

  if (!url.pathname.endsWith("/chat/completions")) {
    url.pathname = url.pathname.replace(/\/+$/, "") + "/chat/completions";
  }

  return url.href;
}
