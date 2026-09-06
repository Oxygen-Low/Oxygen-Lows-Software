var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/lib/dataStore.ts
import fs from "node:fs";
import path from "node:path";
import crypto2 from "node:crypto";
function setRealtimeBroadcast(fn) {
  _broadcast = fn;
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
function readJsonFile(filePath, defaultValue) {
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
function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}
function getNextUserId() {
  ensureDir(DATA_DIR);
  const metaPath = path.join(DATA_DIR, "meta.json");
  let nextId = 1;
  if (fs.existsSync(metaPath)) {
    const meta = readJsonFile(metaPath, { nextUserId: 1 });
    nextId = typeof meta.nextUserId === "number" ? meta.nextUserId : 1;
  } else {
    try {
      const items = fs.readdirSync(DATA_DIR, { withFileTypes: true });
      for (const item of items) {
        const resolvedBase = path.resolve(DATA_DIR);
        const resolvedTarget = path.resolve(DATA_DIR, item.name);
        const relative = path.relative(resolvedBase, resolvedTarget);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          continue;
        }
        if (item.isDirectory() && /^\d+$/.test(item.name)) {
          const num = parseInt(item.name, 10);
          if (num >= nextId) {
            nextId = num + 1;
          }
        }
      }
    } catch {
    }
  }
  writeJsonFile(metaPath, { nextUserId: nextId + 1 });
  return String(nextId);
}
function initUserFolder(userId, userInitialData) {
  const resolvedBase = path.resolve(DATA_DIR);
  const resolvedTarget = path.resolve(DATA_DIR, userId);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid user ID");
  }
  cachedUserIds = null;
  const userDir = resolvedTarget;
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
  ensureDir(path.join(process.cwd(), "uploads", "Storage", userId));
  ensureDir(path.join(process.cwd(), "uploads", "public-assets", userId));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const role = userInitialData.role || (String(userId) === "1" ? "admin" : "user");
  const userData = {
    id: userId,
    username: userInitialData.username,
    email: userInitialData.email,
    password_hash: userInitialData.passwordHash,
    salt: userInitialData.salt,
    role,
    points: 100,
    custom_models: [],
    created_at: now,
    updated_at: now
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
    last_points_usage: userInitialData.last_points_usage || null,
    created_at: now,
    updated_at: now
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
    research_agent_default_model: "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
    research_agent_default_provider: "horde",
    research_summarizer_default_model: "@cf/nvidia/nemotron-3-120b-a12b",
    research_summarizer_default_provider: "cloudflare",
    last_model_id: "Fast",
    last_provider: "horde",
    created_at: now,
    updated_at: now
  };
  writeJsonFile(path.join(userDir, "preferences.json"), preferencesData);
  writeJsonFile(path.join(userDir, "datastore", "categories.json"), []);
  writeJsonFile(path.join(userDir, "datastore", "saves.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "chats.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "messages.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "characters.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "universes.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "races.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "character_likes.json"), []);
  writeJsonFile(path.join(userDir, "chatbot", "public_characters.json"), []);
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
  writeJsonFile(path.join(userDir, "points", "transactions.json"), []);
  writeJsonFile(path.join(userDir, "points", "gifts.json"), []);
  return userData;
}
function getAllUserIds() {
  const now = Date.now();
  if (cachedUserIds !== null && now - lastCacheTime < CACHE_TTL) {
    return cachedUserIds;
  }
  if (!fs.existsSync(DATA_DIR)) return [];
  const resolvedDataDir = path.resolve(DATA_DIR);
  try {
    cachedUserIds = fs.readdirSync(resolvedDataDir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d+$/.test(d.name)).map((d) => d.name);
    lastCacheTime = now;
    return cachedUserIds;
  } catch {
    return [];
  }
}
function getUserById(userId) {
  if (userId === void 0 || userId === null || String(userId).trim() === "")
    return null;
  const base = path.resolve(DATA_DIR);
  const target = path.resolve(base, String(userId), "user.json");
  const relative = path.relative(base, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  const userPath = target;
  const user = readJsonFile(userPath, null);
  if (user && String(userId) === "1" && user.role !== "admin") {
    user.role = "admin";
  }
  return user;
}
function getUserByUsernameOrEmail(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();
  const userIds = getAllUserIds();
  for (const id of userIds) {
    const user = getUserById(id);
    if (user && (user.username?.toLowerCase() === clean || user.email?.toLowerCase() === clean)) {
      return user;
    }
  }
  return null;
}
function getProfileByUserId(userId) {
  if (userId === void 0 || userId === null || String(userId).trim() === "")
    return null;
  const userIdStr = String(userId);
  const now = Date.now();
  const cached = profileCache.get(userIdStr);
  if (cached && now - cached.timestamp < PROFILE_CACHE_TTL) {
    return cached.data;
  }
  const profilePath = path.join(DATA_DIR, userIdStr, "profile.json");
  const base = path.resolve(DATA_DIR);
  const target = path.resolve(profilePath);
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const data = readJsonFile(target, null);
  profileCache.set(userIdStr, { data, timestamp: now });
  return data;
}
function invalidateProfileCache(userId) {
  profileCache.delete(String(userId));
}
function getTableFilePath(table, userId) {
  const normTable = table.toLowerCase();
  if (userId !== void 0 && userId !== null && String(userId).trim() !== "") {
    const userDir = path.join(DATA_DIR, String(userId));
    let filePath = null;
    switch (normTable) {
      case "profiles":
        filePath = path.join(userDir, "profile.json");
        break;
      case "profile_pictures":
        filePath = path.join(userDir, "profile.json");
        break;
      case "user_preferences":
        filePath = path.join(userDir, "preferences.json");
        break;
      case "data_saves":
        filePath = path.join(userDir, "datastore", "saves.json");
        break;
      case "data_save_categories":
        filePath = path.join(userDir, "datastore", "categories.json");
        break;
      case "chats":
        filePath = path.join(userDir, "chatbot", "chats.json");
        break;
      case "chat_messages":
        filePath = path.join(userDir, "chatbot", "messages.json");
        break;
      case "characters":
        filePath = path.join(userDir, "chatbot", "characters.json");
        break;
      case "universes":
        filePath = path.join(userDir, "chatbot", "universes.json");
        break;
      case "races":
        filePath = path.join(userDir, "chatbot", "races.json");
        break;
      case "user_passwords":
        filePath = path.join(userDir, "passwords", "passwords.json");
        break;
      case "vpn_configs":
        filePath = path.join(userDir, "vpn", "configs.json");
        break;
      case "user_integrations":
        filePath = path.join(userDir, "integrations", "integrations.json");
        break;
      case "support_tickets":
        filePath = path.join(userDir, "support", "tickets.json");
        break;
      case "support_messages":
        filePath = path.join(userDir, "support", "messages.json");
        break;
      case "friendships":
      case "friends":
        filePath = path.join(userDir, "friends", "friends.json");
        break;
      case "follows":
        filePath = path.join(userDir, "friends", "follows.json");
        break;
      case "blocks":
        filePath = path.join(userDir, "friends", "blocks.json");
        break;
      case "public_assets":
        filePath = path.join(userDir, "public_assets", "assets.json");
        break;
      case "asset_verifications":
        filePath = path.join(userDir, "public_assets", "verifications.json");
        break;
      case "public_asset_likes":
        filePath = path.join(userDir, "public_assets", "likes.json");
        break;
      case "public_character_likes":
        filePath = path.join(userDir, "chatbot", "character_likes.json");
        break;
      case "public_characters":
        filePath = path.join(userDir, "chatbot", "public_characters.json");
        break;
      case "defender_events":
        filePath = path.join(userDir, "defender", "events.json");
        break;
      case "defender_apps":
        filePath = path.join(userDir, "defender", "apps.json");
        break;
      case "defender_config":
        filePath = path.join(userDir, "defender", "config.json");
        break;
      case "defender_routes":
        filePath = path.join(userDir, "defender", "routes.json");
        break;
      case "defender_outbound":
        filePath = path.join(userDir, "defender", "outbound.json");
        break;
      case "defender_threat_actors":
        filePath = path.join(userDir, "defender", "threat_actors.json");
        break;
      case "defender_ip_blocks":
        filePath = path.join(userDir, "defender", "ip_blocks.json");
        break;
      case "defender_vpn":
        filePath = path.join(userDir, "defender", "vpn.json");
        break;
      case "user_models":
        filePath = path.join(userDir, "models", "models.json");
        break;
      case "user_games":
      case "games":
      case "game_library":
      case "installed_games":
      case "custom_games":
        filePath = path.join(userDir, "games", "games.json");
        break;
      case "user_playtime":
      case "game_playtime":
      case "playtime":
      case "playtimes":
        filePath = path.join(userDir, "games", "playtime.json");
        break;
      case "user_presence":
      case "game_presence":
      case "presence":
      case "presences":
        filePath = path.join(userDir, "games", "presence.json");
        break;
      case "points_transactions":
      case "point_transactions":
      case "user_points_transactions":
        filePath = path.join(userDir, "points", "transactions.json");
        break;
      case "point_gifts":
      case "user_point_gifts":
      case "points_gifts":
        filePath = path.join(userDir, "points", "gifts.json");
        break;
      default:
        return null;
    }
    if (filePath === null) return null;
    const base = path.resolve(DATA_DIR);
    const target = path.resolve(filePath);
    const rel = path.relative(base, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return target;
  }
  return null;
}
function getTableRows(table, userId) {
  const normTable = table.toLowerCase();
  const userIdStr = userId !== void 0 && userId !== null && String(userId).trim() !== "" ? String(userId) : void 0;
  if (normTable === "profiles" || normTable === "profile_pictures") {
    if (userIdStr) {
      const p = getProfileByUserId(userIdStr);
      return p ? [p] : [];
    }
    const userIds2 = getAllUserIds();
    return userIds2.map((id) => getProfileByUserId(id)).filter((p) => p !== null);
  }
  if (normTable === "user_preferences") {
    if (userIdStr) {
      const prefPath = path.join(DATA_DIR, userIdStr, "preferences.json");
      const pref = readJsonFile(prefPath, null);
      return pref ? [pref] : [];
    }
    const userIds2 = getAllUserIds();
    return userIds2.map(
      (id) => readJsonFile(path.join(DATA_DIR, id, "preferences.json"), null)
    ).filter((p) => p !== null);
  }
  if (normTable === "public_characters") {
    const userIds2 = getAllUserIds();
    const allChars = [];
    for (const id of userIds2) {
      const pubPath = path.join(
        DATA_DIR,
        id,
        "chatbot",
        "public_characters.json"
      );
      let chars = [];
      if (fs.existsSync(pubPath)) {
        chars = readJsonFile(pubPath, []);
      } else {
        chars = readJsonFile(
          path.join(DATA_DIR, id, "chatbot", "characters.json"),
          []
        ).filter((c) => c.is_public);
      }
      const prof = getProfileByUserId(id);
      for (const char of chars) {
        const isAnon = Boolean(char.is_anonymous);
        allChars.push({
          ...char,
          is_anonymous: isAnon,
          author_username: isAnon ? "Anonymous" : prof?.username || "Unknown",
          author_avatar_url: isAnon ? null : prof?.avatar_url || null
        });
      }
    }
    return allChars;
  }
  if (normTable === "public_assets") {
    const userIds2 = getAllUserIds();
    const allAssets = [];
    for (const id of userIds2) {
      const base = path.resolve(DATA_DIR);
      const target = path.resolve(base, id, "public_assets", "assets.json");
      const relative = path.relative(base, target);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        continue;
      }
      const assets = readJsonFile(target, []);
      const prof = getProfileByUserId(id);
      for (const asset of assets) {
        const isAnon = Boolean(asset.is_anonymous);
        allAssets.push({
          ...asset,
          is_anonymous: isAnon,
          author_username: isAnon ? "Anonymous" : prof?.username || "Unknown",
          author_avatar_url: isAnon ? null : prof?.avatar_url || null
        });
      }
    }
    return allAssets;
  }
  if (normTable === "support_tickets" && !userIdStr) {
    const userIds2 = getAllUserIds();
    const allTickets = [];
    for (const id of userIds2) {
      const tickets = readJsonFile(
        path.join(DATA_DIR, id, "support", "tickets.json"),
        []
      );
      allTickets.push(
        ...tickets.map((t) => ({
          ...t,
          user_id: t.user_id || id,
          status: t.status || "Open"
        }))
      );
    }
    return allTickets;
  }
  if (userIdStr) {
    const filePath = getTableFilePath(table, userIdStr);
    if (!filePath) return [];
    const rows = readJsonFile(filePath, []);
    if (normTable === "support_tickets" && Array.isArray(rows)) {
      return rows.map((t) => ({ ...t, status: t.status || "Open" }));
    }
    return rows;
  }
  const userIds = getAllUserIds();
  const allRows = [];
  for (const id of userIds) {
    const filePath = getTableFilePath(table, id);
    if (filePath && fs.existsSync(filePath)) {
      const rows = readJsonFile(filePath, []);
      if (Array.isArray(rows)) {
        allRows.push(...rows);
      }
    }
  }
  return allRows;
}
function saveTableRows(table, userId, rows) {
  if (userId === void 0 || userId === null || String(userId).trim() === "")
    return;
  const userIdStr = String(userId);
  const normTable = table.toLowerCase();
  if (normTable === "profiles" || normTable === "profile_pictures") {
    const profilePath = path.join(DATA_DIR, userIdStr, "profile.json");
    const existing = readJsonFile(profilePath, {});
    writeJsonFile(profilePath, { ...existing, ...rows[0] || {} });
    invalidateProfileCache(userIdStr);
    return;
  }
  if (normTable === "user_preferences") {
    const prefPath = path.join(DATA_DIR, userIdStr, "preferences.json");
    const existing = readJsonFile(prefPath, {});
    writeJsonFile(prefPath, { ...existing, ...rows[0] || {} });
    return;
  }
  const filePath = getTableFilePath(table, userIdStr);
  if (filePath) {
    writeJsonFile(filePath, rows);
  }
}
function matchesFilter(row, filter) {
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
      return rowVal === value || value === null && (rowVal === null || rowVal === void 0);
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
function parseSingleCondition(cond) {
  const parts = cond.trim().split(".");
  if (parts.length < 2) return null;
  const field = parts[0];
  const operator = parts[1];
  const rawValue = parts.slice(2).join(".");
  let value = rawValue;
  if (rawValue === "null") value = null;
  else if (rawValue === "true") value = true;
  else if (rawValue === "false") value = false;
  return { field, operator, value };
}
function splitTopLevel(str) {
  const result = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "(" || char === "[" || char === "{") depth++;
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
function evaluateClause(row, clause) {
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
function matchesOrFilter(row, orExpr) {
  const clauses = splitTopLevel(orExpr);
  if (clauses.length === 0) return true;
  return clauses.some((c) => evaluateClause(row, c));
}
function queryTable(options) {
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
    head = false
  } = options;
  let rows = getTableRows(table, userId);
  if (filters && filters.length > 0) {
    rows = rows.filter(
      (row) => filters.every((filter) => matchesFilter(row, filter))
    );
  }
  if (orFilters && orFilters.length > 0) {
    rows = rows.filter(
      (row) => orFilters.every((orExpr) => matchesOrFilter(row, orExpr))
    );
  }
  const totalCount = rows.length;
  if (head) {
    return { data: [], count: totalCount };
  }
  if (table === "data_saves" && select && select.includes("category")) {
    const cats = userId ? readJsonFile(
      path.join(DATA_DIR, userId, "datastore", "categories.json"),
      []
    ) : [];
    const catMap = new Map(cats.map((c) => [c.id, c]));
    rows = rows.map((r) => ({
      ...r,
      category: r.category_id ? catMap.get(r.category_id) || null : null
    }));
  }
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
      return ascending ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
    });
  }
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
function normalizeUserPreferences(args) {
  if (!args || typeof args !== "object") return {};
  const normalized = {};
  for (const [rawKey, val] of Object.entries(args)) {
    if (val === void 0) continue;
    const key = rawKey.startsWith("p_") ? rawKey.substring(2) : rawKey;
    normalized[key] = val;
  }
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
function insertTable(table, data, userId) {
  const userIdStr = String(userId);
  const normTable = table.toLowerCase();
  const items = Array.isArray(data) ? data : [data];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const prepared = items.map((item) => ({
    id: item.id || crypto2.randomUUID(),
    user_id: item.user_id || userIdStr,
    created_at: item.created_at || now,
    updated_at: item.updated_at || now,
    ...normTable === "support_tickets" ? { status: "Open" } : {},
    ...item
  }));
  if (normTable === "profiles" || normTable === "profile_pictures" || normTable === "user_preferences") {
    const rowData = normTable === "user_preferences" ? prepared.map((r) => normalizeUserPreferences(r)) : prepared;
    saveTableRows(table, userIdStr, rowData);
    return Array.isArray(data) ? rowData : rowData[0];
  }
  const existing = getTableRows(table, userIdStr);
  const updated = [...prepared, ...existing];
  saveTableRows(table, userIdStr, updated);
  if (_broadcast && REALTIME_TABLES.has(normTable)) {
    for (const item of prepared) {
      _broadcast({
        table: normTable,
        event: "INSERT",
        schema: "public",
        new: item,
        old: null,
        targetUserId: userIdStr
      });
    }
  }
  return Array.isArray(data) ? prepared : prepared[0];
}
function updateTable(table, filters = [], data, userId, orFilters = []) {
  const normTable = table.toLowerCase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (userId !== void 0 && userId !== null && String(userId).trim() !== "") {
    const userIdStr = String(userId);
    if (normTable === "profiles" || normTable === "profile_pictures" || normTable === "user_preferences") {
      const existing2 = getTableRows(table, userIdStr)[0] || {};
      const patchData = normTable === "user_preferences" ? normalizeUserPreferences(data || {}) : data || {};
      const updated2 = { ...existing2, ...patchData, updated_at: now };
      saveTableRows(table, userIdStr, [updated2]);
      return [updated2];
    }
    const existing = getTableRows(table, userIdStr);
    const matched = [];
    const updated = existing.map((row) => {
      const matchesAnd = filters.length === 0 || filters.every((f) => matchesFilter(row, f));
      const matchesOr = orFilters.length === 0 || orFilters.every((orExpr) => matchesOrFilter(row, orExpr));
      if (matchesAnd && matchesOr) {
        const modified = { ...row, ...data, updated_at: now };
        matched.push(modified);
        return modified;
      }
      return row;
    });
    saveTableRows(table, userIdStr, updated);
    if (_broadcast && REALTIME_TABLES.has(normTable)) {
      for (const item of matched) {
        _broadcast({
          table: normTable,
          event: "UPDATE",
          schema: "public",
          new: item,
          old: null,
          targetUserId: userIdStr
        });
      }
    }
    return matched;
  }
  const userIds = getAllUserIds();
  const allMatched = [];
  for (const id of userIds) {
    const matched = updateTable(table, filters, data, id, orFilters);
    if (Array.isArray(matched) && matched.length > 0) {
      allMatched.push(...matched);
    }
  }
  return allMatched;
}
function upsertTable(table, data, userId, onConflict = "id") {
  const userIdStr = String(userId);
  const normTable = table.toLowerCase();
  const items = Array.isArray(data) ? data : [data];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (normTable === "profiles" || normTable === "profile_pictures" || normTable === "user_preferences") {
    const existing2 = getTableRows(table, userIdStr)[0] || {};
    const patchData = normTable === "user_preferences" ? normalizeUserPreferences(items[0] || {}) : items[0] || {};
    const updated = { ...existing2, ...patchData, updated_at: now };
    saveTableRows(table, userIdStr, [updated]);
    return Array.isArray(data) ? [updated] : updated;
  }
  const existing = getTableRows(table, userIdStr);
  const result = [];
  const existingMap = new Map(
    existing.map((r) => [String(r[onConflict]), r])
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
        id: item.id || crypto2.randomUUID(),
        user_id: item.user_id || userIdStr,
        created_at: item.created_at || now,
        updated_at: item.updated_at || now,
        ...item
      };
      existingMap.set(String(newItem[onConflict] || newItem.id), newItem);
      result.push(newItem);
    }
  }
  const allRows = Array.from(existingMap.values());
  saveTableRows(table, userIdStr, allRows);
  return Array.isArray(data) ? result : result[0];
}
function deleteTable(table, filters = [], userId, orFilters = []) {
  const normTable = table.toLowerCase();
  if (userId !== void 0 && userId !== null && String(userId).trim() !== "") {
    const userIdStr = String(userId);
    const existing = getTableRows(table, userIdStr);
    const matched = [];
    const remaining = existing.filter((row) => {
      const matchesAnd = filters.length === 0 || filters.every((f) => matchesFilter(row, f));
      const matchesOr = orFilters.length === 0 || orFilters.every((orExpr) => matchesOrFilter(row, orExpr));
      if (matchesAnd && matchesOr) {
        matched.push(row);
        return false;
      }
      return true;
    });
    saveTableRows(table, userIdStr, remaining);
    if (_broadcast && REALTIME_TABLES.has(normTable)) {
      for (const item of matched) {
        _broadcast({
          table: normTable,
          event: "DELETE",
          schema: "public",
          new: null,
          old: item,
          targetUserId: userIdStr
        });
      }
    }
    if (normTable === "support_tickets" && matched.length > 0) {
      for (const t of matched) {
        if (t && t.id) {
          deleteTable(
            "support_messages",
            [{ field: "ticket_id", operator: "eq", value: t.id }],
            userIdStr
          );
        }
      }
    }
    return matched;
  }
  const userIds = getAllUserIds();
  const allMatched = [];
  for (const id of userIds) {
    const matched = deleteTable(table, filters, id, orFilters);
    if (Array.isArray(matched) && matched.length > 0) {
      allMatched.push(...matched);
    }
  }
  return allMatched;
}
function cleanupExpiredClosedTickets(maxAgeMs = 3 * 24 * 60 * 60 * 1e3) {
  const userIds = getAllUserIds();
  const now = Date.now();
  let totalCleaned = 0;
  for (const userId of userIds) {
    const ticketsPath = path.join(DATA_DIR, userId, "support", "tickets.json");
    if (!fs.existsSync(ticketsPath)) continue;
    const tickets = readJsonFile(ticketsPath, []);
    if (!Array.isArray(tickets) || tickets.length === 0) continue;
    const expiredTicketIds = /* @__PURE__ */ new Set();
    const activeTickets = tickets.filter((t) => {
      if (t.status === "Closed") {
        const closedTimestamp = t.closed_at ? new Date(t.closed_at).getTime() : t.updated_at ? new Date(t.updated_at).getTime() : t.created_at ? new Date(t.created_at).getTime() : 0;
        if (closedTimestamp > 0 && now - closedTimestamp >= maxAgeMs) {
          if (t.id) expiredTicketIds.add(String(t.id));
          return false;
        }
      }
      return true;
    });
    if (expiredTicketIds.size > 0) {
      writeJsonFile(ticketsPath, activeTickets);
      totalCleaned += expiredTicketIds.size;
      const messagesPath = path.join(
        DATA_DIR,
        userId,
        "support",
        "messages.json"
      );
      if (fs.existsSync(messagesPath)) {
        const messages = readJsonFile(messagesPath, []);
        if (Array.isArray(messages)) {
          const remainingMessages = messages.filter(
            (m) => !expiredTicketIds.has(String(m.ticket_id))
          );
          writeJsonFile(messagesPath, remainingMessages);
        }
      }
    }
  }
  return totalCleaned;
}
function getStartOfTodayUtc() {
  const now = /* @__PURE__ */ new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
}
function getActiveUserIds() {
  const allIds = getAllUserIds();
  if (allIds.length === 0) return [];
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1e3;
  const activeIds = [];
  for (const id of allIds) {
    const profile = getProfileByUserId(id);
    if (profile?.last_points_usage) {
      const lastUsage = new Date(profile.last_points_usage).getTime();
      if (!isNaN(lastUsage) && lastUsage >= twoDaysAgo) {
        activeIds.push(id);
      }
    }
  }
  return activeIds;
}
function getPointsSpentToday(userId) {
  const transactions = getTableRows("points_transactions", userId);
  const startToday = getStartOfTodayUtc();
  let total = 0;
  for (const tx of transactions) {
    if (tx && tx.amount && new Date(tx.created_at).getTime() >= startToday) {
      total += Number(tx.amount) || 0;
    }
  }
  return total;
}
function getTotalPointsSpentToday(activeUserIds) {
  const userFilter = activeUserIds && activeUserIds.length > 0 ? new Set(activeUserIds.map(String)) : null;
  const transactions = getTableRows("points_transactions");
  const startToday = getStartOfTodayUtc();
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  for (const tx of transactions) {
    if (tx && tx.id && !seen.has(String(tx.id))) {
      seen.add(String(tx.id));
      if (userFilter && tx.user_id && !userFilter.has(String(tx.user_id))) {
        continue;
      }
      if (tx.amount && new Date(tx.created_at).getTime() >= startToday) {
        total += Number(tx.amount) || 0;
      }
    }
  }
  return total;
}
function getGiftsSentToday(userId) {
  const gifts = getTableRows("point_gifts", userId);
  const startToday = getStartOfTodayUtc();
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  for (const g of gifts) {
    if (g && g.id && !seen.has(String(g.id))) {
      seen.add(String(g.id));
      if (String(g.sender_id) === String(userId) && g.amount && new Date(g.created_at).getTime() >= startToday) {
        total += Number(g.amount) || 0;
      }
    }
  }
  return total;
}
function getGiftsReceivedToday(userId, activeUserIds) {
  const userFilter = activeUserIds && activeUserIds.length > 0 ? new Set(activeUserIds.map(String)) : null;
  const allGifts = getTableRows("point_gifts");
  const startToday = getStartOfTodayUtc();
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  for (const g of allGifts) {
    if (g && g.id && !seen.has(String(g.id))) {
      seen.add(String(g.id));
      if (userFilter && g.sender_id && !userFilter.has(String(g.sender_id))) {
        continue;
      }
      if (String(g.receiver_id) === String(userId) && g.amount && new Date(g.created_at).getTime() >= startToday) {
        total += Number(g.amount) || 0;
      }
    }
  }
  return total;
}
function getPointsStatus(userId, activeUserIdsOverride) {
  if (!userId) {
    return {
      available: 0,
      given: DAILY_POINTS_POOL,
      points: 0,
      daily_claim_available: true,
      streak_days: 1
    };
  }
  const userIdStr = String(userId);
  const profile = getProfileByUserId(userIdStr);
  if (profile && !profile.last_points_usage) {
    saveTableRows("profiles", userIdStr, [
      { ...profile, last_points_usage: (/* @__PURE__ */ new Date()).toISOString() }
    ]);
  }
  const activeUserIds = activeUserIdsOverride && activeUserIdsOverride.length > 0 ? activeUserIdsOverride : getActiveUserIds();
  const activeSet = new Set(activeUserIds.map(String));
  activeSet.add(userIdStr);
  const activeCount = Math.max(1, activeSet.size);
  const baseQuota = Math.floor(DAILY_POINTS_POOL / activeCount);
  const spentToday = getPointsSpentToday(userIdStr);
  const giftsSent = getGiftsSentToday(userIdStr);
  const giftsReceived = getGiftsReceivedToday(userIdStr, activeUserIdsOverride);
  const totalSpentToday = getTotalPointsSpentToday(activeUserIdsOverride);
  const remainingGlobalPool = Math.max(0, DAILY_POINTS_POOL - totalSpentToday);
  const given = Math.max(0, baseQuota - giftsSent + giftsReceived);
  const availableBase = baseQuota - spentToday - giftsSent + giftsReceived;
  const available = Math.max(0, Math.min(availableBase, remainingGlobalPool));
  return {
    available,
    given,
    points: available,
    daily_claim_available: true,
    streak_days: 1
  };
}
function callRpc(name, param2, param3) {
  let args = {};
  let userId = void 0;
  if (typeof param2 === "string" || typeof param2 === "number") {
    userId = String(param2);
    args = typeof param3 === "object" && param3 !== null ? param3 : param3 ?? {};
  } else if (typeof param3 === "string" || typeof param3 === "number") {
    userId = String(param3);
    args = typeof param2 === "object" && param2 !== null ? param2 : param2 ?? {};
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
      if (isNaN(amount) || amount <= 0) {
        return { success: false, error: "Invalid amount" };
      }
      const activeOverride = args?.p_active_user_ids || args?.active_user_ids;
      const status = getPointsStatus(userId, activeOverride);
      if (status.available < amount) {
        return { success: false, error: "Insufficient points" };
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const tx = {
        id: crypto2.randomUUID(),
        user_id: userId,
        amount,
        created_at: now
      };
      insertTable("points_transactions", tx, userId);
      const profile = getProfileByUserId(userId);
      if (profile) {
        saveTableRows("profiles", userId, [
          { ...profile, last_points_usage: now }
        ]);
      }
      const updatedStatus = getPointsStatus(userId, activeOverride);
      const pref = getTableRows("user_preferences", userId)[0] || {};
      saveTableRows("user_preferences", userId, [
        { ...pref, points: updatedStatus.available }
      ]);
      return {
        success: true,
        points: updatedStatus.points,
        available: updatedStatus.available,
        given: updatedStatus.given
      };
    }
    case "get_points_status": {
      const activeOverride = args?.p_active_user_ids || args?.active_user_ids;
      return getPointsStatus(userId, activeOverride);
    }
    case "get_available_points": {
      const targetUser = args?.p_user_id || args?.user_id || userId;
      const activeOverride = args?.p_active_user_ids || args?.active_user_ids;
      return getPointsStatus(targetUser, activeOverride).available;
    }
    case "give_points": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const receiverId = String(args?.p_receiver_id ?? args?.receiver_id ?? "");
      const amount = Number(args?.p_amount ?? args?.amount ?? 0);
      if (!receiverId)
        return { success: false, error: "Receiver ID is required" };
      if (String(receiverId) === String(userId)) {
        return { success: false, error: "Cannot give points to yourself" };
      }
      if (isNaN(amount) || amount <= 0) {
        return { success: false, error: "Amount must be a positive integer" };
      }
      const receiverUser = getUserById(receiverId);
      if (!receiverUser) {
        return { success: false, error: "Receiver not found" };
      }
      const friendships = getTableRows("friendships", userId);
      const isFriend = friendships.some(
        (f) => f.status === "accepted" && (String(f.user_id) === String(userId) && String(f.friend_id) === String(receiverId) || String(f.friend_id) === String(userId) && String(f.user_id) === String(receiverId))
      );
      if (!isFriend) {
        return { success: false, error: "You can only give points to friends" };
      }
      const activeOverride = args?.p_active_user_ids || args?.active_user_ids;
      const status = getPointsStatus(userId, activeOverride);
      if (status.available < amount) {
        return { success: false, error: "Insufficient points to give" };
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const gift = {
        id: crypto2.randomUUID(),
        sender_id: userId,
        receiver_id: receiverId,
        amount,
        created_at: now
      };
      insertTable("point_gifts", gift, userId);
      insertTable("point_gifts", gift, receiverId);
      const updatedStatus = getPointsStatus(userId, activeOverride);
      return {
        success: true,
        available: updatedStatus.available,
        given: updatedStatus.given
      };
    }
    case "adjust_points": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const amount = Number(args?.p_amount ?? args?.amount ?? 0);
      if (amount < 0) {
        return callRpc("spend_points", { p_amount: Math.abs(amount) }, userId);
      }
      return { success: true };
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
          profile: prof
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
          profile: prof
        };
      });
    }
    case "get_my_blocks": {
      if (!userId) return [];
      return getTableRows("blocks", userId);
    }
    case "sync_user_games": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const incomingGames = args?.games ?? args?.p_games ?? args?.user_games ?? (Array.isArray(args) ? args : []);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const existingGames = getTableRows(
        "user_games",
        userId
      );
      const existingPlaytimes = getTableRows(
        "user_playtime",
        userId
      );
      const playtimeMap = /* @__PURE__ */ new Map();
      for (const pt of existingPlaytimes) {
        if (pt.game_id) playtimeMap.set(pt.game_id, pt);
      }
      const existingMap = /* @__PURE__ */ new Map();
      for (const g of existingGames) {
        const key = g.game_id || g.id;
        if (key) existingMap.set(key, g);
      }
      for (const item of incomingGames) {
        const gameId = item.game_id || item.id || crypto2.randomUUID();
        const existing = existingMap.get(gameId) || (item.id ? existingMap.get(item.id) : void 0);
        const ptRecord = playtimeMap.get(gameId);
        const isCustom = Boolean(
          item.is_custom ?? existing?.is_custom ?? item.platform === "custom"
        );
        const playtimeSeconds = Math.max(
          Number(item.playtime_seconds) || 0,
          Number(existing?.playtime_seconds) || 0,
          Number(ptRecord?.total_seconds) || 0
        );
        let lastPlayedAt = item.last_played_at || existing?.last_played_at || ptRecord?.last_played_at || null;
        if (item.last_played_at && existing?.last_played_at) {
          lastPlayedAt = new Date(item.last_played_at).getTime() >= new Date(existing.last_played_at).getTime() ? item.last_played_at : existing.last_played_at;
        }
        const mergedRecord = {
          id: existing?.id || item.id || gameId,
          user_id: userId,
          game_id: gameId,
          title: item.title ?? existing?.title ?? "",
          platform: item.platform ?? existing?.platform ?? (isCustom ? "custom" : "unknown"),
          executable_path: item.executable_path ?? existing?.executable_path ?? void 0,
          launch_url: item.launch_url ?? existing?.launch_url ?? void 0,
          install_path: item.install_path ?? existing?.install_path ?? void 0,
          icon_url: item.icon_url ?? existing?.icon_url ?? void 0,
          banner_url: item.banner_url ?? existing?.banner_url ?? void 0,
          is_custom: isCustom,
          playtime_seconds: playtimeSeconds,
          last_played_at: lastPlayedAt,
          created_at: existing?.created_at || item.created_at || now,
          updated_at: now,
          ...item.metadata ? { metadata: item.metadata } : {}
        };
        existingMap.set(gameId, mergedRecord);
      }
      const allMergedGames = Array.from(existingMap.values());
      if (typeof userId === "string" && (userId.includes("..") || userId.startsWith("/"))) {
        return { success: false, error: "Invalid request" };
      }
      saveTableRows("user_games", userId, allMergedGames);
      return {
        success: true,
        count: allMergedGames.length,
        games: allMergedGames
      };
    }
    case "add_custom_game": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const title = String(args?.title ?? args?.p_title ?? "").trim();
      const executablePath = String(
        args?.executable_path ?? args?.p_executable_path ?? ""
      ).trim();
      const launchUrl = args?.launch_url ?? args?.p_launch_url ?? "";
      const iconUrl = args?.icon_url ?? args?.p_icon_url ?? "";
      const bannerUrl = args?.banner_url ?? args?.p_banner_url ?? "";
      const installPath = args?.install_path ?? args?.p_install_path ?? (executablePath ? path.dirname(executablePath) : "");
      const customId = args?.id ?? args?.p_id ?? args?.game_id ?? args?.p_game_id ?? `custom_${crypto2.randomUUID()}`;
      if (userId.includes("..") || path.isAbsolute(userId)) {
        return { success: false, error: "Invalid input" };
      }
      const existingGames = getTableRows(
        "user_games",
        userId
      );
      const existingIndex = existingGames.findIndex(
        (g) => g.id === customId || g.game_id === customId || title && g.title.toLowerCase() === title.toLowerCase() && g.is_custom
      );
      let gameRecord;
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
          updated_at: now
        };
        existingGames[existingIndex] = gameRecord;
      } else {
        gameRecord = {
          id: customId,
          user_id: userId,
          game_id: customId,
          title: title || "Custom Game",
          platform: "custom",
          executable_path: executablePath || void 0,
          launch_url: launchUrl || void 0,
          install_path: installPath || void 0,
          icon_url: iconUrl || void 0,
          banner_url: bannerUrl || void 0,
          is_custom: true,
          playtime_seconds: Number(
            args?.playtime_seconds ?? args?.p_playtime_seconds ?? 0
          ),
          last_played_at: null,
          created_at: now,
          updated_at: now
        };
        existingGames.push(gameRecord);
      }
      saveTableRows("user_games", userId, existingGames);
      return {
        success: true,
        game: gameRecord,
        ...gameRecord
      };
    }
    case "log_playtime": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const gameId = String(
        args?.game_id ?? args?.p_game_id ?? args?.id ?? ""
      ).trim();
      if (!gameId) return { success: false, error: "Missing game_id" };
      const durationSeconds = Math.max(
        0,
        Number(
          args?.duration_seconds ?? args?.p_duration_seconds ?? args?.seconds ?? args?.playtime_seconds ?? 0
        )
      );
      const gameTitle = args?.game_title ?? args?.p_game_title ?? args?.title;
      const platform = args?.platform ?? args?.p_platform;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const lastPlayedAt = args?.last_played_at ?? args?.p_last_played_at ?? now;
      const playtimes = getTableRows(
        "user_playtime",
        userId
      );
      const ptIndex = playtimes.findIndex((p) => p.game_id === gameId);
      let totalSeconds = durationSeconds;
      let ptRecord;
      if (ptIndex >= 0) {
        ptRecord = playtimes[ptIndex];
        ptRecord.total_seconds = (Number(ptRecord.total_seconds) || 0) + durationSeconds;
        ptRecord.last_played_at = lastPlayedAt;
        ptRecord.updated_at = now;
        if (gameTitle && !ptRecord.game_title) ptRecord.game_title = gameTitle;
        if (platform && !ptRecord.platform) ptRecord.platform = platform;
        totalSeconds = ptRecord.total_seconds;
      } else {
        ptRecord = {
          id: crypto2.randomUUID(),
          user_id: userId,
          game_id: gameId,
          game_title: gameTitle || gameId,
          platform: platform || "unknown",
          total_seconds: durationSeconds,
          last_played_at: lastPlayedAt,
          created_at: now,
          updated_at: now
        };
        playtimes.push(ptRecord);
      }
      saveTableRows("user_playtime", userId, playtimes);
      const games = getTableRows("user_games", userId);
      const gIndex = games.findIndex(
        (g) => g.game_id === gameId || g.id === gameId
      );
      if (gIndex >= 0) {
        games[gIndex].playtime_seconds = (Number(games[gIndex].playtime_seconds) || 0) + durationSeconds;
        games[gIndex].last_played_at = lastPlayedAt;
        games[gIndex].updated_at = now;
        saveTableRows("user_games", userId, games);
      } else {
        const newGame = {
          id: gameId,
          user_id: userId,
          game_id: gameId,
          title: gameTitle || gameId,
          platform: platform || "unknown",
          is_custom: platform === "custom",
          playtime_seconds: durationSeconds,
          last_played_at: lastPlayedAt,
          created_at: now,
          updated_at: now
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
        last_played_at: lastPlayedAt
      };
    }
    case "get_user_playtime": {
      if (!userId) {
        return {
          success: false,
          total_seconds: 0,
          playtime_seconds: 0,
          games: {},
          playtime: {}
        };
      }
      const targetGameId = args?.game_id ?? args?.p_game_id ?? args?.id;
      const playtimes = getTableRows(
        "user_playtime",
        userId
      );
      const games = getTableRows("user_games", userId);
      const playtimeMap = {};
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
            Number(g.playtime_seconds) || 0
          );
        }
      }
      if (targetGameId) {
        const seconds = playtimeMap[targetGameId] || 0;
        return {
          success: true,
          game_id: targetGameId,
          total_seconds: seconds,
          playtime_seconds: seconds
        };
      }
      return {
        success: true,
        games: playtimeMap,
        playtime: playtimeMap
      };
    }
    case "set_game_presence": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const isPlaying = Boolean(
        args?.is_playing ?? args?.p_is_playing ?? false
      );
      const gameId = isPlaying ? args?.game_id ?? args?.p_game_id ?? null : null;
      const gameTitle = isPlaying ? args?.game_title ?? args?.p_game_title ?? null : null;
      const platform = isPlaying ? args?.platform ?? args?.p_platform ?? null : null;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const startedAt = isPlaying ? args?.started_at ?? args?.p_started_at ?? now : null;
      const presenceRecord = {
        id: userId,
        user_id: userId,
        game_id: gameId,
        game_title: gameTitle,
        platform,
        is_playing: isPlaying,
        started_at: startedAt,
        updated_at: now
      };
      saveTableRows("user_presence", userId, [presenceRecord]);
      return {
        success: true,
        presence: presenceRecord,
        ...presenceRecord
      };
    }
    case "get_game_friends": {
      if (!userId) return [];
      const targetGameId = args?.game_id ?? args?.p_game_id;
      let targetGameTitle = (args?.game_title ?? args?.p_game_title ?? "").trim().toLowerCase();
      if (!targetGameTitle && targetGameId) {
        const callerGames = getTableRows(
          "user_games",
          userId
        );
        const callerGame = callerGames.find(
          (g) => g.game_id === targetGameId || g.id === targetGameId
        );
        if (callerGame && callerGame.title) {
          targetGameTitle = callerGame.title.trim().toLowerCase();
        }
        if (!targetGameTitle) {
          const callerPlaytimes = getTableRows(
            "user_playtime",
            userId
          );
          const callerPt = callerPlaytimes.find(
            (p) => p.game_id === targetGameId
          );
          if (callerPt && callerPt.game_title) {
            targetGameTitle = callerPt.game_title.trim().toLowerCase();
          }
        }
      }
      const friendIds = getAcceptedFriendIds(userId);
      const results = [];
      const THREE_MINUTES_MS = 3 * 60 * 1e3;
      const nowMs = Date.now();
      const PLATFORM_PREFIX_REGEX = /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i;
      const cleanTargetGameId = targetGameId ? String(targetGameId).replace(PLATFORM_PREFIX_REGEX, "") : "";
      for (const friendId of friendIds) {
        const pref = readJsonFile(
          path.join(DATA_DIR, friendId, "preferences.json"),
          {}
        );
        if (pref.share_game_activity === false) {
          continue;
        }
        const friendGames = readJsonFile(
          path.join(DATA_DIR, friendId, "games", "games.json"),
          []
        );
        const friendPlaytimes = readJsonFile(
          path.join(DATA_DIR, friendId, "games", "playtime.json"),
          []
        );
        const friendPresenceList = readJsonFile(
          path.join(DATA_DIR, friendId, "games", "presence.json"),
          []
        );
        const presenceRecord = Array.isArray(friendPresenceList) ? friendPresenceList[0] : friendPresenceList;
        let matchingGame;
        if (targetGameId) {
          const gamesById = /* @__PURE__ */ new Map();
          for (const g of friendGames) {
            if (g.game_id) gamesById.set(g.game_id, g);
            if (g.id) gamesById.set(g.id, g);
          }
          matchingGame = gamesById.get(targetGameId);
          if (!matchingGame && cleanTargetGameId) {
            const gamesByCleanId = /* @__PURE__ */ new Map();
            for (const g of friendGames) {
              const cleanGame = String(g.game_id || g.id).replace(
                PLATFORM_PREFIX_REGEX,
                ""
              );
              if (cleanGame) gamesByCleanId.set(cleanGame, g);
            }
            matchingGame = gamesByCleanId.get(cleanTargetGameId);
          }
        }
        if (!matchingGame && targetGameTitle) {
          const gamesByTitle = /* @__PURE__ */ new Map();
          for (const g of friendGames) {
            if (g.title) gamesByTitle.set(g.title.toLowerCase(), g);
          }
          matchingGame = gamesByTitle.get(targetGameTitle);
        }
        let matchingPlaytime;
        if (targetGameId) {
          const playtimesById = /* @__PURE__ */ new Map();
          for (const p of friendPlaytimes) {
            if (p.game_id) playtimesById.set(p.game_id, p);
          }
          matchingPlaytime = playtimesById.get(targetGameId);
          if (!matchingPlaytime && cleanTargetGameId) {
            const playtimesByCleanId = /* @__PURE__ */ new Map();
            for (const p of friendPlaytimes) {
              if (p.game_id) {
                const cleanPt = String(p.game_id).replace(
                  PLATFORM_PREFIX_REGEX,
                  ""
                );
                if (cleanPt) playtimesByCleanId.set(cleanPt, p);
              }
            }
            matchingPlaytime = playtimesByCleanId.get(cleanTargetGameId);
          }
        }
        if (!matchingPlaytime && targetGameTitle) {
          const playtimesByTitle = /* @__PURE__ */ new Map();
          for (const p of friendPlaytimes) {
            if (p.game_title)
              playtimesByTitle.set(p.game_title.toLowerCase(), p);
          }
          matchingPlaytime = playtimesByTitle.get(targetGameTitle);
        }
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
              ""
            );
            const cleanTarget = targetGameId ? String(targetGameId).replace(
              /^(steam_|epic_|gog_|ea_|xbox_|ubisoft_)/i,
              ""
            ) : "";
            if (!targetGameId && !targetGameTitle) {
              isPlayingThisGame = true;
            } else if (targetGameId && (presGameId === targetGameId || cleanTarget && cleanTarget === cleanPres) || targetGameTitle && presGameTitle === targetGameTitle || matchingGame && matchingGame.game_id && presGameId === matchingGame.game_id || matchingGame && matchingGame.title && presGameTitle === matchingGame.title.toLowerCase() || matchingPlaytime && matchingPlaytime.game_id && presGameId === matchingPlaytime.game_id || matchingPlaytime && matchingPlaytime.game_title && presGameTitle === matchingPlaytime.game_title.toLowerCase()) {
              isPlayingThisGame = true;
            }
          }
        }
        if ((targetGameId || targetGameTitle) && !matchingGame && !matchingPlaytime && !isPlayingThisGame) {
          continue;
        }
        const playtimeSeconds = Math.max(
          Number(matchingGame?.playtime_seconds) || 0,
          Number(matchingPlaytime?.total_seconds) || 0
        );
        const lastPlayedAt = matchingGame?.last_played_at || matchingPlaytime?.last_played_at || null;
        const profile = getProfileByUserId(friendId);
        results.push({
          user_id: friendId,
          friend_id: friendId,
          username: profile?.username || "Unknown",
          display_name: profile?.display_name || profile?.username || "Unknown",
          avatar_url: profile?.avatar_url || null,
          profile,
          game_id: matchingGame?.game_id || matchingPlaytime?.game_id || presenceRecord?.game_id || targetGameId || null,
          game_title: matchingGame?.title || matchingPlaytime?.game_title || presenceRecord?.game_title || targetGameTitle || null,
          playtime_seconds: playtimeSeconds,
          last_played_at: lastPlayedAt,
          is_playing: isPlayingThisGame,
          is_online: isPlaying,
          current_presence: isPlaying ? presenceRecord : null
        });
      }
      return results;
    }
    case "get_all_friends_presence":
    case "get_friends_game_activity": {
      if (!userId) return [];
      const friendIds = getAcceptedFriendIds(userId);
      const activities = [];
      const THREE_MINUTES_MS = 3 * 60 * 1e3;
      const nowMs = Date.now();
      for (const friendId of friendIds) {
        const friendPref = readJsonFile(
          path.join(DATA_DIR, friendId, "preferences.json"),
          {}
        );
        if (friendPref.share_game_activity === false) {
          continue;
        }
        const profile = getProfileByUserId(friendId);
        const friendPresenceList = readJsonFile(
          path.join(DATA_DIR, friendId, "games", "presence.json"),
          []
        );
        const presenceRecord = Array.isArray(friendPresenceList) ? friendPresenceList[0] : friendPresenceList;
        let isPlaying = false;
        if (presenceRecord && presenceRecord.is_playing) {
          const updatedAtMs = new Date(presenceRecord.updated_at).getTime();
          if (!isNaN(updatedAtMs) && nowMs - updatedAtMs <= THREE_MINUTES_MS) {
            isPlaying = true;
          }
        }
        const friendGames = readJsonFile(
          path.join(DATA_DIR, friendId, "games", "games.json"),
          []
        );
        const friendPlaytimes = readJsonFile(
          path.join(DATA_DIR, friendId, "games", "playtime.json"),
          []
        );
        let lastPlayedGame = null;
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
          profile,
          is_playing: isPlaying,
          is_online: isPlaying,
          current_game: isPlaying && presenceRecord ? {
            game_id: presenceRecord.game_id,
            game_title: presenceRecord.game_title,
            platform: presenceRecord.platform,
            started_at: presenceRecord.started_at
          } : null,
          current_game_id: isPlaying ? presenceRecord?.game_id : null,
          platform: isPlaying ? presenceRecord?.platform : null,
          last_played_game: lastPlayedGame,
          presence: isPlaying ? presenceRecord : null,
          total_games_count: friendGames.length
        });
      }
      return activities;
    }
    default:
      return null;
  }
}
function getAcceptedFriendIds(userId) {
  if (userId === void 0 || userId === null || String(userId).trim() === "")
    return [];
  const userIdStr = String(userId);
  const friendSet = /* @__PURE__ */ new Set();
  const userIds = getAllUserIds();
  const userFriends = [
    ...getTableRows("friendships", userIdStr),
    ...getTableRows("friends", userIdStr)
  ];
  const seenFriendIds = /* @__PURE__ */ new Set();
  for (const f of userFriends) {
    if (f && f.id && seenFriendIds.has(f.id)) continue;
    if (f && f.id) seenFriendIds.add(f.id);
    if (f && f.status === "accepted") {
      const otherId = String(
        f.friend_id === userIdStr ? f.user_id : f.friend_id
      );
      if (otherId && otherId !== userIdStr) {
        friendSet.add(otherId);
      }
    }
  }
  for (const uid of userIds) {
    if (uid === userIdStr) continue;
    const friendships = [
      ...readJsonFile(
        path.join(DATA_DIR, uid, "friends", "friends.json"),
        []
      ),
      ...readJsonFile(
        path.join(DATA_DIR, uid, "friends", "friendships.json"),
        []
      )
    ];
    for (const f of friendships) {
      if (f && f.status === "accepted") {
        if (String(f.user_id) === userIdStr && f.friend_id && String(f.friend_id) !== userIdStr) {
          friendSet.add(String(f.friend_id));
        } else if (String(f.friend_id) === userIdStr && f.user_id && String(f.user_id) !== userIdStr) {
          friendSet.add(String(f.user_id));
        }
      }
    }
  }
  const myBlocks = getTableRows("blocks", userIdStr);
  const blockedIds = /* @__PURE__ */ new Set();
  for (const b of myBlocks) {
    if (b.blocked_id) blockedIds.add(String(b.blocked_id));
    if (b.blocked_user_id) blockedIds.add(String(b.blocked_user_id));
    if (b.target_id) blockedIds.add(String(b.target_id));
  }
  for (const fid of Array.from(friendSet)) {
    const friendBlocks = readJsonFile(
      path.join(DATA_DIR, fid, "friends", "blocks.json"),
      []
    );
    for (const b of friendBlocks) {
      if (String(b.blocked_id) === userIdStr || String(b.blocked_user_id) === userIdStr || String(b.target_id) === userIdStr) {
        blockedIds.add(fid);
      }
    }
  }
  return Array.from(friendSet).filter(
    (id) => !blockedIds.has(id) && id !== userIdStr
  );
}
var DATA_DIR, REALTIME_TABLES, _broadcast, cachedUserIds, lastCacheTime, CACHE_TTL, profileCache, PROFILE_CACHE_TTL, DAILY_POINTS_POOL;
var init_dataStore = __esm({
  "server/lib/dataStore.ts"() {
    DATA_DIR = path.join(process.cwd(), "Data");
    REALTIME_TABLES = /* @__PURE__ */ new Set([
      "support_tickets",
      "support_messages",
      "notifications",
      "user_notification_state"
    ]);
    _broadcast = null;
    cachedUserIds = null;
    lastCacheTime = 0;
    CACHE_TTL = 3e4;
    profileCache = /* @__PURE__ */ new Map();
    PROFILE_CACHE_TTL = 3e4;
    DAILY_POINTS_POOL = 1e4;
  }
});

// server/lib/auth.ts
var auth_exports = {};
__export(auth_exports, {
  generateSalt: () => generateSalt,
  generateToken: () => generateToken,
  hashPassword: () => hashPassword,
  localAuthMiddleware: () => localAuthMiddleware,
  resolveUserFromToken: () => resolveUserFromToken,
  verifyPassword: () => verifyPassword,
  verifyToken: () => verifyToken
});
import crypto3 from "node:crypto";
import fs2 from "node:fs";
import path2 from "node:path";
function getSecretKey() {
  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }
  const secretPath = path2.join(DATA_DIR, "secret.key");
  try {
    if (fs2.existsSync(secretPath)) {
      return fs2.readFileSync(secretPath, "utf-8").trim();
    }
    if (!fs2.existsSync(DATA_DIR)) {
      fs2.mkdirSync(DATA_DIR, { recursive: true });
    }
    const newSecret = crypto3.randomBytes(32).toString("hex");
    fs2.writeFileSync(secretPath, newSecret, "utf-8");
    return newSecret;
  } catch (err) {
    const error = new Error("Failed to read or generate AUTH_SECRET. Please set the AUTH_SECRET environment variable or ensure file system permissions.");
    error.cause = err;
    throw error;
  }
}
function generateSalt() {
  return crypto3.randomBytes(16).toString("hex");
}
function hashPassword(password, salt) {
  return crypto3.pbkdf2Sync(password, salt, 1e5, 64, "sha512").toString("hex");
}
function verifyPassword(password, storedHash, salt) {
  try {
    const hash = hashPassword(password, salt);
    const hashBuf = Buffer.from(hash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (hashBuf.length !== storedBuf.length) return false;
    return crypto3.timingSafeEqual(hashBuf, storedBuf);
  } catch {
    return false;
  }
}
function generateToken(user, expiresInDays = 30) {
  const secret = getSecretKey();
  const role = String(user.id) === "1" ? "admin" : user.role || "user";
  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role,
    exp: Date.now() + expiresInDays * 24 * 60 * 60 * 1e3
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const signature = crypto3.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `ol_${encodedPayload}.${signature}`;
}
function verifyToken(token) {
  try {
    if (!token || !token.startsWith("ol_")) return null;
    const cleanToken = token.slice(3);
    const [encodedPayload, signature] = cleanToken.split(".");
    if (!encodedPayload || !signature) return null;
    const secret = getSecretKey();
    const expectedSig = crypto3.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    if (!crypto3.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const payloadStr = Buffer.from(encodedPayload, "base64url").toString(
      "utf-8"
    );
    const payload = JSON.parse(payloadStr);
    if (payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
async function resolveUserFromToken(token) {
  if (!token) return null;
  const localPayload = verifyToken(token);
  if (localPayload) {
    const user = getUserById(localPayload.userId);
    if (user) {
      const role = String(user.id) === "1" || String(localPayload.userId) === "1" ? "admin" : user.role || localPayload.role || "user";
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        role,
        user_metadata: {
          username: user.username,
          full_name: user.username
        }
      };
    }
  }
  return null;
}
var localAuthMiddleware;
var init_auth = __esm({
  "server/lib/auth.ts"() {
    init_dataStore();
    localAuthMiddleware = async (c, next) => {
      let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
      if (!token) {
        token = c.req.query("token");
      }
      if (!token) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const user = await resolveUserFromToken(token);
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      c.set("user", user);
      c.set("userId", user.id);
      c.set("token", token);
      await next();
    };
  }
});

// server/index.ts
import { Hono as Hono19 } from "hono";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";

// server/routes/demo.ts
import { Hono } from "hono";
var demoRouter = new Hono();
demoRouter.get("/", (c) => {
  return c.json({
    message: "Hello from Hono server"
  });
});

// server/routes/proxy.ts
init_auth();
import { Hono as Hono2 } from "hono";

// server/lib/safeAiUrl.ts
import net from "net";
import { lookup } from "dns/promises";
var isPrivateIP = (ip) => {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 0 || parts[0] === 127 || parts[0] === 10 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168 || parts[0] === 169 && parts[1] === 254 || parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127 || parts[0] === 192 && parts[1] === 0 && parts[2] === 0 || parts[0] === 192 && parts[1] === 0 && parts[2] === 2 || parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19 || parts[0] === 198 && parts[1] === 51 && parts[2] === 100 || parts[0] === 203 && parts[1] === 0 && parts[2] === 113 || parts[0] >= 224)
      return true;
    return false;
  } else if (net.isIPv6(ip)) {
    const expanded = ip.toLowerCase();
    if (expanded === "::1" || expanded === "0:0:0:0:0:0:0:1" || expanded === "::" || expanded === "0:0:0:0:0:0:0:0")
      return true;
    const v4MappedMatch = expanded.match(
      /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/
    );
    if (v4MappedMatch) return isPrivateIP(v4MappedMatch[1]);
    if (expanded.startsWith("fc") || expanded.startsWith("fd") || expanded.startsWith("fe8") || expanded.startsWith("fe9") || expanded.startsWith("fea") || expanded.startsWith("feb"))
      return true;
    return false;
  }
  return false;
};
var LOCALHOST_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "metadata.google.internal",
  "169.254.169.254"
]);
function assertPublicHostname(hostname) {
  if (isPrivateIP(hostname) || LOCALHOST_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error("Public origin required");
  }
}
var validateAiUrl = async (baseUrl) => {
  const u = new URL(baseUrl);
  if (u.protocol !== "https:") throw new Error("HTTPS required");
  assertPublicHostname(u.hostname);
  const addresses = await lookup(u.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIP(address)) throw new Error("Public origin required");
  }
};

// server/routes/proxy.ts
var proxyRouter = new Hono2();
var ALLOWED_DOMAINS = /* @__PURE__ */ new Set([
  "api.github.com",
  "raw.githubusercontent.com",
  "registry.npmjs.org"
]);
var ALLOWED_METHODS = /* @__PURE__ */ new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS"
]);
var BLOCKED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal"
]);
var HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
proxyRouter.post("/fetch", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const user = await resolveUserFromToken(token);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const bodyJson = await c.req.json().catch(() => null);
    if (!bodyJson || typeof bodyJson !== "object") {
      return c.json({ error: "Invalid JSON payload" }, 400);
    }
    const { url, options } = bodyJson;
    if (!url || typeof url !== "string") {
      return c.json({ error: "Missing url" }, 400);
    }
    if (url.includes("/../") || /\/%2e%2e\//i.test(url)) {
      return c.json({ error: "Invalid path" }, 400);
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: "Invalid url" }, 400);
    }
    if (parsedUrl.protocol !== "https:") {
      return c.json({ error: "Only HTTPS URLs are allowed" }, 400);
    }
    if (parsedUrl.username || parsedUrl.password) {
      return c.json({ error: "Credentials in URL are not allowed" }, 400);
    }
    if (parsedUrl.port && parsedUrl.port !== "443") {
      return c.json({ error: "Invalid port" }, 400);
    }
    const hostname = parsedUrl.hostname.toLowerCase();
    if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || isPrivateIP(hostname)) {
      return c.json({ error: "Internal or private IPs not allowed" }, 400);
    }
    if (!ALLOWED_DOMAINS.has(hostname)) {
      return c.json({ error: "Domain not allowed" }, 403);
    }
    try {
      await validateAiUrl(url);
    } catch (e) {
      return c.json({ error: e.message || "Invalid or unsafe URL" }, 400);
    }
    const method = typeof options?.method === "string" ? options.method.toUpperCase() : "GET";
    if (!ALLOWED_METHODS.has(method)) {
      return c.json({ error: "HTTP method not allowed" }, 400);
    }
    let sanitizedHeaders = void 0;
    if (options?.headers && typeof options.headers === "object" && !Array.isArray(options.headers)) {
      sanitizedHeaders = {};
      for (const [k, v] of Object.entries(options.headers)) {
        if (typeof k === "string" && typeof v === "string") {
          const lowerKey = k.toLowerCase();
          if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
            sanitizedHeaders[k] = v;
          }
        }
      }
    }
    const reqBody = ["GET", "HEAD"].includes(method) ? void 0 : options?.body ? typeof options.body === "string" ? options.body : JSON.stringify(options.body) : void 0;
    const response = await fetch(url, {
      method,
      headers: sanitizedHeaders,
      body: reqBody,
      signal: c.req.raw.signal,
      redirect: "error"
    });
    const text = await response.text();
    c.status(response.status);
    return c.text(text);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return c.json({ error: "Request aborted" }, 499);
      }
      console.error("Proxy fetch error:", error);
      return c.json({ error: error.message }, 500);
    }
    console.error("Proxy fetch error:", error);
    return c.json({ error: "Unknown error" }, 500);
  }
});

// server/routes/adminSupport.ts
init_auth();
init_dataStore();
import { Hono as Hono3 } from "hono";
import crypto4 from "node:crypto";
var adminSupportRouter = new Hono3();
adminSupportRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  c.set("user", user);
  await next();
});
adminSupportRouter.get("/tickets", async (c) => {
  try {
    cleanupExpiredClosedTickets();
    const hideClosed = c.req.query("hideClosed") === "true";
    const statusParam = c.req.query("status");
    const filters = [];
    if (hideClosed) {
      filters.push({ field: "status", operator: "neq", value: "Closed" });
    } else if (statusParam && (statusParam === "Open" || statusParam === "Closed")) {
      filters.push({ field: "status", operator: "eq", value: statusParam });
    }
    const tickets = queryTable({
      table: "support_tickets",
      filters: filters.length > 0 ? filters : void 0,
      order: { column: "created_at", ascending: false }
    });
    const ticketsWithProfiles = (tickets || []).map((t) => {
      const userId = t.user_id;
      const profile = userId ? getProfileByUserId(userId) : null;
      return {
        ...t,
        user_id: userId || profile?.user_id || profile?.id,
        profiles: profile ? {
          user_id: profile.user_id || profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url
        } : null
      };
    });
    return c.json({ tickets: ticketsWithProfiles });
  } catch (error) {
    console.error("Error fetching support tickets:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
adminSupportRouter.get("/tickets/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const tickets = queryTable({
      table: "support_tickets",
      filters: [{ field: "id", operator: "eq", value: id }]
    });
    const ticket = tickets && tickets[0];
    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }
    let profile = null;
    const userId = ticket.user_id;
    if (userId) {
      const p = getProfileByUserId(userId);
      if (p) {
        profile = {
          user_id: p.user_id || p.id,
          username: p.username,
          avatar_url: p.avatar_url
        };
      }
    }
    return c.json({
      ticket: {
        ...ticket,
        user_id: userId || profile?.user_id || profile?.id,
        profiles: profile
      }
    });
  } catch (error) {
    console.error("Error fetching specific ticket:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
adminSupportRouter.get("/tickets/:id/messages", async (c) => {
  try {
    const id = c.req.param("id");
    const messages = queryTable({
      table: "support_messages",
      filters: [{ field: "ticket_id", operator: "eq", value: id }],
      order: { column: "created_at", ascending: true }
    });
    const messagesWithProfiles = (messages || []).map((m) => {
      const senderId = m.sender_id;
      const p = senderId ? getProfileByUserId(senderId) : null;
      return {
        ...m,
        sender_id: senderId,
        profiles: p ? {
          user_id: p.user_id || p.id,
          username: p.username,
          avatar_url: p.avatar_url
        } : null
      };
    });
    return c.json({ messages: messagesWithProfiles });
  } catch (error) {
    console.error("Error fetching ticket messages:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
adminSupportRouter.post("/tickets/:id/messages", async (c) => {
  try {
    const id = c.req.param("id");
    const { message } = await c.req.json().catch(() => ({}));
    const user = c.get("user");
    if (!message) {
      return c.json({ error: "Message is required" }, 400);
    }
    const tickets = queryTable({
      table: "support_tickets",
      filters: [{ field: "id", operator: "eq", value: id }]
    });
    const ticket = tickets && tickets[0];
    const targetUserId = ticket?.user_id || user.id;
    const newMessage = {
      id: crypto4.randomUUID(),
      ticket_id: id,
      sender_id: user.id,
      message,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const inserted = insertTable("support_messages", newMessage, targetUserId);
    return c.json({
      message: Array.isArray(inserted) ? inserted[0] : inserted
    });
  } catch (error) {
    console.error("Error posting ticket message:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
adminSupportRouter.patch("/tickets/:id/status", async (c) => {
  try {
    const id = c.req.param("id");
    const { status } = await c.req.json().catch(() => ({}));
    if (!status || !["Open", "Closed"].includes(status)) {
      return c.json({ error: "Invalid status" }, 400);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatePayload = {
      status,
      updated_at: now,
      closed_at: status === "Closed" ? now : null
    };
    const updated = updateTable(
      "support_tickets",
      [{ field: "id", operator: "eq", value: id }],
      updatePayload
    );
    return c.json({ ticket: updated && updated[0] });
  } catch (error) {
    console.error("Error updating ticket status:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// server/routes/adminVerification.ts
import { Hono as Hono4 } from "hono";
import crypto5 from "node:crypto";

// server/lib/storage.ts
import fs3 from "fs";
import path3 from "path";
var STORAGE_DIR = path3.join(process.cwd(), "uploads");
var MAX_USER_QUOTA = 500 * 1024 * 1024;
var MIME_MAP = {
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  webm: "audio/webm",
  opus: "audio/opus",
  wma: "audio/x-ms-wma",
  // Video
  mp4: "video/mp4",
  ogv: "video/ogg",
  mov: "video/quicktime",
  // Documents & Data
  json: "application/json",
  txt: "text/plain",
  csv: "text/csv",
  pdf: "application/pdf",
  md: "text/markdown",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "text/typescript",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip"
};
function getMimeType(filePath) {
  const ext = path3.extname(filePath).toLowerCase().replace(/^\./, "");
  return MIME_MAP[ext] || "application/octet-stream";
}
function sanitizePath(rawPath) {
  if (!rawPath) return "";
  let clean = decodeURIComponent(rawPath);
  clean = clean.replace(/\\/g, "/");
  clean = clean.replace(/^\/+/, "");
  if (clean.includes("..") || clean.startsWith("/") || clean.includes("\0")) {
    throw new Error("Invalid path");
  }
  return clean;
}
function getFolderSize(folderPath) {
  let size = 0;
  if (!fs3.existsSync(folderPath)) return 0;
  try {
    const files = fs3.readdirSync(folderPath, { withFileTypes: true });
    for (const file of files) {
      const base = path3.resolve(folderPath);
      const filePath = path3.resolve(base, file.name);
      const relative = path3.relative(base, filePath);
      if (relative.startsWith("..") || path3.isAbsolute(relative)) {
        continue;
      }
      if (file.isDirectory()) {
        size += getFolderSize(filePath);
      } else {
        size += fs3.statSync(filePath).size;
      }
    }
  } catch {
    return 0;
  }
  return size;
}
function getUserTotalSize(userId) {
  if (!userId) return 0;
  const baseStorage = path3.resolve(STORAGE_DIR, "Storage");
  const targetStorage = path3.resolve(baseStorage, userId);
  const relativeStorage = path3.relative(baseStorage, targetStorage);
  if (relativeStorage.startsWith("..") || path3.isAbsolute(relativeStorage)) {
    throw new Error("Invalid user ID");
  }
  const basePublic = path3.resolve(STORAGE_DIR, "public-assets");
  const targetPublic = path3.resolve(basePublic, userId);
  const relativePublic = path3.relative(basePublic, targetPublic);
  if (relativePublic.startsWith("..") || path3.isAbsolute(relativePublic)) {
    throw new Error("Invalid user ID");
  }
  const sizeStorage = getFolderSize(targetStorage);
  const sizePublic = getFolderSize(targetPublic);
  return sizeStorage + sizePublic;
}
var serverStorage = {
  upload: async (bucket, rawFilePath, data) => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const filePath = sanitizePath(rawFilePath);
      const targetDir = path3.join(
        STORAGE_DIR,
        cleanBucket,
        path3.dirname(filePath)
      );
      fs3.mkdirSync(targetDir, { recursive: true });
      const fullPath = path3.join(STORAGE_DIR, cleanBucket, filePath);
      let buffer;
      if (data instanceof Buffer) {
        buffer = data;
      } else if (typeof Blob !== "undefined" && data instanceof Blob) {
        const arrayBuf = await data.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else if (data instanceof Uint8Array) {
        buffer = Buffer.from(data);
      } else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(data);
      } else {
        buffer = Buffer.from(data);
      }
      fs3.writeFileSync(fullPath, buffer);
      return { data: { path: filePath }, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  },
  download: async (bucket, rawFilePath) => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const filePath = sanitizePath(rawFilePath);
      let fullPath = path3.join(STORAGE_DIR, cleanBucket, filePath);
      if (!fs3.existsSync(fullPath)) {
        const parts = filePath.split("/");
        if (parts.length > 2) {
          const withoutMiddle = [parts[0], ...parts.slice(2)].join("/");
          const tryPath1 = path3.join(STORAGE_DIR, cleanBucket, withoutMiddle);
          if (fs3.existsSync(tryPath1)) {
            const buffer2 = fs3.readFileSync(tryPath1);
            return { data: buffer2, error: null };
          }
          const withoutFirst = parts.slice(1).join("/");
          const tryPath2 = path3.join(STORAGE_DIR, cleanBucket, withoutFirst);
          if (fs3.existsSync(tryPath2)) {
            const buffer2 = fs3.readFileSync(tryPath2);
            return { data: buffer2, error: null };
          }
        }
        return { data: null, error: new Error("File not found") };
      }
      const buffer = fs3.readFileSync(fullPath);
      return { data: buffer, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  },
  list: async (bucket, rawPrefixPath = "") => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const prefixPath = rawPrefixPath ? sanitizePath(rawPrefixPath) : "";
      const targetDir = path3.join(STORAGE_DIR, cleanBucket, prefixPath);
      if (!fs3.existsSync(targetDir)) {
        return { data: [], error: null };
      }
      const files = fs3.readdirSync(targetDir, { withFileTypes: true });
      const result = files.map((f) => {
        const fullPath = path3.join(targetDir, f.name);
        const stats = fs3.statSync(fullPath);
        return {
          id: f.isDirectory() ? null : prefixPath ? `${prefixPath}/${f.name}` : f.name,
          name: f.name,
          metadata: {
            size: stats.size,
            mimetype: getMimeType(f.name)
          },
          created_at: stats.birthtime.toISOString(),
          updated_at: stats.mtime.toISOString()
        };
      });
      return { data: result, error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  },
  remove: async (bucket, rawPaths) => {
    try {
      const cleanBucket = sanitizePath(bucket);
      const removed = [];
      for (const raw of rawPaths) {
        try {
          const p = sanitizePath(raw);
          const fullPath = path3.join(STORAGE_DIR, cleanBucket, p);
          if (fs3.existsSync(fullPath)) {
            fs3.unlinkSync(fullPath);
            removed.push(p);
          }
        } catch {
        }
      }
      return { data: removed, error: null };
    } catch (err) {
      return { data: [], error: err };
    }
  },
  move: async (fromBucket, rawFromPath, toBucket, rawToPath) => {
    try {
      const cleanFromBucket = sanitizePath(fromBucket);
      const fromPath = sanitizePath(rawFromPath);
      const cleanToBucket = sanitizePath(toBucket);
      const toPath = sanitizePath(rawToPath);
      const srcFullPath = path3.join(STORAGE_DIR, cleanFromBucket, fromPath);
      if (!fs3.existsSync(srcFullPath)) {
        return { data: null, error: new Error("Source file not found") };
      }
      const destTargetDir = path3.join(
        STORAGE_DIR,
        cleanToBucket,
        path3.dirname(toPath)
      );
      fs3.mkdirSync(destTargetDir, { recursive: true });
      const destFullPath = path3.join(STORAGE_DIR, cleanToBucket, toPath);
      try {
        fs3.renameSync(srcFullPath, destFullPath);
      } catch {
        fs3.copyFileSync(srcFullPath, destFullPath);
        fs3.unlinkSync(srcFullPath);
      }
      return { data: { path: toPath }, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  },
  getPublicUrl: (bucket, rawFilePath) => {
    const cleanBucket = sanitizePath(bucket);
    const filePath = sanitizePath(rawFilePath);
    return `/api/storage/public/${cleanBucket}/${filePath}`;
  },
  createSignedUrl: (bucket, rawFilePath, token) => {
    const cleanBucket = sanitizePath(bucket);
    const filePath = sanitizePath(rawFilePath);
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
    return `/api/storage/download/${cleanBucket}/${filePath}${tokenQuery}`;
  }
};

// server/routes/adminVerification.ts
init_auth();
init_dataStore();
var adminVerificationRouter = new Hono4();
adminVerificationRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  c.set("user", user);
  await next();
});
adminVerificationRouter.get("/", async (c) => {
  try {
    const status = c.req.query("status");
    const assetType = c.req.query("asset_type");
    const targetType = c.req.query("target_type");
    const filters = [];
    if (status && status !== "all") {
      filters.push({ field: "status", operator: "eq", value: status });
    }
    if (assetType && assetType !== "all") {
      filters.push({ field: "asset_type", operator: "eq", value: assetType });
    }
    if (targetType && targetType !== "all") {
      filters.push({ field: "target_type", operator: "eq", value: targetType });
    }
    const verifications = queryTable({
      table: "asset_verifications",
      filters,
      order: { column: "created_at", ascending: false }
    });
    const listWithProfiles = (verifications || []).map((v) => {
      const p = v.user_id ? getProfileByUserId(v.user_id) : null;
      return {
        ...v,
        profiles: p ? {
          user_id: p.user_id || p.id,
          username: p.username,
          email: p.email,
          avatar_url: p.avatar_url
        } : null
      };
    });
    return c.json({ verifications: listWithProfiles });
  } catch (error) {
    console.error("Error fetching verifications:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
adminVerificationRouter.post("/:id/approve", async (c) => {
  try {
    const id = c.req.param("id");
    const adminUser = c.get("user");
    const verifications = queryTable({
      table: "asset_verifications",
      filters: [{ field: "id", operator: "eq", value: id }]
    });
    const verification = verifications && verifications[0];
    if (!verification) {
      return c.json({ error: "Verification request not found" }, 404);
    }
    let publicAssetId = verification.public_asset_id;
    let publicCharacterId = verification.public_character_id;
    if (verification.target_type === "public_asset") {
      if (verification.asset_type === "file") {
        if (verification.original_file_path) {
          const moveRes = await serverStorage.move(
            "Storage",
            verification.original_file_path,
            "public-assets",
            verification.original_file_path
          );
          if (moveRes.error) {
            const { data: fileData, error: downloadErr } = await serverStorage.download(
              "Storage",
              verification.original_file_path
            );
            if (!downloadErr && fileData) {
              await serverStorage.upload(
                "public-assets",
                verification.original_file_path,
                fileData
              );
              await serverStorage.remove("Storage", [
                verification.original_file_path
              ]);
            }
          }
        }
        const isAnonymous = Boolean(
          verification.is_anonymous || verification.metadata?.is_anonymous
        );
        if (publicAssetId) {
          const updated2 = updateTable(
            "public_assets",
            [{ field: "id", operator: "eq", value: publicAssetId }],
            {
              name: verification.title,
              display_name: verification.metadata?.display_name || verification.title,
              category: verification.metadata?.category || "other",
              description: verification.description || "",
              file_path: verification.original_file_path || "",
              file_size: verification.file_size || 0,
              mime_type: verification.mime_type || "",
              is_anonymous: isAnonymous,
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            },
            verification.user_id
          );
          if (updated2 && updated2[0]) publicAssetId = updated2[0].id;
        } else {
          const newAsset = {
            id: crypto5.randomUUID(),
            uploader_id: verification.user_id,
            user_id: verification.user_id,
            name: verification.title,
            display_name: verification.metadata?.display_name || verification.title,
            category: verification.metadata?.category || "other",
            description: verification.description || "",
            file_path: verification.original_file_path || "",
            file_size: verification.file_size || 0,
            mime_type: verification.mime_type || "",
            is_anonymous: isAnonymous,
            created_at: (/* @__PURE__ */ new Date()).toISOString(),
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          const inserted = insertTable(
            "public_assets",
            newAsset,
            verification.user_id
          );
          const insObj = Array.isArray(inserted) ? inserted[0] : inserted;
          if (insObj) publicAssetId = insObj.id;
        }
      } else if (verification.asset_type === "character" || verification.asset_type === "universe" || verification.asset_type === "race") {
        const meta = verification.metadata || {};
        const isUniverse = verification.asset_type === "universe" || Boolean(meta.is_universe);
        const isRace = verification.asset_type === "race" || Boolean(meta.is_race);
        const isAnonymous = Boolean(
          verification.is_anonymous || meta.is_anonymous
        );
        const payload = {
          uploader_id: verification.user_id,
          user_id: verification.user_id,
          original_character_id: verification.original_id || null,
          name: meta.name || verification.title,
          display_name: meta.display_name || null,
          short_description: meta.short_description || verification.description || null,
          appearance: meta.appearance || null,
          personality: meta.personality || null,
          backstory: meta.backstory || null,
          hidden_description: meta.hidden_description || null,
          image_path: meta.image_path || null,
          image_url: meta.image_url || null,
          is_universe: isUniverse,
          is_race: isRace,
          race_id: meta.race_id || null,
          universe_id: meta.universe_id || null,
          stats_enabled: Boolean(meta.stats_enabled),
          stats: meta.stats || null,
          is_anonymous: isAnonymous,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (publicCharacterId) {
          const updated2 = updateTable(
            "public_characters",
            [{ field: "id", operator: "eq", value: publicCharacterId }],
            payload,
            verification.user_id
          );
          if (updated2 && updated2[0]) publicCharacterId = updated2[0].id;
        } else {
          payload.id = crypto5.randomUUID();
          payload.created_at = (/* @__PURE__ */ new Date()).toISOString();
          const inserted = insertTable(
            "public_characters",
            payload,
            verification.user_id
          );
          const insObj = Array.isArray(inserted) ? inserted[0] : inserted;
          if (insObj) publicCharacterId = insObj.id;
        }
      }
    } else if (verification.target_type === "public_usage") {
      if ((verification.asset_type === "character" || verification.asset_type === "universe" || verification.asset_type === "race") && verification.original_id) {
        updateTable(
          "characters",
          [{ field: "id", operator: "eq", value: verification.original_id }],
          { is_verified_public: true },
          verification.user_id
        );
      }
    }
    const updated = updateTable(
      "asset_verifications",
      [{ field: "id", operator: "eq", value: id }],
      {
        status: "approved",
        public_asset_id: publicAssetId || null,
        public_character_id: publicCharacterId || null,
        rejection_reason: null,
        reviewed_by: adminUser?.id || null,
        reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      verification.user_id
    );
    return c.json({ success: true, verification: updated && updated[0] });
  } catch (error) {
    console.error("Error approving verification:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
adminVerificationRouter.post("/:id/reject", async (c) => {
  try {
    const id = c.req.param("id");
    const adminUser = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return c.json(
        { error: "Denial reason is required to reject a submission." },
        400
      );
    }
    const verifications = queryTable({
      table: "asset_verifications",
      filters: [{ field: "id", operator: "eq", value: id }]
    });
    const verification = verifications && verifications[0];
    if (!verification) {
      return c.json({ error: "Verification request not found" }, 404);
    }
    const updated = updateTable(
      "asset_verifications",
      [{ field: "id", operator: "eq", value: id }],
      {
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: adminUser?.id || null,
        reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      verification.user_id
    );
    return c.json({ success: true, verification: updated && updated[0] });
  } catch (error) {
    console.error("Error rejecting verification:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
adminVerificationRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    deleteTable("asset_verifications", [
      { field: "id", operator: "eq", value: id }
    ]);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting verification:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// server/routes/assets.ts
import { Hono as Hono5 } from "hono";
import crypto6 from "node:crypto";
init_auth();
init_dataStore();
var assetsRouter = new Hono5();
assetsRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  c.set("token", token);
  await next();
});
assetsRouter.get("/verifications/my", async (c) => {
  try {
    const user = c.get("user");
    const verifications = queryTable({
      table: "asset_verifications",
      userId: user.id,
      filters: [{ field: "user_id", operator: "eq", value: user.id }],
      order: { column: "created_at", ascending: false }
    });
    return c.json({ verifications: verifications || [] });
  } catch (error) {
    console.error("Error fetching my verifications:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
assetsRouter.post("/verifications/submit", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const {
      asset_type,
      target_type = "public_asset",
      title,
      description = "",
      original_id = null,
      original_file_path = null,
      file_size = 0,
      mime_type = null,
      metadata = {},
      public_asset_id = null,
      public_character_id = null,
      is_anonymous = false
    } = body;
    if (!asset_type || !["file", "character", "universe", "race"].includes(asset_type)) {
      return c.json({ error: "Invalid asset type" }, 400);
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return c.json({ error: "Title is required" }, 400);
    }
    if (asset_type === "file" && original_file_path) {
      deleteTable(
        "asset_verifications",
        [
          { field: "user_id", operator: "eq", value: user.id },
          {
            field: "original_file_path",
            operator: "eq",
            value: original_file_path
          }
        ],
        user.id
      );
    } else if (original_id) {
      deleteTable(
        "asset_verifications",
        [
          { field: "user_id", operator: "eq", value: user.id },
          { field: "original_id", operator: "eq", value: original_id }
        ],
        user.id
      );
    }
    const payload = {
      id: crypto6.randomUUID(),
      user_id: user.id,
      asset_type,
      target_type,
      status: "pending",
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      original_id,
      original_file_path,
      file_size,
      mime_type,
      public_asset_id,
      public_character_id,
      is_anonymous: Boolean(is_anonymous || metadata?.is_anonymous),
      metadata,
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const inserted = insertTable("asset_verifications", payload, user.id);
    const verification = Array.isArray(inserted) ? inserted[0] : inserted;
    return c.json({ success: true, verification });
  } catch (error) {
    console.error("Error submitting verification request:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
assetsRouter.delete("/verifications/:id", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Verification ID is required" }, 400);
    }
    const isAdmin = user.role === "admin" || String(user.id) === "1";
    const verifs = queryTable({
      table: "asset_verifications",
      filters: [{ field: "id", operator: "eq", value: id }]
    });
    const verif = verifs && verifs[0];
    if (!verif) {
      return c.json({ error: "Verification request not found" }, 404);
    }
    if (verif.user_id !== user.id && !isAdmin) {
      return c.json(
        { error: "Forbidden: You do not own this verification request" },
        403
      );
    }
    if (verif.status === "approved" && verif.target_type === "public_usage") {
      if (verif.asset_type === "character" && verif.original_id) {
        updateTable(
          "characters",
          [{ field: "id", operator: "eq", value: verif.original_id }],
          { is_verified_public: false },
          verif.user_id
        );
      }
    }
    if (verif.status === "approved" && verif.target_type === "public_asset") {
      if (verif.asset_type === "file" && verif.public_asset_id) {
        const assets = queryTable({
          table: "public_assets",
          filters: [
            { field: "id", operator: "eq", value: verif.public_asset_id }
          ]
        });
        const asset = assets && assets[0];
        if (asset) {
          if (asset.file_path) {
            await serverStorage.move(
              "public-assets",
              asset.file_path,
              "Storage",
              asset.file_path
            );
          }
          deleteTable("public_asset_likes", [
            {
              field: "public_asset_id",
              operator: "eq",
              value: verif.public_asset_id
            }
          ]);
          deleteTable(
            "public_assets",
            [{ field: "id", operator: "eq", value: verif.public_asset_id }],
            verif.user_id
          );
        }
      } else if ((verif.asset_type === "character" || verif.asset_type === "universe" || verif.asset_type === "race") && verif.public_character_id) {
        deleteTable("public_character_likes", [
          {
            field: "public_character_id",
            operator: "eq",
            value: verif.public_character_id
          }
        ]);
        deleteTable(
          "public_characters",
          [{ field: "id", operator: "eq", value: verif.public_character_id }],
          verif.user_id
        );
      }
    }
    deleteTable(
      "asset_verifications",
      [{ field: "id", operator: "eq", value: id }],
      verif.user_id
    );
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting verification request:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
assetsRouter.post("/verifications/invalidate", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { asset_type, original_id, original_file_path } = body;
    if (asset_type === "character" || asset_type === "universe" || asset_type === "race") {
      if (original_id) {
        updateTable(
          "characters",
          [{ field: "id", operator: "eq", value: original_id }],
          { is_verified_public: false },
          user.id
        );
        deleteTable(
          "asset_verifications",
          [
            { field: "user_id", operator: "eq", value: user.id },
            { field: "original_id", operator: "eq", value: original_id },
            { field: "target_type", operator: "eq", value: "public_usage" }
          ],
          user.id
        );
      }
    } else if (asset_type === "file") {
      if (original_file_path) {
        deleteTable(
          "asset_verifications",
          [
            { field: "user_id", operator: "eq", value: user.id },
            {
              field: "original_file_path",
              operator: "eq",
              value: original_file_path
            },
            { field: "target_type", operator: "eq", value: "public_usage" }
          ],
          user.id
        );
      }
    }
    return c.json({ success: true });
  } catch (error) {
    console.error("Error invalidating verification:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
assetsRouter.post("/unpublish", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { type, id } = body;
    if (!type || !["file", "character", "universe", "race"].includes(type) || !id) {
      return c.json({ error: "Invalid parameters" }, 400);
    }
    const isAdmin = user.role === "admin" || String(user.id) === "1";
    if (type === "file") {
      const assets = queryTable({
        table: "public_assets",
        filters: [{ field: "id", operator: "eq", value: id }]
      });
      const asset = assets && assets[0];
      if (!asset) {
        return c.json({ error: "Public asset not found" }, 404);
      }
      if (asset.uploader_id !== user.id && asset.user_id !== user.id && !isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
      }
      if (asset.file_path) {
        await serverStorage.move(
          "public-assets",
          asset.file_path,
          "Storage",
          asset.file_path
        );
      }
      deleteTable("public_asset_likes", [
        { field: "public_asset_id", operator: "eq", value: id }
      ]);
      deleteTable(
        "public_assets",
        [{ field: "id", operator: "eq", value: id }],
        asset.user_id || asset.uploader_id
      );
    } else {
      const chars = queryTable({
        table: "public_characters",
        filters: [{ field: "id", operator: "eq", value: id }]
      });
      const char = chars && chars[0];
      if (!char) {
        return c.json({ error: "Public character not found" }, 404);
      }
      if (char.uploader_id !== user.id && char.user_id !== user.id && !isAdmin) {
        return c.json({ error: "Forbidden" }, 403);
      }
      deleteTable("public_character_likes", [
        { field: "public_character_id", operator: "eq", value: id }
      ]);
      deleteTable(
        "public_characters",
        [{ field: "id", operator: "eq", value: id }],
        char.user_id || char.uploader_id
      );
    }
    return c.json({ success: true });
  } catch (error) {
    console.error("Error unpublishing asset:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// server/routes/ai.ts
import { Hono as Hono6 } from "hono";

// server/lib/rateLimiter.ts
var buckets = /* @__PURE__ */ new Map();
var lastCleanup = Date.now();
var CLEANUP_INTERVAL_MS = 6e4;
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) {
      buckets.delete(key);
    }
  }
}
function rateLimiter(maxRequests, windowMs, prefix = "global") {
  return async (c, next) => {
    cleanup();
    const clientIp = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = `${prefix}:${clientIp}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1e3);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "Too many requests. Please try again later." },
        429
      );
    }
    await next();
  };
}

// server/routes/ai.ts
init_auth();
init_dataStore();

// shared/websiteKnowledge.ts
var WEBSITE_KNOWLEDGE_BASE = `
You are the official AI assistant for **Oxygen Low's Software** (accessible online at https://oxygenlow.com, as well as via desktop and Android apps).
Note: The platform is named **Oxygen Low's Software** (NOT "Oxygen Low").

When users ask what they can do on OxygenLow.com, ask about the website or platform, or inquire about available features, provide clear, comprehensive, and helpful answers based on the features below:

### 1. Overview & Platform Identity
- **Platform Name**: Oxygen Low's Software
- **Official Website**: https://oxygenlow.com
- **Core Purpose**: A modern, privacy-focused platform offering a versatile suite of web and desktop productivity tools, developer utilities, multi-model AI assistants, classic and retro games, zero-knowledge encrypted cloud storage, and web security solutions.

### 2. Applications & Productivity Tools (/apps)
- **AI Chatbot** (/apps/chatbot):
  - Advanced conversational AI supporting multiple cloud providers (Cloudflare AI, Stable Horde, OpenAI GPT-4, Anthropic Claude, Google Gemini, OpenRouter, xAI Grok) and local offline AI models (Ollama, LM Studio, KoboldCpp).
  - Integrated Web Search & Agentic Research: autonomously explores the live web and reads web pages to answer real-time questions with source citations.
  - Step-by-Step Reasoning Mode: inspect the model's internal thought process and analysis.
  - Code & Document Artifacts: interactive sidebar to view, syntax-highlight, copy, and download generated code and documents.
  - Custom Roleplay & Universes: chat with custom character personas and fictional universes with RPG attributes and backstories.
  - Zero-Knowledge Chat Encryption: optionally encrypt chat history client-side with a master password.
- **Base64 Encoder/Decoder** (/apps/base64-encoder):
  - Fast client-side tool to encode and decode text strings and binary data to/from Base64 directly in the browser.
- **JSON Formatter & Validator** (/apps/json-formatter):
  - Format, beautify, minify, validate, and inspect JSON payloads with real-time error detection and interactive tree visualization.
- **File Compressor** (/apps/file-compressor):
  - In-browser compression for images, audio, video, and documents to reduce file sizes with zero quality loss and without uploading files to third parties.
- **QR Code Generator** (/apps/qrcode-generator):
  - Generate customized high-resolution QR codes for websites, plain text, Wi-Fi networks, and contact cards with instant PNG/vector download.
- **Data Save** (/apps/data-save):
  - Securely store, organize, and manage encrypted data snippets, custom key-value pairs, and notes with client-side zero-knowledge encryption.
- **Password Manager** (/apps/password-manager):
  - Zero-knowledge AES-256 encrypted vault to securely store and organize passwords, accounts, and credentials protected by a master key.
- **Web Defender** (/apps/webdefender):
  - Website and API security suite providing DDoS protection, bot mitigation, IP filtering, threat intelligence, and rate limiting middleware SDK (@oxygenlow/defender).
- **Public Assets & Characters** (/apps/public-assets & /apps/public-characters):
  - Community directory to discover, share, download, and publish custom AI character personas, fictional universes, and digital assets.
- **LLM Agent** (/apps/llm-agent):
  - Desktop-only autonomous software engineering agent capable of reading, planning, modifying, and executing codebase tasks.
- **VPN & Proxy Manager** (/apps/vpn):
  - Desktop & Android app for configuring and monitoring secure VPN tunnels and network proxy connections with real-time bandwidth tracking.
- **Game Library** (/apps/game-library):
  - Unified desktop game launcher integrating Steam, Epic Games, Xbox, EA, GOG, Ubisoft, and custom games into a single library.
- **Surveys** (/apps/surveys):
  - Monthly anonymous community surveys on hardware, browsers, operating systems, and gaming setups with interactive charts and analytics.

### 3. Classic & Retro Games (/games)
- **Chess** (/games/chess): Singleplayer chess against an AI opponent with customizable difficulty levels.
- **Minesweeper** (/games/minesweeper): Classic puzzle game with customizable grid sizes, mine counts, flags, and timer tracking.
- **Solitaire** (/games/solitaire): Classic Klondike Solitaire card game with move tracking and scoring.
- **Texas Hold'em Poker** (/games/poker): Heads-Up Texas Hold'em against an AI opponent with betting rounds.
- **Sudoku** (/games/sudoku): Number puzzle with multiple difficulty tiers, note-taking, and automated validation.
- **Word Search** (/games/wordsearch): Word search puzzle with generated grids across various categories.

### 4. Cloud Storage & Privacy (/storage)
- **Encrypted Cloud Storage**: Upload, manage, preview, and download files (images, audio, video, documents, code) with end-to-end zero-knowledge client encryption powered by the user's master key.

### 5. Security & Zero-Knowledge Architecture (/security)
- **Zero-Knowledge Encryption Master Key**: Client-derived encryption key that never leaves the browser in plaintext; encrypts passwords, storage files, chatbot conversations, and data snippets.
- **Per-Category Encryption Locks**: Independent locks and protections for Chatbot, Password Manager, Storage, and Data Save.
- **Automatic Master Key Locking**: Automatic master key locking after 30 minutes of inactivity to protect sensitive data.
- **Recovery Keys**: Secure master key export and recovery phrase backup.

### 6. AI Integrations & Local Model Support (/integrations)
- Configure API keys for third-party AI providers (OpenAI, Anthropic Claude, Google Gemini, OpenRouter, xAI Grok, Stable Horde).
- Built-in Cloudflare AI access (using platform points).
- Connect local AI servers without sending data to the cloud: Ollama (http://127.0.0.1:11434), LM Studio (http://127.0.0.1:1234), KoboldCpp (http://127.0.0.1:5001).

### 7. Custom Characters & Roleplay Studio (/characters)
- Create rich AI character personas, custom races/species, and fictional universes.
- Define appearance, personality, backstories, tone, and full RPG stats (STR, DEX, CON, INT, WIS, CHA) that inject seamlessly into Chatbot conversations.

### 8. Customization, Themes & Audio (/customize)
- Themes, neon/glassmorphism UI styles, language switching (English, Spanish, Japanese, Korean, Russian, Simplified Chinese), and built-in sidebar Music Player.

### 9. Social, Friends & Community (/friends)
- Add friends, view online status, user profiles, and connect with the community.
- Official Discord community (https://discord.gg/tNczTe66jK) and Trello development roadmap (https://trello.com/b/OmFTZeVK/oxygen-lows-software-development).

### 10. Downloads & Desktop Apps (/download)
- Native Windows desktop application and Android client downloads.

### 11. Support & Transparency (/support, /changelogs, /legal)
- In-app support ticket submission and admin chat system.
- Detailed changelogs and release notes.
- Transparent legal, Privacy Policy, Terms of Service, EULA, DMCA, and Acceptable Use policies.
`.trim();
var WEBSITE_KNOWLEDGE_SYSTEM_PROMPT = `
You are the AI assistant for Oxygen Low's Software (available at oxygenlow.com and as a desktop/mobile app).
${WEBSITE_KNOWLEDGE_BASE}
`.trim();

// server/lib/hordeContinuation.ts
var MAX_HORDE_CONTINUATIONS = 6;
var CONTINUATION_USER_PROMPT = "Continue directly from where you left off without repeating previous text or adding introductory remarks.";
var KNOWN_EOS_TOKENS = [
  "</s>",
  "<|eot_id|>",
  "<|end_of_text|>",
  "<|im_end|>",
  "[EOS]",
  "<|endoftext|>"
];
function stripEosTokens(text) {
  if (!text) return { cleanText: text, hasEos: false };
  let minIndex = -1;
  for (const token of KNOWN_EOS_TOKENS) {
    const idx = text.indexOf(token);
    if (idx !== -1 && (minIndex === -1 || idx < minIndex)) {
      minIndex = idx;
    }
  }
  if (minIndex !== -1) {
    return { cleanText: text.substring(0, minIndex), hasEos: true };
  }
  return { cleanText: text, hasEos: false };
}
function deduplicateOverlap(prevText, newText) {
  if (!prevText || !newText) return newText;
  const maxOverlap = Math.min(prevText.length, newText.length, 120);
  for (let len = maxOverlap; len >= 3; len--) {
    const prevSlice = prevText.slice(-len);
    if (newText.startsWith(prevSlice)) {
      return newText.slice(len);
    }
  }
  return newText;
}
var EosStreamFilter = class {
  buffer = "";
  process(chunk) {
    this.buffer += chunk;
    const { cleanText, hasEos } = stripEosTokens(this.buffer);
    if (hasEos) {
      this.buffer = "";
      return { text: cleanText, hasEos: true };
    }
    let holdBackLen = 0;
    for (const token of KNOWN_EOS_TOKENS) {
      for (let i = 1; i < token.length; i++) {
        const prefix = token.slice(0, i);
        if (this.buffer.endsWith(prefix)) {
          holdBackLen = Math.max(holdBackLen, prefix.length);
        }
      }
    }
    if (holdBackLen > 0) {
      const emitText2 = this.buffer.slice(0, -holdBackLen);
      this.buffer = this.buffer.slice(-holdBackLen);
      return { text: emitText2, hasEos: false };
    }
    const emitText = this.buffer;
    this.buffer = "";
    return { text: emitText, hasEos: false };
  }
  flush() {
    const text = this.buffer;
    this.buffer = "";
    return stripEosTokens(text).cleanText;
  }
};
async function streamHordeWithContinuation(options) {
  const { targetUrl, fetchHeaders, requestBody, signal } = options;
  let currentMessages = [...requestBody.messages || []];
  const initialBody = {
    ...requestBody,
    stream: true,
    messages: currentMessages
  };
  const initialRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      ...fetchHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(initialBody),
    signal
  });
  if (!initialRes.ok) {
    return initialRes;
  }
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const writeSse = async (text) => {
    try {
      await writer.write(encoder.encode(text));
    } catch {
    }
  };
  (async () => {
    let accumulatedContent = "";
    let continuationCount = 0;
    const eosFilter = new EosStreamFilter();
    let currentRes = initialRes;
    try {
      while (continuationCount <= MAX_HORDE_CONTINUATIONS) {
        if (!currentRes) {
          const nextBody = {
            ...requestBody,
            stream: true,
            messages: currentMessages
          };
          try {
            currentRes = await fetch(targetUrl, {
              method: "POST",
              headers: {
                ...fetchHeaders,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(nextBody),
              signal
            });
          } catch (fetchErr) {
            console.warn(
              `AI Horde continuation request #${continuationCount} network failed; preserving accumulated content.`,
              fetchErr
            );
            break;
          }
          if (!currentRes.ok) {
            console.warn(
              `AI Horde continuation request #${continuationCount} returned status ${currentRes.status}; preserving accumulated content.`
            );
            break;
          }
        }
        if (!currentRes.body) {
          break;
        }
        const reader = currentRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let roundTokensGenerated = 0;
        let lastFinishReason = null;
        let isDone = false;
        let isFirstDeltaThisRound = true;
        while (true) {
          let readResult;
          try {
            readResult = await reader.read();
          } catch (readErr) {
            console.warn(
              `AI Horde stream read error in round ${continuationCount}:`,
              readErr
            );
            break;
          }
          const { done, value } = readResult;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const data = JSON.parse(dataStr);
              const choice = data.choices?.[0];
              if (choice?.finish_reason) {
                lastFinishReason = choice.finish_reason;
              }
              let rawDelta = choice?.delta?.content || data.response || "";
              if (rawDelta) {
                if (continuationCount > 0 && isFirstDeltaThisRound) {
                  rawDelta = deduplicateOverlap(accumulatedContent, rawDelta);
                  isFirstDeltaThisRound = false;
                }
                const { text: cleanDelta, hasEos } = eosFilter.process(rawDelta);
                if (cleanDelta) {
                  roundTokensGenerated++;
                  accumulatedContent += cleanDelta;
                  const clientChunk = {
                    ...data,
                    choices: [
                      {
                        ...choice,
                        delta: {
                          ...choice?.delta,
                          content: cleanDelta
                        },
                        // Suppress finish_reason if we might continue
                        finish_reason: null
                      }
                    ]
                  };
                  await writeSse(`data: ${JSON.stringify(clientChunk)}

`);
                }
                if (hasEos) {
                  isDone = true;
                  lastFinishReason = "stop";
                  break;
                }
              } else if (choice?.delta?.tool_calls) {
                await writeSse(`data: ${dataStr}

`);
              }
            } catch {
            }
          }
          if (isDone) break;
        }
        const flushed = eosFilter.flush();
        if (flushed) {
          roundTokensGenerated++;
          accumulatedContent += flushed;
          const flushedChunk = {
            choices: [
              {
                delta: { content: flushed },
                finish_reason: null
              }
            ]
          };
          await writeSse(`data: ${JSON.stringify(flushedChunk)}

`);
        }
        if (isDone || lastFinishReason === "stop" || lastFinishReason === "tool_calls") {
          await writeSse(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}

`
          );
          break;
        }
        if (roundTokensGenerated === 0) {
          break;
        }
        if (continuationCount >= MAX_HORDE_CONTINUATIONS) {
          await writeSse(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}

`
          );
          break;
        }
        continuationCount++;
        currentMessages = [
          ...requestBody.messages || [],
          { role: "assistant", content: accumulatedContent },
          { role: "user", content: CONTINUATION_USER_PROMPT }
        ];
        currentRes = null;
      }
      await writeSse("data: [DONE]\n\n");
    } finally {
      try {
        await writer.close();
      } catch {
      }
    }
  })();
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
async function fetchHordeNonStreamWithContinuation(options) {
  const { targetUrl, fetchHeaders, requestBody, signal } = options;
  let currentMessages = [...requestBody.messages || []];
  let accumulatedContent = "";
  let continuationCount = 0;
  let lastData = null;
  while (continuationCount <= MAX_HORDE_CONTINUATIONS) {
    const currentBody = {
      ...requestBody,
      stream: false,
      messages: currentMessages
    };
    let res;
    try {
      res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          ...fetchHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(currentBody),
        signal
      });
    } catch (err) {
      if (continuationCount === 0) throw err;
      console.warn(
        `AI Horde non-streaming continuation #${continuationCount} failed; returning accumulated content.`
      );
      break;
    }
    if (!res.ok) {
      if (continuationCount === 0) return res;
      console.warn(
        `AI Horde non-streaming continuation #${continuationCount} returned status ${res.status}; returning accumulated content.`
      );
      break;
    }
    const data = await res.json();
    lastData = data;
    const choice = data.choices?.[0];
    let rawContent = choice?.message?.content || data.response || "";
    if (continuationCount > 0) {
      rawContent = deduplicateOverlap(accumulatedContent, rawContent);
    }
    const { cleanText, hasEos } = stripEosTokens(rawContent);
    accumulatedContent += cleanText;
    const finishReason = choice?.finish_reason;
    if (hasEos || finishReason === "stop" || finishReason === "tool_calls" || !cleanText) {
      break;
    }
    if (finishReason === "length" && continuationCount < MAX_HORDE_CONTINUATIONS) {
      continuationCount++;
      currentMessages = [
        ...requestBody.messages || [],
        { role: "assistant", content: accumulatedContent },
        { role: "user", content: CONTINUATION_USER_PROMPT }
      ];
    } else {
      break;
    }
  }
  const finalResponseData = {
    ...lastData || {},
    choices: [
      {
        ...lastData?.choices?.[0] || {},
        message: {
          role: "assistant",
          content: accumulatedContent
        },
        finish_reason: "stop"
      }
    ]
  };
  return new Response(JSON.stringify(finalResponseData), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}

// server/routes/ai.ts
var aiRouter = new Hono6();
var DEFAULT_MODELS = [
  { provider: "horde", model_id: "Fast" },
  { provider: "horde", model_id: "Smart" },
  { provider: "cloudflare", model_id: "@cf/nvidia/nemotron-3-120b-a12b" },
  { provider: "cloudflare", model_id: "@cf/google/gemma-4-26b-a4b-it" },
  { provider: "cloudflare", model_id: "@cf/zai-org/glm-4.7-flash" },
  { provider: "cloudflare", model_id: "@cf/ibm-granite/granite-4.0-h-micro" },
  { provider: "cloudflare", model_id: "@cf/meta/llama-3.1-8b-instruct-fast" }
];
var HORDE_MODELS_MAP = {
  TitleGen: ["koboldcpp/Llama-3.2-1B-Instruct"],
  Fast: ["koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M"],
  Smart: ["aphrodite/TheDrummer/Behemoth-X-123B-v2.1"]
};
function extractBearerToken(authHeader) {
  if (!authHeader) return null;
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
}
var apiLimiter = rateLimiter(30, 6e4, "ai");
aiRouter.get("/local-providers", apiLimiter, async (c) => {
  return c.json([...DEFAULT_MODELS]);
});
aiRouter.get("/horde-status", apiLimiter, async (c) => {
  try {
    const response = await fetch(
      "https://stablehorde.net/api/v2/status/models?type=text"
    );
    if (!response.ok) return c.json({});
    const allModels = await response.json();
    const statusByName = {};
    for (const m of allModels) {
      if (m.name) statusByName[m.name] = m;
    }
    const result = {};
    for (const [modelId, hordeNames] of Object.entries(HORDE_MODELS_MAP)) {
      let workers = 0;
      let queued = 0;
      let speed = "";
      let eta = 0;
      for (const name of hordeNames) {
        const info = statusByName[name];
        if (info) {
          workers += info.count || 0;
          queued += info.queued || 0;
          if (!speed && info.performance) speed = String(info.performance);
          eta = Math.max(eta, info.eta || 0);
        }
      }
      result[modelId] = { workers, queued, speed, eta };
    }
    return c.json(result);
  } catch (e) {
    return c.json({});
  }
});
aiRouter.post("/proxy", apiLimiter, async (c) => {
  const { provider, model, messages, stream, apiKey, baseUrl, tools } = await c.req.json();
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  let user = null;
  if (token && token !== "undefined" && token !== "null") {
    user = await resolveUserFromToken(token);
  }
  if (!user && provider !== "horde") {
    return c.json({ error: "Authentication required for this model." }, 401);
  }
  let integration = null;
  if (user) {
    const integrations = queryTable({
      table: "user_integrations",
      userId: user.id,
      filters: [{ field: "provider", operator: "eq", value: provider }]
    });
    if (Array.isArray(integrations) && integrations.length > 0) {
      integration = integrations[0];
    }
  }
  if (apiKey) {
    integration = { ...integration, api_key: apiKey };
  }
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "https:") {
        return c.json({ error: "Custom base URL must use HTTPS" }, 400);
      }
      const blockedHosts = [
        "localhost",
        "127.0.0.1",
        "::1",
        "169.254.169.254",
        "metadata.google.internal"
      ];
      if (blockedHosts.includes(parsed.hostname) || parsed.hostname.startsWith("10.") || parsed.hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)) {
        return c.json(
          { error: "Custom base URL must point to a public server" },
          400
        );
      }
      integration = { ...integration, base_url: baseUrl };
    } catch {
      return c.json({ error: "Invalid custom base URL" }, 400);
    }
  }
  if (!integration?.api_key && provider !== "horde" && provider !== "cloudflare") {
    return c.json({ error: "Provider not configured" }, 400);
  }
  const MAX_MSG_CONTENT_LENGTH = 32768;
  const processedMessages = (messages || []).slice(-20).map((m) => ({
    ...m,
    content: typeof m.content === "string" && m.content.length > MAX_MSG_CONTENT_LENGTH ? m.content.slice(0, MAX_MSG_CONTENT_LENGTH) : m.content
  }));
  let finalMessages = [...processedMessages];
  const hasWebsiteKnowledge = finalMessages.some(
    (m) => m.role === "system" && typeof m.content === "string" && m.content.includes("Oxygen Low's Software")
  );
  if (!hasWebsiteKnowledge) {
    finalMessages.unshift({
      role: "system",
      content: WEBSITE_KNOWLEDGE_SYSTEM_PROMPT
    });
  }
  const fetchOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal: c.req.raw.signal
  };
  try {
    let targetUrl = "";
    let requestBody = { stream, tools };
    if (provider === "openai") {
      targetUrl = "https://api.openai.com/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "anthropic") {
      targetUrl = "https://api.anthropic.com/v1/messages";
      const systemMessages = finalMessages.filter(
        (m) => m.role === "system"
      );
      const systemContent = systemMessages.map((m) => m.content).join("\n\n");
      const transformedMessages = finalMessages.filter(
        (m) => m.role !== "system"
      );
      requestBody = {
        ...requestBody,
        model,
        messages: transformedMessages,
        max_tokens: 4096,
        system: systemContent || void 0
      };
      fetchOptions.headers["x-api-key"] = integration?.api_key;
      fetchOptions.headers["anthropic-version"] = "2023-06-01";
    } else if (provider === "google") {
      const action = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
      targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}key=${integration?.api_key}`;
      requestBody = {
        systemInstruction: {
          parts: finalMessages.filter((m) => m.role === "system").map((m) => ({ text: m.content }))
        },
        contents: finalMessages.filter((m) => m.role !== "system").map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        })),
        tools: tools ? tools.map((t) => ({ function_declarations: [t.function] })) : void 0
      };
    } else if (provider === "openrouter") {
      targetUrl = "https://openrouter.ai/api/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "grok") {
      targetUrl = "https://api.x.ai/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "horde") {
      const actualModel = HORDE_MODELS_MAP[model]?.[0] || model;
      const hordeHeaders = {
        Authorization: `Bearer ${integration?.api_key || "0000000000"}`
      };
      const hordeRequestBody = {
        ...requestBody,
        model: actualModel,
        messages: finalMessages
      };
      if (stream) {
        const hordeResponse = await streamHordeWithContinuation({
          targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
          fetchHeaders: hordeHeaders,
          requestBody: hordeRequestBody,
          signal: c.req.raw.signal
        });
        if (!hordeResponse.ok) {
          const status = hordeResponse.status;
          let userMessage = "The AI provider returned an error.";
          if (status === 401 || status === 403)
            userMessage = "Invalid or expired API key for this provider.";
          else if (status === 429)
            userMessage = "Rate limit exceeded. Please try again later.";
          else if (status === 503 || status === 502)
            userMessage = "The AI provider is temporarily unavailable.";
          return c.json({ error: userMessage }, status);
        }
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");
        return c.body(hordeResponse.body);
      } else {
        const hordeResponse = await fetchHordeNonStreamWithContinuation({
          targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
          fetchHeaders: hordeHeaders,
          requestBody: hordeRequestBody,
          signal: c.req.raw.signal
        });
        if (!hordeResponse.ok) {
          const status = hordeResponse.status;
          let userMessage = "The AI provider returned an error.";
          if (status === 401 || status === 403)
            userMessage = "Invalid or expired API key for this provider.";
          else if (status === 429)
            userMessage = "Rate limit exceeded. Please try again later.";
          else if (status === 503 || status === 502)
            userMessage = "The AI provider is temporarily unavailable.";
          return c.json({ error: userMessage }, status);
        }
        const data = await hordeResponse.json();
        return c.json(data);
      }
    } else if (provider === "cloudflare") {
      if (!user) return c.json({ error: "Authentication required" }, 401);
      const inputChars = finalMessages.reduce(
        (acc, m) => acc + (m.content || "").length,
        0
      );
      const estimatedTokens = Math.floor(inputChars / 4) + 400;
      const p_amount = Math.max(10, Math.floor(estimatedTokens / 10));
      const rpcRes = callRpc("spend_points", { p_amount }, user.id);
      if (!rpcRes || !rpcRes.success) {
        return c.json({ error: "Insufficient points" }, 402);
      }
      const rawEnv = c.env || {};
      let cloudflareId = "";
      let cloudflareToken = "";
      for (const [key, value] of Object.entries(rawEnv)) {
        const cleanKey = key.trim().toLowerCase();
        if (cleanKey === "cloudflare_id")
          cloudflareId = value.trim();
        if (cleanKey === "cloudflare_token")
          cloudflareToken = value.trim();
      }
      const procEnv = typeof process !== "undefined" ? process.env : {};
      if (!cloudflareId) {
        cloudflareId = (procEnv.CLOUDFLARE_ID || "").trim();
      }
      if (!cloudflareToken) {
        cloudflareToken = (procEnv.CLOUDFLARE_TOKEN || "").trim();
      }
      if (!cloudflareId || !cloudflareToken) {
        return c.json(
          {
            error: "Cloudflare AI is temporarily unavailable. Please try a different provider."
          },
          500
        );
      }
      targetUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareId}/ai/v1/chat/completions`;
      requestBody = { model, messages: finalMessages };
      if (stream) {
        requestBody.stream = true;
      }
      fetchOptions.headers["Authorization"] = `Bearer ${cloudflareToken}`;
    } else {
      return c.json({ error: "Unsupported provider" }, 400);
    }
    fetchOptions.body = JSON.stringify(requestBody);
    const upstreamResponse = await fetch(targetUrl, fetchOptions);
    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status;
      let userMessage = "The AI provider returned an error.";
      if (status === 401 || status === 403)
        userMessage = "Invalid or expired API key for this provider.";
      else if (status === 429)
        userMessage = "Rate limit exceeded. Please try again later.";
      else if (status === 503 || status === 502)
        userMessage = "The AI provider is temporarily unavailable.";
      return c.json({ error: userMessage }, status);
    }
    if (stream) {
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      return c.body(upstreamResponse.body);
    } else {
      const data = await upstreamResponse.json();
      return c.json(data);
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      return c.json({ error: "Request aborted" }, 499);
    }
    console.error("AI Proxy Error", err);
    return c.json({ error: "An internal error occurred" }, 500);
  }
});

// server/routes/changelogs.ts
import { Hono as Hono7 } from "hono";
var changelogsRouter = new Hono7();
var apiLimiter2 = rateLimiter(2, 6e4, "changelogs");
function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec))).replace(
    /&#x([0-9a-fA-F]+);/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16))
  );
}
function parseAtomFeed(xml) {
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  return entries.map((entryXml) => {
    const idMatch = entryXml.match(
      /<id[^>]*>[\s\S]*?Commit\/([a-f0-9]{7,40})[\s\S]*?<\/id>/i
    );
    const linkMatch = entryXml.match(
      /<link[^>]*href=["']([^"']*\/commit\/([a-f0-9]{7,40}))["']/i
    );
    const sha = idMatch?.[1] || linkMatch?.[2] || "";
    const html_url = linkMatch?.[1] || (sha ? `https://github.com/Oxygen-Low/Oxygen-Lows-Software/commit/${sha}` : "");
    const authorMatch = entryXml.match(
      /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i
    );
    const authorName = authorMatch ? decodeHtmlEntities(authorMatch[1].trim()) : "Unknown";
    const updatedMatch = entryXml.match(/<updated>([\s\S]*?)<\/updated>/i);
    const date = updatedMatch ? updatedMatch[1].trim() : (/* @__PURE__ */ new Date()).toISOString();
    let message = "";
    const contentMatch = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
    if (contentMatch) {
      const rawContent = decodeHtmlEntities(contentMatch[1]);
      const preMatch = rawContent.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      if (preMatch) {
        message = decodeHtmlEntities(preMatch[1]).trim();
      } else {
        message = rawContent.replace(/<[^>]*>/g, "").trim();
      }
    }
    if (!message) {
      const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        message = decodeHtmlEntities(titleMatch[1]).trim();
      }
    }
    return {
      sha,
      html_url,
      commit: {
        message,
        author: {
          name: authorName,
          date
        }
      }
    };
  });
}
var listCache = null;
var LIST_CACHE_TTL = 6e4;
var ATOM_FEED_URL = "https://github.com/Oxygen-Low/Oxygen-Lows-Software/commits.atom";
changelogsRouter.get("/", apiLimiter2, async (c) => {
  try {
    const now = Date.now();
    if (listCache && now < listCache.expiry) {
      return c.json(listCache.data);
    }
    const response = await fetch(ATOM_FEED_URL, {
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml; q=0.9, */*; q=0.8",
        "User-Agent": "Oxygen-Lows-Software"
      }
    });
    if (!response.ok) {
      console.error(
        "GitHub Atom commits feed fetch failed:",
        response.status,
        await response.text()
      );
      return c.json(
        { error: "Failed to fetch changelogs" },
        response.status
      );
    }
    const xml = await response.text();
    const commits = parseAtomFeed(xml);
    listCache = { data: commits, expiry: now + LIST_CACHE_TTL };
    return c.json(commits);
  } catch (error) {
    console.error("Error fetching changelogs:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// server/routes/vpn.ts
import { Hono as Hono8 } from "hono";
import ping from "ping";
var vpnRouter = new Hono8();
var apiLimiter3 = rateLimiter(30, 6e4, "vpn");
var IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function isPrivateIPv4(ip) {
  const m = IPV4_RE.exec(ip);
  if (!m) return false;
  const [, a, b] = m.map(Number);
  return a === 0 || a === 10 || a === 127 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 169 && b === 254;
}
var PRIVATE_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "::1",
  "0:0:0:0:0:0:0:1"
]);
function isPrivateHost(host) {
  if (PRIVATE_HOSTNAMES.has(host.toLowerCase())) return true;
  if (isPrivateIPv4(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  return false;
}
function isValidIp(ip) {
  if (IPV4_RE.test(ip)) {
    return ip.split(".").every((o) => Number(o) >= 0 && Number(o) <= 255);
  }
  if (ip.includes(":")) {
    return /^[0-9a-fA-F:]+$/.test(ip);
  }
  return false;
}
vpnRouter.get("/ping", apiLimiter3, async (c) => {
  const host = c.req.query("host");
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    return c.json({ error: "Valid host parameter is required" }, 400);
  }
  if (isPrivateHost(host)) {
    return c.json({ error: "Private or loopback hosts are not allowed" }, 400);
  }
  try {
    const res = await ping.promise.probe(host, {
      timeout: 2
    });
    return c.json({
      host: res.host,
      alive: res.alive,
      time: res.time
    });
  } catch (error) {
    console.error("Ping error:", error);
    return c.json({ error: "Failed to ping host" }, 500);
  }
});
vpnRouter.get("/geocode", apiLimiter3, async (c) => {
  const ip = c.req.query("ip");
  if (ip !== void 0 && ip !== "") {
    const isValidFormat = isValidIp(ip) || /^[a-zA-Z0-9.-]+$/.test(ip);
    if (!isValidFormat) {
      return c.json({ error: "Invalid IP address or hostname format" }, 400);
    }
    if (isPrivateHost(ip)) {
      return c.json(
        { error: "Private or loopback hosts are not allowed" },
        400
      );
    }
  }
  try {
    const url = ip ? `https://ip-api.com/json/${encodeURIComponent(ip)}` : `https://ip-api.com/json/`;
    const res = await fetch(url);
    const data = await res.json();
    return c.json(data);
  } catch (error) {
    console.error("Geocode error:", error);
    return c.json({ error: "Failed to geocode IP" }, 500);
  }
});

// server/routes/webdefender.ts
import { Hono as Hono9 } from "hono";
import { streamSSE } from "hono/streaming";
init_auth();
init_dataStore();
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
var defenderRouter = new Hono9();
var configListeners = /* @__PURE__ */ new Map();
function addConfigListener(appId, listener) {
  let listeners = configListeners.get(appId);
  if (!listeners) {
    listeners = /* @__PURE__ */ new Set();
    configListeners.set(appId, listeners);
  }
  listeners.add(listener);
}
function removeConfigListener(appId, listener) {
  const listeners = configListeners.get(appId);
  if (listeners) {
    listeners.delete(listener);
    if (listeners.size === 0) {
      configListeners.delete(appId);
    }
  }
}
async function broadcastConfigUpdate(appId) {
  const listeners = configListeners.get(appId);
  if (!listeners || listeners.size === 0) return;
  try {
    const allApps = getTableRows("defender_apps");
    const localApp = allApps.find((a) => a.id === appId);
    if (!localApp) return;
    const app2 = localApp;
    const allConfigs = getTableRows("defender_config", app2.user_id);
    const config = allConfigs.find((c) => c.app_id === appId) || {};
    const allRoutes = getTableRows("defender_routes", app2.user_id);
    const routes = allRoutes.filter((r) => r.app_id === appId);
    const payload = {
      id: app2.id,
      name: app2.name,
      block_mode_enabled: app2.block_mode_enabled,
      config,
      routes
    };
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error("[Defender] Error broadcasting to listener:", err);
      }
    }
  } catch (err) {
    console.error("[Defender] Failed to broadcast config update:", err);
  }
}
function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}
async function requireApiKey(c, next) {
  const authHeader = c.req.header("Authorization");
  const rawKey = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!rawKey) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const hash = hashApiKey(rawKey);
  const allApps = getTableRows("defender_apps");
  const localApp = allApps.find((a) => {
    if (!a.api_key_hash) return false;
    const actual = createHash("sha256").update(hash).digest();
    const expected = createHash("sha256").update(a.api_key_hash).digest();
    return timingSafeEqual(actual, expected);
  });
  if (!localApp) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  const allConfigs = getTableRows("defender_config", localApp.user_id);
  const config = allConfigs.find((cfg) => cfg.app_id === localApp.id) || null;
  const allRoutes = getTableRows("defender_routes", localApp.user_id);
  const routes = allRoutes.filter((r) => r.app_id === localApp.id);
  const app2 = {
    ...localApp,
    defender_config: config ? [config] : [],
    defender_routes: routes,
    _isLocal: true
  };
  c.set("defenderApp", app2);
  await next();
}
async function requireAuth(c, next) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  c.set("userId", user.id);
  await next();
}
var packageLimiter = rateLimiter(60, 6e4, "def_pkg");
var eventLimiter = rateLimiter(200, 6e4, "def_evt");
defenderRouter.post("/verify", packageLimiter, requireApiKey, async (c) => {
  const app2 = c.get("defenderApp");
  if (!app2.first_request_at) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    app2.first_request_at = now;
    updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: app2.id }],
      { first_request_at: now },
      app2.user_id
    );
  }
  const config = Array.isArray(app2.defender_config) ? app2.defender_config[0] || {} : app2.defender_config || {};
  return c.json({
    id: app2.id,
    name: app2.name,
    block_mode_enabled: app2.block_mode_enabled,
    config,
    routes: app2.defender_routes || []
  });
});
defenderRouter.get("/config-stream", requireApiKey, async (c) => {
  const app2 = c.get("defenderApp");
  return streamSSE(c, async (stream) => {
    let freshConfig = {};
    let freshRoutes = [];
    let blockModeEnabled = app2.block_mode_enabled;
    let appName = app2.name;
    const allApps = getTableRows("defender_apps", app2.user_id);
    const curApp = allApps.find((a) => a.id === app2.id);
    if (curApp) {
      blockModeEnabled = curApp.block_mode_enabled;
      appName = curApp.name;
    }
    const allConfigs = getTableRows("defender_config", app2.user_id);
    freshConfig = allConfigs.find((cfg) => cfg.app_id === app2.id) || {};
    freshRoutes = getTableRows("defender_routes", app2.user_id).filter(
      (r) => r.app_id === app2.id
    );
    await stream.writeSSE({
      event: "config",
      data: JSON.stringify({
        id: app2.id,
        name: appName,
        block_mode_enabled: blockModeEnabled,
        config: freshConfig,
        routes: freshRoutes
      })
    });
    const listener = async (payload) => {
      try {
        await stream.writeSSE({
          event: "config",
          data: JSON.stringify(payload)
        });
      } catch (_) {
      }
    };
    addConfigListener(app2.id, listener);
    stream.onAbort(() => {
      removeConfigListener(app2.id, listener);
    });
    while (!stream.aborted) {
      await stream.sleep(3e4);
      try {
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch (_) {
        break;
      }
    }
    removeConfigListener(app2.id, listener);
  });
});
defenderRouter.post("/register", packageLimiter, requireApiKey, async (c) => {
  const app2 = c.get("defenderApp");
  const body = await c.req.json().catch(() => ({}));
  const routes = body.routes || [];
  if (!Array.isArray(routes) || routes.length === 0) {
    return c.json({ registered: 0 });
  }
  const existingRoutes = getTableRows("defender_routes", app2.user_id);
  let registeredCount = 0;
  for (const r of routes) {
    const match = existingRoutes.find(
      (er) => er.app_id === app2.id && er.method === r.method && er.path === r.path
    );
    if (!match) {
      const newRoute = {
        id: randomUUID(),
        app_id: app2.id,
        user_id: app2.user_id,
        method: r.method,
        path: r.path,
        rate_limit_enabled: false,
        rate_limit_requests: 100,
        rate_limit_window_seconds: 60,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      existingRoutes.push(newRoute);
      registeredCount++;
    }
  }
  saveTableRows("defender_routes", app2.user_id, existingRoutes);
  broadcastConfigUpdate(app2.id).catch(() => {
  });
  return c.json({ registered: registeredCount });
});
defenderRouter.post("/event", eventLimiter, requireApiKey, async (c) => {
  const app2 = c.get("defenderApp");
  const body = await c.req.json().catch(() => ({}));
  const matchingRoute = (app2.defender_routes || []).find(
    (r) => r.method === body.method && r.path === body.path
  );
  const eventRecord = {
    id: randomUUID(),
    app_id: app2.id,
    user_id: app2.user_id,
    route_id: matchingRoute?.id || null,
    event_type: body.eventType,
    ip: body.ip,
    country_code: body.countryCode,
    method: body.method,
    path: body.path,
    blocked: Boolean(body.blocked),
    request_body_snippet: body.requestBodySnippet || null,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const existingEvents = getTableRows("defender_events", app2.user_id);
  existingEvents.unshift(eventRecord);
  const config = Array.isArray(app2.defender_config) ? app2.defender_config[0] || {} : app2.defender_config || {};
  const maxEvents = Math.min(1e3, Math.max(1, config.events_limit || 50));
  const appEvents = existingEvents.filter((e) => e.app_id === app2.id).slice(0, maxEvents);
  const otherEvents = existingEvents.filter((e) => e.app_id !== app2.id);
  saveTableRows("defender_events", app2.user_id, [...appEvents, ...otherEvents]);
  return c.json({}, 201);
});
defenderRouter.post("/outbound", eventLimiter, requireApiKey, async (c) => {
  const app2 = c.get("defenderApp");
  const body = await c.req.json().catch(() => ({}));
  const existingOutbound = getTableRows("defender_outbound", app2.user_id);
  const existing = existingOutbound.find(
    (o) => o.app_id === app2.id && o.host === body.host && (o.port || 80) === (body.port || 80) && (o.protocol || "tcp") === (body.protocol || "tcp")
  );
  if (existing) {
    existing.last_seen = (/* @__PURE__ */ new Date()).toISOString();
    existing.request_count = (existing.request_count || 1) + 1;
    if (body.ip) existing.ip = body.ip;
  } else {
    existingOutbound.push({
      id: randomUUID(),
      app_id: app2.id,
      user_id: app2.user_id,
      host: body.host,
      ip: body.ip || null,
      port: body.port || 80,
      protocol: body.protocol || "tcp",
      request_count: 1,
      allowed: true,
      first_seen: (/* @__PURE__ */ new Date()).toISOString(),
      last_seen: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  saveTableRows("defender_outbound", app2.user_id, existingOutbound);
  return c.json({}, 200);
});
var uiLimiter = rateLimiter(30, 6e4, "def_ui");
defenderRouter.get("/apps", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const apps = getTableRows("defender_apps", user.id);
  apps.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return c.json(apps);
});
defenderRouter.post("/apps", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const { name } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: "Name is required" }, 400);
  const rawKey = "def_" + randomBytes(16).toString("hex");
  const apiKeyHash = hashApiKey(rawKey);
  const apiKeyPrefix = rawKey.substring(0, 8);
  const appId = randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newApp = {
    id: appId,
    user_id: user.id,
    name,
    api_key_hash: apiKeyHash,
    api_key_prefix: apiKeyPrefix,
    api_key: rawKey,
    block_mode_enabled: false,
    block_mode_enabled_at: null,
    first_request_at: null,
    created_at: now
  };
  insertTable("defender_apps", newApp, user.id);
  const defaultConfig = {
    id: randomUUID(),
    app_id: appId,
    user_id: user.id,
    block_sql_injection: true,
    block_shell_injection: true,
    block_path_traversal: true,
    block_ssrf: true,
    block_tor: true,
    block_vpn: true,
    block_countries: [],
    block_ips: [],
    block_ad_bots: false,
    block_ai_assistants: false,
    block_ai_scrapers: true,
    block_ai_search_crawlers: false,
    block_data_harvesters: true,
    block_bruteforce: true,
    block_http_dos: true,
    block_http_exploit: true,
    block_botnets: true,
    ddos_protection: true,
    ddos_threshold_rpm: 1e3,
    events_limit: 50,
    created_at: now
  };
  insertTable("defender_config", defaultConfig, user.id);
  return c.json(
    {
      ...newApp,
      apiKey: rawKey
    },
    201
  );
});
defenderRouter.delete("/apps/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  deleteTable(
    "defender_apps",
    [{ field: "id", operator: "eq", value: id }],
    user.id
  );
  deleteTable(
    "defender_config",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id
  );
  deleteTable(
    "defender_routes",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id
  );
  deleteTable(
    "defender_events",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id
  );
  deleteTable(
    "defender_outbound",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id
  );
  return c.body(null, 204);
});
defenderRouter.get("/apps/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const apps = getTableRows("defender_apps", user.id);
  const app2 = apps.find((a) => a.id === id);
  if (app2) {
    const configs = getTableRows("defender_config", user.id);
    const config = configs.find((cfg) => cfg.app_id === id) || null;
    return c.json({
      ...app2,
      defender_config: config ? [config] : []
    });
  }
  return c.json({ error: "App not found" }, 404);
});
defenderRouter.put(
  "/apps/:id/block-mode",
  uiLimiter,
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { enabled } = await c.req.json().catch(() => ({}));
    const apps = getTableRows("defender_apps", user.id);
    const app2 = apps.find((a) => a.id === id);
    if (!app2) {
      return c.json({ error: "App not found" }, 404);
    }
    const updateData = { block_mode_enabled: Boolean(enabled) };
    if (enabled && !app2.block_mode_enabled_at) {
      updateData.block_mode_enabled_at = (/* @__PURE__ */ new Date()).toISOString();
    }
    const updated = updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: id }],
      updateData,
      user.id
    );
    broadcastConfigUpdate(id).catch(() => {
    });
    return c.json(updated[0] || { ...app2, ...updateData });
  }
);
defenderRouter.put("/apps/:id/config", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const allowedKeys = [
    "block_sql_injection",
    "block_shell_injection",
    "block_path_traversal",
    "block_ssrf",
    "block_tor",
    "block_vpn",
    "block_countries",
    "block_ips",
    "block_ad_bots",
    "block_ai_assistants",
    "block_ai_scrapers",
    "block_ai_search_crawlers",
    "block_data_harvesters",
    "block_bruteforce",
    "block_http_dos",
    "block_http_exploit",
    "block_botnets",
    "ddos_protection",
    "ddos_threshold_rpm",
    "events_limit"
  ];
  const updatePayload = { app_id: id, user_id: user.id };
  for (const key of allowedKeys) {
    if (key in body) {
      if (key === "events_limit") {
        updatePayload[key] = Math.min(
          1e3,
          Math.max(1, parseInt(body[key]) || 50)
        );
      } else {
        updatePayload[key] = body[key];
      }
    }
  }
  const result = upsertTable(
    "defender_config",
    updatePayload,
    user.id,
    "app_id"
  );
  if (updatePayload.events_limit !== void 0) {
    const existingEvents = getTableRows("defender_events", user.id);
    const appEvents = existingEvents.filter((e) => e.app_id === id);
    const otherEvents = existingEvents.filter((e) => e.app_id !== id);
    if (appEvents.length > updatePayload.events_limit) {
      const pruned = appEvents.slice(0, updatePayload.events_limit);
      saveTableRows("defender_events", user.id, [...pruned, ...otherEvents]);
    }
  }
  broadcastConfigUpdate(id).catch(() => {
  });
  return c.json(result[0] || updatePayload);
});
defenderRouter.get("/apps/:id/routes", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const routes = getTableRows("defender_routes", user.id).filter(
    (r) => r.app_id === id
  );
  routes.sort((a, b) => (a.path || "").localeCompare(b.path || ""));
  return c.json(routes);
});
defenderRouter.put("/routes/:routeId", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const routeId = c.req.param("routeId");
  const body = await c.req.json().catch(() => ({}));
  const updateData = {};
  if (body.rateLimitEnabled !== void 0 || body.rate_limit_enabled !== void 0) {
    updateData.rate_limit_enabled = body.rateLimitEnabled ?? body.rate_limit_enabled;
  }
  if (body.rateLimitRequests !== void 0 || body.rate_limit_requests !== void 0) {
    updateData.rate_limit_requests = body.rateLimitRequests ?? body.rate_limit_requests;
  }
  if (body.rateLimitWindowSeconds !== void 0 || body.rate_limit_window_seconds !== void 0) {
    updateData.rate_limit_window_seconds = body.rateLimitWindowSeconds ?? body.rate_limit_window_seconds;
  }
  const updated = updateTable(
    "defender_routes",
    [{ field: "id", operator: "eq", value: routeId }],
    updateData,
    user.id
  );
  const updatedRoute = updated[0];
  if (updatedRoute && updatedRoute.app_id) {
    broadcastConfigUpdate(updatedRoute.app_id).catch(() => {
    });
  }
  return c.json(updatedRoute || {});
});
defenderRouter.get("/apps/:id/events", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query("limit") || "1000")),
    1e3
  );
  const eventType = c.req.query("eventType");
  const blockedStr = c.req.query("blocked");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  let events = getTableRows("defender_events", user.id).filter(
    (e) => e.app_id === id
  );
  if (eventType) {
    events = events.filter((e) => e.event_type === eventType);
  }
  if (blockedStr !== void 0 && blockedStr !== "") {
    events = events.filter((e) => String(e.blocked) === blockedStr);
  }
  if (startDate) {
    events = events.filter(
      (e) => new Date(e.created_at) >= new Date(startDate)
    );
  }
  if (endDate) {
    events = events.filter(
      (e) => new Date(e.created_at) <= new Date(endDate)
    );
  }
  events.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const total = events.length;
  const from = (page - 1) * limit;
  const paginatedEvents = events.slice(from, from + limit);
  return c.json({
    events: paginatedEvents,
    total,
    page,
    limit
  });
});
defenderRouter.get("/apps/:id/outbound", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const outbound = getTableRows("defender_outbound", user.id).filter(
    (o) => o.app_id === id
  );
  outbound.sort(
    (a, b) => new Date(b.last_seen || 0).getTime() - new Date(a.last_seen || 0).getTime()
  );
  return c.json(outbound);
});
defenderRouter.put("/outbound/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { allowed } = await c.req.json().catch(() => ({}));
  const updated = updateTable(
    "defender_outbound",
    [{ field: "id", operator: "eq", value: id }],
    { allowed: Boolean(allowed) },
    user.id
  );
  return c.json(updated[0] || {});
});
defenderRouter.delete("/outbound/:id", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  deleteTable(
    "defender_outbound",
    [{ field: "id", operator: "eq", value: id }],
    user.id
  );
  return c.body(null, 204);
});
defenderRouter.post(
  "/apps/:id/rotate-key",
  uiLimiter,
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const rawKey = "def_" + randomBytes(16).toString("hex");
    const apiKeyHash = hashApiKey(rawKey);
    const apiKeyPrefix = rawKey.substring(0, 8);
    updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: id }],
      {
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        api_key: rawKey
      },
      user.id
    );
    broadcastConfigUpdate(id).catch(() => {
    });
    return c.json({
      apiKey: rawKey,
      apiKeyPrefix
    });
  }
);

// server/routes/storage.ts
import { Hono as Hono10 } from "hono";
import fs4 from "fs";
import path4 from "path";
init_auth();
var storageRouter = new Hono10();
var authMiddleware = async (c, next) => {
  let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
  if (!token) {
    token = c.req.query("token");
  }
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  c.set("token", token);
  await next();
};
storageRouter.post("/upload/:bucket/*", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath = c.req.param("*") || c.req.param("path") || c.req.path.split(`/upload/${bucket}/`)[1];
    let filePath;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }
    const user = c.get("user");
    if (!filePath.startsWith(user.id + "/") && user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Cannot upload to other user's directory" }, 400);
    }
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }
    let buffer;
    if (typeof file === "object" && file !== null && typeof file.arrayBuffer === "function") {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (typeof file === "string") {
      buffer = Buffer.from(file, "utf-8");
    } else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
      buffer = Buffer.from(file);
    } else {
      return c.json({ error: "Invalid file format" }, 400);
    }
    const newFileSize = file.size ?? buffer.length;
    const currentSize = getUserTotalSize(user.id);
    if (currentSize + newFileSize > MAX_USER_QUOTA) {
      return c.json(
        { error: "Quota exceeded. Maximum 500MB allowed per user." },
        400
      );
    }
    const { data, error } = await serverStorage.upload(
      bucket,
      filePath,
      buffer
    );
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    return c.json({ data, error: null });
  } catch (err) {
    return c.json({ error: err.message || "Upload failed" }, 500);
  }
});
storageRouter.post("/upload-chunk/:bucket/*", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath = c.req.param("*") || c.req.param("path") || c.req.path.split(`/upload-chunk/${bucket}/`)[1];
    let filePath;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }
    const user = c.get("user");
    if (!filePath.startsWith(user.id + "/") && user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Cannot upload to other user's directory" }, 400);
    }
    const body = await c.req.parseBody();
    const uploadId = body["uploadId"];
    const chunkIndex = parseInt(body["chunkIndex"], 10);
    const totalChunks = parseInt(body["totalChunks"], 10);
    const totalSize = parseInt(body["totalSize"], 10) || 0;
    const file = body["file"];
    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !file) {
      return c.json({ error: "Missing chunk parameters" }, 400);
    }
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeUploadId) {
      return c.json({ error: "Invalid upload ID" }, 400);
    }
    const currentSize = getUserTotalSize(user.id);
    if (currentSize + totalSize > MAX_USER_QUOTA) {
      return c.json(
        { error: "Quota exceeded. Maximum 500MB allowed per user." },
        400
      );
    }
    let buffer;
    if (typeof file === "object" && file !== null && typeof file.arrayBuffer === "function") {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (typeof file === "string") {
      buffer = Buffer.from(file, "utf-8");
    } else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
      buffer = Buffer.from(file);
    } else {
      return c.json({ error: "Invalid file format" }, 400);
    }
    const tmpDir = path4.join(STORAGE_DIR, ".tmp", safeUploadId);
    fs4.mkdirSync(tmpDir, { recursive: true });
    const chunkPath = path4.join(tmpDir, `chunk_${chunkIndex}`);
    fs4.writeFileSync(chunkPath, buffer);
    if (chunkIndex === totalChunks - 1) {
      const readPromises = [];
      for (let i = 0; i < totalChunks; i++) {
        const p = path4.join(tmpDir, `chunk_${i}`);
        if (!fs4.existsSync(p)) {
          return c.json({
            data: { chunkIndex, status: "pending" },
            error: null
          });
        }
        readPromises.push(fs4.promises.readFile(p));
      }
      const assembledChunks = await Promise.all(readPromises);
      const completeBuffer = Buffer.concat(assembledChunks);
      const { data, error } = await serverStorage.upload(
        bucket,
        filePath,
        completeBuffer
      );
      try {
        fs4.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
      }
      if (error) {
        return c.json({ error: error.message }, 500);
      }
      return c.json({ data, error: null });
    }
    return c.json({ data: { chunkIndex, status: "uploaded" }, error: null });
  } catch (err) {
    return c.json({ error: err.message || "Chunk upload failed" }, 500);
  }
});
storageRouter.post("/list/:bucket", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const prefixPath = body.path || "";
    const { data, error } = await serverStorage.list(bucket, prefixPath);
    if (error) {
      return c.json({ data: [], error: error.message });
    }
    return c.json({ data, error: null });
  } catch (err) {
    return c.json({ data: [], error: err.message });
  }
});
storageRouter.delete("/remove/:bucket", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const paths = body.paths || [];
    const user = c.get("user");
    const allowedPaths = paths.filter((p) => {
      try {
        const clean = sanitizePath(p);
        return clean.startsWith(user.id + "/") || user.role === "admin" || String(user.id) === "1";
      } catch {
        return false;
      }
    });
    const { data, error } = await serverStorage.remove(bucket, allowedPaths);
    if (error) {
      return c.json({ data: [], error: error.message }, 500);
    }
    return c.json({ data, error: null });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});
storageRouter.get("/download/:bucket/*", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath = c.req.param("*") || c.req.path.split(`/download/${bucket}/`)[1];
    let filePath;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }
    const { data, error } = await serverStorage.download(bucket, filePath);
    if (error || !data) {
      return c.text("Not found", 404);
    }
    const mimeType = getMimeType(filePath);
    const rangeHeader = c.req.header("range");
    const totalSize = data.length;
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      if (!isNaN(start) && start < totalSize) {
        const chunkEnd = Math.min(end, totalSize - 1);
        const chunk = data.subarray(start, chunkEnd + 1);
        return c.body(chunk, 206, {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${chunkEnd}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Content-Disposition": `inline; filename="${encodeURIComponent(filePath.split("/").pop() || "file")}"`
        });
      }
    }
    return c.body(data, 200, {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(totalSize),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filePath.split("/").pop() || "file")}"`
    });
  } catch (err) {
    return c.text("Error downloading file", 500);
  }
});
storageRouter.get("/public/:bucket/*", async (c) => {
  try {
    const bucket = c.req.param("bucket");
    let rawFilePath = c.req.param("*") || c.req.path.split(`/public/${bucket}/`)[1];
    let filePath;
    try {
      filePath = sanitizePath(rawFilePath);
    } catch {
      return c.json({ error: "Invalid path" }, 400);
    }
    const { data, error } = await serverStorage.download(bucket, filePath);
    if (error || !data) {
      return c.text("Not found", 404);
    }
    const mimeType = getMimeType(filePath);
    const rangeHeader = c.req.header("range");
    const totalSize = data.length;
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      if (!isNaN(start) && start < totalSize) {
        const chunkEnd = Math.min(end, totalSize - 1);
        const chunk = data.subarray(start, chunkEnd + 1);
        return c.body(chunk, 206, {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${chunkEnd}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Cache-Control": "public, max-age=31536000, immutable"
        });
      }
    }
    return c.body(data, 200, {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(totalSize),
      "Cache-Control": "public, max-age=31536000, immutable"
    });
  } catch (err) {
    return c.text("Error reading public asset", 500);
  }
});
storageRouter.post("/signed-urls/:bucket", authMiddleware, async (c) => {
  try {
    const bucket = c.req.param("bucket");
    const body = await c.req.json().catch(() => ({}));
    const paths = body.paths || [];
    const token = c.get("token");
    const result = paths.map((p) => {
      try {
        const clean = sanitizePath(p);
        return {
          error: null,
          signedUrl: serverStorage.createSignedUrl(bucket, clean, token)
        };
      } catch {
        return {
          error: "Invalid path",
          signedUrl: null
        };
      }
    });
    return c.json({ data: result, error: null });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// server/routes/agentSearch.ts
import { Hono as Hono11 } from "hono";
init_auth();
init_dataStore();
var agentSearchRouter = new Hono11();
var HORDE_URL = "https://oai.stablehorde.net/v1/chat/completions";
var HORDE_FAST_MODEL = "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M";
var CLOUDFLARE_SMART_MODEL = "@cf/nvidia/nemotron-3-120b-a12b";
var HORDE_MODELS_MAP2 = {
  TitleGen: ["koboldcpp/Llama-3.2-1B-Instruct"],
  Fast: ["koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M"],
  Smart: ["aphrodite/TheDrummer/Behemoth-X-123B-v2.1"]
};
function resolveHordeModel(model) {
  return HORDE_MODELS_MAP2[model]?.[0] || model;
}
var MAX_RESEARCH_ROUNDS = 100;
var MAX_TOTAL_CONTEXT_TOKENS = 4e3;
var MAX_TOTAL_CONTEXT_CHARS = MAX_TOTAL_CONTEXT_TOKENS * 4;
function extractBearerToken2(header) {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.*)$/i);
  return match ? match[1].trim() : null;
}
var BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1"
};
function decodeHtmlEntities2(text) {
  return text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(
    /&#x([0-9a-f]+);/gi,
    (_, hex) => String.fromCharCode(parseInt(hex, 16))
  ).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ");
}
function stripHtmlTags(input) {
  if (typeof input !== "string") return "";
  let text = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  const mainMatch = text.match(
    /<div id="mw-content-text"[^>]*>([\s\S]*?)<\/div>\s*<div class="printfooter"/i
  ) || text.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  if (mainMatch) {
    text = mainMatch[1];
  }
  let prev = "";
  do {
    prev = text;
    text = text.replace(/<[^<>]*>/g, " ");
  } while (text !== prev);
  return decodeHtmlEntities2(text).replace(/\s+/g, " ").trim();
}
function normalizeUrl(input) {
  if (typeof input !== "string") return null;
  let clean = input.trim();
  if (!clean) return null;
  const mdMatch = clean.match(/\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
  if (mdMatch) clean = mdMatch[1];
  clean = clean.replace(/^[<"'\`\(\[]+|[>"'\`\)\]]+$/g, "").trim();
  if (clean.includes("uddg=")) {
    try {
      const match = clean.match(/uddg=([^&]+)/);
      if (match) clean = decodeURIComponent(match[1]);
    } catch {
    }
  }
  if (!/^https?:\/\//i.test(clean)) {
    if (clean.startsWith("//")) {
      clean = "https:" + clean;
    } else {
      clean = "https://" + clean;
    }
  }
  if (clean.startsWith("http://")) {
    clean = "https://" + clean.slice(7);
  }
  return clean;
}
var SEARCH_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information. Returns text snippets and URLs from search results.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description: "Fetch and read the text content of a web page URL. Returns the page text (fits within the 4000 total token budget).",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The HTTPS URL of the page to fetch"
          }
        },
        required: ["url"]
      }
    }
  }
];
async function performWebSearch(query) {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(4e3)
      }
    );
    if (!res.ok) throw new Error("Search request failed");
    const html = await res.text();
    const snippets = [];
    const urls = [];
    const snippetRegex = /class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 10) {
      const cleanSnippet = stripHtmlTags(match[2]).trim();
      const normalizedHref = normalizeUrl(match[1]);
      if (cleanSnippet) {
        snippets.push(cleanSnippet);
        if (normalizedHref) urls.push(normalizedHref);
      }
    }
    if (urls.length === 0) {
      const urlRegex = /class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = urlRegex.exec(html)) !== null && urls.length < 10) {
        const normalizedHref = normalizeUrl(match[1]);
        if (normalizedHref) urls.push(normalizedHref);
      }
    }
    if (snippets.length === 0) {
      const genericSnippetRegex = /class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = genericSnippetRegex.exec(html)) !== null && snippets.length < 10) {
        const cleanSnippet = stripHtmlTags(match[1]).trim();
        if (cleanSnippet) snippets.push(cleanSnippet);
      }
    }
    return { snippets, urls };
  } catch (err) {
    return "Error: Failed to perform web search. The search engine might be blocking the request.";
  }
}
async function fetchPageContent(rawUrl, maxChars = 6e3) {
  const cleanUrl = normalizeUrl(rawUrl);
  if (!cleanUrl) {
    return "Error: Invalid URL.";
  }
  try {
    await validateAiUrl(cleanUrl);
  } catch (err) {
    return "Error: Invalid or blocked URL. Cannot fetch localhost or internal IPs.";
  }
  try {
    const res = await fetch(cleanUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6e3)
    });
    if (res.ok) {
      const text2 = await res.text();
      const clean = stripHtmlTags(text2);
      if (clean.length > 50) {
        return clean.substring(0, maxChars);
      }
    }
    if (cleanUrl.includes("/wiki/")) {
      try {
        const u = new URL(cleanUrl);
        const title = u.pathname.split("/wiki/")[1];
        if (title) {
          const apiEndpoints = [
            `${u.origin}/w/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
            `${u.origin}/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`,
            `${u.origin}/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
            `${u.origin}/w/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`
          ];
          try {
            const wikiContent = await Promise.any(
              apiEndpoints.map(async (endpoint) => {
                const apiRes = await fetch(endpoint, {
                  headers: {
                    "User-Agent": BROWSER_HEADERS["User-Agent"],
                    Accept: "application/json,text/html,*/*"
                  },
                  signal: AbortSignal.timeout(4e3)
                });
                if (apiRes.ok) {
                  const data = await apiRes.json();
                  if (data?.parse?.text?.["*"]) {
                    const parsedText = stripHtmlTags(data.parse.text["*"]);
                    if (parsedText.length > 50)
                      return parsedText.substring(0, maxChars);
                  }
                  const pages = data?.query?.pages || {};
                  for (const k in pages) {
                    if (pages[k]?.extract) {
                      return stripHtmlTags(pages[k].extract).substring(
                        0,
                        maxChars
                      );
                    }
                  }
                }
                throw new Error("No valid extract found from this endpoint");
              })
            );
            if (wikiContent) {
              return wikiContent;
            }
          } catch {
          }
        }
      } catch {
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return stripHtmlTags(text).substring(0, maxChars);
  } catch (err) {
    return `Error: Failed to fetch page content from ${cleanUrl} (${err.message || "network failed"}).`;
  }
}
function sseEvent(data) {
  return `data: ${data}

`;
}
function sseJson(obj) {
  return sseEvent(JSON.stringify(obj));
}
function getTotalResearchChars(searches, pages) {
  let total = 0;
  for (const s of searches) {
    if (s.snippets && Array.isArray(s.snippets)) {
      for (const snip of s.snippets) total += snip.length;
    }
  }
  for (const p of pages) {
    total += p.content.length;
  }
  return total;
}
function parseHordeAction(data) {
  if (!data) return null;
  const msg = data.result || data.choices?.[0]?.message;
  const toolCalls = msg?.tool_calls || data.tool_calls;
  if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    const tc = toolCalls[0];
    const name = tc.name || tc.function?.name || "";
    let args = {};
    const rawArgs = tc.arguments || tc.function?.arguments;
    if (typeof rawArgs === "string") {
      try {
        args = JSON.parse(rawArgs);
      } catch {
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs;
    }
    if (name) return { tool: name, args };
  }
  let content = "";
  if (typeof msg?.content === "string") {
    content = msg.content.trim();
  } else if (typeof data.content === "string") {
    content = data.content.trim();
  } else if (Array.isArray(data.content)) {
    content = data.content.map((c) => c.text || "").join("").trim();
  } else if (data.candidates?.[0]?.content?.parts) {
    content = data.candidates[0].content.parts.map((p) => p.text || "").join("").trim();
  } else if (typeof data.result === "string") {
    content = data.result.trim();
  } else if (data.result?.response) {
    content = data.result.response.trim();
  } else if (typeof data.response === "string") {
    content = data.response.trim();
  }
  if (!content) return null;
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const toolName = parsed.action || parsed.tool || parsed.name;
      if (toolName === "done" || toolName === "finish" || toolName === "none" || parsed.done === true) {
        return { tool: "done", args: {} };
      }
      if (toolName === "web_search" || toolName === "search" || toolName === "search_web") {
        return {
          tool: "web_search",
          args: { query: parsed.query || parsed.q || parsed.search || "" }
        };
      }
      if (toolName === "fetch_page" || toolName === "fetch" || toolName === "read_page" || toolName === "read") {
        return {
          tool: "fetch_page",
          args: { url: parsed.url || parsed.link || "" }
        };
      }
    }
  } catch {
  }
  if (/^(done|research complete|information gathered)/i.test(content)) {
    return { tool: "done", args: {} };
  }
  return null;
}
async function callModelProvider({
  provider,
  model,
  messages,
  stream = false,
  tools,
  userId,
  cloudflareId,
  cloudflareToken,
  hordeApiKey,
  signal
}) {
  let integration = null;
  if (userId) {
    try {
      const ints = queryTable({
        table: "user_integrations",
        userId,
        filters: [{ field: "provider", operator: "eq", value: provider }]
      });
      if (Array.isArray(ints) && ints[0]) {
        integration = ints[0];
      }
    } catch {
    }
  }
  const apiKey = integration?.api_key;
  if (!apiKey && provider !== "horde" && !provider.includes("horde") && provider !== "cloudflare") {
    throw new Error(
      `Provider '${provider}' is not configured. Please configure an API key in Integrations.`
    );
  }
  let targetUrl = "";
  let requestBody = { stream, tools };
  const headers = {
    "Content-Type": "application/json"
  };
  if (provider === "horde" || provider.includes("horde")) {
    const actualModel = resolveHordeModel(model);
    const hordeRequestBody = {
      model: actualModel,
      messages,
      tools,
      temperature: 0.2,
      max_tokens: tools ? 200 : 2048
    };
    const hordeHeaders = {
      ...headers,
      Authorization: `Bearer ${hordeApiKey || apiKey || "0000000000"}`
    };
    let res2;
    if (stream) {
      res2 = await streamHordeWithContinuation({
        targetUrl: HORDE_URL,
        fetchHeaders: hordeHeaders,
        requestBody: hordeRequestBody,
        signal
      });
    } else {
      res2 = await fetchHordeNonStreamWithContinuation({
        targetUrl: HORDE_URL,
        fetchHeaders: hordeHeaders,
        requestBody: hordeRequestBody,
        signal
      });
    }
    if (!res2.ok) {
      const errText = await res2.text().catch(() => "");
      throw new Error(
        `AI provider (${provider}) error: HTTP ${res2.status}${errText ? ` - ${errText.slice(0, 100)}` : ""}`
      );
    }
    return res2;
  } else if (provider === "cloudflare") {
    if (!cloudflareId || !cloudflareToken) {
      throw new Error("Cloudflare AI is temporarily unavailable.");
    }
    targetUrl = `https://api.cloudflare.com/client/v4/accounts/${cloudflareId}/ai/v1/chat/completions`;
    requestBody = {
      model,
      messages,
      stream,
      tools
    };
    headers["Authorization"] = `Bearer ${cloudflareToken}`;
  } else if (provider === "openai") {
    targetUrl = "https://api.openai.com/v1/chat/completions";
    requestBody = { ...requestBody, model, messages };
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "anthropic") {
    targetUrl = "https://api.anthropic.com/v1/messages";
    const systemMessages = messages.filter((m) => m.role === "system");
    const systemContent = systemMessages.map((m) => m.content).join("\n\n");
    const transformedMessages = messages.filter(
      (m) => m.role !== "system"
    );
    requestBody = {
      model,
      messages: transformedMessages,
      max_tokens: tools ? 300 : 4096,
      system: systemContent || void 0
    };
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider === "google") {
    const action = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
    targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}key=${apiKey}`;
    requestBody = {
      systemInstruction: {
        parts: messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }))
      },
      contents: messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
      tools: tools ? tools.map((t) => ({ function_declarations: [t.function] })) : void 0
    };
  } else if (provider === "openrouter") {
    targetUrl = "https://openrouter.ai/api/v1/chat/completions";
    requestBody = { ...requestBody, model, messages };
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "grok") {
    targetUrl = "https://api.x.ai/v1/chat/completions";
    requestBody = { ...requestBody, model, messages };
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    throw new Error(`Unsupported provider '${provider}'.`);
  }
  const res = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `AI provider (${provider}) error: HTTP ${res.status}${errText ? ` - ${errText.slice(0, 100)}` : ""}`
    );
  }
  return res;
}
agentSearchRouter.post(
  "/",
  rateLimiter(10, 6e4, "agent-search"),
  async (c) => {
    try {
      let buildResearchContext = function() {
        let researchContext = "";
        if (allSearches.length > 0) {
          researchContext += "\n--- WEB SEARCH RESULTS ---\n";
          for (let idx = 0; idx < allSearches.length; idx++) {
            const s = allSearches[idx];
            let block = `
[Search #${idx + 1}: "${s.query}"]
`;
            if (s.snippets && Array.isArray(s.snippets)) {
              s.snippets.forEach((snip, sIdx) => {
                const url = s.urls?.[sIdx] ? ` (Source: ${s.urls[sIdx]})` : "";
                block += `- ${snip}${url}
`;
              });
            } else if (s.error) {
              block += `- (Search error: ${s.error})
`;
            }
            if ((researchContext + block).length > MAX_TOTAL_CONTEXT_CHARS) {
              const available = Math.max(
                0,
                MAX_TOTAL_CONTEXT_CHARS - researchContext.length
              );
              researchContext += block.substring(0, available);
              break;
            }
            researchContext += block;
          }
        }
        if (fetchedPages.length > 0 && researchContext.length < MAX_TOTAL_CONTEXT_CHARS) {
          researchContext += "\n--- WEBPAGES READ ---\n";
          for (let idx = 0; idx < fetchedPages.length; idx++) {
            const p = fetchedPages[idx];
            const block = `
[Webpage #${idx + 1}: ${p.url}]
${p.content}
`;
            if ((researchContext + block).length > MAX_TOTAL_CONTEXT_CHARS) {
              const available = Math.max(
                0,
                MAX_TOTAL_CONTEXT_CHARS - researchContext.length
              );
              researchContext += block.substring(0, available);
              break;
            }
            researchContext += block;
          }
        }
        return researchContext;
      }, buildSynthesisMessages = function() {
        const researchContext = buildResearchContext();
        const systemPrompt = `You are an expert research synthesizer. Using the gathered real-time web research findings below (capped at 4000 total context tokens), synthesize a high-quality, comprehensive, and well-structured response in the requested format.

Requested response format: ${responseFormat}

Guidelines:
- Base your response on the provided research findings.
- Be accurate, clear, and cite sources where relevant.
- Follow the requested format: ${responseFormat}.`;
        const userContent = [
          {
            type: "text",
            text: `User Query: ${query}

${researchContext || "No external search results found."}`
          }
        ];
        for (const imgB64 of userImages) {
          userContent.push({ type: "image", image: imgB64 });
        }
        return [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: userContent.length === 1 ? userContent[0].text : userContent
          }
        ];
      };
      const authHeader = c.req.header("Authorization");
      const token = extractBearerToken2(authHeader);
      if (!token)
        return c.json({ error: "Missing or invalid authorization token" }, 401);
      const user = await resolveUserFromToken(token);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      let body;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON" }, 400);
      }
      const {
        query,
        responseFormat,
        images,
        stream = true,
        researchOnly = false,
        researchModel,
        researchProvider,
        summarizerModel,
        summarizerProvider
      } = body;
      if (typeof query !== "string" || !query.trim()) {
        return c.json({ error: "query is required and must be a string" }, 400);
      }
      if (query.length > 1e3) {
        return c.json(
          { error: "query exceeds maximum length of 1000 characters" },
          400
        );
      }
      if (typeof responseFormat !== "string" || !responseFormat.trim()) {
        return c.json(
          { error: "responseFormat is required and must be a string" },
          400
        );
      }
      if (responseFormat.length > 100) {
        return c.json(
          { error: "responseFormat exceeds maximum length of 100 characters" },
          400
        );
      }
      if (images !== void 0) {
        if (!Array.isArray(images) || images.length > 5) {
          return c.json(
            { error: "images must be an array with a maximum of 5 items" },
            400
          );
        }
        for (const img of images) {
          if (!img || typeof img.data !== "string") {
            return c.json({ error: "invalid image format" }, 400);
          }
          if (img.data.length > 10 * 1024 * 1024) {
            return c.json(
              { error: "image data exceeds maximum size of 10MB" },
              400
            );
          }
        }
      }
      let userPrefs = {};
      try {
        const prefs = queryTable({
          table: "user_preferences",
          userId: user.id
        });
        if (Array.isArray(prefs) && prefs[0]) {
          userPrefs = prefs[0];
        }
      } catch {
      }
      const effectiveResearchModel = typeof researchModel === "string" && researchModel.trim() || userPrefs.research_agent_default_model || userPrefs.research_agent_model_id || HORDE_FAST_MODEL;
      const effectiveResearchProvider = typeof researchProvider === "string" && researchProvider.trim() || userPrefs.research_agent_default_provider || userPrefs.research_agent_provider || "horde";
      const effectiveSummarizerModel = typeof summarizerModel === "string" && summarizerModel.trim() || userPrefs.research_summarizer_default_model || userPrefs.research_summarizer_model_id || CLOUDFLARE_SMART_MODEL;
      const effectiveSummarizerProvider = typeof summarizerProvider === "string" && summarizerProvider.trim() || userPrefs.research_summarizer_default_provider || userPrefs.research_summarizer_provider || "cloudflare";
      const rawEnv = c.env || {};
      let cloudflareId = "";
      let cloudflareToken = "";
      for (const [key, value] of Object.entries(rawEnv)) {
        const cleanKey = key.trim().toLowerCase();
        if (cleanKey === "cloudflare_id")
          cloudflareId = value.trim();
        if (cleanKey === "cloudflare_token")
          cloudflareToken = value.trim();
      }
      const procEnv = typeof process !== "undefined" ? process.env : {};
      if (!cloudflareId) cloudflareId = (procEnv.CLOUDFLARE_ID || "").trim();
      if (!cloudflareToken)
        cloudflareToken = (procEnv.CLOUDFLARE_TOKEN || "").trim();
      if ((effectiveResearchProvider === "cloudflare" || !researchOnly && effectiveSummarizerProvider === "cloudflare") && (!cloudflareId || !cloudflareToken)) {
        return c.json(
          { error: "Agent search is temporarily unavailable" },
          500
        );
      }
      if (effectiveResearchProvider !== "horde" && !effectiveResearchProvider.includes("horde") && effectiveResearchProvider !== "cloudflare") {
        let intg = null;
        try {
          const ints = queryTable({
            table: "user_integrations",
            userId: user.id,
            filters: [
              {
                field: "provider",
                operator: "eq",
                value: effectiveResearchProvider
              }
            ]
          });
          if (Array.isArray(ints) && ints[0]?.api_key) intg = ints[0];
        } catch {
        }
        if (!intg) {
          return c.json(
            {
              error: `Provider '${effectiveResearchProvider}' is not configured. Please configure an API key in Integrations.`
            },
            400
          );
        }
      }
      if (!researchOnly && effectiveSummarizerProvider !== "horde" && !effectiveSummarizerProvider.includes("horde") && effectiveSummarizerProvider !== "cloudflare") {
        let intg = null;
        try {
          const ints = queryTable({
            table: "user_integrations",
            userId: user.id,
            filters: [
              {
                field: "provider",
                operator: "eq",
                value: effectiveSummarizerProvider
              }
            ]
          });
          if (Array.isArray(ints) && ints[0]?.api_key) intg = ints[0];
        } catch {
        }
        if (!intg) {
          return c.json(
            {
              error: `Provider '${effectiveSummarizerProvider}' is not configured. Please configure an API key in Integrations.`
            },
            400
          );
        }
      }
      let hordeApiKey = "0000000000";
      try {
        const hordeInts = queryTable({
          table: "user_integrations",
          userId: user.id,
          filters: [{ field: "provider", operator: "eq", value: "horde" }]
        });
        if (Array.isArray(hordeInts) && hordeInts[0]?.api_key) {
          hordeApiKey = hordeInts[0].api_key;
        }
      } catch {
      }
      let userImages = [];
      if (images) {
        const imagePromises = images.map(async (img) => {
          if (img.data.startsWith("https://")) {
            try {
              const imgRes = await fetch(img.data, {
                signal: AbortSignal.timeout(8e3)
              });
              if (imgRes.ok) {
                const buf = await imgRes.arrayBuffer();
                return Buffer.from(buf).toString("base64");
              }
            } catch {
            }
            return null;
          } else {
            return img.data;
          }
        });
        const results = await Promise.all(imagePromises);
        userImages = results.filter((res) => res !== null);
      }
      const allSearches = [];
      const fetchedPages = [];
      const researchMessages = [
        {
          role: "system",
          content: `You are an autonomous research agent. Your goal is to gather facts from the web to answer the user's query up to a 4000 total context token budget.

Available actions (respond ONLY with a single JSON object):
1. Search the web:
{"action": "web_search", "query": "<search query>"}

2. Fetch and read a webpage:
{"action": "fetch_page", "url": "https://..."}

3. Finished research (enough facts gathered):
{"action": "done"}`
        },
        {
          role: "user",
          content: `Research topic: "${query}". What is your first research action?`
        }
      ];
      if (!stream) {
        for (let i = 0; i < MAX_RESEARCH_ROUNDS; i++) {
          if (getTotalResearchChars(allSearches, fetchedPages) >= MAX_TOTAL_CONTEXT_CHARS) {
            break;
          }
          let action = null;
          try {
            const res = await callModelProvider({
              provider: effectiveResearchProvider,
              model: effectiveResearchModel,
              messages: researchMessages,
              tools: SEARCH_TOOLS,
              userId: user.id,
              cloudflareId,
              cloudflareToken,
              hordeApiKey,
              signal: AbortSignal.timeout(1e4)
            });
            const data = await res.json();
            action = parseHordeAction(data);
          } catch {
            if (i === 0) {
              action = { tool: "web_search", args: { query } };
            } else {
              break;
            }
          }
          if (!action || action.tool === "done") {
            break;
          }
          let toolResult;
          if (action.tool === "web_search") {
            const searchRes = await performWebSearch(
              action.args.query || query
            );
            if (typeof searchRes === "string") {
              allSearches.push({
                query: action.args.query || query,
                error: searchRes
              });
            } else {
              allSearches.push({
                query: action.args.query || query,
                ...searchRes
              });
            }
            toolResult = searchRes;
          } else if (action.tool === "fetch_page") {
            const currentTotal = getTotalResearchChars(
              allSearches,
              fetchedPages
            );
            const remainingBudget = Math.max(
              1e3,
              MAX_TOTAL_CONTEXT_CHARS - currentTotal
            );
            const pageRes = await fetchPageContent(
              action.args.url,
              remainingBudget
            );
            if (typeof pageRes === "string" && !pageRes.startsWith("Error:")) {
              fetchedPages.push({ url: action.args.url, content: pageRes });
            }
            toolResult = pageRes;
          } else {
            toolResult = "Error: Unknown tool";
          }
          researchMessages.push({
            role: "assistant",
            content: JSON.stringify({ action: action.tool, ...action.args })
          });
          researchMessages.push({
            role: "user",
            content: `Tool result for ${action.tool}:
${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}

Next action? (Respond with JSON action or {"action": "done"})`
          });
          if (researchMessages.length > 16) {
            researchMessages.splice(2, researchMessages.length - 16);
          }
        }
        if (allSearches.length === 0) {
          const directSearch = await performWebSearch(query);
          if (typeof directSearch !== "string") {
            allSearches.push({ query, ...directSearch });
          }
        }
        const researchContext = buildResearchContext();
        if (researchOnly) {
          return c.json({
            result: researchContext,
            context: researchContext,
            searches: allSearches,
            pages: fetchedPages,
            totalPointsUsed: 0
          });
        }
        const synthMsgs = buildSynthesisMessages();
        let synthRes;
        try {
          synthRes = await callModelProvider({
            provider: effectiveSummarizerProvider,
            model: effectiveSummarizerModel,
            messages: synthMsgs,
            stream: false,
            userId: user.id,
            cloudflareId,
            cloudflareToken,
            hordeApiKey,
            signal: AbortSignal.timeout(6e4)
          });
        } catch (e) {
          return c.json({ error: e?.message || "Search synthesis error" }, 502);
        }
        const synthData = await synthRes.json();
        let finalResult = "";
        const finalMsg = synthData.result || synthData.choices?.[0]?.message;
        if (typeof finalMsg?.content === "string") {
          finalResult = finalMsg.content;
        } else if (typeof synthData.content === "string") {
          finalResult = synthData.content;
        } else if (Array.isArray(synthData.content)) {
          finalResult = synthData.content.map((item) => item.text || "").join("");
        } else if (synthData.candidates?.[0]?.content?.parts) {
          finalResult = synthData.candidates[0].content.parts.map((p) => p.text || "").join("");
        } else if (typeof synthData.result === "string") {
          finalResult = synthData.result;
        } else if (synthData.result?.response) {
          finalResult = synthData.result.response;
        } else if (typeof synthData.response === "string") {
          finalResult = synthData.response;
        }
        let p_amount = 0;
        if (effectiveSummarizerProvider === "cloudflare") {
          const usage = synthData.usage || {};
          const synthInputTokens = usage.prompt_tokens || Math.floor(JSON.stringify(synthMsgs).length / 4);
          const synthOutputTokens = usage.completion_tokens || Math.floor(finalResult.length / 4);
          const totalTokens = synthInputTokens + synthOutputTokens;
          p_amount = Math.max(10, Math.floor(totalTokens / 10));
          const rpcRes = callRpc("spend_points", { p_amount }, user.id);
          if (!rpcRes || !rpcRes.success) {
            console.error("Agent search points deduction failed", rpcRes);
          }
        }
        return c.json({
          result: finalResult,
          searches: allSearches,
          totalPointsUsed: p_amount
        });
      }
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const write = (s) => writer.write(encoder.encode(s));
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      const streamLoop = async () => {
        try {
          await write(
            sseJson({
              type: "status",
              message: "Connecting to research agent..."
            })
          );
          for (let i = 0; i < MAX_RESEARCH_ROUNDS; i++) {
            if (getTotalResearchChars(allSearches, fetchedPages) >= MAX_TOTAL_CONTEXT_CHARS) {
              await write(
                sseJson({
                  type: "status",
                  message: "4000 total context token research limit reached. Synthesizing results..."
                })
              );
              break;
            }
            await write(
              sseJson({
                type: "status",
                message: i === 0 ? "Formulating research query and planning search strategy..." : `Analyzing findings & planning next research step (Round ${i + 1}/${MAX_RESEARCH_ROUNDS})...`
              })
            );
            let action = null;
            try {
              const res = await callModelProvider({
                provider: effectiveResearchProvider,
                model: effectiveResearchModel,
                messages: researchMessages,
                tools: SEARCH_TOOLS,
                userId: user.id,
                cloudflareId,
                cloudflareToken,
                hordeApiKey,
                signal: AbortSignal.timeout(1e4)
              });
              const data = await res.json();
              action = parseHordeAction(data);
            } catch (modelErr) {
              console.warn(
                "Research model call timed out or failed, falling back to direct search",
                modelErr
              );
              if (i === 0) {
                action = { tool: "web_search", args: { query } };
              } else {
                break;
              }
            }
            if (!action || action.tool === "done") {
              break;
            }
            let toolResult;
            await write(
              sseJson({
                type: "tool_call",
                name: action.tool,
                args: action.args
              })
            );
            if (action.tool === "web_search") {
              const searchQuery = action.args.query || query;
              await write(
                sseJson({
                  type: "status",
                  message: `Searching web for: "${searchQuery}"...`
                })
              );
              const searchRes = await performWebSearch(searchQuery);
              if (typeof searchRes === "string") {
                allSearches.push({ query: searchQuery, error: searchRes });
              } else {
                allSearches.push({ query: searchQuery, ...searchRes });
              }
              toolResult = searchRes;
              const snippetCount = typeof searchRes === "object" && searchRes.snippets ? searchRes.snippets.length : 0;
              await write(
                sseJson({
                  type: "status",
                  message: typeof searchRes === "string" ? "Search completed. Analyzing findings..." : `Found ${snippetCount} search results for "${searchQuery}". Processing insights...`
                })
              );
            } else if (action.tool === "fetch_page") {
              await write(
                sseJson({
                  type: "status",
                  message: `Fetching and reading webpage: ${action.args.url}...`
                })
              );
              const currentTotal = getTotalResearchChars(
                allSearches,
                fetchedPages
              );
              const remainingBudget = Math.max(
                1e3,
                MAX_TOTAL_CONTEXT_CHARS - currentTotal
              );
              const pageRes = await fetchPageContent(
                action.args.url,
                remainingBudget
              );
              if (typeof pageRes === "string" && !pageRes.startsWith("Error:")) {
                fetchedPages.push({ url: action.args.url, content: pageRes });
              }
              toolResult = pageRes;
              await write(
                sseJson({
                  type: "status",
                  message: typeof toolResult === "string" && toolResult.startsWith("Error:") ? "Webpage read attempt completed. Continuing research..." : `Successfully read page content. Extracting key data...`
                })
              );
            } else {
              toolResult = "Error: Unknown tool";
            }
            await write(
              sseJson({
                type: "tool_result",
                name: action.tool,
                result: toolResult
              })
            );
            researchMessages.push({
              role: "assistant",
              content: JSON.stringify({ action: action.tool, ...action.args })
            });
            researchMessages.push({
              role: "user",
              content: `Tool result for ${action.tool}:
${typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)}

Next action? (Respond with JSON action or {"action": "done"})`
            });
            if (researchMessages.length > 16) {
              researchMessages.splice(2, researchMessages.length - 16);
            }
          }
          if (allSearches.length === 0) {
            await write(
              sseJson({
                type: "tool_call",
                name: "web_search",
                args: { query }
              })
            );
            await write(
              sseJson({
                type: "status",
                message: `Searching web for: "${query}"...`
              })
            );
            const directSearch = await performWebSearch(query);
            if (typeof directSearch === "string") {
              allSearches.push({ query, error: directSearch });
            } else {
              allSearches.push({ query, ...directSearch });
            }
            await write(
              sseJson({
                type: "tool_result",
                name: "web_search",
                result: directSearch
              })
            );
          }
          const researchContext = buildResearchContext();
          if (researchOnly) {
            await write(
              sseJson({
                type: "research_complete",
                context: researchContext,
                searches: allSearches,
                pages: fetchedPages
              })
            );
            await write(
              sseJson({
                type: "result",
                content: researchContext,
                searches: allSearches,
                totalPointsUsed: 0
              })
            );
            await write(sseEvent("[DONE]"));
            return;
          }
          await write(
            sseJson({
              type: "status",
              message: "Synthesizing comprehensive final answer..."
            })
          );
          const synthMsgs = buildSynthesisMessages();
          let streamRes;
          try {
            streamRes = await callModelProvider({
              provider: effectiveSummarizerProvider,
              model: effectiveSummarizerModel,
              messages: synthMsgs,
              stream: true,
              userId: user.id,
              cloudflareId,
              cloudflareToken,
              hordeApiKey,
              signal: AbortSignal.timeout(6e4)
            });
          } catch (e) {
            await write(
              sseJson({
                type: "error",
                message: e?.message || "Search synthesis error"
              })
            );
            return;
          }
          if (!streamRes.body) {
            await write(
              sseJson({ type: "error", message: "Empty synthesis stream" })
            );
            return;
          }
          const reader = streamRes.body.getReader();
          const decoder = new TextDecoder();
          let finalContent = "";
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (let line of lines) {
              line = line.trim();
              if (line === "data: [DONE]") continue;
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.substring(6));
                  const token2 = parsed.response || parsed.choices?.[0]?.delta?.content || parsed.delta?.text || parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                  if (token2) {
                    finalContent += token2;
                    await write(sseJson({ type: "delta", content: token2 }));
                  }
                } catch (e) {
                }
              }
            }
          }
          let p_amount = 0;
          if (effectiveSummarizerProvider === "cloudflare") {
            const synthInputTokens = Math.floor(
              JSON.stringify(synthMsgs).length / 4
            );
            const synthOutputTokens = Math.floor(finalContent.length / 4);
            const estimatedTokens = synthInputTokens + synthOutputTokens;
            p_amount = Math.max(10, Math.floor(estimatedTokens / 10));
            const rpcRes = callRpc("spend_points", { p_amount }, user.id);
            if (!rpcRes || !rpcRes.success) {
              console.error("Agent search points deduction failed", rpcRes);
            }
          }
          await write(
            sseJson({
              type: "result",
              content: finalContent,
              searches: allSearches,
              totalPointsUsed: p_amount
            })
          );
          await write(sseEvent("[DONE]"));
        } catch (err) {
          await write(
            sseJson({ type: "error", message: "Internal server error" })
          );
        } finally {
          writer.close();
        }
      };
      streamLoop();
      return new Response(readable);
    } catch (err) {
      console.error("Agent Search 500 Error:", err);
      return c.json(
        {
          error: "Internal server error",
          details: err instanceof Error ? err.message : String(err)
        },
        500
      );
    }
  }
);

// server/routes/auth.ts
init_dataStore();
init_auth();
import { Hono as Hono12 } from "hono";
var authRouter = new Hono12();
authRouter.post("/register", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { username, email, password } = body;
    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return c.json(
        { error: "Username must be at least 3 characters long" },
        400
      );
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return c.json({ error: "A valid email address is required" }, 400);
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return c.json(
        { error: "Password must be at least 6 characters long" },
        400
      );
    }
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const existing = getUserByUsernameOrEmail(cleanUsername) || getUserByUsernameOrEmail(cleanEmail);
    if (existing) {
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return c.json({ error: "Username is already taken" }, 400);
      }
      return c.json({ error: "Email is already registered" }, 400);
    }
    const userId = getNextUserId();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const role = String(userId) === "1" ? "admin" : "user";
    const user = initUserFolder(userId, {
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      salt,
      role
    });
    const token = generateToken(user);
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        user_metadata: {
          username: user.username,
          full_name: user.username,
          role: user.role
        }
      }
    };
    return c.json({
      user: session.user,
      token,
      session,
      error: null
    });
  } catch (err) {
    return c.json({ error: err.message || "Registration failed" }, 500);
  }
});
authRouter.post("/login", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { login, password } = body;
    if (!login || !password) {
      return c.json({ error: "Username/email and password are required" }, 400);
    }
    const user = getUserByUsernameOrEmail(login);
    if (!user) {
      return c.json({ error: "Invalid username or password" }, 400);
    }
    const valid = verifyPassword(password, user.password_hash, user.salt);
    if (!valid) {
      return c.json({ error: "Invalid username or password" }, 400);
    }
    const token = generateToken(user);
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: String(user.id) === "1" ? "admin" : user.role || "user",
        user_metadata: {
          username: user.username,
          full_name: user.username,
          role: String(user.id) === "1" ? "admin" : user.role || "user"
        }
      }
    };
    return c.json({
      user: session.user,
      token,
      session,
      error: null
    });
  } catch (err) {
    return c.json({ error: err.message || "Login failed" }, 500);
  }
});
authRouter.get("/session", async (c) => {
  try {
    let token = c.req.header("Authorization")?.replace(/^Bearer /i, "");
    if (!token) {
      token = c.req.query("token");
    }
    if (!token) {
      return c.json({ session: null, user: null });
    }
    const user = await resolveUserFromToken(token);
    if (!user) {
      return c.json({ session: null, user: null });
    }
    const profile = getProfileByUserId(user.id);
    return c.json({
      session: {
        access_token: token,
        token_type: "bearer",
        user
      },
      user: {
        ...user,
        profile
      }
    });
  } catch (err) {
    return c.json({ session: null, user: null, error: err.message });
  }
});
authRouter.post("/logout", async (c) => {
  return c.json({ success: true });
});

// server/routes/data.ts
init_dataStore();
init_auth();
import { Hono as Hono13 } from "hono";
var dataRouter = new Hono13();
dataRouter.post("/query", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const {
      table,
      filters,
      orFilters,
      order,
      limit,
      offset,
      single,
      select,
      count: countType,
      head
    } = body;
    if (!table) {
      return c.json({ data: null, error: "Table name is required" }, 400);
    }
    let userId;
    const authHeader = c.req.header("Authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace(/^Bearer /i, "");
        const user = await Promise.resolve().then(() => (init_auth(), auth_exports)).then(
          (m) => m.resolveUserFromToken(token)
        );
        if (user) {
          userId = user.id;
        }
      } catch {
      }
    }
    const result = queryTable({
      table,
      filters,
      orFilters,
      order,
      limit,
      offset,
      single,
      userId,
      select,
      head
    });
    if (head && result && typeof result === "object" && "count" in result) {
      return c.json({ data: result.data, count: result.count, error: null });
    }
    let countVal = null;
    if (countType) {
      const allMatching = queryTable({
        table,
        filters,
        orFilters,
        userId
      });
      countVal = Array.isArray(allMatching) ? allMatching.length : 0;
    }
    return c.json({ data: result, count: countVal, error: null });
  } catch (err) {
    return c.json({ data: null, error: err.message || "Query failed" }, 500);
  }
});
dataRouter.post("/insert", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, data } = body;
    const userId = c.get("userId");
    if (!table || data === void 0) {
      return c.json({ data: null, error: "Table and data are required" }, 400);
    }
    const result = insertTable(table, data, userId);
    return c.json({ data: result, error: null });
  } catch (err) {
    return c.json({ data: null, error: err.message || "Insert failed" }, 500);
  }
});
dataRouter.post("/update", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, filters = [], orFilters = [], data } = body;
    const userId = c.get("userId");
    if (!table || data === void 0) {
      return c.json({ data: null, error: "Table and data are required" }, 400);
    }
    const result = updateTable(table, filters, data, userId, orFilters);
    return c.json({ data: result, error: null });
  } catch (err) {
    return c.json({ data: null, error: err.message || "Update failed" }, 500);
  }
});
dataRouter.post("/upsert", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, data, onConflict } = body;
    const userId = c.get("userId");
    if (!table || data === void 0) {
      return c.json({ data: null, error: "Table and data are required" }, 400);
    }
    const result = upsertTable(table, data, userId, onConflict);
    return c.json({ data: result, error: null });
  } catch (err) {
    return c.json({ data: null, error: err.message || "Upsert failed" }, 500);
  }
});
dataRouter.post("/delete", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, filters = [], orFilters = [] } = body;
    const userId = c.get("userId");
    if (!table) {
      return c.json({ data: null, error: "Table is required" }, 400);
    }
    const result = deleteTable(table, filters, userId, orFilters);
    return c.json({ data: result, error: null });
  } catch (err) {
    return c.json({ data: null, error: err.message || "Delete failed" }, 500);
  }
});
dataRouter.post("/rpc", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { fn, args = {} } = body;
    if (!fn) {
      return c.json({ data: null, error: "Function name is required" }, 400);
    }
    let userId;
    const authHeader = c.req.header("Authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace(/^Bearer /i, "");
        const user = await Promise.resolve().then(() => (init_auth(), auth_exports)).then(
          (m) => m.resolveUserFromToken(token)
        );
        if (user) {
          userId = user.id;
        }
      } catch {
      }
    }
    const data = callRpc(fn, args, userId);
    return c.json({ data, error: null });
  } catch (err) {
    return c.json({ data: null, error: err.message || "RPC failed" }, 500);
  }
});

// server/routes/surveys.ts
init_auth();
import { Hono as Hono14 } from "hono";
import crypto8 from "node:crypto";

// server/lib/surveys.ts
init_dataStore();
import fs5 from "node:fs";
import path5 from "node:path";
import crypto7 from "node:crypto";
var SURVEYS_DIR = path5.join(DATA_DIR, "surveys");
function ensureSurveysDir() {
  if (!fs5.existsSync(SURVEYS_DIR)) {
    fs5.mkdirSync(SURVEYS_DIR, { recursive: true });
  }
}
function getCurrentMonthKey(date = /* @__PURE__ */ new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
function getDaysRemainingInCurrentMonth(date = /* @__PURE__ */ new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const currentDay = date.getUTCDate();
  return Math.max(0, lastDay - currentDay);
}
var DEFINITIONS_FILE = path5.join(SURVEYS_DIR, "definitions.json");
var RESPONSES_FILE = path5.join(SURVEYS_DIR, "responses.json");
var SUBMISSIONS_FILE = path5.join(SURVEYS_DIR, "submissions.json");
var MONTHLY_HISTORY_FILE = path5.join(SURVEYS_DIR, "monthly_history.json");
function getPast12MonthKeys(refDate = /* @__PURE__ */ new Date()) {
  const months = [];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = `${monthNames[m]} '${String(y).slice(-2)}`;
    months.push({ key, label });
  }
  return months;
}
function readJson(filePath, fallback) {
  try {
    if (!fs5.existsSync(filePath)) return fallback;
    const content = fs5.readFileSync(filePath, "utf-8").trim();
    if (!content) return fallback;
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function writeJson(filePath, data) {
  ensureSurveysDir();
  const tempPath = `${filePath}.${crypto7.randomUUID()}.tmp`;
  fs5.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs5.renameSync(tempPath, filePath);
}
var PREDEFINED_SURVEYS = [
  {
    id: "monthly-hardware-survey",
    titleKey: "surveys.hardwareTitle",
    defaultTitle: "Hardware Survey",
    descriptionKey: "surveys.hardwareDesc",
    defaultDescription: "Monthly automated and community hardware survey to gather insights on gaming & developer configurations across Desktop, Web, and Mobile.",
    category: "Hardware",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    isHardwareSurvey: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    questions: [
      {
        id: "os",
        titleKey: "surveys.hardware.os",
        defaultTitle: "Operating System",
        type: "single_choice",
        required: true,
        options: [
          { value: "Windows 11", defaultLabel: "Windows 11" },
          { value: "Windows 10", defaultLabel: "Windows 10" },
          { value: "macOS", defaultLabel: "macOS" },
          { value: "Linux", defaultLabel: "Linux" },
          { value: "Android", defaultLabel: "Android" },
          { value: "iOS", defaultLabel: "iOS" },
          { value: "Other", defaultLabel: "Other" }
        ]
      },
      {
        id: "form_factor",
        titleKey: "surveys.hardware.formFactor",
        defaultTitle: "Device Form Factor",
        type: "single_choice",
        required: true,
        options: [
          { value: "Desktop PC", defaultLabel: "Desktop PC" },
          { value: "Laptop", defaultLabel: "Laptop" },
          { value: "Mobile Phone", defaultLabel: "Mobile Phone" },
          { value: "Tablet", defaultLabel: "Tablet" },
          { value: "Handheld / Console", defaultLabel: "Handheld / Console" },
          { value: "Other", defaultLabel: "Other" }
        ]
      },
      {
        id: "cpu_manufacturer",
        titleKey: "surveys.hardware.cpuManufacturer",
        defaultTitle: "CPU Manufacturer",
        type: "single_choice",
        required: true,
        options: [
          { value: "AMD", defaultLabel: "AMD" },
          { value: "Intel", defaultLabel: "Intel" },
          { value: "Apple", defaultLabel: "Apple (Apple Silicon)" },
          { value: "Qualcomm", defaultLabel: "Qualcomm" },
          { value: "MediaTek", defaultLabel: "MediaTek" },
          { value: "Other", defaultLabel: "Other" }
        ]
      },
      {
        id: "cpu_name",
        titleKey: "surveys.hardware.cpuName",
        defaultTitle: "CPU Model",
        type: "text",
        required: true,
        placeholder: "e.g., AMD Ryzen 7 7800X3D / Intel Core i7-14700K / Apple M3 Pro"
      },
      {
        id: "cpu_cores",
        titleKey: "surveys.hardware.cpuCores",
        defaultTitle: "CPU Physical/Logical Cores",
        type: "single_choice",
        required: true,
        options: [
          { value: "2", defaultLabel: "2 Cores" },
          { value: "4", defaultLabel: "4 Cores" },
          { value: "6", defaultLabel: "6 Cores" },
          { value: "8", defaultLabel: "8 Cores" },
          { value: "10", defaultLabel: "10 Cores" },
          { value: "12", defaultLabel: "12 Cores" },
          { value: "14", defaultLabel: "14 Cores" },
          { value: "16", defaultLabel: "16 Cores" },
          { value: "20+", defaultLabel: "20+ Cores" }
        ]
      },
      {
        id: "gpu_manufacturer",
        titleKey: "surveys.hardware.gpuManufacturer",
        defaultTitle: "GPU Manufacturer",
        type: "single_choice",
        required: true,
        options: [
          { value: "NVIDIA", defaultLabel: "NVIDIA" },
          { value: "AMD", defaultLabel: "AMD" },
          { value: "Intel", defaultLabel: "Intel" },
          { value: "Apple", defaultLabel: "Apple" },
          { value: "Qualcomm / Adreno", defaultLabel: "Qualcomm (Adreno)" },
          { value: "ARM / Mali", defaultLabel: "ARM (Mali)" },
          { value: "Other", defaultLabel: "Other" }
        ]
      },
      {
        id: "gpu_name",
        titleKey: "surveys.hardware.gpuName",
        defaultTitle: "GPU Model",
        type: "text",
        required: true,
        placeholder: "e.g., NVIDIA GeForce RTX 4080 / AMD Radeon RX 7800 XT / Apple M3 GPU"
      },
      {
        id: "ram_amount_gb",
        titleKey: "surveys.hardware.ramAmount",
        defaultTitle: "System RAM (Memory)",
        type: "single_choice",
        required: true,
        options: [
          { value: "4 GB or less", defaultLabel: "4 GB or less" },
          { value: "6 GB", defaultLabel: "6 GB" },
          { value: "8 GB", defaultLabel: "8 GB" },
          { value: "12 GB", defaultLabel: "12 GB" },
          { value: "16 GB", defaultLabel: "16 GB" },
          { value: "24 GB", defaultLabel: "24 GB" },
          { value: "32 GB", defaultLabel: "32 GB" },
          { value: "48 GB", defaultLabel: "48 GB" },
          { value: "64 GB", defaultLabel: "64 GB" },
          { value: "128 GB+", defaultLabel: "128 GB+" }
        ]
      },
      {
        id: "storage_total_gb",
        titleKey: "surveys.hardware.storageTotal",
        defaultTitle: "Total Primary Storage Capacity",
        type: "single_choice",
        required: true,
        options: [
          { value: "128 GB or less", defaultLabel: "128 GB or less" },
          { value: "256 GB", defaultLabel: "256 GB" },
          { value: "512 GB", defaultLabel: "512 GB" },
          { value: "1 TB (1000 GB)", defaultLabel: "1 TB (1000 GB)" },
          { value: "2 TB (2000 GB)", defaultLabel: "2 TB (2000 GB)" },
          { value: "4 TB (4000 GB)", defaultLabel: "4 TB (4000 GB)" },
          { value: "8 TB+", defaultLabel: "8 TB+" }
        ]
      },
      {
        id: "storage_free_gb",
        titleKey: "surveys.hardware.storageFree",
        defaultTitle: "Free Primary Storage Space",
        type: "single_choice",
        required: true,
        options: [
          { value: "Less than 20 GB", defaultLabel: "Less than 20 GB" },
          { value: "20 - 50 GB", defaultLabel: "20 - 50 GB" },
          { value: "50 - 100 GB", defaultLabel: "50 - 100 GB" },
          { value: "100 - 250 GB", defaultLabel: "100 - 250 GB" },
          { value: "250 - 500 GB", defaultLabel: "250 - 500 GB" },
          { value: "500 GB - 1 TB", defaultLabel: "500 GB - 1 TB" },
          { value: "1 TB+", defaultLabel: "1 TB+" }
        ]
      },
      {
        id: "storage_type",
        titleKey: "surveys.hardware.storageType",
        defaultTitle: "Primary Drive Type",
        type: "single_choice",
        required: true,
        options: [
          { value: "NVMe SSD (M.2 / PCIe)", defaultLabel: "NVMe SSD (M.2 / PCIe)" },
          { value: "SATA SSD", defaultLabel: "SATA SSD" },
          { value: "Mechanical HDD", defaultLabel: "Mechanical HDD" },
          { value: "eMMC / UFS Flash (Mobile)", defaultLabel: "eMMC / UFS Flash (Mobile)" },
          { value: "Hybrid / Fusion Drive", defaultLabel: "Hybrid / Fusion Drive" },
          { value: "Other", defaultLabel: "Other" }
        ]
      },
      {
        id: "motherboard",
        titleKey: "surveys.hardware.motherboard",
        defaultTitle: "Motherboard / Baseboard",
        type: "text",
        required: false,
        placeholder: "e.g., ASUS ROG STRIX B650-A / MSI MAG B650 / Apple Logic Board"
      }
    ]
  },
  {
    id: "monthly-browser-survey",
    titleKey: "surveys.browserTitle",
    defaultTitle: "Browser Survey",
    descriptionKey: "surveys.browserDesc",
    defaultDescription: "Simple monthly survey to discover the main web browser you use across the community.",
    category: "Fun",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    questions: [
      {
        id: "main_browser",
        titleKey: "surveys.browser.mainBrowser",
        defaultTitle: "Main Browser You Use",
        type: "single_choice",
        required: true,
        options: [
          { value: "Chrome", defaultLabel: "Google Chrome" },
          { value: "Firefox", defaultLabel: "Mozilla Firefox" },
          { value: "Edge", defaultLabel: "Microsoft Edge" },
          { value: "Safari", defaultLabel: "Apple Safari" },
          { value: "Brave", defaultLabel: "Brave Browser" },
          { value: "Opera", defaultLabel: "Opera / Opera GX" },
          { value: "Other", defaultLabel: "Other" }
        ]
      },
      {
        id: "other_browser_name",
        titleKey: "surveys.browser.otherName",
        defaultTitle: "If 'Other', specify your browser",
        type: "text",
        required: false,
        placeholder: "e.g., Vivaldi, Arc, Floorp, Waterfox, LibreWolf"
      },
      {
        id: "secondary_browser",
        titleKey: "surveys.browser.secondaryBrowser",
        defaultTitle: "Secondary / Backup Browser",
        type: "single_choice",
        required: false,
        options: [
          { value: "None", defaultLabel: "None (Only one browser)" },
          { value: "Chrome", defaultLabel: "Google Chrome" },
          { value: "Firefox", defaultLabel: "Mozilla Firefox" },
          { value: "Edge", defaultLabel: "Microsoft Edge" },
          { value: "Safari", defaultLabel: "Apple Safari" },
          { value: "Brave", defaultLabel: "Brave Browser" },
          { value: "Opera", defaultLabel: "Opera / Opera GX" },
          { value: "Other", defaultLabel: "Other" }
        ]
      }
    ]
  },
  {
    id: "monthly-gaming-survey",
    titleKey: "surveys.gamingTitle",
    defaultTitle: "Gaming Survey",
    descriptionKey: "surveys.gamingDesc",
    defaultDescription: "A fun monthly gaming poll tracking favorite platforms, preferred genres, and input methods.",
    category: "Fun",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    questions: [
      {
        id: "gaming_platform",
        titleKey: "surveys.gaming.platform",
        defaultTitle: "Main Gaming Platform",
        type: "single_choice",
        required: true,
        options: [
          { value: "PC", defaultLabel: "PC (Windows / Linux / Mac)" },
          { value: "Console", defaultLabel: "Console (PlayStation / Xbox / Switch)" },
          { value: "Mobile", defaultLabel: "Mobile (Android / iOS)" }
        ]
      },
      {
        id: "favourite_genre",
        titleKey: "surveys.gaming.genre",
        defaultTitle: "Favourite Game Genre",
        type: "single_choice",
        required: true,
        options: [
          { value: "FPS", defaultLabel: "FPS (First-Person Shooter)" },
          { value: "RPG", defaultLabel: "RPG (Role-Playing Game)" },
          { value: "Strategy", defaultLabel: "Strategy / RTS / 4X" },
          { value: "Simulation", defaultLabel: "Simulation / City Builder" },
          { value: "Racing", defaultLabel: "Racing / Driving" },
          { value: "Sports", defaultLabel: "Sports" },
          { value: "Horror", defaultLabel: "Horror / Survival" },
          { value: "Sandbox", defaultLabel: "Sandbox / Open World" }
        ]
      },
      {
        id: "input_device",
        titleKey: "surveys.gaming.inputDevice",
        defaultTitle: "Preferred Control Input",
        type: "single_choice",
        required: true,
        options: [
          { value: "Controller", defaultLabel: "Controller / Gamepad" },
          { value: "Keyboard + Mouse", defaultLabel: "Keyboard + Mouse" },
          { value: "Touch / Other", defaultLabel: "Touchscreen / Motion / Other" }
        ]
      },
      {
        id: "weekly_hours",
        titleKey: "surveys.gaming.weeklyHours",
        defaultTitle: "Average Gaming Time Per Week",
        type: "single_choice",
        required: true,
        options: [
          { value: "0 - 5 hours", defaultLabel: "0 - 5 hours (Casual)" },
          { value: "6 - 15 hours", defaultLabel: "6 - 15 hours (Moderate)" },
          { value: "16 - 30 hours", defaultLabel: "16 - 30 hours (Enthusiast)" },
          { value: "30+ hours", defaultLabel: "30+ hours (Hardcore)" }
        ]
      }
    ]
  }
];
function archiveMonthlyHistory(expiredResponses) {
  if (expiredResponses.length === 0) return;
  ensureSurveysDir();
  const history = readJson(MONTHLY_HISTORY_FILE, []);
  const groups = /* @__PURE__ */ new Map();
  for (const r of expiredResponses) {
    const key = `${r.survey_id}:::${r.month_key}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const past12Keys = new Set(getPast12MonthKeys().map((m) => m.key));
  for (const [groupKey, groupResponses] of groups) {
    const [surveyId, monthKey] = groupKey.split(":::");
    const survey = getSurveyById(surveyId);
    if (!survey) continue;
    const variants = survey.isHardwareSurvey ? ["all", "verified", "unverified"] : ["all"];
    for (const variant of variants) {
      const vFiltered = groupResponses.filter((r) => {
        if (variant === "all") return true;
        return r.variant === variant;
      });
      for (const q of survey.questions) {
        const rawValues = [];
        for (const resp of vFiltered) {
          const val = resp.answers[q.id];
          if (val !== void 0 && val !== null && String(val).trim() !== "") {
            rawValues.push(val);
          }
        }
        const total = rawValues.length;
        const counts = {};
        for (const val of rawValues) {
          if (Array.isArray(val)) {
            for (const sub of val) counts[sub] = (counts[sub] || 0) + 1;
          } else {
            counts[String(val)] = (counts[String(val)] || 0) + 1;
          }
        }
        for (const [optName, count] of Object.entries(counts)) {
          const percentage = total > 0 ? Number((count / total * 100).toFixed(1)) : 0;
          const existingIdx = history.findIndex(
            (h) => h.survey_id === surveyId && h.month_key === monthKey && h.variant === variant && h.question_id === q.id && h.option_name === optName
          );
          if (existingIdx >= 0) {
            history[existingIdx] = {
              survey_id: surveyId,
              month_key: monthKey,
              variant,
              question_id: q.id,
              option_name: optName,
              count,
              percentage
            };
          } else {
            history.push({
              survey_id: surveyId,
              month_key: monthKey,
              variant,
              question_id: q.id,
              option_name: optName,
              count,
              percentage
            });
          }
        }
      }
    }
  }
  const prunedHistory = history.filter((h) => past12Keys.has(h.month_key));
  writeJson(MONTHLY_HISTORY_FILE, prunedHistory);
}
function purgeExpiredMonthlySurveys() {
  ensureSurveysDir();
  const currentMonthKey = getCurrentMonthKey();
  const allDefinitions = getAllSurveys();
  const monthlySurveyIds = new Set(
    allDefinitions.filter((s) => s.recurrence === "monthly").map((s) => s.id)
  );
  const responses = readJson(RESPONSES_FILE, []);
  const submissions = readJson(SUBMISSIONS_FILE, []);
  const expiredResponses = responses.filter(
    (r) => monthlySurveyIds.has(r.survey_id) && r.month_key !== currentMonthKey
  );
  if (expiredResponses.length > 0) {
    archiveMonthlyHistory(expiredResponses);
  }
  const freshResponses = responses.filter((r) => {
    if (!monthlySurveyIds.has(r.survey_id)) return true;
    return r.month_key === currentMonthKey;
  });
  const freshSubmissions = submissions.filter((s) => {
    if (!monthlySurveyIds.has(s.survey_id)) return true;
    return s.month_key === currentMonthKey;
  });
  const purgedResponses = responses.length - freshResponses.length;
  const purgedSubmissions = submissions.length - freshSubmissions.length;
  if (purgedResponses > 0) {
    writeJson(RESPONSES_FILE, freshResponses);
  }
  if (purgedSubmissions > 0) {
    writeJson(SUBMISSIONS_FILE, freshSubmissions);
  }
  return { purgedResponses, purgedSubmissions };
}
function getAllSurveys() {
  ensureSurveysDir();
  const customSurveys = readJson(DEFINITIONS_FILE, []);
  const map = /* @__PURE__ */ new Map();
  for (const predefined of PREDEFINED_SURVEYS) {
    map.set(predefined.id, predefined);
  }
  for (const custom of customSurveys) {
    map.set(custom.id, custom);
  }
  return Array.from(map.values());
}
function getSurveyById(id) {
  const surveys = getAllSurveys();
  return surveys.find((s) => s.id === id) || null;
}
function saveCustomSurvey(survey) {
  ensureSurveysDir();
  const customSurveys = readJson(DEFINITIONS_FILE, []);
  const index = customSurveys.findIndex((s) => s.id === survey.id);
  if (index >= 0) {
    customSurveys[index] = { ...survey, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  } else {
    customSurveys.push({
      ...survey,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  writeJson(DEFINITIONS_FILE, customSurveys);
  return survey;
}
function deleteCustomSurvey(id) {
  ensureSurveysDir();
  const customSurveys = readJson(DEFINITIONS_FILE, []);
  const filtered = customSurveys.filter((s) => s.id !== id);
  if (filtered.length !== customSurveys.length) {
    writeJson(DEFINITIONS_FILE, filtered);
    const responses = readJson(RESPONSES_FILE, []);
    writeJson(
      RESPONSES_FILE,
      responses.filter((r) => r.survey_id !== id)
    );
    const submissions = readJson(SUBMISSIONS_FILE, []);
    writeJson(
      SUBMISSIONS_FILE,
      submissions.filter((s) => s.survey_id !== id)
    );
    return true;
  }
  return false;
}
function hasUserSubmittedSurvey(userId, surveyId) {
  ensureSurveysDir();
  purgeExpiredMonthlySurveys();
  const survey = getSurveyById(surveyId);
  if (!survey) return false;
  const currentMonthKey = getCurrentMonthKey();
  const submissions = readJson(SUBMISSIONS_FILE, []);
  return submissions.some((s) => {
    if (s.user_id !== String(userId) || s.survey_id !== surveyId) return false;
    if (survey.recurrence === "monthly") {
      return s.month_key === currentMonthKey;
    }
    return true;
  });
}
function submitSurveyAnswers(params) {
  ensureSurveysDir();
  purgeExpiredMonthlySurveys();
  const survey = getSurveyById(params.surveyId);
  if (!survey) {
    return { success: false, error: "Survey not found" };
  }
  if (!survey.isActive) {
    return { success: false, error: "This survey is currently closed" };
  }
  if (hasUserSubmittedSurvey(params.userId, params.surveyId)) {
    return {
      success: false,
      error: survey.recurrence === "monthly" ? "You have already submitted this survey for the current month." : "You have already submitted this survey."
    };
  }
  const currentMonthKey = getCurrentMonthKey();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const anonymousResponse = {
    id: crypto7.randomUUID(),
    survey_id: params.surveyId,
    month_key: currentMonthKey,
    variant: params.variant,
    answers: params.answers,
    created_at: now
  };
  const responses = readJson(RESPONSES_FILE, []);
  responses.push(anonymousResponse);
  writeJson(RESPONSES_FILE, responses);
  const userSubmission = {
    id: crypto7.randomUUID(),
    user_id: String(params.userId),
    survey_id: params.surveyId,
    month_key: currentMonthKey,
    created_at: now
  };
  const submissions = readJson(SUBMISSIONS_FILE, []);
  submissions.push(userSubmission);
  writeJson(SUBMISSIONS_FILE, submissions);
  return { success: true };
}
function calculateSurveyResults(surveyId, variantFilter = "all") {
  ensureSurveysDir();
  purgeExpiredMonthlySurveys();
  const survey = getSurveyById(surveyId);
  if (!survey) return null;
  const currentMonthKey = getCurrentMonthKey();
  const allResponses = readJson(RESPONSES_FILE, []);
  const historySnapshots = readJson(MONTHLY_HISTORY_FILE, []);
  const past12Months = getPast12MonthKeys();
  const surveyResponses = allResponses.filter((r) => {
    if (r.survey_id !== surveyId) return false;
    if (survey.recurrence === "monthly") {
      return r.month_key === currentMonthKey;
    }
    return true;
  });
  const totalSubmissions = surveyResponses.length;
  const verifiedCount = surveyResponses.filter((r) => r.variant === "verified").length;
  const unverifiedCount = surveyResponses.filter((r) => r.variant === "unverified").length;
  const filteredResponses = surveyResponses.filter((r) => {
    if (!survey.isHardwareSurvey) return true;
    if (variantFilter === "verified") return r.variant === "verified";
    if (variantFilter === "unverified") return r.variant === "unverified";
    return true;
  });
  const effectiveVariant = survey.isHardwareSurvey ? variantFilter : "all";
  const questionResults = survey.questions.map((q) => {
    const rawValues = [];
    for (const resp of filteredResponses) {
      const val = resp.answers[q.id];
      if (val !== void 0 && val !== null && String(val).trim() !== "") {
        rawValues.push(val);
      }
    }
    const questionTotal = rawValues.length;
    let seriesKeys = [];
    let optionsDistribution = [];
    let lineChartSeries = [];
    let topAnswers;
    let averageRating;
    if (q.type === "single_choice" || q.type === "multiple_choice") {
      const predefinedOptions = q.options?.map((o) => o.value) || [];
      seriesKeys = predefinedOptions;
      const counts = {};
      for (const opt of predefinedOptions) counts[opt] = 0;
      for (const val of rawValues) {
        if (Array.isArray(val)) {
          for (const subVal of val) counts[subVal] = (counts[subVal] || 0) + 1;
        } else {
          counts[val] = (counts[val] || 0) + 1;
        }
      }
      optionsDistribution = Object.entries(counts).map(([name, count]) => {
        const percentage = questionTotal > 0 ? Number((count / questionTotal * 100).toFixed(1)) : 0;
        return { name, count, percentage };
      });
      optionsDistribution.sort((a, b) => b.count - a.count);
      lineChartSeries = optionsDistribution.map((opt) => ({
        label: opt.name,
        value: opt.percentage,
        count: opt.count
      }));
    } else if (q.type === "rating") {
      const min = q.min ?? 1;
      const max = q.max ?? 5;
      seriesKeys = [];
      for (let i = min; i <= max; i++) seriesKeys.push(`Rating ${i}`);
      const counts = {};
      for (const k of seriesKeys) counts[k] = 0;
      let sum = 0;
      for (const val of rawValues) {
        const num = Number(val);
        if (!isNaN(num)) {
          const key = `Rating ${num}`;
          counts[key] = (counts[key] || 0) + 1;
          sum += num;
        }
      }
      optionsDistribution = Object.entries(counts).map(([name, count]) => ({
        name,
        count,
        percentage: questionTotal > 0 ? Number((count / questionTotal * 100).toFixed(1)) : 0
      }));
      lineChartSeries = optionsDistribution.map((opt) => ({
        label: opt.name,
        value: opt.percentage,
        count: opt.count
      }));
      averageRating = questionTotal > 0 ? Number((sum / questionTotal).toFixed(2)) : 0;
    } else {
      const counts = {};
      for (const val of rawValues) {
        const clean = String(val).trim();
        if (clean) counts[clean] = (counts[clean] || 0) + 1;
      }
      topAnswers = Object.entries(counts).map(([value, count]) => ({
        value,
        count,
        percentage: questionTotal > 0 ? Number((count / questionTotal * 100).toFixed(1)) : 0
      })).sort((a, b) => b.count - a.count).slice(0, 15);
      optionsDistribution = topAnswers.map((t) => ({
        name: t.value,
        count: t.count,
        percentage: t.percentage
      }));
      lineChartSeries = topAnswers.slice(0, 10).map((t) => ({
        label: t.value.length > 20 ? `${t.value.slice(0, 17)}...` : t.value,
        value: t.percentage,
        count: t.count
      }));
      seriesKeys = topAnswers.slice(0, 8).map((t) => t.value);
    }
    const monthlyTimeline = past12Months.map((m) => {
      const monthResponses = allResponses.filter((r) => {
        if (r.survey_id !== surveyId || r.month_key !== m.key) return false;
        if (survey.isHardwareSurvey && effectiveVariant !== "all") {
          return r.variant === effectiveVariant;
        }
        return true;
      });
      const point = {
        monthKey: m.key,
        monthLabel: m.label,
        totalResponses: monthResponses.length
      };
      if (monthResponses.length > 0) {
        const mValues = [];
        for (const resp of monthResponses) {
          const v = resp.answers[q.id];
          if (v !== void 0 && v !== null && String(v).trim() !== "") {
            mValues.push(v);
          }
        }
        const mTotal = mValues.length;
        point.totalResponses = mTotal;
        const mCounts = {};
        for (const v of mValues) {
          if (q.type === "rating") {
            const rKey = `Rating ${v}`;
            mCounts[rKey] = (mCounts[rKey] || 0) + 1;
          } else if (Array.isArray(v)) {
            for (const sub of v) mCounts[sub] = (mCounts[sub] || 0) + 1;
          } else {
            const strVal = String(v);
            mCounts[strVal] = (mCounts[strVal] || 0) + 1;
          }
        }
        for (const key of seriesKeys) {
          const c = mCounts[key] || 0;
          point[key] = mTotal > 0 ? Number((c / mTotal * 100).toFixed(1)) : 0;
        }
      } else {
        const snapshots = historySnapshots.filter(
          (h) => h.survey_id === surveyId && h.month_key === m.key && h.variant === effectiveVariant && h.question_id === q.id
        );
        let snapTotal = 0;
        for (const s of snapshots) snapTotal += s.count;
        point.totalResponses = snapTotal;
        for (const key of seriesKeys) {
          const match = snapshots.find((s) => s.option_name === key);
          point[key] = match ? match.percentage : 0;
        }
      }
      return point;
    });
    return {
      questionId: q.id,
      questionTitle: q.defaultTitle,
      totalResponses: questionTotal,
      optionsDistribution,
      monthlyTimeline,
      seriesKeys,
      lineChartSeries,
      topAnswers,
      averageRating
    };
  });
  return {
    surveyId,
    title: survey.defaultTitle,
    monthKey: currentMonthKey,
    isHardwareSurvey: Boolean(survey.isHardwareSurvey || survey.id === "monthly-hardware-survey"),
    totalSubmissions,
    verifiedCount: survey.isHardwareSurvey ? verifiedCount : 0,
    unverifiedCount: survey.isHardwareSurvey ? unverifiedCount : 0,
    variantFilter,
    questions: questionResults
  };
}

// server/routes/surveys.ts
var surveysRouter = new Hono14();
async function getAuthenticatedUser(c) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    token = c.req.query("token") || null;
  }
  if (!token) return null;
  return await resolveUserFromToken(token);
}
surveysRouter.get("/", async (c) => {
  try {
    purgeExpiredMonthlySurveys();
    const user = await getAuthenticatedUser(c);
    const surveys = getAllSurveys();
    const currentMonthKey = getCurrentMonthKey();
    const daysRemaining = getDaysRemainingInCurrentMonth();
    const surveysWithStatus = surveys.map((s) => {
      const hasSubmitted = user ? hasUserSubmittedSurvey(user.id, s.id) : false;
      return {
        id: s.id,
        titleKey: s.titleKey,
        defaultTitle: s.defaultTitle,
        descriptionKey: s.descriptionKey,
        defaultDescription: s.defaultDescription,
        category: s.category,
        recurrence: s.recurrence,
        isPredefined: s.isPredefined,
        isActive: s.isActive,
        isHardwareSurvey: s.isHardwareSurvey || false,
        questionsCount: s.questions.length,
        hasSubmitted,
        currentMonthKey,
        daysRemaining
      };
    });
    return c.json({
      surveys: surveysWithStatus,
      currentMonthKey,
      daysRemaining
    });
  } catch (error) {
    return c.json({ error: error.message || "Failed to fetch surveys" }, 500);
  }
});
surveysRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }
    const user = await getAuthenticatedUser(c);
    const hasSubmitted = user ? hasUserSubmittedSurvey(user.id, survey.id) : false;
    const currentMonthKey = getCurrentMonthKey();
    const daysRemaining = getDaysRemainingInCurrentMonth();
    return c.json({
      survey,
      hasSubmitted,
      currentMonthKey,
      daysRemaining
    });
  } catch (error) {
    return c.json({ error: error.message || "Failed to fetch survey" }, 500);
  }
});
surveysRouter.post("/:id/submit", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Authentication required to submit surveys" }, 401);
    }
    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }
    if (!survey.isActive) {
      return c.json({ error: "This survey is currently closed" }, 400);
    }
    const body = await c.req.json().catch(() => ({}));
    const variant = body.variant === "verified" ? "verified" : "unverified";
    const answers = body.answers || {};
    if (typeof answers !== "object" || answers === null) {
      return c.json({ error: "Invalid survey answers payload" }, 400);
    }
    for (const q of survey.questions) {
      if (q.required) {
        const val = answers[q.id];
        if (val === void 0 || val === null || typeof val === "string" && val.trim() === "" || Array.isArray(val) && val.length === 0) {
          return c.json(
            { error: `Please answer required question: ${q.defaultTitle}` },
            400
          );
        }
      }
    }
    const result = submitSurveyAnswers({
      userId: user.id,
      surveyId: id,
      variant,
      answers
    });
    if (!result.success) {
      return c.json({ error: result.error || "Submission failed" }, 400);
    }
    return c.json({
      success: true,
      message: "Survey answers submitted anonymously."
    });
  } catch (error) {
    return c.json({ error: error.message || "Failed to submit survey" }, 500);
  }
});
surveysRouter.get("/:id/results", async (c) => {
  try {
    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }
    const user = await getAuthenticatedUser(c);
    if (!user) {
      return c.json({ error: "Authentication required to view survey results" }, 401);
    }
    const isAdmin = user.role === "admin" || String(user.id) === "1";
    const hasSubmitted = hasUserSubmittedSurvey(user.id, survey.id);
    if (!hasSubmitted && !isAdmin) {
      return c.json(
        {
          error: "Survey results are hidden until you complete this month's survey.",
          locked: true
        },
        403
      );
    }
    const variantParam = c.req.query("variant");
    const variantFilter = variantParam === "verified" || variantParam === "unverified" ? variantParam : "all";
    const results = calculateSurveyResults(id, variantFilter);
    if (!results) {
      return c.json({ error: "Failed to compute results" }, 500);
    }
    return c.json({
      results,
      daysRemaining: getDaysRemainingInCurrentMonth()
    });
  } catch (error) {
    return c.json({ error: error.message || "Failed to fetch survey results" }, 500);
  }
});
surveysRouter.post("/admin/create", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const { title, description, category, recurrence, questions } = body;
    if (!title || !description || !Array.isArray(questions) || questions.length === 0) {
      return c.json(
        { error: "Title, description, and at least one question are required." },
        400
      );
    }
    const surveyId = `custom-${crypto8.randomBytes(6).toString("hex")}`;
    const newSurvey = {
      id: surveyId,
      titleKey: `surveys.custom.${surveyId}.title`,
      defaultTitle: title.trim(),
      descriptionKey: `surveys.custom.${surveyId}.desc`,
      defaultDescription: description.trim(),
      category: category || "General",
      recurrence: recurrence === "permanent" ? "permanent" : "monthly",
      isPredefined: false,
      isActive: true,
      questions: questions.map((q, idx) => ({
        id: q.id || `q_${idx + 1}`,
        titleKey: `surveys.custom.${surveyId}.q_${idx + 1}`,
        defaultTitle: q.defaultTitle || q.title || `Question ${idx + 1}`,
        type: q.type || "single_choice",
        required: q.required !== false,
        options: Array.isArray(q.options) ? q.options.map(
          (opt) => typeof opt === "string" ? { value: opt, defaultLabel: opt } : {
            value: opt.value || opt.label,
            defaultLabel: opt.defaultLabel || opt.label || opt.value
          }
        ) : void 0
      })),
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveCustomSurvey(newSurvey);
    return c.json({ success: true, survey: newSurvey });
  } catch (error) {
    return c.json({ error: error.message || "Failed to create survey" }, 500);
  }
});
surveysRouter.patch("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    if (body.isActive !== void 0) {
      survey.isActive = Boolean(body.isActive);
    }
    if (body.title) survey.defaultTitle = String(body.title).trim();
    if (body.description) survey.defaultDescription = String(body.description).trim();
    if (body.category) survey.category = body.category;
    if (body.recurrence) survey.recurrence = body.recurrence;
    if (Array.isArray(body.questions)) survey.questions = body.questions;
    saveCustomSurvey(survey);
    return c.json({ success: true, survey });
  } catch (error) {
    return c.json({ error: error.message || "Failed to update survey" }, 500);
  }
});
surveysRouter.delete("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    const id = c.req.param("id");
    const survey = getSurveyById(id);
    if (!survey) {
      return c.json({ error: "Survey not found" }, 404);
    }
    if (survey.isPredefined) {
      return c.json({ error: "Predefined surveys cannot be deleted" }, 400);
    }
    const deleted = deleteCustomSurvey(id);
    return c.json({ success: deleted });
  } catch (error) {
    return c.json({ error: error.message || "Failed to delete survey" }, 500);
  }
});
surveysRouter.post("/admin/purge", async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    if (!user || user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    const stats = purgeExpiredMonthlySurveys();
    return c.json({ success: true, ...stats });
  } catch (error) {
    return c.json({ error: error.message || "Failed to purge surveys" }, 500);
  }
});

// server/routes/realtime.ts
init_auth();
import { Hono as Hono15 } from "hono";
import { streamSSE as streamSSE2 } from "hono/streaming";

// server/lib/realtime.ts
var ADMIN_TABLES = /* @__PURE__ */ new Set([
  "support_tickets",
  "support_messages",
  "notifications"
]);
var userListeners = /* @__PURE__ */ new Map();
var adminListeners = /* @__PURE__ */ new Set();
function subscribeUser(userId, listener) {
  let set = userListeners.get(userId);
  if (!set) {
    set = /* @__PURE__ */ new Set();
    userListeners.set(userId, set);
  }
  set.add(listener);
}
function unsubscribeUser(userId, listener) {
  const set = userListeners.get(userId);
  if (set) {
    set.delete(listener);
    if (set.size === 0) userListeners.delete(userId);
  }
}
function subscribeAdmin(listener) {
  adminListeners.add(listener);
}
function unsubscribeAdmin(listener) {
  adminListeners.delete(listener);
}
function broadcastChange(event) {
  const table = event.table.toLowerCase();
  if (table === "notifications" && !event.targetUserId) {
    for (const [, set] of userListeners) {
      for (const listener of set) {
        try {
          listener(event);
        } catch {
        }
      }
    }
    for (const listener of adminListeners) {
      try {
        listener(event);
      } catch {
      }
    }
    return;
  }
  if (event.targetUserId) {
    const set = userListeners.get(event.targetUserId);
    if (set) {
      for (const listener of set) {
        try {
          listener(event);
        } catch {
        }
      }
    }
  }
  if (ADMIN_TABLES.has(table)) {
    for (const listener of adminListeners) {
      try {
        listener(event);
      } catch {
      }
    }
  }
}

// server/routes/realtime.ts
var realtimeRouter = new Hono15();
realtimeRouter.get("/", async (c) => {
  const token = c.req.query("token") ?? c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const isAdmin = user.role === "admin" || String(user.id) === "1";
  const userId = String(user.id);
  return streamSSE2(c, async (stream) => {
    const listener = async (event) => {
      try {
        await stream.writeSSE({
          event: "postgres_changes",
          data: JSON.stringify(event)
        });
      } catch {
      }
    };
    subscribeUser(userId, listener);
    if (isAdmin) subscribeAdmin(listener);
    try {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ userId, isAdmin })
      });
    } catch {
      unsubscribeUser(userId, listener);
      if (isAdmin) unsubscribeAdmin(listener);
      return;
    }
    stream.onAbort(() => {
      unsubscribeUser(userId, listener);
      if (isAdmin) unsubscribeAdmin(listener);
    });
    while (!stream.aborted) {
      await stream.sleep(3e4);
      try {
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch {
        break;
      }
    }
    unsubscribeUser(userId, listener);
    if (isAdmin) unsubscribeAdmin(listener);
  });
});

// server/routes/softwareAwards.ts
init_auth();
import { Hono as Hono16 } from "hono";
import crypto10 from "node:crypto";

// server/lib/softwareAwards.ts
init_dataStore();
import fs6 from "node:fs";
import path6 from "node:path";
import crypto9 from "node:crypto";
var AWARDS_DIR = path6.join(DATA_DIR, "awards");
function ensureAwardsDir() {
  if (!fs6.existsSync(AWARDS_DIR)) {
    fs6.mkdirSync(AWARDS_DIR, { recursive: true });
  }
}
function getCurrentMonthKey2(date = /* @__PURE__ */ new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
function getAwardPeriodKey(award) {
  const now = /* @__PURE__ */ new Date();
  const created = new Date(award.created_at);
  const diffTime = Math.abs(now.getTime() - created.getTime());
  const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
  if (diffDays <= 3 && getCurrentMonthKey2(now) !== getCurrentMonthKey2(created)) {
    return getCurrentMonthKey2(created);
  }
  return getCurrentMonthKey2(now);
}
var AWARDS_FILE = path6.join(AWARDS_DIR, "awards.json");
var VOTES_FILE = path6.join(AWARDS_DIR, "votes.json");
var SUBMISSIONS_FILE2 = path6.join(AWARDS_DIR, "submissions.json");
function readJson2(filePath, fallback) {
  try {
    const content = fs6.readFileSync(filePath, "utf-8").trim();
    if (!content) return fallback;
    return JSON.parse(content);
  } catch (err) {
    if (err.code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}
function writeJson2(filePath, data) {
  ensureAwardsDir();
  const tempPath = `${filePath}.${crypto9.randomUUID()}.tmp`;
  fs6.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs6.renameSync(tempPath, filePath);
}
function getAllAwards() {
  ensureAwardsDir();
  return readJson2(AWARDS_FILE, []);
}
function getAwardById(id) {
  const awards = getAllAwards();
  return awards.find((a) => a.id === id) || null;
}
function isAwardActive(award) {
  const now = /* @__PURE__ */ new Date();
  if (now.getUTCDate() <= 3) {
    return true;
  }
  const createdDate = new Date(award.created_at);
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  const diffDays = Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
  if (diffDays <= 3) {
    return true;
  }
  return false;
}
function saveAward(award) {
  ensureAwardsDir();
  const awards = getAllAwards();
  const index = awards.findIndex((a) => a.id === award.id);
  if (index >= 0) {
    awards[index] = { ...award, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  } else {
    awards.push({
      ...award,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  writeJson2(AWARDS_FILE, awards);
  return award;
}
function deleteAward(id) {
  ensureAwardsDir();
  const awards = getAllAwards();
  const filtered = awards.filter((a) => a.id !== id);
  if (filtered.length !== awards.length) {
    writeJson2(AWARDS_FILE, filtered);
    const votes = readJson2(VOTES_FILE, []);
    writeJson2(
      VOTES_FILE,
      votes.filter((v) => v.award_id !== id)
    );
    const submissions = readJson2(SUBMISSIONS_FILE2, []);
    writeJson2(
      SUBMISSIONS_FILE2,
      submissions.filter((s) => s.award_id !== id)
    );
    return true;
  }
  return false;
}
function hasUserVoted(userId, awardId) {
  ensureAwardsDir();
  const submissions = readJson2(SUBMISSIONS_FILE2, []);
  const award = getAwardById(awardId);
  const currentMonthKey = award ? getAwardPeriodKey(award) : getCurrentMonthKey2();
  return submissions.some(
    (s) => s.user_id === String(userId) && s.award_id === awardId && s.month_key === currentMonthKey
  );
}
function submitVote(params) {
  ensureAwardsDir();
  const award = getAwardById(params.awardId);
  if (!award) {
    return { success: false, error: "Award not found" };
  }
  if (!isAwardActive(award)) {
    return {
      success: false,
      error: "Voting is currently closed for this award"
    };
  }
  if (hasUserVoted(params.userId, params.awardId)) {
    return {
      success: false,
      error: "You have already voted for this award this month."
    };
  }
  const currentMonthKey = getAwardPeriodKey(award);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const vote = {
    id: crypto9.randomUUID(),
    award_id: params.awardId,
    month_key: currentMonthKey,
    answer: params.answer,
    created_at: now
  };
  const votes = readJson2(VOTES_FILE, []);
  votes.push(vote);
  writeJson2(VOTES_FILE, votes);
  const submission = {
    id: crypto9.randomUUID(),
    user_id: String(params.userId),
    award_id: params.awardId,
    month_key: currentMonthKey,
    created_at: now
  };
  const submissions = readJson2(SUBMISSIONS_FILE2, []);
  submissions.push(submission);
  writeJson2(SUBMISSIONS_FILE2, submissions);
  return { success: true };
}
function calculateAwardResults(awardId, monthKey) {
  ensureAwardsDir();
  const award = getAwardById(awardId);
  if (!award) return null;
  const activePeriodKey = monthKey || getAwardPeriodKey(award);
  const allVotes = readJson2(VOTES_FILE, []);
  const votes = allVotes.filter(
    (v) => v.award_id === awardId && v.month_key === activePeriodKey
  );
  const totalVotes = votes.length;
  const counts = {};
  for (const opt of award.options) {
    counts[opt.value] = 0;
  }
  for (const v of votes) {
    if (counts[v.answer] !== void 0) {
      counts[v.answer]++;
    }
  }
  let winner = null;
  let maxCount = -1;
  let tied = false;
  const distribution = Object.entries(counts).map(([name, count]) => {
    if (count > maxCount) {
      maxCount = count;
      winner = name;
      tied = false;
    } else if (count === maxCount) {
      tied = true;
    }
    const percentage = totalVotes > 0 ? Number((count / totalVotes * 100).toFixed(1)) : 0;
    return { name, count, percentage };
  }).sort((a, b) => b.count - a.count);
  if (tied || totalVotes === 0) {
    winner = null;
  }
  return {
    awardId,
    monthKey: activePeriodKey,
    totalVotes,
    winner,
    distribution
  };
}

// server/routes/softwareAwards.ts
var softwareAwardsRouter = new Hono16();
async function getAuthenticatedUser2(c) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  return await resolveUserFromToken(token);
}
softwareAwardsRouter.get("/", async (c) => {
  try {
    const user = await getAuthenticatedUser2(c);
    const awards = getAllAwards();
    const currentMonthKey = getCurrentMonthKey2();
    const awardsWithStatus = awards.map((a) => {
      const hasVoted = user ? hasUserVoted(user.id, a.id) : false;
      const active = isAwardActive(a);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        rewardName: a.rewardName,
        options: a.options,
        isActive: active,
        hasVoted,
        currentMonthKey
      };
    });
    c.header("Cache-Control", "no-store");
    return c.json({
      awards: awardsWithStatus,
      currentMonthKey
    });
  } catch (error) {
    return c.json({ error: error.message || "Failed to fetch awards" }, 500);
  }
});
softwareAwardsRouter.post("/:id/vote", async (c) => {
  try {
    const user = await getAuthenticatedUser2(c);
    if (!user) {
      return c.json({ error: "Authentication required to vote" }, 401);
    }
    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }
    if (!isAwardActive(award)) {
      return c.json({ error: "Voting is closed for this award" }, 400);
    }
    const body = await c.req.json().catch(() => ({}));
    const answer = body.answer;
    if (!answer || typeof answer !== "string") {
      return c.json({ error: "Invalid answer payload" }, 400);
    }
    if (!award.options.find((o) => o.value === answer)) {
      return c.json({ error: "Invalid option selected" }, 400);
    }
    const result = submitVote({
      userId: user.id,
      awardId: id,
      answer
    });
    if (!result.success) {
      return c.json({ error: result.error || "Submission failed" }, 400);
    }
    return c.json({
      success: true,
      message: "Vote submitted anonymously."
    });
  } catch (error) {
    return c.json({ error: error.message || "Failed to submit vote" }, 500);
  }
});
softwareAwardsRouter.get("/:id/results", async (c) => {
  try {
    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }
    if (isAwardActive(award)) {
      return c.json(
        {
          error: "Award results are hidden until the voting period is over.",
          locked: true
        },
        403
      );
    }
    const results = calculateAwardResults(id);
    if (!results) {
      return c.json({ error: "Failed to compute results" }, 500);
    }
    return c.json({
      results
    });
  } catch (error) {
    return c.json({ error: error.message || "Failed to fetch results" }, 500);
  }
});
function normalizeAwardOptions(options) {
  const normalized = [];
  const seen = /* @__PURE__ */ new Set();
  for (const opt of options) {
    let value = "";
    let defaultLabel = "";
    if (typeof opt === "string") {
      value = opt.trim();
      defaultLabel = opt.trim();
    } else if (opt && typeof opt === "object") {
      value = (opt.value || opt.label || "").trim();
      defaultLabel = (opt.defaultLabel || opt.label || opt.value || "").trim();
    } else {
      throw new Error("Options must be objects or strings");
    }
    if (!value || !defaultLabel) {
      throw new Error("Option value and label cannot be empty");
    }
    if (seen.has(value)) {
      throw new Error("Option values must be unique");
    }
    seen.add(value);
    normalized.push({ value, defaultLabel });
  }
  return normalized;
}
softwareAwardsRouter.post("/admin/create", async (c) => {
  try {
    const user = await getAuthenticatedUser2(c);
    if (!user || user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const { title, description, rewardName, options } = body;
    if (!title || !description || !rewardName || !Array.isArray(options) || options.length === 0) {
      return c.json(
        { error: "Title, description, reward name, and options are required." },
        400
      );
    }
    let normalizedOptions;
    try {
      normalizedOptions = normalizeAwardOptions(options);
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
    const awardId = `award-${crypto10.randomBytes(6).toString("hex")}`;
    const newAward = {
      id: awardId,
      title: title.trim(),
      description: description.trim(),
      rewardName: rewardName.trim(),
      options: normalizedOptions,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveAward(newAward);
    return c.json({ success: true, award: newAward });
  } catch (error) {
    return c.json({ error: error.message || "Failed to create award" }, 500);
  }
});
softwareAwardsRouter.patch("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser2(c);
    if (!user || user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    if (body.title) award.title = String(body.title).trim();
    if (body.description) award.description = String(body.description).trim();
    if (body.rewardName) award.rewardName = String(body.rewardName).trim();
    if (body.options !== void 0) {
      if (!Array.isArray(body.options)) {
        return c.json({ error: "Options must be an array" }, 400);
      }
      const results = calculateAwardResults(id);
      if (results && results.totalVotes > 0) {
        return c.json({ error: "Cannot modify options while award has votes" }, 400);
      }
      try {
        award.options = normalizeAwardOptions(body.options);
      } catch (err) {
        return c.json({ error: err.message }, 400);
      }
    }
    saveAward(award);
    return c.json({ success: true, award });
  } catch (error) {
    return c.json({ error: error.message || "Failed to update award" }, 500);
  }
});
softwareAwardsRouter.delete("/admin/:id", async (c) => {
  try {
    const user = await getAuthenticatedUser2(c);
    if (!user || user.role !== "admin" && String(user.id) !== "1") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }
    const id = c.req.param("id");
    const award = getAwardById(id);
    if (!award) {
      return c.json({ error: "Award not found" }, 404);
    }
    const deleted = deleteAward(id);
    return c.json({ success: deleted });
  } catch (error) {
    return c.json({ error: error.message || "Failed to delete award" }, 500);
  }
});

// server/routes/notifications.ts
init_auth();
import { Hono as Hono17 } from "hono";

// server/lib/notifications.ts
init_dataStore();
import fs7 from "node:fs";
import path7 from "node:path";
import crypto11 from "node:crypto";
var NOTIFICATIONS_DIR = path7.join(DATA_DIR, "notifications");
var NOTIFICATIONS_FILE = path7.join(NOTIFICATIONS_DIR, "notifications.json");
var USER_STATE_FILE = path7.join(NOTIFICATIONS_DIR, "user_state.json");
function ensureNotificationsDir() {
  if (!fs7.existsSync(NOTIFICATIONS_DIR)) {
    fs7.mkdirSync(NOTIFICATIONS_DIR, { recursive: true });
  }
}
function readJsonFile2(filePath, defaultValue) {
  try {
    if (!fs7.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs7.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}
function writeJsonFile2(filePath, data) {
  ensureNotificationsDir();
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  fs7.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs7.renameSync(tempPath, filePath);
}
function getAllNotifications() {
  const records = readJsonFile2(NOTIFICATIONS_FILE, []);
  return records.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
function getNotificationById(id) {
  const records = getAllNotifications();
  return records.find((n) => n.id === id) || null;
}
function getAllUserStates() {
  return readJsonFile2(USER_STATE_FILE, []);
}
function saveUserStates(states) {
  writeJsonFile2(USER_STATE_FILE, states);
}
function getUserNotificationStates(userId) {
  const allStates = getAllUserStates();
  const userStates = allStates.filter((s) => String(s.user_id) === String(userId));
  const map = /* @__PURE__ */ new Map();
  for (const s of userStates) {
    map.set(s.notification_id, s);
  }
  return map;
}
function createNotification(params) {
  const records = getAllNotifications();
  const newNotification = {
    id: crypto11.randomUUID(),
    title: params.title.trim(),
    message: params.message.trim(),
    type: params.type || "info",
    action_url: params.action_url ? params.action_url.trim() : null,
    target_type: params.target_type || "all",
    target_user_id: params.target_type === "user" ? params.target_user_id || null : null,
    target_username: params.target_type === "user" ? params.target_username || null : null,
    created_by: params.created_by,
    created_by_username: params.created_by_username,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  records.unshift(newNotification);
  writeJsonFile2(NOTIFICATIONS_FILE, records);
  try {
    broadcastChange({
      table: "notifications",
      event: "INSERT",
      schema: "public",
      new: newNotification,
      old: null,
      targetUserId: newNotification.target_type === "user" ? String(newNotification.target_user_id) : void 0
    });
  } catch (err) {
    console.error("Failed to broadcast notification event:", err);
  }
  return newNotification;
}
function deleteNotification(id) {
  const records = getAllNotifications();
  const index = records.findIndex((n) => n.id === id);
  if (index === -1) return false;
  const [deleted] = records.splice(index, 1);
  writeJsonFile2(NOTIFICATIONS_FILE, records);
  try {
    broadcastChange({
      table: "notifications",
      event: "DELETE",
      schema: "public",
      new: null,
      old: deleted,
      targetUserId: deleted.target_type === "user" ? String(deleted.target_user_id) : void 0
    });
  } catch (err) {
    console.error("Failed to broadcast notification deletion:", err);
  }
  return true;
}
function getNotificationsForUser(userId, includeDismissed = false) {
  const allNotifications = getAllNotifications();
  if (!userId) {
    const guestItems = allNotifications.filter((n) => n.target_type === "all").map((n) => ({
      ...n,
      is_read: false,
      dismissed: false
    }));
    return {
      notifications: guestItems,
      unreadCount: guestItems.length
    };
  }
  const userStates = getUserNotificationStates(userId);
  const userItems = [];
  for (const n of allNotifications) {
    if (n.target_type !== "all" && String(n.target_user_id) !== String(userId)) {
      continue;
    }
    const state = userStates.get(n.id);
    const isDismissed = state?.dismissed || false;
    const isRead = state?.is_read || false;
    if (isDismissed && !includeDismissed) {
      continue;
    }
    userItems.push({
      ...n,
      is_read: isRead,
      dismissed: isDismissed
    });
  }
  const unreadCount = userItems.filter((n) => !n.is_read && !n.dismissed).length;
  return {
    notifications: userItems,
    unreadCount
  };
}
function markNotificationRead(userId, notificationId, isRead) {
  const notification = getNotificationById(notificationId);
  if (!notification) return null;
  const allStates = getAllUserStates();
  const stateId = `${userId}_${notificationId}`;
  const existingIdx = allStates.findIndex(
    (s) => String(s.user_id) === String(userId) && s.notification_id === notificationId
  );
  let updatedState;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (existingIdx !== -1) {
    allStates[existingIdx].is_read = isRead;
    allStates[existingIdx].updated_at = now;
    updatedState = allStates[existingIdx];
  } else {
    updatedState = {
      id: stateId,
      user_id: String(userId),
      notification_id: notificationId,
      is_read: isRead,
      dismissed: false,
      updated_at: now
    };
    allStates.push(updatedState);
  }
  saveUserStates(allStates);
  try {
    broadcastChange({
      table: "user_notification_state",
      event: "UPDATE",
      schema: "public",
      new: updatedState,
      old: null,
      targetUserId: String(userId)
    });
  } catch (err) {
    console.error("Failed to broadcast notification state change:", err);
  }
  return updatedState;
}
function markAllNotificationsRead(userId) {
  const { notifications } = getNotificationsForUser(userId, false);
  const unreadNotifications = notifications.filter((n) => !n.is_read);
  if (unreadNotifications.length === 0) return 0;
  const allStates = getAllUserStates();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let count = 0;
  for (const n of unreadNotifications) {
    const existingIdx = allStates.findIndex(
      (s) => String(s.user_id) === String(userId) && s.notification_id === n.id
    );
    if (existingIdx !== -1) {
      allStates[existingIdx].is_read = true;
      allStates[existingIdx].updated_at = now;
    } else {
      allStates.push({
        id: `${userId}_${n.id}`,
        user_id: String(userId),
        notification_id: n.id,
        is_read: true,
        dismissed: false,
        updated_at: now
      });
    }
    count++;
  }
  saveUserStates(allStates);
  try {
    broadcastChange({
      table: "user_notification_state",
      event: "UPDATE",
      schema: "public",
      new: { user_id: String(userId), action: "mark_all_read" },
      old: null,
      targetUserId: String(userId)
    });
  } catch (err) {
    console.error("Failed to broadcast mark all read:", err);
  }
  return count;
}
function dismissNotification(userId, notificationId) {
  const notification = getNotificationById(notificationId);
  if (!notification) return false;
  const allStates = getAllUserStates();
  const stateId = `${userId}_${notificationId}`;
  const existingIdx = allStates.findIndex(
    (s) => String(s.user_id) === String(userId) && s.notification_id === notificationId
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let updatedState;
  if (existingIdx !== -1) {
    allStates[existingIdx].dismissed = true;
    allStates[existingIdx].updated_at = now;
    updatedState = allStates[existingIdx];
  } else {
    updatedState = {
      id: stateId,
      user_id: String(userId),
      notification_id: notificationId,
      is_read: true,
      dismissed: true,
      updated_at: now
    };
    allStates.push(updatedState);
  }
  saveUserStates(allStates);
  try {
    broadcastChange({
      table: "user_notification_state",
      event: "UPDATE",
      schema: "public",
      new: updatedState,
      old: null,
      targetUserId: String(userId)
    });
  } catch (err) {
    console.error("Failed to broadcast dismiss state change:", err);
  }
  return true;
}

// server/routes/notifications.ts
var notificationsRouter = new Hono17();
async function getAuthenticatedUser3(c) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    token = c.req.query("token") || null;
  }
  if (!token) return null;
  return await resolveUserFromToken(token);
}
notificationsRouter.get("/", async (c) => {
  try {
    const user = await getAuthenticatedUser3(c);
    const includeDismissed = c.req.query("includeDismissed") === "true";
    const result = getNotificationsForUser(
      user ? String(user.id) : null,
      includeDismissed
    );
    return c.json(result);
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to fetch notifications" },
      500
    );
  }
});
notificationsRouter.post("/read-all", async (c) => {
  try {
    const user = await getAuthenticatedUser3(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const count = markAllNotificationsRead(String(user.id));
    return c.json({ success: true, count });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to mark all notifications as read" },
      500
    );
  }
});
notificationsRouter.post("/:id/read", async (c) => {
  try {
    const user = await getAuthenticatedUser3(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const state = markNotificationRead(String(user.id), id, true);
    if (!state) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true, state });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to mark notification as read" },
      500
    );
  }
});
notificationsRouter.post("/:id/unread", async (c) => {
  try {
    const user = await getAuthenticatedUser3(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const state = markNotificationRead(String(user.id), id, false);
    if (!state) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true, state });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to mark notification as unread" },
      500
    );
  }
});
notificationsRouter.post("/:id/dismiss", async (c) => {
  try {
    const user = await getAuthenticatedUser3(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const success = dismissNotification(String(user.id), id);
    if (!success) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to dismiss notification" },
      500
    );
  }
});

// server/routes/adminNotifications.ts
init_auth();
import { Hono as Hono18 } from "hono";
init_dataStore();
var adminNotificationsRouter = new Hono18();
adminNotificationsRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : c.req.query("token") || null;
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  c.set("user", user);
  await next();
});
adminNotificationsRouter.get("/", async (c) => {
  try {
    const notifications = getAllNotifications();
    return c.json({ notifications, total: notifications.length });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to fetch admin notifications" },
      500
    );
  }
});
adminNotificationsRouter.post("/", async (c) => {
  try {
    const adminUser = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { title, message, type, action_url, target_type, target_user } = body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return c.json({ error: "Notification title is required" }, 400);
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return c.json({ error: "Notification message is required" }, 400);
    }
    const validTypes = [
      "info",
      "announcement",
      "warning",
      "success",
      "alert"
    ];
    const notifType = validTypes.includes(type) ? type : "info";
    const targetType = target_type === "user" ? "user" : "all";
    let targetUserId = null;
    let targetUsername = null;
    if (targetType === "user") {
      if (!target_user || typeof target_user !== "string" || !target_user.trim()) {
        return c.json(
          { error: "Target username or user ID is required for direct notifications" },
          400
        );
      }
      const cleanTarget = target_user.trim();
      const foundUser = getUserByUsernameOrEmail(cleanTarget) || getUserById(cleanTarget);
      if (!foundUser) {
        return c.json(
          { error: `User "${cleanTarget}" was not found` },
          404
        );
      }
      targetUserId = String(foundUser.id);
      targetUsername = foundUser.username || cleanTarget;
    }
    const newNotification = createNotification({
      title: title.trim(),
      message: message.trim(),
      type: notifType,
      action_url: action_url || null,
      target_type: targetType,
      target_user_id: targetUserId,
      target_username: targetUsername,
      created_by: String(adminUser.id),
      created_by_username: adminUser.username || "Admin"
    });
    return c.json({ success: true, notification: newNotification }, 201);
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to create notification" },
      500
    );
  }
});
adminNotificationsRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const success = deleteNotification(id);
    if (!success) {
      return c.json({ error: "Notification not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to delete notification" },
      500
    );
  }
});
adminNotificationsRouter.get("/users", async (c) => {
  try {
    const query = (c.req.query("q") || "").trim().toLowerCase();
    const userIds = getAllUserIds();
    const users = [];
    for (const id of userIds) {
      const user = getUserById(id);
      if (!user) continue;
      const username = user.username || "";
      const email = user.email || "";
      if (!query || username.toLowerCase().includes(query) || email.toLowerCase().includes(query) || String(id) === query) {
        users.push({ id: String(id), username, email });
        if (users.length >= 20) break;
      }
    }
    return c.json({ users });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to search users" },
      500
    );
  }
});

// server/index.ts
import { createDefender } from "@oxygenlow/webdefender/hono";

// shared/seo.ts
var SITE_NAME = "Oxygen Low's Software";
var DEFAULT_BASE_URL = "https://oxygenlow.com";
var DEFAULT_OG_IMAGE = "https://oxygenlow.com/icons/icon-512x512.png";
var ALL_INTERNAL_NAV_LINKS = [
  { href: "/", label: "Home", description: "Main platform overview and tools" },
  {
    href: "/apps",
    label: "Apps",
    description: "Productivity, utility, and AI applications"
  },
  {
    href: "/apps/chatbot",
    label: "Chatbot",
    description: "AI chatbot and conversational assistants"
  },
  {
    href: "/apps/file-compressor",
    label: "File Compressor",
    description: "In-browser media and document compressor"
  },
  {
    href: "/apps/public-characters",
    label: "Public Characters",
    description: "Community-created AI characters and assets"
  },
  {
    href: "/apps/data-save",
    label: "Data Save",
    description: "Encrypted note and key-value storage"
  },
  {
    href: "/apps/qrcode-generator",
    label: "QR Code Generator",
    description: "Customizable QR code creator"
  },
  {
    href: "/apps/llm-agent",
    label: "LLM Agent",
    description: "Autonomous AI software engineering agent"
  },
  {
    href: "/apps/agent-search",
    label: "Agent Search",
    description: "Semantic web search for AI agents"
  },
  {
    href: "/apps/webdefender",
    label: "Web Defender",
    description: "API and website threat mitigation"
  },
  {
    href: "/apps/base64-encoder",
    label: "Base64 Encoder",
    description: "Encode and decode Base64 strings"
  },
  {
    href: "/apps/json-formatter",
    label: "JSON Formatter",
    description: "Format, validate, and beautify JSON"
  },
  {
    href: "/apps/vpn",
    label: "VPN",
    description: "Proxy and VPN configuration manager"
  },
  {
    href: "/apps/surveys",
    label: "Surveys",
    description: "Community hardware, browser, and gaming surveys"
  },
  {
    href: "/games",
    label: "Games",
    description: "Classic single-player and multiplayer web games"
  },
  {
    href: "/games/chess",
    label: "Chess",
    description: "Play chess against AI"
  },
  {
    href: "/games/minesweeper",
    label: "Minesweeper",
    description: "Classic Minesweeper puzzle game"
  },
  {
    href: "/games/solitaire",
    label: "Solitaire",
    description: "Classic Solitaire card game"
  },
  {
    href: "/games/poker",
    label: "Texas Hold'em Poker",
    description: "Heads-up poker game"
  },
  {
    href: "/games/sudoku",
    label: "Sudoku",
    description: "Classic Sudoku number puzzle"
  },
  {
    href: "/games/wordsearch",
    label: "Word Search",
    description: "Find hidden words puzzle game"
  },
  {
    href: "/download",
    label: "Download",
    description: "Download desktop and Android apps"
  },
  {
    href: "/changelogs",
    label: "Changelogs",
    description: "Software release history and updates"
  },
  {
    href: "/auth",
    label: "Sign In / Register",
    description: "Sign in or register for an account"
  },
  {
    href: "/privacy",
    label: "Privacy Policy",
    description: "Data protection and privacy practices"
  },
  {
    href: "/terms",
    label: "Terms of Use",
    description: "Terms and conditions of service"
  },
  { href: "/eula", label: "EULA", description: "End User Licence Agreement" },
  {
    href: "/dmca",
    label: "DMCA Policy",
    description: "Copyright takedown and counter-notice policy"
  },
  {
    href: "/acceptable-use",
    label: "Acceptable Use",
    description: "Usage guidelines and security policies"
  },
  {
    href: "/legal",
    label: "Legal",
    description: "Legal index and regulatory documentation"
  },
  {
    href: "/license",
    label: "License",
    description: "Open-source MIT license notice"
  },
  {
    href: "/support",
    label: "Support",
    description: "User support and issue reporting"
  }
];
var SEO_ROUTES = {
  "/": {
    path: "/",
    title: "Oxygen Low's Software - Modern Apps, Tools & Cloud Storage",
    description: "Oxygen Low's Software is a modern suite of web tools, AI utilities, privacy-focused applications, and encrypted cloud storage solutions.",
    canonicalPath: "/",
    h1: "Oxygen Low's Software",
    h2: [
      "Explore Web & Desktop Apps",
      "Privacy & Encrypted Storage",
      "AI Tools & Automation"
    ],
    keywords: [
      "software",
      "web apps",
      "ai tools",
      "cloud storage",
      "privacy",
      "file compressor",
      "chatbot",
      "web defender"
    ],
    ogType: "website",
    breadcrumbs: [{ name: "Home", url: "/" }],
    internalLinks: ALL_INTERNAL_NAV_LINKS.filter((l) => l.href !== "/")
  },
  "/apps": {
    path: "/apps",
    title: "Apps & Tools - Oxygen Low's Software",
    description: "Explore our collection of web and desktop apps including AI chatbots, file compressor, QR code generator, data storage, and web security tools.",
    canonicalPath: "/apps",
    h1: "Apps & Tools",
    h2: [
      "Utility Tools",
      "AI & LLM Applications",
      "Security & Protection",
      "Developer Utilities"
    ],
    keywords: [
      "apps",
      "utilities",
      "developer tools",
      "ai tools",
      "chatbot",
      "file compressor",
      "qr code generator"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" }
    ],
    internalLinks: [
      {
        href: "/apps/chatbot",
        label: "Chatbot",
        description: "Chat with intelligent AI models"
      },
      {
        href: "/apps/file-compressor",
        label: "File Compressor",
        description: "Compress media and documents in browser"
      },
      {
        href: "/apps/public-characters",
        label: "Public Characters",
        description: "Share and use community AI characters"
      },
      {
        href: "/apps/data-save",
        label: "Data Save",
        description: "Client-side encrypted data storage"
      },
      {
        href: "/apps/qrcode-generator",
        label: "QR Code Generator",
        description: "Generate custom QR codes"
      },
      {
        href: "/apps/llm-agent",
        label: "LLM Agent",
        description: "Autonomous AI coding agent"
      },
      {
        href: "/apps/agent-search",
        label: "Agent Search",
        description: "Semantic search engine for AI agents"
      },
      {
        href: "/apps/webdefender",
        label: "Web Defender",
        description: "DDoS and bot protection suite"
      },
      {
        href: "/apps/base64-encoder",
        label: "Base64 Encoder",
        description: "Encode and decode Base64 data"
      },
      {
        href: "/apps/json-formatter",
        label: "JSON Formatter",
        description: "Format and inspect JSON payloads"
      },
      {
        href: "/apps/vpn",
        label: "VPN",
        description: "VPN and proxy traffic manager"
      }
    ]
  },
  "/apps/chatbot": {
    path: "/apps/chatbot",
    title: "AI Chatbot - Oxygen Low's Software",
    description: "Chat and brainstorm with intelligent multi-model AI assistants. Fast, private, and versatile artificial intelligence conversation platform.",
    canonicalPath: "/apps/chatbot",
    h1: "AI Chatbot Assistant",
    h2: [
      "Multi-Model AI Conversations",
      "Private & Secure Chats",
      "Custom Character Personas"
    ],
    keywords: [
      "ai chatbot",
      "chatbot online",
      "conversational ai",
      "multi-model ai",
      "chat assistant"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Chatbot", url: "/apps/chatbot" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/public-characters", label: "Public AI Characters" },
      { href: "/apps/llm-agent", label: "LLM Agent" },
      { href: "/privacy", label: "Privacy Policy" }
    ],
    softwareType: "AI Chat Application"
  },
  "/apps/file-compressor": {
    path: "/apps/file-compressor",
    title: "File Compressor - Oxygen Low's Software",
    description: "Easily compress images, audio, video, and documents directly in your browser to save storage space and bandwidth with zero quality loss.",
    canonicalPath: "/apps/file-compressor",
    h1: "Online File Compressor",
    h2: [
      "Browser-Based Compression",
      "Image, Audio & Video Optimization",
      "Fast & Secure Processing"
    ],
    keywords: [
      "file compressor",
      "compress images",
      "compress video",
      "audio compression",
      "reduce file size"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "File Compressor", url: "/apps/file-compressor" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/data-save", label: "Data Save" },
      { href: "/apps/qrcode-generator", label: "QR Code Generator" }
    ],
    softwareType: "File Compression Utility"
  },
  "/apps/public-characters": {
    path: "/apps/public-characters",
    title: "Public Characters & Assets - Oxygen Low's Software",
    description: "Discover, download, and share community-created AI characters, custom prompts, creative universes, and digital assets.",
    canonicalPath: "/apps/public-characters",
    h1: "Public Characters & Assets",
    h2: [
      "Community AI Characters",
      "Custom Universes & Prompts",
      "Share Your Creations"
    ],
    keywords: [
      "ai characters",
      "custom personas",
      "prompt engineering",
      "public assets",
      "community characters"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Public Characters", url: "/apps/public-characters" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/chatbot", label: "AI Chatbot" },
      { href: "/terms", label: "Terms of Use" }
    ],
    softwareType: "Community Asset Directory"
  },
  "/apps/data-save": {
    path: "/apps/data-save",
    title: "Data Save - Oxygen Low's Software",
    description: "Securely store, organize, and manage encrypted data snippets, notes, and custom key-value pairs with client-side encryption.",
    canonicalPath: "/apps/data-save",
    h1: "Encrypted Data Save",
    h2: [
      "Zero-Knowledge Client Encryption",
      "Encrypted Note Storage",
      "Key-Value Snippet Manager"
    ],
    keywords: [
      "data storage",
      "encrypted notes",
      "secure snippet manager",
      "zero-knowledge encryption",
      "cloud data save"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Data Save", url: "/apps/data-save" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/file-compressor", label: "File Compressor" },
      { href: "/privacy", label: "Privacy Policy" }
    ],
    softwareType: "Encrypted Storage Utility"
  },
  "/apps/qrcode-generator": {
    path: "/apps/qrcode-generator",
    title: "QR Code Generator - Oxygen Low's Software",
    description: "Create custom high-resolution QR codes for websites, text, Wi-Fi networks, and contact details with instant download options.",
    canonicalPath: "/apps/qrcode-generator",
    h1: "Custom QR Code Generator",
    h2: [
      "Instant QR Code Creation",
      "URL & Wi-Fi Formatting",
      "High Resolution Vector Download"
    ],
    keywords: [
      "qr code generator",
      "create qr code",
      "free qr code maker",
      "wifi qr code",
      "url qr code"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "QR Code Generator", url: "/apps/qrcode-generator" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/base64-encoder", label: "Base64 Encoder" },
      { href: "/apps/json-formatter", label: "JSON Formatter" }
    ],
    softwareType: "QR Code Creation Tool"
  },
  "/apps/llm-agent": {
    path: "/apps/llm-agent",
    title: "LLM Agent - Oxygen Low's Software",
    description: "Autonomous AI coding and development agent that reads, edits, executes, and builds complex software projects in your environment.",
    canonicalPath: "/apps/llm-agent",
    h1: "Autonomous AI Coding Agent",
    h2: [
      "Automated Codebase Refactoring",
      "Multi-Step Task Planning",
      "Secure Local & Cloud Execution"
    ],
    keywords: [
      "ai coding agent",
      "llm agent",
      "autonomous developer agent",
      "ai pair programming",
      "code automation"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "LLM Agent", url: "/apps/llm-agent" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/agent-search", label: "Agent Search" },
      { href: "/apps/chatbot", label: "AI Chatbot" }
    ],
    softwareType: "Autonomous AI Development Agent"
  },
  "/apps/agent-search": {
    path: "/apps/agent-search",
    title: "Agent Search - Oxygen Low's Software",
    description: "Intelligent semantic search and web discovery engine optimized for autonomous AI agents, research workflows, and users.",
    canonicalPath: "/apps/agent-search",
    h1: "Intelligent Agent Search",
    h2: [
      "Semantic Web Discovery",
      "Optimized for AI Agents",
      "Fast & Unbiased Results"
    ],
    keywords: [
      "agent search",
      "ai search engine",
      "semantic search",
      "web research tool",
      "autonomous search"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Agent Search", url: "/apps/agent-search" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/llm-agent", label: "LLM Agent" },
      { href: "/apps/chatbot", label: "AI Chatbot" }
    ],
    softwareType: "AI Search Engine"
  },
  "/apps/webdefender": {
    path: "/apps/webdefender",
    title: "Web Defender - Oxygen Low's Software",
    description: "Protect websites and APIs with intelligent DDoS protection, rate limiting, bot mitigation, IP filtering, and threat blocking.",
    canonicalPath: "/apps/webdefender",
    h1: "Web Defender Security Suite",
    h2: [
      "DDoS & Rate Limit Protection",
      "Threat Actor & Bot Blocking",
      "Easy Middleware Integration"
    ],
    keywords: [
      "web defender",
      "web security",
      "ddos protection",
      "rate limiting middleware",
      "bot mitigation",
      "firewall"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Web Defender", url: "/apps/webdefender" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/vpn", label: "VPN Manager" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" }
    ],
    softwareType: "Web Security & Firewall Middleware"
  },
  "/apps/surveys": {
    path: "/apps/surveys",
    title: "Surveys - Oxygen Low's Software",
    description: "Participate in monthly anonymous hardware, browser, gaming, and community surveys. Explore live aggregated results and benchmark statistics.",
    canonicalPath: "/apps/surveys",
    h1: "Community & Hardware Surveys",
    h2: [
      "Hardware Survey Benchmark",
      "Browser & Gaming Trends",
      "Anonymous Monthly Statistics"
    ],
    keywords: [
      "surveys",
      "hardware survey",
      "gaming survey",
      "browser survey",
      "pc hardware statistics",
      "developer benchmarks"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Surveys", url: "/apps/surveys" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/game-library", label: "Game Library" },
      { href: "/games", label: "Games" }
    ],
    softwareType: "Survey & Statistics Web Application"
  },
  "/apps/base64-encoder": {
    path: "/apps/base64-encoder",
    title: "Base64 Encoder/Decoder - Oxygen Low's Software",
    description: "Easily encode and decode text, strings, and binary files with Base64 encoding tools directly in your browser.",
    canonicalPath: "/apps/base64-encoder",
    h1: "Base64 Encoder & Decoder",
    h2: [
      "Encode Text to Base64",
      "Decode Base64 Strings",
      "Instant In-Browser Conversion"
    ],
    keywords: [
      "base64 encoder",
      "base64 decoder",
      "base64 converter",
      "developer tools",
      "string encoder"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Base64 Encoder", url: "/apps/base64-encoder" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/json-formatter", label: "JSON Formatter" },
      { href: "/apps/qrcode-generator", label: "QR Code Generator" }
    ],
    softwareType: "Encoding Utility"
  },
  "/apps/json-formatter": {
    path: "/apps/json-formatter",
    title: "JSON Formatter - Oxygen Low's Software",
    description: "Format, validate, beautify, and inspect JSON payloads with real-time syntax checking and structure visualization.",
    canonicalPath: "/apps/json-formatter",
    h1: "JSON Formatter & Validator",
    h2: [
      "Beautify & Minify JSON",
      "Syntax Error Validation",
      "Tree Structure Inspector"
    ],
    keywords: [
      "json formatter",
      "json beautifier",
      "json validator",
      "json parser",
      "developer utilities"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "JSON Formatter", url: "/apps/json-formatter" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/base64-encoder", label: "Base64 Encoder" },
      { href: "/apps/data-save", label: "Data Save" }
    ],
    softwareType: "JSON Utility"
  },
  "/apps/vpn": {
    path: "/apps/vpn",
    title: "VPN - Oxygen Low's Software",
    description: "Manage and monitor secure proxy and VPN network configurations with real-time bandwidth and traffic tracking.",
    canonicalPath: "/apps/vpn",
    h1: "VPN & Proxy Manager",
    h2: [
      "Encrypted Network Tunnel",
      "Bandwidth Tracking",
      "Secure Remote Proxying"
    ],
    keywords: [
      "vpn",
      "proxy",
      "secure tunnel",
      "privacy vpn",
      "network manager"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "VPN", url: "/apps/vpn" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/webdefender", label: "Web Defender" },
      { href: "/privacy", label: "Privacy Policy" }
    ],
    softwareType: "VPN Utility"
  },
  "/games": {
    path: "/games",
    title: "Games - Oxygen Low's Software",
    description: "Play classic web games including Chess, Minesweeper, Solitaire, Sudoku, Poker, and Word Search directly in your browser.",
    canonicalPath: "/games",
    h1: "Classic Web Games",
    h2: [
      "Strategy & Board Games",
      "Card & Puzzle Games",
      "Singleplayer & Multiplayer"
    ],
    keywords: [
      "web games",
      "chess online",
      "minesweeper",
      "solitaire",
      "sudoku",
      "poker",
      "word search"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Games", url: "/games" }
    ],
    internalLinks: [
      { href: "/apps", label: "Apps & Tools" },
      { href: "/download", label: "Download Client" },
      { href: "/legal", label: "Legal" }
    ]
  },
  "/privacy": {
    path: "/privacy",
    title: "Privacy Policy - Oxygen Low's Software",
    description: "Learn how Oxygen Low's Software collects, protects, and manages your personal data in full compliance with UK GDPR, EU GDPR, and CCPA.",
    canonicalPath: "/privacy",
    h1: "Privacy Policy",
    h2: [
      "Information We Collect",
      "Data Protection & Rights",
      "Third-Party Processors & Safeguards"
    ],
    keywords: [
      "privacy policy",
      "data protection",
      "gdpr compliance",
      "ccpa",
      "oxygen low software privacy"
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Privacy Policy", url: "/privacy" }
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/legal", label: "Legal Index" },
      { href: "/eula", label: "EULA" },
      { href: "/acceptable-use", label: "Acceptable Use Policy" },
      { href: "/support", label: "Contact Support" }
    ]
  },
  "/terms": {
    path: "/terms",
    title: "Terms of Use - Oxygen Low's Software",
    description: "Read the Terms of Use and service rules governing your access to the Oxygen Low's Software web application, desktop client, and cloud services.",
    canonicalPath: "/terms",
    h1: "Terms of Use",
    h2: [
      "Acceptance of Terms",
      "Permitted Use & User Content",
      "Disclaimers & Liability"
    ],
    keywords: [
      "terms of use",
      "terms and conditions",
      "terms of service",
      "legal terms",
      "user agreement"
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Terms of Use", url: "/terms" }
    ],
    internalLinks: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/legal", label: "Legal Index" },
      { href: "/eula", label: "EULA" },
      { href: "/acceptable-use", label: "Acceptable Use Policy" },
      { href: "/dmca", label: "DMCA Policy" }
    ]
  },
  "/eula": {
    path: "/eula",
    title: "End User Licence Agreement - Oxygen Low's Software",
    description: "Review the End User Licence Agreement (EULA) defining software licence terms, permissions, intellectual property, and restrictions.",
    canonicalPath: "/eula",
    h1: "End User Licence Agreement",
    h2: [
      "Grant of Licence",
      "Licence Restrictions & Scope",
      "Intellectual Property Rights"
    ],
    keywords: [
      "eula",
      "end user licence agreement",
      "software licence",
      "software terms"
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "EULA", url: "/eula" }
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/license", label: "Open Source License" },
      { href: "/legal", label: "Legal Index" }
    ]
  },
  "/dmca": {
    path: "/dmca",
    title: "DMCA & Copyright Policy - Oxygen Low's Software",
    description: "Review our DMCA and Copyright Policy on reporting copyright infringement, counter-notices, and repeat infringer procedures.",
    canonicalPath: "/dmca",
    h1: "DMCA & Copyright Policy",
    h2: [
      "Reporting Copyright Infringement",
      "Designated Copyright Agent",
      "Counter-Notice Procedure"
    ],
    keywords: [
      "dmca policy",
      "copyright policy",
      "takedown notice",
      "intellectual property infringement"
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "DMCA Policy", url: "/dmca" }
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/acceptable-use", label: "Acceptable Use Policy" },
      { href: "/legal", label: "Legal Index" },
      { href: "/support", label: "Support" }
    ]
  },
  "/acceptable-use": {
    path: "/acceptable-use",
    title: "Acceptable Use Policy - Oxygen Low's Software",
    description: "Understand prohibited activities, security standards, and acceptable usage rules for all Oxygen Low's Software services and tools.",
    canonicalPath: "/acceptable-use",
    h1: "Acceptable Use Policy",
    h2: [
      "Prohibited Conduct & Abuse",
      "Security & AI Usage Standards",
      "Enforcement & Consequences"
    ],
    keywords: [
      "acceptable use policy",
      "aup",
      "prohibited activities",
      "platform rules",
      "security guidelines"
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "Acceptable Use", url: "/acceptable-use" }
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/dmca", label: "DMCA Policy" },
      { href: "/legal", label: "Legal Index" }
    ]
  },
  "/legal": {
    path: "/legal",
    title: "Legal - Oxygen Low's Software",
    description: "Central directory of legal policies, terms of service, privacy practices, licensing, and compliance documentation for Oxygen Low's Software.",
    canonicalPath: "/legal",
    h1: "Legal Documentation & Policies",
    h2: [
      "Terms of Use",
      "Privacy & Data Protection",
      "Licensing & Acceptable Use"
    ],
    keywords: [
      "legal",
      "policies",
      "terms of service",
      "privacy policy",
      "eula",
      "dmca",
      "mit license"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" }
    ],
    internalLinks: [
      {
        href: "/terms",
        label: "Terms of Use",
        description: "Governing rules and conditions"
      },
      {
        href: "/privacy",
        label: "Privacy Policy",
        description: "Data collection and protection"
      },
      {
        href: "/eula",
        label: "EULA",
        description: "End user software licence agreement"
      },
      {
        href: "/dmca",
        label: "DMCA Policy",
        description: "Copyright takedowns and notices"
      },
      {
        href: "/acceptable-use",
        label: "Acceptable Use",
        description: "Prohibited conduct standards"
      },
      {
        href: "/license",
        label: "License",
        description: "Open-source MIT license"
      }
    ]
  },
  "/license": {
    path: "/license",
    title: "License - Oxygen Low's Software",
    description: "Open-source software license terms and MIT License notice for Oxygen Low's Software repository and libraries.",
    canonicalPath: "/license",
    h1: "Open Source License",
    h2: [
      "MIT License Terms",
      "Source Code Redistribution",
      "Third-Party Licences"
    ],
    keywords: [
      "license",
      "mit license",
      "open source software",
      "copyright notice"
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "License", url: "/license" }
    ],
    internalLinks: [
      { href: "/legal", label: "Legal Index" },
      { href: "/terms", label: "Terms of Use" },
      { href: "/eula", label: "EULA" }
    ]
  },
  "/download": {
    path: "/download",
    title: "Download - Oxygen Low's Software",
    description: "Download official desktop and Android application installers for Oxygen Low's Software for fast, local access.",
    canonicalPath: "/download",
    h1: "Download Applications",
    h2: [
      "Windows Desktop Client",
      "Android Application",
      "System Requirements"
    ],
    keywords: [
      "download software",
      "desktop app",
      "android apk",
      "download client",
      "install software"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Download", url: "/download" }
    ],
    internalLinks: [
      { href: "/apps", label: "Web Apps" },
      { href: "/changelogs", label: "Release Notes" },
      { href: "/support", label: "Support" }
    ]
  },
  "/changelogs": {
    path: "/changelogs",
    title: "Changelogs - Oxygen Low's Software",
    description: "Stay up to date with new features, updates, improvements, and releases across Oxygen Low's Software.",
    canonicalPath: "/changelogs",
    h1: "Changelogs & Release Notes",
    h2: ["Latest Updates", "Feature Additions", "Performance & Bug Fixes"],
    keywords: [
      "changelogs",
      "release notes",
      "software updates",
      "version history",
      "patch notes"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Changelogs", url: "/changelogs" }
    ],
    internalLinks: [
      { href: "/apps", label: "Apps" },
      { href: "/download", label: "Download App" },
      { href: "/support", label: "Support" }
    ]
  },
  "/support": {
    path: "/support",
    title: "Support - Oxygen Low's Software",
    description: "Get help, submit support tickets, report issues, and access platform documentation for Oxygen Low's Software.",
    canonicalPath: "/support",
    h1: "Support & Help Center",
    h2: [
      "Submit Support Ticket",
      "Account & Technical Assistance",
      "Frequently Asked Questions"
    ],
    keywords: [
      "support",
      "help center",
      "support ticket",
      "customer service",
      "troubleshooting"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Support", url: "/support" }
    ],
    internalLinks: [
      { href: "/legal", label: "Legal Documentation" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" }
    ]
  },
  "/auth": {
    path: "/auth",
    title: "Sign In / Register - Oxygen Low's Software",
    description: "Sign in or create an account on Oxygen Low's Software to access encrypted cloud storage, customizable tools, and apps.",
    canonicalPath: "/auth",
    h1: "Account Sign In & Registration",
    h2: ["Sign In", "Create Account", "Secure Authentication"],
    keywords: ["login", "sign in", "create account", "register", "auth"],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Sign In", url: "/auth" }
    ],
    internalLinks: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
      { href: "/apps", label: "Apps" }
    ]
  }
};
function getSeoMetadata(pathname) {
  const cleanPath = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (SEO_ROUTES[cleanPath]) {
    return SEO_ROUTES[cleanPath];
  }
  if (cleanPath === "/webdefender" || cleanPath === "/defender" || cleanPath === "/apps/defender") {
    return SEO_ROUTES["/apps/webdefender"];
  }
  if (cleanPath === "/apps/public-assets") {
    return SEO_ROUTES["/apps/public-characters"];
  }
  if (cleanPath.startsWith("/apps/")) {
    const appId = cleanPath.slice("/apps/".length);
    const readableName = appId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return {
      path: cleanPath,
      title: `${readableName} - Oxygen Low's Software`,
      description: `Use ${readableName} on Oxygen Low's Software. Fast, secure, and modern productivity and utility tools built for web and desktop.`,
      canonicalPath: cleanPath,
      h1: readableName,
      h2: ["Application Features", "Usage & Tools"],
      keywords: [appId, "web app", "utility", "tools", "oxygen low software"],
      ogType: "website",
      breadcrumbs: [
        { name: "Home", url: "/" },
        { name: "Apps", url: "/apps" },
        { name: readableName, url: cleanPath }
      ],
      internalLinks: [
        { href: "/apps", label: "All Apps" },
        { href: "/", label: "Home" }
      ]
    };
  }
  if (cleanPath.startsWith("/games/")) {
    const gameId = cleanPath.slice("/games/".length);
    const readableName = gameId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return {
      path: cleanPath,
      title: `${readableName} - Games - Oxygen Low's Software`,
      description: `Play ${readableName} online for free directly in your browser on Oxygen Low's Software. Fast, responsive, and fun web games.`,
      canonicalPath: cleanPath,
      h1: readableName,
      h2: ["Play Game", "Rules & Instructions"],
      keywords: [
        gameId,
        "online game",
        "web game",
        "free game",
        "oxygen low software"
      ],
      ogType: "website",
      breadcrumbs: [
        { name: "Home", url: "/" },
        { name: "Games", url: "/games" },
        { name: readableName, url: cleanPath }
      ],
      internalLinks: [
        { href: "/games", label: "All Games" },
        { href: "/apps", label: "Apps" }
      ]
    };
  }
  return {
    path: cleanPath,
    title: "Oxygen Low's Software",
    description: "Oxygen Low's Software - Modern web applications, tools, and encrypted cloud storage.",
    canonicalPath: cleanPath,
    h1: "Oxygen Low's Software",
    h2: ["Explore Platform Features", "Apps & Tools"],
    keywords: ["software", "web apps", "cloud storage", "privacy"],
    ogType: "website",
    breadcrumbs: [{ name: "Home", url: "/" }],
    internalLinks: ALL_INTERNAL_NAV_LINKS
  };
}
function generateJsonLd(metadata, baseUrl = DEFAULT_BASE_URL) {
  const canonicalUrl = `${baseUrl}${metadata.canonicalPath === "/" ? "" : metadata.canonicalPath}`;
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: baseUrl,
    description: "A modern platform for apps, AI utilities, and encrypted cloud storage.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/apps/agent-search?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: baseUrl,
    logo: `${baseUrl}/icons/icon-512x512.png`,
    sameAs: ["https://github.com/Oxygen-Low"]
  };
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": metadata.ogType === "article" ? "TechArticle" : "WebPage",
    name: metadata.title,
    headline: metadata.h1,
    description: metadata.description,
    url: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: baseUrl
    }
  };
  if (metadata.breadcrumbs && metadata.breadcrumbs.length > 0) {
    webPageSchema.breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: metadata.breadcrumbs.map((b, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: b.name,
        item: `${baseUrl}${b.url}`
      }))
    };
  }
  const schemas = [
    websiteSchema,
    organizationSchema,
    webPageSchema
  ];
  if (metadata.softwareType) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: metadata.h1,
      operatingSystem: "Web, Windows, Android",
      applicationCategory: metadata.softwareType,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      },
      url: canonicalUrl
    });
  }
  return schemas;
}
function injectSeoTags(html, pathname, baseUrl = DEFAULT_BASE_URL) {
  const metadata = getSeoMetadata(pathname);
  const canonicalUrl = `${baseUrl}${metadata.canonicalPath === "/" ? "" : metadata.canonicalPath}`;
  const jsonLdSchemas = generateJsonLd(metadata, baseUrl);
  let modifiedHtml = html;
  if (/<title>.*?<\/title>/i.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(
      /<title>.*?<\/title>/i,
      `<title>${escapeHtml(metadata.title)}</title>`
    );
  } else {
    modifiedHtml = modifiedHtml.replace(
      /<head>/i,
      `<head>
    <title>${escapeHtml(metadata.title)}</title>`
    );
  }
  const metaDescTag = `<meta name="description" content="${escapeHtml(metadata.description)}" />`;
  if (/<meta\s+name=["']description["'][^>]*>/i.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(
      /<meta\s+name=["']description["'][^>]*>/i,
      metaDescTag
    );
  } else {
    modifiedHtml = modifiedHtml.replace(
      /<title>.*?<\/title>/i,
      (m) => `${m}
    ${metaDescTag}`
    );
  }
  const canonicalTag = `<link rel="canonical" href="${canonicalUrl}" />`;
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      canonicalTag
    );
  } else {
    modifiedHtml = modifiedHtml.replace(
      /<meta\s+name=["']description["'][^>]*>/i,
      (m) => `${m}
    ${canonicalTag}`
    );
  }
  const ogTags = [
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:type" content="${metadata.ogType || "website"}" />`,
    `<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`
  ];
  if (metadata.keywords && metadata.keywords.length > 0) {
    ogTags.push(
      `<meta name="keywords" content="${escapeHtml(metadata.keywords.join(", "))}" />`
    );
  }
  modifiedHtml = modifiedHtml.replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, "").replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, "").replace(/<meta\s+name=["']keywords["'][^>]*>\s*/gi, "").replace(
    /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    ""
  );
  const jsonLdScripts = jsonLdSchemas.map(
    (schema) => `    <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
    </script>`
  ).join("\n");
  const seoBlock = `
    ${ogTags.join("\n    ")}
${jsonLdScripts}`;
  modifiedHtml = modifiedHtml.replace(
    new RegExp(
      `<link\\s+rel=["']canonical["']\\s+href=["']${escapeRegex(canonicalUrl)}["']\\s*\\/?>`,
      "i"
    ),
    (m) => `${m}${seoBlock}`
  );
  const linksHtml = (metadata.internalLinks || ALL_INTERNAL_NAV_LINKS).map(
    (l) => `<li><a href="${l.href}">${escapeHtml(l.label)}</a>${l.description ? ` - ${escapeHtml(l.description)}` : ""}</li>`
  ).join("\n        ");
  const fallbackContent = `<div class="initial-loader">
        <div class="initial-spinner"></div>
      </div>
      <header class="sr-only">
        <h1>${escapeHtml(metadata.h1)}</h1>
        <p>${escapeHtml(metadata.description)}</p>
      </header>
      <nav aria-label="Site Navigation" class="sr-only">
        <ul>
        ${linksHtml}
        </ul>
      </nav>`;
  modifiedHtml = modifiedHtml.replace(
    /<div id="root">[\s\S]*?<\/div>(?=\s*(?:<noscript|<script|<\/body|$))/i,
    `<div id="root">
      ${fallbackContent}
    </div>`
  );
  return modifiedHtml;
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// server/index.ts
init_dataStore();
setRealtimeBroadcast(broadcastChange);
var app = new Hono19();
app.use(compress());
var defenderPromise = null;
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/webdefender") || c.req.path.startsWith("/api/defender") || c.req.path.startsWith("/api/storage") || c.req.path.startsWith("/api/auth") || c.req.path.startsWith("/api/data") || c.req.path.startsWith("/api/surveys")) {
    return next();
  }
  if (!defenderPromise) {
    defenderPromise = createDefender(
      {
        apiKey: process.env.DEFENDER_API_KEY || "",
        apiUrl: process.env.DEFENDER_API_URL || "https://oxygenlow.com"
      },
      app
    );
  }
  const middleware = await defenderPromise;
  return middleware(c, next);
});
var ALLOWED_ORIGINS = ["https://oxygenlow.com", "https://www.oxygenlow.com"];
function isAllowedOrigin(origin) {
  if (!origin) return void 0;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return void 0;
}
app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'wasm-unsafe-eval'",
        "blob:",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net"
      ],
      // required for Vite HMR in dev and FFmpeg WASM
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "data:", "https:"],
      connectSrc: [
        "'self'",
        "blob:",
        "data:",
        "http://127.0.0.1:*",
        "http://localhost:*",
        "ws://127.0.0.1:*",
        "ws://localhost:*",
        "http://127.0.0.1:11434",
        "http://127.0.0.1:1234",
        "http://127.0.0.1:5001",
        "http://127.0.0.1:5000",
        "http://localhost:11434",
        "http://localhost:1234",
        "http://localhost:5001",
        "http://localhost:5000",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://oai.stablehorde.net",
        "https://stablehorde.net",
        "https://api.cloudflare.com",
        "https://api.openai.com",
        "https://api.anthropic.com",
        "https://generativelanguage.googleapis.com",
        "https://openrouter.ai",
        "https://api.x.ai"
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    },
    crossOriginOpenerPolicy: "same-origin",
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: "cross-origin",
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=31536000; includeSubDomains"
  })
);
app.use(
  cors({
    origin: (origin) => isAllowedOrigin(origin) ?? "",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-github-token"]
  })
);
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") || crypto.randomUUID();
  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
});
function getLinkHeaders() {
  return [
    '</.well-known/api-catalog>; rel="api-catalog"',
    '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.0"',
    '</api/docs>; rel="service-doc"; type="text/html"',
    '</llms.txt>; rel="describedby"; type="text/plain"',
    '</auth.md>; rel="describedby"; type="text/markdown"',
    '</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"',
    '</.well-known/oauth-authorization-server>; rel="oauth-authorization-server"'
  ].join(", ");
}
app.use("*", async (c, next) => {
  const path9 = c.req.path;
  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/markdown") && !path9.startsWith("/api/") && !path9.startsWith("/.well-known/") && path9 !== "/auth.md" && path9 !== "/llms.txt" && path9 !== "/robots.txt" && path9 !== "/sitemap.xml") {
    const seo = getSeoMetadata(path9);
    const links = (seo.internalLinks || ALL_INTERNAL_NAV_LINKS).map(
      (l) => `- [${l.label}](${l.href})${l.description ? `: ${l.description}` : ""}`
    ).join("\n");
    const h2Sections = seo.h2 && seo.h2.length > 0 ? `

## Key Topics
${seo.h2.map((h) => `- ${h}`).join("\n")}` : "";
    const md = `# ${seo.title}

${seo.description}${h2Sections}

## Related Links
${links}`;
    const tokens = md.split(/\s+/).length.toString();
    return c.text(md, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "x-markdown-tokens": tokens,
      Link: getLinkHeaders()
    });
  }
  await next();
});
app.use("*", async (c, next) => {
  const path9 = c.req.path;
  const isAsset = path9.startsWith("/api/") || path9.startsWith("/.well-known/") || /\.(js|css|png|ico|svg|woff2?|ttf|eot|map|json|xml|txt|jpg|jpeg|gif|webp)$/i.test(
    path9
  );
  if (!isAsset) {
    c.header("Link", getLinkHeaders());
  }
  await next();
  if (!isAsset) {
    c.header("Link", getLinkHeaders());
  }
});
app.get("/health", (c) => c.text("OK"));
app.get("/api/ping", (c) => c.json({ message: "ping" }));
app.get("/sitemap.xml", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const urls = [
    {
      loc: `${baseUrl}/`,
      changefreq: "daily",
      priority: "1.0",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps`,
      changefreq: "daily",
      priority: "0.9",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/chatbot`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/file-compressor`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/public-characters`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/data-save`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/qrcode-generator`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/llm-agent`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/agent-search`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/webdefender`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/base64-encoder`,
      changefreq: "weekly",
      priority: "0.7",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/json-formatter`,
      changefreq: "weekly",
      priority: "0.7",
      lastmod: today
    },
    {
      loc: `${baseUrl}/apps/vpn`,
      changefreq: "weekly",
      priority: "0.7",
      lastmod: today
    },
    {
      loc: `${baseUrl}/games`,
      changefreq: "daily",
      priority: "0.9",
      lastmod: today
    },
    {
      loc: `${baseUrl}/games/chess`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/games/minesweeper`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/games/solitaire`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/games/poker`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/games/sudoku`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/games/wordsearch`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/download`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: today
    },
    {
      loc: `${baseUrl}/changelogs`,
      changefreq: "weekly",
      priority: "0.7",
      lastmod: today
    },
    {
      loc: `${baseUrl}/auth`,
      changefreq: "monthly",
      priority: "0.7",
      lastmod: today
    },
    {
      loc: `${baseUrl}/privacy`,
      changefreq: "monthly",
      priority: "0.5",
      lastmod: today
    },
    {
      loc: `${baseUrl}/terms`,
      changefreq: "monthly",
      priority: "0.5",
      lastmod: today
    },
    {
      loc: `${baseUrl}/eula`,
      changefreq: "monthly",
      priority: "0.5",
      lastmod: today
    },
    {
      loc: `${baseUrl}/dmca`,
      changefreq: "monthly",
      priority: "0.5",
      lastmod: today
    },
    {
      loc: `${baseUrl}/acceptable-use`,
      changefreq: "monthly",
      priority: "0.5",
      lastmod: today
    },
    {
      loc: `${baseUrl}/legal`,
      changefreq: "monthly",
      priority: "0.6",
      lastmod: today
    },
    {
      loc: `${baseUrl}/license`,
      changefreq: "monthly",
      priority: "0.5",
      lastmod: today
    },
    {
      loc: `${baseUrl}/support`,
      changefreq: "monthly",
      priority: "0.6",
      lastmod: today
    }
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  ).join("\n")}
</urlset>`;
  return c.text(sitemap, 200, {
    "Content-Type": "application/xml",
    "Cache-Control": "public, max-age=3600"
  });
});
app.get("/auth.md", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  const content = `# auth.md

This document describes how AI agents and automated clients can authenticate with **Oxygen Low's Software** (\`${baseUrl}\`).

## Agent Audience

This service is open to any AI agent or automated client. Agents may access public resources anonymously or register for a bearer token to access authenticated endpoints.

## Discovery Documents

- **OAuth Protected Resource Metadata**: \`${baseUrl}/.well-known/oauth-protected-resource\`
- **OAuth Authorization Server Metadata**: \`${baseUrl}/.well-known/oauth-authorization-server\`

The authorization server metadata includes a machine-readable \`agent_auth\` block that describes all supported registration flows.

## Registration Endpoint

- **Register**: \`POST ${baseUrl}/agent/auth\`
- **Revoke**: \`POST ${baseUrl}/agent/auth/revoke\`
- **Claim**: \`GET ${baseUrl}/agent/auth/claim\`

## Supported Authentication Methods

### 1. Identity Assertion \u2014 ID-JAG (JWT Authorization Grant)

Agents with a signed JWT Authorization Grant can exchange it for a bearer token.

- **Assertion type**: \`urn:ietf:params:oauth:token-type:id-jag\`
- **Credential type**: \`bearer\`
- **Register**: \`POST ${baseUrl}/agent/auth\` with assertion in request body
- **Revoke**: \`POST ${baseUrl}/agent/auth/revoke\`
- **Revocation event**: \`urn:ietf:params:oauth:event-type:token-revoked\`

### 2. Identity Assertion \u2014 Verified Email

Agents with a verified email identity claim can register and obtain a bearer token.

- **Assertion type**: \`verified_email\`
- **Credential type**: \`bearer\`
- **Register**: \`POST ${baseUrl}/agent/auth\` with email assertion
- **Claim**: \`GET ${baseUrl}/agent/auth/claim\`

### 3. Anonymous Access

Agents without an identity can obtain an anonymous bearer token for access to public resources.

- **Credential type**: \`bearer\`
- **Claim**: \`GET ${baseUrl}/agent/auth/claim\`

## Using Credentials

All bearer tokens must be sent in the HTTP \`Authorization\` header:

\`\`\`
Authorization: Bearer <token>
\`\`\`

Tokens provide access to API resources scoped under the permissions granted at registration time. See the Authorization Server metadata for the full list of supported scopes.
`;
  return c.text(content, 200, {
    "Content-Type": "text/markdown",
    "Cache-Control": "public, max-age=3600"
  });
});
app.get("/.well-known/oauth-protected-resource", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  return c.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"]
  });
});
app.get("/.well-known/oauth-authorization-server", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  return c.json(
    {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      scopes_supported: ["read", "write"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials"],
      agent_auth: {
        skill: "agent-registration",
        register_uri: `${baseUrl}/agent/auth`,
        methods: [
          {
            identity_types_supported: ["identity_assertion"],
            identity_assertion: {
              assertion_types_supported: [
                "urn:ietf:params:oauth:token-type:id-jag"
              ]
            },
            credential_types_supported: ["bearer"],
            revocation_uri: `${baseUrl}/agent/auth/revoke`,
            events_supported: [
              "urn:ietf:params:oauth:event-type:token-revoked"
            ]
          },
          {
            identity_types_supported: ["identity_assertion"],
            identity_assertion: {
              assertion_types_supported: ["verified_email"]
            },
            credential_types_supported: ["bearer"],
            claim_uri: `${baseUrl}/agent/auth/claim`
          },
          {
            identity_types_supported: ["anonymous"],
            anonymous: {
              credential_types_supported: ["bearer"]
            },
            claim_uri: `${baseUrl}/agent/auth/claim`
          }
        ]
      }
    },
    200,
    {
      "Cache-Control": "public, max-age=3600"
    }
  );
});
app.get("/.well-known/api-catalog", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  const catalog = {
    linkset: [
      {
        anchor: `${baseUrl}/api`,
        "service-desc": [
          {
            href: `${baseUrl}/api/openapi.json`,
            type: "application/vnd.oai.openapi+json;version=3.0"
          }
        ],
        "service-doc": [
          {
            href: `${baseUrl}/api/docs`,
            type: "text/html"
          }
        ],
        status: [
          {
            href: `${baseUrl}/health`,
            type: "application/json"
          }
        ]
      },
      {
        anchor: `${baseUrl}/api/ai`,
        "service-desc": [
          {
            href: `${baseUrl}/api/openapi.json#/paths/~1api~1ai`,
            type: "application/vnd.oai.openapi+json;version=3.0"
          }
        ],
        "service-doc": [
          {
            href: `${baseUrl}/api/docs#ai`,
            type: "text/html"
          }
        ]
      },
      {
        anchor: `${baseUrl}/api/changelogs`,
        "service-desc": [
          {
            href: `${baseUrl}/api/openapi.json#/paths/~1api~1changelogs`,
            type: "application/vnd.oai.openapi+json;version=3.0"
          }
        ],
        "service-doc": [
          {
            href: `${baseUrl}/api/docs#changelogs`,
            type: "text/html"
          }
        ]
      }
    ]
  };
  return c.json(catalog, 200, {
    "Content-Type": "application/linkset+json",
    "Cache-Control": "public, max-age=3600"
  });
});
app.post("/agent/auth", async (c) => {
  return c.json({
    status: "ok",
    message: "Agent authentication endpoint",
    token_type: "bearer"
  });
});
app.post("/agent/auth/revoke", async (c) => {
  return c.json({
    status: "ok",
    message: "Agent token revocation endpoint"
  });
});
app.all("/agent/auth/claim", async (c) => {
  return c.json({
    status: "ok",
    message: "Agent token claim endpoint",
    token_type: "bearer"
  });
});
app.get("/api/openapi.json", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  const openapiSpec = {
    openapi: "3.0.3",
    info: {
      title: "Oxygen Low's Software API",
      version: "1.0.0",
      description: "API services for Oxygen Low's Software platform, including AI agents, changelogs, VPN, support, and authentication metadata.",
      contact: {
        name: "Oxygen Low's Software Support",
        url: `${baseUrl}/legal`
      }
    },
    servers: [
      {
        url: baseUrl,
        description: "Current environment"
      }
    ],
    paths: {
      "/health": {
        get: {
          summary: "Health Check",
          description: "Returns health status of the server.",
          responses: {
            "200": {
              description: "Server is healthy",
              content: {
                "text/plain": { schema: { type: "string", example: "OK" } }
              }
            }
          }
        }
      },
      "/api/ping": {
        get: {
          summary: "Ping",
          description: "Ping the API server.",
          responses: {
            "200": {
              description: "Ping response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string", example: "ping" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/demo": {
        get: {
          summary: "Demo Endpoint",
          description: "Demonstration API endpoint.",
          responses: {
            "200": {
              description: "Demo message",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { message: { type: "string" } }
                  }
                }
              }
            }
          }
        }
      },
      "/api/ai": {
        post: {
          summary: "AI Prompt Completion",
          description: "Process prompts with AI models.",
          responses: {
            "200": {
              description: "AI response"
            }
          }
        }
      },
      "/api/changelogs": {
        get: {
          summary: "Changelogs",
          description: "Retrieve public changelog updates.",
          responses: {
            "200": {
              description: "List of changelog entries"
            }
          }
        }
      },
      "/api/vpn": {
        get: {
          summary: "VPN Status",
          description: "Retrieve VPN configuration and connection status.",
          responses: {
            "200": {
              description: "VPN status response"
            }
          }
        }
      },
      "/api/webdefender": {
        get: {
          summary: "Web Defender Status",
          description: "Retrieve Web Defender protection status.",
          responses: {
            "200": {
              description: "Web Defender status"
            }
          }
        }
      },
      "/api/defender": {
        get: {
          summary: "Defender Status (Legacy)",
          description: "Retrieve Web Defender protection status.",
          responses: {
            "200": {
              description: "Defender status"
            }
          }
        }
      },
      "/.well-known/api-catalog": {
        get: {
          summary: "RFC 9727 API Catalog",
          description: "Machine-readable API catalog in linkset JSON format.",
          responses: {
            "200": {
              description: "API catalog linkset",
              content: { "application/linkset+json": {} }
            }
          }
        }
      },
      "/.well-known/oauth-authorization-server": {
        get: {
          summary: "OAuth Authorization Server Metadata",
          description: "RFC 8414 OAuth 2.0 metadata with agent auth flows.",
          responses: {
            "200": {
              description: "OAuth authorization metadata",
              content: { "application/json": {} }
            }
          }
        }
      },
      "/.well-known/oauth-protected-resource": {
        get: {
          summary: "OAuth Protected Resource Metadata",
          description: "RFC 9728 OAuth 2.0 protected resource metadata.",
          responses: {
            "200": {
              description: "OAuth protected resource metadata",
              content: { "application/json": {} }
            }
          }
        }
      },
      "/auth.md": {
        get: {
          summary: "Agent Authentication Guide",
          description: "Markdown documentation for agent registration and authentication.",
          responses: {
            "200": {
              description: "Authentication guide markdown",
              content: { "text/markdown": {} }
            }
          }
        }
      },
      "/llms.txt": {
        get: {
          summary: "LLMs Discovery File",
          description: "Standard llms.txt file detailing site purpose and links for AI agents.",
          responses: {
            "200": {
              description: "llms.txt content",
              content: { "text/plain": {} }
            }
          }
        }
      }
    }
  };
  return c.json(openapiSpec, 200, {
    "Content-Type": "application/vnd.oai.openapi+json;version=3.0",
    "Cache-Control": "public, max-age=3600",
    Link: getLinkHeaders()
  });
});
app.get("/api/docs", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Oxygen Low's Software - API Documentation</title>
  <!-- RFC 8288 / RFC 9727 Discovery Links -->
  <link rel="api-catalog" href="/.well-known/api-catalog" type="application/linkset+json" />
  <link rel="service-desc" href="/api/openapi.json" type="application/vnd.oai.openapi+json;version=3.0" />
  <link rel="service-doc" href="/api/docs" type="text/html" />
  <link rel="describedby" href="/llms.txt" type="text/plain" />
  <link rel="describedby" href="/auth.md" type="text/markdown" />
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --tag-get: #10b981;
      --tag-post: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container { max-width: 900px; margin: 0 auto; }
    header { margin-bottom: 2.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.5rem; }
    p.subtitle { color: var(--text-muted); font-size: 1.1rem; }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: bold;
      background: #1e293b;
      color: var(--accent);
      margin-top: 0.5rem;
    }
    .discovery-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 2rem;
    }
    .discovery-box h2 { font-size: 1.2rem; margin-bottom: 0.75rem; color: var(--accent); }
    .discovery-box ul { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
    .discovery-box li { display: flex; align-items: center; justify-content: space-between; font-size: 0.95rem; }
    .discovery-box a { color: var(--accent); text-decoration: none; word-break: break-all; }
    .discovery-box a:hover { text-decoration: underline; }
    .endpoint {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .endpoint-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
    .method {
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: bold;
      text-transform: uppercase;
    }
    .method.get { background: rgba(16, 185, 129, 0.2); color: var(--tag-get); }
    .method.post { background: rgba(59, 130, 246, 0.2); color: var(--tag-post); }
    .path { font-family: monospace; font-size: 1rem; font-weight: 600; color: #fff; }
    .desc { color: var(--text-muted); font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Oxygen Low's Software API Documentation</h1>
      <p class="subtitle">Machine-readable and interactive API documentation for humans and autonomous agents.</p>
      <span class="badge">OpenAPI 3.0.3 Compatible</span>
    </header>

    <section class="discovery-box">
      <h2>Agent Discovery & Machine-Readable Specifications</h2>
      <ul>
        <li>
          <span><strong>API Catalog (RFC 9727):</strong></span>
          <a href="${baseUrl}/.well-known/api-catalog">${baseUrl}/.well-known/api-catalog</a>
        </li>
        <li>
          <span><strong>OpenAPI Specification:</strong></span>
          <a href="${baseUrl}/api/openapi.json">${baseUrl}/api/openapi.json</a>
        </li>
        <li>
          <span><strong>LLMs Description:</strong></span>
          <a href="${baseUrl}/llms.txt">${baseUrl}/llms.txt</a>
        </li>
        <li>
          <span><strong>Agent Authentication (auth.md):</strong></span>
          <a href="${baseUrl}/auth.md">${baseUrl}/auth.md</a>
        </li>
      </ul>
    </section>

    <h2 style="margin-bottom: 1rem; font-size: 1.3rem;">Core Endpoints</h2>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/health</span>
      </div>
      <div class="desc">System health check endpoint returning 200 OK.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/api/ping</span>
      </div>
      <div class="desc">Lightweight ping endpoint returning {"message": "ping"}.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/api/openapi.json</span>
      </div>
      <div class="desc">Returns the full OpenAPI 3.0 JSON specification.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/api/changelogs</span>
      </div>
      <div class="desc">Retrieves software changelogs and platform release history.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method post">POST</span>
        <span class="path">/agent/auth</span>
      </div>
      <div class="desc">Agent registration and identity assertion exchange endpoint.</div>
    </div>
  </div>
</body>
</html>`;
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=3600",
    Link: getLinkHeaders()
  });
});
app.get("/llms.txt", (c) => {
  const content = `# Oxygen Low's Software

Oxygen Low's Software is a platform for apps, storage, and customization.

## Resources
- [Main Website](/)
- [API Documentation](/api/docs)
- [API Catalog](/.well-known/api-catalog)
- [OpenAPI Specification](/api/openapi.json)
- [Agent Authentication](/auth.md)
- [Contact Support](/support)
- [About Us](/about)
`;
  return c.text(content, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    Link: getLinkHeaders()
  });
});
app.get("/robots.txt", (c) => {
  const host = c.req.header("host") || "oxygenlow.com";
  const protocol = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;
  const content = `User-agent: *
Allow: /
Sitemap: ${baseUrl}/sitemap.xml
Content-Signal: ai-train=yes, search=yes, ai-input=yes
`;
  return c.text(content, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600"
  });
});
app.route("/api/demo", demoRouter);
app.route("/api/proxy", proxyRouter);
app.route("/api/admin/support", adminSupportRouter);
app.route("/api/admin/verifications", adminVerificationRouter);
app.route("/api/assets", assetsRouter);
app.route("/api/ai", aiRouter);
app.route("/api/ai/agent-search", agentSearchRouter);
app.route("/api/changelogs", changelogsRouter);
app.route("/api/vpn", vpnRouter);
app.route("/api/webdefender", defenderRouter);
app.route("/api/defender", defenderRouter);
app.route("/api/storage", storageRouter);
app.route("/api/auth", authRouter);
app.route("/api/data", dataRouter);
app.route("/api/surveys", surveysRouter);
app.route("/api/realtime", realtimeRouter);
app.route("/api/software-awards", softwareAwardsRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/admin/notifications", adminNotificationsRouter);
var index_default = app;

// server/serve.ts
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs8 from "node:fs";
import path8 from "node:path";
if (process.env.NODE_ENV === "production") {
  index_default.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    }
  });
  index_default.get("*", serveStatic({ root: "./dist/spa" }));
  let indexHtml = "";
  try {
    indexHtml = fs8.readFileSync(path8.resolve("./dist/spa/index.html"), "utf-8");
  } catch (e) {
    console.error("Could not load index.html", e);
  }
  index_default.get("*", (c) => {
    const reqPath = c.req.path;
    if (reqPath.startsWith("/api/") || reqPath.startsWith("/assets/") || /\.(js|css|wasm|map|json|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|mp3|wav|ogg)$/i.test(
      reqPath
    )) {
      return c.notFound();
    }
    if (indexHtml) {
      const host = c.req.header("host") || "oxygenlow.com";
      const protoHeader = c.req.header("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      const protocol = protoHeader.split(",")[0].trim();
      const baseUrl = `${protocol}://${host}`;
      const renderedHtml = injectSeoTags(indexHtml, reqPath, baseUrl);
      return c.html(renderedHtml, 200, {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0"
      });
    }
    return c.text("Not Found", 404);
  });
}
var port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
var server = serve(
  {
    fetch: index_default.fetch,
    port
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
  }
);
