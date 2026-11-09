import {
  CONSENT_STORAGE_KEY,
  DEFAULT_BANNER_CONFIG,
  allGrantedSelection,
  defaultConsentSelection,
  normalizeSelection,
  type BannerConfig,
  type ConsentReceiptInput,
  type ProjectConfigPayload,
  type SimpleCookiesConfig,
  type StoredConsent,
} from "./types.js";

function randomConsentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function readStoredConsent(storageKey = CONSENT_STORAGE_KEY): StoredConsent | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (!parsed || typeof parsed !== "object" || !parsed.consentId) return null;
    return {
      ...parsed,
      selection: normalizeSelection(parsed.selection),
    };
  } catch {
    return null;
  }
}

export function writeStoredConsent(consent: StoredConsent, storageKey = CONSENT_STORAGE_KEY): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(consent));
    }
  } catch {
    // storage may be unavailable (private mode) — cookie fallback still applies
  }
  try {
    const encoded = encodeURIComponent(JSON.stringify(consent));
    const maxAge = Math.max(1, consent.selection ? 365 * 24 * 60 * 60 : 60);
    document.cookie = `${storageKey}=${encoded}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function isConsentExpired(consent: StoredConsent, retentionDays: number): boolean {
  const created = new Date(consent.createdAt).getTime();
  if (Number.isNaN(created)) return true;
  return Date.now() - created > retentionDays * 24 * 60 * 60 * 1000;
}

export function shouldShowBanner(consent: StoredConsent | null, config: BannerConfig): boolean {
  if (!consent) {
    if (config.respectDnt) {
      const dnt = typeof navigator !== "undefined" ? navigator.doNotTrack : null;
      if (dnt === "1") return false;
    }
    return true;
  }
  if (consent.policyVersion !== config.policyVersion) return true;
  return isConsentExpired(consent, config.retentionDays);
}

export class SimpleCookiesClient {
  readonly config: SimpleCookiesConfig;
  private apiUrl: string;
  private cached: ProjectConfigPayload | null = null;
  private cachedAt = 0;
  private listeners = new Set<(consent: StoredConsent) => void>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;

  constructor(config: SimpleCookiesConfig) {
    if (!config?.apiKey || typeof config.apiKey !== "string") {
      throw new Error("SimpleCookies: apiKey is required");
    }
    this.config = config;
    this.apiUrl = (config.apiUrl || "https://oxygenlow.com").replace(/\/+$/, "");
  }

  get projectId(): string | null {
    return this.cached?.id ?? null;
  }

  get bannerConfig(): BannerConfig {
    return this.cached?.config ?? DEFAULT_BANNER_CONFIG;
  }

  getConsent(): StoredConsent | null {
    const stored = readStoredConsent();
    if (!stored) return null;
    if (stored.policyVersion !== this.bannerConfig.policyVersion) return null;
    if (isConsentExpired(stored, this.bannerConfig.retentionDays)) return null;
    return stored;
  }

  isAllowed(category: keyof StoredConsent["selection"]): boolean {
    const c = this.getConsent();
    if (!c) return category === "necessary";
    return Boolean(c.selection[category]);
  }

  async fetchConfig(force = false): Promise<ProjectConfigPayload> {
    const now = Date.now();
    if (!force && this.cached && now - this.cachedAt < 30_000) return this.cached;
    const url = `${this.apiUrl}/api/simplecookies/verify`;
    const controller = new AbortController();
    this.abort?.abort();
    this.abort = controller;
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`SimpleCookies verify failed (${res.status})`);
      const data = (await res.json()) as ProjectConfigPayload & {
        config?: BannerConfig;
        declaration?: ProjectConfigPayload["declaration"];
      };
      const payload: ProjectConfigPayload = {
        id: data.id,
        name: data.name,
        domain: data.domain ?? null,
        firstRequestAt: data.firstRequestAt ?? null,
        config: { ...DEFAULT_BANNER_CONFIG, ...(data.config || {}) },
        declaration: Array.isArray(data.declaration) ? data.declaration : [],
      };
      this.cached = payload;
      this.cachedAt = now;
      return payload;
    } catch (err) {
      this.config.onError?.(err instanceof Error ? err : new Error("SimpleCookies fetch failed"));
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async setConsent(
    selection: Partial<StoredConsent["selection"]>,
    options: { sync?: boolean } = {},
  ): Promise<StoredConsent> {
    const normalized = normalizeSelection(selection);
    const existing = readStoredConsent();
    const consent: StoredConsent = {
      consentId: existing?.consentId || randomConsentId(),
      projectId: this.projectId || existing?.projectId || "unknown",
      selection: normalized,
      policyVersion: this.bannerConfig.policyVersion,
      language: this.bannerConfig.language,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeStoredConsent(consent);
    for (const listener of this.listeners) {
      try {
        listener(consent);
      } catch {
        // ignore listener errors
      }
    }
    try {
      this.config.onConsent?.(consent);
    } catch {
      // ignore
    }
    if (options.sync !== false) {
      this.postReceipt({
        consentId: consent.consentId,
        selection: normalized,
        policyVersion: consent.policyVersion,
        language: consent.language,
        countryCode: null,
      }).catch(() => {});
    }
    return consent;
  }

  acceptAll(): Promise<StoredConsent> {
    return this.setConsent(allGrantedSelection());
  }

  rejectAll(): Promise<StoredConsent> {
    return this.setConsent(defaultConsentSelection());
  }

  onConsentChange(listener: (consent: StoredConsent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async postReceipt(receipt: ConsentReceiptInput): Promise<void> {
    const url = `${this.apiUrl}/api/simplecookies/consent`;
    const body = JSON.stringify(receipt);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body,
        keepalive: true,
      });
      if (!res.ok) throw new Error(`SimpleCookies consent failed (${res.status})`);
    } catch (err) {
      // Fallback: sendBeacon (no response handling).
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(url, blob);
        }
      } catch {
        // ignore
      }
      throw err instanceof Error ? err : new Error("SimpleCookies consent failed");
    }
  }

  startSync(): void {
    if (this.config.offlineMode || this.syncTimer) return;
    const interval = this.config.syncIntervalMs ?? 60_000;
    if (interval <= 0) return;
    this.syncTimer = setInterval(() => {
      this.fetchConfig(true).catch(() => {});
    }, interval);
    if (this.config.realtime !== false) {
      this.subscribeRealtime().catch(() => {});
    }
  }

  stopSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    this.abort?.abort();
    this.abort = null;
  }

  private subscribeRealtime(): Promise<void> {
    const url = `${this.apiUrl}/api/simplecookies/config-stream`;
    const controller = new AbortController();
    this.abort = controller;
    return (async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = chunk
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (dataLine) {
            try {
              const payload = JSON.parse(dataLine.slice(5).trim());
              if (payload && payload.id) {
                this.cached = {
                  id: payload.id,
                  name: payload.name || this.cached?.name || "",
                  domain: this.cached?.domain ?? null,
                  firstRequestAt: this.cached?.firstRequestAt ?? null,
                  config: { ...DEFAULT_BANNER_CONFIG, ...(payload.config || {}) },
                  declaration: payload.declaration || this.cached?.declaration || [],
                } as ProjectConfigPayload;
                this.cachedAt = Date.now();
              }
            } catch {
              // ignore malformed SSE
            }
          }
        }
      }
    })();
  }
}

export function createSimpleCookies(config: SimpleCookiesConfig): SimpleCookiesClient {
  return new SimpleCookiesClient(config);
}
