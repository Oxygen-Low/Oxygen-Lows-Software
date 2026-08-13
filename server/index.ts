import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { demoRouter } from "./routes/demo.ts";
import { proxyRouter } from "./routes/proxy.ts";
import { oauthAdminRouter } from "./routes/oauthAdmin.ts";
import { adminSupportRouter } from "./routes/adminSupport.ts";
import { reposRouter } from "./routes/repos.ts";
import { aiRouter } from "./routes/ai.ts";
import { changelogsRouter } from "./routes/changelogs.ts";

const app = new Hono();

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

app.use(secureHeaders());
app.use(
  cors({
    origin: (origin) => isAllowedOrigin(origin) ?? "",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-github-token"],
  }),
);

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


app.get("/health", (c) => c.text("OK"));
app.get("/api/ping", (c) => c.json({ message: "ping" }));

app.get("/sitemap.xml", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = c.req.header("x-forwarded-proto") || "https";
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

app.route("/api/demo", demoRouter);
app.route("/api/proxy", proxyRouter);
app.route("/api/oauth-admin", oauthAdminRouter);
app.route("/api/admin/support", adminSupportRouter);
app.route("/api/repos", reposRouter);
app.route("/api/ai", aiRouter);
app.route("/api/changelogs", changelogsRouter);


export function createServer() {
  return app;
}

export default app;
