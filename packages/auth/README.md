# @oxygenlow/auth

![npm version](https://img.shields.io/npm/v/@oxygenlow/auth.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

Universal, zero-dependency OAuth 2.0 authentication and identity SDK for Node.js, Express, Hono, Next.js, Cloudflare Workers, and modern browsers by Oxygen Low's Software.

## Description

`@oxygenlow/auth` is the official authentication SDK designed by Oxygen Low's Software to bring seamless OAuth 2.0 login, token management, and user identity verification to your JavaScript and TypeScript applications. Built purely on standard Web APIs with zero external dependencies, it operates smoothly across all modern JavaScript runtimes and server frameworks.

## Features

- **Zero Dependencies**: Built entirely on standard Web APIs (`fetch`, `URL`), keeping your bundle small, fast, and secure.
- **Granular Scopes**: Request only the user permissions your application needs (`username`, `display_name`, `email`, `profile_picture`, `bio`).
- **OAuth 2.0 Compliant**: Standard authorization code grant flow with state-based CSRF protection.
- **Identity & Token Verification**: Retrieve authenticated user profiles and verify active session tokens in real time.
- **Token Revocation**: Easily invalidate access tokens when users log out.
- **TypeScript First**: Full TypeScript definitions, strict interfaces, and custom error classes (`OxygenAuthError`) included out-of-the-box.
- **Universal Compatibility**: Works out-of-the-box with Node.js, Bun, Deno, Next.js, Cloudflare Workers, Express, Hono, Fastify, and browser environments.

## Installation

```bash
npm install @oxygenlow/auth
```

## Quick Start

### Express

```javascript
import express from "express";
import { OxygenAuth } from "@oxygenlow/auth";

const app = express();

const auth = new OxygenAuth({
  clientId: process.env.OXYGEN_CLIENT_ID,
  apiKey: process.env.OXYGEN_API_KEY,
});

// 1. Redirect user to Oxygen Low's Software login
app.get("/login", (req, res) => {
  const authUrl = auth.getAuthorizationUrl({
    redirectUri: "http://localhost:3000/api/auth/callback",
    scopes: ["username", "display_name", "email"],
    state: "random_csrf_token",
  });
  res.redirect(authUrl);
});

// 2. Handle OAuth callback & exchange code for user profile
app.get("/api/auth/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const { accessToken, user } = await auth.exchangeCode({
      code: String(code),
      redirectUri: "http://localhost:3000/api/auth/callback",
    });

    console.log("Authenticated user:", user);
    res.send(`Welcome back, ${user.display_name || user.username}!`);
  } catch (err) {
    res.status(401).send("Authentication failed");
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

### Hono

```javascript
import { Hono } from "hono";
import { OxygenAuth } from "@oxygenlow/auth";

const app = new Hono();

const auth = new OxygenAuth({
  clientId: process.env.OXYGEN_CLIENT_ID,
  apiKey: process.env.OXYGEN_API_KEY,
});

app.get("/login", (c) => {
  const authUrl = auth.getAuthorizationUrl({
    redirectUri: "http://localhost:3000/api/auth/callback",
    scopes: ["username", "display_name", "email"],
    state: "random_csrf_token",
  });
  return c.redirect(authUrl);
});

app.get("/api/auth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.text("Missing authorization code", 400);

  try {
    const { accessToken, user } = await auth.exchangeCode({
      code,
      redirectUri: "http://localhost:3000/api/auth/callback",
    });

    return c.json({ message: "Authenticated successfully", user });
  } catch (err) {
    return c.text("Authentication failed", 401);
  }
});

export default app;
```

### Next.js (App Router)

```javascript
// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { OxygenAuth } from "@oxygenlow/auth";

const auth = new OxygenAuth({
  clientId: process.env.OXYGEN_CLIENT_ID!,
  apiKey: process.env.OXYGEN_API_KEY!,
});

export async function GET() {
  const authUrl = auth.getAuthorizationUrl({
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    scopes: ["username", "display_name", "email"],
    state: "random_csrf_token",
  });
  return NextResponse.redirect(authUrl);
}
```

```javascript
// app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import { OxygenAuth } from "@oxygenlow/auth";

const auth = new OxygenAuth({
  clientId: process.env.OXYGEN_CLIENT_ID!,
  apiKey: process.env.OXYGEN_API_KEY!,
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  try {
    const { accessToken, user } = await auth.exchangeCode({
      code,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    });

    return NextResponse.json({ message: "Authenticated", user });
  } catch (err) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
}
```

### Cloudflare Workers

```javascript
import { OxygenAuth } from "@oxygenlow/auth";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const auth = new OxygenAuth({
      clientId: env.OXYGEN_CLIENT_ID,
      apiKey: env.OXYGEN_API_KEY,
    });

    if (url.pathname === "/login") {
      const authUrl = auth.getAuthorizationUrl({
        redirectUri: `${url.origin}/api/auth/callback`,
        scopes: ["username", "display_name", "email"],
        state: "random_csrf_token",
      });
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === "/api/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing authorization code", { status: 400 });
      }

      try {
        const { accessToken, user } = await auth.exchangeCode({
          code,
          redirectUri: `${url.origin}/api/auth/callback`,
        });
        return Response.json({ message: "Authenticated", user });
      } catch (err) {
        return new Response("Authentication failed", { status: 401 });
      }
    }

    return new Response("Hello Secure Worker!");
  },
};
```

## Configuration Options

| Option     | Type     | Default                    | Description                                                                                             |
| ---------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `clientId` | `string` | **Required**               | The public Client ID for your application created in the Oxygen Low's Software Developer Dashboard.     |
| `apiKey`   | `string` | `undefined`                | The secret API key for your application. Required for backend token exchange (`exchangeCode`) and revocation. |
| `baseUrl`  | `string` | `"https://oxygenlow.com"` | Base URL of the Oxygen Low's Software instance.                                                        |

## Scopes

| Scope             | Description                                     |
| ----------------- | ----------------------------------------------- |
| `username`        | User's unique handle on Oxygen Low's Software.  |
| `display_name`    | User's chosen display name.                     |
| `email`           | User's verified email address.                  |
| `profile_picture` | Avatar image URL.                               |
| `bio`             | User's profile biography text.                  |

## How it works

When integrating authentication into your application, `@oxygenlow/auth` orchestrates the standard OAuth 2.0 flow:

1. **Authorization Request**: Your app creates a secure authorization URL via `auth.getAuthorizationUrl()` with your `clientId`, `redirectUri`, and requested `scopes`, then redirects the user.
2. **User Consent**: The user is authenticated securely on Oxygen Low's Software and consents to grant the requested permissions.
3. **Authorization Code Callback**: The user is redirected back to your `redirectUri` with a temporary `code` parameter.
4. **Token & Profile Exchange**: Your backend exchanges the authorization `code` along with your `apiKey` using `auth.exchangeCode()` to receive a bearer `accessToken` and the user profile.
5. **Session Verification**: Call `auth.verifyToken(accessToken)` or `auth.getUserInfo(accessToken)` to validate session validity and retrieve fresh profile data.
6. **Token Revocation**: When the user signs out, call `auth.revokeToken(accessToken)` to invalidate the active token immediately.

## License

[MIT](https://choosealicense.com/licenses/mit/)
