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
      (parts[0] === 169 && parts[1] === 254)
    )
      return true;
    return false;
  } else if (net.isIPv6(ip)) {
    const expanded = ip.toLowerCase();
    if (expanded === "::1" || expanded === "0:0:0:0:0:0:0:1") return true;
    const v4MappedMatch = expanded.match(
      /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/,
    );
    if (v4MappedMatch) return isPrivateIP(v4MappedMatch[1]);
    if (
      expanded.startsWith("fc") ||
      expanded.startsWith("fd") ||
      expanded.startsWith("fe8") ||
      expanded.startsWith("fe9") ||
      expanded.startsWith("fea") ||
      expanded.startsWith("feb")
    )
      return true;
    return false;
  }
  return false;
};

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function assertPublicHostname(hostname: string): void {
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

  url.pathname = url.pathname.replace(/\/+$/, "") + "/chat/completions";

  return url.href;
}
