# @oxygenlow/simplecookies

![npm version](https://img.shields.io/npm/v/@oxygenlow/simplecookies.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

**SimpleCookies** is the 100% free cookie consent manager by Oxygen Low's Software — no limits, no paywalls. Drop a banner on any site, block non-essential scripts until consent, manage the cookie declaration, and keep consent receipts.

## Features

- **Consent banner + preferences modal** — Accept All / Reject All / Customize, per-category toggles (Necessary, Preferences, Statistics, Marketing, Custom), position + theme controls, 6 dashboard languages.
- **Script blocking** — `data-simplecookies-category="marketing|statistics|preferences|custom"` scripts stay inert until the visitor consents.
- **Auto cookie scanner** — static scan infers cookies from third-party scripts, inline trackers, and `Set-Cookie` headers; the dashboard declaration stays editable.
- **Consent receipts** — every choice is stored locally and posted to the dashboard audit log with a consent ID, policy version, and timestamp.
- **Consent Mode v2** — `dataLayer` updates for `ad_storage` / `analytics_storage` / `functionality_storage`.
- **Dashboard + API key** — unlimited projects, keys, and consents.

## Installation

```bash
npm install @oxygenlow/simplecookies
```

## Quick Start

### CDN banner (any site)

```html
<script src="https://oxygenlow.com/simplecookies.js" data-api-key="sk_your_key" defer></script>
```

Get `sk_...` from the [SimpleCookies dashboard](https://oxygenlow.com/apps/simplecookies).

### React

```tsx
import { SimpleCookiesProvider, SimpleCookiesBanner } from "@oxygenlow/simplecookies/react";

export default function App() {
  return (
    <SimpleCookiesProvider config={{ apiKey: process.env.NEXT_PUBLIC_SIMPLECOOKIES_KEY! }}>
      <SimpleCookiesBanner />
      {/* gated script */}
      <script src="https://www.googletagmanager.com/gtag/js?id=G-XXX" data-simplecookies-category="statistics" />
    </SimpleCookiesProvider>
  );
}
```

### Hono (server)

```ts
import { Hono } from "hono";
import { createSimpleCookies } from "@oxygenlow/simplecookies/hono";

const app = new Hono();
app.use("*", createSimpleCookies({ apiKey: process.env.SIMPLECOOKIES_KEY! }));
app.get("/", (c) => {
  const { project } = c.get("simpleCookies") as any;
  return c.html(`<h1>${project?.name || ""}</h1>`);
});
```

### Next.js

```ts
// middleware.ts
import { createNextMiddleware } from "@oxygenlow/simplecookies/next";
export const middleware = createNextMiddleware({ apiKey: process.env.SIMPLECOOKIES_KEY! });
```

```tsx
// app/layout.tsx
import { SimpleCookiesProvider } from "@oxygenlow/simplecookies/react";
```

## Gating scripts

```html
<script src="https://www.googletagmanager.com/gtag/js?id=G-XXX" data-simplecookies-category="statistics"></script>
<script src="https://connect.facebook.net/en_US/fbevents.js" data-simplecookies-category="marketing"></script>
```

Supported categories: `necessary`, `preferences`, `statistics`, `marketing`, `custom`.

## Consent storage

Consent is written to `localStorage` + cookie (`simplecookies_consent`) and, when online, posted to `POST /api/simplecookies/consent`. Users can re-open preferences via `SimpleCookiesProvider`'s `client` or dispatch `simplecookies:reopen`.

## License

[MIT](https://choosealicense.com/licenses/mit/)
