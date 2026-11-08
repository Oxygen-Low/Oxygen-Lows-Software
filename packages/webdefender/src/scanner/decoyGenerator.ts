import type { SensitivePathCategory } from "./sensitivePaths.js";
import { createDecoyPersona, type DecoyPersona } from "./decoyPersona.js";
import {
  renderDecoy,
  selectDecoyKind,
  type DecoyKind,
} from "./decoyTemplates.js";

export interface DecoyResult {
  content: string;
  contentType: string;
  statusCode?: number;
  headers?: Record<string, string>;
  templateId?: string;
  templateKind?: DecoyKind;
  personaId?: string;
}

export interface DecoyOptions {
  /** Protected app ID. Ensures each app receives a unique but stable persona. */
  appId?: string;
  /** Optional rotation seed for the persona. */
  seed?: string;
  /** Set false to use one shared deterministic persona (not recommended). */
  randomize?: boolean;
  /** Set false to omit the correlatable canary marker. */
  includeCanary?: boolean;
}

const DEFAULT_APP_ID = "webdefender-default";
const DEFAULT_PERSONA = createDecoyPersona(DEFAULT_APP_ID, "v1");
const CACHE_LIMIT = 128;
const cache = new Map<string, DecoyResult>();

function getPersona(options?: DecoyOptions): DecoyPersona {
  if (options?.randomize === false) {
    if (options.includeCanary === false) {
      return { ...DEFAULT_PERSONA, canary: DEFAULT_PERSONA.analyticsKey };
    }
    return DEFAULT_PERSONA;
  }

  const persona = createDecoyPersona(
    options?.appId || DEFAULT_APP_ID,
    options?.seed,
  );
  if (options?.includeCanary === false) {
    return { ...persona, canary: persona.analyticsKey };
  }
  return persona;
}

/** Remove all cached decoys (useful after rotating a persona/seed). */
export function clearDecoyCache(): void {
  cache.clear();
}

function remember(key: string, value: DecoyResult): DecoyResult {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

/**
 * Generates synthetic decoy content and matching Content-Type headers for
 * sensitive path requests.
 */
export function generateDecoyContent(
  rawPath: string,
  category?: SensitivePathCategory,
  options?: DecoyOptions,
): DecoyResult {
  const persona = getPersona(options);
  const kind = selectDecoyKind(rawPath, category);
  const includeCanary = options?.includeCanary !== false;
  const cacheKey = `${persona.personaId}|${kind}|${includeCanary ? "c" : "n"}`;

  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, headers: { ...cached.headers } };

  const rendered = renderDecoy(kind, persona);
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(
      typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(rendered.content).length
        : rendered.content.length,
    ),
    ...(rendered.headers || {}),
  };

  return remember(cacheKey, {
    ...rendered,
    statusCode: 200,
    headers,
    templateId: rendered.templateId,
    templateKind: kind,
    personaId: persona.personaId,
  });
}