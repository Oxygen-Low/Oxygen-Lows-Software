import { Hono } from "hono";
import ping from "ping";
import { rateLimiter } from "../lib/rateLimiter.ts";

export const vpnRouter = new Hono();

const apiLimiter = rateLimiter(30, 60_000, "vpn");

/** Matches a bare IPv4 address like 1.2.3.4 */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Returns true when an IPv4 string is in a private / loopback / link-local range. */
function isPrivateIPv4(ip: string): boolean {
  const m = IPV4_RE.exec(ip);
  if (!m) return false;
  const [, a, b] = m.map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "::1",
  "0:0:0:0:0:0:0:1",
]);

/** True when a hostname or IP literal should not be reachable from the public internet. */
function isPrivateHost(host: string): boolean {
  if (PRIVATE_HOSTNAMES.has(host.toLowerCase())) return true;
  if (isPrivateIPv4(host)) return true;
  // v6 loopback / link-local / ULA
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true; // fc00::/7 ULA
  return false;
}

/** Validates that a string is a well-formed IPv4 or IPv6 address. */
function isValidIp(ip: string): boolean {
  // IPv4
  if (IPV4_RE.test(ip)) {
    return ip.split(".").every((o) => Number(o) >= 0 && Number(o) <= 255);
  }
  // Basic IPv6 — must contain at least one colon
  if (ip.includes(":")) {
    return /^[0-9a-fA-F:]+$/.test(ip);
  }
  return false;
}

vpnRouter.get("/ping", apiLimiter, async (c) => {
  const host = c.req.query("host");

  // Only alphanumerics, dots, and hyphens (hostnames / IPs) — same as before
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    return c.json({ error: "Valid host parameter is required" }, 400);
  }

  // Block private / loopback addresses (A10 SSRF / A01)
  if (isPrivateHost(host)) {
    return c.json({ error: "Private or loopback hosts are not allowed" }, 400);
  }

  try {
    const res = await ping.promise.probe(host, {
      timeout: 2,
    });

    return c.json({
      host: res.host,
      alive: res.alive,
      time: res.time,
    });
  } catch (error) {
    console.error("Ping error:", error);
    return c.json({ error: "Failed to ping host" }, 500);
  }
});

vpnRouter.get("/geocode", apiLimiter, async (c) => {
  const ip = c.req.query("ip");

  // If an IP or hostname is supplied it must be well-formed and public (A01 / A10)
  if (ip !== undefined && ip !== "") {
    const isValidFormat = isValidIp(ip) || /^[a-zA-Z0-9.-]+$/.test(ip);
    if (!isValidFormat) {
      return c.json({ error: "Invalid IP address or hostname format" }, 400);
    }
    if (isPrivateHost(ip)) {
      return c.json(
        { error: "Private or loopback hosts are not allowed" },
        400,
      );
    }
  }

  try {
    // A05: use HTTPS, not HTTP
    const url = ip
      ? `https://ip-api.com/json/${encodeURIComponent(ip)}`
      : `https://ip-api.com/json/`;
    const res = await fetch(url);
    const data = await res.json();
    return c.json(data);
  } catch (error) {
    console.error("Geocode error:", error);
    return c.json({ error: "Failed to geocode IP" }, 500);
  }
});
