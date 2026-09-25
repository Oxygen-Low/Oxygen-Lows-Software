import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./dataStore.ts";

export const PARTNERS_FILE = path.join(DATA_DIR, "partners.json");

export interface ExistingPartner {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface WantedPartner {
  id: string;
  category: string;
  target_companies: string;
  what_we_provide: string;
  what_is_requested: string;
  created_at: string;
  updated_at: string;
}

export interface PartnersData {
  existing_partners: ExistingPartner[];
  wanted_partners: WantedPartner[];
}

const DEFAULT_PARTNERS_DATA: PartnersData = {
  existing_partners: [],
  wanted_partners: [
    {
      id: "wanted-1",
      category: "Cloud & AI Infrastructure",
      target_companies: "Cloudflare, Together AI, Hugging Face",
      what_we_provide: "Platform integration, exposure across web apps and developer tools, user ecosystem testing.",
      what_is_requested: "Compute credits, low-latency API access, co-marketing.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "wanted-2",
      category: "Game Studios & Creators",
      target_companies: "Indie Game Studios, Web Game Developers",
      what_we_provide: "Direct hosting on Oxygen Low's Software Games hub, user base distribution, cross-platform tools.",
      what_is_requested: "Exclusive web releases, shared events, content cross-promotion.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "wanted-3",
      category: "Cybersecurity & Identity",
      target_companies: "Passkey providers, Security auditors, CDN networks",
      what_we_provide: "Real-world testbed with Web Defender ecosystem, security reporting showcase.",
      what_is_requested: "Threat intelligence feeds, joint security certifications, advanced verification tooling.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};

function ensureFileExists(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PARTNERS_FILE)) {
    fs.writeFileSync(PARTNERS_FILE, JSON.stringify(DEFAULT_PARTNERS_DATA, null, 2), "utf-8");
  }
}

export function getPartnersData(): PartnersData {
  ensureFileExists();
  try {
    const raw = fs.readFileSync(PARTNERS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      existing_partners: Array.isArray(parsed.existing_partners) ? parsed.existing_partners : [],
      wanted_partners: Array.isArray(parsed.wanted_partners) ? parsed.wanted_partners : [],
    };
  } catch {
    return DEFAULT_PARTNERS_DATA;
  }
}

export function savePartnersData(data: PartnersData): void {
  ensureFileExists();
  const tmp = `${PARTNERS_FILE}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, PARTNERS_FILE);
}

export function addExistingPartner(partner: Omit<ExistingPartner, "id" | "created_at" | "updated_at">): ExistingPartner {
  const data = getPartnersData();
  const newPartner: ExistingPartner = {
    ...partner,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  data.existing_partners.unshift(newPartner);
  savePartnersData(data);
  return newPartner;
}

export function updateExistingPartner(id: string, updates: Partial<ExistingPartner>): ExistingPartner | null {
  const data = getPartnersData();
  const index = data.existing_partners.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const updated: ExistingPartner = {
    ...data.existing_partners[index],
    ...updates,
    id,
    updated_at: new Date().toISOString(),
  };
  data.existing_partners[index] = updated;
  savePartnersData(data);
  return updated;
}

export function deleteExistingPartner(id: string): boolean {
  const data = getPartnersData();
  const lenBefore = data.existing_partners.length;
  data.existing_partners = data.existing_partners.filter((p) => p.id !== id);
  if (data.existing_partners.length !== lenBefore) {
    savePartnersData(data);
    return true;
  }
  return false;
}

export function addWantedPartner(wanted: Omit<WantedPartner, "id" | "created_at" | "updated_at">): WantedPartner {
  const data = getPartnersData();
  const newWanted: WantedPartner = {
    ...wanted,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  data.wanted_partners.unshift(newWanted);
  savePartnersData(data);
  return newWanted;
}

export function updateWantedPartner(id: string, updates: Partial<WantedPartner>): WantedPartner | null {
  const data = getPartnersData();
  const index = data.wanted_partners.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const updated: WantedPartner = {
    ...data.wanted_partners[index],
    ...updates,
    id,
    updated_at: new Date().toISOString(),
  };
  data.wanted_partners[index] = updated;
  savePartnersData(data);
  return updated;
}

export function deleteWantedPartner(id: string): boolean {
  const data = getPartnersData();
  const lenBefore = data.wanted_partners.length;
  data.wanted_partners = data.wanted_partners.filter((p) => p.id !== id);
  if (data.wanted_partners.length !== lenBefore) {
    savePartnersData(data);
    return true;
  }
  return false;
}
