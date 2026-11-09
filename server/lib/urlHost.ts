/**
 * Returns true when `input` parses as an absolute URL whose hostname is
 * exactly `hostname` or a subdomain of it.
 *
 * Parsing the URL (instead of checking for a substring) prevents bypasses such
 * as `https://stablehorde.net.attacker.example/` or
 * `https://attacker.example/?next=stablehorde.net`.
 */
export function isHostnameForUrl(input: unknown, hostname: string): boolean {
  try {
    const parsed = new URL(String(input));
    const expected = hostname.toLowerCase().replace(/^\.+|\.+$/g, "");
    const actual = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return actual === expected || actual.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}