import { EventType } from "../types.js";

interface CompiledThreatPatterns {
  regex: RegExp;
  patterns: string[];
}

function compilePatterns(
  patterns: RegExp[],
  flags = "",
): CompiledThreatPatterns {
  const sources = patterns.map((p) => p.source);
  const combined = new RegExp(sources.map((s) => `(${s})`).join("|"), flags);
  return { regex: combined, patterns: sources };
}

const SQLI_PATTERNS = [
  /union\s+select/i,
  /or\s+1\s*=\s*1/i,
  /drop\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /update\s+.*?\s+set/i,
  /exec\s*\(/i,
  /xp_cmdshell/i,
  /sleep\s*\(/i,
  /benchmark\s*\(/i,
  /--\s*$/,
];

const SHELL_PATTERNS = [
  /;\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /\|\|\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /\|\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /`.*?`/i,
  /\$\(.*?\)/i,
  /&&\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /\/bin\/sh/i,
  /\/bin\/bash/i,
  /\bwget\b/i,
  /\bcurl\b/i,
  /\bnc\b/i,
  /\bncat\b/i,
];

const TRAVERSAL_PATTERNS = [/\.\.\//, /\.\.\\/, /%252e/i, /%2e%2e/i, /%00/];

const SSRF_PATTERNS = [
  /127\.0\.0\.1/,
  /10\.\d+\.\d+\.\d+/,
  /172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+/,
  /192\.168\.\d+\.\d+/,
  /169\.254\.\d+\.\d+/,
  /\[::1\]/,
];

const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /<\/script>/i,
  /javascript:\s*[^"'\s]+/i,
  /vbscript:\s*[^"'\s]+/i,
  /data:text\/(?:html|javascript)/i,
  /\bon(?:load|error|click|mouseover|mouseenter|focus|blur|change|submit|keydown|keypress|keyup)\s*=/i,
  /<(?:iframe|object|embed|applet)\b/i,
  /<(?:img|svg)\b[^>]*\bon[a-z]+\s*=/i,
  /(?:document|window)\.(?:cookie|location|localStorage|sessionStorage)/i,
];

const NOSQL_PATTERNS = [
  /\$where\b/i,
  /\$(?:gt|gte|lt|lte|ne|nin|in|regex|exists|all|size|or|and|nor|not)\s*[:=]/i,
  /["']\$(?:gt|gte|lt|lte|ne|nin|in|regex|exists|all|size|or|and|nor|not)["']\s*:/i,
  /\[\$(?:gt|gte|lt|lte|ne|nin|in|regex|exists|all|size|or|and|nor|not)\]/i,
  /\btojson\s*\(/i,
];

const PROTOTYPE_POLLUTION_PATTERNS = [
  /__proto__/i,
  /constructor\s*\.\s*prototype/i,
  /prototype\s*\[\s*["']?[a-zA-Z0-9_$]+["']?\s*\]/i,
  /__defineGetter__/i,
  /__defineSetter__/i,
  /__lookupGetter__/i,
  /__lookupSetter__/i,
];

const SQLI_COMPILED = compilePatterns(SQLI_PATTERNS, "i");
const SHELL_COMPILED = compilePatterns(SHELL_PATTERNS, "i");
const TRAVERSAL_COMPILED = compilePatterns(TRAVERSAL_PATTERNS, "i");
const SSRF_COMPILED = compilePatterns(SSRF_PATTERNS);
const XSS_COMPILED = compilePatterns(XSS_PATTERNS, "i");
const NOSQL_COMPILED = compilePatterns(NOSQL_PATTERNS, "i");
const PROTOTYPE_POLLUTION_COMPILED = compilePatterns(PROTOTYPE_POLLUTION_PATTERNS, "i");

function detectThreat(
  input: string,
  compiled: CompiledThreatPatterns,
): { detected: boolean; pattern?: string } {
  if (typeof input !== "string" || input.length === 0) {
    return { detected: false };
  }

  const match = compiled.regex.exec(input);
  if (!match) {
    return { detected: false };
  }

  for (let i = 1; i < match.length; i++) {
    if (match[i] !== undefined) {
      return { detected: true, pattern: compiled.patterns[i - 1] };
    }
  }

  return { detected: true };
}

export function detectSqlInjection(input: string): {
  detected: boolean;
  pattern?: string;
} {
  return detectThreat(input, SQLI_COMPILED);
}

export function detectShellInjection(input: string): {
  detected: boolean;
  pattern?: string;
} {
  return detectThreat(input, SHELL_COMPILED);
}

export function detectPathTraversal(input: string): {
  detected: boolean;
  pattern?: string;
} {
  return detectThreat(input, TRAVERSAL_COMPILED);
}

export function detectSsrf(input: string): {
  detected: boolean;
  pattern?: string;
} {
  return detectThreat(input, SSRF_COMPILED);
}

export function detectXss(input: string): {
  detected: boolean;
  pattern?: string;
} {
  return detectThreat(input, XSS_COMPILED);
}

export function detectNoSqlInjection(input: string): {
  detected: boolean;
  pattern?: string;
} {
  return detectThreat(input, NOSQL_COMPILED);
}

export function detectPrototypePollution(input: string): {
  detected: boolean;
  pattern?: string;
} {
  return detectThreat(input, PROTOTYPE_POLLUTION_COMPILED);
}

export interface ScanResult {
  threats: Array<{ type: EventType; pattern: string }>;
}

export function scanRequest(
  method: string,
  path: string,
  query: Record<string, string | string[]>,
  body: string,
  headers: Record<string, string | string[] | undefined>,
): ScanResult {
  const threats: Array<{ type: EventType; pattern: string }> = [];

  const inputs: string[] = [path, body];

  for (const key in query) {
    inputs.push(key);
    const val = query[key];
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        inputs.push(val[i]);
      }
    } else if (val) {
      inputs.push(val);
    }
  }

  for (const key in headers) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "cookie" || lowerKey === "referer") {
      const val = headers[key];
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          inputs.push(val[i]);
        }
      } else if (val) {
        inputs.push(val);
      }
    }
  }

  const combinedInput = inputs.join(" ");

  const sqlCheck = detectSqlInjection(combinedInput);
  if (sqlCheck.detected && sqlCheck.pattern)
    threats.push({ type: "sql_injection", pattern: sqlCheck.pattern });

  const shellCheck = detectShellInjection(combinedInput);
  if (shellCheck.detected && shellCheck.pattern)
    threats.push({ type: "shell_injection", pattern: shellCheck.pattern });

  const traversalCheck = detectPathTraversal(combinedInput);
  if (traversalCheck.detected && traversalCheck.pattern)
    threats.push({ type: "path_traversal", pattern: traversalCheck.pattern });

  const ssrfCheck = detectSsrf(combinedInput);
  if (ssrfCheck.detected && ssrfCheck.pattern)
    threats.push({ type: "ssrf", pattern: ssrfCheck.pattern });

  const xssCheck = detectXss(combinedInput);
  if (xssCheck.detected && xssCheck.pattern)
    threats.push({ type: "xss", pattern: xssCheck.pattern });

  const nosqlCheck = detectNoSqlInjection(combinedInput);
  if (nosqlCheck.detected && nosqlCheck.pattern)
    threats.push({ type: "nosql_injection", pattern: nosqlCheck.pattern });

  const protoCheck = detectPrototypePollution(combinedInput);
  if (protoCheck.detected && protoCheck.pattern)
    threats.push({ type: "prototype_pollution", pattern: protoCheck.pattern });

  return { threats };
}
