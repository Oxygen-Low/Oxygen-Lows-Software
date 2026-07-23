## 2024-03-24 - Hardcoded Supabase Secrets in Frontend and Backend

**Vulnerability:** Supabase URL and Anon Key were hardcoded across multiple frontend and backend files, as well as CSP headers.
**Learning:** Secrets should never be hardcoded, even public ones like Anon Keys, as they hinder environment configuration and can expose specific database environments unnecessarily. The VITE_ prefix is required for Vite to expose them to the frontend, and `dotenv/config` exposes Vite-prefixed variables to the Node backend.
**Prevention:** Always use `import.meta.env` (frontend) or `process.env` (backend) for environment variables instead of string literals.
