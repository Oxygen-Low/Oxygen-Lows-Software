## 2026-07-05 - Undici Vulnerability (CVE-2026-12151)
**Vulnerability:** CVE-2026-12151 in Undici <= 7.28.0 allowed potential security issues.
**Learning:** Upgrading to Undici 8.x broke compatibility with JSDOM 29.1.1 due to the removal of internal handlers (wrap-handler.js and unwrap-handler.js).
**Prevention:** Use pnpm overrides to force patched versions of sub-dependencies, but verify compatibility with top-level packages. In this case, patching JSDOM was necessary to restore functionality.
