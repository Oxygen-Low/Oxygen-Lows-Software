## 2024-07-17 - [SSRF Bypass via IPv6 Assignment to Node.js URL.hostname]

**Vulnerability:** A critical SSRF (Server-Side Request Forgery) vulnerability via DNS rebinding existed because `url.hostname` was directly assigned an IPv6 address (`firstAddress.address`) without brackets (`[]`). Node.js fails silently when setting an unbracketed IPv6 address to `url.hostname`, leaving the original hostname intact and bypassing IP pinning.
**Learning:** In Node.js, `URL.hostname` fails silently when assigned an unbracketed IPv6 address (e.g., `url.hostname = '2606:4700::1111'`). This can leave the original domain intact and bypass IP pinning or SSRF mitigations like DNS rebinding protection.
**Prevention:** Always use `net.isIPv6()` to bracket IPv6 addresses (e.g., `[2606:4700::1111]`) before assigning them to `url.hostname`.

## 2024-05-18 - Hardcoded Supabase Secrets in Backend

**Vulnerability:** Hardcoded Supabase URL and anon keys found across the backend and frontend.
**Learning:** Hardcoding API keys is a major security flaw allowing exploitation.
**Prevention:** Always use environment variables for sensitive info (`import.meta.env` for Vite or `process.env` in node).
