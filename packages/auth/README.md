# @oxygenlow/auth

The official, zero-dependency authentication SDK for **Oxygen Low's Software**. Add OAuth 2.0 authentication and user identity to your JavaScript and TypeScript applications in minutes.

Compatible with **Node.js**, **Bun**, **Deno**, **Cloudflare Workers**, **Next.js**, **Express**, **Hono**, **Fastify**, and modern browsers.

---

## Features

- ⚡ **Zero dependencies** – built purely on standard Web APIs (`fetch`, `URL`).
- 🔒 **Granular permissions** – request only what your application needs (`username`, `display_name`, `email`, `profile_picture`, `bio`).
- 🛡️ **OAuth 2.0 compliant** – standard authorization code exchange with state CSRF protection.
- 📦 **TypeScript ready** – complete types, interfaces, and error classes included out-of-the-box.

---

## Installation

```bash
# Using pnpm
pnpm add @oxygenlow/auth

# Using npm
npm install @oxygenlow/auth

# Using yarn
yarn add @oxygenlow/auth
```

---

## Environment Configuration

In your Oxygen Low's Software Developer Dashboard (`/apps/developer-auth`), create an application to obtain your **Client ID** and **API Key** (client secret). Add them to your `.env`:

```env
OXYGEN_CLIENT_ID=ol_app_your_client_id_here
OXYGEN_API_KEY=ol_sec_your_secret_api_key_here
```

---

## Quick Start

### 1. Initialize the Client

```typescript
import { OxygenAuth } from "@oxygenlow/auth";

export const auth = new OxygenAuth({
  clientId: process.env.OXYGEN_CLIENT_ID!,
  apiKey: process.env.OXYGEN_API_KEY!,
  baseUrl: process.env.OXYGEN_BASE_URL || "https://oxygenlow.com",
});
```

### 2. Redirect User to Login

```typescript
// E.g., GET /login
app.get("/login", (req, res) => {
  const authUrl = auth.getAuthorizationUrl({
    redirectUri: "http://localhost:3000/api/auth/callback",
    scopes: ["username", "display_name", "email"],
    state: "random_csrf_state_string",
  });

  res.redirect(authUrl);
});
```

### 3. Handle Callback & Exchange Code

```typescript
// E.g., GET /api/auth/callback
app.get("/api/auth/callback", async (req, res) => {
  const { code, state } = req.query;

  try {
    const { accessToken, user } = await auth.exchangeCode({
      code: String(code),
      redirectUri: "http://localhost:3000/api/auth/callback",
    });

    console.log("Authenticated user:", user);
    // user: { id: "1", username: "alex", display_name: "Alex", email: "alex@example.com" }

    // Store user session in cookie/session store
    req.session.userId = user.id;
    req.session.accessToken = accessToken;

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Authentication failed:", err);
    res.status(401).send("Authentication failed");
  }
});
```

---

## Additional Methods

### Fetch User Info Later

```typescript
const user = await auth.getUserInfo(accessToken);
```

### Verify Active Token

```typescript
const { valid, user } = await auth.verifyToken(accessToken);
if (valid) {
  // Session is active
}
```

### Revoke Token (Logout)

```typescript
await auth.revokeToken(accessToken);
```

---

## Scopes Reference

| Scope | Description |
|---|---|
| `username` | User's unique handle on Oxygen Low's Software |
| `display_name` | User's chosen display name |
| `email` | User's verified email address |
| `profile_picture` | Avatar image URL |
| `bio` | User's profile bio |

---

## License

MIT © Oxygen Low's Software
