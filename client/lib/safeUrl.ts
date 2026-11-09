const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

/**
 * Parses an untrusted URL and returns it only when its scheme is allowed.
 *
 * The result is passed through a global meta-character replacement before it
 * is written to a URL attribute. `new URL(...).href` already percent-encodes
 * these characters, but making the escaping explicit keeps the value safe even
 * for non-standard URL implementations and documents the requirement at the
 * call site.
 */
export function sanitizeUrlForAttribute(
  raw: string | null | undefined,
  allowedProtocols: readonly string[] = ["http:", "https:"],
): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
    const isProtocolRelative = value.startsWith("//");
    const isRelativePath =
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../") ||
      value.startsWith("?") ||
      value.startsWith("#");
    const looksLikeBareHost = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}($|\/|\?|#)/.test(value);
    const candidate = hasScheme
      ? value
      : isProtocolRelative
        ? `https:${value}`
        : !isRelativePath && looksLikeBareHost
          ? `https://${value}`
          : value;
    const parsed = new URL(candidate, window.location.origin);
    if (!allowedProtocols.includes(parsed.protocol)) return "";

    if (parsed.protocol === "data:" && !SAFE_IMAGE_DATA_URL.test(value)) {
      return "";
    }

    const href =
      parsed.protocol === "data:" || parsed.protocol === "blob:"
        ? value
        : parsed.href;

    return href
      .replace(/</g, "%3C")
      .replace(/>/g, "%3E")
      .replace(/"/g, "%22");
  } catch {
    return "";
  }
}

/** Returns true when the URL's hostname is `hostname` or one of its subdomains. */
export function urlHasHostname(raw: string | null | undefined, hostname: string): boolean {
  try {
    const value = String(raw ?? "").trim();
    if (!value) return false;
    const parsed = new URL(value, window.location.origin);
    const expected = hostname.toLowerCase().replace(/^\.+|\.+$/g, "");
    const actual = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return actual === expected || actual.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}