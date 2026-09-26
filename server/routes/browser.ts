import { Hono } from "hono";
import {
  validateCrawlUrl,
  searchOxylowIndex,
  getOxylowSuggestions,
  extractPageData,
  extractReaderArticle,
  decodeHtmlEntities,
} from "../lib/oxylowCrawler.ts";

export const browserRouter = new Hono();

// Search endpoint querying the oxylow index with relevance scoring
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

// Reader mode extraction with full structured article parsing
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
    const extracted = extractReaderArticle(html, validated.href);

    return c.json({
      url: validated.href,
      domain: validated.hostname,
      title: extracted.title,
      description: extracted.description,
      headings: extracted.headings,
      content: extracted.content,
      paragraphs: extracted.paragraphs,
      readingTimeMinutes: extracted.readingTimeMinutes,
      favicon: extracted.favicon,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to load reader mode" }, 400);
  }
});

function rewriteHtmlUrls(html: string, baseUrlStr: string): string {
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlStr);
  } catch {
    return html;
  }

  const resolveAttrUrl = (val: string): string => {
    const trimmed = val.trim();
    if (
      !trimmed ||
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("tel:") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("blob:") ||
      trimmed.startsWith("#")
    ) {
      return val;
    }
    try {
      return new URL(trimmed, baseUrl).href;
    } catch {
      return val;
    }
  };

  // Rewrite href, src, action, poster attributes
  let processed = html.replace(
    /\b(href|src|action|poster)\s*=\s*(["'])(.*?)\2/gi,
    (match, attr, quote, url) => {
      const resolved = resolveAttrUrl(url);
      return `${attr}=${quote}${resolved}${quote}`;
    }
  );

  // Rewrite srcset="image.jpg 1x, image2.jpg 2x"
  processed = processed.replace(
    /\bsrcset\s*=\s*(["'])(.*?)\1/gi,
    (match, quote, srcsetValue) => {
      const parts = srcsetValue.split(",").map((part: string) => {
        const trimmed = part.trim();
        const spaceIdx = trimmed.indexOf(" ");
        if (spaceIdx === -1) {
          return resolveAttrUrl(trimmed);
        }
        const url = trimmed.slice(0, spaceIdx);
        const descriptor = trimmed.slice(spaceIdx);
        return `${resolveAttrUrl(url)}${descriptor}`;
      });
      return `srcset=${quote}${parts.join(", ")}${quote}`;
    }
  );

  return processed;
}

// Proxy endpoint to load external pages with high rendering fidelity within Web Browser tabs
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

    const originalContentType = res.headers.get("content-type") || "text/html";

    // If it is an HTML document, rewrite URLs, inject base href and navigation listener
    if (originalContentType.includes("text/html") || originalContentType.includes("application/xhtml+xml")) {
      let html = await res.text();

      // Ensure <base href="..."> is set and relative URLs are rewritten
      const baseTag = `<base href="${validated.href}">`;
      const injectionScript = `
        <script>
          (function() {
            function resolveTarget(rawHref) {
              try {
                return new URL(rawHref, document.baseURI || window.location.href).href;
              } catch (e) {
                return rawHref;
              }
            }

            document.addEventListener('click', function(e) {
              const anchor = e.target.closest('a');
              if (anchor) {
                const href = anchor.getAttribute('href') || anchor.href;
                if (href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                  e.preventDefault();
                  const targetUrl = resolveTarget(href);
                  window.parent.postMessage({ type: 'OXYLOW_BROWSER_NAVIGATE', url: targetUrl }, '*');
                }
              }
            }, true);

            document.addEventListener('submit', function(e) {
              const form = e.target;
              if (form) {
                const action = form.getAttribute('action') || form.action || '';
                const method = (form.method || 'GET').toUpperCase();
                if (method === 'GET' && !action.startsWith('javascript:')) {
                  e.preventDefault();
                  const formData = new FormData(form);
                  const params = new URLSearchParams();
                  for (const [k, v] of formData.entries()) {
                    if (typeof v === 'string') params.append(k, v);
                  }
                  const baseTarget = resolveTarget(action || window.location.href);
                  const targetUrl = baseTarget + (baseTarget.includes('?') ? '&' : '?') + params.toString();
                  window.parent.postMessage({ type: 'OXYLOW_BROWSER_NAVIGATE', url: targetUrl }, '*');
                }
              }
            }, true);
          })();
        </script>
      `;

      // Rewrite relative URLs to absolute URLs
      html = rewriteHtmlUrls(html, validated.href);

      // Strip any third-party meta framing, CSP, and legacy charset tags that might break rendering
      html = html.replace(/<meta\s+[^>]*http-equiv=["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi, "");
      html = html.replace(/<meta\s+[^>]*http-equiv=["']?refresh["'][^>]*>/gi, "");

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}\n<meta charset="utf-8">\n${baseTag}\n${injectionScript}`);
      } else {
        html = `<meta charset="utf-8">\n${baseTag}\n${injectionScript}\n${html}`;
      }

      // Return sanitized HTML with permissive proxy CSP so external stylesheets/images/fonts render accurately
      c.header(
        "Content-Security-Policy",
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:; media-src * data: blob:; font-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; base-uri *; frame-src *; object-src 'none';"
      );
      c.header("X-Frame-Options", "SAMEORIGIN");

      return c.html(html, 200, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "SAMEORIGIN",
      });
    }

    // For non-HTML binary / media / css / js resources
    const arrayBuffer = await res.arrayBuffer();
    c.header(
      "Content-Security-Policy",
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:; media-src * data: blob:; font-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; base-uri *; frame-src *;"
    );
    return c.body(arrayBuffer, 200, {
      "Content-Type": originalContentType,
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
    c.header(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );
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
