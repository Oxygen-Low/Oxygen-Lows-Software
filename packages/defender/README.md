# @oxygenlow/defender

![npm version](https://img.shields.io/npm/v/@oxygenlow/defender.svg)
![License](https://img.shields.io/npm/l/@oxygenlow/defender.svg)

Protect your Node.js, Express, Hono, or Next.js applications from DDoS, injection attacks, bots, and malicious traffic with an intelligent, cloud-managed Web Application Firewall (WAF) and middleware.

## Description

`@oxygenlow/defender` is a robust security middleware package designed to safeguard your web applications and APIs. It seamlessly integrates into your existing server architecture to monitor, filter, and optionally block malicious requests in real-time, leveraging the Oxygen Lows dashboard for configuration and observability.

## Features

- **DDoS Protection**: In-memory token bucket rate limiting globally and per-route.
- **Bot Detection**: Identify and block malicious bots, ad scrapers, AI assistants, AI scrapers, and data harvesters using user-agent signatures.
- **Injection Scanning**: Heuristic detection of SQL injection, shell injection, path traversal, and Server-Side Request Forgery (SSRF) payloads in URL parameters, body, and headers.
- **Geo-IP Blocking**: Block requests originating from specific countries.
- **TOR Exit Node Detection**: Identify and optionally block traffic coming from known TOR exit nodes.
- **Outbound Connection Monitoring**: Track and log outbound HTTP/HTTPS connections made by your application.
- **Auto-Discovery**: Automatically discover and sync routes with the central dashboard for Express and Hono apps.

## Installation

```bash
npm install @oxygenlow/defender
```

## Quick Start

### Express

```javascript
import express from 'express';
import { createDefender } from '@oxygenlow/defender';

const app = express();
app.use(express.json());

async function start() {
  const { middleware } = await createDefender({
    apiKey: 'your_api_key_here',
  }, app); // Passing 'app' enables auto-route discovery

  app.use(middleware());

  app.get('/', (req, res) => res.send('Hello Secure World!'));
  
  app.listen(3000, () => console.log('Server running securely on port 3000'));
}

start();
```

### Hono

```javascript
import { Hono } from 'hono';
import { createDefender } from '@oxygenlow/defender/hono';

const app = new Hono();

app.use('*', async (c, next) => {
  const middleware = await createDefender({
    apiKey: 'your_api_key_here',
  });
  return middleware(c, next);
});

app.get('/', (c) => c.text('Hello Secure Hono!'));

export default app;
```

### Next.js (Middleware)

```javascript
// middleware.ts
import { NextResponse } from 'next/server';
import { createNextDefender } from '@oxygenlow/defender/next';

const defender = createNextDefender({
  apiKey: 'your_api_key_here'
});

export async function middleware(request) {
  return defender(request, NextResponse);
}
```

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | **Required** | Your Oxygen Lows project API key. |
| `apiUrl` | `string` | `'https://oxygenlow.com'` | The API url of the defender service. |
| `logOnly` | `boolean` | `false` | If true, overrides the server config to only log threats, never block. |
| `onBlocked` | `function` | `undefined` | Callback fired when a request is blocked locally. |
| `onError` | `function` | `undefined` | Callback fired when an internal defender error occurs. |

## How it works

When initialized, the middleware fetches its configuration from the central API based on your `apiKey`. It routinely refreshes known TOR exit nodes and caching IP country codes. 

On every incoming request, it executes the following pipeline:
1. **IP Geo Check**: Verifies if the request originates from a blocked country.
2. **TOR Check**: Checks if the IP is a known TOR exit node.
3. **Bot Detection**: Scans the User-Agent string against known bot signatures.
4. **Injection Scanning**: Analyzes the request method, path, query parameters, headers, and body for SQLi, Shell Injection, Path Traversal, and SSRF patterns.
5. **DDoS Protection**: Enforces global API rate limits.
6. **Route Rate Limiting**: Applies route-specific token-bucket rate limiting based on central configuration.

## License

[MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/)
