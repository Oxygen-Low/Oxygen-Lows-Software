## 2024-07-17 - [SSRF Bypass via IPv6 Assignment to Node.js URL.hostname]

**Vulnerability:** A critical SSRF (Server-Side Request Forgery) vulnerability via DNS rebinding existed because `url.hostname` was directly assigned an IPv6 address (`firstAddress.address`) without brackets (`[]`). Node.js fails silently when setting an unbracketed IPv6 address to `url.hostname`, leaving the original hostname intact and bypassing IP pinning.
**Learning:** In Node.js, `URL.hostname` fails silently when assigned an unbracketed IPv6 address (e.g., `url.hostname = '2606:4700::1111'`). This can leave the original domain intact and bypass IP pinning or SSRF mitigations like DNS rebinding protection.
**Prevention:** Always use `net.isIPv6()` to bracket IPv6 addresses (e.g., `[2606:4700::1111]`) before assigning them to `url.hostname`.

## 2026-07-28 - [Command Injection via Process.Start with Untrusted URIs]

**Vulnerability:** A critical command/process injection vulnerability could exist in `MainWindow.xaml.cs` when using `Process.Start` with dynamic user-controlled URIs during OAuth flows. If the URI scheme or host were not strictly validated, an attacker could potentially launch local system files, executables, or craft malicious URI schemes.
**Learning:** Passing dynamic or unvalidated URLs directly to `Process.Start` with `UseShellExecute = true` can trigger security scanner alerts and potentially lead to OS command/process starting injection if the scheme or hostname is manipulated.
**Prevention:** Always enforce strict whitelist validation on any URLs passed to `Process.Start` by verifying that the scheme is strictly `https`, the host belongs to a hardcoded list of allowed domains, and the path matches the expected endpoint pattern.

## 2024-05-18 - [SSRF Bypass via Weak Subdomain Validation]

**Vulnerability:** A Server-Side Request Forgery (SSRF) bypass existed in the proxy service because subdomain validation relied on a simple `hostname.endsWith(domain)` check, allowing malicious domains like `attacker-api.github.com` to bypass the `api.github.com` allowlist.
**Learning:** `String.prototype.endsWith()` is insufficient for subdomain validation as it allows suffix matches that are part of the base domain name (e.g., `attacker-api.github.com` ends with `api.github.com` but is not a subdomain of `api.github.com`).
**Prevention:** Always check for an exact match or use `hostname.endsWith("." + domain)` to ensure the string boundary correctly separates the subdomain from the allowed base domain.
