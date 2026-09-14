import { Hono } from "hono";
import { validateCrawlUrl, searchOxylowIndex, getOxylowSuggestions, extractPageData } from "../lib/oxylowCrawler.ts";

export const browserRouter = new Hono();

// Search endpoint querying the oxylow index
browserRouter.get("/search", (c) => {
  const query = c.req.query("q") || "";
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "10", 10);

  const { results, total } = searchOxylowIndex(query, isNaN(page) ? 1 : page, isNaN(pageSize) ? 10 : pageSize);
  return c.json({ results, total, page, pageSize, query });
});

// Autocomplete suggestions for Omnibox
browserRouter.get("/suggestions", (c) => {
  const query = c.req.query("q") || "";
  const suggestions = getOxylowSuggestions(query, 6);
  return c.json({ suggestions });
});

// Reader mode extraction
browserRouter.get("/reader", async (c) => {
  const rawUrl = c.req.query("url");
  if (!rawUrl) {
    return c.json({ error: "Missing url parameter" }, 400);
  }

  try {
    const validated = await validateCrawlUrl(rawUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(validated.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return c.json({ error: `Failed to fetch target URL: ${res.statusText}` }, res.status as any);
    }

    const html = await res.text();
    const extracted = extractPageData(html, validated.href);

    return c.json({
      url: validated.href,
      domain: validated.hostname,
      title: extracted.title,
      description: extracted.description,
      headings: extracted.headings,
      content: extracted.bodyPreview,
      favicon: extracted.favicon,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to load reader mode" }, 400);
  }
});

// Proxy endpoint to load external pages within the Web Browser tabs
browserRouter.get("/proxy", async (c) => {
  const rawUrl = c.req.query("url");
  if (!rawUrl) {
    return c.text("Missing url parameter", 400);
  }

  try {
    const validated = await validateCrawlUrl(rawUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(validated.href, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const contentType = res.headers.get("content-type") || "text/html";

    // If it is an HTML document, rewrite base and inject navigation listener
    if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
      let html = await res.text();

      // Ensure <base href="..."> is set so relative styles, images, and links resolve
      const baseTag = `<base href="${validated.href}">`;
      const injectionScript = `
        <script>
          // Inform parent browser frame about link navigation
          document.addEventListener('click', function(e) {
            const anchor = e.target.closest('a');
            if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
              e.preventDefault();
              window.parent.postMessage({ type: 'OXYLOW_BROWSER_NAVIGATE', url: anchor.href }, '*');
            }
          }, true);
        </script>
      `;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}\n${injectionScript}`);
      } else {
        html = `${baseTag}\n${injectionScript}\n${html}`;
      }

      // Return sanitized HTML with stripped framing restriction headers
      return c.html(html, 200, {
        "Content-Type": contentType,
        // Explicitly avoid X-Frame-Options / frame-ancestors blocking
      });
    }

    // For non-HTML binary / media / css / js resources
    const arrayBuffer = await res.arrayBuffer();
    return c.body(arrayBuffer, 200, {
      "Content-Type": contentType,
    });
  } catch (err: any) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Navigation Error</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; max-width: 500px; text-align: center; border: 1px solid #334155; }
            h1 { color: #f43f5e; font-size: 1.5rem; margin-bottom: 0.75rem; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
            .url { background: #0f172a; padding: 0.5rem 0.75rem; border-radius: 6px; font-family: monospace; word-break: break-all; margin: 1rem 0; color: #38bdf8; font-size: 0.85rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Failed to Load Page</h1>
            <div class="url">${escapeHtml(rawUrl)}</div>
            <p>${escapeHtml(err.message || "An error occurred while proxying this request.")}</p>
          </div>
        </body>
      </html>
    `;
    return c.html(errorHtml, 502);
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
