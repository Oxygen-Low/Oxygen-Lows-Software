import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { demoRouter } from "./routes/demo.ts";
import { proxyRouter } from "./routes/proxy.ts";
import { oauthAdminRouter } from "./routes/oauthAdmin.ts";
import { adminSupportRouter } from "./routes/adminSupport.ts";
import { aiRouter } from "./routes/ai.ts";
import { changelogsRouter } from "./routes/changelogs.ts";
import { vpnRouter } from "./routes/vpn.ts";
import { defenderRouter } from "./routes/defender.ts";
import { createDefender } from "@oxygenlow/webdefender/hono";

const app = new Hono();

let defenderPromise: Promise<any> | null = null;

app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/defender')) {
    return next();
  }
  if (!defenderPromise) {
    defenderPromise = createDefender({
      apiKey: process.env.DEFENDER_API_KEY || '',
    });
  }
  const middleware = await defenderPromise;
  return middleware(c, next);
});

const ALLOWED_ORIGINS = [
  "https://oxygenlow.com",
  "https://www.oxygenlow.com",
];

function isAllowedOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow localhost for development
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return undefined;
}

// A05: explicit Content-Security-Policy — Hono's secureHeaders() does NOT emit
// CSP by default, so we must configure it manually.
app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // required for Vite HMR in dev
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      mediaSrc: ["'self'", "https://vqmukrmpgvavscsyefqd.supabase.co"],
      connectSrc: [
        "'self'",
        "https://vqmukrmpgvavscsyefqd.supabase.co",
        "wss://vqmukrmpgvavscsyefqd.supabase.co",
        "https://oai.stablehorde.net",
        "https://stablehorde.net",
        "https://api.cloudflare.com",
        "https://api.openai.com",
        "https://api.anthropic.com",
        "https://generativelanguage.googleapis.com",
        "https://openrouter.ai",
        "https://api.x.ai",
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
  }),
);

app.use(
  cors({
    origin: (origin) => isAllowedOrigin(origin) ?? "",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-github-token"],
  }),
);

// A09: X-Request-Id for log correlation
app.use("*", async (c, next) => {
  const requestId =
    c.req.header("x-request-id") ||
    crypto.randomUUID();
  c.set("requestId" as any, requestId);
  await next();
  c.header("X-Request-Id", requestId);
});

app.use('*', async (c, next) => {
  const accept = c.req.header('Accept') || '';
  if (accept.includes('text/markdown') && !c.req.path.startsWith('/api/')) {
    const md = `# Oxygen Low's Software\n\nOxygen Low's Software - Open Beta. A platform for apps, storage, and customization.`;
    const tokens = md.split(/\s+/).length.toString();
    return c.text(md, 200, {
      'Content-Type': 'text/markdown',
      'x-markdown-tokens': tokens
    });
  }
  await next();
});

// RFC 8288 / RFC 9727 Link headers for agent discovery on homepage and frontend routes
app.use('*', async (c, next) => {
  await next();
  const path = c.req.path;
  // Only inject on non-API, non-asset routes (i.e. HTML pages served to agents/browsers)
  if (!path.startsWith('/api/') && !path.startsWith('/.well-known/') && !path.match(/\.(js|css|png|ico|svg|woff2?|ttf|eot|map|json|xml|txt)$/i)) {
    const host = c.req.header('host') || 'oxygenlow.com';
    const protocol = (c.req.header('x-forwarded-proto') || 'https').split(',')[0].trim();
    const baseUrl = `${protocol}://${host}`;
    const linkHeaders = [
      `<${baseUrl}/.well-known/api-catalog>; rel="api-catalog"`,
      `<${baseUrl}/api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.0"`,
      `<${baseUrl}/api/docs>; rel="service-doc"; type="text/html"`,
      `<${baseUrl}/auth.md>; rel="describedby"; type="text/markdown"`,
    ].join(', ');
    c.header('Link', linkHeaders);
  }
});


app.get("/health", (c) => c.text("OK"));
app.get("/api/ping", (c) => c.json({ message: "ping" }));

app.get("/sitemap.xml", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  // The validator tool might be using a specific host and we should ensure it matches
  // However, often times the scanner directly visits the domain.
  const baseUrl = `${protocol}://${host}`;

  const urls = [
    { loc: `${baseUrl}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${baseUrl}/apps`, changefreq: "daily", priority: "0.9" },
    { loc: `${baseUrl}/apps/chatbot`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/apps/file-compressor`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/apps/public-characters`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/apps/data-save`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/apps/qrcode-generator`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/apps/llm-agent`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/apps/defender`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/privacy`, changefreq: "monthly", priority: "0.5" },
    { loc: `${baseUrl}/terms`, changefreq: "monthly", priority: "0.5" },
    { loc: `${baseUrl}/eula`, changefreq: "monthly", priority: "0.5" },
    { loc: `${baseUrl}/dmca`, changefreq: "monthly", priority: "0.5" },
    { loc: `${baseUrl}/acceptable-use`, changefreq: "monthly", priority: "0.5" },
    { loc: `${baseUrl}/legal`, changefreq: "monthly", priority: "0.6" },
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return c.text(sitemap, 200, {
    "Content-Type": "application/xml",
    "Cache-Control": "public, max-age=3600",
  });
});

app.get("/auth.md", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

    const content = `# auth.md

This document describes how AI agents and automated clients can authenticate with **Oxygen Low's Software** (\`${baseUrl}\`).

## Agent Audience

This service is open to any AI agent or automated client. Agents may access public resources anonymously or register for a bearer token to access authenticated endpoints.

## Discovery Documents

- **OAuth Protected Resource Metadata**: \`${baseUrl}/.well-known/oauth-protected-resource\`
- **OAuth Authorization Server Metadata**: \`${baseUrl}/.well-known/oauth-authorization-server\`

The authorization server metadata includes a machine-readable \`agent_auth\` block that describes all supported registration flows.

## Registration Endpoint

- **Register**: \`POST ${baseUrl}/agent/auth\`
- **Revoke**: \`POST ${baseUrl}/agent/auth/revoke\`
- **Claim**: \`GET ${baseUrl}/agent/auth/claim\`

## Supported Authentication Methods

### 1. Identity Assertion — ID-JAG (JWT Authorization Grant)

Agents with a signed JWT Authorization Grant can exchange it for a bearer token.

- **Assertion type**: \`urn:ietf:params:oauth:token-type:id-jag\`
- **Credential type**: \`bearer\`
- **Register**: \`POST ${baseUrl}/agent/auth\` with assertion in request body
- **Revoke**: \`POST ${baseUrl}/agent/auth/revoke\`
- **Revocation event**: \`urn:ietf:params:oauth:event-type:token-revoked\`

### 2. Identity Assertion — Verified Email

Agents with a verified email identity claim can register and obtain a bearer token.

- **Assertion type**: \`verified_email\`
- **Credential type**: \`bearer\`
- **Register**: \`POST ${baseUrl}/agent/auth\` with email assertion
- **Claim**: \`GET ${baseUrl}/agent/auth/claim\`

### 3. Anonymous Access

Agents without an identity can obtain an anonymous bearer token for access to public resources.

- **Credential type**: \`bearer\`
- **Claim**: \`GET ${baseUrl}/agent/auth/claim\`

## Using Credentials

All bearer tokens must be sent in the HTTP \`Authorization\` header:

\`\`\`
Authorization: Bearer <token>
\`\`\`

Tokens provide access to API resources scoped under the permissions granted at registration time. See the Authorization Server metadata for the full list of supported scopes.
`;

  return c.text(content, 200, {
    "Content-Type": "text/markdown",
    "Cache-Control": "public, max-age=3600",
  });
});

app.get("/.well-known/oauth-protected-resource", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  return c.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"]
  });
});

app.get("/.well-known/oauth-authorization-server", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    scopes_supported: ["read", "write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "client_credentials"],
    agent_auth: {
      skill: "agent-registration",
      register_uri: `${baseUrl}/agent/auth`,
      methods: [
        {
          identity_types_supported: ["identity_assertion"],
          identity_assertion: {
            assertion_types_supported: ["urn:ietf:params:oauth:token-type:id-jag"]
          },
          credential_types_supported: ["bearer"],
          revocation_uri: `${baseUrl}/agent/auth/revoke`,
          events_supported: ["urn:ietf:params:oauth:event-type:token-revoked"]
        },
        {
          identity_types_supported: ["identity_assertion"],
          identity_assertion: {
            assertion_types_supported: ["verified_email"]
          },
          credential_types_supported: ["bearer"],
          claim_uri: `${baseUrl}/agent/auth/claim`
        },
        {
          identity_types_supported: ["anonymous"],
          anonymous: {
            credential_types_supported: ["bearer"]
          },
          claim_uri: `${baseUrl}/agent/auth/claim`
        }
      ]
    }
  }, 200, {
    "Cache-Control": "public, max-age=3600"
  });
});

app.get("/.well-known/api-catalog", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  const catalog = {
    linkset: [
      {
        anchor: `${baseUrl}/api`,
        "service-desc": [
          {
            href: `${baseUrl}/api/openapi.json`,
            type: "application/vnd.oai.openapi+json;version=3.0"
          }
        ],
        "service-doc": [
          {
            href: `${baseUrl}/api/docs`,
            type: "text/html"
          }
        ],
        status: [
          {
            href: `${baseUrl}/health`,
            type: "application/json"
          }
        ]
      },
      {
        anchor: `${baseUrl}/api/ai`,
        "service-desc": [
          {
            href: `${baseUrl}/api/openapi.json#/paths/~1api~1ai`,
            type: "application/vnd.oai.openapi+json;version=3.0"
          }
        ],
        "service-doc": [
          {
            href: `${baseUrl}/api/docs#ai`,
            type: "text/html"
          }
        ]
      },
      {
        anchor: `${baseUrl}/api/changelogs`,
        "service-desc": [
          {
            href: `${baseUrl}/api/openapi.json#/paths/~1api~1changelogs`,
            type: "application/vnd.oai.openapi+json;version=3.0"
          }
        ],
        "service-doc": [
          {
            href: `${baseUrl}/api/docs#changelogs`,
            type: "text/html"
          }
        ]
      }
    ]
  };

  return c.json(catalog, 200, {
    "Content-Type": "application/linkset+json",
    "Cache-Control": "public, max-age=3600"
  });
});

app.route("/api/demo", demoRouter);
app.route("/api/proxy", proxyRouter);
app.route("/api/oauth-admin", oauthAdminRouter);
app.route("/api/admin/support", adminSupportRouter);
app.route("/api/ai", aiRouter);
app.route("/api/changelogs", changelogsRouter);
app.route("/api/vpn", vpnRouter);
app.route("/api/defender", defenderRouter);

export function createServer() {
  return app;
}

export default app;
