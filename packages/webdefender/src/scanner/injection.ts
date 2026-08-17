import { EventType } from '../types.js';

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
  /--\s*$/
];

const SHELL_PATTERNS = [
  /;\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /\|\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /`.*?`/i,
  /\$\(.*?\)/i,
  /&&\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /\|\|\s*(?:ls|cat|rm|pwd|whoami|echo)/i,
  /\/bin\/sh/i,
  /\/bin\/bash/i,
  /\bwget\b/i,
  /\bcurl\b/i,
  /\bnc\b/i,
  /\bncat\b/i
];

const TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e/i,
  /%252e/i,
  /%00/
];

const SSRF_PATTERNS = [
  /127\.0\.0\.1/,
  /10\.\d+\.\d+\.\d+/,
  /172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+/,
  /192\.168\.\d+\.\d+/,
  /169\.254\.\d+\.\d+/,
  /\[::1\]/
];

export function detectSqlInjection(input: string): { detected: boolean; pattern?: string } {
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(input)) {
      return { detected: true, pattern: pattern.source };
    }
  }
  return { detected: false };
}

export function detectShellInjection(input: string): { detected: boolean; pattern?: string } {
  for (const pattern of SHELL_PATTERNS) {
    if (pattern.test(input)) {
      return { detected: true, pattern: pattern.source };
    }
  }
  return { detected: false };
}

export function detectPathTraversal(input: string): { detected: boolean; pattern?: string } {
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (pattern.test(input)) {
      return { detected: true, pattern: pattern.source };
    }
  }
  return { detected: false };
}

export function detectSsrf(input: string): { detected: boolean; pattern?: string } {
  for (const pattern of SSRF_PATTERNS) {
    if (pattern.test(input)) {
      return { detected: true, pattern: pattern.source };
    }
  }
  return { detected: false };
}

export interface ScanResult {
  threats: Array<{ type: EventType; pattern: string }>;
}

export function scanRequest(
  method: string,
  path: string,
  query: Record<string, string | string[]>,
  body: string,
  headers: Record<string, string | string[] | undefined>
): ScanResult {
  const threats: Array<{ type: EventType; pattern: string }> = [];
  
  const inputs: string[] = [path, body];
  
  for (const key in query) {
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
    if (lowerKey === 'cookie' || lowerKey === 'referer') {
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
  
  const combinedInput = inputs.join(' ');

  const sqlCheck = detectSqlInjection(combinedInput);
  if (sqlCheck.detected && sqlCheck.pattern) threats.push({ type: 'sql_injection', pattern: sqlCheck.pattern });

  const shellCheck = detectShellInjection(combinedInput);
  if (shellCheck.detected && shellCheck.pattern) threats.push({ type: 'shell_injection', pattern: shellCheck.pattern });

  const traversalCheck = detectPathTraversal(combinedInput);
  if (traversalCheck.detected && traversalCheck.pattern) threats.push({ type: 'path_traversal', pattern: traversalCheck.pattern });

  const ssrfCheck = detectSsrf(combinedInput);
  if (ssrfCheck.detected && ssrfCheck.pattern) threats.push({ type: 'ssrf', pattern: ssrfCheck.pattern });

  return { threats };
}
