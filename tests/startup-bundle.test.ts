import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SPA_DIR = path.resolve(import.meta.dirname, "../dist/spa");
const INDEX_HTML = path.join(SPA_DIR, "index.html");

/**
 * Cheap regression guard for first-load responsiveness. The full Lighthouse
 * run lives outside CI, but these assertions catch the regressions that
 * caused the original slow startup: heavy vendor chunks sitting in the
 * initial modulepreload set.
 */
describe("startup bundle", () => {
  it("does not preload heavy route-only vendor chunks", () => {
    if (!fs.existsSync(INDEX_HTML)) return; // not built in this environment
    const html = fs.readFileSync(INDEX_HTML, "utf-8");
    const preloads = [
      ...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g),
    ].map((m) => m[1]);

    const heavy = preloads.filter((href) =>
      /vendor-(charts|chess|three|leaflet|markdown)-/.test(href),
    );
    expect(heavy).toEqual([]);
  });

  it("keeps the modulepreload set small", () => {
    if (!fs.existsSync(INDEX_HTML)) return;
    const html = fs.readFileSync(INDEX_HTML, "utf-8");
    const preloads = [...html.matchAll(/rel="modulepreload"/g)];
    expect(preloads.length).toBeLessThanOrEqual(8);
  });
});
