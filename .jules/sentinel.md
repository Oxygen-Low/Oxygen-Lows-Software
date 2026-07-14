## 2026-06-21 - CSS Variable Syntax in Media Queries

**Vulnerability:** CSS variables cannot be used directly in media queries without a pre-processor. Using them (e.g., `@media (width >= --breakpoint-2xl)`) causes minification tools like LightningCSS to crash, leading to build failures.
**Learning:** Tailwind 4 uses @theme for variables, but standard CSS media queries still require literal values or pre-processor resolution.
**Prevention:** Always use literal values or properly configured Tailwind theme breakpoints for media queries to ensure build stability.

## 2026-06-21 - Aikido Zen ESM Initialization

**Vulnerability:** ESM applications require specific initialization for security middleware like Aikido Zen. Using CommonJS flags (`-r`) in an ESM environment (`"type": "module"`) triggers warnings and potentially incomplete protection.
**Learning:** Node.js ESM mode requires the `--import` flag for module instrumentation instead of `-r`.
**Prevention:** Ensure `package.json` scripts use `--import @aikidosec/firewall/instrument` for ESM projects and that the firewall is imported as the very first module in entry points.

## 2026-07-14 - Hardcoded Supabase Credentials
**Vulnerability:** Found hardcoded `supabaseUrl` and `supabaseAnonKey` credentials in frontend and backend source files instead of using environment variables.
**Learning:** Hardcoded secrets in client and server bundles expose sensitive connection details to version control and clients, preventing environment-specific deployments and making secret rotation difficult.
**Prevention:** Always read environment variables using `import.meta.env.*` for the Vite client build and `process.env.*` for the Node.js server to ensure secure, configurable secret management.
