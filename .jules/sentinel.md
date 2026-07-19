## 2024-07-17 - [SSRF Bypass via IPv6 Assignment to Node.js URL.hostname]

**Vulnerability:** A critical SSRF (Server-Side Request Forgery) vulnerability via DNS rebinding existed because `url.hostname` was directly assigned an IPv6 address (`firstAddress.address`) without brackets (`[]`). Node.js fails silently when setting an unbracketed IPv6 address to `url.hostname`, leaving the original hostname intact and bypassing IP pinning.
**Learning:** In Node.js, `URL.hostname` fails silently when assigned an unbracketed IPv6 address (e.g., `url.hostname = '2606:4700::1111'`). This can leave the original domain intact and bypass IP pinning or SSRF mitigations like DNS rebinding protection.
**Prevention:** Always use `net.isIPv6()` to bracket IPv6 addresses (e.g., `[2606:4700::1111]`) before assigning them to `url.hostname`.

## 2026-07-19 - [Hardcoded Supabase Credentials]

**Vulnerability:** Supabase URL and anonymous key are hardcoded in `server/routes/ai.ts` and `client/lib/supabase.ts`.
**Learning:** Hardcoding credentials can lead to unauthorized access and security breaches. Always use environment variables for sensitive configuration data.
**Prevention:** Use `import.meta.env` in the Vite frontend and `process.env` in the Node.js backend to access environment variables. Ensure credentials are not committed to source control.
