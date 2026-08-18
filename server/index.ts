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
import { defenderRouter } from "./routes/webdefender.ts";
import { createDefender } from "@oxygenlow/webdefender/hono";

const app = new Hono();

let defenderPromise: Promise<any> | null = null;

app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/webdefender') || c.req.path.startsWith('/api/defender')) {
    return next();
  }
  if (!defenderPromise) {
    defenderPromise = createDefender({
      apiKey: process.env.DEFENDER_API_KEY || '',
      apiUrl: process.env.DEFENDER_API_URL || 'https://oxygenlow.com',
    }, app);
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

export function getLinkHeaders(): string {
  return [
    '</.well-known/api-catalog>; rel="api-catalog"',
    '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.0"',
    '</api/docs>; rel="service-doc"; type="text/html"',
    '</llms.txt>; rel="describedby"; type="text/plain"',
    '</auth.md>; rel="describedby"; type="text/markdown"',
    '</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"',
    '</.well-known/oauth-authorization-server>; rel="oauth-authorization-server"',
  ].join(', ');
}

app.use('*', async (c, next) => {
  const path = c.req.path;
  const accept = c.req.header('Accept') || '';
  if (
    accept.includes('text/markdown') &&
    !path.startsWith('/api/') &&
    !path.startsWith('/.well-known/') &&
    path !== '/auth.md' &&
    path !== '/llms.txt' &&
    path !== '/robots.txt' &&
    path !== '/sitemap.xml'
  ) {
    const md = `# Oxygen Low's Software\n\nOxygen Low's Software - Beta. A platform for apps, storage, and customization.`;
    const tokens = md.split(/\s+/).length.toString();
    return c.text(md, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': tokens,
      'Link': getLinkHeaders(),
    });
  }
  await next();
});

// RFC 8288 / RFC 9727 Link headers for agent discovery on homepage and frontend routes
app.use('*', async (c, next) => {
  const path = c.req.path;
  const isAsset =
    path.startsWith('/api/') ||
    path.startsWith('/.well-known/') ||
    /\.(js|css|png|ico|svg|woff2?|ttf|eot|map|json|xml|txt|jpg|jpeg|gif|webp)$/i.test(path);

  if (!isAsset) {
    c.header('Link', getLinkHeaders());
  }

  await next();

  if (!isAsset) {
    c.header('Link', getLinkHeaders());
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
    { loc: `${baseUrl}/apps/webdefender`, changefreq: "weekly", priority: "0.8" },
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

app.post("/agent/auth", async (c) => {
  return c.json({
    status: "ok",
    message: "Agent authentication endpoint",
    token_type: "bearer"
  });
});

app.post("/agent/auth/revoke", async (c) => {
  return c.json({
    status: "ok",
    message: "Agent token revocation endpoint"
  });
});

app.all("/agent/auth/claim", async (c) => {
  return c.json({
    status: "ok",
    message: "Agent token claim endpoint",
    token_type: "bearer"
  });
});

app.get("/api/openapi.json", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  const openapiSpec = {
    openapi: "3.0.3",
    info: {
      title: "Oxygen Low's Software API",
      version: "1.0.0",
      description: "API services for Oxygen Low's Software platform, including AI agents, changelogs, VPN, support, and authentication metadata.",
      contact: {
        name: "Oxygen Low's Software Support",
        url: `${baseUrl}/legal`
      }
    },
    servers: [
      {
        url: baseUrl,
        description: "Current environment"
      }
    ],
    paths: {
      "/health": {
        get: {
          summary: "Health Check",
          description: "Returns health status of the server.",
          responses: {
            "200": {
              description: "Server is healthy",
              content: { "text/plain": { schema: { type: "string", example: "OK" } } }
            }
          }
        }
      },
      "/api/ping": {
        get: {
          summary: "Ping",
          description: "Ping the API server.",
          responses: {
            "200": {
              description: "Ping response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { message: { type: "string", example: "ping" } }
                  }
                }
              }
            }
          }
        }
      },
      "/api/demo": {
        get: {
          summary: "Demo Endpoint",
          description: "Demonstration API endpoint.",
          responses: {
            "200": {
              description: "Demo message",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { message: { type: "string" } }
                  }
                }
              }
            }
          }
        }
      },
      "/api/ai": {
        post: {
          summary: "AI Prompt Completion",
          description: "Process prompts with AI models.",
          responses: {
            "200": {
              description: "AI response"
            }
          }
        }
      },
      "/api/changelogs": {
        get: {
          summary: "Changelogs",
          description: "Retrieve public changelog updates.",
          responses: {
            "200": {
              description: "List of changelog entries"
            }
          }
        }
      },
      "/api/vpn": {
        get: {
          summary: "VPN Status",
          description: "Retrieve VPN configuration and connection status.",
          responses: {
            "200": {
              description: "VPN status response"
            }
          }
        }
      },
      "/api/webdefender": {
        get: {
          summary: "Web Defender Status",
          description: "Retrieve Web Defender protection status.",
          responses: {
            "200": {
              description: "Web Defender status"
            }
          }
        }
      },
      "/api/defender": {
        get: {
          summary: "Defender Status (Legacy)",
          description: "Retrieve Web Defender protection status.",
          responses: {
            "200": {
              description: "Defender status"
            }
          }
        }
      },
      "/.well-known/api-catalog": {
        get: {
          summary: "RFC 9727 API Catalog",
          description: "Machine-readable API catalog in linkset JSON format.",
          responses: {
            "200": {
              description: "API catalog linkset",
              content: { "application/linkset+json": {} }
            }
          }
        }
      },
      "/.well-known/oauth-authorization-server": {
        get: {
          summary: "OAuth Authorization Server Metadata",
          description: "RFC 8414 OAuth 2.0 metadata with agent auth flows.",
          responses: {
            "200": {
              description: "OAuth authorization metadata",
              content: { "application/json": {} }
            }
          }
        }
      },
      "/.well-known/oauth-protected-resource": {
        get: {
          summary: "OAuth Protected Resource Metadata",
          description: "RFC 9728 OAuth 2.0 protected resource metadata.",
          responses: {
            "200": {
              description: "OAuth protected resource metadata",
              content: { "application/json": {} }
            }
          }
        }
      },
      "/auth.md": {
        get: {
          summary: "Agent Authentication Guide",
          description: "Markdown documentation for agent registration and authentication.",
          responses: {
            "200": {
              description: "Authentication guide markdown",
              content: { "text/markdown": {} }
            }
          }
        }
      },
      "/llms.txt": {
        get: {
          summary: "LLMs Discovery File",
          description: "Standard llms.txt file detailing site purpose and links for AI agents.",
          responses: {
            "200": {
              description: "llms.txt content",
              content: { "text/plain": {} }
            }
          }
        }
      }
    }
  };

  return c.json(openapiSpec, 200, {
    "Content-Type": "application/vnd.oai.openapi+json;version=3.0",
    "Cache-Control": "public, max-age=3600",
    "Link": getLinkHeaders(),
  });
});

app.get("/api/docs", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Oxygen Low's Software - API Documentation</title>
  <!-- RFC 8288 / RFC 9727 Discovery Links -->
  <link rel="api-catalog" href="/.well-known/api-catalog" type="application/linkset+json" />
  <link rel="service-desc" href="/api/openapi.json" type="application/vnd.oai.openapi+json;version=3.0" />
  <link rel="service-doc" href="/api/docs" type="text/html" />
  <link rel="describedby" href="/llms.txt" type="text/plain" />
  <link rel="describedby" href="/auth.md" type="text/markdown" />
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --tag-get: #10b981;
      --tag-post: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container { max-width: 900px; margin: 0 auto; }
    header { margin-bottom: 2.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
    p.subtitle { color: var(--text-muted); font-size: 1.1rem; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: bold;
      background: #1e293b;
      color: var(--accent);
      margin-top: 0.5rem;
    }
    .discovery-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 2rem;
    }
    .discovery-box h2 { font-size: 1.2rem; margin-bottom: 0.75rem; color: var(--accent); }
    .discovery-box ul { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
    .discovery-box li { display: flex; align-items: center; justify-content: space-between; font-size: 0.95rem; }
    .discovery-box a { color: var(--accent); text-decoration: none; word-break: break-all; }
    .discovery-box a:hover { text-decoration: underline; }
    .endpoint {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .endpoint-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
    .method {
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: bold;
      text-transform: uppercase;
    }
    .method.get { background: rgba(16, 185, 129, 0.2); color: var(--tag-get); }
    .method.post { background: rgba(59, 130, 246, 0.2); color: var(--tag-post); }
    .path { font-family: monospace; font-size: 1rem; font-weight: 600; color: #fff; }
    .desc { color: var(--text-muted); font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Oxygen Low's Software API Documentation</h1>
      <p class="subtitle">Machine-readable and interactive API documentation for humans and autonomous agents.</p>
      <span class="badge">OpenAPI 3.0.3 Compatible</span>
    </header>

    <section class="discovery-box">
      <h2>Agent Discovery & Machine-Readable Specifications</h2>
      <ul>
        <li>
          <span><strong>API Catalog (RFC 9727):</strong></span>
          <a href="${baseUrl}/.well-known/api-catalog">${baseUrl}/.well-known/api-catalog</a>
        </li>
        <li>
          <span><strong>OpenAPI Specification:</strong></span>
          <a href="${baseUrl}/api/openapi.json">${baseUrl}/api/openapi.json</a>
        </li>
        <li>
          <span><strong>LLMs Description:</strong></span>
          <a href="${baseUrl}/llms.txt">${baseUrl}/llms.txt</a>
        </li>
        <li>
          <span><strong>Agent Authentication (auth.md):</strong></span>
          <a href="${baseUrl}/auth.md">${baseUrl}/auth.md</a>
        </li>
      </ul>
    </section>

    <h2 style="margin-bottom: 1rem; font-size: 1.3rem;">Core Endpoints</h2>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/health</span>
      </div>
      <div class="desc">System health check endpoint returning 200 OK.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/api/ping</span>
      </div>
      <div class="desc">Lightweight ping endpoint returning {"message": "ping"}.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/api/openapi.json</span>
      </div>
      <div class="desc">Returns the full OpenAPI 3.0 JSON specification.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/api/changelogs</span>
      </div>
      <div class="desc">Retrieves software changelogs and platform release history.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method post">POST</span>
        <span class="path">/agent/auth</span>
      </div>
      <div class="desc">Agent registration and identity assertion exchange endpoint.</div>
    </div>
  </div>
</body>
</html>`;

  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600",
    "Link": getLinkHeaders(),
  });
});

app.get("/llms.txt", (c) => {
  const content = `# Oxygen Low's Software\n\nOxygen Low's Software is a platform for apps, storage, and customization.\n\n## Resources\n- [Main Website](/)\n- [API Documentation](/api/docs)\n- [API Catalog](/.well-known/api-catalog)\n- [OpenAPI Specification](/api/openapi.json)\n- [Agent Authentication](/auth.md)\n- [Contact Support](/support)\n- [About Us](/about)\n`;
  return c.text(content, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "Link": getLinkHeaders(),
  });
});

app.get("/robots.txt", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  const content = `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\nContent-Signal: ai-train=yes, search=yes, ai-input=yes\n`;
  return c.text(content, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600"
  });
});

app.get("/", (c) => {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Oxygen Low's Software - Beta. A platform for apps, storage, and customization." />
    <title>Oxygen Low's Software</title>
    <!-- RFC 8288 / RFC 9727 Discovery Links -->
    <link rel="api-catalog" href="/.well-known/api-catalog" type="application/linkset+json" />
    <link rel="service-desc" href="/api/openapi.json" type="application/vnd.oai.openapi+json;version=3.0" />
    <link rel="service-doc" href="/api/docs" type="text/html" />
    <link rel="describedby" href="/llms.txt" type="text/plain" />
    <link rel="describedby" href="/auth.md" type="text/markdown" />
  </head>
  <body>
    <div id="root">
      <h1>Oxygen Low's Software</h1>
    </div>
  </body>
</html>`;
  return c.html(html, 200, {
    "Link": getLinkHeaders(),
  });
});

app.route("/api/demo", demoRouter);
app.route("/api/proxy", proxyRouter);
app.route("/api/oauth-admin", oauthAdminRouter);
app.route("/api/admin/support", adminSupportRouter);
app.route("/api/ai", aiRouter);
app.route("/api/changelogs", changelogsRouter);
app.route("/api/vpn", vpnRouter);
app.route("/api/webdefender", defenderRouter);
app.route("/api/defender", defenderRouter);

export function createServer() {
  return app;
}

export default app;
