# @oxygenlow/webdefender

![npm version](https://img.shields.io/npm/v/@oxygenlow/webdefender.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

Protect your Node.js, Express, Hono, Next.js, or Cloudflare Worker applications from DDoS, injection attacks, bots, and malicious traffic with an intelligent, cloud-managed Web Application Firewall (WAF) and middleware by Oxygen Low's Software.

## Description

`@oxygenlow/webdefender` is a robust security middleware package designed by Oxygen Low's Software to safeguard your web applications and APIs. It seamlessly integrates into your existing server architecture to monitor, filter, and optionally block malicious requests in real-time, leveraging the Oxygen Low's Software dashboard for configuration and observability.

## Features

- **DDoS Protection & Rate Limiting**: In-memory token bucket rate limiting globally and per-route with standard RFC 6585 / IETF headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`) and HTTP 429 status code.
- **Bot Detection**: Identify and block malicious bots, ad scrapers, AI assistants, AI scrapers, and data harvesters using user-agent signatures.
- **Advanced Threat & Injection Scanning**: Heuristic detection of SQL injection, shell injection, path traversal, Server-Side Request Forgery (SSRF), Cross-Site Scripting (XSS), NoSQL injection (MongoDB operators), and Prototype Pollution in URL parameters, body, and headers.
- **CIDR Subnet & Individual IP Blocking**: Block requests from specific IP addresses or entire CIDR subnet ranges (e.g. `192.168.1.0/24`, `10.0.0.0/8`).
- **IP Allowlisting**: Whitelist trusted IPs and CIDR subnets to completely bypass WAF rules, bot detection, and rate limits.
- **Geo-IP Blocking**: Block requests originating from specific countries.
- **TOR Exit Node Detection**: Identify and optionally block traffic coming from known TOR exit nodes.
- **VPN IP Blocking**: Identify and block traffic from known VPN providers (VPNBook, NordVPN, Surfshark, ProtonVPN, Mullvad, etc.) to prevent bypassing geo-blocks and IP restrictions.
- **Outbound Connection Monitoring**: Track and log outbound HTTP/HTTPS connections made by your application.
- **Auto-Discovery**: Automatically discover and sync routes with the central dashboard for Express and Hono apps.

## Installation

```bash
npm install @oxygenlow/webdefender
```

## Quick Start

### Express

```javascript
import express from "express";
import { createDefender } from "@oxygenlow/webdefender";

const app = express();
app.use(express.json());

async function start() {
  const { middleware } = await createDefender(
    {
      apiKey: "your_api_key_here",
    },
    app,
  ); // Passing 'app' enables auto-route discovery

  app.use(middleware());

  app.get("/", (req, res) => res.send("Hello Secure World!"));

  app.listen(3000, () => console.log("Server running securely on port 3000"));
}

start();
```

### Hono

```javascript
import { Hono } from "hono";
import { createDefender } from "@oxygenlow/webdefender/hono";

const app = new Hono();

app.use("*", async (c, next) => {
  const middleware = await createDefender({
    apiKey: "your_api_key_here",
  });
  return middleware(c, next);
});

app.get("/", (c) => c.text("Hello Secure Hono!"));

export default app;
```

### Next.js (Middleware)

```javascript
// middleware.ts
import { NextResponse } from "next/server";
import { createNextDefender } from "@oxygenlow/webdefender/next";

const defender = createNextDefender({
  apiKey: "your_api_key_here",
});

export async function middleware(request) {
  return defender(request, NextResponse);
}
```

### Cloudflare Workers

#### Using `withDefender` (Higher-Order Wrapper)

Wrap your Cloudflare Worker export with `withDefender`. If `DEFENDER_API_KEY` (or `WEBDEFENDER_API_KEY`) is set in your worker environment secrets/vars, you can even omit the config object!

```javascript
import { withDefender } from "@oxygenlow/webdefender/cloudflare";

export default withDefender({
  async fetch(request, env, ctx) {
    return new Response("Hello Secure Worker!");
  },
}, {
  // Optional if DEFENDER_API_KEY is defined in your Cloudflare environment
  apiKey: "your_api_key_here",
});
```

#### Using `createCloudflareDefender` (Direct Guard)

Inspect requests manually inside your `fetch` handler using `defender.protect(request, env, ctx)`:

```javascript
import { createCloudflareDefender } from "@oxygenlow/webdefender/cloudflare";

const defender = createCloudflareDefender();

export default {
  async fetch(request, env, ctx) {
    const blockedResponse = await defender.protect(request, env, ctx);
    if (blockedResponse) {
      return blockedResponse;
    }

    return new Response("Hello Secure Worker!");
  },
};
```

## Configuration Options

| Option           | Type       | Default      | Description                                                                                          |
| ---------------- | ---------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `apiKey`         | `string`   | **Required** | Your Oxygen Low's Software project API key.                                                          |
| `allowlistIps`   | `string[]` | `[]`         | Trusted IPs or CIDR subnets that bypass all WAF protections, bot detection, and rate limits.        |
| `logOnly`        | `boolean`  | `false`      | If true, overrides the server config to only log threats, never block.                               |
| `syncIntervalMs` | `number`   | `60000`      | Interval in ms to automatically sync security configuration from the dashboard. Set to 0 to disable. |
| `onBlocked`      | `function` | `undefined`  | Callback fired when a request is blocked locally.                                                    |
| `onError`        | `function` | `undefined`  | Callback fired when an internal defender error occurs.                                               |

## How it works

When initialized, the middleware fetches its configuration from the central API based on your `apiKey` and routinely refreshes known TOR exit nodes.

On every incoming request, it executes the following pipeline:

1. **Allowlist Bypass Check**: Checks if the request IP matches your trusted IP allowlist (exact or CIDR subnet).
2. **Individual & CIDR IP Check**: Verifies if the request IP is in your blocked IP / CIDR list or admin bans.
3. **IP Geo Check**: Verifies if the request originates from a blocked country using ultra-fast CDN / edge headers (Cloudflare, Vercel, AWS CloudFront, Fastly, Netlify, etc.).
4. **TOR Check**: Checks if the IP is a known TOR exit node.
5. **VPN Check**: Checks if the IP is a known commercial VPN exit node / server.
6. **Known Threat Actor Check**: Cross-references with real-time threat intelligence feeds.
7. **Bot Detection**: Scans the User-Agent string against known bot signatures.
8. **Threat & Injection Scanning**: Analyzes the request method, path, query parameters, headers, and body for SQLi, Shell Injection, Path Traversal, SSRF, XSS, NoSQL injection, and Prototype Pollution.
9. **Sensitive Path Auto-Block**: Detects probes to credentials, config files, and debug endpoints.
10. **DDoS Protection**: Enforces global API rate limits (returns HTTP 429 with IETF rate-limit headers).
11. **Route Rate Limiting**: Applies route-specific token-bucket rate limiting based on central configuration (returns HTTP 429 with IETF rate-limit headers).

## License

[MIT](https://choosealicense.com/licenses/mit/)
