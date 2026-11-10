export type CookieCategory =
  | "necessary"
  | "preferences"
  | "statistics"
  | "marketing"
  | "custom";

export interface CookieDeclarationEntry {
  name: string;
  provider: string;
  purpose: string;
  expiry: string;
  category: CookieCategory;
}

export interface ConsentSelection {
  necessary: true;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
  custom: boolean;
}

export interface CookieCategoryConfig {
  label: string;
  description: string;
  enabled: boolean;
}

export interface CategoryConfigs {
  necessary: CookieCategoryConfig;
  preferences: CookieCategoryConfig;
  statistics: CookieCategoryConfig;
  marketing: CookieCategoryConfig;
  custom: CookieCategoryConfig;
}

export interface BannerConfig {
  title: string;
  text: string;
  acceptLabel: string;
  rejectLabel: string;
  customizeLabel: string;
  saveLabel: string;
  showCustomize: boolean;
  position: "bottom" | "top" | "left" | "right" | "center";
  accent: string;
  background: string;
  textColor: string;
  darkMode: boolean;
  language: string;
  policyVersion: number;
  retentionDays: number;
  consentMode: boolean;
  respectDnt: boolean;
  showPoweredBy: boolean;
  categories: CategoryConfigs;
}

export interface SimpleCookiesConfig {
  apiKey: string;
  apiUrl?: string;
  autoMount?: boolean;
  offlineMode?: boolean;
  syncIntervalMs?: number;
  realtime?: boolean;
  onConsent?: (consent: StoredConsent) => void;
  onError?: (error: Error) => void;
}

export interface StoredConsent {
  consentId: string;
  projectId: string;
  selection: ConsentSelection;
  policyVersion: number;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfigPayload {
  id: string;
  name: string;
  domain: string | null;
  firstRequestAt: string | null;
  config: BannerConfig;
  declaration: CookieDeclarationEntry[];
}

export interface ConsentReceiptInput {
  consentId: string;
  selection: Partial<ConsentSelection>;
  policyVersion?: number;
  language?: string;
  countryCode?: string | null;
}

export interface ScanResultCookie extends CookieDeclarationEntry {
  source?: string;
}

export interface ScanResult {
  url: string;
  scannedAt: string;
  cookies: ScanResultCookie[];
  trackers: string[];
  scripts: string[];
  notes: string[];
}

export const DEFAULT_BANNER_CONFIG: BannerConfig = {
  title: "We value your privacy",
  text: "We use cookies to improve your experience, analyse traffic, and personalise content. You can accept all cookies or customise your choices.",
  acceptLabel: "Accept all",
  rejectLabel: "Reject all",
  customizeLabel: "Customize",
  saveLabel: "Save selection",
  showCustomize: true,
  position: "bottom",
  accent: "#06b6d4",
  background: "#0f172a",
  textColor: "#f1f5f9",
  darkMode: true,
  language: "en",
  policyVersion: 1,
  retentionDays: 365,
  consentMode: true,
  respectDnt: true,
  showPoweredBy: false,
  categories: {
    necessary: {
      label: "Necessary",
      description: "Required for core functionality such as security and load balancing.",
      enabled: true,
    },
    preferences: {
      label: "Preferences",
      description: "Remember your settings such as language and theme.",
      enabled: true,
    },
    statistics: {
      label: "Statistics",
      description: "Help us understand how visitors use the site (anonymous).",
      enabled: true,
    },
    marketing: {
      label: "Marketing",
      description: "Used for personalised ads and cross-site tracking.",
      enabled: false,
    },
    custom: {
      label: "Custom",
      description: "Additional non-essential cookies you define.",
      enabled: false,
    },
  },
};

export const CONSENT_STORAGE_KEY = "simplecookies_consent";

export function defaultConsentSelection(): ConsentSelection {
  return {
    necessary: true,
    preferences: false,
    statistics: false,
    marketing: false,
    custom: false,
  };
}

export function allGrantedSelection(): ConsentSelection {
  return {
    necessary: true,
    preferences: true,
    statistics: true,
    marketing: true,
    custom: true,
  };
}

export function normalizeSelection(input: Partial<ConsentSelection> | null | undefined): ConsentSelection {
  return {
    necessary: true,
    preferences: Boolean(input?.preferences),
    statistics: Boolean(input?.statistics),
    marketing: Boolean(input?.marketing),
    custom: Boolean(input?.custom),
  };
}
