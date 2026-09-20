import crypto from "node:crypto";

export interface ScanResult {
  safe: boolean;
  severity: number; // 0 = safe, 1 = borderline, 2 = unsafe/prohibited, 3 = critical (CSAM/CSAE)
  category?: string;
  reason?: string;
  details?: Record<string, any>;
}

// Normalized leetspeak & homoglyph character mappings
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "|": "l",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  "$": "s",
  "7": "t",
  "+": "t",
  "8": "b",
  "9": "g",
};

/**
 * Normalizes text to strip diacritics, invisible characters, and leetspeak substitutions.
 * Also collapses spaced-out or punctuation-separated individual letters (e.g. "c.h.i.l.d").
 */
export function normalizeSafetyText(input: string): string {
  if (!input) return "";

  // 1. Unicode NFKD decomposition to remove accents and homoglyph combining marks
  let normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remove zero-width spaces, joiners, direction marks, control characters
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "")
    .toLowerCase();

  // 2. Replace common leetspeak characters
  let leetCleaned = "";
  for (const ch of normalized) {
    leetCleaned += LEET_MAP[ch] || ch;
  }

  // 3. Remove punctuation between characters (e.g. "p.o.r.n" or "c_h_i_l_d")
  const collapsedPunctuation = leetCleaned.replace(/[-_.*~/\\|!?,;:()[\]{}]+/g, " ");

  // 4. Collapse sequences of isolated single letters (e.g. "c h i l d" -> "child")
  const wordsJoined = collapsedPunctuation.replace(/\b([a-z])\s+(?=[a-z]\b)/gi, "$1");

  return `${leetCleaned} | ${collapsedPunctuation} | ${wordsJoined}`;
}

// Severe CSAM / CSAE specific high-confidence terms and combinations
const CSAM_CRITICAL_PATTERNS = [
  /\b(csam|csae|child\s*porn|pedophi|paedophi|cp\s*links?|lolicon|shotacon|child\s*erotica|infant\s*sex|toddler\s*sex)\b/i,
  /\b(underage|minor|child|infant|toddler|kindergarten|preteen|elementary\s*school)\b.*\b(nude|naked|erotic|sex|sexy|intercourse|genitals?|penetrat|masturbat|stripping|orgasm|molest|blowjob|rape)\b/i,
  /\b(nude|naked|erotic|sex|sexy|intercourse|genitals?|penetrat|masturbat|stripping|orgasm|molest|blowjob|rape)\b.*\b(underage|minor|child|infant|toddler|kindergarten|preteen|elementary\s*school)\b/i,
  /\b(bare|unclothed|topless|bottomless|undressed)\b.*\b(child|minor|underage|little\s*(girl|boy)|infant|toddler|preteen|teenager|teen|kid)\b/i,
  /\b(child|minor|underage|little\s*(girl|boy)|infant|toddler|preteen|teenager|teen|kid)\b.*\b(bare|unclothed|topless|bottomless|undressed)\b/i,
  /\b(young|little)\s*(girl|boy|child|kid)\b.*\b(nude|naked|sex|sexy|erotic|undressed|bikini|bed)\b/i,
  /\b(nude|naked|sex|sexy|erotic|undressed|bikini|bed)\b.*\b(young|little)\s*(girl|boy|child|kid)\b/i,
  /\b(pre-?pubescent|school\s*child)\b.*\b(explicit|sensual|seductive|fetish|provocative|nude|naked|erotic)\b/i,
  /\b(explicit|sensual|seductive|fetish|provocative|nude|naked|erotic)\b.*\b(pre-?pubescent|school\s*child)\b/i,
];

/**
 * Synthetic test canary token (100-character random string) used for automated testing
 * without containing illicit phrases in test suites.
 */
export const CSAM_TEST_CANARY =
  "kX9vL2mQ7pT4wY1zB8cD3fG6hJ0nS5uV9xZ2aC4eE7gH1jK3mP5rT8vW0yB2dF4gH6jK8mN0pQ2sT4vW6xY8zA1bC3dE5fG7hJ9k";

// Borderline patterns that warrant cloud AI verification if Azure is configured
const SUSPICIOUS_PATTERNS = [
  /\b(schoolgirl|schoolboy|teenager|teen|youth|minor|young|kid)\b.*\b(bedroom|bath|shower|underwear|lingerie|revealing|sensual)\b/i,
  /\b(bedroom|bath|shower|underwear|lingerie|revealing|sensual)\b.*\b(schoolgirl|schoolboy|teenager|teen|youth|minor|young|kid)\b/i,
  /\b(jailbreak|unfilter|bypass|nsfw|uncensored)\b.*\b(girl|boy|child|kid|teen)\b/i,
];

/**
 * Tier 1: Zero-latency local regex and heuristic scan.
 */
export function scanTextLocally(text: string): ScanResult {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { safe: true, severity: 0 };
  }

  // Fast check for synthetic test canary token (100 chars)
  if (text.includes(CSAM_TEST_CANARY)) {
    return {
      safe: false,
      severity: 3,
      category: "CSAM/CSAE",
      reason: "Matched prohibited child exploitation or illicit minor safety pattern",
    };
  }

  const normalized = normalizeSafetyText(text);

  // Check critical CSAM combinations
  for (const pattern of CSAM_CRITICAL_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(text)) {
      return {
        safe: false,
        severity: 3,
        category: "CSAM/CSAE",
        reason: "Matched prohibited child exploitation or illicit minor safety pattern",
      };
    }
  }

  // Check borderline / suspicious combinations
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(text)) {
      return {
        safe: true, // not outright rejected locally unless confirmed or severe
        severity: 1,
        category: "suspicious_minor_context",
        reason: "Detected potentially sensitive minor context",
      };
    }
  }

  return { safe: true, severity: 0 };
}

/**
 * Tier 2: Azure AI Content Safety Text API (if configured via env vars).
 */
export async function checkAzureTextContentSafety(text: string): Promise<ScanResult | null> {
  const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
  const key = process.env.AZURE_CONTENT_SAFETY_KEY;

  if (!endpoint || !key) {
    return null;
  }

  try {
    const url = `${endpoint.replace(/\/+$/, "")}/contentsafety/text:analyze?api-version=2024-09-01`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 1000),
        categories: ["Sexual", "Hate", "Violence", "SelfHarm"],
      }),
    });

    if (!res.ok) {
      console.warn("Azure Content Safety Text API returned error:", res.status);
      return null;
    }

    const data: any = await res.json();
    const categoriesAnalysis = data.categoriesAnalysis || [];
    const sexualCategory = categoriesAnalysis.find((c: any) => c.category === "Sexual");

    if (sexualCategory && sexualCategory.severity >= 2) {
      return {
        safe: false,
        severity: 2,
        category: "Sexual",
        reason: `Azure Content Safety flagged Sexual severity level ${sexualCategory.severity}`,
        details: data,
      };
    }

    return { safe: true, severity: 0, details: data };
  } catch (err) {
    console.error("Failed to connect to Azure Content Safety:", err);
    return null;
  }
}

/**
 * Main Tiered Text Scanner
 */
export async function scanText(text: string): Promise<ScanResult> {
  // Step 1: Run fast local rule scanner
  const localResult = scanTextLocally(text);

  // If local scan detected critical violation (severity 3), return immediately
  if (!localResult.safe && localResult.severity >= 3) {
    return localResult;
  }

  // Step 2: If borderline (severity 1), escalate to Azure if available
  if (localResult.severity === 1) {
    const azureResult = await checkAzureTextContentSafety(text);
    if (azureResult && !azureResult.safe) {
      return {
        safe: false,
        severity: 3,
        category: "CSAM/CSAE",
        reason: "Borderline minor context flagged as sexually explicit by cloud safety classifier",
        details: azureResult.details,
      };
    }
  }

  return localResult;
}

/**
 * Generates a SHA-256 hash of image data for matching and auditing.
 */
export function calculateSimpleImageHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Tier 2: Azure AI Content Safety Image API (if configured via env vars).
 */
export async function checkAzureImageContentSafety(buffer: Buffer): Promise<ScanResult | null> {
  const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
  const key = process.env.AZURE_CONTENT_SAFETY_KEY;

  if (!endpoint || !key) {
    return null;
  }

  try {
    const url = `${endpoint.replace(/\/+$/, "")}/contentsafety/image:analyze?api-version=2024-09-01`;
    const base64Image = buffer.toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: {
          content: base64Image,
        },
        categories: ["Sexual"],
      }),
    });

    if (!res.ok) {
      console.warn("Azure Content Safety Image API returned status:", res.status);
      return null;
    }

    const data: any = await res.json();
    const categoriesAnalysis = data.categoriesAnalysis || [];
    const sexual = categoriesAnalysis.find((c: any) => c.category === "Sexual");

    if (sexual && sexual.severity >= 2) {
      return {
        safe: false,
        severity: 2,
        category: "Sexual",
        reason: `Image flagged with Sexual severity level ${sexual.severity}`,
        details: data,
      };
    }

    return { safe: true, severity: 0, details: data };
  } catch (err) {
    console.error("Azure Image Content Safety failed:", err);
    return null;
  }
}

/**
 * Main Image Scanner
 */
export async function scanImage(
  buffer: Buffer,
  mimeType: string = "image/png",
): Promise<ScanResult> {
  if (!buffer || buffer.length === 0) {
    return { safe: true, severity: 0 };
  }

  const hash = calculateSimpleImageHash(buffer);

  // Format / Magic Bytes Sanity Validation
  const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.length > 12 && buffer.toString("ascii", 8, 12) === "WEBP";
  const isGif = buffer.length > 6 && buffer.toString("ascii", 0, 3) === "GIF";

  if (!isPng && !isJpeg && !isWebp && !isGif && mimeType.startsWith("image/")) {
    return {
      safe: false,
      severity: 1,
      category: "invalid_format",
      reason: "Corrupted or non-standard image binary headers",
      details: { hash },
    };
  }

  // Azure Cloud Safety check (if active)
  const azureResult = await checkAzureImageContentSafety(buffer);
  if (azureResult) {
    return {
      ...azureResult,
      details: {
        ...azureResult.details,
        hash,
      },
    };
  }

  return {
    safe: true,
    severity: 0,
    details: { hash },
  };
}
