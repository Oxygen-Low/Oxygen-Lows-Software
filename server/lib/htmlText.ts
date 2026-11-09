/**
 * Small, dependency-free HTML-to-text helpers.
 *
 * These are intentionally not HTML sanitizers: the output is plain text that
 * is never re-interpreted as markup. The tag scanner replaces regex-based
 * `<script>...</script>` stripping, which can be bypassed with malformed or
 * nested tags.
 */

function parseTag(raw: string): {
  name: string;
  closing: boolean;
  selfClosing: boolean;
} | null {
  const match = raw.match(/^\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/);
  if (!match) return null;

  const trimmed = raw.trim();
  return {
    name: match[1].toLowerCase(),
    closing: trimmed.startsWith("/"),
    selfClosing: /\/\s*$/.test(trimmed),
  };
}

function findBlockEnd(html: string, name: string, start: number): number {
  const tagPattern = new RegExp(`<\\/?${name}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = start;

  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    if (/^<\s*\//.test(match[0])) {
      depth--;
    } else if (!/\/\s*>$/.test(match[0])) {
      depth++;
    }
    if (depth <= 0) return tagPattern.lastIndex;
  }

  return html.length;
}

/**
 * Removes every tag (and comments), returning only text nodes. Text inside
 * `script`/`style` is not removed by this function; use
 * {@link removeHtmlElementBlocks} first when that content must be skipped.
 */
export function stripHtmlTags(html: string): string {
  let output = "";
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) {
      output += html.slice(index);
      break;
    }

    output += html.slice(index, open);

    if (html.startsWith("<!--", open)) {
      const commentEnd = html.indexOf("-->", open + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      output += " ";
      continue;
    }

    const close = html.indexOf(">", open + 1);
    if (close === -1) break;
    output += " ";
    index = close + 1;
  }

  return output;
}

/**
 * Removes the listed elements (opening tag, contents and closing tag) while
 * leaving all other markup untouched. Useful before extracting article
 * paragraphs, where `<p>`, `<article>`, etc. must survive.
 */
export function removeHtmlElementBlocks(
  html: string,
  tagNames: readonly string[],
): string {
  const skip = new Set(tagNames.map((tag) => tag.toLowerCase()));
  let output = "";
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) {
      output += html.slice(index);
      break;
    }

    output += html.slice(index, open);

    if (html.startsWith("<!--", open)) {
      const commentEnd = html.indexOf("-->", open + 4);
      index = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const close = html.indexOf(">", open + 1);
    if (close === -1) {
      output += html.slice(open);
      break;
    }

    const tag = parseTag(html.slice(open + 1, close));
    const tagEnd = close + 1;

    if (tag && !tag.closing && !tag.selfClosing && skip.has(tag.name)) {
      index = findBlockEnd(html, tag.name, tagEnd);
    } else {
      output += html.slice(open, tagEnd);
      index = tagEnd;
    }
  }

  return output;
}