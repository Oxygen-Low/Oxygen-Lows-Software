## 2025-02-14 - [SSRF Bypass via Node.js URL Hostname IPv6 Handling]
**Vulnerability:** Node.js' `URL.hostname` setter fails silently when assigned an unbracketed IPv6 address. This allowed SSRF/DNS rebinding protection bypass in `resolveCustomProviderUrl` because the IP pinning logic (`url.hostname = firstAddress.address`) would silently fail for IPv6 addresses, keeping the original unpinned hostname in place.
**Learning:** Always explicitly format IPv6 addresses with brackets (`[ ]`) when assigning to `URL.hostname` or dealing with Node.js URL parsing.
**Prevention:** Always use a helper or explicit check like `net.isIPv6(ip) ? \`[\${ip}]\` : ip` when pinning or explicitly assigning IPs to URL properties.
