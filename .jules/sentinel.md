## 2024-07-17 - [SSRF Bypass via IPv6 Assignment to Node.js URL.hostname]

**Vulnerability:** A critical SSRF (Server-Side Request Forgery) vulnerability via DNS rebinding existed because `url.hostname` was directly assigned an IPv6 address (`firstAddress.address`) without brackets (`[]`). Node.js fails silently when setting an unbracketed IPv6 address to `url.hostname`, leaving the original hostname intact and bypassing IP pinning.
**Learning:** In Node.js, `URL.hostname` fails silently when assigned an unbracketed IPv6 address (e.g., `url.hostname = '2606:4700::1111'`). This can leave the original domain intact and bypass IP pinning or SSRF mitigations like DNS rebinding protection.
**Prevention:** Always use `net.isIPv6()` to bracket IPv6 addresses (e.g., `[2606:4700::1111]`) before assigning them to `url.hostname`.

## 2024-07-22 - [Hardcoded Supabase Credentials]
**Vulnerability:** Supabase URL and Anon Key were hardcoded across multiple frontend and backend files (e.g., `client/lib/supabase.ts`, `server/lib/supabase.ts`, `server/routes/ai.ts`), and Content Security Policy directives in `server/index.ts`.
**Learning:** Hardcoded credentials leak sensitive configuration and prevent different environments (like staging and production) from using their own unique credentials, violating security best practices.
**Prevention:** Always use environment variables (e.g., `process.env.VITE_SUPABASE_URL` in Node and `import.meta.env.VITE_SUPABASE_URL` in Vite/React) to inject configuration at runtime.
