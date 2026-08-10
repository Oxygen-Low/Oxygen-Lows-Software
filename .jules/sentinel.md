## 2024-05-18 - SSRF Domain Bypass in Proxy Endpoint
**Vulnerability:** A domain whitelist check in `server/routes/proxy.ts` used `hostname.endsWith(domain)` to validate the requested URL. This is a common flaw that allows bypassing the whitelist by using an attacker-controlled domain that ends with the whitelisted domain string (e.g., `attacker-api.github.com` bypasses the check for `api.github.com`).
**Learning:** Naive suffix matching on hostnames is insecure and easily bypassed.
**Prevention:** Always validate hostnames using exact matching or proper subdomain validation (e.g., `hostname === domain || hostname.endsWith("." + domain)`).
