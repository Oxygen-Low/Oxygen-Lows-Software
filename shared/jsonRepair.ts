/**
 * Resilient JSON Repair and Safe Parsing Utility
 *
 * Automatically repairs common LLM JSON generation quirks:
 * - Markdown fences (```json ... ```) and conversational preambles/postscripts
 * - Unquoted object keys ({ foo: "bar" } -> { "foo": "bar" })
 * - Single-quoted strings and keys ('foo': 'bar' -> "foo": "bar")
 * - Trailing commas in objects and arrays ({ "a": 1, } -> { "a": 1 })
 * - Python / pseudocode literals (True -> true, False -> false, None -> null)
 * - Single-line and multi-line comments
 * - Unescaped newlines and control characters inside string literals
 * - Truncated JSON responses (premature EOF, dangling keys, unclosed quotes & brackets)
 */

/**
 * Repairs a malformed or truncated JSON string into valid JSON.
 * Throws an Error if no valid JSON structure could be identified or repaired.
 */
export function repairJson(raw: string): string {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    throw new Error("Empty response received from generator");
  }

  const trimmed = raw.trim();

  // Fast-path: check if already valid JSON
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Continue to repair pipeline
  }

  // 1. Extract candidate from markdown code blocks or outermost boundary
  let text = extractCandidateString(trimmed);

  // Quick check: does the candidate have any JSON opening structure?
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");

  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx === -1) {
    // Check if it's a quoted primitive or numeric/boolean primitive
    try {
      JSON.parse(text);
      return text;
    } catch {
      throw new Error("Failed to parse structured JSON from generator output");
    }
  }

  text = text.slice(startIdx);

  // 2. Remove comments (outside strings)
  text = stripComments(text);

  // 3. Normalize Python literals outside strings (True, False, None)
  text = normalizeLiterals(text);

  // 4. Token-level repair for quotes, keys, trailing commas, and unclosed brackets
  const repaired = repairTokensAndTruncation(text);

  // Validate that the repaired string actually parses
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    // If token repair still failed, try aggressive fallback cleanups
    const fallbackCleaned = aggressiveCleanAndClose(repaired);
    try {
      JSON.parse(fallbackCleaned);
      return fallbackCleaned;
    } catch {
      throw new Error("Failed to parse structured JSON from generator output");
    }
  }
}

/**
 * Safely parses a JSON string, applying automatic repair if needed.
 * If fallback is provided and parsing fails, returns fallback.
 */
export function safeParseJson<T = unknown>(raw: string, fallback?: T): T {
  try {
    return JSON.parse(raw);
  } catch {
    // Try repair
  }

  try {
    const repaired = repairJson(raw);
    return JSON.parse(repaired) as T;
  } catch (err) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw err;
  }
}

/**
 * Extracts candidate JSON string from markdown fences or trims text
 */
function extractCandidateString(raw: string): string {
  // Check for ```json ... ``` or ``` ... ```
  const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (mdMatch && mdMatch[1].trim()) {
    const candidate = mdMatch[1].trim();
    // Verify it contains a brace or bracket
    if (candidate.includes("{") || candidate.includes("[")) {
      return candidate;
    }
  }
  return raw;
}

/**
 * Strips // and /* * / comments outside of string literals
 */
function stripComments(input: string): string {
  let output = "";
  let inString = false;
  let quoteChar = "";
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      output += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === quoteChar) {
        inString = false;
      }
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        quoteChar = char;
        output += char;
      } else if (char === "/" && input[i + 1] === "/") {
        // Skip until newline
        while (i < input.length && input[i] !== "\n" && input[i] !== "\r") {
          i++;
        }
        if (i < input.length) {
          output += input[i];
        }
      } else if (char === "/" && input[i + 1] === "*") {
        // Skip until */
        i += 2;
        while (i < input.length - 1 && !(input[i] === "*" && input[i + 1] === "/")) {
          i++;
        }
        i++; // skip /
      } else {
        output += char;
      }
    }
  }
  return output;
}

/**
 * Normalizes Python/pseudocode literals outside strings
 */
function normalizeLiterals(input: string): string {
  let output = "";
  let inString = false;
  let quoteChar = "";
  let isEscaped = false;

  let i = 0;
  while (i < input.length) {
    const char = input[i];

    if (inString) {
      output += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === quoteChar) {
        inString = false;
      }
      i++;
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        quoteChar = char;
        output += char;
        i++;
      } else if (char === "T" && input.slice(i, i + 4) === "True" && isBoundary(input, i - 1, i + 4)) {
        output += "true";
        i += 4;
      } else if (char === "F" && input.slice(i, i + 5) === "False" && isBoundary(input, i - 1, i + 5)) {
        output += "false";
        i += 5;
      } else if (char === "N" && input.slice(i, i + 4) === "None" && isBoundary(input, i - 1, i + 4)) {
        output += "null";
        i += 4;
      } else if (char === "u" && input.slice(i, i + 9) === "undefined" && isBoundary(input, i - 1, i + 9)) {
        output += "null";
        i += 9;
      } else if (char === "N" && input.slice(i, i + 3) === "NaN" && isBoundary(input, i - 1, i + 3)) {
        output += "null";
        i += 3;
      } else {
        output += char;
        i++;
      }
    }
  }
  return output;
}

function isBoundary(str: string, beforeIdx: number, afterIdx: number): boolean {
  const isWordChar = (c: string) => /[a-zA-Z0-9_]/.test(c);
  if (beforeIdx >= 0 && isWordChar(str[beforeIdx])) return false;
  if (afterIdx < str.length && isWordChar(str[afterIdx])) return false;
  return true;
}

/**
 * State machine to repair:
 * - Single quotes around keys/values -> double quotes
 * - Unquoted object keys -> double quoted keys
 * - Trailing commas before } or ]
 * - Unclosed strings and truncated structures
 */
function repairTokensAndTruncation(input: string): string {
  let output = "";
  const stack: Array<"{" | "["> = [];
  let inDouble = false;
  let inSingle = false;
  let isEscaped = false;

  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    if (inDouble) {
      if (isEscaped) {
        output += char;
        isEscaped = false;
      } else if (char === "\\") {
        output += char;
        isEscaped = true;
      } else if (char === '"') {
        output += char;
        inDouble = false;
      } else if (char === "\n") {
        // Escape literal newlines inside strings
        output += "\\n";
      } else if (char === "\r") {
        // Skip carriage return
      } else if (char === "\t") {
        output += "\\t";
      } else {
        output += char;
      }
      i++;
      continue;
    }

    if (inSingle) {
      if (isEscaped) {
        output += char;
        isEscaped = false;
      } else if (char === "\\") {
        // Look ahead: if escaping single quote, we will unescape or convert
        if (i + 1 < len && input[i + 1] === "'") {
          output += "'";
          i += 2;
          continue;
        } else {
          output += char;
          isEscaped = true;
        }
      } else if (char === "'") {
        // End of single-quoted string -> convert to double quote
        output += '"';
        inSingle = false;
      } else if (char === '"') {
        // Embedded double quote in single-quoted string -> escape it
        output += '\\"';
      } else if (char === "\n") {
        output += "\\n";
      } else if (char === "\r") {
        // Skip
      } else if (char === "\t") {
        output += "\\t";
      } else {
        output += char;
      }
      i++;
      continue;
    }

    // Outside of any string
    if (char === '"') {
      inDouble = true;
      output += char;
      i++;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      output += '"';
      i++;
      continue;
    }

    if (char === "{") {
      stack.push("{");
      output += char;
      i++;
      continue;
    }

    if (char === "[") {
      stack.push("[");
      output += char;
      i++;
      continue;
    }

    if (char === "}") {
      // Clean any trailing comma before }
      output = removeTrailingComma(output);
      if (stack.length > 0 && stack[stack.length - 1] === "{") {
        stack.pop();
      }
      output += char;
      i++;
      if (stack.length === 0) {
        // Reached outermost closing brace!
        return output;
      }
      continue;
    }

    if (char === "]") {
      // Clean any trailing comma before ]
      output = removeTrailingComma(output);
      if (stack.length > 0 && stack[stack.length - 1] === "[") {
        stack.pop();
      }
      output += char;
      i++;
      if (stack.length === 0) {
        // Reached outermost closing bracket!
        return output;
      }
      continue;
    }

    // Check for unquoted key: when inside an object '{', looking for identifier followed by ':'
    if (stack.length > 0 && stack[stack.length - 1] === "{" && isIdentifierStart(char)) {
      // Read entire identifier
      let ident = "";
      let j = i;
      while (j < len && isIdentifierChar(input[j])) {
        ident += input[j];
        j++;
      }

      // Check if subsequent non-whitespace char is ':'
      let k = j;
      while (k < len && /\s/.test(input[k])) {
        k++;
      }

      if (k < len && input[k] === ":") {
        output += `"${ident}"`;
        i = j;
        continue;
      }
    }

    output += char;
    i++;
  }

  // --- Premature EOF / Truncation Recovery ---

  // If ended while still inside a string, close the string
  if (inDouble || inSingle) {
    output += '"';
  }

  // Clean trailing spaces and dangling commas/colons/keys
  const currentContainer = stack.length > 0 ? stack[stack.length - 1] : undefined;
  output = cleanDanglingTruncation(output, currentContainer);

  // Close all remaining unclosed brackets and braces in LIFO order
  while (stack.length > 0) {
    const openType = stack.pop();
    output = removeTrailingComma(output);
    if (openType === "{") {
      output += "}";
    } else if (openType === "[") {
      output += "]";
    }
  }

  return output;
}

function isIdentifierStart(c: string): boolean {
  return /[a-zA-Z_$]/.test(c);
}

function isIdentifierChar(c: string): boolean {
  return /[a-zA-Z0-9_$-]/.test(c);
}

function removeTrailingComma(str: string): string {
  return str.replace(/,\s*$/, "");
}

/**
 * Cleans dangling keys or trailing colons/commas at the truncated end of an object
 * e.g.:
 *   {"a": 1, "b":        -> {"a": 1
 *   {"a": 1, "b"         -> {"a": 1
 *   {"a": 1,             -> {"a": 1
 */
function cleanDanglingTruncation(str: string, currentContainer?: "{" | "["): string {
  let s = str.trimEnd();

  // If ends with a dangling colon: e.g. "key":
  if (s.endsWith(":")) {
    s = s.slice(0, -1).trimEnd();
    // Now remove the key if it was quoted or unquoted
    s = s.replace(/,\s*(?:"[^"]*"|'[^']*'|[a-zA-Z0-9_$]+)\s*$/, "").trimEnd();
  } else if (currentContainer === "{") {
    // Only in an object: an item after a comma that didn't have a colon is a dangling key!
    s = s.replace(/,\s*(?:"[^"]*"|'[^']*'|[a-zA-Z0-9_$]+)\s*$/, "").trimEnd();
  }

  // Remove any leftover trailing comma
  s = s.replace(/,\s*$/, "").trimEnd();

  return s;
}

/**
 * Aggressive fallback cleaner if standard repair leaves syntax invalid
 */
function aggressiveCleanAndClose(input: string): string {
  let s = input.trim();

  // Strip trailing commas before closing braces/brackets
  s = s.replace(/,\s*([}\]])/g, "$1");

  // Balance unmatched braces/brackets
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (isEscaped) isEscaped = false;
      else if (c === "\\") isEscaped = true;
      else if (c === '"') inString = false;
    } else {
      if (c === '"') inString = true;
      else if (c === "{") openBraces++;
      else if (c === "}") openBraces = Math.max(0, openBraces - 1);
      else if (c === "[") openBrackets++;
      else if (c === "]") openBrackets = Math.max(0, openBrackets - 1);
    }
  }

  if (inString) {
    s += '"';
  }

  s = cleanDanglingTruncation(s);

  while (openBraces > 0) {
    s += "}";
    openBraces--;
  }
  while (openBrackets > 0) {
    s += "]";
    openBrackets--;
  }

  return s;
}
