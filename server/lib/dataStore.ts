import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const DATA_DIR = path.join(process.cwd(), "Data");

export interface DataFilter {
  field: string;
  operator:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "like"
    | "ilike"
    | "is"
    | "in";
  value: any;
}

export interface QueryOptions {
  table: string;
  filters?: DataFilter[];
  orFilters?: string[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  single?: boolean;
  userId?: string;
  select?: string;
  head?: boolean;
}

export interface UserModelRecord {
  id: string;
  user_id: string;
  provider: string;
  model_id: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRecord {
  id: string;
  user_id: string;
  theme?: string;
  volume?: number;
  font?: string;
  use_gradient?: boolean;
  points?: number;
  profile_picture_path?: string;
  chatbot_default_model?: string;
  chatbot_default_provider?: string;
  research_agent_default_model?: string;
  research_agent_default_provider?: string;
  research_summarizer_default_model?: string;
  research_summarizer_default_provider?: string;
  last_model_id?: string;
  last_provider?: string;
  share_game_activity?: boolean;
  show_online_status?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface UserGameRecord {
  id: string;
  user_id: string;
  game_id: string;
  title: string;
  platform: "steam" | "epic" | "ea" | "xbox" | "gog" | "ubisoft" | "custom" | string;
  executable_path?: string;
  launch_url?: string;
  install_path?: string;
  icon_url?: string;
  banner_url?: string;
  is_custom: boolean;
  playtime_seconds: number;
  last_played_at?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface UserPlaytimeRecord {
  id: string;
  user_id: string;
  game_id: string;
  game_title?: string;
  platform?: string;
  total_seconds: number;
  last_played_at: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface UserPresenceRecord {
  id: string;
  user_id: string;
  game_id: string | null;
  game_title: string | null;
  platform: string | null;
  is_playing: boolean;
  started_at?: string | null;
  updated_at: string;
  [key: string]: any;
}

// Ensure Data directory exists
function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile<T = any>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

function writeJsonFile(filePath: string, data: any) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}

/**
 * Gets the next sequential user ID (1, 2, 3, ...).
 */
export function getNextUserId(): string {
  ensureDir(DATA_DIR);
  const metaPath = path.join(DATA_DIR, "meta.json");
  let nextId = 1;

  if (fs.existsSync(metaPath)) {
    const meta = readJsonFile(metaPath, { nextUserId: 1 });
    nextId = typeof meta.nextUserId === "number" ? meta.nextUserId : 1;
  } else {
    // Scan existing user directory names if meta.json didn't exist
    try {
      const items = fs.readdirSync(DATA_DIR, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && /^\d+$/.test(item.name)) {
          const num = parseInt(item.name, 10);
          if (num >= nextId) {
            nextId = num + 1;
          }
        }
      }
    } catch {}
  }

  writeJsonFile(metaPath, { nextUserId: nextId + 1 });
  return String(nextId);
}

/**
 * Initializes a new user folder and subfolders inside Data/<userId>/
 */
export function initUserFolder(
  userId: string,
  userInitialData: {
    username: string;
    email: string;
    passwordHash: string;
    salt: string;
    role?: string;
  },
) {
  const userDir = path.join(DATA_DIR, userId);
  ensureDir(userDir);
  ensureDir(path.join(userDir, "datastore"));
  ensureDir(path.join(userDir, "chatbot"));
  ensureDir(path.join(userDir, "passwords"));
  ensureDir(path.join(userDir, "storage"));
  ensureDir(path.join(userDir, "public_assets"));
  ensureDir(path.join(userDir, "vpn"));
  ensureDir(path.join(userDir, "integrations"));
  ensureDir(path.join(userDir, "support"));
  ensureDir(path.join(userDir, "friends"));
  ensureDir(path.join(userDir, "defender"));
  ensureDir(path.join(userDir, "models"));
  ensureDir(path.join(userDir, "games"));

  // Also ensure upload directories exist
  ensureDir(path.join(process.cwd(), "uploads", "Storage", userId));
  ensureDir(path.join(process.cwd(), "uploads", "public-assets", userId));

  const now = new Date().toISOString();
  const userData = {
    id: userId,
    username: userInitialData.username,
    email: userInitialData.email,
    password_hash: userInitialData.passwordHash,
    salt: userInitialData.salt,
    role: userInitialData.role || "user",
    points: 100,
    custom_models: [],
    created_at: now,
    updated_at: now,
  };
  writeJsonFile(path.join(userDir, "user.json"), userData);

  const profileData = {
    id: userId,
    user_id: userId,
    username: userInitialData.username,
    email: userInitialData.email,
    display_name: userInitialData.username,
    bio: "",
    language: "English",
    additional_languages: [],
    avatar_url: null,
    created_at: now,
    updated_at: now,
  };
  writeJsonFile(path.join(userDir, "profile.json"), profileData);

  const preferencesData = {
    id: userId,
    user_id: userId,
    theme: "dark",
    volume: 80,
    points: 100,
    share_game_activity: true,
    show_online_status: true,
    chatbot_default_model: "Fast",
    chatbot_default_provider: "horde",
    research_agent_default_model: "google/gemma-4-31b",
    research_agent_default_provider: "horde",
    research_summarizer_default_model: "@cf/nvidia/nemotron-3-120b-a12b",
    research_summarizer_default_provider: "cloudflare",
    last_model_id: "Fast",
    last_provider: "horde",
    created_at: now,
    updated_at: now,
  };
  writeJsonFile(path.join(userDir, "preferences.json"), preferencesData);

  // Initialize initial JSON arrays
  writeJsonFile(path.join(userDir, "datastore", "categories.json"), []);
  writeJsonFile(path.join(userDir, "datastore", "saves.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "chats.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "messages.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "characters.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "universes.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "races.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "character_likes.json"), []);
  writeJsonFile(path.join(userDir, "passwords", "passwords.json"), []);
  writeJsonFile(path.join(userDir, "vpn", "configs.json"), []);
  writeJsonFile(path.join(userDir, "integrations", "integrations.json"), []);
  writeJsonFile(path.join(userDir, "support", "tickets.json"), []);
  writeJsonFile(path.join(userDir, "support", "messages.json"), []);
  writeJsonFile(path.join(userDir, "friends", "friends.json"), []);
  writeJsonFile(path.join(userDir, "friends", "follows.json"), []);
  writeJsonFile(path.join(userDir, "friends", "blocks.json"), []);
  writeJsonFile(path.join(userDir, "public_assets", "assets.json"), []);
  writeJsonFile(path.join(userDir, "public_assets", "verifications.json"), []);
  writeJsonFile(path.join(userDir, "public_assets", "likes.json"), []);
  writeJsonFile(path.join(userDir, "models", "models.json"), []);
  writeJsonFile(path.join(userDir, "games", "games.json"), []);
  writeJsonFile(path.join(userDir, "games", "playtime.json"), []);
  writeJsonFile(path.join(userDir, "games", "presence.json"), []);

  return userData;
}

export function getAllUserIds(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  try {
    return fs
      .readdirSync(DATA_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export function getUserById(userId: string | number) {
  if (userId === undefined || userId === null || String(userId).trim() === "") return null;
  const userPath = path.join(DATA_DIR, String(userId), "user.json");
  return readJsonFile(userPath, null);
}

export function getUserByUsernameOrEmail(identifier: string) {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();
  const userIds = getAllUserIds();
  for (const id of userIds) {
    const user = getUserById(id);
    if (
      user &&
      (user.username?.toLowerCase() === clean ||
        user.email?.toLowerCase() === clean)
    ) {
      return user;
    }
  }
  return null;
}

export function getProfileByUserId(userId: string | number) {
  if (userId === undefined || userId === null || String(userId).trim() === "") return null;
  const profilePath = path.join(DATA_DIR, String(userId), "profile.json");
  return readJsonFile(profilePath, null);
}

/**
 * Returns the file path for a given table and userId.
 */
export function getTableFilePath(table: string, userId?: string | number): string | null {
  const normTable = table.toLowerCase();

  // If userId is provided, map user-specific tables
  if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
    const userDir = path.join(DATA_DIR, String(userId));
    switch (normTable) {
      case "profiles":
        return path.join(userDir, "profile.json");
      case "profile_pictures":
        return path.join(userDir, "profile.json");
      case "user_preferences":
        return path.join(userDir, "preferences.json");
      case "data_saves":
        return path.join(userDir, "datastore", "saves.json");
      case "data_save_categories":
        return path.join(userDir, "datastore", "categories.json");
      case "chats":
        return path.join(userDir, "chatbot", "chats.json");
      case "chat_messages":
        return path.join(userDir, "chatbot", "messages.json");
      case "characters":
        return path.join(userDir, "chatbot", "characters.json");
      case "universes":
        return path.join(userDir, "chatbot", "universes.json");
      case "races":
        return path.join(userDir, "chatbot", "races.json");
      case "user_passwords":
        return path.join(userDir, "passwords", "passwords.json");
      case "vpn_configs":
        return path.join(userDir, "vpn", "configs.json");
      case "user_integrations":
        return path.join(userDir, "integrations", "integrations.json");
      case "support_tickets":
        return path.join(userDir, "support", "tickets.json");
      case "support_messages":
        return path.join(userDir, "support", "messages.json");
      case "friendships":
      case "friends":
        return path.join(userDir, "friends", "friends.json");
      case "follows":
        return path.join(userDir, "friends", "follows.json");
      case "blocks":
        return path.join(userDir, "friends", "blocks.json");
      case "public_assets":
        return path.join(userDir, "public_assets", "assets.json");
      case "asset_verifications":
        return path.join(userDir, "public_assets", "verifications.json");
      case "public_asset_likes":
        return path.join(userDir, "public_assets", "likes.json");
      case "public_character_likes":
        return path.join(userDir, "chatbot", "character_likes.json");
      case "defender_events":
        return path.join(userDir, "defender", "events.json");
      case "defender_apps":
        return path.join(userDir, "defender", "apps.json");
      case "defender_config":
        return path.join(userDir, "defender", "config.json");
      case "defender_routes":
        return path.join(userDir, "defender", "routes.json");
      case "defender_outbound":
        return path.join(userDir, "defender", "outbound.json");
      case "defender_threat_actors":
        return path.join(userDir, "defender", "threat_actors.json");
      case "defender_ip_blocks":
        return path.join(userDir, "defender", "ip_blocks.json");
      case "defender_vpn":
        return path.join(userDir, "defender", "vpn.json");
      case "user_models":
        return path.join(userDir, "models", "models.json");
      case "user_games":
      case "games":
      case "game_library":
      case "installed_games":
      case "custom_games":
        return path.join(userDir, "games", "games.json");
      case "user_playtime":
      case "game_playtime":
      case "playtime":
      case "playtimes":
        return path.join(userDir, "games", "playtime.json");
      case "user_presence":
      case "game_presence":
      case "presence":
      case "presences":
        return path.join(userDir, "games", "presence.json");
      default:
        return null;
    }
  }

  return null;
}

/**
 * Reads all rows from a table across either a specific user or all users.
 */
export function getTableRows(table: string, userId?: string | number): any[] {
  const normTable = table.toLowerCase();
  const userIdStr =
    userId !== undefined && userId !== null && String(userId).trim() !== ""
      ? String(userId)
      : undefined;

  // If table is a single object file (profile / preferences)
  if (normTable === "profiles" || normTable === "profile_pictures") {
    if (userIdStr) {
      const p = getProfileByUserId(userIdStr);
      return p ? [p] : [];
    }
    // All profiles
    const userIds = getAllUserIds();
    return userIds
      .map((id) => getProfileByUserId(id))
      .filter((p) => p !== null);
  }

  if (normTable === "user_preferences") {
    if (userIdStr) {
      const prefPath = path.join(DATA_DIR, userIdStr, "preferences.json");
      const pref = readJsonFile(prefPath, null);
      return pref ? [pref] : [];
    }
    const userIds = getAllUserIds();
    return userIds
      .map((id) => readJsonFile(path.join(DATA_DIR, id, "preferences.json"), null))
      .filter((p) => p !== null);
  }

  // Global / public aggregation
  if (normTable === "public_characters") {
    const userIds = getAllUserIds();
    const allChars: any[] = [];
    for (const id of userIds) {
      const chars = readJsonFile<any[]>(
        path.join(DATA_DIR, id, "chatbot", "characters.json"),
        [],
      );
      const prof = getProfileByUserId(id);
      for (const char of chars) {
        if (char.is_public) {
          allChars.push({
            ...char,
            author_username: prof?.username || "Unknown",
            author_avatar_url: prof?.avatar_url || null,
          });
        }
      }
    }
    return allChars;
  }

  if (normTable === "public_assets") {
    const userIds = getAllUserIds();
    const allAssets: any[] = [];
    for (const id of userIds) {
      const assets = readJsonFile<any[]>(
        path.join(DATA_DIR, id, "public_assets", "assets.json"),
        [],
      );
      const prof = getProfileByUserId(id);
      for (const asset of assets) {
        allAssets.push({
          ...asset,
          author_username: prof?.username || "Unknown",
          author_avatar_url: prof?.avatar_url || null,
        });
      }
    }
    return allAssets;
  }

  if (normTable === "support_tickets" && !userIdStr) {
    const userIds = getAllUserIds();
    const allTickets: any[] = [];
    for (const id of userIds) {
      const tickets = readJsonFile<any[]>(
        path.join(DATA_DIR, id, "support", "tickets.json"),
        [],
      );
      allTickets.push(...tickets);
    }
    return allTickets;
  }

  // User-scoped table
  if (userIdStr) {
    const filePath = getTableFilePath(table, userIdStr);
    if (!filePath) return [];
    return readJsonFile<any[]>(filePath, []);
  }

  // If no userId, aggregate across all users
  const userIds = getAllUserIds();
  const allRows: any[] = [];
  for (const id of userIds) {
    const filePath = getTableFilePath(table, id);
    if (filePath && fs.existsSync(filePath)) {
      const rows = readJsonFile<any[]>(filePath, []);
      if (Array.isArray(rows)) {
        allRows.push(...rows);
      }
    }
  }
  return allRows;
}

/**
 * Saves rows for a table and specific userId.
 */
export function saveTableRows(table: string, userId: string | number, rows: any[]) {
  if (userId === undefined || userId === null || String(userId).trim() === "") return;
  const userIdStr = String(userId);
  const normTable = table.toLowerCase();
  if (normTable === "profiles" || normTable === "profile_pictures") {
    const profilePath = path.join(DATA_DIR, userIdStr, "profile.json");
    const existing = readJsonFile(profilePath, {});
    writeJsonFile(profilePath, { ...existing, ...(rows[0] || {}) });
    return;
  }

  if (normTable === "user_preferences") {
    const prefPath = path.join(DATA_DIR, userIdStr, "preferences.json");
    const existing = readJsonFile(prefPath, {});
    writeJsonFile(prefPath, { ...existing, ...(rows[0] || {}) });
    return;
  }

  const filePath = getTableFilePath(table, userIdStr);
  if (filePath) {
    writeJsonFile(filePath, rows);
  }
}

/**
 * Match a row against filters.
 */
export function matchesFilter(row: any, filter: DataFilter): boolean {
  const { field, operator, value } = filter;
  const rowVal = row[field];

  switch (operator) {
    case "eq":
      return String(rowVal) === String(value);
    case "neq":
      return String(rowVal) !== String(value);
    case "gt":
      return rowVal > value;
    case "gte":
      return rowVal >= value;
    case "lt":
      return rowVal < value;
    case "lte":
      return rowVal <= value;
    case "is":
      return (
        rowVal === value ||
        (value === null && (rowVal === null || rowVal === undefined))
      );
    case "in":
      return Array.isArray(value) && value.map(String).includes(String(rowVal));
    case "like": {
      const pattern = String(value).replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`).test(String(rowVal ?? ""));
    }
    case "ilike": {
      const pattern = String(value).replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, "i").test(String(rowVal ?? ""));
    }
    default:
      return true;
  }
}

function parseSingleCondition(cond: string): DataFilter | null {
  const parts = cond.trim().split(".");
  if (parts.length < 2) return null;
  const field = parts[0];
  const operator = parts[1] as DataFilter["operator"];
  const rawValue = parts.slice(2).join(".");
  let value: any = rawValue;
  if (rawValue === "null") value = null;
  else if (rawValue === "true") value = true;
  else if (rawValue === "false") value = false;
  return { field, operator, value };
}

function splitTopLevel(str: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

function evaluateClause(row: any, clause: string): boolean {
  clause = clause.trim();
  if (clause.startsWith("and(") && clause.endsWith(")")) {
    const inner = clause.substring(4, clause.length - 1);
    const subConds = splitTopLevel(inner);
    return subConds.every((c) => evaluateClause(row, c));
  }
  if (clause.startsWith("or(") && clause.endsWith(")")) {
    const inner = clause.substring(3, clause.length - 1);
    const subConds = splitTopLevel(inner);
    return subConds.some((c) => evaluateClause(row, c));
  }
  const filter = parseSingleCondition(clause);
  if (!filter) return true;
  return matchesFilter(row, filter);
}

export function matchesOrFilter(row: any, orExpr: string): boolean {
  const clauses = splitTopLevel(orExpr);
  if (clauses.length === 0) return true;
  return clauses.some((c) => evaluateClause(row, c));
}

/**
 * Execute a query on a table.
 */
export function queryTable(options: QueryOptions): any {
  const {
    table,
    filters = [],
    orFilters = [],
    order,
    limit,
    offset = 0,
    single = false,
    userId,
    select,
    head = false,
  } = options;

  let rows = getTableRows(table, userId);

  // Apply filters
  if (filters && filters.length > 0) {
    rows = rows.filter((row) =>
      filters.every((filter) => matchesFilter(row, filter)),
    );
  }

  // Apply orFilters
  if (orFilters && orFilters.length > 0) {
    rows = rows.filter((row) =>
      orFilters.every((orExpr) => matchesOrFilter(row, orExpr)),
    );
  }

  const totalCount = rows.length;

  if (head) {
    return { data: [], count: totalCount };
  }

  // For data_saves: expand category relation if requested (e.g., category:category_id(*))
  if (table === "data_saves" && select && select.includes("category")) {
    const cats = userId
      ? readJsonFile<any[]>(
          path.join(DATA_DIR, userId, "datastore", "categories.json"),
          [],
        )
      : [];
    const catMap = new Map<string, any>(cats.map((c) => [c.id, c]));
    rows = rows.map((r) => ({
      ...r,
      category: r.category_id ? catMap.get(r.category_id) || null : null,
    }));
  }

  // Apply sorting
  if (order) {
    const { column, ascending = true } = order;
    rows.sort((a, b) => {
      const valA = a[column];
      const valB = b[column];
      if (valA == null && valB == null) return 0;
      if (valA == null) return ascending ? -1 : 1;
      if (valB == null) return ascending ? 1 : -1;

      if (typeof valA === "number" && typeof valB === "number") {
        return ascending ? valA - valB : valB - valA;
      }
      return ascending
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }

  // Apply offset & limit
  if (offset > 0) {
    rows = rows.slice(offset);
  }
  if (typeof limit === "number" && limit >= 0) {
    rows = rows.slice(0, limit);
  }

  if (single) {
    return rows.length > 0 ? rows[0] : null;
  }
  return rows;
}

/**
 * Normalizes user preference keys, stripping 'p_' prefix and syncing model aliases.
 */
export function normalizeUserPreferences(
  args: Record<string, any>,
): Record<string, any> {
  if (!args || typeof args !== "object") return {};
  const normalized: Record<string, any> = {};
  for (const [rawKey, val] of Object.entries(args)) {
    if (val === undefined) continue;
    const key = rawKey.startsWith("p_") ? rawKey.substring(2) : rawKey;
    normalized[key] = val;
  }

  // Synchronize chatbot model and provider aliases
  if (normalized.chatbot_default_model && !normalized.last_model_id) {
    normalized.last_model_id = normalized.chatbot_default_model;
  } else if (normalized.last_model_id && !normalized.chatbot_default_model) {
    normalized.chatbot_default_model = normalized.last_model_id;
  }

  if (normalized.chatbot_default_provider && !normalized.last_provider) {
    normalized.last_provider = normalized.chatbot_default_provider;
  } else if (normalized.last_provider && !normalized.chatbot_default_provider) {
    normalized.chatbot_default_provider = normalized.last_provider;
  }

  return normalized;
}

/**
 * Insert a record or records into a table.
 */
export function insertTable(
  table: string,
  data: any | any[],
  userId: string | number,
): any {
  const userIdStr = String(userId);
  const normTable = table.toLowerCase();
  const items = Array.isArray(data) ? data : [data];
  const now = new Date().toISOString();

  const prepared = items.map((item) => ({
    id: item.id || crypto.randomUUID(),
    user_id: item.user_id || userIdStr,
    created_at: item.created_at || now,
    updated_at: item.updated_at || now,
    ...item,
  }));

  if (
    normTable === "profiles" ||
    normTable === "profile_pictures" ||
    normTable === "user_preferences"
  ) {
    const rowData =
      normTable === "user_preferences"
        ? prepared.map((r) => normalizeUserPreferences(r))
        : prepared;
    saveTableRows(table, userIdStr, rowData);
    return Array.isArray(data) ? rowData : rowData[0];
  }

  const existing = getTableRows(table, userIdStr);
  const updated = [...prepared, ...existing];
  saveTableRows(table, userIdStr, updated);

  return Array.isArray(data) ? prepared : prepared[0];
}

/**
 * Update records matching filters.
 */
export function updateTable(
  table: string,
  filters: DataFilter[] = [],
  data: any,
  userId?: string | number,
  orFilters: string[] = [],
): any {
  const normTable = table.toLowerCase();
  const now = new Date().toISOString();

  if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
    const userIdStr = String(userId);
    if (
      normTable === "profiles" ||
      normTable === "profile_pictures" ||
      normTable === "user_preferences"
    ) {
      const existing = getTableRows(table, userIdStr)[0] || {};
      const patchData =
        normTable === "user_preferences"
          ? normalizeUserPreferences(data || {})
          : data || {};
      const updated = { ...existing, ...patchData, updated_at: now };
      saveTableRows(table, userIdStr, [updated]);
      return [updated];
    }

    const existing = getTableRows(table, userIdStr);
    const matched: any[] = [];
    const updated = existing.map((row) => {
      const matchesAnd =
        filters.length === 0 || filters.every((f) => matchesFilter(row, f));
      const matchesOr =
        orFilters.length === 0 ||
        orFilters.every((orExpr) => matchesOrFilter(row, orExpr));
      if (matchesAnd && matchesOr) {
        const modified = { ...row, ...data, updated_at: now };
        matched.push(modified);
        return modified;
      }
      return row;
    });

    saveTableRows(table, userIdStr, updated);
    return matched;
  }

  // If no userId provided, update across all user directories (e.g. admin update)
  const userIds = getAllUserIds();
  const allMatched: any[] = [];
  for (const id of userIds) {
    const matched = updateTable(table, filters, data, id, orFilters);
    if (Array.isArray(matched) && matched.length > 0) {
      allMatched.push(...matched);
    }
  }
  return allMatched;
}

/**
 * Upsert records.
 */
export function upsertTable(
  table: string,
  data: any | any[],
  userId: string | number,
  onConflict: string = "id",
): any {
  const userIdStr = String(userId);
  const normTable = table.toLowerCase();
  const items = Array.isArray(data) ? data : [data];
  const now = new Date().toISOString();

  if (
    normTable === "profiles" ||
    normTable === "profile_pictures" ||
    normTable === "user_preferences"
  ) {
    const existing = getTableRows(table, userIdStr)[0] || {};
    const patchData =
      normTable === "user_preferences"
        ? normalizeUserPreferences(items[0] || {})
        : items[0] || {};
    const updated = { ...existing, ...patchData, updated_at: now };
    saveTableRows(table, userIdStr, [updated]);
    return Array.isArray(data) ? [updated] : updated;
  }

  const existing = getTableRows(table, userIdStr);
  const result: any[] = [];

  const existingMap = new Map<string, any>(
    existing.map((r) => [String(r[onConflict]), r]),
  );

  for (const item of items) {
    const key = item[onConflict] ? String(item[onConflict]) : null;
    if (key && existingMap.has(key)) {
      const prev = existingMap.get(key);
      const merged = { ...prev, ...item, updated_at: now };
      existingMap.set(key, merged);
      result.push(merged);
    } else {
      const newItem = {
        id: item.id || crypto.randomUUID(),
        user_id: item.user_id || userIdStr,
        created_at: item.created_at || now,
        updated_at: item.updated_at || now,
        ...item,
      };
      existingMap.set(String(newItem[onConflict] || newItem.id), newItem);
      result.push(newItem);
    }
  }

  const allRows = Array.from(existingMap.values());
  saveTableRows(table, userIdStr, allRows);

  return Array.isArray(data) ? result : result[0];
}

/**
 * Delete records matching filters.
 */
export function deleteTable(
  table: string,
  filters: DataFilter[] = [],
  userId?: string | number,
  orFilters: string[] = [],
): any {
  if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
    const userIdStr = String(userId);
    const existing = getTableRows(table, userIdStr);
    const matched: any[] = [];
    const remaining = existing.filter((row) => {
      const matchesAnd =
        filters.length === 0 || filters.every((f) => matchesFilter(row, f));
      const matchesOr =
        orFilters.length === 0 ||
        orFilters.every((orExpr) => matchesOrFilter(row, orExpr));
      if (matchesAnd && matchesOr) {
        matched.push(row);
        return false;
      }
      return true;
    });

    saveTableRows(table, userIdStr, remaining);
    return matched;
  }

  // If no userId provided, delete across all user directories (e.g. admin delete)
  const userIds = getAllUserIds();
  const allMatched: any[] = [];
  for (const id of userIds) {
    const matched = deleteTable(table, filters, id, orFilters);
    if (Array.isArray(matched) && matched.length > 0) {
      allMatched.push(...matched);
    }
  }
  return allMatched;
}

/**
 * RPC Function handlers.
 */
export function callRpc(name: string, param2?: any, param3?: any): any {
  let args: any = {};
  let userId: string | undefined = undefined;

  if (typeof param2 === "string" || typeof param2 === "number") {
    userId = String(param2);
    args = typeof param3 === "object" && param3 !== null ? param3 : (param3 ?? {});
  } else if (typeof param3 === "string" || typeof param3 === "number") {
    userId = String(param3);
    args = typeof param2 === "object" && param2 !== null ? param2 : (param2 ?? {});
  } else {
    if (param2 && typeof param2 === "object") {
      args = param2;
    } else if (param3 && typeof param3 === "object") {
      args = param3;
    }
  }

  switch (name) {
    case "spend_points": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const amount = Number(args?.p_amount ?? args?.amount ?? 0);
      const pref = getTableRows("user_preferences", userId)[0] || { points: 100 };
      const currentPoints = Number(pref.points ?? 100);
      if (currentPoints < amount) {
        return { success: false, error: "Insufficient points" };
      }
      const updated = { ...pref, points: currentPoints - amount };
      saveTableRows("user_preferences", userId, [updated]);
      return { success: true, points: updated.points };
    }
    case "get_points_status": {
      if (!userId) return { points: 0, daily_claim_available: true };
      const user = getUserById(userId);
      const prefs = getTableRows("user_preferences", userId)[0];
      return {
        points: prefs?.points ?? user?.points ?? 100,
        daily_claim_available: true,
        streak_days: 1,
      };
    }
    case "upsert_user_preferences": {
      if (!userId) throw new Error("Unauthorized");
      const normalized = normalizeUserPreferences(args);
      return upsertTable("user_preferences", normalized, userId, "user_id");
    }
    case "get_my_friendships": {
      if (!userId) return [];
      const friends = getTableRows("friendships", userId);
      return friends.map((f) => {
        const friendId = f.friend_id === userId ? f.user_id : f.friend_id;
        const prof = getProfileByUserId(friendId);
        return {
          ...f,
          profile: prof,
        };
      });
    }
    case "get_my_follows": {
      if (!userId) return [];
      const follows = getTableRows("follows", userId);
      return follows.map((f) => {
        const targetId = f.following_id;
        const prof = getProfileByUserId(targetId);
        return {
          ...f,
          profile: prof,
        };
      });
    }
    case "get_my_blocks": {
      if (!userId) return [];
      return getTableRows("blocks", userId);
    }
    case "sync_user_games": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const incomingGames: any[] =
        args?.games ??
        args?.p_games ??
        args?.user_games ??
        (Array.isArray(args) ? args : []);

      const now = new Date().toISOString();
      const existingGames = getTableRows("user_games", userId) as UserGameRecord[];
      const existingPlaytimes = getTableRows("user_playtime", userId) as UserPlaytimeRecord[];

      const playtimeMap = new Map<string, UserPlaytimeRecord>();
      for (const pt of existingPlaytimes) {
        if (pt.game_id) playtimeMap.set(pt.game_id, pt);
      }

      const existingMap = new Map<string, UserGameRecord>();
      for (const g of existingGames) {
        const key = g.game_id || g.id;
        if (key) existingMap.set(key, g);
      }

      for (const item of incomingGames) {
        const gameId = item.game_id || item.id || crypto.randomUUID();
        const existing = existingMap.get(gameId) || (item.id ? existingMap.get(item.id) : undefined);
        const ptRecord = playtimeMap.get(gameId);

        const isCustom = Boolean(
          item.is_custom ?? existing?.is_custom ?? item.platform === "custom",
        );
        const playtimeSeconds = Math.max(
          Number(item.playtime_seconds) || 0,
          Number(existing?.playtime_seconds) || 0,
          Number(ptRecord?.total_seconds) || 0,
        );

        let lastPlayedAt =
          item.last_played_at ||
          existing?.last_played_at ||
          ptRecord?.last_played_at ||
          null;
        if (item.last_played_at && existing?.last_played_at) {
          lastPlayedAt =
            new Date(item.last_played_at).getTime() >=
            new Date(existing.last_played_at).getTime()
              ? item.last_played_at
              : existing.last_played_at;
        }

        const mergedRecord: UserGameRecord = {
          id: existing?.id || item.id || gameId,
          user_id: userId,
          game_id: gameId,
          title: item.title ?? existing?.title ?? "",
          platform:
            item.platform ?? existing?.platform ?? (isCustom ? "custom" : "unknown"),
          executable_path:
            item.executable_path ?? existing?.executable_path ?? undefined,
          launch_url: item.launch_url ?? existing?.launch_url ?? undefined,
          install_path: item.install_path ?? existing?.install_path ?? undefined,
          icon_url: item.icon_url ?? existing?.icon_url ?? undefined,
          banner_url: item.banner_url ?? existing?.banner_url ?? undefined,
          is_custom: isCustom,
          playtime_seconds: playtimeSeconds,
          last_played_at: lastPlayedAt,
          created_at: existing?.created_at || item.created_at || now,
          updated_at: now,
          ...(item.metadata ? { metadata: item.metadata } : {}),
        };

        existingMap.set(gameId, mergedRecord);
      }

      const allMergedGames = Array.from(existingMap.values());
      saveTableRows("user_games", userId, allMergedGames);
      return {
        success: true,
        count: allMergedGames.length,
        games: allMergedGames,
      };
    }
    case "add_custom_game": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const now = new Date().toISOString();
      const title = String(args?.title ?? args?.p_title ?? "").trim();
      const executablePath = String(
        args?.executable_path ?? args?.p_executable_path ?? "",
      ).trim();
      const launchUrl = args?.launch_url ?? args?.p_launch_url ?? "";
      const iconUrl = args?.icon_url ?? args?.p_icon_url ?? "";
      const bannerUrl = args?.banner_url ?? args?.p_banner_url ?? "";
      const installPath =
        args?.install_path ??
        args?.p_install_path ??
        (executablePath ? path.dirname(executablePath) : "");
      const customId =
        args?.id ??
        args?.p_id ??
        args?.game_id ??
        args?.p_game_id ??
        `custom_${crypto.randomUUID()}`;

      const existingGames = getTableRows("user_games", userId) as UserGameRecord[];
      const existingIndex = existingGames.findIndex(
        (g) =>
          g.id === customId ||
          g.game_id === customId ||
          (title &&
            g.title.toLowerCase() === title.toLowerCase() &&
            g.is_custom),
      );

      let gameRecord: UserGameRecord;
      if (existingIndex >= 0) {
        const prev = existingGames[existingIndex];
        gameRecord = {
          ...prev,
          title: title || prev.title,
          platform: "custom",
          is_custom: true,
          executable_path: executablePath || prev.executable_path,
          launch_url: launchUrl || prev.launch_url,
          install_path: installPath || prev.install_path,
          icon_url: iconUrl || prev.icon_url,
          banner_url: bannerUrl || prev.banner_url,
          updated_at: now,
        };
        existingGames[existingIndex] = gameRecord;
      } else {
        gameRecord = {
          id: customId,
          user_id: userId,
          game_id: customId,
          title: title || "Custom Game",
          platform: "custom",
          executable_path: executablePath || undefined,
          launch_url: launchUrl || undefined,
          install_path: installPath || undefined,
          icon_url: iconUrl || undefined,
          banner_url: bannerUrl || undefined,
          is_custom: true,
          playtime_seconds: Number(
            args?.playtime_seconds ?? args?.p_playtime_seconds ?? 0,
          ),
          last_played_at: null,
          created_at: now,
          updated_at: now,
        };
        existingGames.push(gameRecord);
      }

      saveTableRows("user_games", userId, existingGames);
      return {
        success: true,
        game: gameRecord,
        ...gameRecord,
      };
    }
    case "log_playtime": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const gameId = String(
        args?.game_id ?? args?.p_game_id ?? args?.id ?? "",
      ).trim();
      if (!gameId) return { success: false, error: "Missing game_id" };

      const durationSeconds = Math.max(
        0,
        Number(
          args?.duration_seconds ??
            args?.p_duration_seconds ??
            args?.seconds ??
            args?.playtime_seconds ??
            0,
        ),
      );
      const gameTitle = args?.game_title ?? args?.p_game_title ?? args?.title;
      const platform = args?.platform ?? args?.p_platform;
      const now = new Date().toISOString();
      const lastPlayedAt =
        args?.last_played_at ?? args?.p_last_played_at ?? now;

      // 1. Update user_playtime table
      const playtimes = getTableRows("user_playtime", userId) as UserPlaytimeRecord[];
      const ptIndex = playtimes.findIndex((p) => p.game_id === gameId);
      let totalSeconds = durationSeconds;
      let ptRecord: UserPlaytimeRecord;

      if (ptIndex >= 0) {
        ptRecord = playtimes[ptIndex];
        ptRecord.total_seconds =
          (Number(ptRecord.total_seconds) || 0) + durationSeconds;
        ptRecord.last_played_at = lastPlayedAt;
        ptRecord.updated_at = now;
        if (gameTitle && !ptRecord.game_title) ptRecord.game_title = gameTitle;
        if (platform && !ptRecord.platform) ptRecord.platform = platform;
        totalSeconds = ptRecord.total_seconds;
      } else {
        ptRecord = {
          id: crypto.randomUUID(),
          user_id: userId,
          game_id: gameId,
          game_title: gameTitle || gameId,
          platform: platform || "unknown",
          total_seconds: durationSeconds,
          last_played_at: lastPlayedAt,
          created_at: now,
          updated_at: now,
        };
        playtimes.push(ptRecord);
      }
      saveTableRows("user_playtime", userId, playtimes);

      // 2. Update user_games table
      const games = getTableRows("user_games", userId) as UserGameRecord[];
      const gIndex = games.findIndex(
        (g) => g.game_id === gameId || g.id === gameId,
      );
      if (gIndex >= 0) {
        games[gIndex].playtime_seconds =
          (Number(games[gIndex].playtime_seconds) || 0) + durationSeconds;
        games[gIndex].last_played_at = lastPlayedAt;
        games[gIndex].updated_at = now;
        saveTableRows("user_games", userId, games);
      } else {
        const newGame: UserGameRecord = {
          id: gameId,
          user_id: userId,
          game_id: gameId,
          title: gameTitle || gameId,
          platform: platform || "unknown",
          is_custom: platform === "custom",
          playtime_seconds: durationSeconds,
          last_played_at: lastPlayedAt,
          created_at: now,
          updated_at: now,
        };
        games.push(newGame);
        saveTableRows("user_games", userId, games);
      }

      return {
        success: true,
        game_id: gameId,
        duration_logged: durationSeconds,
        total_seconds: totalSeconds,
        playtime_seconds: totalSeconds,
        last_played_at: lastPlayedAt,
      };
    }
    case "get_user_playtime": {
      if (!userId) {
        return {
          success: false,
          total_seconds: 0,
          playtime_seconds: 0,
          games: {},
          playtime: {},
        };
      }
      const targetGameId = args?.game_id ?? args?.p_game_id ?? args?.id;

      const playtimes = getTableRows("user_playtime", userId) as UserPlaytimeRecord[];
      const games = getTableRows("user_games", userId) as UserGameRecord[];

      const playtimeMap: Record<string, number> = {};
      for (const pt of playtimes) {
        if (pt.game_id) {
          playtimeMap[pt.game_id] = Number(pt.total_seconds) || 0;
        }
      }
      for (const g of games) {
        const key = g.game_id || g.id;
        if (key) {
          playtimeMap[key] = Math.max(
            playtimeMap[key] || 0,
            Number(g.playtime_seconds) || 0,
          );
        }
      }

      if (targetGameId) {
        const seconds = playtimeMap[targetGameId] || 0;
        return {
          success: true,
          game_id: targetGameId,
          total_seconds: seconds,
          playtime_seconds: seconds,
        };
      }

      return {
        success: true,
        games: playtimeMap,
        playtime: playtimeMap,
      };
    }
    case "set_game_presence": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const isPlaying = Boolean(args?.is_playing ?? args?.p_is_playing ?? false);
      const gameId = isPlaying
        ? (args?.game_id ?? args?.p_game_id ?? null)
        : null;
      const gameTitle = isPlaying
        ? (args?.game_title ?? args?.p_game_title ?? null)
        : null;
      const platform = isPlaying
        ? (args?.platform ?? args?.p_platform ?? null)
        : null;
      const now = new Date().toISOString();
      const startedAt = isPlaying
        ? (args?.started_at ?? args?.p_started_at ?? now)
        : null;

      const presenceRecord: UserPresenceRecord = {
        id: userId,
        user_id: userId,
        game_id: gameId,
        game_title: gameTitle,
        platform: platform,
        is_playing: isPlaying,
        started_at: startedAt,
        updated_at: now,
      };

      saveTableRows("user_presence", userId, [presenceRecord]);
      return {
        success: true,
        presence: presenceRecord,
        ...presenceRecord,
      };
    }
    case "get_game_friends": {
      if (!userId) return [];
      const targetGameId = args?.game_id ?? args?.p_game_id;
      let targetGameTitle = (
        args?.game_title ??
        args?.p_game_title ??
        ""
      ).trim().toLowerCase();

      // If no game title was provided, but targetGameId is provided, attempt to infer title from caller's games/playtime
      if (!targetGameTitle && targetGameId) {
        const callerGames = getTableRows("user_games", userId) as UserGameRecord[];
        const callerGame = callerGames.find(
          (g) => g.game_id === targetGameId || g.id === targetGameId,
        );
        if (callerGame && callerGame.title) {
          targetGameTitle = callerGame.title.trim().toLowerCase();
        }
        if (!targetGameTitle) {
          const callerPlaytimes = getTableRows("user_playtime", userId) as UserPlaytimeRecord[];
          const callerPt = callerPlaytimes.find((p) => p.game_id === targetGameId);
          if (callerPt && callerPt.game_title) {
            targetGameTitle = callerPt.game_title.trim().toLowerCase();
          }
        }
      }

      const friendIds = getAcceptedFriendIds(userId);
      const results: any[] = [];
      const THREE_MINUTES_MS = 3 * 60 * 1000;
      const nowMs = Date.now();

      for (const friendId of friendIds) {
        const pref = readJsonFile<UserPreferencesRecord>(
          path.join(DATA_DIR, friendId, "preferences.json"),
          {} as any,
        );
        if (pref.share_game_activity === false) {
          continue;
        }

        const friendGames = readJsonFile<UserGameRecord[]>(
          path.join(DATA_DIR, friendId, "games", "games.json"),
          [],
        );
        const friendPlaytimes = readJsonFile<UserPlaytimeRecord[]>(
          path.join(DATA_DIR, friendId, "games", "playtime.json"),
          [],
        );
        const friendPresenceList = readJsonFile<UserPresenceRecord[]>(
          path.join(DATA_DIR, friendId, "games", "presence.json"),
          [],
        );
        const presenceRecord = Array.isArray(friendPresenceList)
          ? friendPresenceList[0]
          : friendPresenceList;

        const matchingGame = friendGames.find((g) => {
          if (targetGameId) {
            if (g.game_id === targetGameId || g.id === targetGameId) return true;
            const cleanTarget = String(targetGameId).replace(
              /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i,
              "",
            );
            const cleanGame = String(g.game_id || g.id).replace(
              /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i,
              "",
            );
            if (cleanTarget && cleanTarget === cleanGame) return true;
          }
          if (targetGameTitle && g.title?.toLowerCase() === targetGameTitle)
            return true;
          return false;
        });

        const matchingPlaytime = friendPlaytimes.find((p) => {
          if (targetGameId) {
            if (p.game_id === targetGameId) return true;
            const cleanTarget = String(targetGameId).replace(
              /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i,
              "",
            );
            const cleanPt = String(p.game_id).replace(
              /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i,
              "",
            );
            if (cleanTarget && cleanTarget === cleanPt) return true;
          }
          if (
            targetGameTitle &&
            p.game_title?.toLowerCase() === targetGameTitle
          )
            return true;
          return false;
        });

        let isPlaying = false;
        let isPlayingThisGame = false;
        if (presenceRecord && presenceRecord.is_playing) {
          const updatedAtMs = new Date(presenceRecord.updated_at).getTime();
          if (!isNaN(updatedAtMs) && nowMs - updatedAtMs <= THREE_MINUTES_MS) {
            isPlaying = true;
            const presGameId = String(presenceRecord.game_id || "");
            const presGameTitle = String(presenceRecord.game_title || "").trim().toLowerCase();
            const cleanPres = presGameId.replace(
              /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i,
              "",
            );
            const cleanTarget = targetGameId
              ? String(targetGameId).replace(
                  /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i,
                  "",
                )
              : "";

            if (!targetGameId && !targetGameTitle) {
              isPlayingThisGame = true;
            } else if (
              (targetGameId && (presGameId === targetGameId || (cleanTarget && cleanTarget === cleanPres))) ||
              (targetGameTitle && presGameTitle === targetGameTitle) ||
              (matchingGame && matchingGame.game_id && presGameId === matchingGame.game_id) ||
              (matchingGame && matchingGame.title && presGameTitle === matchingGame.title.toLowerCase()) ||
              (matchingPlaytime && matchingPlaytime.game_id && presGameId === matchingPlaytime.game_id) ||
              (matchingPlaytime && matchingPlaytime.game_title && presGameTitle === matchingPlaytime.game_title.toLowerCase())
            ) {
              isPlayingThisGame = true;
            }
          }
        }

        if (
          (targetGameId || targetGameTitle) &&
          !matchingGame &&
          !matchingPlaytime &&
          !isPlayingThisGame
        ) {
          continue;
        }

        const playtimeSeconds = Math.max(
          Number(matchingGame?.playtime_seconds) || 0,
          Number(matchingPlaytime?.total_seconds) || 0,
        );
        const lastPlayedAt =
          matchingGame?.last_played_at ||
          matchingPlaytime?.last_played_at ||
          null;

        const profile = getProfileByUserId(friendId);

        results.push({
          user_id: friendId,
          friend_id: friendId,
          username: profile?.username || "Unknown",
          display_name: profile?.display_name || profile?.username || "Unknown",
          avatar_url: profile?.avatar_url || null,
          profile: profile,
          game_id:
            matchingGame?.game_id ||
            matchingPlaytime?.game_id ||
            presenceRecord?.game_id ||
            targetGameId ||
            null,
          game_title:
            matchingGame?.title ||
            matchingPlaytime?.game_title ||
            presenceRecord?.game_title ||
            targetGameTitle ||
            null,
          playtime_seconds: playtimeSeconds,
          last_played_at: lastPlayedAt,
          is_playing: isPlayingThisGame,
          is_online: isPlaying,
          current_presence: isPlaying ? presenceRecord : null,
        });
      }

      return results;
    }
    case "get_all_friends_presence":
    case "get_friends_game_activity": {
      if (!userId) return [];
      const friendIds = getAcceptedFriendIds(userId);
      const activities: any[] = [];
      const THREE_MINUTES_MS = 3 * 60 * 1000;
      const nowMs = Date.now();

      for (const friendId of friendIds) {
        const friendPref = readJsonFile<UserPreferencesRecord>(
          path.join(DATA_DIR, friendId, "preferences.json"),
          {} as any,
        );
        if (friendPref.share_game_activity === false) {
          continue;
        }

        const profile = getProfileByUserId(friendId);
        const friendPresenceList = readJsonFile<UserPresenceRecord[]>(
          path.join(DATA_DIR, friendId, "games", "presence.json"),
          [],
        );
        const presenceRecord = Array.isArray(friendPresenceList)
          ? friendPresenceList[0]
          : friendPresenceList;

        let isPlaying = false;
        if (presenceRecord && presenceRecord.is_playing) {
          const updatedAtMs = new Date(presenceRecord.updated_at).getTime();
          if (!isNaN(updatedAtMs) && nowMs - updatedAtMs <= THREE_MINUTES_MS) {
            isPlaying = true;
          }
        }

        const friendGames = readJsonFile<UserGameRecord[]>(
          path.join(DATA_DIR, friendId, "games", "games.json"),
          [],
        );
        const friendPlaytimes = readJsonFile<UserPlaytimeRecord[]>(
          path.join(DATA_DIR, friendId, "games", "playtime.json"),
          [],
        );

        // Find last played game
        let lastPlayedGame: string | null = null;
        let latestTime = 0;
        for (const g of friendGames) {
          if (g.last_played_at) {
            const t = new Date(g.last_played_at).getTime();
            if (t > latestTime) {
              latestTime = t;
              lastPlayedGame = g.title;
            }
          }
        }
        for (const pt of friendPlaytimes) {
          if (pt.last_played_at) {
            const t = new Date(pt.last_played_at).getTime();
            if (t > latestTime) {
              latestTime = t;
              lastPlayedGame = pt.game_title || pt.game_id;
            }
          }
        }

        activities.push({
          user_id: friendId,
          friend_id: friendId,
          username: profile?.username || "Unknown",
          display_name: profile?.display_name || profile?.username || "Unknown",
          avatar_url: profile?.avatar_url || null,
          profile: profile,
          is_playing: isPlaying,
          is_online: isPlaying,
          current_game:
            isPlaying && presenceRecord
              ? {
                  game_id: presenceRecord.game_id,
                  game_title: presenceRecord.game_title,
                  platform: presenceRecord.platform,
                  started_at: presenceRecord.started_at,
                }
              : null,
          current_game_id: isPlaying ? presenceRecord?.game_id : null,
          platform: isPlaying ? presenceRecord?.platform : null,
          last_played_game: lastPlayedGame,
          presence: isPlaying ? presenceRecord : null,
          total_games_count: friendGames.length,
        });
      }

      return activities;
    }
    default:
      return null;
  }
}

/**
 * Resolves bidirectional accepted friendships for a user, filtering out blocked relations.
 */
export function getAcceptedFriendIds(userId: string | number): string[] {
  if (userId === undefined || userId === null || String(userId).trim() === "") return [];
  const userIdStr = String(userId);
  const friendSet = new Set<string>();
  const userIds = getAllUserIds();

  // 1. Check user's own friendships / friends table
  const userFriends = [
    ...getTableRows("friendships", userIdStr),
    ...getTableRows("friends", userIdStr),
  ];
  const seenFriendIds = new Set<string>();
  for (const f of userFriends) {
    if (f && f.id && seenFriendIds.has(f.id)) continue;
    if (f && f.id) seenFriendIds.add(f.id);
    if (f && f.status === "accepted") {
      const otherId = String(f.friend_id === userIdStr ? f.user_id : f.friend_id);
      if (otherId && otherId !== userIdStr) {
        friendSet.add(otherId);
      }
    }
  }

  // 2. Also check all other users' friendship tables in case the record was stored on the other party's side
  for (const uid of userIds) {
    if (uid === userIdStr) continue;
    const friendships = [
      ...readJsonFile<any[]>(
        path.join(DATA_DIR, uid, "friends", "friends.json"),
        [],
      ),
      ...readJsonFile<any[]>(
        path.join(DATA_DIR, uid, "friends", "friendships.json"),
        [],
      ),
    ];
    for (const f of friendships) {
      if (f && f.status === "accepted") {
        if (
          String(f.user_id) === userIdStr &&
          f.friend_id &&
          String(f.friend_id) !== userIdStr
        ) {
          friendSet.add(String(f.friend_id));
        } else if (
          String(f.friend_id) === userIdStr &&
          f.user_id &&
          String(f.user_id) !== userIdStr
        ) {
          friendSet.add(String(f.user_id));
        }
      }
    }
  }

  // 3. Filter out any blocked users (bidirectional block check)
  const myBlocks = getTableRows("blocks", userIdStr);
  const blockedIds = new Set<string>();
  for (const b of myBlocks) {
    if (b.blocked_id) blockedIds.add(String(b.blocked_id));
    if (b.blocked_user_id) blockedIds.add(String(b.blocked_user_id));
    if (b.target_id) blockedIds.add(String(b.target_id));
  }

  for (const fid of Array.from(friendSet)) {
    const friendBlocks = readJsonFile<any[]>(
      path.join(DATA_DIR, fid, "friends", "blocks.json"),
      [],
    );
    for (const b of friendBlocks) {
      if (
        String(b.blocked_id) === userIdStr ||
        String(b.blocked_user_id) === userIdStr ||
        String(b.target_id) === userIdStr
      ) {
        blockedIds.add(fid);
      }
    }
  }

  return Array.from(friendSet).filter((id) => !blockedIds.has(id) && id !== userIdStr);
}
