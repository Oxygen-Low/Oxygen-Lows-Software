/**
 * Normalises an untrusted relative storage path.
 *
 * Path segments are split and inspected individually, so traversal segments
 * (`..`) are always removed regardless of how many slashes or dots an attacker
 * combines. This replaces regex-based `../` stripping, which can leave a new
 * traversal sequence behind after a single replacement.
 */
export function normalizeRelativePath(input: string | null | undefined): string {
  const value = String(input ?? "").replace(/\\/g, "/");
  const segments = value.split("/");
  const safeSegments: string[] = [];

  for (const segment of segments) {
    // Drop empty segments, current/parent directory markers, and runs of dots
    // left behind by repeated `../` stripping (for example `....//`).
    if (!segment || segment === "." || segment === ".." || /^\.+$/.test(segment)) continue;
    safeSegments.push(segment);
  }

  return safeSegments.join("/");
}