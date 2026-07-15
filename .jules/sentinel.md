## 2025-02-28 - SSRF DNS Rebinding Mitigation Bypass via IPv6 Assignment

**Vulnerability:** In Node.js, setting `URL.hostname` with an unbracketed IPv6 address fails silently. This bypasses DNS rebinding protection (which pins the hostname to the resolved IP address) and leaves the original potentially malicious hostname intact, allowing SSRF attacks.
**Learning:** `URL.hostname` assignment in Node.js does not automatically bracket IPv6 addresses, and fails silently on unbracketed IPv6 addresses, preserving the original hostname which could be used to exploit SSRF via DNS rebinding.
**Prevention:** Always use `net.isIPv6(ip)` to check if the address is IPv6 and wrap it in brackets `[` and `]` (e.g., `[2606:4700::1111]`) before assigning it to `URL.hostname`.
