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
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  single?: boolean;
  userId?: string;
  select?: string;
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
  writeJsonFile(path.join(userDir, "passwords", "passwords.json"), []);
  writeJsonFile(path.join(userDir, "vpn", "configs.json"), []);
  writeJsonFile(path.join(userDir, "integrations", "integrations.json"), []);
  writeJsonFile(path.join(userDir, "support", "tickets.json"), []);
  writeJsonFile(path.join(userDir, "friends", "friends.json"), []);
  writeJsonFile(path.join(userDir, "friends", "follows.json"), []);
  writeJsonFile(path.join(userDir, "friends", "blocks.json"), []);
  writeJsonFile(path.join(userDir, "public_assets", "assets.json"), []);

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

export function getUserById(userId: string) {
  if (!userId) return null;
  const userPath = path.join(DATA_DIR, userId, "user.json");
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

export function getProfileByUserId(userId: string) {
  if (!userId) return null;
  const profilePath = path.join(DATA_DIR, userId, "profile.json");
  return readJsonFile(profilePath, null);
}

/**
 * Returns the file path for a given table and userId.
 */
export function getTableFilePath(table: string, userId?: string): string | null {
  const normTable = table.toLowerCase();

  // If userId is provided, map user-specific tables
  if (userId) {
    const userDir = path.join(DATA_DIR, userId);
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
      case "user_passwords":
        return path.join(userDir, "passwords", "passwords.json");
      case "vpn_configs":
        return path.join(userDir, "vpn", "configs.json");
      case "user_integrations":
        return path.join(userDir, "integrations", "integrations.json");
      case "support_tickets":
        return path.join(userDir, "support", "tickets.json");
      case "friendships":
        return path.join(userDir, "friends", "friends.json");
      case "follows":
        return path.join(userDir, "friends", "follows.json");
      case "blocks":
        return path.join(userDir, "friends", "blocks.json");
      case "public_assets":
        return path.join(userDir, "public_assets", "assets.json");
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
      default:
        return null;
    }
  }

  return null;
}

/**
 * Reads all rows from a table across either a specific user or all users.
 */
export function getTableRows(table: string, userId?: string): any[] {
  const normTable = table.toLowerCase();

  // If table is a single object file (profile / preferences)
  if (normTable === "profiles" || normTable === "profile_pictures") {
    if (userId) {
      const p = getProfileByUserId(userId);
      return p ? [p] : [];
    }
    // All profiles
    const userIds = getAllUserIds();
    return userIds
      .map((id) => getProfileByUserId(id))
      .filter((p) => p !== null);
  }

  if (normTable === "user_preferences") {
    if (userId) {
      const prefPath = path.join(DATA_DIR, userId, "preferences.json");
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

  if (normTable === "support_tickets" && !userId) {
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
  if (userId) {
    const filePath = getTableFilePath(table, userId);
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
export function saveTableRows(table: string, userId: string, rows: any[]) {
  const normTable = table.toLowerCase();
  if (normTable === "profiles" || normTable === "profile_pictures") {
    const profilePath = path.join(DATA_DIR, userId, "profile.json");
    const existing = readJsonFile(profilePath, {});
    writeJsonFile(profilePath, { ...existing, ...(rows[0] || {}) });
    return;
  }

  if (normTable === "user_preferences") {
    const prefPath = path.join(DATA_DIR, userId, "preferences.json");
    const existing = readJsonFile(prefPath, {});
    writeJsonFile(prefPath, { ...existing, ...(rows[0] || {}) });
    return;
  }

  const filePath = getTableFilePath(table, userId);
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
      return rowVal === value || (value === null && (rowVal === null || rowVal === undefined));
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

/**
 * Execute a query on a table.
 */
export function queryTable(options: QueryOptions): any {
  const {
    table,
    filters = [],
    order,
    limit,
    offset = 0,
    single = false,
    userId,
    select,
  } = options;

  let rows = getTableRows(table, userId);

  // Apply filters
  if (filters && filters.length > 0) {
    rows = rows.filter((row) =>
      filters.every((filter) => matchesFilter(row, filter)),
    );
  }

  // For data_saves: expand category relation if requested (e.g., category:category_id(*))
  if (table === "data_saves" && select && select.includes("category")) {
    const cats = userId
      ? readJsonFile<any[]>(path.join(DATA_DIR, userId, "datastore", "categories.json"), [])
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
 * Insert a record or records into a table.
 */
export function insertTable(table: string, data: any | any[], userId: string): any {
  const normTable = table.toLowerCase();
  const items = Array.isArray(data) ? data : [data];
  const now = new Date().toISOString();

  const prepared = items.map((item) => ({
    id: item.id || crypto.randomUUID(),
    user_id: item.user_id || userId,
    created_at: item.created_at || now,
    updated_at: item.updated_at || now,
    ...item,
  }));

  if (normTable === "profiles" || normTable === "profile_pictures" || normTable === "user_preferences") {
    saveTableRows(table, userId, prepared);
    return Array.isArray(data) ? prepared : prepared[0];
  }

  const existing = getTableRows(table, userId);
  const updated = [...prepared, ...existing];
  saveTableRows(table, userId, updated);

  return Array.isArray(data) ? prepared : prepared[0];
}

/**
 * Update records matching filters.
 */
export function updateTable(
  table: string,
  filters: DataFilter[],
  data: any,
  userId: string,
): any {
  const normTable = table.toLowerCase();
  const now = new Date().toISOString();

  if (normTable === "profiles" || normTable === "profile_pictures" || normTable === "user_preferences") {
    const existing = getTableRows(table, userId)[0] || {};
    const updated = { ...existing, ...data, updated_at: now };
    saveTableRows(table, userId, [updated]);
    return [updated];
  }

  const existing = getTableRows(table, userId);
  const matched: any[] = [];
  const updated = existing.map((row) => {
    if (filters.every((f) => matchesFilter(row, f))) {
      const modified = { ...row, ...data, updated_at: now };
      matched.push(modified);
      return modified;
    }
    return row;
  });

  saveTableRows(table, userId, updated);
  return matched;
}

/**
 * Upsert records.
 */
export function upsertTable(
  table: string,
  data: any | any[],
  userId: string,
  onConflict: string = "id",
): any {
  const normTable = table.toLowerCase();
  const items = Array.isArray(data) ? data : [data];
  const now = new Date().toISOString();

  if (normTable === "profiles" || normTable === "profile_pictures" || normTable === "user_preferences") {
    const existing = getTableRows(table, userId)[0] || {};
    const updated = { ...existing, ...(items[0] || {}), updated_at: now };
    saveTableRows(table, userId, [updated]);
    return Array.isArray(data) ? [updated] : updated;
  }

  const existing = getTableRows(table, userId);
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
        user_id: item.user_id || userId,
        created_at: item.created_at || now,
        updated_at: item.updated_at || now,
        ...item,
      };
      existingMap.set(String(newItem[onConflict] || newItem.id), newItem);
      result.push(newItem);
    }
  }

  const allRows = Array.from(existingMap.values());
  saveTableRows(table, userId, allRows);

  return Array.isArray(data) ? result : result[0];
}

/**
 * Delete records matching filters.
 */
export function deleteTable(table: string, filters: DataFilter[], userId: string): any {
  const existing = getTableRows(table, userId);
  const matched: any[] = [];
  const remaining = existing.filter((row) => {
    const matches = filters.every((f) => matchesFilter(row, f));
    if (matches) {
      matched.push(row);
      return false;
    }
    return true;
  });

  saveTableRows(table, userId, remaining);
  return matched;
}

/**
 * RPC Function handlers.
 */
export function callRpc(name: string, args: any = {}, userId?: string): any {
  switch (name) {
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
      return upsertTable("user_preferences", args, userId, "user_id");
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
    default:
      return null;
  }
}
