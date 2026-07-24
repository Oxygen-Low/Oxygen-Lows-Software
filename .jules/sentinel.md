## 2024-07-17 - [SSRF Bypass via IPv6 Assignment to Node.js URL.hostname]

**Vulnerability:** A critical SSRF (Server-Side Request Forgery) vulnerability via DNS rebinding existed because `url.hostname` was directly assigned an IPv6 address (`firstAddress.address`) without brackets (`[]`). Node.js fails silently when setting an unbracketed IPv6 address to `url.hostname`, leaving the original hostname intact and bypassing IP pinning.
**Learning:** In Node.js, `URL.hostname` fails silently when assigned an unbracketed IPv6 address (e.g., `url.hostname = '2606:4700::1111'`). This can leave the original domain intact and bypass IP pinning or SSRF mitigations like DNS rebinding protection.
**Prevention:** Always use `net.isIPv6()` to bracket IPv6 addresses (e.g., `[2606:4700::1111]`) before assigning them to `url.hostname`.

## 2024-07-25 - [Hardcoded Supabase Credentials Exposure]
**Vulnerability:** Found hardcoded `supabaseUrl` (`https://vqmukrmpgvavscsyefqd.supabase.co`) and `supabaseAnonKey` (`sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q`) in multiple files across both the frontend (`client/lib/supabase.ts`) and backend (`server/routes/git.ts`, `server/routes/ai.ts`, `server/lib/repoManager.ts`, `server/lib/aikido.ts`, `server/lib/supabase.ts`, `server/lib/repoAuth.ts`) directories. Hardcoding secrets exposes them in source control and makes credential rotation difficult.
**Learning:** Even "anonymous" or "publishable" keys should not be hardcoded in the source code as it violates secure coding principles and complicates environment-specific deployments (like staging vs. production).
**Prevention:** Always use environment variables for connection strings and keys. Use `import.meta.env` for Vite frontend environments and `process.env` for Node.js backend environments.
