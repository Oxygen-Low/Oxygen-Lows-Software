var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
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
  let renamed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tempPath, filePath);
      renamed = true;
      break;
    } catch (err) {
      if (attempt === 4 || !["EPERM", "ENOENT", "EBUSY"].includes(err?.code)) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
        try {
          fs.unlinkSync(tempPath);
        } catch {
        }
        renamed = true;
        break;
      }
      const start = Date.now();
      while (Date.now() - start < 15) {
      }
    }
  }
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
  ensureDir(path.join(userDir, "support"));
  ensureDir(path.join(userDir, "friends"));
  ensureDir(path.join(userDir, "defender"));
  ensureDir(path.join(userDir, "models"));
  ensureDir(path.join(userDir, "games"));
  ensureDir(path.join(userDir, "oauth"));
  ensureDir(path.join(process.cwd(), "uploads", "Storage", userId));
  ensureDir(path.join(process.cwd(), "uploads", "Storage", userId, "games"));
  ensureDir(path.join(process.cwd(), "uploads", "public-assets", userId));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const role = userInitialData.role || (String(userId) === "1" ? "admin" : "user");
  const authVerifier = userInitialData.authVerifier || userInitialData.passwordHash || null;
  const authSalt = userInitialData.authSalt || userInitialData.salt || null;
  const userData = {
    id: userId,
    username: userInitialData.username,
    email: userInitialData.email,
    auth_verifier: authVerifier,
    auth_salt: authSalt,
    role,
    points: 100,
    custom_models: [],
    oauth: {},
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
    research_summarizer_default_model: "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
    research_summarizer_default_provider: "horde",
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
  writeJsonFile(path.join(userDir, "passkeys.json"), []);
  writeJsonFile(path.join(userDir, "vpn", "configs.json"), []);
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
  writeJsonFile(path.join(userDir, "games", "sync_config.json"), []);
  writeJsonFile(path.join(userDir, "games", "snapshots.json"), []);
  writeJsonFile(path.join(userDir, "games", "conflicts.json"), []);
  writeJsonFile(path.join(userDir, "points", "transactions.json"), []);
  writeJsonFile(path.join(userDir, "points", "gifts.json"), []);
  return userData;
}
function updateUserAuthVerifier(userId, authVerifier, authSalt) {
  const userPath = path.join(DATA_DIR, String(userId), "user.json");
  if (!fs.existsSync(userPath)) return null;
  const user = readJsonFile(userPath, null);
  if (!user) return null;
  delete user.password_hash;
  delete user.salt;
  user.auth_verifier = authVerifier;
  user.auth_salt = authSalt;
  user.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  writeJsonFile(userPath, user);
  return user;
}
function wipeServerPasswordsAndMigrateSchema() {
  if (!fs.existsSync(DATA_DIR)) return { migratedCount: 0, wipedCount: 0 };
  const userIds = getAllUserIds();
  let migratedCount = 0;
  let wipedCount = 0;
  for (const id of userIds) {
    const userPath = path.join(DATA_DIR, id, "user.json");
    if (fs.existsSync(userPath)) {
      const user = readJsonFile(userPath, null);
      if (user) {
        let changed = false;
        if ("password_hash" in user || "salt" in user) {
          delete user.password_hash;
          delete user.salt;
          wipedCount++;
          changed = true;
        }
        if (!("auth_verifier" in user)) {
          user.auth_verifier = null;
          changed = true;
        }
        if (!("auth_salt" in user)) {
          user.auth_salt = null;
          changed = true;
        }
        if (changed) {
          writeJsonFile(userPath, user);
          migratedCount++;
        }
      }
    }
  }
  return { migratedCount, wipedCount };
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
function getUserByOAuthProvider(provider, providerUserId) {
  if (!provider || !providerUserId) return null;
  const userIds = getAllUserIds();
  for (const id of userIds) {
    const user = getUserById(id);
    if (user && user.oauth && user.oauth[provider] && String(user.oauth[provider].id) === String(providerUserId)) {
      return user;
    }
  }
  return null;
}
function linkUserOAuth(userId, provider, data) {
  const existing = getUserByOAuthProvider(provider, data.id);
  if (existing && String(existing.id) !== String(userId)) {
    throw new Error("This account is already linked to another user");
  }
  const userPath = path.join(DATA_DIR, String(userId), "user.json");
  if (!fs.existsSync(userPath)) return null;
  const user = readJsonFile(userPath, null);
  if (!user) return null;
  if (!user.oauth) {
    user.oauth = {};
  }
  user.oauth[provider] = {
    id: data.id,
    email: data.email,
    linked_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  user.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  writeJsonFile(userPath, user);
  return user;
}
function unlinkUserOAuth(userId, provider) {
  const userPath = path.join(DATA_DIR, String(userId), "user.json");
  if (!fs.existsSync(userPath)) return null;
  const user = readJsonFile(userPath, null);
  if (!user) return null;
  if (user.oauth && user.oauth[provider]) {
    delete user.oauth[provider];
    user.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    writeJsonFile(userPath, user);
  }
  return user;
}
function getUserOAuthStatus(userId) {
  const user = getUserById(userId);
  if (!user || !user.oauth) {
    return {};
  }
  const result = {};
  for (const [provider, info] of Object.entries(user.oauth)) {
    if (info && info.id) {
      result[provider] = {
        linked: true,
        email: info.email,
        linked_at: info.linked_at
      };
    }
  }
  return result;
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
      case "oauth_apps":
        filePath = path.join(userDir, "oauth", "apps.json");
        break;
      case "oauth_grants":
        filePath = path.join(userDir, "oauth", "grants.json");
        break;
      case "oauth_codes":
        filePath = path.join(userDir, "oauth", "codes.json");
        break;
      case "oauth_tokens":
        filePath = path.join(userDir, "oauth", "tokens.json");
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
      case "defender_banned_ips":
        filePath = path.join(userDir, "defender", "banned_ips.json");
        break;
      case "defender_vpn":
        filePath = path.join(userDir, "defender", "vpn.json");
        break;
      case "user_models":
        filePath = path.join(userDir, "models", "models.json");
        break;
      case "user_api_keys":
        filePath = path.join(userDir, "models", "api_keys.json");
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
      case "game_sync_configs":
      case "game_sync_config":
      case "game_sync_settings":
      case "game_sync_preferences":
        filePath = path.join(userDir, "games", "sync_config.json");
        break;
      case "game_snapshots":
      case "game_snapshot":
      case "game_sync_snapshots":
      case "game_sync_items":
      case "game_saves_snapshots":
        filePath = path.join(userDir, "games", "snapshots.json");
        break;
      case "game_conflicts":
      case "game_conflict":
      case "game_sync_conflicts":
        filePath = path.join(userDir, "games", "conflicts.json");
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
  const normTable = table.trim().toLowerCase();
  const userIdStr = userId !== void 0 && userId !== null && String(userId).trim() !== "" ? String(userId) : void 0;
  if (!userIdStr && PRIVATE_GAME_TABLES.has(normTable)) {
    return [];
  }
  if (normTable === "profiles" || normTable === "profile_pictures") {
    if (userIdStr) {
      const p = getProfileByUserId(userIdStr);
      return p ? [p] : [];
    }
    const userIds2 = getAllUserIds();
    return userIds2.map((id) => getProfileByUserId(id)).filter((p) => p !== null);
  }
  function sanitizePreferences(pref) {
    if (!pref || typeof pref !== "object") return pref;
    const updated = { ...pref };
    if (updated.chatbot_default_provider === "cloudflare") {
      updated.chatbot_default_provider = "horde";
      if (updated.chatbot_default_model?.startsWith("@cf/")) {
        updated.chatbot_default_model = "Fast";
      }
    }
    if (updated.research_agent_default_provider === "cloudflare") {
      updated.research_agent_default_provider = "horde";
      if (updated.research_agent_default_model?.startsWith("@cf/")) {
        updated.research_agent_default_model = "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M";
      }
    }
    if (updated.research_summarizer_default_provider === "cloudflare") {
      updated.research_summarizer_default_provider = "horde";
      if (updated.research_summarizer_default_model?.startsWith("@cf/")) {
        updated.research_summarizer_default_model = "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M";
      }
    }
    if (updated.last_provider === "cloudflare") {
      updated.last_provider = "horde";
      if (updated.last_model_id?.startsWith("@cf/")) {
        updated.last_model_id = "Fast";
      }
    }
    return updated;
  }
  if (normTable === "user_preferences") {
    if (userIdStr) {
      const prefPath = path.join(DATA_DIR, userIdStr, "preferences.json");
      const pref = readJsonFile(prefPath, null);
      return pref ? [sanitizePreferences(pref)] : [];
    }
    const userIds2 = getAllUserIds();
    return userIds2.map(
      (id) => readJsonFile(path.join(DATA_DIR, id, "preferences.json"), null)
    ).filter((p) => p !== null).map((p) => sanitizePreferences(p));
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
  if (normTable === "friendships" || normTable === "friends") {
    const userIds2 = getAllUserIds();
    const all = [];
    const seenIds = /* @__PURE__ */ new Set();
    if (userIdStr) {
      const ownFilePath = getTableFilePath(table, userIdStr);
      if (ownFilePath && fs.existsSync(ownFilePath)) {
        const own = readJsonFile(ownFilePath, []);
        for (const f of own) {
          if (f && f.id && !seenIds.has(String(f.id))) {
            seenIds.add(String(f.id));
            all.push(f);
          }
        }
      }
      for (const id of userIds2) {
        if (id === userIdStr) continue;
        const otherFilePath = getTableFilePath(table, id);
        if (otherFilePath && fs.existsSync(otherFilePath)) {
          const rows = readJsonFile(otherFilePath, []);
          for (const f of rows) {
            if (f && f.id && !seenIds.has(String(f.id))) {
              if (String(f.user_id) === userIdStr || String(f.friend_id) === userIdStr) {
                seenIds.add(String(f.id));
                all.push(f);
              }
            }
          }
        }
      }
      return all;
    }
    for (const id of userIds2) {
      const filePath = getTableFilePath(table, id);
      if (filePath && fs.existsSync(filePath)) {
        const rows = readJsonFile(filePath, []);
        for (const f of rows) {
          if (f && f.id && !seenIds.has(String(f.id))) {
            seenIds.add(String(f.id));
            all.push(f);
          }
        }
      }
    }
    return all;
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
      if ((field === "username" || field === "email") && typeof rowVal === "string" && typeof value === "string") {
        return rowVal.toLowerCase() === value.toLowerCase();
      }
      return String(rowVal) === String(value);
    case "neq":
      if ((field === "username" || field === "email") && typeof rowVal === "string" && typeof value === "string") {
        return rowVal.toLowerCase() !== value.toLowerCase();
      }
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
  const normTable = table.trim().toLowerCase();
  const isGlobalTable = normTable === "profiles" || normTable === "profile_pictures" || normTable === "follows";
  let rows;
  if (isGlobalTable) {
    rows = getTableRows(table);
  } else if (normTable === "friendships" || normTable === "friends") {
    const filterStrings = [
      ...filters.map((f) => `${f.field}.${f.operator}.${f.value}`),
      ...orFilters
    ].join(" ");
    const hasOtherUserFilter = userId && (filterStrings.includes("user_id.eq.") || filterStrings.includes("friend_id.eq.")) && !filterStrings.includes(`user_id.eq.${userId}`) && !filterStrings.includes(`friend_id.eq.${userId}`);
    if (hasOtherUserFilter) {
      rows = getTableRows(table);
    } else {
      rows = getTableRows(table, userId);
    }
  } else {
    rows = getTableRows(table, userId);
  }
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
  if (normTable === "friendships" || normTable === "friends") {
    for (const item of prepared) {
      const otherId = String(item.friend_id) === userIdStr ? String(item.user_id) : String(item.friend_id);
      if (otherId && otherId !== userIdStr) {
        const otherFilePath = getTableFilePath(table, otherId);
        if (otherFilePath) {
          const otherExisting = readJsonFile(otherFilePath, []);
          const otherUpdated = [
            item,
            ...otherExisting.filter((x) => String(x.id) !== String(item.id))
          ];
          saveTableRows(table, otherId, otherUpdated);
        }
      }
    }
  }
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
      if (normTable === "profiles") {
        const user = getUserById(userIdStr);
        if (user && user.username) {
          patchData.username = user.username;
        } else if (patchData.username && patchData.username.toLowerCase() === "oxygen-low") {
          delete patchData.username;
        }
      }
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
    if (normTable === "friendships" || normTable === "friends") {
      for (const item of matched) {
        const otherId = String(item.friend_id) === userIdStr ? String(item.user_id) : String(item.friend_id);
        if (otherId && otherId !== userIdStr) {
          const otherFilePath = getTableFilePath(table, otherId);
          if (otherFilePath) {
            const otherExisting = readJsonFile(otherFilePath, []);
            const otherUpdated = otherExisting.map((r) => {
              if (String(r.id) === String(item.id)) {
                return { ...r, ...data, updated_at: now };
              }
              return r;
            });
            saveTableRows(table, otherId, otherUpdated);
          }
        }
      }
    }
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
    if (normTable === "profiles") {
      const user = getUserById(userIdStr);
      if (user && user.username) {
        patchData.username = user.username;
      } else if (patchData.username && patchData.username.toLowerCase() === "oxygen-low") {
        delete patchData.username;
      }
    }
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
  if (normTable === "friendships" || normTable === "friends") {
    for (const item of result) {
      const otherId = String(item.friend_id) === userIdStr ? String(item.user_id) : String(item.friend_id);
      if (otherId && otherId !== userIdStr) {
        const otherFilePath = getTableFilePath(table, otherId);
        if (otherFilePath) {
          const otherExisting = readJsonFile(otherFilePath, []);
          const existingItem = otherExisting.find(
            (x) => String(x[onConflict]) === String(item[onConflict])
          );
          let otherUpdated;
          if (existingItem) {
            otherUpdated = otherExisting.map(
              (x) => String(x[onConflict]) === String(item[onConflict]) ? { ...x, ...item, updated_at: now } : x
            );
          } else {
            otherUpdated = [item, ...otherExisting];
          }
          saveTableRows(table, otherId, otherUpdated);
        }
      }
    }
  }
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
    if (normTable === "friendships" || normTable === "friends") {
      for (const item of matched) {
        const otherId = String(item.friend_id) === userIdStr ? String(item.user_id) : String(item.friend_id);
        if (otherId && otherId !== userIdStr) {
          const otherFilePath = getTableFilePath(table, otherId);
          if (otherFilePath) {
            const otherExisting = readJsonFile(otherFilePath, []);
            const otherUpdated = otherExisting.filter(
              (r) => String(r.id) !== String(item.id)
            );
            saveTableRows(table, otherId, otherUpdated);
          }
        }
      }
    }
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
function pruneExpiredGameSnapshots(userId) {
  const targetUserIds = userId !== void 0 && userId !== null && String(userId).trim() !== "" ? [String(userId)] : getAllUserIds();
  const nowMs = Date.now();
  let prunedCount = 0;
  let freedBytes = 0;
  for (const uid of targetUserIds) {
    const snapshots = getTableRows("game_snapshots", uid);
    if (!snapshots || snapshots.length === 0) continue;
    const activeSnapshots = [];
    let modified = false;
    for (const snap of snapshots) {
      if (snap.is_manual || !snap.expires_at) {
        activeSnapshots.push(snap);
        continue;
      }
      const expMs = new Date(snap.expires_at).getTime();
      if (!isNaN(expMs) && expMs <= nowMs) {
        prunedCount++;
        freedBytes += Number(snap.file_size) || 0;
        modified = true;
        if (snap.storage_path) {
          try {
            const userUploadsBase = path.resolve(
              process.cwd(),
              "uploads",
              "Storage",
              String(uid)
            );
            const absPath = path.resolve(
              process.cwd(),
              "uploads",
              snap.storage_path
            );
            const rel = path.relative(userUploadsBase, absPath);
            if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel) && fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
              fs.unlinkSync(absPath);
            }
          } catch (err) {
            console.error("Failed to delete expired snapshot file:", err);
          }
        }
        continue;
      }
      activeSnapshots.push(snap);
    }
    if (modified) {
      saveTableRows("game_snapshots", uid, activeSnapshots);
    }
  }
  return { prunedCount, freedBytes };
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
        const friendId = String(f.friend_id) === String(userId) ? f.user_id : f.friend_id;
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
    case "get_my_followers": {
      if (!userId) return [];
      const userIds = getAllUserIds();
      const followers = [];
      const userIdStr = String(userId);
      for (const id of userIds) {
        const userFollows = getTableRows("follows", id);
        for (const f of userFollows) {
          if (String(f.following_id) === userIdStr) {
            const prof = getProfileByUserId(f.follower_id || id);
            followers.push({
              ...f,
              profile: prof
            });
          }
        }
      }
      return followers;
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
      if (userId.includes("..") || path.win32.isAbsolute(userId) || path.posix.isAbsolute(userId)) {
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
    // -----------------------------------------------------------------------
    // Game Cloud Sync, Snapshots, and Conflict RPCs
    // -----------------------------------------------------------------------
    case "get_game_sync_configs": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const gameId = args?.game_id ?? args?.p_game_id ?? args?.id;
      const configs = getTableRows("game_sync_configs", userId);
      if (gameId) {
        const found = configs.find((c) => c.game_id === gameId || c.id === gameId);
        return { success: true, config: found || null };
      }
      return { success: true, configs };
    }
    case "upsert_game_sync_config": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const gameId = String(args?.game_id ?? args?.p_game_id ?? args?.id ?? "").trim();
      if (!gameId) return { success: false, error: "game_id is required" };
      if (gameId.includes("..") || path.win32.isAbsolute(gameId) || path.posix.isAbsolute(gameId)) {
        return { success: false, error: "Invalid game_id" };
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const configs = getTableRows("game_sync_configs", userId);
      const existingIdx = configs.findIndex((c) => c.game_id === gameId || c.id === gameId);
      let updatedRecord;
      if (existingIdx >= 0) {
        const prev = configs[existingIdx];
        updatedRecord = {
          ...prev,
          enabled: typeof args.enabled === "boolean" ? args.enabled : prev.enabled,
          categories: args.categories ? { ...prev.categories || {}, ...args.categories } : prev.categories,
          custom_paths: args.custom_paths ? { ...prev.custom_paths || {}, ...args.custom_paths } : prev.custom_paths,
          last_synced_at: args.last_synced_at !== void 0 ? args.last_synced_at : prev.last_synced_at,
          sync_status: args.sync_status ?? prev.sync_status ?? "idle",
          updated_at: now
        };
        configs[existingIdx] = updatedRecord;
      } else {
        updatedRecord = {
          id: gameId,
          user_id: userId,
          game_id: gameId,
          enabled: typeof args.enabled === "boolean" ? args.enabled : true,
          categories: args.categories || {},
          custom_paths: args.custom_paths || {},
          last_synced_at: args.last_synced_at || null,
          sync_status: args.sync_status || "idle",
          created_at: now,
          updated_at: now
        };
        configs.push(updatedRecord);
      }
      saveTableRows("game_sync_configs", userId, configs);
      return { success: true, config: updatedRecord };
    }
    case "get_game_snapshots": {
      if (!userId) return { success: false, error: "Unauthorized", snapshots: [] };
      const includeExpired = Boolean(args?.include_expired);
      if (!includeExpired) {
        pruneExpiredGameSnapshots(userId);
      }
      const gameId = args?.game_id ?? args?.p_game_id;
      const category = args?.category ?? args?.p_category;
      const includeArchived = Boolean(args?.include_archived);
      let snapshots = getTableRows("game_snapshots", userId);
      if (gameId) {
        snapshots = snapshots.filter((s) => s.game_id === gameId);
      }
      if (category) {
        snapshots = snapshots.filter((s) => s.category === category);
      }
      if (!includeArchived) {
        snapshots = snapshots.filter((s) => !s.is_archived);
      }
      snapshots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { success: true, count: snapshots.length, snapshots };
    }
    case "create_game_snapshot": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const gameId = String(args?.game_id ?? args?.p_game_id ?? "").trim();
      const category = String(args?.category ?? args?.p_category ?? "").trim();
      if (!gameId || !category) {
        return { success: false, error: "game_id and category are required" };
      }
      if (gameId.includes("..") || path.win32.isAbsolute(gameId) || path.posix.isAbsolute(gameId)) {
        return { success: false, error: "Invalid game_id" };
      }
      if (!VALID_GAME_DATA_CATEGORIES.includes(category)) {
        return { success: false, error: "Invalid category" };
      }
      let validatedStoragePath = void 0;
      if (args?.storage_path !== void 0 && args?.storage_path !== null) {
        const sp = String(args.storage_path).trim();
        if (sp) {
          if (sp.includes("..") || path.win32.isAbsolute(sp) || path.posix.isAbsolute(sp)) {
            return {
              success: false,
              error: "Invalid storage_path: path traversal detected"
            };
          }
          const userStorageBase = path.resolve(
            process.cwd(),
            "uploads",
            "Storage",
            String(userId)
          );
          const resolvedPath = path.resolve(process.cwd(), "uploads", sp);
          const rel = path.relative(userStorageBase, resolvedPath);
          if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
            return {
              success: false,
              error: "Invalid storage_path: path traversal detected"
            };
          }
          validatedStoragePath = sp;
        }
      }
      const isManual = Boolean(args?.is_manual);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      let expiresAt = null;
      if (isManual) {
        expiresAt = null;
      } else if (args?.expires_at) {
        expiresAt = args.expires_at;
      } else if (category === "mod_lists") {
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1e3;
        expiresAt = new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString();
      }
      const defaultName = isManual ? `Manual Snapshot ${now.replace(/T/, " ").slice(0, 19)}` : `Auto-sync ${now.replace(/T/, " ").slice(0, 19)}`;
      const snapshot = {
        id: args?.id || crypto2.randomUUID(),
        user_id: userId,
        game_id: gameId,
        category,
        name: (args?.name || defaultName).trim(),
        is_manual: isManual,
        expires_at: expiresAt,
        storage_path: validatedStoragePath,
        content_hash: String(args?.content_hash || "").trim(),
        file_size: Number(args?.file_size) || 0,
        item_count: Number(args?.item_count) || 1,
        summary: args?.summary || {},
        is_archived: Boolean(args?.is_archived),
        archive_reason: args?.archive_reason || void 0,
        created_at: now,
        updated_at: now
      };
      const snapshots = getTableRows("game_snapshots", userId);
      snapshots.push(snapshot);
      saveTableRows("game_snapshots", userId, snapshots);
      const configs = getTableRows("game_sync_configs", userId);
      const cfg = configs.find((c) => c.game_id === gameId);
      if (cfg) {
        cfg.last_synced_at = now;
        cfg.sync_status = "idle";
        cfg.updated_at = now;
        saveTableRows("game_sync_configs", userId, configs);
      }
      return { success: true, snapshot };
    }
    case "restore_game_snapshot": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const snapshotId = String(args?.snapshot_id ?? args?.id ?? args?.p_snapshot_id ?? "").trim();
      if (!snapshotId) return { success: false, error: "snapshot_id is required" };
      const snapshots = getTableRows("game_snapshots", userId);
      const snap = snapshots.find((s) => s.id === snapshotId);
      if (!snap) return { success: false, error: "Snapshot not found" };
      return {
        success: true,
        snapshot: snap,
        restore_target: {
          game_id: snap.game_id,
          category: snap.category,
          content_hash: snap.content_hash,
          file_size: snap.file_size,
          item_count: snap.item_count,
          storage_path: snap.storage_path,
          summary: snap.summary
        }
      };
    }
    case "delete_game_snapshot": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const snapshotId = String(args?.snapshot_id ?? args?.id ?? args?.p_snapshot_id ?? "").trim();
      if (!snapshotId) return { success: false, error: "snapshot_id is required" };
      const snapshots = getTableRows("game_snapshots", userId);
      const idx = snapshots.findIndex((s) => s.id === snapshotId);
      if (idx === -1) return { success: false, error: "Snapshot not found" };
      const [removed] = snapshots.splice(idx, 1);
      saveTableRows("game_snapshots", userId, snapshots);
      if (removed.storage_path) {
        try {
          const userStorageBase = path.resolve(
            process.cwd(),
            "uploads",
            "Storage",
            String(userId)
          );
          const fullPath = path.resolve(
            process.cwd(),
            "uploads",
            removed.storage_path
          );
          const rel = path.relative(userStorageBase, fullPath);
          if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            fs.unlinkSync(fullPath);
          }
        } catch {
        }
      }
      return { success: true, deleted_id: snapshotId };
    }
    case "promote_game_snapshot": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const snapshotId = String(args?.snapshot_id ?? args?.id ?? args?.p_snapshot_id ?? "").trim();
      if (!snapshotId) return { success: false, error: "snapshot_id is required" };
      const snapshots = getTableRows("game_snapshots", userId);
      const snap = snapshots.find((s) => s.id === snapshotId);
      if (!snap) return { success: false, error: "Snapshot not found" };
      snap.is_manual = true;
      snap.expires_at = null;
      if (args?.name) {
        snap.name = String(args.name).trim();
      }
      snap.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      saveTableRows("game_snapshots", userId, snapshots);
      return { success: true, snapshot: snap };
    }
    case "get_game_conflicts": {
      if (!userId) return { success: false, error: "Unauthorized", conflicts: [] };
      const gameId = args?.game_id ?? args?.p_game_id;
      const status = args?.status || "active";
      let conflicts = getTableRows("game_conflicts", userId);
      if (status !== "all") {
        conflicts = conflicts.filter((c) => c.status === status);
      }
      if (gameId) {
        conflicts = conflicts.filter((c) => c.game_id === gameId);
      }
      conflicts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { success: true, count: conflicts.length, conflicts };
    }
    case "resolve_game_conflict": {
      if (!userId) return { success: false, error: "Unauthorized" };
      const conflictId = String(args?.conflict_id ?? args?.id ?? args?.p_conflict_id ?? "").trim();
      const resolution = String(args?.resolution ?? args?.p_resolution ?? "").trim();
      if (!conflictId) return { success: false, error: "conflict_id is required" };
      if (!["keep_local", "keep_cloud", "keep_both"].includes(resolution)) {
        return {
          success: false,
          error: 'Invalid resolution. Must be "keep_local", "keep_cloud", or "keep_both"'
        };
      }
      const conflicts = getTableRows("game_conflicts", userId);
      const conflict = conflicts.find((c) => c.id === conflictId);
      if (!conflict) return { success: false, error: "Conflict not found" };
      if (conflict.status === "resolved") {
        return { success: false, error: "Conflict is already resolved" };
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      let activeSnapshot = null;
      let archivedSnapshot = null;
      const snapshots = getTableRows("game_snapshots", userId);
      if (resolution === "keep_local") {
        activeSnapshot = {
          id: crypto2.randomUUID(),
          user_id: userId,
          game_id: conflict.game_id,
          category: conflict.category,
          name: args?.archive_name || `Resolved (Local) ${now.replace(/T/, " ").slice(0, 19)}`,
          is_manual: true,
          expires_at: null,
          storage_path: conflict.local_version.storage_temp_path,
          content_hash: conflict.local_version.content_hash,
          file_size: conflict.local_version.file_size,
          item_count: conflict.local_version.item_count,
          summary: conflict.local_version.summary,
          created_at: now,
          updated_at: now
        };
        snapshots.push(activeSnapshot);
      } else if (resolution === "keep_cloud") {
        activeSnapshot = snapshots.find((s) => s.id === conflict.cloud_version.snapshot_id) || null;
      } else if (resolution === "keep_both") {
        archivedSnapshot = {
          id: crypto2.randomUUID(),
          user_id: userId,
          game_id: conflict.game_id,
          category: conflict.category,
          name: args?.archive_name || `Backup (Local Conflict) ${now.replace(/T/, " ").slice(0, 19)}`,
          is_manual: true,
          expires_at: null,
          storage_path: conflict.local_version.storage_temp_path,
          content_hash: conflict.local_version.content_hash,
          file_size: conflict.local_version.file_size,
          item_count: conflict.local_version.item_count,
          summary: conflict.local_version.summary,
          is_archived: true,
          archive_reason: "conflict_alternate_local",
          created_at: now,
          updated_at: now
        };
        snapshots.push(archivedSnapshot);
        activeSnapshot = snapshots.find((s) => s.id === conflict.cloud_version.snapshot_id) || null;
      }
      saveTableRows("game_snapshots", userId, snapshots);
      conflict.status = "resolved";
      conflict.resolution = resolution;
      conflict.resolved_at = now;
      saveTableRows("game_conflicts", userId, conflicts);
      const configs = getTableRows("game_sync_configs", userId);
      const cfg = configs.find((c) => c.game_id === conflict.game_id);
      if (cfg && cfg.sync_status === "paused_conflict") {
        cfg.sync_status = "idle";
        cfg.updated_at = now;
        saveTableRows("game_sync_configs", userId, configs);
      }
      return {
        success: true,
        resolution,
        conflict,
        active_snapshot: activeSnapshot,
        archived_snapshot: archivedSnapshot
      };
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
var DATA_DIR, REALTIME_TABLES, _broadcast, VALID_GAME_DATA_CATEGORIES, cachedUserIds, lastCacheTime, CACHE_TTL, profileCache, PROFILE_CACHE_TTL, PRIVATE_GAME_TABLES, DAILY_POINTS_POOL;
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
    VALID_GAME_DATA_CATEGORIES = [
      "saves",
      "mod_lists",
      "custom_mods",
      "ideologies",
      "xenotypes",
      "submarines",
      "data"
    ];
    cachedUserIds = null;
    lastCacheTime = 0;
    CACHE_TTL = 3e4;
    profileCache = /* @__PURE__ */ new Map();
    PROFILE_CACHE_TTL = 3e4;
    PRIVATE_GAME_TABLES = /* @__PURE__ */ new Set([
      "game_sync_configs",
      "game_sync_config",
      "game_sync_settings",
      "game_sync_preferences",
      "game_snapshots",
      "game_snapshot",
      "game_sync_snapshots",
      "game_sync_items",
      "game_saves_snapshots",
      "game_conflicts",
      "game_conflict",
      "game_sync_conflicts",
      "user_games",
      "games",
      "game_library",
      "installed_games",
      "custom_games",
      "user_playtime",
      "game_playtime",
      "playtime",
      "playtimes",
      "user_presence",
      "game_presence",
      "presence",
      "presences"
    ]);
    DAILY_POINTS_POOL = 1e4;
  }
});

// server/lib/auth.ts
var auth_exports = {};
__export(auth_exports, {
  generateOAuthState: () => generateOAuthState,
  generateSalt: () => generateSalt,
  generateToken: () => generateToken,
  hashAuthVerifier: () => hashAuthVerifier,
  hashPassword: () => hashPassword,
  localAuthMiddleware: () => localAuthMiddleware,
  resolveUserFromToken: () => resolveUserFromToken,
  verifyAuthToken: () => verifyAuthToken,
  verifyOAuthState: () => verifyOAuthState,
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
function hashAuthVerifier(authToken, salt) {
  return crypto3.pbkdf2Sync(authToken, salt, 1e5, 64, "sha512").toString("hex");
}
function verifyAuthToken(authToken, storedVerifier, salt) {
  try {
    const hash = hashAuthVerifier(authToken, salt);
    const hashBuf = Buffer.from(hash, "hex");
    const storedBuf = Buffer.from(storedVerifier, "hex");
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
function generateOAuthState(payload, expiresInMs = 10 * 60 * 1e3) {
  const secret = getSecretKey();
  const data = {
    ...payload,
    exp: Date.now() + expiresInMs,
    nonce: crypto3.randomBytes(8).toString("hex")
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto3.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
function verifyOAuthState(state) {
  try {
    if (!state) return null;
    const [encoded, sig] = state.split(".");
    if (!encoded || !sig) return null;
    const secret = getSecretKey();
    const expectedSig = crypto3.createHmac("sha256", secret).update(encoded).digest("base64url");
    if (!crypto3.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8")
    );
    if (typeof data.exp === "number" && data.exp < Date.now()) {
      return null;
    }
    return data;
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
      if (user.auth_verifier === null) {
        return null;
      }
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
var hashPassword, verifyPassword, localAuthMiddleware;
var init_auth = __esm({
  "server/lib/auth.ts"() {
    init_dataStore();
    hashPassword = hashAuthVerifier;
    verifyPassword = verifyAuthToken;
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
import { Hono as Hono26 } from "hono";
import { cors as cors2 } from "hono/cors";
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
function rateLimiter(maxRequests, windowMs, prefix = "global", customError) {
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
      if (customError) {
        return c.json(customError(retryAfter, c), 429);
      }
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
  - Advanced conversational AI supporting multiple cloud providers (Stable Horde, OpenAI GPT-4, Anthropic Claude, Google Gemini, OpenRouter, xAI Grok) and local offline AI models (Ollama, LM Studio, KoboldCpp).
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
- **File Converter** (/apps/file-converter):
  - In-browser media converter supporting images, audio, and video formats locally using WebAssembly.
- **File Trimmer** (/apps/file-trimmer):
  - In-browser audio and video trimming utility with interactive preview, precise timestamp controls, and lossless stream copy or re-encoding.
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

### 6. Custom Characters & Roleplay Studio (/characters)
- Create rich AI character personas, custom races/species, and fictional universes.
- Define appearance, personality, backstories, tone, and full RPG stats (STR, DEX, CON, INT, WIS, CHA) that inject seamlessly into Chatbot conversations.

### 7. Customization, Themes & Audio (/customize)
- Themes, neon/glassmorphism UI styles, language switching (English, Spanish, Japanese, Korean, Russian, Simplified Chinese), and built-in sidebar Music Player.

### 8. Social, Friends & Community (/friends)
- Add friends, view online status, user profiles, and connect with the community.
- Official Discord community (https://discord.gg/tNczTe66jK) and Trello development roadmap (https://trello.com/b/OmFTZeVK/oxygen-lows-software-development).

### 9. Downloads & Desktop Apps (/download)
- Native Windows desktop application and Android client downloads.

### 10. Support & Transparency (/support, /legal)
- In-app support ticket submission and admin chat system.
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
  { provider: "horde", model_id: "Smart" }
];
var HORDE_MODELS_MAP = {
  TitleGen: [
    "koboldcpp/Llama-3.2-1B-Instruct",
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
    "meta-llama/Llama-3.2-3B-Instruct"
  ],
  Fast: [
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
    "koboldcpp/llama-3.2-3b-instruct-q4_k_m",
    "meta-llama/Llama-3.2-3B-Instruct",
    "koboldcpp/Llama-3.2-1B-Instruct",
    "koboldcpp/L3-Super-Nova-RP-8B",
    "koboldcpp/L3-8B-Stheno-v3.2",
    "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M"
  ],
  "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M": [
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
    "koboldcpp/llama-3.2-3b-instruct-q4_k_m",
    "meta-llama/Llama-3.2-3B-Instruct",
    "koboldcpp/Llama-3.2-1B-Instruct",
    "koboldcpp/L3-Super-Nova-RP-8B",
    "koboldcpp/L3-8B-Stheno-v3.2",
    "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M"
  ],
  Smart: ["aphrodite/TheDrummer/Behemoth-X-123B-v2.1"]
};
function resolveHordeModel(model) {
  if (HORDE_MODELS_MAP[model]) {
    return HORDE_MODELS_MAP[model].join(",");
  }
  return model;
}
async function getFallbackHordeModel(preference = "fast") {
  try {
    const res = await fetch(
      "https://stablehorde.net/api/v2/status/models?type=text"
    );
    if (!res.ok) return null;
    const models = await res.json();
    const sorted = models.filter((m) => m && m.count > 0 && typeof m.name === "string").sort((a, b) => b.count - a.count);
    if (preference === "fast") {
      const fast = sorted.find(
        (m) => /(?:^|[^0-9])([1378])b(?:[^0-9]|$)/i.test(m.name)
      );
      if (fast) return fast.name;
    }
    return sorted[0]?.name || null;
  } catch {
    return null;
  }
}
function stripHtmlTags(input) {
  if (typeof input !== "string") return "";
  let prev = "";
  let sanitized = input;
  do {
    prev = sanitized;
    sanitized = sanitized.replace(/<[^<>]*>/g, "");
  } while (sanitized !== prev);
  return sanitized.trim();
}
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
  if (!user && provider !== "horde" && provider !== "pollinations") {
    return c.json({ error: "Authentication required for this model." }, 401);
  }
  let integration = apiKey ? { api_key: apiKey } : null;
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
  if (!integration?.api_key && provider !== "horde" && provider !== "pollinations") {
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
    } else if (provider === "google" || provider === "gemini") {
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
    } else if (provider === "grok" || provider === "xai") {
      targetUrl = "https://api.x.ai/v1/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      fetchOptions.headers["Authorization"] = `Bearer ${integration?.api_key}`;
    } else if (provider === "pollinations") {
      targetUrl = "https://text.pollinations.ai/openai/chat/completions";
      requestBody = { ...requestBody, model, messages: finalMessages };
      if (integration?.api_key) {
        fetchOptions.headers["Authorization"] = `Bearer ${integration.api_key}`;
      }
    } else if (provider === "horde") {
      let actualModel = resolveHordeModel(model);
      const hordeHeaders = {
        Authorization: `Bearer ${integration?.api_key || "0000000000"}`
      };
      let hordeRequestBody = {
        ...requestBody,
        model: actualModel,
        messages: finalMessages
      };
      if (stream) {
        let hordeResponse = await streamHordeWithContinuation({
          targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
          fetchHeaders: hordeHeaders,
          requestBody: hordeRequestBody,
          signal: c.req.raw.signal
        });
        if (hordeResponse.status === 406) {
          const dynamicFallback = await getFallbackHordeModel(
            model.toLowerCase().includes("fast") ? "fast" : "general"
          );
          if (dynamicFallback && dynamicFallback !== actualModel) {
            actualModel = dynamicFallback;
            hordeRequestBody = { ...hordeRequestBody, model: actualModel };
            hordeResponse = await streamHordeWithContinuation({
              targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
              fetchHeaders: hordeHeaders,
              requestBody: hordeRequestBody,
              signal: c.req.raw.signal
            });
          }
        }
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
        let hordeResponse = await fetchHordeNonStreamWithContinuation({
          targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
          fetchHeaders: hordeHeaders,
          requestBody: hordeRequestBody,
          signal: c.req.raw.signal
        });
        if (hordeResponse.status === 406) {
          const dynamicFallback = await getFallbackHordeModel(
            model.toLowerCase().includes("fast") ? "fast" : "general"
          );
          if (dynamicFallback && dynamicFallback !== actualModel) {
            actualModel = dynamicFallback;
            hordeRequestBody = { ...hordeRequestBody, model: actualModel };
            hordeResponse = await fetchHordeNonStreamWithContinuation({
              targetUrl: "https://oai.stablehorde.net/v1/chat/completions",
              fetchHeaders: hordeHeaders,
              requestBody: hordeRequestBody,
              signal: c.req.raw.signal
            });
          }
        }
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
    } else if (provider === "shared-model") {
      const targetModelId = model;
      const origin = new URL(c.req.url).origin;
      const sharedUrl = `${origin}/api/models/shared/${encodeURIComponent(targetModelId)}/chat`;
      const sharedRes = await fetch(sharedUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...c.req.header("Authorization") ? { Authorization: c.req.header("Authorization") } : {}
        },
        body: JSON.stringify({ messages: finalMessages, stream }),
        signal: c.req.raw.signal
      });
      if (stream) {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");
        return c.body(sharedRes.body);
      } else {
        const data = await sharedRes.json();
        return c.json(data);
      }
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
aiRouter.post("/fetch-provider-models", apiLimiter, async (c) => {
  try {
    const { provider, apiKey } = await c.req.json();
    const cleanProvider = (provider || "").toLowerCase();
    if (cleanProvider === "pollinations") {
      try {
        const res = await fetch("https://text.pollinations.ai/models");
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            const models = list.map((m) => ({
              id: typeof m === "string" ? m : m.name || m.id,
              name: typeof m === "string" ? m : m.description || m.name || m.id
            }));
            return c.json({ models });
          }
        }
      } catch {
      }
      return c.json({
        models: [
          { id: "openai", name: "OpenAI GPT-4o Mini (Pollinations)" },
          { id: "mistral", name: "Mistral Nemo (Pollinations)" },
          { id: "deepseek", name: "DeepSeek V3 (Pollinations)" },
          { id: "deepseek-r1", name: "DeepSeek R1 (Pollinations)" },
          { id: "qwen", name: "Qwen 2.5 72B (Pollinations)" },
          { id: "claude-hybrid", name: "Claude 3.5 Sonnet (Hybrid)" },
          { id: "karma", name: "Karma (Pollinations)" }
        ]
      });
    }
    if (!apiKey && cleanProvider !== "openrouter") {
      return c.json(
        { error: "API key is required to fetch models for this provider" },
        400
      );
    }
    if (cleanProvider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!res.ok) {
        const err = await res.text();
        return c.json({ error: `OpenAI returned ${res.status}: ${err}` }, 400);
      }
      const json = await res.json();
      const models = (json.data || []).filter(
        (m) => m.id && !m.id.includes("whisper") && !m.id.includes("tts") && !m.id.includes("dall-e") && !m.id.includes("embedding") && !m.id.includes("babbage") && !m.id.includes("davinci")
      ).map((m) => ({ id: m.id, name: m.id })).sort((a, b) => a.id.localeCompare(b.id));
      return c.json({ models });
    }
    if (cleanProvider === "openrouter") {
      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
      if (!res.ok) {
        const err = await res.text();
        return c.json(
          { error: `OpenRouter returned ${res.status}: ${err}` },
          400
        );
      }
      const json = await res.json();
      const models = (json.data || []).map((m) => ({
        id: m.id,
        name: m.name ? `${m.name} (${m.id})` : m.id
      }));
      return c.json({ models });
    }
    if (cleanProvider === "grok" || cleanProvider === "xai") {
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!res.ok) {
        const err = await res.text();
        return c.json({ error: `xAI returned ${res.status}: ${err}` }, 400);
      }
      const json = await res.json();
      const models = (json.data || []).map((m) => ({
        id: m.id,
        name: m.id
      }));
      return c.json({ models });
    }
    if (cleanProvider === "google" || cleanProvider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
          apiKey
        )}`
      );
      if (!res.ok) {
        const err = await res.text();
        return c.json({ error: `Google returned ${res.status}: ${err}` }, 400);
      }
      const json = await res.json();
      const models = (json.models || []).filter(
        (m) => (m.supportedGenerationMethods || []).includes("generateContent")
      ).map((m) => ({
        id: (m.name || "").replace(/^models\//, ""),
        name: m.displayName ? `${m.displayName} (${(m.name || "").replace(/^models\//, "")})` : (m.name || "").replace(/^models\//, "")
      }));
      return c.json({ models });
    }
    if (cleanProvider === "anthropic") {
      return c.json({
        models: [
          { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
          { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet v2" },
          { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
          { id: "claude-3-opus-20240229", name: "Claude 3 Opus" }
        ]
      });
    }
    return c.json(
      { error: "Unsupported provider for remote model fetching" },
      400
    );
  } catch (err) {
    return c.json(
      { error: err?.message || "Failed to fetch provider models" },
      500
    );
  }
});

// server/routes/imageGen.ts
import { Hono as Hono7 } from "hono";
init_auth();
var imageGenRouter = new Hono7();
var imageLimiter = rateLimiter(20, 6e4, "image_gen");
var IMAGE_GENERATOR_PRESETS = [
  {
    id: "quality",
    name: "Quality",
    description: "High-resolution photorealistic checkpoint with maximum detail and clarity",
    baseHordeModel: "SDXL 1.0",
    stylePrompt: "masterpiece, ultra detailed, sharp focus, 8k resolution, high fidelity",
    negativePromptAdditions: "blurry, low quality, artifacts, distorted, noisy",
    defaultSteps: 25,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "pixel_art",
    name: "Pixel Art",
    description: "Retro 16-bit pixel graphic and nostalgic arcade game aesthetic",
    baseHordeModel: "stable_diffusion",
    stylePrompt: "pixel art, 16-bit pixel graphic, detailed pixelated style, retro game sprite aesthetic",
    negativePromptAdditions: "photorealistic, 3D render, realistic photo, smooth gradients, vector, blurry",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"]
  },
  {
    id: "fast",
    name: "Fast",
    description: "Rapid lightweight generation optimized for quick previews and speed",
    baseHordeModel: "stable_diffusion",
    stylePrompt: "",
    negativePromptAdditions: "blurry, low quality",
    defaultSteps: 15,
    maxSteps: 25,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"]
  },
  {
    id: "anime",
    name: "Anime",
    description: "Vibrant studio anime artwork with clean lines and stylized shading",
    baseHordeModel: "DreamShaper",
    stylePrompt: "anime artwork, anime key visual, studio anime aesthetic, vibrant anime colors, clean lineart",
    negativePromptAdditions: "photorealistic, real photo, 3D CGI, deformed, disfigured",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "realistic",
    name: "Realistic",
    description: "Authentic 35mm photographic realism with natural depth and lighting",
    baseHordeModel: "ICBINP - I Can't Believe It's Not Photography",
    stylePrompt: "photorealistic, 35mm photography, realistic lighting, highly detailed photograph, RAW photo",
    negativePromptAdditions: "drawing, painting, illustration, cartoon, anime, 3d render, CGI, unrealistic",
    defaultSteps: 25,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "cartoon",
    name: "Cartoon",
    description: "Playful character designs, expressive shapes, and bold cartoon colors",
    baseHordeModel: "Deliberate",
    stylePrompt: "cartoon illustration, vibrant cartoon style, expressive stylized character, 2D animation art",
    negativePromptAdditions: "photorealistic, real life photo, 3D render, dark, gritty",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"]
  },
  {
    id: "simplistic",
    name: "simplistic",
    description: "Clean minimalist design with simple shapes, flat colors, and elegant lines",
    baseHordeModel: "stable_diffusion",
    stylePrompt: "simplistic minimalist illustration, flat art style, clean simple shapes, minimalist design, elegant minimalism",
    negativePromptAdditions: "cluttered, busy, complex background, hyperdetailed, photorealistic, chaotic",
    defaultSteps: 20,
    maxSteps: 30,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"]
  }
];
var HORDE_SFW_CURATED = IMAGE_GENERATOR_PRESETS.map((p) => ({
  provider: "horde",
  id: p.id,
  name: p.name,
  description: p.description,
  free: true,
  maxSteps: p.maxSteps,
  defaultSteps: p.defaultSteps,
  aspectRatios: p.aspectRatios
}));
imageGenRouter.get("/models", imageLimiter, async (c) => {
  let hordeModels = IMAGE_GENERATOR_PRESETS.map((p) => ({
    provider: "horde",
    id: p.id,
    name: p.name,
    description: p.description,
    free: true,
    maxSteps: p.maxSteps,
    defaultSteps: p.defaultSteps,
    aspectRatios: p.aspectRatios,
    workers: 0,
    queued: 0,
    eta: 0
  }));
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      "https://stablehorde.net/api/v2/status/models?type=image",
      {
        signal: controller.signal,
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:anonymous" }
      }
    );
    clearTimeout(timeoutId);
    if (res.ok) {
      const activeHordeList = await res.json();
      const statusByName = /* @__PURE__ */ new Map();
      for (const m of activeHordeList) {
        if (m.name) statusByName.set(m.name, m);
      }
      hordeModels = IMAGE_GENERATOR_PRESETS.map((preset) => {
        const live = statusByName.get(preset.baseHordeModel);
        return {
          provider: "horde",
          id: preset.id,
          name: preset.name,
          description: preset.description,
          free: true,
          maxSteps: preset.maxSteps,
          defaultSteps: preset.defaultSteps,
          aspectRatios: preset.aspectRatios,
          workers: live ? live.count || 0 : 0,
          queued: live ? live.queued || 0 : 0,
          eta: live ? live.eta || 0 : 0
        };
      });
    }
  } catch (err) {
  }
  return c.json({
    horde: hordeModels
  });
});
imageGenRouter.post("/generate", imageLimiter, async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }
  const {
    provider,
    model,
    prompt: rawPrompt,
    negative_prompt: rawNegPrompt,
    width: rawWidth,
    height: rawHeight,
    steps: rawSteps,
    guidance: rawGuidance,
    seed: rawSeed
  } = body || {};
  if (!provider || provider !== "horde") {
    return c.json({ error: "Invalid provider. Must be horde" }, 400);
  }
  const prompt = stripHtmlTags(rawPrompt || "").trim();
  if (!prompt || prompt.length === 0) {
    return c.json({ error: "Prompt is required" }, 400);
  }
  if (prompt.length > 2e3) {
    return c.json({ error: "Prompt exceeds maximum length of 2000 characters" }, 400);
  }
  const negative_prompt = rawNegPrompt ? stripHtmlTags(String(rawNegPrompt)).trim().slice(0, 1e3) : "";
  const width = Math.min(Math.max(Number(rawWidth) || 512, 256), 1024);
  const height = Math.min(Math.max(Number(rawHeight) || 512, 256), 1024);
  const steps = Math.min(Math.max(Number(rawSteps) || 20, 1), 50);
  const guidance = Math.min(Math.max(Number(rawGuidance) || 7.5, 1), 20);
  const seed = rawSeed !== void 0 && !isNaN(Number(rawSeed)) ? Math.floor(Number(rawSeed)) : void 0;
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  let user = null;
  if (token && token !== "undefined" && token !== "null") {
    user = await resolveUserFromToken(token);
  }
  if (provider === "horde") {
    let hordeApiKey = "0000000000";
    const requestedModel = String(model || "quality").trim();
    const matchedPreset = IMAGE_GENERATOR_PRESETS.find(
      (p) => p.id.toLowerCase() === requestedModel.toLowerCase() || p.name.toLowerCase() === requestedModel.toLowerCase()
    );
    const baseHordeModel = matchedPreset ? matchedPreset.baseHordeModel : requestedModel;
    const responseModelName = matchedPreset ? matchedPreset.name : requestedModel;
    let enhancedPrompt = prompt;
    if (matchedPreset?.stylePrompt && !prompt.toLowerCase().includes(matchedPreset.stylePrompt.toLowerCase())) {
      enhancedPrompt = `${prompt}, ${matchedPreset.stylePrompt}`;
    }
    let enhancedNegativePrompt = negative_prompt;
    if (matchedPreset?.negativePromptAdditions) {
      if (enhancedNegativePrompt) {
        enhancedNegativePrompt = `${enhancedNegativePrompt}, ${matchedPreset.negativePromptAdditions}`;
      } else {
        enhancedNegativePrompt = matchedPreset.negativePromptAdditions;
      }
    }
    const fullPrompt = enhancedNegativePrompt ? `${enhancedPrompt} ### ${enhancedNegativePrompt}` : enhancedPrompt;
    const maxStepsAllowed = matchedPreset ? matchedPreset.maxSteps : 30;
    const hordePayload = {
      prompt: fullPrompt,
      params: {
        sampler_name: "k_euler",
        cfg_scale: guidance,
        steps: Math.min(steps, maxStepsAllowed),
        width,
        height,
        seed: seed !== void 0 ? String(seed) : void 0,
        n: 1
      },
      nsfw: false,
      censor_nsfw: true,
      models: [baseHordeModel]
    };
    try {
      const response = await fetch("https://stablehorde.net/api/v2/generate/async", {
        method: "POST",
        headers: {
          apikey: hordeApiKey,
          "Client-Agent": "OxygenLowsSoftware:1.0:image-gen",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(hordePayload)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("AI Horde Gen Error:", response.status, errorData);
        return c.json(
          {
            error: errorData.message || "AI Horde is currently busy. Please try another model or retry."
          },
          response.status
        );
      }
      const data = await response.json();
      return c.json({
        success: true,
        async: true,
        id: data.id,
        kudos: data.kudos,
        provider: "horde",
        model: responseModelName
      });
    } catch (err) {
      console.error("AI Horde Submit Error:", err);
      return c.json({ error: "Failed to connect to AI Horde network." }, 500);
    }
  }
  return c.json({ error: "Unsupported provider" }, 400);
});
imageGenRouter.get("/status/:id", imageLimiter, async (c) => {
  const id = c.req.param("id");
  if (!id || typeof id !== "string") {
    return c.json({ error: "Generation job ID is required" }, 400);
  }
  try {
    const checkRes = await fetch(
      `https://stablehorde.net/api/v2/generate/check/${encodeURIComponent(id)}`,
      {
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:image-gen" }
      }
    );
    if (!checkRes.ok) {
      return c.json(
        { error: "Job status check failed or job expired." },
        checkRes.status
      );
    }
    const checkData = await checkRes.json();
    if (checkData.faulted) {
      return c.json({
        done: true,
        faulted: true,
        error: "Generation job failed on worker. Please try again."
      });
    }
    if (!checkData.done) {
      return c.json({
        done: false,
        processing: checkData.processing || 0,
        waiting: checkData.waiting || 0,
        queue_position: checkData.queue_position || 0,
        wait_time: checkData.wait_time || 0
      });
    }
    const statusRes = await fetch(
      `https://stablehorde.net/api/v2/generate/status/${encodeURIComponent(id)}`,
      {
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:image-gen" }
      }
    );
    if (!statusRes.ok) {
      return c.json(
        { error: "Failed to retrieve final generation result." },
        statusRes.status
      );
    }
    const statusData = await statusRes.json();
    if (!statusData.generations || statusData.generations.length === 0) {
      return c.json({ error: "No image generation returned." }, 500);
    }
    const gen = statusData.generations[0];
    if (gen.censored) {
      return c.json({
        done: true,
        faulted: true,
        error: "Generated image was filtered out by SFW safety censor."
      });
    }
    let imageUrl = gen.img;
    if (typeof imageUrl === "string" && !imageUrl.startsWith("http") && !imageUrl.startsWith("data:")) {
      imageUrl = `data:image/webp;base64,${imageUrl}`;
    }
    return c.json({
      done: true,
      faulted: false,
      image: imageUrl,
      seed: gen.seed
    });
  } catch (err) {
    console.error("AI Horde Status Error:", err);
    return c.json({ error: "Failed to poll AI Horde status." }, 500);
  }
});
imageGenRouter.post("/save-to-storage", imageLimiter, async (c) => {
  const authHeader = c.req.header("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const { image, prompt } = body || {};
  if (!image || typeof image !== "string") {
    return c.json({ error: "Image data or URL is required" }, 400);
  }
  try {
    let buffer;
    let ext = "png";
    if (image.startsWith("data:")) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return c.json({ error: "Invalid data URL format" }, 400);
      }
      const mime = match[1];
      ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";
      buffer = Buffer.from(match[2], "base64");
    } else if (image.startsWith("http")) {
      const res = await fetch(image);
      if (!res.ok) {
        return c.json({ error: "Failed to download image from source" }, 400);
      }
      const arrayBuf = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      const contentType = res.headers.get("content-type") || "";
      ext = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png";
    } else {
      buffer = Buffer.from(image, "base64");
    }
    const timestamp = Date.now();
    const cleanPrompt = (prompt || "generated").slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `ai_${cleanPrompt}_${timestamp}.${ext}`;
    const filePath = `${user.id}/ai-images/${filename}`;
    const uploadRes = await serverStorage.upload("Storage", filePath, buffer);
    if (uploadRes.error) {
      console.error("Storage upload error:", uploadRes.error);
      return c.json({ error: "Failed to write image to storage" }, 500);
    }
    const publicUrl = `/api/storage/download/Storage/${filePath}`;
    return c.json({
      success: true,
      path: filePath,
      filename,
      url: publicUrl
    });
  } catch (err) {
    console.error("Save to storage error:", err);
    return c.json({ error: "Failed to save image to storage" }, 500);
  }
});

// server/routes/vpn.ts
import { Hono as Hono8 } from "hono";
import ping from "ping";
var vpnRouter = new Hono8();
var apiLimiter2 = rateLimiter(30, 6e4, "vpn");
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
vpnRouter.get("/ping", apiLimiter2, async (c) => {
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
vpnRouter.get("/geocode", apiLimiter2, async (c) => {
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
import { isIP } from "node:net";

// server/lib/defenderBannedIps.ts
init_dataStore();
var DEFENDER_BANS_OWNER_ID = "__system__";
function getActiveDefenderBannedIps() {
  return getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID).filter((record) => record.active !== false).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
function publicDefenderBannedIp(record) {
  return {
    ip: record.ip,
    reason: record.reason,
    banned_at: record.created_at
  };
}

// packages/webdefender/src/vpn.ts
function ipToNumber(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const byte = parseInt(parts[i], 10);
    if (isNaN(byte) || byte < 0 || byte > 255) return null;
    num = num << 8 | byte;
  }
  return num >>> 0;
}
function parseCidr(cidr) {
  const [ipStr, prefixStr] = cidr.split("/");
  if (!prefixStr) return null;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const ipNum = ipToNumber(ipStr.trim());
  if (ipNum === null) return null;
  const mask = prefix === 0 ? 0 : ~0 << 32 - prefix >>> 0;
  const network = (ipNum & mask) >>> 0;
  return { network, mask };
}
function isIpInCidr(ipNum, cidr) {
  return (ipNum & cidr.mask) >>> 0 === cidr.network;
}
function matchesIpOrCidr(ip, patterns) {
  if (!ip || !patterns || patterns.length === 0) return false;
  const cleanIp = (ip || "").trim().toLowerCase();
  const ipNum = ipToNumber(cleanIp);
  for (let i = 0; i < patterns.length; i++) {
    const rawPattern = (patterns[i] || "").trim();
    if (!rawPattern) continue;
    if (rawPattern.includes("/")) {
      if (ipNum !== null) {
        const cidr = parseCidr(rawPattern);
        if (cidr && isIpInCidr(ipNum, cidr)) {
          return true;
        }
      }
    } else {
      if (rawPattern.toLowerCase() === cleanIp) {
        return true;
      }
    }
  }
  return false;
}
var SEED_VPN_IPS = [
  // VPNBook known server IPs
  "198.7.58.196",
  "198.7.58.197",
  "198.7.58.198",
  "198.7.58.199",
  "198.7.58.200",
  "178.238.224.78",
  "178.238.224.79",
  "178.238.224.80",
  "178.238.224.81",
  "94.23.238.163",
  "198.245.51.218",
  "198.245.51.219",
  "142.4.215.116",
  "51.254.218.157",
  "51.254.218.158",
  "195.154.219.141",
  "195.154.219.142",
  "176.31.240.217",
  "176.31.240.218",
  "176.31.240.219"
];
var SEED_VPN_CIDRS = [
  // NordVPN / Tefincom subnets
  "185.128.24.0/22",
  "89.187.160.0/20",
  "193.189.100.0/23",
  "194.35.233.0/24",
  "194.26.29.0/24",
  "194.147.140.0/24",
  "185.242.6.0/24",
  // Mullvad subnets
  "185.213.154.0/24",
  "185.213.155.0/24",
  "193.32.127.0/24",
  "193.32.248.0/24",
  // Surfshark subnets
  "156.146.32.0/20",
  "185.246.128.0/22",
  "146.70.0.0/16",
  // ProtonVPN subnets
  "185.159.157.0/24",
  "185.159.158.0/24",
  "194.126.177.0/24",
  "185.107.56.0/24"
];
var EXCLUDED_NON_VPN_IPS = [
  // Google Public DNS
  "8.8.8.8",
  "8.8.4.4",
  // Cloudflare DNS
  "1.1.1.1",
  "1.0.0.1",
  // Quad9 DNS
  "9.9.9.9",
  "149.112.112.112",
  // OpenDNS
  "208.67.222.222",
  "208.67.220.220",
  // AdGuard DNS
  "94.140.14.14",
  "94.140.15.15"
];
var EXCLUDED_NON_VPN_CIDRS = [
  // Google Public DNS
  "8.8.8.0/24",
  "8.8.4.0/24",
  // Cloudflare DNS
  "1.1.1.0/24",
  "1.0.0.0/24",
  // Quad9 DNS
  "9.9.9.0/24",
  "149.112.112.0/24",
  // OpenDNS
  "208.67.220.0/23",
  // Standard AWS Cloud / EC2 Infrastructure
  "54.224.0.0/11",
  "54.239.0.0/16",
  "52.0.0.0/11",
  "3.0.0.0/9",
  // Standard Google Infrastructure / GCP
  "142.250.0.0/15",
  "172.217.0.0/16",
  "216.58.192.0/19",
  // Tor relay networks (Tor nodes are classified as is_tor, never is_vpn)
  "185.220.100.0/22"
];
var VPN_FEEDS = [
  "https://api.mullvad.net/www/relays/all/"
];
var VpnDetector = class {
  vpnIps = /* @__PURE__ */ new Set();
  vpnCidrs = [];
  excludedIps = /* @__PURE__ */ new Set();
  excludedCidrs = [];
  intervalId;
  isRefreshing = false;
  constructor(options) {
    this.initSeedData();
    if (options?.autoRefresh !== false) {
      this.startRefreshInterval();
    }
  }
  initSeedData() {
    for (const ip of SEED_VPN_IPS) {
      this.vpnIps.add(ip);
    }
    for (const cidrStr of SEED_VPN_CIDRS) {
      const cidr = parseCidr(cidrStr);
      if (cidr) {
        this.vpnCidrs.push(cidr);
      }
    }
    for (const ip of EXCLUDED_NON_VPN_IPS) {
      this.excludedIps.add(ip);
    }
    for (const cidrStr of EXCLUDED_NON_VPN_CIDRS) {
      const cidr = parseCidr(cidrStr);
      if (cidr) {
        this.excludedCidrs.push(cidr);
      }
    }
  }
  startRefreshInterval() {
    if (this.intervalId) return;
    this.refresh();
    this.intervalId = setInterval(() => this.refresh(), 36e5);
    if (this.intervalId && typeof this.intervalId === "object" && "unref" in this.intervalId) {
      this.intervalId.unref();
    }
  }
  parseLines(text) {
    const ips = /* @__PURE__ */ new Set();
    const cidrs = [];
    const lines = text.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith(";")) {
        continue;
      }
      const token = line.split(/\s+/)[0].trim();
      if (token.includes("/")) {
        const cidr = parseCidr(token);
        if (cidr) {
          cidrs.push(cidr);
        }
      } else {
        const cleanIp = token.split(":")[0].trim();
        if (cleanIp) {
          ips.add(cleanIp);
        }
      }
    }
    return { ips, cidrs };
  }
  isExcluded(ip) {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;
    if (this.excludedIps.has(cleanIp)) {
      return true;
    }
    const ipNum = ipToNumber(cleanIp);
    if (ipNum !== null) {
      for (const cidr of this.excludedCidrs) {
        if ((ipNum & cidr.mask) >>> 0 === cidr.network) {
          return true;
        }
      }
    }
    return false;
  }
  async refresh() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      await Promise.allSettled(
        VPN_FEEDS.map(async (url) => {
          try {
            const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
            const timeout = setTimeout(() => controller?.abort(), 5e3);
            const response = await fetch(url, {
              signal: controller?.signal,
              headers: { "User-Agent": "WebDefender/1.0" }
            });
            clearTimeout(timeout);
            if (response.ok) {
              const text = await response.text();
              if (url.includes("mullvad.net") || text.trim().startsWith("[")) {
                try {
                  const data = JSON.parse(text);
                  if (Array.isArray(data)) {
                    for (const relay of data) {
                      if (relay.ipv4_addr_in && !this.isExcluded(relay.ipv4_addr_in)) {
                        this.vpnIps.add(relay.ipv4_addr_in);
                      }
                    }
                  }
                } catch {
                }
              } else {
                const { ips, cidrs } = this.parseLines(text);
                for (const ip of ips) {
                  if (!this.isExcluded(ip)) {
                    this.vpnIps.add(ip);
                  }
                }
                for (const cidr of cidrs) {
                  this.vpnCidrs.push(cidr);
                }
              }
            }
          } catch (err) {
          }
        })
      );
    } finally {
      this.isRefreshing = false;
    }
  }
  isVpn(ip) {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;
    if (this.isExcluded(cleanIp)) {
      return false;
    }
    if (this.vpnIps.has(cleanIp)) {
      return true;
    }
    const ipNum = ipToNumber(cleanIp);
    if (ipNum !== null) {
      for (const cidr of this.vpnCidrs) {
        if ((ipNum & cidr.mask) >>> 0 === cidr.network) {
          return true;
        }
      }
    }
    return false;
  }
  addVpnIp(ip) {
    if (!ip) return;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (cleanIp) {
      this.vpnIps.add(cleanIp);
    }
  }
  addVpnCidr(cidrStr) {
    const cidr = parseCidr(cidrStr);
    if (cidr) {
      this.vpnCidrs.push(cidr);
    }
  }
  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = void 0;
    }
    this.vpnIps.clear();
    this.vpnCidrs = [];
    this.excludedIps.clear();
    this.excludedCidrs = [];
  }
};

// packages/webdefender/src/tor.ts
var SEED_TOR_IPS = [
  "185.220.101.5",
  "198.96.155.3",
  "171.25.193.20",
  "185.220.100.241",
  "185.220.101.55",
  "171.25.193.25",
  "198.98.51.189",
  "80.67.167.81",
  "109.70.100.4",
  "89.58.26.216",
  "185.220.102.8",
  "185.220.103.11",
  "198.96.155.12",
  "171.25.193.77"
];
var SEED_TOR_CIDRS = [
  // Applied Privacy / Zwiebelfreunde dedicated Tor exit relay subnets
  "185.220.100.0/22",
  "171.25.193.0/24",
  "198.96.155.0/24",
  "109.70.100.0/24",
  "185.100.84.0/22"
];
var TorDetector = class {
  exitNodes = /* @__PURE__ */ new Set();
  exitCidrs = [];
  nonExitNodes = /* @__PURE__ */ new Set();
  intervalId;
  isRefreshing = false;
  constructor(options) {
    this.initSeedData();
    if (options?.autoRefresh !== false) {
      this.startRefreshInterval();
    }
  }
  initSeedData() {
    for (const ip of SEED_TOR_IPS) {
      this.exitNodes.add(ip);
    }
    for (const cidrStr of SEED_TOR_CIDRS) {
      const cidr = parseCidr(cidrStr);
      if (cidr) {
        this.exitCidrs.push(cidr);
      }
    }
  }
  startRefreshInterval() {
    if (this.intervalId) return;
    this.refresh();
    this.intervalId = setInterval(() => this.refresh(), 36e5);
    if (this.intervalId && typeof this.intervalId === "object" && "unref" in this.intervalId) {
      this.intervalId.unref();
    }
  }
  async refresh() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      let text = "";
      try {
        const response = await fetch(
          "https://check.torproject.org/exit-addresses"
        );
        if (response.ok) {
          text = await response.text();
        }
      } catch {
      }
      if (!text) {
        try {
          const fallbackRes = await fetch(
            "https://raw.githubusercontent.com/SecOps-Institute/Tor-IP-Addresses/master/tor-exit-nodes.lst"
          );
          if (fallbackRes.ok) {
            text = await fallbackRes.text();
          }
        } catch {
        }
      }
      if (text) {
        const newNodes = /* @__PURE__ */ new Set();
        for (const seedIp of SEED_TOR_IPS) {
          newNodes.add(seedIp);
        }
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          if (trimmed.startsWith("ExitAddress ")) {
            const parts = trimmed.split(" ");
            if (parts.length >= 2) {
              const ip = parts[1].trim();
              if (ip) newNodes.add(ip);
            }
          } else {
            const token = trimmed.split(/\s+/)[0].trim();
            if (token && !token.includes("/")) {
              newNodes.add(token);
            }
          }
        }
        if (newNodes.size > 0) {
          this.exitNodes = newNodes;
        }
      }
    } catch (error) {
    } finally {
      this.isRefreshing = false;
    }
  }
  isTorExitNode(ip) {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;
    if (this.exitNodes.has(cleanIp)) {
      return true;
    }
    const ipNum = ipToNumber(cleanIp);
    if (ipNum !== null) {
      for (const cidr of this.exitCidrs) {
        if ((ipNum & cidr.mask) >>> 0 === cidr.network) {
          return true;
        }
      }
    }
    return false;
  }
  async isTorExitNodeAsync(ip) {
    if (!ip) return false;
    const cleanIp = ip.trim().split(":")[0].trim();
    if (!cleanIp) return false;
    if (this.isTorExitNode(cleanIp)) {
      return true;
    }
    if (this.nonExitNodes.has(cleanIp)) {
      return false;
    }
    try {
      const parts = cleanIp.split(".");
      if (parts.length === 4) {
        const dns = await import("node:dns");
        const reversed = [...parts].reverse().join(".");
        const query = `${reversed}.dnsel.torproject.org`;
        const result = await Promise.race([
          dns.promises.resolve4(query),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("DNSEL Timeout")), 1e3)
          )
        ]);
        if (Array.isArray(result) && result.includes("127.0.0.2")) {
          this.addExitNode(cleanIp);
          return true;
        }
      }
    } catch {
    }
    this.nonExitNodes.add(cleanIp);
    return false;
  }
  addExitNode(ip) {
    if (ip) {
      const cleanIp = ip.trim().split(":")[0].trim();
      if (cleanIp) {
        this.exitNodes.add(cleanIp);
        this.nonExitNodes.delete(cleanIp);
      }
    }
  }
  addExitCidr(cidrStr) {
    const cidr = parseCidr(cidrStr);
    if (cidr) {
      this.exitCidrs.push(cidr);
    }
  }
  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = void 0;
    }
    this.exitNodes.clear();
    this.exitCidrs = [];
    this.nonExitNodes.clear();
  }
};

// packages/webdefender/src/threatActors.ts
var THREAT_FEEDS = [
  {
    category: "bruteforce",
    urls: [
      "https://lists.blocklist.de/lists/bruteforcelogin.txt",
      "https://lists.blocklist.de/lists/ssh.txt"
    ]
  },
  {
    category: "http_dos",
    urls: [
      "https://lists.blocklist.de/lists/dos.txt",
      "https://lists.blocklist.de/lists/httprequest.txt"
    ]
  },
  {
    category: "http_exploit",
    urls: ["https://lists.blocklist.de/lists/apache.txt"]
  },
  {
    category: "botnet",
    urls: [
      "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
      "https://lists.blocklist.de/lists/bots.txt"
    ]
  }
];
var ThreatActorDetector = class {
  categoryNodes = /* @__PURE__ */ new Map([
    ["bruteforce", /* @__PURE__ */ new Set()],
    ["http_dos", /* @__PURE__ */ new Set()],
    ["http_exploit", /* @__PURE__ */ new Set()],
    ["botnet", /* @__PURE__ */ new Set()]
  ]);
  intervalId;
  isRefreshing = false;
  constructor(options) {
    if (options?.autoRefresh !== false) {
      this.startRefreshInterval();
    }
  }
  startRefreshInterval() {
    if (this.intervalId) return;
    this.refresh();
    this.intervalId = setInterval(() => this.refresh(), 36e5);
    if (this.intervalId && typeof this.intervalId === "object" && "unref" in this.intervalId) {
      this.intervalId.unref();
    }
  }
  parseIps(text) {
    const ips = /* @__PURE__ */ new Set();
    const lines = text.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith(";")) {
        continue;
      }
      const token = line.split(/\s+/)[0].trim();
      const cleanIp = token.split(":")[0].split("/")[0].trim();
      if (cleanIp) {
        ips.add(cleanIp);
      }
    }
    return ips;
  }
  async refresh() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      await Promise.allSettled(
        THREAT_FEEDS.map(async (feed) => {
          const categoryIps = /* @__PURE__ */ new Set();
          await Promise.allSettled(
            feed.urls.map(async (url) => {
              try {
                const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
                const timeout = setTimeout(() => controller?.abort(), 5e3);
                const response = await fetch(url, {
                  signal: controller?.signal
                });
                clearTimeout(timeout);
                if (response.ok) {
                  const text = await response.text();
                  const parsed = this.parseIps(text);
                  for (const ip of parsed) {
                    categoryIps.add(ip);
                  }
                }
              } catch (err) {
              }
            })
          );
          if (categoryIps.size > 0) {
            this.categoryNodes.set(feed.category, categoryIps);
          }
        })
      );
    } finally {
      this.isRefreshing = false;
    }
  }
  checkThreatActor(ip) {
    if (!ip) return null;
    const cleanIp = ip.trim();
    const categories = [
      "bruteforce",
      "http_dos",
      "http_exploit",
      "botnet"
    ];
    for (const cat of categories) {
      const set = this.categoryNodes.get(cat);
      if (set && set.has(cleanIp)) {
        return { category: cat, feed: cat };
      }
    }
    return null;
  }
  addThreatIp(category, ip) {
    const set = this.categoryNodes.get(category);
    if (set) {
      set.add(ip.trim());
    }
  }
  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = void 0;
    }
    for (const set of this.categoryNodes.values()) {
      set.clear();
    }
  }
};

// server/routes/webdefender.ts
var torDetector = new TorDetector();
var vpnDetector = new VpnDetector();
var threatActorDetector = new ThreatActorDetector();
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
      routes,
      admin_banned_ips: config.block_admin_banned_ips !== false ? getActiveDefenderBannedIps().map(publicDefenderBannedIp) : []
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
async function broadcastAllDefenderConfigUpdates() {
  const appIds = getTableRows("defender_apps").map((app2) => app2.id);
  await Promise.all(appIds.map((appId) => broadcastConfigUpdate(appId)));
}
function packageConfigPayload(app2, config, routes) {
  return {
    id: app2.id,
    name: app2.name,
    block_mode_enabled: app2.block_mode_enabled,
    config,
    routes,
    admin_banned_ips: config.block_admin_banned_ips !== false ? getActiveDefenderBannedIps().map(publicDefenderBannedIp) : []
  };
}
var ABUSEIPDB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function publicDefenderApp(app2) {
  const {
    api_key: _apiKey,
    api_key_hash: _apiKeyHash,
    abuseipdb_api_key: _abuseIpDbKey,
    ...safeApp
  } = app2;
  return {
    ...safeApp,
    abuseipdb_configured: Boolean(_abuseIpDbKey)
  };
}
async function checkAbuseIpDbAndMaybeBlock(app2, ip, config) {
  if (!config.auto_block_abuseipdb || !app2.abuseipdb_api_key || typeof ip !== "string") return;
  const cleanIp = ip.trim();
  if (!cleanIp || !isIP(cleanIp)) return;
  const now = Date.now();
  const records = getTableRows("defender_ip_blocks", app2.user_id);
  const previous = records.find(
    (record) => record.app_id === app2.id && record.ip === cleanIp
  );
  if (previous?.checked_at && now - new Date(previous.checked_at).getTime() < ABUSEIPDB_CACHE_TTL_MS) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5e3);
  try {
    const response = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(cleanIp)}&maxAgeInDays=90`,
      {
        headers: {
          Accept: "application/json",
          Key: app2.abuseipdb_api_key
        },
        signal: controller.signal
      }
    );
    if (!response.ok) {
      console.warn(`[Defender] AbuseIPDB check failed (${response.status}) for ${cleanIp}`);
      return;
    }
    const payload = await response.json();
    const abuseConfidenceScore = Number(payload?.data?.abuseConfidenceScore || 0);
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
    const updatedRecord = {
      ...previous || { id: randomUUID(), app_id: app2.id, user_id: app2.user_id, ip: cleanIp },
      checked_at: checkedAt,
      abuse_confidence_score: abuseConfidenceScore,
      auto_blocked: abuseConfidenceScore > 0
    };
    if (previous) {
      updateTable(
        "defender_ip_blocks",
        [{ field: "id", operator: "eq", value: previous.id }],
        updatedRecord,
        app2.user_id
      );
    } else {
      insertTable("defender_ip_blocks", updatedRecord, app2.user_id);
    }
    if (abuseConfidenceScore > 0) {
      const currentConfig = getTableRows("defender_config", app2.user_id).find(
        (cfg) => cfg.app_id === app2.id
      ) || { app_id: app2.id, user_id: app2.user_id, block_ips: [] };
      const blockIps = Array.isArray(currentConfig.block_ips) ? currentConfig.block_ips : [];
      if (!blockIps.some((blockedIp) => blockedIp.trim().toLowerCase() === cleanIp.toLowerCase())) {
        upsertTable(
          "defender_config",
          { ...currentConfig, block_ips: [...blockIps, cleanIp] },
          app2.user_id,
          "app_id"
        );
        broadcastConfigUpdate(app2.id).catch(() => {
        });
      }
    }
  } catch (error) {
    console.warn(`[Defender] AbuseIPDB check error for ${cleanIp}:`, error);
  } finally {
    clearTimeout(timeout);
  }
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
var knownThreatsLimiter = rateLimiter(5e3, 6e4, "def_threats");
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
  return c.json(packageConfigPayload(app2, config, app2.defender_routes || []));
});
defenderRouter.get("/banned-ips", async (c) => {
  const bannedIps = getActiveDefenderBannedIps().map(publicDefenderBannedIp);
  return c.json({ banned_ips: bannedIps, total: bannedIps.length });
});
async function evaluateIpThreat(ip) {
  const cleanIp = (ip || "").trim().toLowerCase();
  const activeBans = getActiveDefenderBannedIps();
  const banMatch = activeBans.find(
    (item) => (item.ip || "").trim().toLowerCase() === cleanIp
  );
  const isBanned = !!banMatch;
  const bannedReason = banMatch ? banMatch.reason : null;
  const threatActorMatch = threatActorDetector.checkThreatActor(cleanIp);
  const isThreatActor = !!threatActorMatch;
  const threatCategory = threatActorMatch ? threatActorMatch.category : null;
  const isKnownThreat = isBanned || isThreatActor;
  let isTor = torDetector.isTorExitNode(cleanIp);
  if (!isTor && typeof torDetector.isTorExitNodeAsync === "function") {
    isTor = await torDetector.isTorExitNodeAsync(cleanIp);
  }
  const isVpn = !isTor && vpnDetector.isVpn(cleanIp);
  return {
    ip: cleanIp,
    is_known_threat: isKnownThreat,
    is_tor: isTor,
    is_vpn: isVpn,
    details: {
      banned: isBanned,
      banned_reason: bannedReason,
      threat_actor: isThreatActor,
      threat_category: threatCategory
    }
  };
}
defenderRouter.get("/known-threats", knownThreatsLimiter, async (c) => {
  const ipParam = c.req.query("ip");
  if (ipParam === void 0 || ipParam === null || ipParam.trim() === "") {
    return c.json({ error: "IP address is required" }, 400);
  }
  const cleanIp = ipParam.trim();
  if (!isIP(cleanIp)) {
    return c.json({ error: "Invalid IP address format" }, 400);
  }
  const result = await evaluateIpThreat(cleanIp);
  return c.json(result);
});
defenderRouter.post("/known-threats", knownThreatsLimiter, async (c) => {
  let ip;
  try {
    const body = await c.req.json();
    ip = body?.ip;
  } catch {
    return c.json({ error: "IP address is required" }, 400);
  }
  if (typeof ip !== "string" || ip.trim() === "") {
    return c.json({ error: "IP address is required" }, 400);
  }
  const cleanIp = ip.trim();
  if (!isIP(cleanIp)) {
    return c.json({ error: "Invalid IP address format" }, 400);
  }
  const result = await evaluateIpThreat(cleanIp);
  return c.json(result);
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
      data: JSON.stringify(packageConfigPayload(
        { id: app2.id, name: appName, block_mode_enabled: blockModeEnabled },
        freshConfig,
        freshRoutes
      ))
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
  const rawEvents = Array.isArray(body) ? body : [body];
  if (rawEvents.length === 0) {
    return c.json({ logged: 0 }, 201);
  }
  const existingEvents = getTableRows("defender_events", app2.user_id);
  const config = Array.isArray(app2.defender_config) ? app2.defender_config[0] || {} : app2.defender_config || {};
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const createdRecords = [];
  for (const item of rawEvents) {
    if (!item || typeof item !== "object") continue;
    const matchingRoute = (app2.defender_routes || []).find(
      (r) => r.method === item.method && r.path === item.path
    );
    const eventRecord = {
      id: randomUUID(),
      app_id: app2.id,
      user_id: app2.user_id,
      route_id: matchingRoute?.id || null,
      event_type: item.eventType,
      ip: item.ip,
      country_code: item.countryCode || null,
      method: item.method,
      path: item.path,
      blocked: Boolean(item.blocked),
      request_body_snippet: item.requestBodySnippet || null,
      created_at: now
    };
    createdRecords.push(eventRecord);
    if (item.blocked && item.ip) {
      checkAbuseIpDbAndMaybeBlock(app2, item.ip, config).catch(() => {
      });
    }
  }
  existingEvents.unshift(...createdRecords);
  const maxEvents = Math.min(1e3, Math.max(1, config.events_limit || 50));
  const appEvents = existingEvents.filter((e) => e.app_id === app2.id).slice(0, maxEvents);
  const otherEvents = existingEvents.filter((e) => e.app_id !== app2.id);
  saveTableRows("defender_events", app2.user_id, [...appEvents, ...otherEvents]);
  return c.json({ logged: createdRecords.length }, 201);
});
defenderRouter.post("/outbound", eventLimiter, requireApiKey, async (c) => {
  const app2 = c.get("defenderApp");
  const config = Array.isArray(app2.defender_config) ? app2.defender_config[0] || {} : app2.defender_config || {};
  if (config.monitor_outbound === false) {
    return c.json({}, 200);
  }
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
  return c.json(apps.map(publicDefenderApp));
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
    abuseipdb_api_key: null,
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
    block_sensitive_paths: true,
    auto_block_sensitive_paths: true,
    sensitive_path_threshold: 3,
    sensitive_path_window_seconds: 20,
    sensitive_path_ban_duration_seconds: 600,
    block_tor: true,
    block_vpn: true,
    block_countries: [],
    block_ips: [],
    block_admin_banned_ips: true,
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
    monitor_outbound: true,
    batch_logging_enabled: true,
    batch_logging_interval_seconds: 20,
    only_log_threats: false,
    log_unique_ips_only: false,
    unique_ip_cooldown_seconds: 300,
    events_limit: 50,
    auto_block_abuseipdb: false,
    created_at: now
  };
  insertTable("defender_config", defaultConfig, user.id);
  return c.json(
    {
      ...publicDefenderApp(newApp),
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
  deleteTable(
    "defender_ip_blocks",
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
      ...publicDefenderApp(app2),
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
    "block_xss",
    "block_nosql_injection",
    "block_prototype_pollution",
    "block_sensitive_paths",
    "auto_block_sensitive_paths",
    "sensitive_path_threshold",
    "sensitive_path_window_seconds",
    "sensitive_path_ban_duration_seconds",
    "block_tor",
    "block_vpn",
    "block_countries",
    "block_ips",
    "allowlist_ips",
    "block_admin_banned_ips",
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
    "monitor_outbound",
    "events_limit",
    "auto_block_abuseipdb",
    "batch_logging_enabled",
    "batch_logging_interval_seconds",
    "only_log_threats",
    "log_unique_ips_only",
    "unique_ip_cooldown_seconds"
  ];
  const updatePayload = { app_id: id, user_id: user.id };
  for (const key of allowedKeys) {
    if (key in body) {
      if (key === "events_limit") {
        updatePayload[key] = Math.min(
          1e3,
          Math.max(1, parseInt(body[key]) || 50)
        );
      } else if (key === "sensitive_path_threshold") {
        updatePayload[key] = Math.max(1, parseInt(body[key]) || 3);
      } else if (key === "sensitive_path_window_seconds") {
        updatePayload[key] = Math.max(1, parseInt(body[key]) || 20);
      } else if (key === "sensitive_path_ban_duration_seconds") {
        updatePayload[key] = Math.max(1, parseInt(body[key]) || 600);
      } else if (key === "batch_logging_interval_seconds") {
        updatePayload[key] = Math.min(
          300,
          Math.max(1, parseInt(body[key]) || 20)
        );
      } else if (key === "unique_ip_cooldown_seconds") {
        updatePayload[key] = Math.min(
          86400,
          Math.max(1, parseInt(body[key]) || 300)
        );
      } else if (key === "batch_logging_enabled" || key === "only_log_threats" || key === "log_unique_ips_only") {
        updatePayload[key] = Boolean(body[key]);
      } else if (key === "allowlist_ips" || key === "block_ips" || key === "block_countries") {
        updatePayload[key] = Array.isArray(body[key]) ? body[key].map((item) => String(item).trim()).filter(Boolean) : [];
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
defenderRouter.put("/apps/:id/abuseipdb", uiLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { apiKey } = await c.req.json().catch(() => ({}));
  const app2 = getTableRows("defender_apps", user.id).find((item) => item.id === id);
  if (!app2) return c.json({ error: "App not found" }, 404);
  if (apiKey !== null && apiKey !== void 0 && (typeof apiKey !== "string" || apiKey.trim().length < 10)) {
    return c.json({ error: "A valid AbuseIPDB API key is required" }, 400);
  }
  const key = typeof apiKey === "string" ? apiKey.trim() : null;
  const updated = updateTable(
    "defender_apps",
    [{ field: "id", operator: "eq", value: id }],
    { abuseipdb_api_key: key },
    user.id
  );
  if (!key) {
    const configs = getTableRows("defender_config", user.id);
    const config = configs.find((item) => item.app_id === id);
    if (config?.auto_block_abuseipdb) {
      upsertTable(
        "defender_config",
        { ...config, auto_block_abuseipdb: false },
        user.id,
        "app_id"
      );
      broadcastConfigUpdate(id).catch(() => {
      });
    }
  }
  deleteTable(
    "defender_ip_blocks",
    [{ field: "app_id", operator: "eq", value: id }],
    user.id
  );
  return c.json(publicDefenderApp(updated[0] || { ...app2, abuseipdb_api_key: key }));
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
var HORDE_MODELS_MAP2 = {
  TitleGen: [
    "koboldcpp/Llama-3.2-1B-Instruct",
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
    "meta-llama/Llama-3.2-3B-Instruct"
  ],
  Fast: [
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
    "koboldcpp/llama-3.2-3b-instruct-q4_k_m",
    "meta-llama/Llama-3.2-3B-Instruct",
    "koboldcpp/Llama-3.2-1B-Instruct",
    "koboldcpp/L3-Super-Nova-RP-8B",
    "koboldcpp/L3-8B-Stheno-v3.2",
    "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M"
  ],
  Smart: ["aphrodite/TheDrummer/Behemoth-X-123B-v2.1"]
};
function resolveHordeModel2(model) {
  if (HORDE_MODELS_MAP2[model]) {
    return HORDE_MODELS_MAP2[model].join(",");
  }
  return model;
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
function decodeHtmlEntities(text) {
  return text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(
    /&#x([0-9a-f]+);/gi,
    (_, hex) => String.fromCharCode(parseInt(hex, 16))
  ).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ");
}
function stripHtmlTags2(input) {
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
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
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
      const cleanSnippet = stripHtmlTags2(match[2]).trim();
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
        const cleanSnippet = stripHtmlTags2(match[1]).trim();
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
      const clean = stripHtmlTags2(text2);
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
                    const parsedText = stripHtmlTags2(data.parse.text["*"]);
                    if (parsedText.length > 50)
                      return parsedText.substring(0, maxChars);
                  }
                  const pages = data?.query?.pages || {};
                  for (const k in pages) {
                    if (pages[k]?.extract) {
                      return stripHtmlTags2(pages[k].extract).substring(
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
    return stripHtmlTags2(text).substring(0, maxChars);
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
  hordeApiKey,
  apiKey,
  signal
}) {
  if (!apiKey && provider !== "horde" && !provider.includes("horde")) {
    throw new Error(
      `Provider '${provider}' is not configured.`
    );
  }
  let targetUrl = "";
  let requestBody = { stream, tools };
  const headers = {
    "Content-Type": "application/json"
  };
  if (provider === "horde" || provider.includes("horde")) {
    const actualModel = resolveHordeModel2(model);
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
        summarizerProvider,
        apiKey
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
      const reqResearchProvider = typeof researchProvider === "string" && researchProvider.trim() && researchProvider.trim() !== "cloudflare" ? researchProvider.trim() : null;
      const prefResearchProvider = userPrefs.research_agent_default_provider && userPrefs.research_agent_default_provider !== "cloudflare" && userPrefs.research_agent_default_provider || userPrefs.research_agent_provider && userPrefs.research_agent_provider !== "cloudflare" && userPrefs.research_agent_provider || null;
      const effectiveResearchProvider = reqResearchProvider || prefResearchProvider || "horde";
      const reqResearchModel = typeof researchModel === "string" && researchModel.trim() && !researchModel.startsWith("@cf/") ? researchModel.trim() : null;
      const prefResearchModel = userPrefs.research_agent_default_model && !userPrefs.research_agent_default_model.startsWith("@cf/") && userPrefs.research_agent_default_model || userPrefs.research_agent_model_id && !userPrefs.research_agent_model_id.startsWith("@cf/") && userPrefs.research_agent_model_id || null;
      const effectiveResearchModel = reqResearchModel || prefResearchModel || HORDE_FAST_MODEL;
      const rawSummarizerProvider = typeof summarizerProvider === "string" && summarizerProvider.trim() || userPrefs.research_summarizer_default_provider || userPrefs.research_summarizer_provider;
      const effectiveSummarizerProvider = rawSummarizerProvider && rawSummarizerProvider !== "cloudflare" ? rawSummarizerProvider : effectiveResearchProvider;
      const rawSummarizerModel = typeof summarizerModel === "string" && summarizerModel.trim() || userPrefs.research_summarizer_default_model || userPrefs.research_summarizer_model_id;
      const effectiveSummarizerModel = rawSummarizerModel && !rawSummarizerModel.startsWith("@cf/") && rawSummarizerProvider !== "cloudflare" ? rawSummarizerModel : effectiveResearchModel;
      if (!apiKey && effectiveResearchProvider !== "horde" && !effectiveResearchProvider.includes("horde")) {
        return c.json(
          {
            error: `Provider '${effectiveResearchProvider}' is not configured.`
          },
          400
        );
      }
      if (!researchOnly && !apiKey && effectiveSummarizerProvider !== "horde" && !effectiveSummarizerProvider.includes("horde")) {
        return c.json(
          {
            error: `Provider '${effectiveSummarizerProvider}' is not configured.`
          },
          400
        );
      }
      let hordeApiKey = "0000000000";
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
              hordeApiKey,
              apiKey,
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
            hordeApiKey,
            apiKey,
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
        return c.json({
          result: finalResult,
          searches: allSearches,
          totalPointsUsed: 0
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
                hordeApiKey,
                apiKey,
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
              hordeApiKey,
              apiKey,
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
          await write(
            sseJson({
              type: "result",
              content: finalContent,
              searches: allSearches,
              totalPointsUsed: 0
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

// server/lib/quickSignIn.ts
import crypto7 from "node:crypto";
var sessionsById = /* @__PURE__ */ new Map();
var sessionsByCode = /* @__PURE__ */ new Map();
var QUICK_SIGN_IN_TTL_MS = 5 * 60 * 1e3;
var CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateQuickSignInCode() {
  let code = "";
  const randomBytes3 = crypto7.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    const index = randomBytes3[i] % CODE_CHARS.length;
    code += CODE_CHARS[index];
  }
  return code;
}
function cleanExpiredQuickSignInSessions() {
  const now = Date.now();
  for (const [id, session] of sessionsById.entries()) {
    if (session.expiresAt <= now) {
      sessionsByCode.delete(session.code);
      sessionsById.delete(id);
    }
  }
}
function createQuickSignInSession(meta) {
  cleanExpiredQuickSignInSessions();
  const id = crypto7.randomUUID();
  let code = generateQuickSignInCode();
  let attempts = 0;
  while (sessionsByCode.has(code) && attempts < 10) {
    code = generateQuickSignInCode();
    attempts++;
  }
  const now = Date.now();
  const expiresAt = now + QUICK_SIGN_IN_TTL_MS;
  const session = {
    id,
    code,
    createdAt: now,
    expiresAt,
    status: "pending",
    ip: meta.ip || "Unknown",
    userAgent: meta.userAgent || "Unknown Device"
  };
  sessionsById.set(id, session);
  sessionsByCode.set(code, id);
  return { sessionId: id, code, expiresAt };
}
function getQuickSignInById(sessionId) {
  cleanExpiredQuickSignInSessions();
  const session = sessionsById.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    session.status = "expired";
    return session;
  }
  return session;
}
function getQuickSignInByCode(code) {
  cleanExpiredQuickSignInSessions();
  const cleanCode = (code || "").trim().toUpperCase();
  const id = sessionsByCode.get(cleanCode);
  if (!id) return null;
  const session = sessionsById.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    session.status = "expired";
    return session;
  }
  return session;
}
function approveQuickSignInSession(code, authData) {
  cleanExpiredQuickSignInSessions();
  const session = getQuickSignInByCode(code);
  if (!session || session.status !== "pending") {
    return false;
  }
  session.status = "approved";
  session.authData = authData;
  return true;
}
function rejectQuickSignInSession(code) {
  cleanExpiredQuickSignInSessions();
  const session = getQuickSignInByCode(code);
  if (!session || session.status !== "pending") {
    return false;
  }
  session.status = "rejected";
  return true;
}

// server/routes/auth.ts
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";

// server/lib/passkeys.ts
init_dataStore();
import fs5 from "node:fs";
import path5 from "node:path";
var RP_NAME = "Oxygen Low's Software";
function getRpId(c) {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
  if (process.env.RP_ID) return process.env.RP_ID;
  const host = c?.req?.header("x-forwarded-host") || c?.req?.header("host") || "localhost";
  return host.split(":")[0];
}
function getExpectedOrigin(c) {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN;
  if (process.env.RP_ORIGIN) return process.env.RP_ORIGIN;
  const host = c?.req?.header("x-forwarded-host") || c?.req?.header("host") || "localhost:3000";
  const protoHeader = c?.req?.header("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const protocol = protoHeader.split(",")[0].trim();
  return `${protocol}://${host}`;
}
var challengeMap = /* @__PURE__ */ new Map();
var cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of challengeMap.entries()) {
    if (val.exp < now) {
      challengeMap.delete(key);
    }
  }
}, 6e4);
if (typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}
function saveChallenge(challenge, userId, ttlMs = 5 * 60 * 1e3) {
  challengeMap.set(challenge, {
    challenge,
    userId,
    exp: Date.now() + ttlMs
  });
}
function consumeChallenge(challenge, expectedUserId) {
  if (!challenge) return false;
  const entry = challengeMap.get(challenge);
  if (!entry) return false;
  challengeMap.delete(challenge);
  if (entry.exp < Date.now()) {
    return false;
  }
  if (expectedUserId !== void 0 && entry.userId !== String(expectedUserId)) {
    return false;
  }
  return true;
}
var credentialIndex = /* @__PURE__ */ new Map();
var indexInitialized = false;
function getUserPasskeysPath(userId) {
  return path5.join(DATA_DIR, String(userId), "passkeys.json");
}
function ensureIndexInitialized() {
  if (indexInitialized) return;
  try {
    const userIds = getAllUserIds();
    for (const uid of userIds) {
      const p = getUserPasskeysPath(uid);
      if (fs5.existsSync(p)) {
        try {
          const list = JSON.parse(fs5.readFileSync(p, "utf-8"));
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item?.id) {
                credentialIndex.set(item.id, uid);
              }
            }
          }
        } catch {
        }
      }
    }
  } catch {
  }
  indexInitialized = true;
}
function getUserPasskeys(userId) {
  const p = getUserPasskeysPath(userId);
  if (!fs5.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs5.readFileSync(p, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function writeUserPasskeys(userId, passkeys) {
  const userDir = path5.join(DATA_DIR, String(userId));
  if (!fs5.existsSync(userDir)) {
    fs5.mkdirSync(userDir, { recursive: true });
  }
  const p = getUserPasskeysPath(userId);
  fs5.writeFileSync(p, JSON.stringify(passkeys, null, 2), "utf-8");
}
function saveUserPasskey(userId, passkey) {
  const current = getUserPasskeys(userId);
  const filtered = current.filter((pk) => pk.id !== passkey.id);
  filtered.push(passkey);
  writeUserPasskeys(userId, filtered);
  credentialIndex.set(passkey.id, String(userId));
}
function renameUserPasskey(userId, credentialId, newName) {
  const current = getUserPasskeys(userId);
  const target = current.find((pk) => pk.id === credentialId);
  if (!target) return false;
  target.name = newName.trim();
  writeUserPasskeys(userId, current);
  return true;
}
function deleteUserPasskey(userId, credentialId) {
  const current = getUserPasskeys(userId);
  const filtered = current.filter((pk) => pk.id !== credentialId);
  if (filtered.length === current.length) return false;
  writeUserPasskeys(userId, filtered);
  credentialIndex.delete(credentialId);
  return true;
}
function updatePasskeyCounter(userId, credentialId, counter) {
  const current = getUserPasskeys(userId);
  const target = current.find((pk) => pk.id === credentialId);
  if (target) {
    target.counter = counter;
    target.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
    writeUserPasskeys(userId, current);
  }
}
function findUserByPasskeyId(credentialId) {
  if (!credentialId) return null;
  ensureIndexInitialized();
  let userId = credentialIndex.get(credentialId);
  if (!userId) {
    const userIds = getAllUserIds();
    for (const uid of userIds) {
      const list = getUserPasskeys(uid);
      const match = list.find((pk) => pk.id === credentialId);
      if (match) {
        credentialIndex.set(credentialId, uid);
        userId = uid;
        break;
      }
    }
  }
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user) return null;
  const passkeys = getUserPasskeys(userId);
  const passkey = passkeys.find((pk) => pk.id === credentialId);
  if (!passkey) return null;
  return { user, passkey };
}

// server/routes/auth.ts
var authRouter = new Hono12();
authRouter.post("/register", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { username, email, authToken, password } = body;
    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return c.json(
        { error: "Username must be at least 3 characters long" },
        400
      );
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return c.json({ error: "A valid email address is required" }, 400);
    }
    const tokenInput = authToken || password;
    if (!tokenInput || typeof tokenInput !== "string" || tokenInput.length < 6) {
      return c.json(
        { error: "Password must be at least 6 characters long" },
        400
      );
    }
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanUsername.toLowerCase() === "oxygen-low") {
      return c.json({ error: "Username is already taken" }, 400);
    }
    const existing = getUserByUsernameOrEmail(cleanUsername) || getUserByUsernameOrEmail(cleanEmail);
    if (existing) {
      if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return c.json({ error: "Username is already taken" }, 400);
      }
      return c.json({ error: "Email is already registered" }, 400);
    }
    const userId = getNextUserId();
    const authSalt = generateSalt();
    const authVerifier = hashAuthVerifier(tokenInput, authSalt);
    const role = String(userId) === "1" ? "admin" : "user";
    const user = initUserFolder(userId, {
      username: cleanUsername,
      email: cleanEmail,
      authVerifier,
      authSalt,
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
    const { login, authToken, password } = body;
    if (!login) {
      return c.json({ error: "Username or email is required" }, 400);
    }
    const user = getUserByUsernameOrEmail(login);
    if (!user) {
      return c.json({ error: "Invalid username or password" }, 400);
    }
    if (!user.auth_verifier) {
      return c.json({
        needsMigration: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username
        }
      });
    }
    const tokenInput = authToken || password;
    if (!tokenInput) {
      return c.json({ error: "Username/email and password are required" }, 400);
    }
    const valid = verifyAuthToken(tokenInput, user.auth_verifier, user.auth_salt);
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
authRouter.post("/migrate-account", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { login, authToken, password } = body;
    const tokenInput = authToken || password;
    if (!login || !tokenInput) {
      return c.json(
        { error: "Username/email and new password are required" },
        400
      );
    }
    const user = getUserByUsernameOrEmail(login);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    const authSalt = generateSalt();
    const authVerifier = hashAuthVerifier(tokenInput, authSalt);
    const updated = updateUserAuthVerifier(user.id, authVerifier, authSalt);
    if (!updated) {
      return c.json({ error: "Failed to update user credentials" }, 500);
    }
    const token = generateToken({
      id: String(updated.id),
      username: String(updated.username),
      email: String(updated.email),
      role: updated.role
    });
    const session = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        role: String(updated.id) === "1" ? "admin" : updated.role || "user",
        user_metadata: {
          username: updated.username,
          full_name: updated.username,
          role: String(updated.id) === "1" ? "admin" : updated.role || "user"
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
    return c.json({ error: err.message || "Migration failed" }, 500);
  }
});
authRouter.post("/change-password", localAuthMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { currentAuthToken, newAuthToken } = body;
    if (!currentAuthToken || !newAuthToken) {
      return c.json(
        { error: "Current and new passwords are required" },
        400
      );
    }
    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }
    if (dbUser.auth_verifier) {
      const valid = verifyAuthToken(
        currentAuthToken,
        dbUser.auth_verifier,
        dbUser.auth_salt
      );
      if (!valid) {
        return c.json({ error: "Current password is incorrect" }, 400);
      }
    }
    const authSalt = generateSalt();
    const authVerifier = hashAuthVerifier(newAuthToken, authSalt);
    updateUserAuthVerifier(user.id, authVerifier, authSalt);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message || "Failed to change password" }, 500);
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
    const oauth = getUserOAuthStatus(user.id);
    return c.json({
      session: {
        access_token: token,
        token_type: "bearer",
        user
      },
      user: {
        ...user,
        profile,
        oauth
      }
    });
  } catch (err) {
    return c.json({ session: null, user: null, error: err.message });
  }
});
authRouter.post("/logout", async (c) => {
  return c.json({ success: true });
});
function getGoogleRedirectUri(c) {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || "localhost:3000";
  const protoHeader = c.req.header("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const protocol = protoHeader.split(",")[0].trim();
  return `${protocol}://${host}/api/auth/oauth/google/callback`;
}
function getGithubRedirectUri(c) {
  if (process.env.GITHUB_REDIRECT_URI) {
    return process.env.GITHUB_REDIRECT_URI;
  }
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || "localhost:3000";
  const protoHeader = c.req.header("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const protocol = protoHeader.split(",")[0].trim();
  return `${protocol}://${host}/api/auth/oauth/github/callback`;
}
authRouter.get("/oauth/config", (c) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  return c.json({
    google: {
      enabled: Boolean(googleClientId && googleClientSecret)
    },
    github: {
      enabled: Boolean(githubClientId && githubClientSecret)
    }
  });
});
authRouter.post(
  "/oauth/google/init-link",
  localAuthMiddleware,
  async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;
      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to link an external account" },
          400
        );
      }
      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }
      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return c.json(
          { error: "Google OAuth is not configured on the server" },
          500
        );
      }
      const state = generateOAuthState({
        action: "link",
        userId: String(user.id)
      });
      const redirectUri = getGoogleRedirectUri(c);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        access_type: "online",
        prompt: "select_account"
      });
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return c.json({ url: authUrl });
    } catch (err) {
      return c.json(
        { error: err.message || "Failed to initialize Google linking" },
        500
      );
    }
  }
);
authRouter.get("/oauth/google/login", (c) => {
  const platform = c.req.query("platform") || (c.req.query("mobile") === "1" ? "mobile" : void 0);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const errorTarget = platform === "mobile" ? "oxygenlows://auth?error=" + encodeURIComponent("Google OAuth is not configured on the server") : "/auth?error=" + encodeURIComponent("Google OAuth is not configured on the server");
    return c.redirect(errorTarget);
  }
  const returnTo = c.req.query("returnTo") || "/apps";
  const state = generateOAuthState({
    action: "login",
    returnTo,
    platform
  });
  const redirectUri = getGoogleRedirectUri(c);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account"
  });
  return c.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
});
authRouter.get("/oauth/google/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const errorParam = c.req.query("error");
  const state = stateParam ? verifyOAuthState(stateParam) : null;
  const isMobile = state?.platform === "mobile";
  const authBase = isMobile ? "oxygenlows://auth" : "/auth";
  const securityBase = isMobile ? "oxygenlows://security" : "/security";
  if (errorParam) {
    if (state?.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_failed`);
    }
    return c.redirect(`${authBase}?error=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !stateParam || !state) {
    return c.redirect("/auth?error=invalid_or_expired_state");
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_unconfigured`);
    }
    return c.redirect(`${authBase}?error=oauth_unconfigured`);
  }
  try {
    const redirectUri = getGoogleRedirectUri(c);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      }).toString()
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_token_failed`);
      }
      return c.redirect(`${authBase}?error=oauth_token_failed`);
    }
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` }
      }
    );
    const googleUser = await userRes.json();
    if (!userRes.ok || !googleUser.sub) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_user_failed`);
      }
      return c.redirect(`${authBase}?error=oauth_user_failed`);
    }
    const googleId = String(googleUser.sub);
    const googleEmail = String(googleUser.email || "");
    if (state.action === "link") {
      const targetUserId = state.userId;
      if (!targetUserId) {
        return c.redirect(`${securityBase}?error=invalid_user`);
      }
      const existingUser = getUserByOAuthProvider("google", googleId);
      if (existingUser && String(existingUser.id) !== String(targetUserId)) {
        return c.redirect(`${securityBase}?error=oauth_already_linked`);
      }
      linkUserOAuth(targetUserId, "google", {
        id: googleId,
        email: googleEmail
      });
      return c.redirect(`${securityBase}?oauth=linked`);
    }
    if (state.action === "login") {
      const linkedUser = getUserByOAuthProvider("google", googleId);
      if (!linkedUser) {
        return c.redirect(`${authBase}?error=oauth_not_linked`);
      }
      const token = generateToken(linkedUser);
      const returnTo = state.returnTo || "/apps";
      return c.redirect(
        `${authBase}?oauth_token=${encodeURIComponent(token)}&requires_unlock=true&returnTo=${encodeURIComponent(returnTo)}`
      );
    }
    return c.redirect(authBase);
  } catch (err) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_exception`);
    }
    return c.redirect(
      `${authBase}?error=${encodeURIComponent(err.message || "oauth_exception")}`
    );
  }
});
authRouter.post(
  "/oauth/google/unlink",
  localAuthMiddleware,
  async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;
      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to unlink an external account" },
          400
        );
      }
      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }
      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }
      unlinkUserOAuth(user.id, "google");
      return c.json({ success: true });
    } catch (err) {
      return c.json(
        { error: err.message || "Failed to unlink Google account" },
        500
      );
    }
  }
);
authRouter.post(
  "/oauth/github/init-link",
  localAuthMiddleware,
  async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;
      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to link an external account" },
          400
        );
      }
      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }
      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return c.json(
          { error: "GitHub OAuth is not configured on the server" },
          500
        );
      }
      const state = generateOAuthState({
        action: "link",
        userId: String(user.id)
      });
      const redirectUri = getGithubRedirectUri(c);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "read:user user:email",
        state
      });
      const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
      return c.json({ url: authUrl });
    } catch (err) {
      return c.json(
        { error: err.message || "Failed to initialize GitHub linking" },
        500
      );
    }
  }
);
authRouter.get("/oauth/github/login", (c) => {
  const platform = c.req.query("platform") || (c.req.query("mobile") === "1" ? "mobile" : void 0);
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    const errorTarget = platform === "mobile" ? "oxygenlows://auth?error=" + encodeURIComponent("GitHub OAuth is not configured on the server") + "&provider=github" : "/auth?error=" + encodeURIComponent("GitHub OAuth is not configured on the server") + "&provider=github";
    return c.redirect(errorTarget);
  }
  const returnTo = c.req.query("returnTo") || "/apps";
  const state = generateOAuthState({
    action: "login",
    returnTo,
    platform
  });
  const redirectUri = getGithubRedirectUri(c);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state
  });
  return c.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
});
authRouter.get("/oauth/github/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const errorParam = c.req.query("error");
  const state = stateParam ? verifyOAuthState(stateParam) : null;
  const isMobile = state?.platform === "mobile";
  const authBase = isMobile ? "oxygenlows://auth" : "/auth";
  const securityBase = isMobile ? "oxygenlows://security" : "/security";
  if (errorParam) {
    if (state?.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_failed&provider=github`);
    }
    return c.redirect(
      `${authBase}?error=${encodeURIComponent(errorParam)}&provider=github`
    );
  }
  if (!code || !stateParam || !state) {
    return c.redirect("/auth?error=invalid_or_expired_state&provider=github");
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_unconfigured&provider=github`);
    }
    return c.redirect(`${authBase}?error=oauth_unconfigured&provider=github`);
  }
  try {
    const redirectUri = getGithubRedirectUri(c);
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      }
    );
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_token_failed&provider=github`);
      }
      return c.redirect(`${authBase}?error=oauth_token_failed&provider=github`);
    }
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "User-Agent": "Oxygen-Lows-Software",
        Accept: "application/vnd.github+json"
      }
    });
    const githubUser = await userRes.json();
    if (!userRes.ok || !githubUser.id) {
      if (state.action === "link") {
        return c.redirect(`${securityBase}?error=oauth_user_failed&provider=github`);
      }
      return c.redirect(`${authBase}?error=oauth_user_failed&provider=github`);
    }
    const githubId = String(githubUser.id);
    let githubEmail = String(githubUser.email || "");
    if (!githubEmail) {
      try {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            "User-Agent": "Oxygen-Lows-Software",
            Accept: "application/vnd.github+json"
          }
        });
        if (emailsRes.ok) {
          const emailsJson = await emailsRes.json();
          if (Array.isArray(emailsJson) && emailsJson.length > 0) {
            const primary = emailsJson.find((e) => e.primary && e.verified) || emailsJson.find((e) => e.verified) || emailsJson[0];
            githubEmail = primary?.email ? String(primary.email) : "";
          }
        }
      } catch {
      }
    }
    if (!githubEmail && githubUser.login) {
      githubEmail = `${githubUser.login}@users.noreply.github.com`;
    }
    if (state.action === "link") {
      const targetUserId = state.userId;
      if (!targetUserId) {
        return c.redirect(`${securityBase}?error=invalid_user&provider=github`);
      }
      const existingUser = getUserByOAuthProvider("github", githubId);
      if (existingUser && String(existingUser.id) !== String(targetUserId)) {
        return c.redirect(`${securityBase}?error=oauth_already_linked&provider=github`);
      }
      linkUserOAuth(targetUserId, "github", {
        id: githubId,
        email: githubEmail
      });
      return c.redirect(`${securityBase}?oauth=linked&provider=github`);
    }
    if (state.action === "login") {
      const linkedUser = getUserByOAuthProvider("github", githubId);
      if (!linkedUser) {
        return c.redirect(`${authBase}?error=oauth_not_linked&provider=github`);
      }
      const token = generateToken(linkedUser);
      const returnTo = state.returnTo || "/apps";
      return c.redirect(
        `${authBase}?oauth_token=${encodeURIComponent(token)}&requires_unlock=true&returnTo=${encodeURIComponent(returnTo)}`
      );
    }
    return c.redirect(authBase);
  } catch (err) {
    if (state.action === "link") {
      return c.redirect(`${securityBase}?error=oauth_exception&provider=github`);
    }
    return c.redirect(
      `${authBase}?error=${encodeURIComponent(err.message || "oauth_exception")}&provider=github`
    );
  }
});
authRouter.post(
  "/oauth/github/unlink",
  localAuthMiddleware,
  async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;
      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to unlink an external account" },
          400
        );
      }
      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }
      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }
      unlinkUserOAuth(user.id, "github");
      return c.json({ success: true });
    } catch (err) {
      return c.json(
        { error: err.message || "Failed to unlink GitHub account" },
        500
      );
    }
  }
);
authRouter.post("/quick-sign-in/create", async (c) => {
  try {
    const rawIp = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "127.0.0.1";
    const ip = rawIp.split(",")[0].trim();
    const userAgent = c.req.header("user-agent") || "Unknown Device";
    const session = createQuickSignInSession({ ip, userAgent });
    return c.json({
      sessionId: session.sessionId,
      code: session.code,
      expiresAt: session.expiresAt
    });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to create quick sign-in session" },
      500
    );
  }
});
authRouter.get("/quick-sign-in/poll", async (c) => {
  try {
    const sessionId = c.req.query("sessionId");
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }
    const session = getQuickSignInById(sessionId);
    if (!session) {
      return c.json({ status: "expired", error: "Session not found or expired" }, 404);
    }
    if (session.status === "approved" && session.authData) {
      return c.json({
        status: "approved",
        session: session.authData.session,
        token: session.authData.token,
        user: session.authData.user
      });
    }
    return c.json({
      status: session.status,
      expiresAt: session.expiresAt
    });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to poll quick sign-in status" },
      500
    );
  }
});
authRouter.post("/quick-sign-in/verify", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code || typeof code !== "string") {
      return c.json({ error: "Code is required" }, 400);
    }
    const session = getQuickSignInByCode(code);
    if (!session || session.status !== "pending") {
      return c.json(
        { error: "Invalid or expired quick sign-in code", valid: false },
        400
      );
    }
    return c.json({
      valid: true,
      code: session.code,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ip: session.ip,
      userAgent: session.userAgent
    });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to verify quick sign-in code" },
      500
    );
  }
});
authRouter.post("/quick-sign-in/approve", localAuthMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code || typeof code !== "string") {
      return c.json({ error: "Code is required" }, 400);
    }
    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }
    const token = generateToken(dbUser);
    const sessionData = {
      access_token: token,
      token_type: "bearer",
      user: {
        id: dbUser.id,
        email: dbUser.email,
        username: dbUser.username,
        role: dbUser.role,
        user_metadata: {
          username: dbUser.username,
          full_name: dbUser.username,
          role: dbUser.role
        }
      }
    };
    const approved = approveQuickSignInSession(code, {
      user: sessionData.user,
      token,
      session: sessionData
    });
    if (!approved) {
      return c.json(
        { error: "Failed to approve session. Code may be invalid or expired." },
        400
      );
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to approve quick sign-in" },
      500
    );
  }
});
authRouter.post("/quick-sign-in/reject", localAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code || typeof code !== "string") {
      return c.json({ error: "Code is required" }, 400);
    }
    const rejected = rejectQuickSignInSession(code);
    return c.json({ success: rejected });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to reject quick sign-in" },
      500
    );
  }
});
authRouter.post(
  "/passkey/register-options",
  localAuthMiddleware,
  async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { password, authToken } = body;
      const tokenInput = authToken || password;
      if (!tokenInput) {
        return c.json(
          { error: "Password is required to register a passkey" },
          400
        );
      }
      const dbUser = getUserById(user.id);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }
      if (dbUser.auth_verifier) {
        const valid = verifyAuthToken(
          tokenInput,
          dbUser.auth_verifier,
          dbUser.auth_salt
        );
        if (!valid) {
          return c.json({ error: "Incorrect password" }, 400);
        }
      }
      const userPasskeys = getUserPasskeys(user.id);
      const excludeCredentials = userPasskeys.map((pk) => ({
        id: pk.id,
        transports: pk.transports
      }));
      const rpID = getRpId(c);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userName: dbUser.username || dbUser.email,
        userID: new TextEncoder().encode(String(user.id)),
        userDisplayName: dbUser.username || dbUser.email,
        attestationType: "none",
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred"
        }
      });
      saveChallenge(options.challenge, String(user.id));
      return c.json({ options });
    } catch (err) {
      return c.json(
        {
          error: err.message || "Failed to generate passkey registration options"
        },
        500
      );
    }
  }
);
authRouter.post(
  "/passkey/register-verify",
  localAuthMiddleware,
  async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const { response, nickname } = body;
      if (!response) {
        return c.json({ error: "Registration response is required" }, 400);
      }
      const rpID = getRpId(c);
      const expectedOrigin = getExpectedOrigin(c);
      let clientChallenge;
      try {
        const clientData = JSON.parse(
          Buffer.from(response.response.clientDataJSON, "base64url").toString(
            "utf-8"
          )
        );
        clientChallenge = clientData.challenge;
      } catch {
      }
      if (!clientChallenge || !consumeChallenge(clientChallenge, String(user.id))) {
        return c.json(
          { error: "Invalid or expired registration challenge" },
          400
        );
      }
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: clientChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: false
      });
      if (!verification.verified || !verification.registrationInfo) {
        return c.json(
          { error: "Passkey registration verification failed" },
          400
        );
      }
      const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;
      const defaultName = `Passkey (${(/* @__PURE__ */ new Date()).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric"
      })})`;
      const cleanName = typeof nickname === "string" && nickname.trim().length > 0 ? nickname.trim() : defaultName;
      const newPasskey = {
        id: credential.id,
        name: cleanName,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response?.transports || credential.transports,
        aaguid,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastUsedAt: null
      };
      saveUserPasskey(user.id, newPasskey);
      return c.json({
        success: true,
        passkey: {
          id: newPasskey.id,
          name: newPasskey.name,
          createdAt: newPasskey.createdAt,
          lastUsedAt: newPasskey.lastUsedAt
        }
      });
    } catch (err) {
      return c.json(
        { error: err.message || "Failed to verify passkey registration" },
        500
      );
    }
  }
);
authRouter.get("/passkey/login-options", async (c) => {
  try {
    const rpID = getRpId(c);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: []
    });
    saveChallenge(options.challenge);
    return c.json({ options });
  } catch (err) {
    return c.json(
      { error: err.message || "Failed to generate login options" },
      500
    );
  }
});
authRouter.post("/passkey/login-verify", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { response } = body;
    if (!response || !response.id) {
      return c.json({ error: "Passkey response is required" }, 400);
    }
    const match = findUserByPasskeyId(response.id);
    if (!match) {
      return c.json({ error: "Passkey not recognized on this device" }, 400);
    }
    const { user, passkey } = match;
    const rpID = getRpId(c);
    const expectedOrigin = getExpectedOrigin(c);
    let clientChallenge;
    try {
      const clientData = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64url").toString(
          "utf-8"
        )
      );
      clientChallenge = clientData.challenge;
    } catch {
    }
    if (!clientChallenge || !consumeChallenge(clientChallenge)) {
      return c.json({ error: "Invalid or expired login challenge" }, 400);
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        transports: passkey.transports
      },
      requireUserVerification: false
    });
    if (!verification.verified) {
      return c.json({ error: "Passkey verification failed" }, 400);
    }
    updatePasskeyCounter(
      user.id,
      passkey.id,
      verification.authenticationInfo.newCounter
    );
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
      requires_unlock: true,
      error: null
    });
  } catch (err) {
    return c.json(
      { error: err.message || "Passkey sign in failed" },
      500
    );
  }
});
authRouter.get("/passkey/list", localAuthMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const passkeys = getUserPasskeys(user.id).map(
      ({ id, name, createdAt, lastUsedAt, deviceType, backedUp }) => ({
        id,
        name,
        createdAt,
        lastUsedAt,
        deviceType,
        backedUp
      })
    );
    return c.json({ passkeys });
  } catch (err) {
    return c.json({ error: err.message || "Failed to list passkeys" }, 500);
  }
});
authRouter.post("/passkey/rename", localAuthMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { credentialId, name } = body;
    if (!credentialId || typeof credentialId !== "string") {
      return c.json({ error: "Credential ID is required" }, 400);
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "Passkey name is required" }, 400);
    }
    const updated = renameUserPasskey(user.id, credentialId, name.trim());
    if (!updated) {
      return c.json({ error: "Passkey not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message || "Failed to rename passkey" }, 500);
  }
});
authRouter.post("/passkey/delete", localAuthMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const { credentialId, password, authToken } = body;
    if (!credentialId || typeof credentialId !== "string") {
      return c.json({ error: "Credential ID is required" }, 400);
    }
    const tokenInput = authToken || password;
    if (!tokenInput) {
      return c.json(
        { error: "Password is required to delete a passkey" },
        400
      );
    }
    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }
    if (dbUser.auth_verifier) {
      const valid = verifyAuthToken(
        tokenInput,
        dbUser.auth_verifier,
        dbUser.auth_salt
      );
      if (!valid) {
        return c.json({ error: "Incorrect password" }, 400);
      }
    }
    const deleted = deleteUserPasskey(user.id, credentialId);
    if (!deleted) {
      return c.json({ error: "Passkey not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message || "Failed to delete passkey" }, 500);
  }
});

// server/routes/oauth.ts
init_auth();
init_dataStore();
import { Hono as Hono13 } from "hono";
import { createHash as createHash2, randomBytes as randomBytes2, randomUUID as randomUUID2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
var oauthRouter = new Hono13();
var authLimiter = rateLimiter(60, 60 * 1e3, "oauth");
var SUPPORTED_SCOPES = [
  "username",
  "display_name",
  "email",
  "profile_picture",
  "bio"
];
function hashApiKey2(key) {
  return createHash2("sha256").update(key).digest("hex");
}
function verifyApiKey(rawKey, storedHash) {
  try {
    const computed = hashApiKey2(rawKey);
    const hashBuf = Buffer.from(computed, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (hashBuf.length !== storedBuf.length) return false;
    return timingSafeEqual2(hashBuf, storedBuf);
  } catch {
    return false;
  }
}
function isValidRedirectUri(rawUri) {
  try {
    const parsed = new URL(rawUri);
    if (parsed.hash) return false;
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    if (isLocal) {
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function publicOAuthApp(app2) {
  const { api_key_hash: _hash, ...safeApp } = app2;
  return safeApp;
}
function buildScopedUser(user, profile, scopes) {
  const scoped = {
    id: String(user.id)
  };
  if (scopes.includes("username")) {
    scoped.username = user.username;
  }
  if (scopes.includes("display_name")) {
    scoped.display_name = profile?.display_name || user.username;
  }
  if (scopes.includes("email")) {
    scoped.email = user.email;
  }
  if (scopes.includes("profile_picture")) {
    scoped.profile_picture_url = profile?.avatar_url || null;
  }
  if (scopes.includes("bio")) {
    scoped.bio = profile?.bio || "";
  }
  return scoped;
}
async function requireUserAuth(c, next) {
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
  c.set("userId", String(user.id));
  await next();
}
async function optionalUserAuth(c) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  return await resolveUserFromToken(token);
}
oauthRouter.get("/apps", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const apps = getTableRows("oauth_apps", userId);
  return c.json(apps.map(publicOAuthApp));
});
oauthRouter.post("/apps", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const { name, description, redirect_uris, allowed_scopes, website_url } = body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "Application name is required" }, 400);
  }
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return c.json(
      { error: "At least one valid redirect URI is required" },
      400
    );
  }
  for (const uri of redirect_uris) {
    if (typeof uri !== "string" || !isValidRedirectUri(uri.trim())) {
      return c.json(
        {
          error: `Invalid redirect URI: ${uri}. Production URIs must use HTTPS, while localhost permits HTTP.`
        },
        400
      );
    }
  }
  const cleanUris = redirect_uris.map((u) => u.trim());
  let scopes = ["username", "display_name"];
  if (Array.isArray(allowed_scopes) && allowed_scopes.length > 0) {
    const valid = allowed_scopes.filter(
      (s) => SUPPORTED_SCOPES.includes(s)
    );
    if (valid.length > 0) scopes = Array.from(new Set(valid));
  }
  const appId = randomUUID2();
  const clientId = "ol_app_" + randomBytes2(16).toString("hex");
  const rawApiKey = "ol_sec_" + randomBytes2(32).toString("hex");
  const apiKeyHash = hashApiKey2(rawApiKey);
  const apiKeyPrefix = rawApiKey.substring(0, 10) + "...";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newApp = {
    id: appId,
    user_id: userId,
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : "",
    client_id: clientId,
    api_key_hash: apiKeyHash,
    api_key_prefix: apiKeyPrefix,
    redirect_uris: cleanUris,
    allowed_scopes: scopes,
    website_url: typeof website_url === "string" ? website_url.trim() : "",
    created_at: now,
    updated_at: now
  };
  insertTable("oauth_apps", newApp, userId);
  return c.json({
    app: publicOAuthApp(newApp),
    apiKey: rawApiKey
  }, 201);
});
oauthRouter.put("/apps/:id", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { name, description, redirect_uris, allowed_scopes, website_url } = body;
  const apps = getTableRows("oauth_apps", userId);
  const existingApp = apps.find((a) => a.id === appId);
  if (!existingApp) {
    return c.json({ error: "Application not found" }, 404);
  }
  const updates = {
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (typeof name === "string" && name.trim()) {
    updates.name = name.trim();
  }
  if (description !== void 0) {
    updates.description = typeof description === "string" ? description.trim() : "";
  }
  if (website_url !== void 0) {
    updates.website_url = typeof website_url === "string" ? website_url.trim() : "";
  }
  if (Array.isArray(redirect_uris)) {
    if (redirect_uris.length === 0) {
      return c.json({ error: "At least one redirect URI is required" }, 400);
    }
    for (const uri of redirect_uris) {
      if (typeof uri !== "string" || !isValidRedirectUri(uri.trim())) {
        return c.json(
          {
            error: `Invalid redirect URI: ${uri}. Production URIs must use HTTPS, while localhost permits HTTP.`
          },
          400
        );
      }
    }
    updates.redirect_uris = redirect_uris.map((u) => u.trim());
  }
  if (Array.isArray(allowed_scopes)) {
    const valid = allowed_scopes.filter(
      (s) => SUPPORTED_SCOPES.includes(s)
    );
    if (valid.length > 0) {
      updates.allowed_scopes = Array.from(new Set(valid));
    }
  }
  const updatedRows = updateTable(
    "oauth_apps",
    [{ field: "id", operator: "eq", value: appId }],
    updates,
    userId
  );
  return c.json(publicOAuthApp(updatedRows[0] || { ...existingApp, ...updates }));
});
oauthRouter.post(
  "/apps/:id/regenerate-key",
  authLimiter,
  requireUserAuth,
  async (c) => {
    const userId = c.get("userId");
    const appId = c.req.param("id");
    const apps = getTableRows("oauth_apps", userId);
    const existingApp = apps.find((a) => a.id === appId);
    if (!existingApp) {
      return c.json({ error: "Application not found" }, 404);
    }
    const rawApiKey = "ol_sec_" + randomBytes2(32).toString("hex");
    const apiKeyHash = hashApiKey2(rawApiKey);
    const apiKeyPrefix = rawApiKey.substring(0, 10) + "...";
    updateTable(
      "oauth_apps",
      [{ field: "id", operator: "eq", value: appId }],
      {
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      userId
    );
    return c.json({
      apiKey: rawApiKey,
      apiKeyPrefix
    });
  }
);
oauthRouter.delete("/apps/:id", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");
  const apps = getTableRows("oauth_apps", userId);
  const existingApp = apps.find((a) => a.id === appId);
  if (!existingApp) {
    return c.json({ error: "Application not found" }, 404);
  }
  deleteTable("oauth_apps", [{ field: "id", operator: "eq", value: appId }], userId);
  return c.json({ success: true });
});
oauthRouter.get("/apps/:id/stats", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");
  const apps = getTableRows("oauth_apps", userId);
  const existingApp = apps.find((a) => a.id === appId);
  if (!existingApp) {
    return c.json({ error: "Application not found" }, 404);
  }
  const allGrants = getTableRows("oauth_grants");
  const appGrants = allGrants.filter(
    (g) => g.app_id === appId || g.client_id === existingApp.client_id
  );
  const distinctUsers = new Set(appGrants.map((g) => String(g.user_id)));
  const allTokens = getTableRows("oauth_tokens");
  const activeTokens = allTokens.filter(
    (t) => (t.app_id === appId || t.client_id === existingApp.client_id) && !t.revoked && t.expires_at > Date.now()
  );
  return c.json({
    total_authorized_users: distinctUsers.size,
    active_tokens: activeTokens.length
  });
});
oauthRouter.get("/authorize-details", authLimiter, async (c) => {
  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const requestedScopeRaw = c.req.query("scope");
  if (!clientId) {
    return c.json({ error: "Missing client_id parameter" }, 400);
  }
  if (!redirectUri) {
    return c.json({ error: "Missing redirect_uri parameter" }, 400);
  }
  const allApps = getTableRows("oauth_apps");
  const app2 = allApps.find(
    (a) => a.client_id === clientId || a.id === clientId
  );
  if (!app2) {
    return c.json({ error: "Invalid client_id" }, 400);
  }
  const cleanRedirectUri = redirectUri.trim();
  const uriMatched = (app2.redirect_uris || []).some(
    (allowed) => allowed.toLowerCase() === cleanRedirectUri.toLowerCase()
  );
  if (!uriMatched) {
    return c.json(
      {
        error: "The redirect URI provided does not match any registered redirect URIs for this application."
      },
      400
    );
  }
  const allowedScopes = app2.allowed_scopes || ["username", "display_name"];
  let requestedScopes = allowedScopes;
  if (requestedScopeRaw && typeof requestedScopeRaw === "string") {
    const parsed = requestedScopeRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (parsed.length > 0) {
      requestedScopes = parsed.filter(
        (s) => allowedScopes.includes(s)
      );
    }
  }
  const currentUser = await optionalUserAuth(c);
  let userConsented = false;
  if (currentUser) {
    const userGrants = getTableRows("oauth_grants", currentUser.id);
    const existingGrant = userGrants.find(
      (g) => g.app_id === app2.id || g.client_id === app2.client_id
    );
    if (existingGrant) {
      const grantScopes = existingGrant.scopes || [];
      const hasAllScopes = requestedScopes.every(
        (s) => grantScopes.includes(s)
      );
      if (hasAllScopes) {
        userConsented = true;
      }
    }
  }
  const devProfile = getProfileByUserId(app2.user_id);
  const devUser = getUserById(app2.user_id);
  return c.json({
    app: {
      id: app2.id,
      client_id: app2.client_id,
      name: app2.name,
      description: app2.description || "",
      website_url: app2.website_url || "",
      developer_username: devUser?.username || devProfile?.username || "Developer"
    },
    requested_scopes: requestedScopes,
    user_consented: userConsented,
    logged_in: Boolean(currentUser),
    user: currentUser ? {
      id: String(currentUser.id),
      username: currentUser.username,
      email: currentUser.email
    } : null
  });
});
oauthRouter.post("/authorize", authLimiter, requireUserAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const { client_id, redirect_uri, scope, state, action } = body;
  if (!client_id || !redirect_uri) {
    return c.json({ error: "client_id and redirect_uri are required" }, 400);
  }
  const allApps = getTableRows("oauth_apps");
  const app2 = allApps.find(
    (a) => a.client_id === client_id || a.id === client_id
  );
  if (!app2) {
    return c.json({ error: "Invalid client_id" }, 400);
  }
  const cleanRedirectUri = redirect_uri.trim();
  const uriMatched = (app2.redirect_uris || []).some(
    (allowed) => allowed.toLowerCase() === cleanRedirectUri.toLowerCase()
  );
  if (!uriMatched) {
    return c.json({ error: "Redirect URI is not allowed" }, 400);
  }
  if (action === "deny") {
    const url2 = new URL(cleanRedirectUri);
    url2.searchParams.set("error", "access_denied");
    url2.searchParams.set(
      "error_description",
      "The user denied authorization for this request"
    );
    if (state) url2.searchParams.set("state", state);
    return c.json({ redirect_url: url2.toString() });
  }
  const allowedScopes = app2.allowed_scopes || ["username", "display_name"];
  let grantedScopes = allowedScopes;
  if (scope && typeof scope === "string") {
    const parsed = scope.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (parsed.length > 0) {
      grantedScopes = parsed.filter((s) => allowedScopes.includes(s));
    }
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const userGrants = getTableRows("oauth_grants", user.id);
  const existingGrant = userGrants.find(
    (g) => g.app_id === app2.id || g.client_id === app2.client_id
  );
  if (existingGrant) {
    const mergedScopes = Array.from(
      /* @__PURE__ */ new Set([...existingGrant.scopes || [], ...grantedScopes])
    );
    updateTable(
      "oauth_grants",
      [{ field: "id", operator: "eq", value: existingGrant.id }],
      { scopes: mergedScopes, updated_at: now },
      user.id
    );
  } else {
    const newGrant = {
      id: randomUUID2(),
      app_id: app2.id,
      client_id: app2.client_id,
      user_id: String(user.id),
      scopes: grantedScopes,
      created_at: now,
      updated_at: now
    };
    insertTable("oauth_grants", newGrant, user.id);
  }
  const code = "ol_code_" + randomBytes2(32).toString("hex");
  const codeRecord = {
    code,
    app_id: app2.id,
    client_id: app2.client_id,
    user_id: String(user.id),
    redirect_uri: cleanRedirectUri,
    scopes: grantedScopes,
    state: typeof state === "string" ? state : void 0,
    expires_at: Date.now() + 5 * 60 * 1e3,
    used: false,
    created_at: now
  };
  insertTable("oauth_codes", codeRecord, user.id);
  const url = new URL(cleanRedirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return c.json({ redirect_url: url.toString() });
});
oauthRouter.get("/user/grants", authLimiter, requireUserAuth, async (c) => {
  const userId = c.get("userId");
  const grants = getTableRows("oauth_grants", userId);
  const allApps = getTableRows("oauth_apps");
  const result = grants.map((g) => {
    const app2 = allApps.find(
      (a) => a.id === g.app_id || a.client_id === g.client_id
    );
    return {
      id: g.id,
      app_id: g.app_id,
      client_id: g.client_id,
      app_name: app2?.name || "Unknown Application",
      description: app2?.description || "",
      website_url: app2?.website_url || "",
      scopes: g.scopes || [],
      created_at: g.created_at
    };
  });
  return c.json(result);
});
oauthRouter.delete(
  "/user/grants/:id",
  authLimiter,
  requireUserAuth,
  async (c) => {
    const userId = c.get("userId");
    const grantId = c.req.param("id");
    const grants = getTableRows("oauth_grants", userId);
    const targetGrant = grants.find((g) => g.id === grantId);
    if (!targetGrant) {
      return c.json({ error: "Grant not found" }, 404);
    }
    deleteTable(
      "oauth_grants",
      [{ field: "id", operator: "eq", value: grantId }],
      userId
    );
    const tokens = getTableRows("oauth_tokens", userId);
    for (const t of tokens) {
      if (t.app_id === targetGrant.app_id || t.client_id === targetGrant.client_id) {
        updateTable(
          "oauth_tokens",
          [{ field: "token", operator: "eq", value: t.token }],
          { revoked: true },
          userId
        );
      }
    }
    return c.json({ success: true });
  }
);
oauthRouter.post("/token", authLimiter, async (c) => {
  let body = {};
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await c.req.json().catch(() => ({}));
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    body = await c.req.parseBody().catch(() => ({}));
  } else {
    body = await c.req.json().catch(async () => {
      return await c.req.parseBody().catch(() => ({}));
    });
  }
  let clientId = body.client_id;
  let clientSecret = body.client_secret || body.api_key;
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const grantType = body.grant_type;
  const authHeader = c.req.header("Authorization");
  if (authHeader) {
    if (authHeader.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), "base64").toString(
          "utf-8"
        );
        const [u, p] = decoded.split(":");
        if (!clientId) clientId = u;
        if (!clientSecret) clientSecret = p;
      } catch {
      }
    } else if (authHeader.toLowerCase().startsWith("bearer ") && !clientSecret) {
      clientSecret = authHeader.slice(7);
    }
  }
  if (grantType !== "authorization_code") {
    return c.json(
      {
        error: "unsupported_grant_type",
        error_description: "Grant type must be authorization_code"
      },
      400
    );
  }
  if (!clientId || !clientSecret) {
    return c.json(
      {
        error: "invalid_client",
        error_description: "Client credentials (client_id and client_secret) are required"
      },
      401
    );
  }
  if (!code) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Authorization code is required"
      },
      400
    );
  }
  const allApps = getTableRows("oauth_apps");
  const app2 = allApps.find(
    (a) => a.client_id === clientId || a.id === clientId
  );
  if (!app2) {
    return c.json(
      { error: "invalid_client", error_description: "Unknown client" },
      401
    );
  }
  if (!verifyApiKey(clientSecret, app2.api_key_hash)) {
    return c.json(
      { error: "invalid_client", error_description: "Invalid client_secret / API key" },
      401
    );
  }
  const allCodes = getTableRows("oauth_codes");
  const codeRecord = allCodes.find((rec) => rec.code === code);
  if (!codeRecord) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Invalid authorization code"
      },
      400
    );
  }
  if (codeRecord.used) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code has already been used"
      },
      400
    );
  }
  if (codeRecord.expires_at < Date.now()) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code has expired"
      },
      400
    );
  }
  if (codeRecord.app_id !== app2.id && codeRecord.client_id !== app2.client_id) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Code was not issued to this client"
      },
      400
    );
  }
  if (redirectUri && codeRecord.redirect_uri.toLowerCase() !== redirectUri.trim().toLowerCase()) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Redirect URI does not match authorization request"
      },
      400
    );
  }
  updateTable(
    "oauth_codes",
    [{ field: "code", operator: "eq", value: code }],
    { used: true },
    codeRecord.user_id
  );
  const user = getUserById(codeRecord.user_id);
  if (!user) {
    return c.json(
      { error: "server_error", error_description: "User account not found" },
      500
    );
  }
  const profile = getProfileByUserId(codeRecord.user_id);
  const token = "ol_at_" + randomBytes2(32).toString("hex");
  const expiresIn = 30 * 24 * 60 * 60;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const tokenRecord = {
    token,
    app_id: app2.id,
    client_id: app2.client_id,
    user_id: String(user.id),
    scopes: codeRecord.scopes || [],
    expires_at: Date.now() + expiresIn * 1e3,
    revoked: false,
    created_at: now
  };
  insertTable("oauth_tokens", tokenRecord, user.id);
  const scopedUser = buildScopedUser(user, profile, codeRecord.scopes || []);
  return c.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: (codeRecord.scopes || []).join(" "),
    user: scopedUser
  });
});
oauthRouter.get("/userinfo", authLimiter, async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return c.json(
      { error: "invalid_token", error_description: "Missing access token" },
      401
    );
  }
  const allTokens = getTableRows("oauth_tokens");
  const tokenRecord = allTokens.find((t) => t.token === token);
  if (!tokenRecord) {
    return c.json(
      { error: "invalid_token", error_description: "Unknown access token" },
      401
    );
  }
  if (tokenRecord.revoked) {
    return c.json(
      { error: "invalid_token", error_description: "Token has been revoked" },
      401
    );
  }
  if (tokenRecord.expires_at < Date.now()) {
    return c.json(
      { error: "invalid_token", error_description: "Token has expired" },
      401
    );
  }
  const user = getUserById(tokenRecord.user_id);
  if (!user) {
    return c.json(
      { error: "server_error", error_description: "User not found" },
      404
    );
  }
  const profile = getProfileByUserId(tokenRecord.user_id);
  const scopedUser = buildScopedUser(user, profile, tokenRecord.scopes || []);
  return c.json(scopedUser);
});
oauthRouter.post("/revoke", authLimiter, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  let token = body.token || body.access_token;
  if (!token) {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7);
    }
  }
  if (!token) {
    return c.json({ error: "Missing token parameter" }, 400);
  }
  const allTokens = getTableRows("oauth_tokens");
  const tokenRecord = allTokens.find((t) => t.token === token);
  if (tokenRecord) {
    updateTable(
      "oauth_tokens",
      [{ field: "token", operator: "eq", value: token }],
      { revoked: true },
      tokenRecord.user_id
    );
  }
  return c.json({ success: true });
});

// server/routes/data.ts
init_dataStore();
init_auth();
import { Hono as Hono14 } from "hono";
var dataRouter = new Hono14();
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
    const fn = body.fn || body.functionName;
    const args = body.args || {};
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
import { Hono as Hono15 } from "hono";
import crypto9 from "node:crypto";

// server/lib/surveys.ts
init_dataStore();
import fs6 from "node:fs";
import path6 from "node:path";
import crypto8 from "node:crypto";
var SURVEYS_DIR = path6.join(DATA_DIR, "surveys");
function ensureSurveysDir() {
  if (!fs6.existsSync(SURVEYS_DIR)) {
    fs6.mkdirSync(SURVEYS_DIR, { recursive: true });
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
var DEFINITIONS_FILE = path6.join(SURVEYS_DIR, "definitions.json");
var RESPONSES_FILE = path6.join(SURVEYS_DIR, "responses.json");
var SUBMISSIONS_FILE = path6.join(SURVEYS_DIR, "submissions.json");
var MONTHLY_HISTORY_FILE = path6.join(SURVEYS_DIR, "monthly_history.json");
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
    if (!fs6.existsSync(filePath)) return fallback;
    const content = fs6.readFileSync(filePath, "utf-8").trim();
    if (!content) return fallback;
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function writeJson(filePath, data) {
  ensureSurveysDir();
  const tempPath = `${filePath}.${crypto8.randomUUID()}.tmp`;
  fs6.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs6.renameSync(tempPath, filePath);
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
    id: crypto8.randomUUID(),
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
    id: crypto8.randomUUID(),
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
var surveysRouter = new Hono15();
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
    const surveyId = `custom-${crypto9.randomBytes(6).toString("hex")}`;
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
import { Hono as Hono16 } from "hono";
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
var realtimeRouter = new Hono16();
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

// server/routes/notifications.ts
init_auth();
import { Hono as Hono17 } from "hono";

// server/lib/notifications.ts
init_dataStore();
import fs7 from "node:fs";
import path7 from "node:path";
import crypto10 from "node:crypto";
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
    id: crypto10.randomUUID(),
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
async function getAuthenticatedUser2(c) {
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
    const user = await getAuthenticatedUser2(c);
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
    const user = await getAuthenticatedUser2(c);
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
    const user = await getAuthenticatedUser2(c);
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
    const user = await getAuthenticatedUser2(c);
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
    const user = await getAuthenticatedUser2(c);
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

// server/routes/adminWebdefender.ts
init_auth();
init_dataStore();
import { Hono as Hono19 } from "hono";
import { randomUUID as randomUUID3 } from "node:crypto";
import { isIP as isIP2 } from "node:net";
var adminWebdefenderRouter = new Hono19();
adminWebdefenderRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  c.set("user", user);
  await next();
});
function parseBan(body) {
  const ip = typeof body.ip === "string" ? body.ip.trim().toLowerCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!ip || !isIP2(ip)) return { error: "A valid IPv4 or IPv6 address is required" };
  if (!reason) return { error: "A ban reason is required" };
  if (reason.length > 500) return { error: "Ban reason must be 500 characters or fewer" };
  return { ip, reason };
}
adminWebdefenderRouter.get("/banned-ips", (c) => {
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return c.json({ banned_ips: records, total: records.length });
});
adminWebdefenderRouter.post("/banned-ips", async (c) => {
  const parsed = parseBan(await c.req.json().catch(() => ({})));
  if ("error" in parsed) return c.json(parsed, 400);
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID);
  if (records.some((record) => record.active !== false && record.ip === parsed.ip)) {
    return c.json({ error: "This IP address is already actively banned" }, 409);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const user = c.get("user");
  const ban = {
    id: randomUUID3(),
    ip: parsed.ip,
    reason: parsed.reason,
    active: true,
    created_by: String(user.id),
    created_at: now,
    updated_at: now,
    revoked_at: null,
    revoked_by: null
  };
  saveTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID, [ban, ...records]);
  broadcastAllDefenderConfigUpdates().catch(() => {
  });
  return c.json({ banned_ip: ban }, 201);
});
adminWebdefenderRouter.patch("/banned-ips/:id", async (c) => {
  const parsed = parseBan(await c.req.json().catch(() => ({})));
  if ("error" in parsed) return c.json(parsed, 400);
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID);
  const record = records.find((item) => item.id === c.req.param("id"));
  if (!record) return c.json({ error: "Banned IP not found" }, 404);
  if (records.some((item) => item.id !== record.id && item.active !== false && item.ip === parsed.ip)) {
    return c.json({ error: "This IP address is already actively banned" }, 409);
  }
  Object.assign(record, { ...parsed, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
  saveTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID, records);
  broadcastAllDefenderConfigUpdates().catch(() => {
  });
  return c.json({ banned_ip: record });
});
adminWebdefenderRouter.delete("/banned-ips/:id", (c) => {
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID);
  const record = records.find((item) => item.id === c.req.param("id"));
  if (!record) return c.json({ error: "Banned IP not found" }, 404);
  const user = c.get("user");
  Object.assign(record, { active: false, revoked_at: (/* @__PURE__ */ new Date()).toISOString(), revoked_by: String(user.id), updated_at: (/* @__PURE__ */ new Date()).toISOString() });
  saveTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID, records);
  broadcastAllDefenderConfigUpdates().catch(() => {
  });
  return c.json({ banned_ip: record });
});

// server/routes/browser.ts
import { Hono as Hono20 } from "hono";

// server/lib/oxylowCrawler.ts
import fs8 from "node:fs";
import path8 from "node:path";
import crypto11 from "node:crypto";
import { lookup as lookup2, resolveTxt } from "node:dns/promises";
var DATA_DIR2 = path8.join(process.cwd(), "Data");
var SITES_FILE = path8.join(DATA_DIR2, "webmaster_sites.json");
var INDEX_FILE = path8.join(DATA_DIR2, "oxylow_index.json");
var OXYLOW_USER_AGENT = "Mozilla/5.0 (compatible; oxylow/1.0; +https://oxygenlow.com/bot; support@oxygenlow.com)";
var OXYLOW_CONTACT_EMAIL = "support@oxygenlow.com";
var DEFAULT_DOMAIN_DELAY_MS = 1e3;
var MAX_SITE_INDEX_PAGES = 1e3;
var CRAWL_BATCH_SIZE = 20;
var BATCH_CRAWL_DELAY_MS = 0;
var domainLastRequestTime = /* @__PURE__ */ new Map();
var domainLocks = /* @__PURE__ */ new Map();
var robotsCache = /* @__PURE__ */ new Map();
function ensureDataFiles() {
  if (!fs8.existsSync(DATA_DIR2)) {
    fs8.mkdirSync(DATA_DIR2, { recursive: true });
  }
  if (!fs8.existsSync(SITES_FILE)) {
    fs8.writeFileSync(SITES_FILE, JSON.stringify([], null, 2), "utf8");
  }
  if (!fs8.existsSync(INDEX_FILE)) {
    fs8.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2), "utf8");
  }
}
var cachedSites = null;
var cachedIndex = null;
var saveSitesTimeout = null;
var activeCrawlAbortControllers = /* @__PURE__ */ new Map();
var activeCrawlingSiteIds = /* @__PURE__ */ new Set();
var activeCrawlingDomains = /* @__PURE__ */ new Map();
var MAX_CONCURRENT_CRAWLS = 2;
function flushSitesToDisk() {
  if (saveSitesTimeout) {
    clearTimeout(saveSitesTimeout);
    saveSitesTimeout = null;
  }
  if (cachedSites) {
    ensureDataFiles();
    fs8.writeFileSync(SITES_FILE, JSON.stringify(cachedSites, null, 2), "utf8");
  }
}
function getSites() {
  if (cachedSites) {
    return cachedSites;
  }
  ensureDataFiles();
  try {
    const raw = fs8.readFileSync(SITES_FILE, "utf8");
    cachedSites = JSON.parse(raw);
    return cachedSites;
  } catch {
    cachedSites = [];
    return cachedSites;
  }
}
function saveSites(sites, immediate = true) {
  cachedSites = sites;
  if (immediate) {
    flushSitesToDisk();
  } else {
    if (!saveSitesTimeout) {
      saveSitesTimeout = setTimeout(() => {
        saveSitesTimeout = null;
        flushSitesToDisk();
      }, 500);
    }
  }
}
function getIndex() {
  if (cachedIndex) {
    return cachedIndex;
  }
  ensureDataFiles();
  try {
    const raw = fs8.readFileSync(INDEX_FILE, "utf8");
    cachedIndex = JSON.parse(raw);
    return cachedIndex;
  } catch {
    cachedIndex = [];
    return cachedIndex;
  }
}
function saveIndex(index) {
  cachedIndex = index;
  ensureDataFiles();
  fs8.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
}
async function waitForDomainSlot(domain, requiredDelayMs = DEFAULT_DOMAIN_DELAY_MS) {
  while (domainLocks.has(domain)) {
    await domainLocks.get(domain);
  }
  let releaseLock = () => {
  };
  const lockPromise = new Promise((resolve) => {
    releaseLock = resolve;
  });
  domainLocks.set(domain, lockPromise);
  try {
    const lastTime = domainLastRequestTime.get(domain) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < requiredDelayMs) {
      const waitTime = requiredDelayMs - elapsed;
      await new Promise((r) => setTimeout(r, waitTime));
    }
    domainLastRequestTime.set(domain, Date.now());
  } finally {
    domainLocks.delete(domain);
    releaseLock();
  }
}
async function validateCrawlUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credentials in URL are not allowed");
  }
  assertPublicHostname(parsed.hostname);
  const addresses = await lookup2(parsed.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      throw new Error(`Hostname ${parsed.hostname} resolves to private IP ${address}`);
    }
  }
  return parsed;
}
async function verifyDomainDns(domain, expectedToken) {
  const cleanDomain = domain.split(":")[0].toLowerCase();
  const hostnamesToTry = [cleanDomain, `_oxylow-challenge.${cleanDomain}`];
  const allFoundRecords = [];
  for (const host of hostnamesToTry) {
    try {
      const records = await resolveTxt(host);
      for (const recordChunks of records) {
        const fullTxt = recordChunks.join("");
        allFoundRecords.push(fullTxt);
        if (fullTxt === `oxylow-verification=${expectedToken}` || fullTxt === expectedToken || fullTxt.includes(`oxylow-verification=${expectedToken}`)) {
          return { verified: true, message: `Domain ownership verified on ${host}` };
        }
      }
    } catch {
    }
  }
  return {
    verified: false,
    message: `Verification TXT record not found. Please add a TXT record with value "oxylow-verification=${expectedToken}" to ${cleanDomain} or _oxylow-challenge.${cleanDomain}`,
    foundRecords: allFoundRecords
  };
}
async function getRobotsRules(origin, domain) {
  const cached = robotsCache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < 36e5) {
    return { disallow: cached.rules.disallow, allow: cached.rules.allow, crawlDelayMs: cached.crawlDelayMs };
  }
  const defaultResult = { disallow: [], allow: [], crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS };
  try {
    await waitForDomainSlot(domain, DEFAULT_DOMAIN_DELAY_MS > 0 ? 500 : 0);
    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const res = await fetch(robotsUrl, {
      method: "GET",
      headers: {
        "User-Agent": OXYLOW_USER_AGENT,
        "From": OXYLOW_CONTACT_EMAIL,
        Accept: "text/plain,*/*"
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) {
      robotsCache.set(domain, { rules: defaultResult, crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS, fetchedAt: Date.now() });
      return defaultResult;
    }
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let currentUserAgents = [];
    const oxylowDisallow = [];
    const oxylowAllow = [];
    const starDisallow = [];
    const starAllow = [];
    let crawlDelayMs = DEFAULT_DOMAIN_DELAY_MS;
    for (const rawLine of lines) {
      const line = rawLine.split("#")[0].trim();
      if (!line) {
        currentUserAgents = [];
        continue;
      }
      const match = line.match(/^([a-zA-Z-]+)\s*:\s*(.+)$/);
      if (!match) continue;
      const key = match[1].toLowerCase();
      const val = match[2].trim();
      if (key === "user-agent") {
        currentUserAgents.push(val.toLowerCase());
      } else if (key === "disallow") {
        if (currentUserAgents.some((ua) => ua === "oxylow")) {
          if (val) oxylowDisallow.push(val);
        } else if (currentUserAgents.some((ua) => ua === "*")) {
          if (val) starDisallow.push(val);
        }
      } else if (key === "allow") {
        if (currentUserAgents.some((ua) => ua === "oxylow")) {
          if (val) oxylowAllow.push(val);
        } else if (currentUserAgents.some((ua) => ua === "*")) {
          if (val) starAllow.push(val);
        }
      } else if (key === "crawl-delay") {
        const delaySec = parseFloat(val);
        if (!isNaN(delaySec) && delaySec >= 0) {
          crawlDelayMs = Math.round(delaySec * 1e3);
        }
      }
    }
    const rules = {
      disallow: oxylowDisallow.length > 0 ? oxylowDisallow : starDisallow,
      allow: oxylowAllow.length > 0 ? oxylowAllow : starAllow,
      crawlDelayMs
    };
    robotsCache.set(domain, { rules, crawlDelayMs, fetchedAt: Date.now() });
    return rules;
  } catch {
    robotsCache.set(domain, { rules: defaultResult, crawlDelayMs: DEFAULT_DOMAIN_DELAY_MS, fetchedAt: Date.now() });
    return defaultResult;
  }
}
function isPathAllowed(pathStr, rules) {
  for (const allow of rules.allow) {
    if (allow && pathStr.startsWith(allow)) return true;
  }
  for (const disallow of rules.disallow) {
    if (disallow && pathStr.startsWith(disallow)) return false;
  }
  return true;
}
async function parseSitemap(sitemapUrl, domain, crawlDelayMs) {
  const discoveredUrls = [];
  try {
    await waitForDomainSlot(domain, crawlDelayMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": OXYLOW_USER_AGENT,
        "From": OXYLOW_CONTACT_EMAIL,
        Accept: "application/xml,text/xml,*/*"
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return [];
    const xml = await res.text();
    const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
    let match;
    while ((match = locRegex.exec(xml)) !== null && discoveredUrls.length < MAX_SITE_INDEX_PAGES) {
      const u = match[1].trim();
      if (!discoveredUrls.includes(u)) {
        discoveredUrls.push(u);
      }
    }
  } catch {
  }
  return discoveredUrls;
}
function extractPageData(html, currentUrl) {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }
  let description = "";
  const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i) || html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  if (metaDescMatch) {
    description = metaDescMatch[1].trim();
  }
  let favicon;
  const iconMatch = html.match(/<link\s+[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["']/i) || html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut\s+)?icon["']/i);
  if (iconMatch) {
    try {
      favicon = new URL(iconMatch[1], currentUrl).href;
    } catch {
      favicon = void 0;
    }
  } else {
    try {
      const u = new URL(currentUrl);
      favicon = `${u.origin}/favicon.ico`;
    } catch {
      favicon = void 0;
    }
  }
  const headings = [];
  const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 10) {
    const cleanHeading = hMatch[1].replace(/<[^>]+>/g, "").trim();
    if (cleanHeading && !headings.includes(cleanHeading)) {
      headings.push(cleanHeading);
    }
  }
  const keywords = [];
  const keywordsMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
  if (keywordsMatch) {
    keywords.push(
      ...keywordsMatch[1].split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
    );
  }
  const cleanBody = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ").replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ").replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const bodyPreview = cleanBody.slice(0, 300);
  if (!description && bodyPreview) {
    description = bodyPreview.slice(0, 160) + "...";
  }
  const links = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
  let lMatch;
  const currentOrigin = new URL(currentUrl).origin;
  while ((lMatch = linkRegex.exec(html)) !== null && links.length < 50) {
    const rawHref = lMatch[1].trim();
    if (rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
      continue;
    }
    try {
      const resolved = new URL(rawHref, currentUrl);
      if (resolved.origin === currentOrigin && (resolved.protocol === "http:" || resolved.protocol === "https:")) {
        resolved.hash = "";
        const finalUrl = resolved.href;
        if (!links.includes(finalUrl)) {
          links.push(finalUrl);
        }
      }
    } catch {
    }
  }
  return {
    title: title || currentUrl,
    description: description || "No description provided.",
    headings,
    keywords,
    bodyPreview,
    favicon,
    links
  };
}
var scheduledBatchTimers = /* @__PURE__ */ new Map();
function cancelScheduledCrawl(siteId) {
  const timer = scheduledBatchTimers.get(siteId);
  if (timer) {
    clearTimeout(timer);
    scheduledBatchTimers.delete(siteId);
  }
}
async function crawlSite(siteId, maxPages = CRAWL_BATCH_SIZE) {
  const sites = getSites();
  const siteIndex = sites.findIndex((s) => s.id === siteId);
  if (siteIndex === -1) {
    return { success: false, pagesCrawled: 0, error: "Site not found" };
  }
  const site = sites[siteIndex];
  if (!site.verified && !site.adminAdded) {
    site.status = "unverified";
    site.error = "DNS verification required before crawling.";
    site.logs.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: `Crawl prevented: Domain ${site.domain || site.url} is unverified. Add TXT record "oxylow-verification=${site.verificationToken || ""}" to verify ownership.`,
      level: "warn"
    });
    saveSites(sites);
    return { success: false, pagesCrawled: 0, error: site.error };
  }
  site.status = "crawling";
  site.error = void 0;
  const isContinuation = Array.isArray(site.pendingUrls) && site.pendingUrls.length > 0;
  const currentIndex = getIndex();
  const existingPages = isContinuation ? currentIndex.filter((p) => p.siteId === site.id) : [];
  const crawledUrls = new Set(existingPages.map((p) => p.url));
  const mutateSite = (fn, immediate = false) => {
    const currentSites = getSites();
    const currentSite = currentSites.find((s) => s.id === siteId);
    if (!currentSite) return null;
    fn(currentSite);
    saveSites(currentSites, immediate);
    return currentSite;
  };
  const log = (message, level = "info", immediate = false) => {
    mutateSite((s) => {
      s.logs.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message,
        level
      });
    }, immediate);
  };
  log(
    isContinuation ? `Resuming crawl batch for ${site.domain || site.url} (${existingPages.length} pages already indexed, ${site.pendingUrls?.length || 0} queued)...` : `Starting crawl with oxylow bot (contact: ${OXYLOW_CONTACT_EMAIL})...`,
    "info"
  );
  const siteAbortController = new AbortController();
  activeCrawlAbortControllers.set(site.id, siteAbortController);
  const abortSignal = siteAbortController.signal;
  const crawlQueue = isContinuation ? [...site.pendingUrls || []] : [];
  let pagesCrawled = 0;
  const baseIndex = isContinuation ? currentIndex : currentIndex.filter((p) => p.siteId !== site.id);
  const newIndexedPages = [];
  try {
    const parsedStartUrl = await validateCrawlUrl(site.url);
    const domain = parsedStartUrl.hostname.toLowerCase();
    activeCrawlingDomains.set(site.id, domain);
    const origin = parsedStartUrl.origin;
    log(`Fetching robots.txt from ${origin}/robots.txt...`, "info");
    const robots = await getRobotsRules(origin, domain);
    log(`Robots.txt parsed. Disallowed paths: ${robots.disallow.length}, Crawl-delay: ${robots.crawlDelayMs}ms`, "info");
    if (!isContinuation) {
      const sitemapTarget = site.sitemapUrl || `${origin}/sitemap.xml`;
      log(`Checking sitemap at ${sitemapTarget}...`, "info");
      const sitemapUrls = await parseSitemap(sitemapTarget, domain, robots.crawlDelayMs);
      if (sitemapUrls.length > 0) {
        log(`Found ${sitemapUrls.length} URLs in sitemap.`, "info");
        for (const u of sitemapUrls) {
          if (crawlQueue.length >= MAX_SITE_INDEX_PAGES) break;
          if (!crawlQueue.includes(u)) {
            crawlQueue.push(u);
          }
        }
      }
      if (!crawlQueue.includes(site.url)) {
        crawlQueue.unshift(site.url);
      }
    }
    while (crawlQueue.length > 0 && pagesCrawled < maxPages && existingPages.length + pagesCrawled < MAX_SITE_INDEX_PAGES) {
      if (abortSignal.aborted || !activeCrawlingSiteIds.has(site.id)) {
        return { success: false, pagesCrawled, error: "Crawl cancelled" };
      }
      const currentUrl = crawlQueue.shift();
      if (crawledUrls.has(currentUrl)) continue;
      crawledUrls.add(currentUrl);
      let parsedCurrent;
      try {
        parsedCurrent = await validateCrawlUrl(currentUrl);
      } catch (err) {
        log(`Skipping ${currentUrl}: ${err.message}`, "warn");
        continue;
      }
      if (!isPathAllowed(parsedCurrent.pathname, robots)) {
        log(`Blocked by robots.txt: ${parsedCurrent.pathname}`, "warn");
        continue;
      }
      log(`Requesting ${currentUrl} (enforcing domain delay)...`, "info");
      await waitForDomainSlot(domain, robots.crawlDelayMs);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12e3);
        const fetchSignal = AbortSignal.any ? AbortSignal.any([controller.signal, abortSignal]) : controller.signal;
        const res = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": OXYLOW_USER_AGENT,
            "From": OXYLOW_CONTACT_EMAIL,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
          },
          signal: fetchSignal
        }).finally(() => clearTimeout(timeout));
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
          log(`Skipping non-HTML page ${currentUrl} (${contentType})`, "info");
          continue;
        }
        const html = await res.text();
        const extracted = extractPageData(html, currentUrl);
        const pageItem = {
          id: crypto11.randomUUID(),
          siteId: site.id,
          url: currentUrl,
          domain,
          title: extracted.title,
          description: extracted.description,
          headings: extracted.headings,
          keywords: extracted.keywords,
          bodyPreview: extracted.bodyPreview,
          favicon: extracted.favicon,
          indexedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        newIndexedPages.push(pageItem);
        baseIndex.push(pageItem);
        cachedIndex = baseIndex;
        pagesCrawled++;
        const totalSoFar = existingPages.length + pagesCrawled;
        const pageUpdated = mutateSite((s) => {
          s.pageCount = totalSoFar;
          s.logs.push({
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            message: `Indexed (${pagesCrawled}/${maxPages}, total: ${totalSoFar}/${MAX_SITE_INDEX_PAGES}): "${extracted.title}"`,
            level: "info"
          });
        }, false);
        if (!pageUpdated) {
          return { success: false, pagesCrawled, error: "Site removed" };
        }
        for (const link of extracted.links) {
          if (crawledUrls.size + crawlQueue.length >= MAX_SITE_INDEX_PAGES) break;
          if (!crawledUrls.has(link) && !crawlQueue.includes(link)) {
            crawlQueue.push(link);
          }
        }
      } catch (reqErr) {
        log(`Error fetching ${currentUrl}: ${reqErr.message}`, "error");
        if (abortSignal.aborted || !activeCrawlingSiteIds.has(site.id)) {
          return { success: false, pagesCrawled, error: "Crawl cancelled" };
        }
      }
    }
    if (abortSignal.aborted || !activeCrawlingSiteIds.has(siteId)) {
      return { success: false, pagesCrawled, error: "Crawl cancelled" };
    }
    saveIndex(baseIndex);
    const totalIndexed = existingPages.length + newIndexedPages.length;
    const remainingUrls = crawlQueue.filter((u) => !crawledUrls.has(u));
    const finalUpdated = mutateSite((s) => {
      s.pageCount = totalIndexed;
      s.lastCrawledAt = (/* @__PURE__ */ new Date()).toISOString();
      if (remainingUrls.length > 0 && totalIndexed < MAX_SITE_INDEX_PAGES) {
        s.pendingUrls = remainingUrls.slice(0, MAX_SITE_INDEX_PAGES - totalIndexed);
        s.nextCrawlScheduledAt = new Date(Date.now() + BATCH_CRAWL_DELAY_MS).toISOString();
        s.status = totalIndexed > 0 ? "indexed" : "error";
        s.logs.push({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          message: `Batch completed: indexed ${pagesCrawled} pages (total: ${totalIndexed}/${MAX_SITE_INDEX_PAGES}). ${s.pendingUrls.length} pages remaining. Re-queuing next batch.`,
          level: "info"
        });
        cancelScheduledCrawl(s.id);
        const timer = setTimeout(() => {
          scheduledBatchTimers.delete(s.id);
          const latestSites = getSites();
          const target = latestSites.find((item) => item.id === s.id);
          if (target && target.pendingUrls && target.pendingUrls.length > 0) {
            target.nextCrawlScheduledAt = null;
            saveSites(latestSites);
            enqueueCrawl(target.id, maxPages);
          }
        }, BATCH_CRAWL_DELAY_MS);
        scheduledBatchTimers.set(s.id, timer);
      } else {
        s.pendingUrls = [];
        s.nextCrawlScheduledAt = null;
        cancelScheduledCrawl(s.id);
        s.status = totalIndexed > 0 ? "indexed" : "error";
        s.logs.push({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          message: totalIndexed >= MAX_SITE_INDEX_PAGES ? `Crawl completed: Reached maximum limit of ${MAX_SITE_INDEX_PAGES} indexed pages.` : `Crawl completed: All ${totalIndexed} discovered pages have been indexed.`,
          level: "info"
        });
      }
    }, true);
    if (!finalUpdated) {
      return { success: false, pagesCrawled, error: "Site removed" };
    }
    return { success: totalIndexed > 0, pagesCrawled };
  } catch (err) {
    mutateSite((s) => {
      s.status = s.pageCount > 0 ? "indexed" : "error";
      s.error = err.message || "Crawl failed";
      s.logs.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: `Crawl aborted with error: ${s.error}`,
        level: "error"
      });
    }, true);
    return { success: false, pagesCrawled, error: err.message };
  } finally {
    activeCrawlAbortControllers.delete(site.id);
  }
}
var serverCrawlQueue = [];
var isCrawlerProcessing = false;
function getQueuePosition(siteId) {
  if (activeCrawlingSiteIds.has(siteId)) {
    return null;
  }
  const queueIndex = serverCrawlQueue.findIndex((item) => item.siteId === siteId);
  if (queueIndex !== -1) {
    return queueIndex + 1;
  }
  return null;
}
function isSiteCrawling(siteId) {
  return activeCrawlingSiteIds.has(siteId);
}
function resumeInterruptedCrawls() {
  const sites = getSites();
  const toResume = sites.filter((site) => {
    if (!site.verified && !site.adminAdded) return false;
    if (getQueuePosition(site.id) !== null || activeCrawlingSiteIds.has(site.id)) return false;
    const hasPendingUrls = Array.isArray(site.pendingUrls) && site.pendingUrls.length > 0;
    return site.status === "pending" || site.status === "crawling" || hasPendingUrls;
  });
  toResume.sort((a, b) => {
    const rank = (site) => site.status === "crawling" ? 0 : site.status === "pending" ? 1 : 2;
    const byStatus = rank(a) - rank(b);
    if (byStatus !== 0) return byStatus;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  if (toResume.length === 0) return 0;
  for (const site of toResume) {
    if (site.status === "crawling") {
      site.status = "pending";
    }
    site.nextCrawlScheduledAt = null;
    site.logs.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: "Resuming crawl after server restart.",
      level: "info"
    });
  }
  saveSites(sites);
  for (const site of toResume) {
    enqueueCrawl(site.id, CRAWL_BATCH_SIZE);
  }
  return toResume.length;
}
function enqueueCrawl(siteId, maxPages = 20) {
  if (activeCrawlingSiteIds.has(siteId)) {
    return null;
  }
  const existingPos = getQueuePosition(siteId);
  if (existingPos !== null) {
    return existingPos;
  }
  serverCrawlQueue.push({ siteId, maxPages });
  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (site && site.status !== "crawling") {
    site.status = "pending";
    saveSites(sites);
  }
  processNextInQueue().catch(console.error);
  return getQueuePosition(siteId);
}
async function processNextInQueue() {
  if (isCrawlerProcessing) return;
  isCrawlerProcessing = true;
  try {
    while (activeCrawlingSiteIds.size < MAX_CONCURRENT_CRAWLS && serverCrawlQueue.length > 0) {
      const runningDomains = new Set(activeCrawlingDomains.values());
      const sites = getSites();
      let chosenIndex = serverCrawlQueue.findIndex((item) => {
        const s = sites.find((site2) => site2.id === item.siteId);
        const domain2 = s?.domain?.toLowerCase() || (s?.url ? new URL(s.url).hostname.toLowerCase() : "");
        return domain2 && !runningDomains.has(domain2);
      });
      if (chosenIndex === -1) {
        chosenIndex = 0;
      }
      const [next] = serverCrawlQueue.splice(chosenIndex, 1);
      const site = sites.find((s) => s.id === next.siteId);
      let domain = site?.domain?.toLowerCase() || "";
      if (!domain && site?.url) {
        try {
          domain = new URL(site.url).hostname.toLowerCase();
        } catch {
        }
      }
      activeCrawlingSiteIds.add(next.siteId);
      if (domain) {
        activeCrawlingDomains.set(next.siteId, domain);
      }
      if (site) {
        site.status = "crawling";
        site.logs.push({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          message: "Crawling started by oxylow bot from crawl queue.",
          level: "info"
        });
        saveSites(sites);
      }
      (async () => {
        try {
          await crawlSite(next.siteId, next.maxPages);
        } catch (err) {
          console.error(`Error processing crawl for site ${next.siteId}:`, err);
        } finally {
          activeCrawlingSiteIds.delete(next.siteId);
          activeCrawlingDomains.delete(next.siteId);
          activeCrawlAbortControllers.delete(next.siteId);
          processNextInQueue().catch(console.error);
        }
      })();
    }
  } finally {
    isCrawlerProcessing = false;
    if (activeCrawlingSiteIds.size < MAX_CONCURRENT_CRAWLS && serverCrawlQueue.length > 0) {
      processNextInQueue().catch(console.error);
    }
  }
}
function removeFromCrawlQueue(siteId) {
  const idx = serverCrawlQueue.findIndex((item) => item.siteId === siteId);
  if (idx !== -1) {
    serverCrawlQueue.splice(idx, 1);
  }
  if (activeCrawlingSiteIds.has(siteId)) {
    const controller = activeCrawlAbortControllers.get(siteId);
    if (controller) {
      controller.abort();
      activeCrawlAbortControllers.delete(siteId);
    }
    activeCrawlingSiteIds.delete(siteId);
    activeCrawlingDomains.delete(siteId);
    processNextInQueue().catch(console.error);
  }
}
function getCrawlQueueLength() {
  return activeCrawlingSiteIds.size + serverCrawlQueue.length;
}
function attachQueuePosition(site) {
  return {
    ...site,
    queuePosition: getQueuePosition(site.id)
  };
}
function attachQueuePositions(sites) {
  return sites.map(attachQueuePosition);
}
function searchOxylowIndex(query, page = 1, pageSize = 10) {
  const index = getIndex();
  const trimmed = query.trim().toLowerCase();
  const deduplicateByDomain = (items) => {
    const seenDomains = /* @__PURE__ */ new Set();
    const deduplicated = [];
    for (const item of items) {
      const d = (item.domain || "").toLowerCase();
      if (d && !seenDomains.has(d)) {
        seenDomains.add(d);
        deduplicated.push(item);
      }
    }
    return deduplicated;
  };
  if (!trimmed) {
    const rawResults = index.map((item) => ({
      url: item.url,
      domain: item.domain,
      title: item.title,
      description: item.description,
      bodyPreview: item.bodyPreview,
      favicon: item.favicon,
      score: 1,
      indexedAt: item.indexedAt
    }));
    const uniqueResults = deduplicateByDomain(rawResults);
    const start2 = (page - 1) * pageSize;
    const results2 = uniqueResults.slice(start2, start2 + pageSize);
    return { results: results2, total: uniqueResults.length };
  }
  const queryTerms = trimmed.split(/\s+/).filter(Boolean);
  const scored = index.map((item) => {
    let score = 0;
    const lowerTitle = (item.title || "").toLowerCase();
    const lowerDesc = (item.description || "").toLowerCase();
    const lowerDomain = (item.domain || "").toLowerCase();
    const lowerBody = (item.bodyPreview || "").toLowerCase();
    const lowerHeadings = (item.headings || []).join(" ").toLowerCase();
    const lowerKeywords = (item.keywords || []).join(" ").toLowerCase();
    if (lowerTitle.includes(trimmed)) score += 50;
    if (lowerDomain.includes(trimmed)) score += 30;
    if (lowerDesc.includes(trimmed)) score += 20;
    for (const term of queryTerms) {
      if (lowerTitle.includes(term)) score += 15;
      if (lowerDomain.includes(term)) score += 10;
      if (lowerHeadings.includes(term)) score += 8;
      if (lowerKeywords.includes(term)) score += 6;
      if (lowerDesc.includes(term)) score += 5;
      if (lowerBody.includes(term)) score += 2;
    }
    return {
      url: item.url,
      domain: item.domain,
      title: item.title,
      description: item.description,
      bodyPreview: item.bodyPreview,
      favicon: item.favicon,
      score,
      indexedAt: item.indexedAt
    };
  }).filter((res) => res.score > 0).sort((a, b) => b.score - a.score);
  const uniqueScored = deduplicateByDomain(scored);
  const total = uniqueScored.length;
  const start = (page - 1) * pageSize;
  const results = uniqueScored.slice(start, start + pageSize);
  return { results, total };
}
function getOxylowSuggestions(query, limit = 6) {
  const index = getIndex();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const matched = [];
  const seenDomains = /* @__PURE__ */ new Set();
  for (const item of index) {
    const lowerTitle = (item.title || "").toLowerCase();
    const lowerUrl = (item.url || "").toLowerCase();
    const lowerDomain = (item.domain || "").toLowerCase();
    if (lowerTitle.includes(trimmed) || lowerUrl.includes(trimmed) || lowerDomain.includes(trimmed)) {
      if (lowerDomain && !seenDomains.has(lowerDomain)) {
        seenDomains.add(lowerDomain);
        matched.push({
          title: item.title,
          url: item.url
        });
        if (matched.length >= limit) break;
      }
    }
  }
  return matched;
}

// server/routes/browser.ts
var browserRouter = new Hono20();
browserRouter.get("/search", (c) => {
  const query = c.req.query("q") || "";
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "10", 10);
  const { results, total } = searchOxylowIndex(query, isNaN(page) ? 1 : page, isNaN(pageSize) ? 10 : pageSize);
  return c.json({ results, total, page, pageSize, query });
});
browserRouter.get("/suggestions", (c) => {
  const query = c.req.query("q") || "";
  const suggestions = getOxylowSuggestions(query, 6);
  return c.json({ suggestions });
});
browserRouter.get("/reader", async (c) => {
  const rawUrl = c.req.query("url");
  if (!rawUrl) {
    return c.json({ error: "Missing url parameter" }, 400);
  }
  try {
    const validated = await validateCrawlUrl(rawUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch(validated.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) {
      return c.json({ error: `Failed to fetch target URL: ${res.statusText}` }, res.status);
    }
    const html = await res.text();
    const extracted = extractPageData(html, validated.href);
    return c.json({
      url: validated.href,
      domain: validated.hostname,
      title: extracted.title,
      description: extracted.description,
      headings: extracted.headings,
      content: extracted.bodyPreview,
      favicon: extracted.favicon
    });
  } catch (err) {
    return c.json({ error: err.message || "Failed to load reader mode" }, 400);
  }
});
browserRouter.get("/proxy", async (c) => {
  const rawUrl = c.req.query("url");
  if (!rawUrl) {
    return c.text("Missing url parameter", 400);
  }
  try {
    const validated = await validateCrawlUrl(rawUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    const res = await fetch(validated.href, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    const contentType = res.headers.get("content-type") || "text/html";
    if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
      let html = await res.text();
      const baseTag = `<base href="${validated.href}">`;
      const injectionScript = `
        <script>
          // Inform parent browser frame about link navigation
          document.addEventListener('click', function(e) {
            const anchor = e.target.closest('a');
            if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
              e.preventDefault();
              window.parent.postMessage({ type: 'OXYLOW_BROWSER_NAVIGATE', url: anchor.href }, '*');
            }
          }, true);
        </script>
      `;
      html = html.replace(/<meta\s+[^>]*http-equiv=["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi, "");
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}
${baseTag}
${injectionScript}`);
      } else {
        html = `${baseTag}
${injectionScript}
${html}`;
      }
      return c.html(html, 200, {
        "Content-Type": contentType,
        "X-Frame-Options": "SAMEORIGIN"
      });
    }
    const arrayBuffer = await res.arrayBuffer();
    return c.body(arrayBuffer, 200, {
      "Content-Type": contentType
    });
  } catch (err) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Navigation Error</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; max-width: 500px; text-align: center; border: 1px solid #334155; }
            h1 { color: #f43f5e; font-size: 1.5rem; margin-bottom: 0.75rem; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
            .url { background: #0f172a; padding: 0.5rem 0.75rem; border-radius: 6px; font-family: monospace; word-break: break-all; margin: 1rem 0; color: #38bdf8; font-size: 0.85rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Failed to Load Page</h1>
            <div class="url">${escapeHtml(rawUrl)}</div>
            <p>${escapeHtml(err.message || "An error occurred while proxying this request.")}</p>
          </div>
        </body>
      </html>
    `;
    return c.html(errorHtml, 502);
  }
});
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// server/routes/webmaster.ts
init_auth();
import { Hono as Hono21 } from "hono";
import crypto12 from "node:crypto";
var webmasterRouter = new Hono21();
async function getAuthUser(c) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    token = c.req.query("token") || null;
  }
  if (!token) return null;
  return await resolveUserFromToken(token);
}
function checkIsAdmin(user) {
  return user?.role === "admin" || String(user?.id) === "1";
}
webmasterRouter.get("/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const allSites = getSites();
  const userSites = checkIsAdmin(user) ? allSites : allSites.filter((s) => s.userId === user.id);
  return c.json({ sites: attachQueuePositions(userSites) });
});
webmasterRouter.get("/stats", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const sites = getSites();
  const index = getIndex();
  const isAdminUser = checkIsAdmin(user);
  const userSites = isAdminUser ? sites : sites.filter((s) => s.userId === user.id);
  const userSiteIds = new Set(userSites.map((s) => s.id));
  const userPagesCount = isAdminUser ? index.length : index.filter((p) => p.siteId && userSiteIds.has(p.siteId)).length;
  return c.json({
    totalSites: userSites.length,
    totalPagesIndexed: userPagesCount,
    globalIndexCount: index.length,
    queuedSitesCount: getCrawlQueueLength(),
    botUserAgent: OXYLOW_USER_AGENT,
    botContactEmail: OXYLOW_CONTACT_EMAIL
  });
});
webmasterRouter.post("/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || !body.url || typeof body.url !== "string") {
    return c.json({ error: "Missing or invalid URL" }, 400);
  }
  let formattedUrl = body.url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }
  let domain;
  try {
    const parsed = await validateCrawlUrl(formattedUrl);
    formattedUrl = parsed.href;
    domain = parsed.hostname.toLowerCase();
  } catch (err) {
    return c.json({ error: `Invalid URL: ${err.message}` }, 400);
  }
  let formattedSitemap = body.sitemapUrl?.trim();
  if (formattedSitemap) {
    if (!/^https?:\/\//i.test(formattedSitemap)) {
      formattedSitemap = `https://${formattedSitemap}`;
    }
    try {
      await validateCrawlUrl(formattedSitemap);
    } catch (err) {
      return c.json({ error: `Invalid sitemap URL: ${err.message}` }, 400);
    }
  }
  const sites = getSites();
  const existing = sites.find(
    (s) => s.userId === user.id && s.url.toLowerCase() === formattedUrl.toLowerCase()
  );
  if (existing) {
    return c.json({ error: "This URL has already been submitted." }, 409);
  }
  const verificationToken = crypto12.randomBytes(16).toString("hex");
  const newSite = {
    id: crypto12.randomUUID(),
    userId: user.id,
    url: formattedUrl,
    domain,
    sitemapUrl: formattedSitemap || void 0,
    status: "unverified",
    verified: false,
    verificationToken,
    adminAdded: false,
    pageCount: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    logs: [
      {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: `Submitted. DNS verification required: Add TXT record "oxylow-verification=${verificationToken}" to ${domain} or _oxylow-challenge.${domain}`,
        level: "info"
      }
    ]
  };
  sites.unshift(newSite);
  saveSites(sites);
  return c.json({ site: attachQueuePosition(newSite) }, 201);
});
webmasterRouter.post("/sites/:id/verify", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const siteId = c.req.param("id");
  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    return c.json({ error: "Site not found" }, 404);
  }
  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (site.verified) {
    return c.json({ message: "Domain is already verified.", verified: true, site });
  }
  const result = await verifyDomainDns(site.domain, site.verificationToken);
  if (result.verified) {
    site.verified = true;
    site.status = "pending";
    site.error = void 0;
    site.logs.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: result.message,
      level: "info"
    });
    saveSites(sites);
    enqueueCrawl(site.id, 20);
    return c.json({
      message: "Domain verified successfully! oxylow bot queued for crawling.",
      verified: true,
      site: attachQueuePosition(site)
    });
  } else {
    site.logs.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: `Verification attempt failed: ${result.message}`,
      level: "warn"
    });
    saveSites(sites);
    return c.json(
      {
        error: result.message,
        verified: false,
        foundRecords: result.foundRecords,
        site: attachQueuePosition(site)
      },
      400
    );
  }
});
webmasterRouter.post("/sites/:id/crawl", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const siteId = c.req.param("id");
  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    return c.json({ error: "Site not found" }, 404);
  }
  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (!site.verified && !site.adminAdded) {
    return c.json({ error: "Domain must be verified via DNS record before crawling." }, 400);
  }
  if (isSiteCrawling(site.id) || site.status === "crawling") {
    return c.json({ error: "Site is currently being crawled." }, 409);
  }
  const queuePos = getQueuePosition(site.id);
  if (queuePos !== null) {
    return c.json(
      { error: `Site is already queued for crawling (position ${queuePos}).` },
      409
    );
  }
  cancelScheduledCrawl(site.id);
  site.pendingUrls = void 0;
  site.nextCrawlScheduledAt = null;
  saveSites(sites);
  enqueueCrawl(site.id, 20);
  const updatedSite = getSites().find((s) => s.id === site.id) || site;
  return c.json({ message: "Crawl queued", site: attachQueuePosition(updatedSite) });
});
webmasterRouter.delete("/sites/:id", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const siteId = c.req.param("id");
  const sites = getSites();
  const siteIndex = sites.findIndex((s) => s.id === siteId);
  if (siteIndex === -1) {
    return c.json({ error: "Site not found" }, 404);
  }
  const site = sites[siteIndex];
  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  cancelScheduledCrawl(siteId);
  removeFromCrawlQueue(siteId);
  sites.splice(siteIndex, 1);
  saveSites(sites);
  const index = getIndex();
  const filtered = index.filter((p) => p.siteId !== siteId);
  saveIndex(filtered);
  return c.json({ success: true, message: "Site and associated indexed pages deleted." });
});
webmasterRouter.get("/sites/:id/pages", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const siteId = c.req.param("id");
  const sites = getSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    return c.json({ error: "Site not found" }, 404);
  }
  if (site.userId !== user.id && !checkIsAdmin(user)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const index = getIndex();
  const pages = index.filter((p) => p.siteId === siteId);
  return c.json({ site: attachQueuePosition(site), pages });
});
webmasterRouter.get("/admin/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user || !checkIsAdmin(user)) {
    return c.json({ error: "Admin access required" }, 403);
  }
  const allSites = getSites();
  const adminSites = allSites.filter((s) => s.adminAdded);
  return c.json({ sites: attachQueuePositions(adminSites) });
});
webmasterRouter.post("/admin/sites", async (c) => {
  const user = await getAuthUser(c);
  if (!user || !checkIsAdmin(user)) {
    return c.json({ error: "Admin access required" }, 403);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || !body.url || typeof body.url !== "string") {
    return c.json({ error: "Missing or invalid URL" }, 400);
  }
  let formattedUrl = body.url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }
  let domain;
  try {
    const parsed = await validateCrawlUrl(formattedUrl);
    formattedUrl = parsed.href;
    domain = parsed.hostname.toLowerCase();
  } catch (err) {
    return c.json({ error: `Invalid URL: ${err.message}` }, 400);
  }
  let formattedSitemap = body.sitemapUrl?.trim();
  if (formattedSitemap) {
    if (!/^https?:\/\//i.test(formattedSitemap)) {
      formattedSitemap = `https://${formattedSitemap}`;
    }
    try {
      await validateCrawlUrl(formattedSitemap);
    } catch (err) {
      return c.json({ error: `Invalid sitemap URL: ${err.message}` }, 400);
    }
  }
  const sites = getSites();
  const existing = sites.find(
    (s) => s.url.toLowerCase() === formattedUrl.toLowerCase()
  );
  if (existing) {
    if (!existing.verified) {
      existing.verified = true;
      existing.adminAdded = true;
      existing.status = "pending";
      existing.logs.push({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: `Verified and upgraded by admin ${user.username || user.email || user.id}`,
        level: "info"
      });
      saveSites(sites);
      enqueueCrawl(existing.id, 20);
      const updated2 = getSites().find((s) => s.id === existing.id) || existing;
      return c.json({ site: attachQueuePosition(updated2), message: "Existing domain upgraded to admin verified." });
    }
    return c.json({ error: "This URL has already been added." }, 409);
  }
  const newSite = {
    id: crypto12.randomUUID(),
    userId: user.id,
    url: formattedUrl,
    domain,
    sitemapUrl: formattedSitemap || void 0,
    status: "pending",
    verified: true,
    verificationToken: crypto12.randomBytes(16).toString("hex"),
    adminAdded: true,
    pageCount: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    logs: [
      {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: `Added directly by administrator ${user.username || user.email || user.id} (no verification required)`,
        level: "info"
      }
    ]
  };
  sites.unshift(newSite);
  saveSites(sites);
  enqueueCrawl(newSite.id, 20);
  const updated = getSites().find((s) => s.id === newSite.id) || newSite;
  return c.json({ site: attachQueuePosition(updated) }, 201);
});
webmasterRouter.delete("/admin/sites/:id", async (c) => {
  const user = await getAuthUser(c);
  if (!user || !checkIsAdmin(user)) {
    return c.json({ error: "Admin access required" }, 403);
  }
  const siteId = c.req.param("id");
  const sites = getSites();
  const siteIndex = sites.findIndex((s) => s.id === siteId);
  if (siteIndex === -1) {
    return c.json({ error: "Site not found" }, 404);
  }
  cancelScheduledCrawl(siteId);
  removeFromCrawlQueue(siteId);
  sites.splice(siteIndex, 1);
  saveSites(sites);
  const index = getIndex();
  const filtered = index.filter((p) => p.siteId !== siteId);
  saveIndex(filtered);
  return c.json({ success: true, message: "Domain removed from search index by admin." });
});

// server/routes/chat.ts
init_auth();
init_dataStore();
import { Hono as Hono22 } from "hono";
import crypto13 from "node:crypto";
var chatRouter = new Hono22();
async function authenticate(c) {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") || c.req.query("token");
  if (!token) return null;
  const user = await resolveUserFromToken(token);
  return user || null;
}
chatRouter.get("/state", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);
  const allServers = queryTable({ table: "chat_servers" }) || [];
  const servers = allServers.filter(
    (s) => s.owner_id === userId || s.members && s.members.includes(userId) || s.is_public !== false
  );
  const serverIds = servers.map((s) => s.id);
  const allChannels = queryTable({ table: "chat_channels" }) || [];
  const channels = allChannels.filter((ch) => serverIds.includes(ch.server_id));
  const allDms = queryTable({ table: "chat_dms" }) || [];
  const dms = allDms.filter((dm) => dm.participants && dm.participants.includes(userId));
  return c.json({
    user: { id: userId, username: user.username, display_name: user.display_name || user.username },
    servers,
    channels,
    dms
  });
});
chatRouter.post("/servers", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);
  const body = await c.req.json();
  const name = body.name?.trim() || "New Server";
  const icon = body.icon || "";
  const serverId = `srv_${crypto13.randomUUID()}`;
  const server2 = {
    id: serverId,
    name,
    icon,
    owner_id: userId,
    members: [userId],
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  insertTable("chat_servers", server2, userId);
  const textChannel = {
    id: `chan_${crypto13.randomUUID()}`,
    server_id: serverId,
    name: "general",
    type: "text",
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  insertTable("chat_channels", textChannel, userId);
  const voiceChannel = {
    id: `chan_${crypto13.randomUUID()}`,
    server_id: serverId,
    name: "Lobby",
    type: "voice",
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  insertTable("chat_channels", voiceChannel, userId);
  return c.json({ server: server2, channels: [textChannel, voiceChannel] });
});
chatRouter.post("/servers/:id/channels", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const serverId = c.req.param("id");
  const body = await c.req.json();
  const name = (body.name || "new-channel").toLowerCase().replace(/\s+/g, "-");
  const type = body.type === "voice" ? "voice" : "text";
  const channel = {
    id: `chan_${crypto13.randomUUID()}`,
    server_id: serverId,
    name,
    type,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  insertTable("chat_channels", channel, String(user.id));
  return c.json({ channel });
});
chatRouter.post("/dms", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);
  const body = await c.req.json();
  const recipientId = String(body.recipientId);
  if (!recipientId || recipientId === userId) {
    return c.json({ error: "Invalid recipient" }, 400);
  }
  const allDms = queryTable({ table: "chat_dms" }) || [];
  const existing = allDms.find(
    (dm2) => dm2.participants && dm2.participants.length === 2 && dm2.participants.includes(userId) && dm2.participants.includes(recipientId)
  );
  if (existing) {
    return c.json({ dm: existing });
  }
  const dm = {
    id: `dm_${crypto13.randomUUID()}`,
    participants: [userId, recipientId],
    recipient_names: {
      [userId]: user.username,
      [recipientId]: body.recipientName || "Friend"
    },
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  insertTable("chat_dms", dm, userId);
  return c.json({ dm });
});
chatRouter.get("/messages", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const targetId = c.req.query("targetId");
  if (!targetId) return c.json({ error: "Missing targetId" }, 400);
  const allMessages = queryTable({
    table: "chat_messages",
    filters: [{ field: "target_id", operator: "eq", value: targetId }],
    order: { column: "created_at", ascending: true },
    limit: 100
  }) || [];
  return c.json({ messages: allMessages });
});
chatRouter.post("/messages", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);
  const body = await c.req.json();
  const targetId = body.targetId;
  const isEncrypted = !!body.isEncrypted;
  const encryptedPayload = body.encryptedPayload || null;
  const content = body.content || "";
  const attachments = body.attachments || [];
  if (!targetId || !content && !encryptedPayload && attachments.length === 0) {
    return c.json({ error: "Invalid message payload" }, 400);
  }
  const message = {
    id: `msg_${crypto13.randomUUID()}`,
    target_id: targetId,
    sender_id: userId,
    sender_name: user.display_name || user.username,
    content: isEncrypted ? "[Encrypted Message]" : content,
    is_encrypted: isEncrypted,
    encrypted_payload: encryptedPayload,
    attachments,
    reactions: {},
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  insertTable("chat_messages", message, userId);
  if (body.targetUserId) {
    broadcastChange({
      table: "chat_messages",
      event: "INSERT",
      schema: "public",
      new: message,
      old: null,
      targetUserId: String(body.targetUserId)
    });
  }
  return c.json({ message });
});
chatRouter.post("/calls/signal", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);
  const body = await c.req.json();
  const { type, targetUserId, roomId, isVideo, data } = body;
  const eventPayload = {
    type,
    senderId: userId,
    senderName: user.display_name || user.username,
    targetUserId,
    roomId,
    isVideo: !!isVideo,
    data,
    timestamp: Date.now()
  };
  if (targetUserId) {
    broadcastChange({
      table: "chat_signaling",
      event: "INSERT",
      schema: "public",
      new: eventPayload,
      old: null,
      targetUserId: String(targetUserId)
    });
  }
  return c.json({ success: true, event: eventPayload });
});
chatRouter.post("/users/keys", async (c) => {
  const user = await authenticate(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const userId = String(user.id);
  const body = await c.req.json();
  const { publicKey } = body;
  if (!publicKey) return c.json({ error: "Missing publicKey" }, 400);
  const keyRecord = {
    user_id: userId,
    public_key: publicKey,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const existing = queryTable({
    table: "chat_user_keys",
    filters: [{ field: "user_id", operator: "eq", value: userId }]
  }) || [];
  if (existing.length > 0) {
    updateTable("chat_user_keys", [{ field: "user_id", operator: "eq", value: userId }], keyRecord, userId);
  } else {
    insertTable("chat_user_keys", keyRecord, userId);
  }
  return c.json({ success: true });
});
chatRouter.get("/users/keys/:userId", async (c) => {
  const targetId = c.req.param("userId");
  const data = queryTable({
    table: "chat_user_keys",
    filters: [{ field: "user_id", operator: "eq", value: targetId }]
  }) || [];
  if (data.length === 0) {
    return c.json({ error: "Public key not found" }, 404);
  }
  return c.json({ publicKey: data[0].public_key });
});

// server/routes/chess.ts
import { Hono as Hono23 } from "hono";
import { streamSSE as streamSSE3 } from "hono/streaming";
import crypto14 from "node:crypto";
var rooms = /* @__PURE__ */ new Map();
var roomSubscribers = /* @__PURE__ */ new Map();
function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.lastActive > 2 * 60 * 60 * 1e3) {
      rooms.delete(id);
      roomSubscribers.delete(id);
    }
  }
}, 15 * 60 * 1e3);
var chessRouter = new Hono23();
chessRouter.post("/room/create", async (c) => {
  try {
    const body = await c.req.json();
    const peerId = String(body.peerId || `peer_${crypto14.randomUUID()}`);
    const colorPref = body.colorPreference || "random";
    const timeLimit = typeof body.timeLimit === "number" ? body.timeLimit : 0;
    let hostColor;
    if (colorPref === "random") {
      hostColor = Math.random() < 0.5 ? "w" : "b";
    } else {
      hostColor = colorPref;
    }
    const guestColor = hostColor === "w" ? "b" : "w";
    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }
    const room = {
      id: roomId,
      hostPeerId: peerId,
      colorPreference: colorPref,
      hostColor,
      guestColor,
      timeLimit,
      createdAt: Date.now(),
      lastActive: Date.now(),
      status: "waiting"
    };
    rooms.set(roomId, room);
    return c.json({
      roomId,
      hostColor,
      guestColor,
      timeLimit,
      peerId
    });
  } catch (err) {
    return c.json({ error: err?.message || "Failed to create room" }, 500);
  }
});
chessRouter.post("/room/join", async (c) => {
  try {
    const body = await c.req.json();
    const rawRoomId = String(body.roomId || "").trim().toUpperCase();
    const peerId = String(body.peerId || `peer_${crypto14.randomUUID()}`);
    const room = rooms.get(rawRoomId);
    if (!room) {
      return c.json({ error: "Room not found" }, 404);
    }
    room.lastActive = Date.now();
    if (room.hostPeerId === peerId) {
      return c.json({
        roomId: room.id,
        yourColor: room.hostColor,
        opponentColor: room.guestColor,
        timeLimit: room.timeLimit,
        isHost: true,
        status: room.status
      });
    }
    if (room.guestPeerId === peerId) {
      return c.json({
        roomId: room.id,
        yourColor: room.guestColor,
        opponentColor: room.hostColor,
        timeLimit: room.timeLimit,
        isHost: false,
        status: room.status
      });
    }
    if (room.guestPeerId && room.status === "playing") {
      return c.json({ error: "Room is already full" }, 400);
    }
    room.guestPeerId = peerId;
    room.status = "playing";
    const peers = roomSubscribers.get(room.id);
    if (peers) {
      const hostSender = peers.get(room.hostPeerId);
      if (hostSender) {
        hostSender({
          type: "peer_joined",
          peerId,
          role: "guest",
          color: room.guestColor
        });
      }
    }
    return c.json({
      roomId: room.id,
      yourColor: room.guestColor,
      opponentColor: room.hostColor,
      timeLimit: room.timeLimit,
      isHost: false,
      status: room.status
    });
  } catch (err) {
    return c.json({ error: err?.message || "Failed to join room" }, 500);
  }
});
chessRouter.get("/room/:roomId/events", async (c) => {
  const rawRoomId = c.req.param("roomId").trim().toUpperCase();
  const peerId = c.req.query("peerId");
  if (!peerId) {
    return c.json({ error: "Missing peerId" }, 400);
  }
  const room = rooms.get(rawRoomId);
  if (!room) {
    return c.json({ error: "Room not found" }, 404);
  }
  return streamSSE3(c, async (stream) => {
    if (!roomSubscribers.has(rawRoomId)) {
      roomSubscribers.set(rawRoomId, /* @__PURE__ */ new Map());
    }
    const peerMap = roomSubscribers.get(rawRoomId);
    const sender = async (data) => {
      try {
        await stream.writeSSE({
          event: "message",
          data: JSON.stringify(data)
        });
      } catch {
      }
    };
    peerMap.set(peerId, sender);
    room.lastActive = Date.now();
    try {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({
          roomId: rawRoomId,
          peerId,
          status: room.status,
          hasGuest: Boolean(room.guestPeerId)
        })
      });
      const otherPeerId = peerId === room.hostPeerId ? room.guestPeerId : room.hostPeerId;
      if (otherPeerId && peerMap.has(otherPeerId)) {
        const otherSender = peerMap.get(otherPeerId);
        if (otherSender) {
          otherSender({
            type: "peer_connected",
            peerId
          });
        }
      }
    } catch {
      peerMap.delete(peerId);
      return;
    }
    stream.onAbort(() => {
      peerMap.delete(peerId);
      if (peerMap.size === 0) {
        roomSubscribers.delete(rawRoomId);
      }
      const otherPeerId = peerId === room.hostPeerId ? room.guestPeerId : room.hostPeerId;
      if (otherPeerId) {
        const otherSender = peerMap.get(otherPeerId);
        if (otherSender) {
          otherSender({
            type: "peer_disconnected",
            peerId
          });
        }
      }
    });
    while (!stream.aborted) {
      await stream.sleep(25e3);
      try {
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch {
        break;
      }
    }
    peerMap.delete(peerId);
    if (peerMap.size === 0) {
      roomSubscribers.delete(rawRoomId);
    }
  });
});
chessRouter.post("/room/:roomId/signal", async (c) => {
  try {
    const rawRoomId = c.req.param("roomId").trim().toUpperCase();
    const body = await c.req.json();
    const { senderId, type, payload, targetId } = body;
    const room = rooms.get(rawRoomId);
    if (!room) {
      return c.json({ error: "Room not found" }, 404);
    }
    room.lastActive = Date.now();
    const peerMap = roomSubscribers.get(rawRoomId);
    if (peerMap) {
      for (const [pId, sender] of peerMap.entries()) {
        if (pId === senderId) continue;
        if (targetId && pId !== targetId) continue;
        try {
          sender({
            type,
            senderId,
            payload
          });
        } catch {
        }
      }
    }
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err?.message || "Signal relay failed" }, 500);
  }
});

// server/routes/models.ts
init_auth();
init_dataStore();
import { Hono as Hono24 } from "hono";
import { streamSSE as streamSSE4 } from "hono/streaming";
import path9 from "node:path";
import fs9 from "node:fs";
import crypto15 from "node:crypto";
var modelsRouter = new Hono24();
var activeHosts = /* @__PURE__ */ new Map();
var activeJobs = /* @__PURE__ */ new Map();
var modelQueues = /* @__PURE__ */ new Map();
var userRateLimits = /* @__PURE__ */ new Map();
function checkIsFriend(hostUserId, requesterUserId) {
  if (String(hostUserId) === String(requesterUserId)) return true;
  try {
    const friendships = getTableRows("friendships", hostUserId);
    return friendships.some(
      (f) => f.status === "accepted" && (String(f.user_id) === String(hostUserId) && String(f.friend_id) === String(requesterUserId) || String(f.friend_id) === String(hostUserId) && String(f.user_id) === String(requesterUserId))
    );
  } catch {
    return false;
  }
}
function getUserModelsDir(userId) {
  const dir = path9.join(DATA_DIR, String(userId), "models");
  if (!fs9.existsSync(dir)) {
    fs9.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function getHostConfig(userId) {
  const file = path9.join(getUserModelsDir(userId), "host_config.json");
  if (!fs9.existsSync(file)) {
    return {
      enabled: false,
      masterPaused: false,
      autoPauseGaming: true,
      models: [],
      customEndpoints: []
    };
  }
  try {
    return JSON.parse(fs9.readFileSync(file, "utf-8"));
  } catch {
    return {
      enabled: false,
      masterPaused: false,
      autoPauseGaming: true,
      models: [],
      customEndpoints: []
    };
  }
}
function saveHostConfig(userId, config) {
  const file = path9.join(getUserModelsDir(userId), "host_config.json");
  fs9.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
}
function getPinnedModels(userId) {
  const file = path9.join(getUserModelsDir(userId), "pinned.json");
  if (!fs9.existsSync(file)) return [];
  try {
    return JSON.parse(fs9.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}
function savePinnedModels(userId, pinned) {
  const file = path9.join(getUserModelsDir(userId), "pinned.json");
  fs9.writeFileSync(file, JSON.stringify(pinned, null, 2), "utf-8");
}
function processNextInQueue2(modelId) {
  const queue = modelQueues.get(modelId);
  if (!queue || queue.length === 0) return;
  const modelDef = findSharedModel(modelId);
  if (!modelDef || !modelDef.enabled) return;
  const host = activeHosts.get(modelDef.hostUserId);
  if (!host || host.masterPaused || modelDef.auto_pause_gaming && host.isGaming) return;
  if (host.activeRequests >= modelDef.max_concurrent) return;
  const nextJob = queue.shift();
  if (!nextJob) return;
  clearTimeout(nextJob.timeoutTimer);
  notifyQueuePositions(modelId);
  nextJob.execute();
}
function notifyQueuePositions(modelId) {
  const queue = modelQueues.get(modelId);
  if (!queue) return;
  queue.forEach((item, index) => {
    if (item.sendQueueUpdate) {
      item.sendQueueUpdate(index + 1, queue.length);
    }
  });
}
function findSharedModel(modelId) {
  for (const host of activeHosts.values()) {
    if (host.models.has(modelId)) {
      return host.models.get(modelId);
    }
  }
  return null;
}
modelsRouter.post("/relay/register", async (c) => {
  const isDesktop = c.req.header("x-oxygen-client") === "desktop";
  if (!isDesktop) {
    return c.json(
      { error: "Model hosting is only supported on the Oxygen Low's Software desktop app." },
      403
    );
  }
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const userId = String(user.id);
  const username = user.username || `User_${userId}`;
  const rawModels = Array.isArray(body.models) ? body.models : [];
  let host = activeHosts.get(userId);
  if (!host) {
    host = {
      hostId: `host_${userId}_${crypto15.randomBytes(4).toString("hex")}`,
      userId,
      username,
      models: /* @__PURE__ */ new Map(),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      activeRequests: 0,
      totalRequests: 0,
      totalTokens: 0,
      isGaming: !!body.isGaming,
      masterPaused: !!body.masterPaused,
      sendJob: async () => false
    };
    activeHosts.set(userId, host);
  } else {
    host.lastHeartbeat = Date.now();
    host.isGaming = !!body.isGaming;
    host.masterPaused = !!body.masterPaused;
  }
  host.models.clear();
  for (const m of rawModels) {
    if (!m.id || !m.model_id) continue;
    const modelDef = {
      id: m.id,
      hostUserId: userId,
      hostUsername: username,
      name: m.name || m.model_id,
      model_id: m.model_id,
      provider: m.provider || "ollama",
      modality: m.modality || "text",
      sharing_mode: m.sharing_mode || "public",
      enabled: m.enabled !== false,
      password: m.password || void 0,
      has_password: !!m.password,
      max_tokens: Number(m.max_tokens) || 2048,
      max_concurrent: Math.max(1, Number(m.max_concurrent) || 2),
      rate_limit_rpm: Number(m.rate_limit_rpm) || 30,
      daily_token_cap: Number(m.daily_token_cap) || 2e5,
      tokens_served_today: Number(m.tokens_served_today) || 0,
      auto_pause_gaming: m.auto_pause_gaming !== false,
      context_length: Number(m.context_length) || 4096,
      is_paused: host.masterPaused || m.auto_pause_gaming !== false && host.isGaming
    };
    host.models.set(m.id, modelDef);
  }
  try {
    const existingConfig = getHostConfig(userId);
    saveHostConfig(userId, {
      ...existingConfig,
      masterPaused: host.masterPaused,
      autoPauseGaming: body.autoPauseGaming !== false,
      models: rawModels
    });
  } catch {
  }
  return c.json({
    success: true,
    hostId: host.hostId,
    activeModelsCount: host.models.size
  });
});
modelsRouter.get("/relay/tunnel", async (c) => {
  const isDesktop = c.req.header("x-oxygen-client") === "desktop" || c.req.query("client") === "desktop";
  if (!isDesktop) {
    return c.json(
      { error: "Model hosting is only supported on the Oxygen Low's Software desktop app." },
      403
    );
  }
  const token = c.req.query("token") || c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return c.json({ error: "Unauthorized: Missing token" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }
  const userId = String(user.id);
  const username = user.username || `User_${userId}`;
  return streamSSE4(c, async (stream) => {
    let host = activeHosts.get(userId);
    if (!host) {
      host = {
        hostId: `host_${userId}_${crypto15.randomBytes(4).toString("hex")}`,
        userId,
        username,
        models: /* @__PURE__ */ new Map(),
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        activeRequests: 0,
        totalRequests: 0,
        totalTokens: 0,
        isGaming: false,
        masterPaused: false,
        sendJob: async () => false
      };
      activeHosts.set(userId, host);
    }
    host.sendJob = async (job) => {
      try {
        await stream.writeSSE({
          event: "inference_job",
          data: JSON.stringify(job)
        });
        return true;
      } catch {
        return false;
      }
    };
    host.closeTunnel = () => {
      try {
        stream.close();
      } catch {
      }
    };
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        hostId: host.hostId,
        userId,
        timestamp: Date.now()
      })
    });
    stream.onAbort(() => {
      activeHosts.delete(userId);
    });
    while (!stream.aborted) {
      await stream.sleep(15e3);
      try {
        host.lastHeartbeat = Date.now();
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch {
        break;
      }
    }
    activeHosts.delete(userId);
  });
});
modelsRouter.post("/relay/chunk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { jobId, chunk, delta, done, error, embeddings, tokens } = body;
  if (!jobId) {
    return c.json({ error: "Missing jobId" }, 400);
  }
  const handler = activeJobs.get(jobId);
  if (!handler) {
    return c.json({ error: "Job handler not found or already completed" }, 404);
  }
  if (error) {
    handler.onError(error);
    activeJobs.delete(jobId);
    return c.json({ success: true });
  }
  if (chunk !== void 0 || delta !== void 0) {
    handler.onChunk({ chunk, delta, tokens });
  }
  if (done) {
    handler.onComplete({ tokens, embeddings });
    activeJobs.delete(jobId);
  }
  return c.json({ success: true });
});
modelsRouter.post("/relay/status", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const host = activeHosts.get(String(user.id));
  if (!host) {
    return c.json({ error: "Host session not active" }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  if (body.isGaming !== void 0) host.isGaming = !!body.isGaming;
  if (body.masterPaused !== void 0) host.masterPaused = !!body.masterPaused;
  for (const m of host.models.values()) {
    m.is_paused = host.masterPaused || m.auto_pause_gaming && host.isGaming;
  }
  return c.json({
    success: true,
    isGaming: host.isGaming,
    masterPaused: host.masterPaused
  });
});
modelsRouter.get("/shared", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  const requesterUserId = user ? String(user.id) : null;
  const result = [];
  for (const host of activeHosts.values()) {
    for (const model of host.models.values()) {
      const isOwner = requesterUserId === model.hostUserId;
      const isFriend = requesterUserId ? checkIsFriend(model.hostUserId, requesterUserId) : false;
      if (model.enabled === false && !isOwner) {
        continue;
      }
      if (model.sharing_mode === "private") {
        if (!requesterUserId || !isOwner) {
          continue;
        }
      } else if (model.sharing_mode === "friends") {
        if (!requesterUserId) continue;
        if (!isOwner && !isFriend) {
          continue;
        }
      }
      const queue = modelQueues.get(model.id) || [];
      result.push({
        id: model.id,
        name: model.name,
        model_id: model.model_id,
        hostUserId: model.hostUserId,
        hostUsername: model.hostUsername,
        provider: model.provider,
        modality: model.modality,
        sharing_mode: model.sharing_mode,
        has_password: model.has_password,
        max_tokens: model.max_tokens,
        max_concurrent: model.max_concurrent,
        context_length: model.context_length,
        status: !model.enabled ? "disabled" : model.is_paused ? "paused" : host.activeRequests >= model.max_concurrent ? "busy" : "online",
        activeRequests: host.activeRequests,
        queueLength: queue.length,
        isOwner,
        isFriend,
        tokensServedToday: model.tokens_served_today
      });
    }
  }
  return c.json({ models: result });
});
modelsRouter.post("/shared/:id/chat", async (c) => {
  const modelId = c.req.param("id");
  const model = findSharedModel(modelId);
  if (!model) {
    return c.json({ error: "Shared model not found or currently offline" }, 404);
  }
  const host = activeHosts.get(model.hostUserId);
  if (!host) {
    return c.json({ error: "Host is currently offline" }, 503);
  }
  if (!model.enabled) {
    return c.json({ error: "This model is currently disabled by the host" }, 403);
  }
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  const requesterUserId = user ? String(user.id) : `anon_${c.req.header("x-forwarded-for") || "ip"}`;
  const isOwner = user && String(user.id) === model.hostUserId;
  const isFriend = user ? checkIsFriend(model.hostUserId, String(user.id)) : false;
  if (model.sharing_mode === "private" && !isOwner) {
    return c.json({ error: "This model is private to the host's own devices" }, 403);
  }
  if (model.sharing_mode === "friends" && !isOwner && !isFriend) {
    return c.json({ error: "This model is restricted to friends of the host" }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  if (model.sharing_mode === "password" && !isOwner) {
    const providedPassword = c.req.header("x-model-password") || body.password || "";
    if (model.password && providedPassword !== model.password) {
      return c.json({ error: "Incorrect password for this shared model" }, 401);
    }
  }
  const rateLimitKey = `${requesterUserId}_${modelId}`;
  const now = Date.now();
  const rl = userRateLimits.get(rateLimitKey);
  if (rl && rl.resetAt > now) {
    if (rl.count >= model.rate_limit_rpm) {
      return c.json({ error: "Rate limit exceeded for this shared model. Please slow down." }, 429);
    }
    rl.count++;
  } else {
    userRateLimits.set(rateLimitKey, { count: 1, resetAt: now + 6e4 });
  }
  if (model.tokens_served_today >= model.daily_token_cap && !isOwner) {
    return c.json({ error: "Host daily token cap reached for this model" }, 429);
  }
  const priority = isOwner ? 1 : isFriend ? 2 : 3;
  const jobId = `job_${Date.now()}_${crypto15.randomBytes(4).toString("hex")}`;
  const inferenceJob = {
    jobId,
    type: "chat",
    model_id: model.model_id,
    provider: model.provider,
    messages: body.messages || [],
    prompt: body.prompt,
    max_tokens: Math.min(Number(body.max_tokens) || model.max_tokens, model.max_tokens),
    temperature: body.temperature,
    stream: true
  };
  return streamSSE4(c, async (stream) => {
    let jobDispatched = false;
    const executeJob = async () => {
      jobDispatched = true;
      host.activeRequests++;
      host.totalRequests++;
      activeJobs.set(jobId, {
        onChunk: async ({ chunk, delta, tokens }) => {
          try {
            if (tokens) {
              model.tokens_served_today += tokens;
              host.totalTokens += tokens;
            }
            await stream.writeSSE({
              event: "chunk",
              data: JSON.stringify({ chunk: chunk || delta?.content || "", delta })
            });
          } catch {
          }
        },
        onComplete: async ({ tokens }) => {
          try {
            if (tokens) {
              model.tokens_served_today += tokens;
              host.totalTokens += tokens;
            }
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({ done: true, tokens })
            });
          } catch {
          }
          host.activeRequests = Math.max(0, host.activeRequests - 1);
          processNextInQueue2(modelId);
        },
        onError: async (err) => {
          try {
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ error: err })
            });
          } catch {
          }
          host.activeRequests = Math.max(0, host.activeRequests - 1);
          processNextInQueue2(modelId);
        }
      });
      const sent = await host.sendJob(inferenceJob);
      if (!sent) {
        activeJobs.delete(jobId);
        host.activeRequests = Math.max(0, host.activeRequests - 1);
        try {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: "Failed to dispatch job to host. Host may have disconnected." })
          });
        } catch {
        }
        processNextInQueue2(modelId);
      }
    };
    stream.onAbort(() => {
      if (!jobDispatched) {
        const queue = modelQueues.get(modelId);
        if (queue) {
          const idx = queue.findIndex((q) => q.jobId === jobId);
          if (idx !== -1) {
            clearTimeout(queue[idx].timeoutTimer);
            queue.splice(idx, 1);
            notifyQueuePositions(modelId);
          }
        }
      } else {
        activeJobs.delete(jobId);
        host.activeRequests = Math.max(0, host.activeRequests - 1);
        processNextInQueue2(modelId);
      }
    });
    if (model.is_paused) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: "Host model is currently paused (host is gaming or has paused sharing)." })
      });
      return;
    }
    if (host.activeRequests < model.max_concurrent) {
      await executeJob();
    } else {
      if (!modelQueues.has(modelId)) {
        modelQueues.set(modelId, []);
      }
      const queue = modelQueues.get(modelId);
      const timeoutTimer = setTimeout(async () => {
        const idx = queue.findIndex((q) => q.jobId === jobId);
        if (idx !== -1) {
          queue.splice(idx, 1);
          try {
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ error: "Queue timeout waiting for host model." })
            });
          } catch {
          }
          notifyQueuePositions(modelId);
        }
      }, 6e4);
      const queuedItem = {
        jobId,
        priority,
        requesterUserId,
        modelId,
        job: inferenceJob,
        queuedAt: Date.now(),
        execute: executeJob,
        sendQueueUpdate: async (pos2, total) => {
          try {
            await stream.writeSSE({
              event: "queue_status",
              data: JSON.stringify({
                position: pos2,
                totalWaiting: total,
                message: `In queue (position ${pos2} of ${total})...`
              })
            });
          } catch {
          }
        },
        timeoutTimer
      };
      queue.push(queuedItem);
      queue.sort((a, b) => a.priority - b.priority || a.queuedAt - b.queuedAt);
      const pos = queue.findIndex((q) => q.jobId === jobId) + 1;
      await stream.writeSSE({
        event: "queue_status",
        data: JSON.stringify({
          position: pos,
          totalWaiting: queue.length,
          message: `In queue (position ${pos} of ${queue.length})...`
        })
      });
    }
    while (!stream.aborted && activeJobs.has(jobId)) {
      await stream.sleep(1e3);
    }
  });
});
modelsRouter.post("/shared/:id/embeddings", async (c) => {
  const modelId = c.req.param("id");
  const model = findSharedModel(modelId);
  if (!model) {
    return c.json({ error: "Shared model not found or currently offline" }, 404);
  }
  const host = activeHosts.get(model.hostUserId);
  if (!host) {
    return c.json({ error: "Host is currently offline" }, 503);
  }
  if (!model.enabled) {
    return c.json({ error: "This model is currently disabled by the host" }, 403);
  }
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  const isOwner = user && String(user.id) === model.hostUserId;
  const isFriend = user ? checkIsFriend(model.hostUserId, String(user.id)) : false;
  if (model.sharing_mode === "private" && !isOwner) {
    return c.json({ error: "This model is private" }, 403);
  }
  if (model.sharing_mode === "friends" && !isOwner && !isFriend) {
    return c.json({ error: "This model is restricted to friends" }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  if (model.sharing_mode === "password" && !isOwner) {
    const providedPassword = c.req.header("x-model-password") || body.password || "";
    if (model.password && providedPassword !== model.password) {
      return c.json({ error: "Incorrect password" }, 401);
    }
  }
  const jobId = `job_emb_${Date.now()}_${crypto15.randomBytes(4).toString("hex")}`;
  const inferenceJob = {
    jobId,
    type: "embeddings",
    model_id: model.model_id,
    provider: model.provider,
    input: body.input
  };
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      activeJobs.delete(jobId);
      resolve(c.json({ error: "Timeout waiting for host embeddings" }, 504));
    }, 3e4);
    activeJobs.set(jobId, {
      onChunk: () => {
      },
      onComplete: ({ embeddings }) => {
        clearTimeout(timeout);
        activeJobs.delete(jobId);
        resolve(c.json({ success: true, embeddings: embeddings || [] }));
      },
      onError: (err) => {
        clearTimeout(timeout);
        activeJobs.delete(jobId);
        resolve(c.json({ error: err }, 500));
      }
    });
    host.sendJob(inferenceJob).catch(() => {
      clearTimeout(timeout);
      activeJobs.delete(jobId);
      resolve(c.json({ error: "Failed to dispatch to host" }, 502));
    });
  });
});
modelsRouter.get("/host/config", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const config = getHostConfig(String(user.id));
  return c.json(config);
});
modelsRouter.post("/host/config", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  saveHostConfig(String(user.id), body);
  return c.json({ success: true });
});
modelsRouter.get("/pinned", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ pinned: [] });
  }
  const pinned = getPinnedModels(String(user.id));
  return c.json({ pinned });
});
modelsRouter.post("/pinned", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const modelId = body.modelId;
  if (!modelId) {
    return c.json({ error: "Missing modelId" }, 400);
  }
  const current = getPinnedModels(String(user.id));
  const exists = current.includes(modelId);
  const updated = exists ? current.filter((id) => id !== modelId) : [...current, modelId];
  savePinnedModels(String(user.id), updated);
  return c.json({ success: true, pinned: updated, isPinned: !exists });
});

// server/routes/v1.ts
import { Hono as Hono25 } from "hono";
import { cors } from "hono/cors";
var v1Router = new Hono25();
var v1RateLimiter = rateLimiter(
  60,
  6e4,
  "free_v1_ai",
  (retryAfter) => ({
    error: {
      message: `Rate limit exceeded: 60 requests per minute per IP. Please retry in ${retryAfter}s.`,
      type: "rate_limit_error",
      param: null,
      code: 429
    }
  })
);
v1Router.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"]
  })
);
v1Router.use("*", v1RateLimiter);
var V1_AVAILABLE_MODELS = [
  {
    id: "Fast",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "text",
    description: "Fast instruction-tuned LLM (Llama 3.2 / Llama 3.1)"
  },
  {
    id: "Smart",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "text",
    description: "High-parameter intelligent reasoning open LLM"
  },
  {
    id: "llama-3.2-3b",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "text",
    description: "Meta Llama 3.2 3B Instruct"
  },
  {
    id: "llama-3.2-1b",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "text",
    description: "Meta Llama 3.2 1B Instruct"
  },
  {
    id: "llama-3.1-8b",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "text",
    description: "Meta Llama 3.1 8B Instruct"
  },
  {
    id: "gpt-3.5-turbo",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "text",
    description: "OpenAI-compatible alias mapping to Fast"
  },
  {
    id: "gpt-4o-mini",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "text",
    description: "OpenAI-compatible alias mapping to Fast"
  },
  {
    id: "quality",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "High-detail photorealistic image generation (SDXL 1.0)"
  },
  {
    id: "fast",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "Lightweight rapid image generation (Stable Diffusion)"
  },
  {
    id: "pixel_art",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "Retro 16-bit arcade pixel graphic style"
  },
  {
    id: "anime",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "Studio anime illustration style (DreamShaper)"
  },
  {
    id: "realistic",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "Authentic 35mm photographic realism"
  },
  {
    id: "cartoon",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "Playful character design and cartoon illustration"
  },
  {
    id: "simplistic",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "Minimalist flat illustration with clean lines"
  },
  {
    id: "dall-e-3",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "OpenAI-compatible alias mapping to quality (SDXL 1.0)"
  },
  {
    id: "dall-e-2",
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow",
    type: "image",
    description: "OpenAI-compatible alias mapping to fast (Stable Diffusion)"
  }
];
v1Router.get("/models", async (c) => {
  return c.json({
    object: "list",
    data: V1_AVAILABLE_MODELS
  });
});
v1Router.get("/models/:model", async (c) => {
  const modelId = c.req.param("model");
  const found = V1_AVAILABLE_MODELS.find(
    (m) => m.id.toLowerCase() === modelId.toLowerCase()
  );
  if (found) {
    return c.json(found);
  }
  return c.json({
    id: modelId,
    object: "model",
    created: 17e8,
    owned_by: "oxygenlow"
  });
});
function resolveV1TextModel(modelName) {
  if (!modelName || typeof modelName !== "string") {
    return resolveHordeModel("Fast");
  }
  const clean = modelName.trim().toLowerCase();
  if (clean === "fast" || clean === "gpt-3.5-turbo" || clean === "gpt-4" || clean === "gpt-4o" || clean === "gpt-4o-mini" || clean === "default") {
    return resolveHordeModel("Fast");
  }
  if (clean === "smart") {
    return resolveHordeModel("Smart");
  }
  if (clean === "llama-3.2-3b") {
    return "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M";
  }
  if (clean === "llama-3.2-1b") {
    return "koboldcpp/Llama-3.2-1B-Instruct";
  }
  if (clean === "llama-3.1-8b") {
    return "koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M";
  }
  return resolveHordeModel(modelName);
}
v1Router.post("/chat/completions", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          message: "Invalid JSON request body",
          type: "invalid_request_error",
          param: null,
          code: 400
        }
      },
      400
    );
  }
  const { model, messages, stream, temperature, max_tokens } = body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json(
      {
        error: {
          message: "Missing or invalid 'messages' array",
          type: "invalid_request_error",
          param: "messages",
          code: 400
        }
      },
      400
    );
  }
  const MAX_MSG_CONTENT_LENGTH = 32768;
  const processedMessages = messages.slice(-20).map((m) => ({
    role: m.role || "user",
    content: typeof m.content === "string" && m.content.length > MAX_MSG_CONTENT_LENGTH ? m.content.slice(0, MAX_MSG_CONTENT_LENGTH) : m.content
  }));
  let actualModel = resolveV1TextModel(model);
  const hordeHeaders = {
    Authorization: "Bearer 0000000000",
    "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api"
  };
  let hordeRequestBody = {
    model: actualModel,
    messages: processedMessages,
    stream: Boolean(stream),
    ...temperature !== void 0 ? { temperature: Number(temperature) } : {},
    ...max_tokens !== void 0 ? { max_tokens: Number(max_tokens) } : {}
  };
  const targetUrl = "https://oai.stablehorde.net/v1/chat/completions";
  try {
    if (stream) {
      let hordeResponse = await streamHordeWithContinuation({
        targetUrl,
        fetchHeaders: hordeHeaders,
        requestBody: hordeRequestBody,
        signal: c.req.raw.signal
      });
      if (hordeResponse.status === 406 || hordeResponse.status === 404) {
        const fallback = await getFallbackHordeModel("fast");
        if (fallback && fallback !== actualModel) {
          actualModel = fallback;
          hordeRequestBody.model = actualModel;
          hordeResponse = await streamHordeWithContinuation({
            targetUrl,
            fetchHeaders: hordeHeaders,
            requestBody: hordeRequestBody,
            signal: c.req.raw.signal
          });
        }
      }
      if (!hordeResponse.ok) {
        const status = hordeResponse.status;
        let userMessage = "The AI provider returned an error.";
        if (status === 429) {
          userMessage = "AI Horde worker network is currently busy. Please retry shortly.";
        } else if (status >= 500) {
          userMessage = "AI Horde service temporarily unavailable.";
        }
        return c.json(
          {
            error: {
              message: userMessage,
              type: "provider_error",
              param: null,
              code: status
            }
          },
          status
        );
      }
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      return c.body(hordeResponse.body);
    } else {
      let hordeResponse = await fetchHordeNonStreamWithContinuation({
        targetUrl,
        fetchHeaders: hordeHeaders,
        requestBody: hordeRequestBody,
        signal: c.req.raw.signal
      });
      if (hordeResponse.status === 406 || hordeResponse.status === 404) {
        const fallback = await getFallbackHordeModel("fast");
        if (fallback && fallback !== actualModel) {
          actualModel = fallback;
          hordeRequestBody.model = actualModel;
          hordeResponse = await fetchHordeNonStreamWithContinuation({
            targetUrl,
            fetchHeaders: hordeHeaders,
            requestBody: hordeRequestBody,
            signal: c.req.raw.signal
          });
        }
      }
      if (!hordeResponse.ok) {
        const status = hordeResponse.status;
        let userMessage = "The AI provider returned an error.";
        if (status === 429) {
          userMessage = "AI Horde worker network is currently busy. Please retry shortly.";
        } else if (status >= 500) {
          userMessage = "AI Horde service temporarily unavailable.";
        }
        return c.json(
          {
            error: {
              message: userMessage,
              type: "provider_error",
              param: null,
              code: status
            }
          },
          status
        );
      }
      const data = await hordeResponse.json();
      return c.json(data);
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      return c.json(
        {
          error: {
            message: "Request aborted",
            type: "client_closed_request",
            code: 499
          }
        },
        499
      );
    }
    console.error("Free AI Chat Completion Error:", err);
    return c.json(
      {
        error: {
          message: "Internal server error occurred while contacting AI Horde.",
          type: "server_error",
          code: 500
        }
      },
      500
    );
  }
});
function parseImageSize(size) {
  if (!size || typeof size !== "string") {
    return { width: 512, height: 512 };
  }
  const match = size.toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { width: 512, height: 512 };
  }
  const rawW = parseInt(match[1], 10);
  const rawH = parseInt(match[2], 10);
  const width = Math.min(Math.max(rawW || 512, 256), 1024);
  const height = Math.min(Math.max(rawH || 512, 256), 1024);
  return { width, height };
}
v1Router.post("/images/generations", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          message: "Invalid JSON request body",
          type: "invalid_request_error",
          param: null,
          code: 400
        }
      },
      400
    );
  }
  const {
    prompt: rawPrompt,
    model: rawModel,
    size: rawSize,
    response_format = "url"
  } = body || {};
  const prompt = stripHtmlTags(rawPrompt || "").trim();
  if (!prompt || prompt.length === 0) {
    return c.json(
      {
        error: {
          message: "Missing required parameter: 'prompt'",
          type: "invalid_request_error",
          param: "prompt",
          code: 400
        }
      },
      400
    );
  }
  if (prompt.length > 2e3) {
    return c.json(
      {
        error: {
          message: "Prompt exceeds maximum allowed length of 2000 characters",
          type: "invalid_request_error",
          param: "prompt",
          code: 400
        }
      },
      400
    );
  }
  const { width, height } = parseImageSize(rawSize);
  let requestedModel = String(rawModel || "quality").trim();
  if (requestedModel.toLowerCase() === "dall-e-3") {
    requestedModel = "quality";
  } else if (requestedModel.toLowerCase() === "dall-e-2") {
    requestedModel = "fast";
  }
  const matchedPreset = IMAGE_GENERATOR_PRESETS.find(
    (p) => p.id.toLowerCase() === requestedModel.toLowerCase() || p.name.toLowerCase() === requestedModel.toLowerCase()
  );
  const baseHordeModel = matchedPreset ? matchedPreset.baseHordeModel : requestedModel;
  let enhancedPrompt = prompt;
  if (matchedPreset?.stylePrompt && !prompt.toLowerCase().includes(matchedPreset.stylePrompt.toLowerCase())) {
    enhancedPrompt = `${prompt}, ${matchedPreset.stylePrompt}`;
  }
  let negativePrompt = matchedPreset?.negativePromptAdditions || "";
  const fullPrompt = negativePrompt ? `${enhancedPrompt} ### ${negativePrompt}` : enhancedPrompt;
  const maxStepsAllowed = matchedPreset ? matchedPreset.maxSteps : 30;
  const defaultSteps = matchedPreset ? matchedPreset.defaultSteps : 25;
  const hordePayload = {
    prompt: fullPrompt,
    params: {
      sampler_name: "k_euler",
      cfg_scale: 7.5,
      steps: Math.min(defaultSteps, maxStepsAllowed),
      width,
      height,
      n: 1
    },
    nsfw: false,
    censor_nsfw: true,
    models: [baseHordeModel]
  };
  let jobId = "";
  try {
    const submitRes = await fetch("https://stablehorde.net/api/v2/generate/async", {
      method: "POST",
      headers: {
        apikey: "0000000000",
        "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(hordePayload),
      signal: c.req.raw.signal
    });
    if (!submitRes.ok) {
      const errData = await submitRes.json().catch(() => ({}));
      return c.json(
        {
          error: {
            message: errData.message || "AI Horde is currently busy or unable to queue the image generation request.",
            type: "provider_error",
            code: submitRes.status
          }
        },
        submitRes.status
      );
    }
    const submitData = await submitRes.json();
    jobId = submitData.id;
    if (!jobId) {
      return c.json(
        {
          error: {
            message: "Failed to obtain generation job ID from AI Horde.",
            type: "provider_error",
            code: 500
          }
        },
        500
      );
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      return c.json(
        {
          error: {
            message: "Request aborted",
            type: "client_closed_request",
            code: 499
          }
        },
        499
      );
    }
    console.error("AI Horde Image Submit Error:", err);
    return c.json(
      {
        error: {
          message: "Failed to connect to AI Horde network for image generation.",
          type: "server_error",
          code: 500
        }
      },
      500
    );
  }
  const MAX_POLL_MS = 6e4;
  const POLL_INTERVAL_MS = 2e3;
  const startTime = Date.now();
  let isDone = false;
  try {
    while (Date.now() - startTime < MAX_POLL_MS) {
      if (c.req.raw.signal?.aborted) {
        return c.json(
          {
            error: {
              message: "Request aborted by client",
              type: "client_closed_request",
              code: 499
            }
          },
          499
        );
      }
      await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
      const checkRes = await fetch(
        `https://stablehorde.net/api/v2/generate/check/${encodeURIComponent(jobId)}`,
        {
          headers: { "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api" },
          signal: c.req.raw.signal
        }
      );
      if (!checkRes.ok) {
        return c.json(
          {
            error: {
              message: "Job status check failed on AI Horde.",
              type: "provider_error",
              code: checkRes.status
            }
          },
          checkRes.status
        );
      }
      const checkData = await checkRes.json();
      if (checkData.faulted) {
        return c.json(
          {
            error: {
              message: "Generation job faulted on AI Horde worker. Please try again.",
              type: "provider_error",
              code: 500
            }
          },
          500
        );
      }
      if (checkData.done) {
        isDone = true;
        break;
      }
    }
    if (!isDone) {
      return c.json(
        {
          error: {
            message: "Image generation timed out waiting for an available AI Horde worker. Please retry with a lighter model or resolution.",
            type: "timeout_error",
            code: 504
          }
        },
        504
      );
    }
    const statusRes = await fetch(
      `https://stablehorde.net/api/v2/generate/status/${encodeURIComponent(jobId)}`,
      {
        headers: { "Client-Agent": "OxygenLowsSoftware:1.0:free-ai-api" },
        signal: c.req.raw.signal
      }
    );
    if (!statusRes.ok) {
      return c.json(
        {
          error: {
            message: "Failed to retrieve final generation result from AI Horde.",
            type: "provider_error",
            code: statusRes.status
          }
        },
        statusRes.status
      );
    }
    const statusData = await statusRes.json();
    if (!statusData.generations || statusData.generations.length === 0) {
      return c.json(
        {
          error: {
            message: "No image generation returned by worker.",
            type: "provider_error",
            code: 500
          }
        },
        500
      );
    }
    const gen = statusData.generations[0];
    if (gen.censored) {
      return c.json(
        {
          error: {
            message: "Generated image was filtered out by AI Horde safety censor.",
            type: "content_policy_violation",
            code: "content_policy_violation"
          }
        },
        400
      );
    }
    let rawImg = gen.img;
    if (!rawImg || typeof rawImg !== "string") {
      return c.json(
        {
          error: {
            message: "Invalid image output received from worker.",
            type: "provider_error",
            code: 500
          }
        },
        500
      );
    }
    const createdTime = Math.floor(Date.now() / 1e3);
    if (response_format === "b64_json") {
      let b64 = rawImg;
      if (rawImg.startsWith("http")) {
        const imgRes = await fetch(rawImg);
        if (!imgRes.ok) {
          return c.json(
            {
              error: {
                message: "Failed to retrieve image data from CDN.",
                type: "provider_error",
                code: 500
              }
            },
            500
          );
        }
        const buf = await imgRes.arrayBuffer();
        b64 = Buffer.from(buf).toString("base64");
      } else if (rawImg.startsWith("data:")) {
        const parts = rawImg.split(",");
        b64 = parts[1] || "";
      }
      return c.json({
        created: createdTime,
        data: [{ b64_json: b64 }]
      });
    } else {
      let finalUrl = rawImg;
      if (!rawImg.startsWith("http") && !rawImg.startsWith("data:")) {
        finalUrl = `data:image/webp;base64,${rawImg}`;
      }
      return c.json({
        created: createdTime,
        data: [{ url: finalUrl }]
      });
    }
  } catch (err) {
    if (err?.name === "AbortError") {
      return c.json(
        {
          error: {
            message: "Request aborted",
            type: "client_closed_request",
            code: 499
          }
        },
        499
      );
    }
    console.error("AI Horde Polling Error:", err);
    return c.json(
      {
        error: {
          message: "Internal server error occurred while retrieving generated image.",
          type: "server_error",
          code: 500
        }
      },
      500
    );
  }
});

// packages/webdefender/src/outbound.ts
var nodeHttp = null;
var nodeHttps = null;
try {
  if (typeof process !== "undefined" && process.versions?.node) {
    const req = typeof __require === "function" ? __require : null;
    if (req) {
      nodeHttp = req("http");
      nodeHttps = req("https");
    }
  }
} catch (_) {
}
var OutboundMonitor = class {
  reporter;
  ignoreHost;
  originalHttpRequest;
  originalHttpGet;
  originalHttpsRequest;
  originalHttpsGet;
  originalFetch;
  constructor(reporter, ignoreHost) {
    this.reporter = reporter;
    this.ignoreHost = ignoreHost;
  }
  install() {
    if (typeof process !== "undefined" && process.versions?.node && (!nodeHttp || !nodeHttps)) {
      try {
        import("http").then((m) => {
          nodeHttp = m.default || m;
          this.applyPatches();
        }).catch(() => {
        });
        import("https").then((m) => {
          nodeHttps = m.default || m;
          this.applyPatches();
        }).catch(() => {
        });
      } catch (_) {
      }
    }
    this.applyPatches();
  }
  applyPatches() {
    if (this.originalHttpRequest || this.originalFetch && !nodeHttp) return;
    this.originalHttpRequest = nodeHttp?.request;
    this.originalHttpGet = nodeHttp?.get;
    this.originalHttpsRequest = nodeHttps?.request;
    this.originalHttpsGet = nodeHttps?.get;
    this.originalFetch = globalThis.fetch;
    const self = this;
    function patchMethod(original, protocol) {
      return function(...args) {
        try {
          let host = "";
          let port2 = protocol === "https:" ? 443 : 80;
          const arg0 = args[0];
          if (typeof arg0 === "string" || arg0 instanceof URL) {
            const url = typeof arg0 === "string" ? new URL(arg0) : arg0;
            host = url.hostname;
            if (url.port) port2 = parseInt(url.port, 10);
          } else if (arg0 && typeof arg0 === "object") {
            host = arg0.hostname || arg0.host || "localhost";
            if (arg0.port) port2 = parseInt(arg0.port, 10);
          }
          if (host && host !== self.ignoreHost) {
            self.reporter({ host, port: port2, protocol });
          }
        } catch (e) {
        }
        return original.apply(this, args);
      };
    }
    if (nodeHttp) {
      nodeHttp.request = patchMethod(this.originalHttpRequest, "http:");
      nodeHttp.get = patchMethod(this.originalHttpGet, "http:");
    }
    if (nodeHttps) {
      nodeHttps.request = patchMethod(this.originalHttpsRequest, "https:");
      nodeHttps.get = patchMethod(this.originalHttpsGet, "https:");
    }
    if (this.originalFetch) {
      globalThis.fetch = async function(...args) {
        try {
          const arg0 = args[0];
          let host = "";
          let port2 = 443;
          let protocol = "https:";
          if (typeof arg0 === "string" || arg0 instanceof URL || arg0 && typeof arg0 === "object" && arg0.url) {
            const urlStr = arg0 && typeof arg0 === "object" && arg0.url ? arg0.url : typeof arg0 === "string" ? arg0 : arg0.toString();
            const url = new URL(urlStr);
            host = url.hostname;
            protocol = url.protocol;
            if (url.port) {
              port2 = parseInt(url.port, 10);
            } else {
              port2 = protocol === "http:" ? 80 : 443;
            }
          }
          if (host && host !== self.ignoreHost) {
            self.reporter({ host, port: port2, protocol });
          }
        } catch (e) {
        }
        return self.originalFetch.apply(this, args);
      };
    }
  }
  uninstall() {
    if (!this.originalHttpRequest && !this.originalFetch) return;
    if (nodeHttp && this.originalHttpRequest) {
      nodeHttp.request = this.originalHttpRequest;
      nodeHttp.get = this.originalHttpGet;
    }
    if (nodeHttps && this.originalHttpsRequest) {
      nodeHttps.request = this.originalHttpsRequest;
      nodeHttps.get = this.originalHttpsGet;
    }
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }
    this.originalHttpRequest = void 0;
    this.originalHttpGet = void 0;
    this.originalHttpsRequest = void 0;
    this.originalHttpsGet = void 0;
    this.originalFetch = void 0;
  }
};

// packages/webdefender/src/rateLimiter.ts
var RateLimiter = class {
  buckets;
  cleanupInterval;
  constructor(options) {
    this.buckets = /* @__PURE__ */ new Map();
    if (options?.autoCleanup !== false) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 6e4);
      if (this.cleanupInterval && typeof this.cleanupInterval === "object" && "unref" in this.cleanupInterval) {
        this.cleanupInterval.unref();
      }
    }
  }
  check(key, maxRequests, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1e3;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    const timePassed = now - bucket.lastRefill;
    if (timePassed >= windowMs) {
      bucket.tokens = maxRequests;
      bucket.lastRefill = now;
    }
    let allowed = false;
    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      allowed = true;
    }
    return {
      allowed,
      remaining: bucket.tokens,
      resetAt: bucket.lastRefill + windowMs
    };
  }
  cleanup() {
    const now = Date.now();
    const maxAge = 36e5;
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = void 0;
    }
    this.buckets.clear();
  }
};

// packages/webdefender/src/routeDiscovery.ts
function discoverRoutes(app2) {
  const routes = [];
  const seen = /* @__PURE__ */ new Set();
  if (!app2) return routes;
  if (app2.routes && Array.isArray(app2.routes)) {
    for (const route of app2.routes) {
      if (route && route.method && route.path && typeof route.method === "string") {
        const method = route.method.toUpperCase();
        if (method === "ALL") continue;
        const key = `${method}:${route.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          routes.push({ method, path: route.path });
        }
      }
    }
    return routes.sort(
      (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)
    );
  }
  if (app2._router && app2._router.stack) {
    let processExpressStack2 = function(stack, basePath = "") {
      for (const layer of stack) {
        if (layer.route) {
          const path11 = basePath + (layer.route.path === "/" && basePath.length > 0 ? "" : layer.route.path);
          const methods = layer.route.methods || {};
          for (const method of Object.keys(methods)) {
            if (methods[method]) {
              const uMethod = method.toUpperCase();
              const key = `${uMethod}:${path11}`;
              if (!seen.has(key)) {
                seen.add(key);
                routes.push({ method: uMethod, path: path11 });
              }
            }
          }
        } else if (layer.name === "router" && layer.handle.stack) {
          let newBasePath = basePath;
          if (layer.regexp) {
            const match = layer.regexp.toString().match(/^\/\^\\\/(.*?)\\\/\?\(\?\=\\\/\|\$\)\/i$/);
            if (match && match[1]) {
              newBasePath = basePath + "/" + match[1];
            }
          }
          processExpressStack2(layer.handle.stack, newBasePath);
        }
      }
    };
    var processExpressStack = processExpressStack2;
    processExpressStack2(app2._router.stack);
    return routes.sort(
      (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)
    );
  }
  return routes;
}

// packages/webdefender/src/scanner/injection.ts
function compilePatterns(patterns, flags = "") {
  const sources = patterns.map((p) => p.source);
  const combined = new RegExp(sources.map((s) => `(${s})`).join("|"), flags);
  return { regex: combined, patterns: sources };
}
var SQLI_PATTERNS = [
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
var SHELL_PATTERNS = [
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
  /\bncat\b/i
];
var TRAVERSAL_PATTERNS = [/\.\.\//, /\.\.\\/, /%252e/i, /%2e%2e/i, /%00/];
var SSRF_PATTERNS = [
  /127\.0\.0\.1/,
  /10\.\d+\.\d+\.\d+/,
  /172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+/,
  /192\.168\.\d+\.\d+/,
  /169\.254\.\d+\.\d+/,
  /\[::1\]/
];
var XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /<\/script>/i,
  /javascript:\s*[^"'\s]+/i,
  /vbscript:\s*[^"'\s]+/i,
  /data:text\/(?:html|javascript)/i,
  /\bon(?:load|error|click|mouseover|mouseenter|focus|blur|change|submit|keydown|keypress|keyup)\s*=/i,
  /<(?:iframe|object|embed|applet)\b/i,
  /<(?:img|svg)\b[^>]*\bon[a-z]+\s*=/i,
  /(?:document|window)\.(?:cookie|location|localStorage|sessionStorage)/i
];
var NOSQL_PATTERNS = [
  /\$where\b/i,
  /\$(?:gt|gte|lt|lte|ne|nin|in|regex|exists|all|size|or|and|nor|not)\s*[:=]/i,
  /["']\$(?:gt|gte|lt|lte|ne|nin|in|regex|exists|all|size|or|and|nor|not)["']\s*:/i,
  /\[\$(?:gt|gte|lt|lte|ne|nin|in|regex|exists|all|size|or|and|nor|not)\]/i,
  /\btojson\s*\(/i
];
var PROTOTYPE_POLLUTION_PATTERNS = [
  /__proto__/i,
  /constructor\s*\.\s*prototype/i,
  /prototype\s*\[\s*["']?[a-zA-Z0-9_$]+["']?\s*\]/i,
  /__defineGetter__/i,
  /__defineSetter__/i,
  /__lookupGetter__/i,
  /__lookupSetter__/i
];
var SQLI_COMPILED = compilePatterns(SQLI_PATTERNS, "i");
var SHELL_COMPILED = compilePatterns(SHELL_PATTERNS, "i");
var TRAVERSAL_COMPILED = compilePatterns(TRAVERSAL_PATTERNS, "i");
var SSRF_COMPILED = compilePatterns(SSRF_PATTERNS);
var XSS_COMPILED = compilePatterns(XSS_PATTERNS, "i");
var NOSQL_COMPILED = compilePatterns(NOSQL_PATTERNS, "i");
var PROTOTYPE_POLLUTION_COMPILED = compilePatterns(PROTOTYPE_POLLUTION_PATTERNS, "i");
function detectThreat(input, compiled) {
  if (typeof input !== "string" || input.length === 0) {
    return { detected: false };
  }
  const match = compiled.regex.exec(input);
  if (!match) {
    return { detected: false };
  }
  for (let i = 1; i < match.length; i++) {
    if (match[i] !== void 0) {
      return { detected: true, pattern: compiled.patterns[i - 1] };
    }
  }
  return { detected: true };
}
function detectSqlInjection(input) {
  return detectThreat(input, SQLI_COMPILED);
}
function detectShellInjection(input) {
  return detectThreat(input, SHELL_COMPILED);
}
function detectPathTraversal(input) {
  return detectThreat(input, TRAVERSAL_COMPILED);
}
function detectSsrf(input) {
  return detectThreat(input, SSRF_COMPILED);
}
function detectXss(input) {
  return detectThreat(input, XSS_COMPILED);
}
function detectNoSqlInjection(input) {
  return detectThreat(input, NOSQL_COMPILED);
}
function detectPrototypePollution(input) {
  return detectThreat(input, PROTOTYPE_POLLUTION_COMPILED);
}
function scanRequest(method, path11, query, body, headers) {
  const threats = [];
  const inputs = [path11, body];
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

// packages/webdefender/src/scanner/bots.ts
var BOT_SIGNATURES = {
  ad_bot: [
    "Mediapartners-Google",
    "AdsBot-Google",
    "AdsBot-Google-Mobile",
    "Adsbot/3.1",
    "facebookexternalhit",
    "FacebookBot",
    "Bingbot",
    "BingPreview",
    "AdIdxBot"
  ],
  ai_assistant: [
    "ChatGPT-User",
    "ChatGPT",
    "Claude-Web",
    "Perplexity-User",
    "YouBot",
    "cohere-ai",
    "MistralAI",
    "DuckAssistBot"
  ],
  ai_scraper: [
    "GPTBot",
    "CCBot",
    "anthropic-ai",
    "ClaudeBot",
    "cohere-ai",
    "Diffbot",
    "Bytespider",
    "PetalBot",
    "Scrapy",
    "Amazonbot",
    "Meta-ExternalAgent",
    "Meta-ExternalFetcher",
    "Timpibot",
    "VelenPublicWebCrawler",
    "Webzio-Extended",
    "Omgilibot"
  ],
  ai_search_crawler: [
    "OAI-SearchBot",
    "Google-Extended",
    "GoogleOther",
    "PerplexityBot",
    "YouBot",
    "Applebot-Extended",
    "Applebot"
  ],
  data_harvester: [
    "EmailCollector",
    "EmailSiphon",
    "EmailWolf",
    "ContactBot",
    "Harvest",
    "WebBandit",
    "WebZIP",
    "Teleport",
    "HTTrack",
    "WebCopier",
    "Xenu",
    "TurnitinBot",
    "zgrab"
  ]
};
var COMPILED_BOT_REGEXES = Object.entries(BOT_SIGNATURES).map(([category, signatures]) => ({
  category,
  regex: new RegExp(
    signatures.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "i"
  ),
  signatures
}));
function detectBot(userAgent) {
  if (!userAgent) return { isBot: false };
  for (const { category, regex, signatures } of COMPILED_BOT_REGEXES) {
    const match = userAgent.match(regex);
    if (match) {
      const matchStr = match[0].toLowerCase();
      const original = signatures.find((s) => s.toLowerCase() === matchStr);
      return {
        isBot: true,
        category,
        match: original
      };
    }
  }
  return { isBot: false };
}

// packages/webdefender/src/scanner/geo.ts
var CDN_COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-country",
  "x-geoip-country-code",
  "x-geoip-country",
  "x-geo-country",
  "akamai-country-code",
  "x-azure-fd-country",
  "x-appengine-country",
  "fastly-client-ip-country"
];
function normalizeCountryCode(val) {
  if (!val) return null;
  let str = "";
  if (Array.isArray(val)) {
    if (val.length === 0 || typeof val[0] !== "string") return null;
    str = val[0];
  } else if (typeof val === "string") {
    str = val;
  } else {
    return null;
  }
  const commaIdx = str.indexOf(",");
  if (commaIdx !== -1) {
    str = str.substring(0, commaIdx);
  }
  str = str.trim().toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(str)) {
    return str;
  }
  return null;
}
function getCountryCode(headersOrReq) {
  if (!headersOrReq) {
    return null;
  }
  if (typeof headersOrReq === "string") {
    return normalizeCountryCode(headersOrReq);
  }
  if (typeof headersOrReq !== "object") {
    return null;
  }
  const headers = "headers" in headersOrReq && headersOrReq.headers ? headersOrReq.headers : headersOrReq;
  if (typeof headers.get === "function") {
    for (const name of CDN_COUNTRY_HEADERS) {
      const val = headers.get(name);
      const code = normalizeCountryCode(val);
      if (code) return code;
    }
    return null;
  }
  const record = headers;
  for (const name of CDN_COUNTRY_HEADERS) {
    const val = record[name];
    if (val !== void 0) {
      const code = normalizeCountryCode(val);
      if (code) return code;
    }
  }
  const keys = Object.keys(record);
  for (const name of CDN_COUNTRY_HEADERS) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.toLowerCase() === name) {
        const code = normalizeCountryCode(record[k]);
        if (code) return code;
      }
    }
  }
  return null;
}

// packages/webdefender/src/scanner/sensitivePaths.ts
var RULES = [
  // ── Credentials & secrets ──────────────────────────────────────────────────
  {
    category: "credentials",
    prefix: [
      "/.ssh/",
      "/.vscode/",
      "/_vti_pvt/"
    ],
    exact: [
      "/.env",
      "/.env.local",
      "/.env.development",
      "/.env.development.local",
      "/.env.production",
      "/.env.production.local",
      "/.env.staging",
      "/.env.test",
      "/.env.backup",
      "/.env.bak",
      "/.env.old",
      "/.env.example",
      // sometimes contains real values
      "/secrets.yaml",
      "/secrets.yml",
      "/secrets.json",
      "/secrets.toml",
      "/user_secrets.yml",
      "/user_secrets.yaml",
      "/user_secrets.json",
      "/.secrets",
      "/credentials",
      "/credentials.json",
      "/credentials.yaml",
      "/credentials.yml",
      "/.htpasswd",
      "/.netrc",
      "/.pgpass",
      "/.my.cnf",
      "/.boto",
      "/.s3cfg",
      "/rclone.conf",
      "/.rclone.conf",
      "/id_rsa",
      "/.ssh/id_rsa",
      "/.ssh/id_ed25519",
      "/.ssh/id_ecdsa",
      "/.ssh/id_dsa",
      "/.ssh/authorized_keys",
      "/.ssh/known_hosts",
      "/.ssh/config",
      "/private.key",
      "/private.pem",
      "/server.key",
      "/server.pem",
      "/cert.key",
      "/keystore.jks",
      "/keystore.p12",
      "/auth.json",
      "/.auth",
      "/api-keys.json",
      "/api_keys.json",
      "/.bash_history",
      "/.zsh_history",
      "/.sh_history",
      "/.history",
      "/.bashrc",
      "/.bash_profile",
      "/.profile",
      "/.zshrc",
      "/.npmrc",
      "/.yarnrc",
      "/.yarnrc.yml",
      "/.docker/config.json",
      "/.vscode/sftp.json",
      "/_vti_pvt/service.pwd",
      "/_vti_pvt/administrators.pwd",
      "/_vti_pvt/users.pwd",
      "/_vti_pvt/service.grp",
      "/_vti_pvt/writeto.cnf"
    ]
  },
  // ── Application config files ───────────────────────────────────────────────
  {
    category: "config",
    exact: [
      "/config.php",
      "/config.py",
      "/config.rb",
      "/config.js",
      "/config.ts",
      "/config.json",
      "/config.yaml",
      "/config.yml",
      "/config.toml",
      "/config.ini",
      "/config.cfg",
      "/config.xml",
      "/configuration.php",
      "/configuration.json",
      "/configuration.yaml",
      "/configuration.yml",
      "/settings.php",
      "/settings.py",
      "/settings.js",
      "/settings.json",
      "/settings.xml",
      "/local.settings.json",
      "/local_settings.py",
      "/app.config",
      "/app.yaml",
      "/app.yml",
      "/app.json",
      "/app.php",
      "/app/config.php",
      "/app/settings.py",
      "/app/config.py",
      "/core/settings.py",
      "/backend/settings.py",
      "/instance/config.py",
      "/application.properties",
      "/application.yaml",
      "/application.yml",
      "/application-dev.properties",
      "/application-prod.properties",
      "/application-staging.properties",
      "/bootstrap.yml",
      "/bootstrap.yaml",
      "/web.config",
      "/web.xml",
      "/phpinfo.php",
      "/info.php",
      "/test.php",
      "/server-status",
      "/server-info",
      "/status",
      "/.htaccess"
    ]
  },
  // ── Cloud provider configs ─────────────────────────────────────────────────
  {
    category: "cloud",
    exact: [
      "/.aws/credentials",
      "/.aws/config",
      "/.azure/credentials",
      "/.gcloud/credentials.db",
      "/.config/gcloud/credentials.db",
      "/.config/gcloud/application_default_credentials.json",
      "/service-account.json",
      "/service_account.json",
      "/gcp-credentials.json",
      "/azure-credentials.json",
      "/aws-credentials.json",
      "/cloud-credentials.json"
    ]
  },
  // ── Infrastructure / DevOps ────────────────────────────────────────────────
  {
    category: "infra",
    exact: [
      "/docker-compose.yml",
      "/docker-compose.yaml",
      "/docker-compose.override.yml",
      "/Dockerfile",
      "/.dockerenv",
      "/kubernetes.yml",
      "/kubernetes.yaml",
      "/k8s.yml",
      "/k8s.yaml",
      "/terraform.tfvars",
      "/terraform.tfstate",
      "/terraform.tfstate.backup",
      "/.terraform/terraform.tfstate",
      "/ansible.cfg",
      "/inventory",
      "/Makefile",
      "/nginx.conf",
      "/apache.conf",
      "/httpd.conf"
    ]
  },
  // ── CI/CD pipelines & tokens ───────────────────────────────────────────────
  {
    category: "ci_cd",
    exact: [
      "/.github/workflows",
      "/.gitlab-ci.yml",
      "/.travis.yml",
      "/Jenkinsfile",
      "/.circleci/config.yml",
      "/bitbucket-pipelines.yml",
      "/azure-pipelines.yml",
      "/cloudbuild.yaml",
      "/buildspec.yml"
    ],
    prefix: [
      "/.github/workflows/"
    ]
  },
  // ── Version-control metadata ───────────────────────────────────────────────
  {
    category: "vcs",
    prefix: [
      "/.git/",
      "/.svn/",
      "/.hg/",
      "/.bzr/"
    ],
    exact: [
      "/.git/config",
      "/.git/HEAD",
      "/.git/index",
      "/.git/COMMIT_EDITMSG",
      "/.gitconfig",
      "/.gitignore",
      "/.svn/entries"
    ]
  },
  // ── Backup / dump files ────────────────────────────────────────────────────
  {
    category: "backup",
    suffix: [
      ".bak",
      ".backup",
      ".old",
      ".orig",
      ".save",
      ".swp",
      ".tmp",
      "~",
      ".sql",
      ".db",
      ".sqlite",
      ".sqlite3",
      ".dump",
      ".tar",
      ".tar.gz",
      ".tar.bz2",
      ".zip",
      ".7z",
      ".rar"
    ]
  },
  // ── Debug / diagnostic endpoints ──────────────────────────────────────────
  {
    category: "debug",
    exact: [
      "/actuator",
      "/actuator/env",
      "/actuator/health",
      "/actuator/info",
      "/actuator/metrics",
      "/actuator/mappings",
      "/actuator/beans",
      "/actuator/configprops",
      "/actuator/threaddump",
      "/actuator/heapdump",
      "/actuator/shutdown",
      "/actuator/loggers",
      "/actuator/auditevents",
      "/actuator/httptrace",
      "/metrics",
      "/health",
      "/healthz",
      "/readyz",
      "/debug",
      "/debug/vars",
      "/debug/pprof",
      "/_debug",
      "/trace",
      "/env",
      "/__debug_bar",
      "/telescope",
      "/telescope/api/requests",
      "/horizon",
      "/laravel-websockets",
      "/_profiler",
      "/_wdt",
      "/console",
      "/adminer.php",
      "/phpmyadmin",
      "/pma",
      "/phpMyAdmin",
      "/myadmin",
      "/wp-login.php",
      "/wp-admin",
      "/wp-config.php",
      "/wp-includes",
      "/administrator",
      "/admin.php",
      "/panel",
      "/cpanel",
      "/storage/logs"
    ],
    prefix: [
      "/actuator/",
      "/debug/",
      "/_debug/",
      "/telescope/",
      "/horizon/",
      "/wp-admin/",
      "/wp-includes/",
      "/phpmyadmin/",
      "/pma/",
      "/adminer",
      "/storage/logs/"
    ]
  },
  // ── Vulnerability scanner canary probes (e.g. Qualys WAS) ─────────────────
  {
    category: "canary",
    prefix: [
      "/zzcanary"
    ]
  }
];
var exactMap = /* @__PURE__ */ new Map();
var prefixList = [];
var suffixList = [];
for (const rule of RULES) {
  if (rule.exact) {
    for (const path11 of rule.exact) {
      exactMap.set(path11.toLowerCase(), { category: rule.category });
    }
  }
  if (rule.prefix) {
    for (const prefix of rule.prefix) {
      prefixList.push({ prefix: prefix.toLowerCase(), category: rule.category });
    }
  }
  if (rule.suffix) {
    for (const suffix of rule.suffix) {
      suffixList.push({ suffix: suffix.toLowerCase(), category: rule.category });
    }
  }
}
function detectSensitivePath(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return null;
  const cleaned = rawPath.toLowerCase().split("?")[0].split("#")[0];
  const path11 = cleaned.replace(/\/+/g, "/");
  const exact = exactMap.get(path11);
  if (exact) return { path: path11, category: exact.category };
  for (let i = 0; i < prefixList.length; i++) {
    const { prefix, category } = prefixList[i];
    if (path11.startsWith(prefix)) return { path: path11, category };
  }
  if (path11.includes("zzcanary")) {
    return { path: path11, category: "canary" };
  }
  const lastSegment = path11.split("/").pop() ?? "";
  if (lastSegment === ".env" || lastSegment.startsWith(".env.") || lastSegment.endsWith(".env")) {
    return { path: path11, category: "credentials" };
  }
  if (lastSegment.length > 0) {
    for (let i = 0; i < suffixList.length; i++) {
      const { suffix, category } = suffixList[i];
      if (lastSegment.endsWith(suffix)) return { path: path11, category };
    }
  }
  return null;
}

// packages/webdefender/src/webdefender.ts
function isPathMatch(path11, patterns) {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => {
    if (typeof p === "string") return path11.startsWith(p);
    if (p instanceof RegExp) return p.test(path11);
    return false;
  });
}
var RouteTrieNode = class {
  children = /* @__PURE__ */ new Map();
  routes = [];
};
var DefenderClient = class {
  config;
  appConfig = null;
  exactRoutes = /* @__PURE__ */ new Map();
  prefixRoutes = /* @__PURE__ */ new Map();
  torDetector;
  vpnDetector;
  threatActorDetector;
  outboundMonitor;
  rateLimiter;
  temporaryBans = /* @__PURE__ */ new Map();
  sensitivePathAttempts = /* @__PURE__ */ new Map();
  batchBuffer = [];
  batchTimer;
  uniqueIpCache = /* @__PURE__ */ new Map();
  uniqueIpPruneInterval;
  apiUrl;
  isInitialized = false;
  configSyncIntervalId;
  realtimeAbortController;
  realtimeReconnectTimeout;
  constructor(config) {
    this.config = config;
    this.apiUrl = config.apiUrl || "https://oxygenlow.com";
    const autoRefresh = !config.deferRefresh && !config.edgeMode;
    this.torDetector = new TorDetector({ autoRefresh });
    this.vpnDetector = new VpnDetector({ autoRefresh });
    this.threatActorDetector = new ThreatActorDetector({ autoRefresh });
    this.rateLimiter = new RateLimiter({ autoCleanup: autoRefresh });
    this.outboundMonitor = new OutboundMonitor(
      (conn) => this.reportOutbound(conn),
      new URL(this.apiUrl).hostname
    );
    if (autoRefresh) {
      this.uniqueIpPruneInterval = setInterval(() => {
        this.pruneUniqueIpCache();
      }, 6e4);
      if (typeof this.uniqueIpPruneInterval.unref === "function") {
        this.uniqueIpPruneInterval.unref();
      }
    }
  }
  buildRouteCache(routes) {
    this.exactRoutes.clear();
    this.prefixRoutes.clear();
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const method = (route.method || "").toUpperCase();
      let exactMap2 = this.exactRoutes.get(method);
      if (!exactMap2) {
        exactMap2 = /* @__PURE__ */ new Map();
        this.exactRoutes.set(method, exactMap2);
      }
      exactMap2.set(route.path, route);
      const prefix = route.path.replace(/:\w+/g, "");
      let root = this.prefixRoutes.get(method);
      if (!root) {
        root = new RouteTrieNode();
        this.prefixRoutes.set(method, root);
      }
      let node = root;
      for (const char of prefix) {
        let child = node.children.get(char);
        if (!child) {
          child = new RouteTrieNode();
          node.children.set(char, child);
        }
        node = child;
      }
      node.routes.push(route);
    }
  }
  normalizeConfig(raw) {
    const cfg = raw.config || {};
    const routes = (raw.routes || []).map((r) => ({
      id: r.id,
      method: r.method,
      path: r.path,
      rateLimitEnabled: r.rate_limit_enabled ?? false,
      rateLimitRequests: r.rate_limit_requests ?? 100,
      rateLimitWindowSeconds: r.rate_limit_window_seconds ?? 60
    }));
    this.buildRouteCache(routes);
    return {
      appId: raw.id,
      blockModeEnabled: raw.block_mode_enabled ?? false,
      blockSqlInjection: cfg.block_sql_injection ?? true,
      blockShellInjection: cfg.block_shell_injection ?? true,
      blockPathTraversal: cfg.block_path_traversal ?? true,
      blockSsrf: cfg.block_ssrf ?? true,
      blockXss: cfg.block_xss ?? true,
      blockNosqlInjection: cfg.block_nosql_injection ?? true,
      blockPrototypePollution: cfg.block_prototype_pollution ?? true,
      blockSensitivePaths: cfg.block_sensitive_paths ?? true,
      autoBlockSensitivePaths: this.config.autoBlockSensitivePaths ?? cfg.auto_block_sensitive_paths ?? true,
      sensitivePathThreshold: this.config.sensitivePathThreshold ?? cfg.sensitive_path_threshold ?? 3,
      sensitivePathWindowSeconds: this.config.sensitivePathWindowSeconds ?? cfg.sensitive_path_window_seconds ?? 20,
      sensitivePathBanDurationSeconds: this.config.sensitivePathBanDurationSeconds ?? cfg.sensitive_path_ban_duration_seconds ?? 600,
      blockTor: cfg.block_tor ?? true,
      blockVpn: cfg.block_vpn ?? true,
      blockCountries: cfg.block_countries ?? [],
      blockIps: cfg.block_ips ?? [],
      allowlistIps: Array.isArray(cfg.allowlist_ips) ? cfg.allowlist_ips : [],
      blockAdminBannedIps: cfg.block_admin_banned_ips ?? true,
      adminBannedIps: Array.isArray(raw.admin_banned_ips) ? raw.admin_banned_ips.map((ban) => ({
        ip: ban.ip,
        reason: ban.reason,
        bannedAt: ban.banned_at
      })) : [],
      blockAdBots: cfg.block_ad_bots ?? false,
      blockAiAssistants: cfg.block_ai_assistants ?? false,
      blockAiScrapers: cfg.block_ai_scrapers ?? true,
      blockAiSearchCrawlers: cfg.block_ai_search_crawlers ?? false,
      blockDataHarvesters: cfg.block_data_harvesters ?? true,
      blockBruteforce: cfg.block_bruteforce ?? true,
      blockHttpDos: cfg.block_http_dos ?? true,
      blockHttpExploit: cfg.block_http_exploit ?? true,
      blockBotnets: cfg.block_botnets ?? true,
      ddosProtection: cfg.ddos_protection ?? true,
      ddosThresholdRpm: cfg.ddos_threshold_rpm ?? 1e3,
      monitorOutbound: cfg.monitor_outbound ?? true,
      batchLoggingEnabled: this.config.batchLogging ?? cfg.batch_logging_enabled ?? true,
      batchLoggingIntervalSeconds: this.config.batchLoggingIntervalSeconds ?? cfg.batch_logging_interval_seconds ?? 20,
      onlyLogThreats: this.config.onlyLogThreats ?? cfg.only_log_threats ?? false,
      logUniqueIpsOnly: this.config.logUniqueIpsOnly ?? cfg.log_unique_ips_only ?? false,
      uniqueIpCooldownSeconds: this.config.uniqueIpCooldownSeconds ?? cfg.unique_ip_cooldown_seconds ?? 300,
      eventsLimit: cfg.events_limit ?? 50,
      routes
    };
  }
  async init(app2) {
    if (this.isInitialized) return;
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      this.appConfig = this.normalizeConfig({
        block_mode_enabled: true,
        config: {}
      });
      this.isInitialized = true;
      return;
    }
    try {
      const response = await fetch(`${this.apiUrl}/api/webdefender/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to verify API key: ${response.statusText}`);
      }
      this.appConfig = this.normalizeConfig(await response.json());
      if (app2 && this.appConfig) {
        const routes = discoverRoutes(app2);
        if (routes.length > 0) {
          try {
            await fetch(`${this.apiUrl}/api/webdefender/register`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.config.apiKey}`
              },
              body: JSON.stringify({ routes })
            });
            const verifyRes = await fetch(
              `${this.apiUrl}/api/webdefender/verify`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${this.config.apiKey}`
                }
              }
            );
            if (verifyRes.ok) {
              this.appConfig = this.normalizeConfig(await verifyRes.json());
            }
          } catch (e) {
            console.error("[Defender] Route registration failed:", e);
          }
        }
      }
      this.syncOutboundMonitor();
      this.isInitialized = true;
      if (this.config.deferRefresh || this.config.edgeMode) {
        this.torDetector.startRefreshInterval();
        this.vpnDetector.startRefreshInterval();
        this.threatActorDetector.startRefreshInterval();
      }
      if (!this.config.edgeMode) {
        this.startRealtimeSync();
        this.startConfigSync();
      }
    } catch (error) {
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
      console.error("[Defender] Initialization failed:", error);
    }
  }
  syncOutboundMonitor() {
    if (this.appConfig?.monitorOutbound !== false) {
      this.outboundMonitor.install();
    } else {
      this.outboundMonitor.uninstall();
    }
  }
  startRealtimeSync() {
    if (this.config.realtime === false) return;
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) return;
    this.stopRealtimeSync();
    this.realtimeAbortController = new AbortController();
    const signal = this.realtimeAbortController.signal;
    (async () => {
      try {
        const response = await fetch(
          `${this.apiUrl}/api/webdefender/config-stream`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              Accept: "text/event-stream"
            },
            signal
          }
        );
        if (!response.ok || !response.body) {
          throw new Error(`SSE stream failed: ${response.statusText}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          let currentEvent = "message";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event:")) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith("data:")) {
              const dataStr = trimmed.slice(5).trim();
              if (currentEvent === "config" && dataStr) {
                try {
                  const rawConfig = JSON.parse(dataStr);
                  this.appConfig = this.normalizeConfig(rawConfig);
                  this.syncOutboundMonitor();
                } catch (_) {
                }
              }
              currentEvent = "message";
            }
          }
        }
      } catch (_) {
        if (signal.aborted) return;
        this.realtimeReconnectTimeout = setTimeout(() => {
          if (!this.realtimeAbortController?.signal.aborted) {
            this.startRealtimeSync();
          }
        }, 5e3);
      }
    })();
  }
  stopRealtimeSync() {
    if (this.realtimeReconnectTimeout) {
      clearTimeout(this.realtimeReconnectTimeout);
      this.realtimeReconnectTimeout = void 0;
    }
    if (this.realtimeAbortController) {
      this.realtimeAbortController.abort();
      this.realtimeAbortController = void 0;
    }
  }
  startConfigSync() {
    if (this.configSyncIntervalId) {
      clearInterval(this.configSyncIntervalId);
      this.configSyncIntervalId = void 0;
    }
    const syncInterval = this.config.syncIntervalMs !== void 0 ? this.config.syncIntervalMs : 6e4;
    if (syncInterval > 0) {
      this.configSyncIntervalId = setInterval(
        () => this.refreshConfig(),
        syncInterval
      );
    }
  }
  async refreshConfig() {
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }
    try {
      const response = await fetch(`${this.apiUrl}/api/webdefender/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        }
      });
      if (response.ok) {
        this.appConfig = this.normalizeConfig(await response.json());
        this.syncOutboundMonitor();
      }
    } catch (error) {
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
    }
  }
  reportOutbound(conn) {
    if (this.appConfig?.monitorOutbound === false) {
      return;
    }
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }
    fetch(`${this.apiUrl}/api/webdefender/outbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(conn)
    }).catch(() => {
    });
  }
  pruneUniqueIpCache() {
    if (this.uniqueIpCache.size === 0) return;
    const cooldownMs = (this.appConfig?.uniqueIpCooldownSeconds ?? 300) * 1e3;
    const now = Date.now();
    for (const [ip, ts] of this.uniqueIpCache.entries()) {
      if (now - ts > cooldownMs) {
        this.uniqueIpCache.delete(ip);
      }
    }
    if (this.uniqueIpCache.size > 5e4) {
      const excess = this.uniqueIpCache.size - 5e4;
      let count = 0;
      for (const key of this.uniqueIpCache.keys()) {
        this.uniqueIpCache.delete(key);
        count++;
        if (count >= excess) break;
      }
    }
  }
  hasPendingLogs() {
    return this.batchBuffer.length > 0;
  }
  async flushBatchAsync() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = void 0;
    }
    if (this.batchBuffer.length === 0) return;
    const eventsToSend = this.batchBuffer;
    this.batchBuffer = [];
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }
    try {
      await fetch(`${this.apiUrl}/api/webdefender/event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(eventsToSend)
      });
    } catch (_) {
    }
  }
  flushBatch() {
    this.flushBatchAsync().catch(() => {
    });
  }
  logEvent(event, req) {
    if (this.config.onBlocked && event.blocked) {
      this.config.onBlocked(event);
    }
    const isThreat = event.type !== "allowed" || event.blocked;
    if (this.appConfig?.onlyLogThreats && !isThreat) {
      return;
    }
    const cleanIp = (event.ip || "").trim().toLowerCase();
    if (this.appConfig?.logUniqueIpsOnly && cleanIp) {
      const now = Date.now();
      const cooldownMs = (this.appConfig.uniqueIpCooldownSeconds || 300) * 1e3;
      if (!isThreat) {
        const lastLogged = this.uniqueIpCache.get(cleanIp);
        if (lastLogged && now - lastLogged < cooldownMs) {
          return;
        }
        this.uniqueIpCache.set(cleanIp, now);
      } else {
        this.uniqueIpCache.set(cleanIp, now);
      }
    }
    const detectedCountry = getCountryCode(req?.headers) || (typeof req?.query?.countryCode === "string" ? req.query.countryCode : null);
    const payload = {
      eventType: event.type,
      ip: event.ip,
      countryCode: detectedCountry || null,
      method: event.method,
      path: event.path,
      blocked: event.blocked,
      requestBodySnippet: req?.body ? req.body.substring(0, 500) : null
    };
    const noApiKey = !this.config.apiKey || this.config.apiKey.trim() === "";
    if (this.config.offlineMode || noApiKey) {
      return;
    }
    if (this.appConfig?.batchLoggingEnabled) {
      this.batchBuffer.push(payload);
      if (this.batchBuffer.length >= 500) {
        return this.flushBatchAsync();
      } else if (!this.batchTimer && !this.config.edgeMode) {
        const intervalMs = Math.max(1, this.appConfig.batchLoggingIntervalSeconds || 20) * 1e3;
        this.batchTimer = setTimeout(() => {
          this.batchTimer = void 0;
          this.flushBatch();
        }, intervalMs);
        if (typeof this.batchTimer.unref === "function") {
          this.batchTimer.unref();
        }
      }
      return;
    }
    return fetch(`${this.apiUrl}/api/webdefender/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(payload)
    }).catch(() => {
    });
  }
  getMatchingRoute(method, path11) {
    if (!this.appConfig || !this.appConfig.routes) return void 0;
    method = method.toUpperCase();
    const exactMap2 = this.exactRoutes.get(method);
    if (exactMap2) {
      const exact = exactMap2.get(path11);
      if (exact) return exact;
    }
    const root = this.prefixRoutes.get(method);
    if (root) {
      let node = root;
      let bestMatch = void 0;
      if (node.routes.length > 0) {
        bestMatch = node.routes[0];
      }
      for (const char of path11) {
        node = node.children.get(char);
        if (!node) break;
        if (node.routes.length > 0) {
          bestMatch = node.routes[0];
        }
      }
      return bestMatch;
    }
    return void 0;
  }
  async handleRequest(req) {
    if (isPathMatch(req.path, this.config.excludePaths)) {
      return { blocked: false, eventType: "allowed" };
    }
    if (!this.appConfig) {
      return { blocked: false, eventType: "allowed" };
    }
    const { ip, method, path: path11, query, body, headers, userAgent } = req;
    const cleanIp = (ip || "").trim().toLowerCase();
    const combinedAllowlist = [
      ...this.config.allowlistIps || [],
      ...this.appConfig.allowlistIps || []
    ];
    if (cleanIp && matchesIpOrCidr(cleanIp, combinedAllowlist)) {
      return { blocked: false, eventType: "allowed" };
    }
    let isBlocked = false;
    let blockReason = "";
    let eventType = "allowed";
    const fail = (type, reason) => {
      eventType = type;
      blockReason = reason;
      isBlocked = true;
    };
    if (!isBlocked && cleanIp) {
      const ban = this.temporaryBans.get(cleanIp);
      if (ban) {
        if (Date.now() < ban.expiresAt) {
          fail("ip_block", ban.reason);
        } else {
          this.temporaryBans.delete(cleanIp);
        }
      }
    }
    if (!isBlocked && this.appConfig.blockAdminBannedIps && this.appConfig.adminBannedIps.length > 0 && cleanIp) {
      const bannedIpsList = this.appConfig.adminBannedIps.map((item) => item.ip);
      if (matchesIpOrCidr(cleanIp, bannedIpsList)) {
        const matchedBan = this.appConfig.adminBannedIps.find(
          (item) => matchesIpOrCidr(cleanIp, [item.ip])
        );
        fail(
          "ip_block",
          `Administrator-banned IP: ${matchedBan?.reason || "Restricted by platform admin"}`
        );
      }
    }
    if (!isBlocked && this.appConfig.blockIps && this.appConfig.blockIps.length > 0 && cleanIp) {
      if (matchesIpOrCidr(cleanIp, this.appConfig.blockIps)) {
        fail("ip_block", `IP blocked: ${ip}`);
      }
    }
    if (!isBlocked && this.appConfig.blockCountries && this.appConfig.blockCountries.length > 0) {
      const countryCode = getCountryCode(headers);
      if (countryCode && this.appConfig.blockCountries.includes(countryCode)) {
        fail("country_block", `Country blocked: ${countryCode}`);
      }
    }
    if (!isBlocked && this.appConfig.blockTor) {
      if (this.torDetector.isTorExitNode(ip)) {
        fail("tor", "TOR exit node detected");
      }
    }
    if (!isBlocked && this.appConfig.blockVpn) {
      if (this.vpnDetector.isVpn(ip)) {
        fail("vpn", "VPN connection detected");
      }
    }
    if (!isBlocked) {
      const threatActor = this.threatActorDetector.checkThreatActor(ip);
      if (threatActor) {
        let shouldBlock = false;
        let eventType2 = "threat_botnet";
        switch (threatActor.category) {
          case "bruteforce":
            shouldBlock = this.appConfig.blockBruteforce;
            eventType2 = "threat_bruteforce";
            break;
          case "http_dos":
            shouldBlock = this.appConfig.blockHttpDos;
            eventType2 = "threat_dos";
            break;
          case "http_exploit":
            shouldBlock = this.appConfig.blockHttpExploit;
            eventType2 = "threat_exploit";
            break;
          case "botnet":
            shouldBlock = this.appConfig.blockBotnets;
            eventType2 = "threat_botnet";
            break;
        }
        if (shouldBlock) {
          const categoryLabels = {
            bruteforce: "Bruteforce attacker",
            http_dos: "HTTP DoS attacker",
            http_exploit: "HTTP Exploit attacker",
            botnet: "Botnet Actor"
          };
          fail(
            eventType2,
            `Known threat actor detected: ${categoryLabels[threatActor.category] || threatActor.category}`
          );
        }
      }
    }
    if (!isBlocked) {
      const botResult = detectBot(userAgent);
      if (botResult.isBot && botResult.category) {
        let blockBot = false;
        switch (botResult.category) {
          case "ad_bot":
            blockBot = this.appConfig.blockAdBots;
            break;
          case "ai_assistant":
            blockBot = this.appConfig.blockAiAssistants;
            break;
          case "ai_scraper":
            blockBot = this.appConfig.blockAiScrapers;
            break;
          case "ai_search_crawler":
            blockBot = this.appConfig.blockAiSearchCrawlers;
            break;
          case "data_harvester":
            blockBot = this.appConfig.blockDataHarvesters;
            break;
        }
        if (blockBot) {
          fail(
            "bot",
            `Blocked bot category: ${botResult.category} (${botResult.match})`
          );
        }
      }
    }
    if (!isBlocked) {
      const skipBody = req.skipBodyScan || isPathMatch(path11, this.config.skipBodyScanPaths);
      const scanBody = skipBody ? "" : body;
      const scanRes = scanRequest(method, path11, query, scanBody, headers);
      for (const threat of scanRes.threats) {
        let shouldBlock = false;
        switch (threat.type) {
          case "sql_injection":
            shouldBlock = this.appConfig.blockSqlInjection;
            break;
          case "shell_injection":
            shouldBlock = this.appConfig.blockShellInjection;
            break;
          case "path_traversal":
            shouldBlock = this.appConfig.blockPathTraversal;
            break;
          case "ssrf":
            shouldBlock = this.appConfig.blockSsrf;
            break;
          case "xss":
            shouldBlock = this.appConfig.blockXss;
            break;
          case "nosql_injection":
            shouldBlock = this.appConfig.blockNosqlInjection;
            break;
          case "prototype_pollution":
            shouldBlock = this.appConfig.blockPrototypePollution;
            break;
        }
        if (shouldBlock) {
          fail(
            threat.type,
            `Threat detected: ${threat.type} (pattern: ${threat.pattern})`
          );
          break;
        }
      }
    }
    if (!isBlocked && this.appConfig.blockSensitivePaths) {
      const sensitiveMatch = detectSensitivePath(path11);
      if (sensitiveMatch) {
        fail(
          "sensitive_path",
          `Sensitive path probe detected: ${sensitiveMatch.path} (category: ${sensitiveMatch.category})`
        );
        if (this.appConfig.autoBlockSensitivePaths && cleanIp) {
          const now = Date.now();
          const windowMs = (this.appConfig.sensitivePathWindowSeconds ?? 20) * 1e3;
          const threshold = this.appConfig.sensitivePathThreshold ?? 3;
          const banDurationSeconds = this.appConfig.sensitivePathBanDurationSeconds ?? 600;
          const recentAttempts = (this.sensitivePathAttempts.get(cleanIp) || []).filter((ts) => now - ts <= windowMs);
          recentAttempts.push(now);
          if (recentAttempts.length >= threshold) {
            const durationMinutes = Math.round(banDurationSeconds / 60);
            const durationStr = durationMinutes >= 1 ? `${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}` : `${banDurationSeconds} seconds`;
            this.temporaryBans.set(cleanIp, {
              expiresAt: now + banDurationSeconds * 1e3,
              reason: `IP temporarily blocked for ${durationStr}: repeated sensitive path attempts`
            });
            this.sensitivePathAttempts.delete(cleanIp);
          } else {
            this.sensitivePathAttempts.set(cleanIp, recentAttempts);
          }
        }
      }
    }
    let rateLimitInfo;
    if (!isBlocked && this.appConfig.ddosProtection && this.appConfig.ddosThresholdRpm > 0) {
      const { allowed, resetAt } = this.rateLimiter.check(
        `global:${ip}`,
        this.appConfig.ddosThresholdRpm,
        60
      );
      if (!allowed) {
        fail("ddos", "Global DDoS rate limit exceeded");
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((resetAt - Date.now()) / 1e3)
        );
        rateLimitInfo = {
          limit: this.appConfig.ddosThresholdRpm,
          remaining: 0,
          resetAt,
          retryAfterSeconds
        };
      }
    }
    if (!isBlocked) {
      const route = this.getMatchingRoute(method, path11);
      if (route && route.rateLimitEnabled) {
        const { allowed, resetAt } = this.rateLimiter.check(
          `route:${route.id}:${ip}`,
          route.rateLimitRequests,
          route.rateLimitWindowSeconds
        );
        if (!allowed) {
          fail("rate_limit", `Route rate limit exceeded for ${path11}`);
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((resetAt - Date.now()) / 1e3)
          );
          rateLimitInfo = {
            limit: route.rateLimitRequests,
            remaining: 0,
            resetAt,
            retryAfterSeconds
          };
        }
      }
    }
    const actualBlock = isBlocked && this.appConfig.blockModeEnabled && !this.config.logOnly;
    const isRateLimit = eventType === "rate_limit" || eventType === "ddos";
    const statusCode = actualBlock && isRateLimit ? 429 : actualBlock ? 403 : void 0;
    const logPromise = this.logEvent(
      {
        type: eventType,
        ip,
        method,
        path: path11,
        reason: isBlocked ? blockReason : "",
        blocked: actualBlock
      },
      req
    );
    return {
      blocked: actualBlock,
      statusCode,
      reason: isBlocked ? blockReason : void 0,
      eventType,
      rateLimitInfo: actualBlock ? rateLimitInfo : void 0,
      logPromise: logPromise instanceof Promise ? logPromise : void 0
    };
  }
  getConfig() {
    return this.config;
  }
  destroy() {
    this.stopRealtimeSync();
    if (this.configSyncIntervalId) {
      clearInterval(this.configSyncIntervalId);
      this.configSyncIntervalId = void 0;
    }
    this.flushBatch();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = void 0;
    }
    if (this.uniqueIpPruneInterval) {
      clearInterval(this.uniqueIpPruneInterval);
      this.uniqueIpPruneInterval = void 0;
    }
    this.uniqueIpCache.clear();
    this.batchBuffer = [];
    this.torDetector.destroy();
    this.vpnDetector.destroy();
    this.threatActorDetector.destroy();
    this.outboundMonitor.uninstall();
    this.rateLimiter.destroy();
    this.temporaryBans.clear();
    this.sensitivePathAttempts.clear();
  }
};

// packages/webdefender/src/hono.ts
function isPathMatch2(path11, patterns) {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => {
    if (typeof p === "string") return path11.startsWith(p);
    if (p instanceof RegExp) return p.test(path11);
    return false;
  });
}
async function createDefender(config, app2) {
  const client = new DefenderClient(config);
  await client.init(app2);
  return async (c, next) => {
    try {
      const pathname = new URL(c.req.url).pathname;
      if (isPathMatch2(pathname, config.excludePaths)) {
        return next();
      }
      const ip = c.req.header("x-forwarded-for") || c.req.header("cf-connecting-ip") || "unknown";
      const normalizedIp = ip.split(",")[0].trim();
      const skipBodyScan = isPathMatch2(pathname, config.skipBodyScanPaths);
      let bodyStr = "";
      if (!skipBodyScan) {
        try {
          if (["POST", "PUT", "PATCH"].includes(c.req.method.toUpperCase())) {
            const raw = c.req.raw.clone();
            const text = await raw.text();
            bodyStr = text || "";
          }
        } catch (e) {
        }
      }
      const query = c.req.queries() || {};
      const reqInfo = {
        ip: normalizedIp,
        method: c.req.method,
        path: pathname,
        query,
        body: bodyStr,
        headers: c.req.header(),
        userAgent: c.req.header("user-agent") || "",
        skipBodyScan
      };
      const result = await client.handleRequest(reqInfo);
      if (result.blocked) {
        const status = result.statusCode || 403;
        const headers = {};
        if (result.rateLimitInfo) {
          headers["Retry-After"] = String(
            result.rateLimitInfo.retryAfterSeconds
          );
          headers["RateLimit-Limit"] = String(result.rateLimitInfo.limit);
          headers["RateLimit-Remaining"] = String(
            result.rateLimitInfo.remaining
          );
          headers["RateLimit-Reset"] = String(result.rateLimitInfo.resetAt);
        }
        return c.json(
          {
            blocked: true,
            reason: result.reason || "Request blocked by Defender"
          },
          status,
          headers
        );
      }
      await next();
    } catch (error) {
      console.error("[Defender] Hono middleware error:", error);
      await next();
    }
  };
}

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
    href: "/apps/file-converter",
    label: "File Converter",
    description: "In-browser image, audio, and video converter"
  },
  {
    href: "/apps/file-trimmer",
    label: "File Trimmer",
    description: "In-browser audio and video trimming utility"
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
  "/apps/file-converter": {
    path: "/apps/file-converter",
    title: "File Converter - Oxygen Low's Software",
    description: "Convert images, audio, and video files locally in your browser with zero data leaving your device.",
    canonicalPath: "/apps/file-converter",
    h1: "Online File Converter",
    h2: [
      "Local Browser Conversion",
      "Image, Audio & Video Support",
      "Private & Secure Processing"
    ],
    keywords: [
      "file converter",
      "convert audio",
      "convert video",
      "convert images",
      "ffmpeg wasm"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "File Converter", url: "/apps/file-converter" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/file-compressor", label: "File Compressor" },
      { href: "/apps/file-trimmer", label: "File Trimmer" }
    ],
    softwareType: "File Conversion Utility"
  },
  "/apps/file-trimmer": {
    path: "/apps/file-trimmer",
    title: "File Trimmer - Oxygen Low's Software",
    description: "Trim audio and video files locally in your browser with precision interval controls and instant playback preview.",
    canonicalPath: "/apps/file-trimmer",
    h1: "Online Audio & Video File Trimmer",
    h2: [
      "Local Browser Trimming",
      "Precise Timestamp Controls",
      "Lossless Stream Copy & Transcoding"
    ],
    keywords: [
      "file trimmer",
      "trim video",
      "trim audio",
      "cut video online",
      "mp4 trimmer",
      "mp3 trimmer"
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "File Trimmer", url: "/apps/file-trimmer" }
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/file-converter", label: "File Converter" },
      { href: "/apps/file-compressor", label: "File Compressor" }
    ],
    softwareType: "Media Trimming Utility"
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
      `<title>${escapeHtml2(metadata.title)}</title>`
    );
  } else {
    modifiedHtml = modifiedHtml.replace(
      /<head>/i,
      `<head>
    <title>${escapeHtml2(metadata.title)}</title>`
    );
  }
  const metaDescTag = `<meta name="description" content="${escapeHtml2(metadata.description)}" />`;
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
    `<meta property="og:site_name" content="${escapeHtml2(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml2(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml2(metadata.description)}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:type" content="${metadata.ogType || "website"}" />`,
    `<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml2(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml2(metadata.description)}" />`,
    `<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`
  ];
  if (metadata.keywords && metadata.keywords.length > 0) {
    ogTags.push(
      `<meta name="keywords" content="${escapeHtml2(metadata.keywords.join(", "))}" />`
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
    (l) => `<li><a href="${l.href}">${escapeHtml2(l.label)}</a>${l.description ? ` - ${escapeHtml2(l.description)}` : ""}</li>`
  ).join("\n        ");
  const fallbackContent = `<div class="initial-loader">
        <div class="initial-spinner"></div>
      </div>
      <header class="sr-only">
        <h1>${escapeHtml2(metadata.h1)}</h1>
        <p>${escapeHtml2(metadata.description)}</p>
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
function escapeHtml2(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// server/index.ts
init_dataStore();
setRealtimeBroadcast(broadcastChange);
wipeServerPasswordsAndMigrateSchema();
var app = new Hono26();
app.use(compress());
var defenderPromise = null;
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/webdefender") || c.req.path.startsWith("/api/defender") || c.req.path.startsWith("/api/banned-ips") || c.req.path.startsWith("/api/admin/banned-ips") || c.req.path.startsWith("/api/admin/webdefender") || c.req.path.startsWith("/api/storage") || c.req.path.startsWith("/api/auth") || c.req.path.startsWith("/api/oauth") || c.req.path.startsWith("/api/data") || c.req.path.startsWith("/api/surveys") || c.req.path.startsWith("/api/ai") || c.req.path.startsWith("/api/v1") || c.req.path.startsWith("/v1") || c.req.path.startsWith("/api/realtime") || c.req.path.startsWith("/api/browser") || c.req.path.startsWith("/api/webmaster") || c.req.path.startsWith("/api/chat") || c.req.path.startsWith("/api/chess")) {
    return next();
  }
  if (!defenderPromise) {
    defenderPromise = createDefender(
      {
        apiKey: process.env.DEFENDER_API_KEY || "",
        apiUrl: process.env.DEFENDER_API_URL || "https://oxygenlow.com",
        skipBodyScanPaths: [
          "/api/ai",
          "/api/data",
          "/api/storage",
          "/api/v1",
          "/v1"
        ]
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
        "https://api.openai.com",
        "https://api.anthropic.com",
        "https://generativelanguage.googleapis.com",
        "https://openrouter.ai",
        "https://api.x.ai"
      ],
      frameSrc: ["'self'", "blob:"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    },
    crossOriginOpenerPolicy: "same-origin",
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: "cross-origin",
    xFrameOptions: "SAMEORIGIN",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    strictTransportSecurity: "max-age=31536000; includeSubDomains"
  })
);
app.use(
  cors2({
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
  const path11 = c.req.path;
  const accept = c.req.header("Accept") || "";
  if (accept.includes("text/markdown") && !path11.startsWith("/api/") && !path11.startsWith("/.well-known/") && path11 !== "/auth.md" && path11 !== "/llms.txt" && path11 !== "/robots.txt" && path11 !== "/sitemap.xml") {
    const seo = getSeoMetadata(path11);
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
  const path11 = c.req.path;
  const isAsset = path11.startsWith("/api/") || path11.startsWith("/.well-known/") || /\.(js|css|png|ico|svg|woff2?|ttf|eot|map|json|xml|txt|jpg|jpeg|gif|webp)$/i.test(
    path11
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
app.get("/users/:username", (c, next) => {
  const username = c.req.param("username");
  if (username && username.toLowerCase() === "oxygen-low") {
    return c.redirect("/users/oxygenlow", 301);
  }
  return next();
});
app.get("/users/:username/*", (c, next) => {
  const username = c.req.param("username");
  if (username && username.toLowerCase() === "oxygen-low") {
    return c.redirect("/users/oxygenlow", 301);
  }
  return next();
});
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
      description: "API services for Oxygen Low's Software platform, including AI agents, VPN, support, and authentication metadata.",
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
      "/v1/chat/completions": {
        post: {
          summary: "Free AI Chat Completions",
          description: "OpenAI-compatible text completion completely accessible for free without API keys. Rate limited to 60 requests per minute per IP.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    model: { type: "string", example: "Fast", description: "Model name or alias (Fast, Smart, llama-3.2-3b, gpt-3.5-turbo, etc.)" },
                    messages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          role: { type: "string", example: "user" },
                          content: { type: "string", example: "Hello!" }
                        }
                      }
                    },
                    stream: { type: "boolean", example: false }
                  },
                  required: ["messages"]
                }
              }
            }
          },
          responses: {
            "200": { description: "OpenAI-compatible completion object or SSE stream" },
            "429": { description: "Rate limit exceeded (60 requests per minute per IP)" }
          }
        }
      },
      "/v1/images/generations": {
        post: {
          summary: "Free AI Image Generation",
          description: "OpenAI-compatible image generation completely accessible for free without API keys. Rate limited to 60 requests per minute per IP.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    prompt: { type: "string", example: "A cute red panda wearing glasses" },
                    model: { type: "string", example: "quality", description: "quality, fast, anime, pixel_art, realistic, cartoon, simplistic, dall-e-3" },
                    size: { type: "string", example: "512x512" },
                    response_format: { type: "string", example: "url", enum: ["url", "b64_json"] }
                  },
                  required: ["prompt"]
                }
              }
            }
          },
          responses: {
            "200": { description: "OpenAI-compatible image generation response with URLs or base64 JSON" },
            "429": { description: "Rate limit exceeded (60 requests per minute per IP)" }
          }
        }
      },
      "/v1/models": {
        get: {
          summary: "List Free AI Models",
          description: "Returns the list of free text and image generation models available via /v1 and /api/v1.",
          responses: {
            "200": { description: "OpenAI-compatible model list" }
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
        <span class="method post">POST</span>
        <span class="path">/agent/auth</span>
      </div>
      <div class="desc">Agent registration and identity assertion exchange endpoint.</div>
    </div>

    <h2 style="margin-top: 2rem; margin-bottom: 1rem; font-size: 1.3rem;">Free OpenAI-Compatible AI API (Keyless &middot; 60 RPM/IP)</h2>
    <p style="color: var(--text-muted); margin-bottom: 1rem; font-size: 0.95rem;">
      Completely free endpoints for text generation and image generation. Compatible with standard OpenAI SDKs and curl without requiring an API key. Shared rate limit of 60 requests per minute per IP.
    </p>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method get">GET</span>
        <span class="path">/v1/models <span style="color: var(--text-muted); font-size: 0.85rem;">(or /api/v1/models)</span></span>
      </div>
      <div class="desc">Discover available free text models (Fast, Smart, llama-3.2-3b, etc.) and image models (quality, fast, anime, pixel_art, etc.).</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method post">POST</span>
        <span class="path">/v1/chat/completions <span style="color: var(--text-muted); font-size: 0.85rem;">(or /api/v1/chat/completions)</span></span>
      </div>
      <div class="desc">Free OpenAI-compatible chat completion supporting both streaming (SSE) and non-streaming responses. Zero authentication required.</div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method post">POST</span>
        <span class="path">/v1/images/generations <span style="color: var(--text-muted); font-size: 0.85rem;">(or /api/v1/images/generations)</span></span>
      </div>
      <div class="desc">Free OpenAI-compatible image generation returning image URLs or base64 JSON. Synchronously completed via server-side polling.</div>
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
app.route("/api/ai/image", imageGenRouter);
app.route("/api/ai/agent-search", agentSearchRouter);
app.route("/api/vpn", vpnRouter);
app.route("/api/webdefender", defenderRouter);
app.route("/api/defender", defenderRouter);
app.route("/api/storage", storageRouter);
app.route("/api/auth", authRouter);
app.route("/api/oauth", oauthRouter);
app.route("/api/data", dataRouter);
app.route("/api/surveys", surveysRouter);
app.route("/api/realtime", realtimeRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/admin/notifications", adminNotificationsRouter);
app.route("/api/admin/webdefender", adminWebdefenderRouter);
app.route("/api/admin/banned-ips", adminWebdefenderRouter);
app.route("/api/browser", browserRouter);
app.route("/api/webmaster", webmasterRouter);
app.route("/api/chat", chatRouter);
app.route("/api/chess", chessRouter);
app.route("/api/models", modelsRouter);
app.route("/v1", v1Router);
app.route("/api/v1", v1Router);
app.get("/bot", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>oxylow Bot - Oxygen Low's Software Crawler</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 700px; margin: 0 auto; line-height: 1.6; }
          h1 { color: #38bdf8; }
          code { background: #1e293b; padding: 0.2rem 0.4rem; border-radius: 4px; color: #f43f5e; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 1.5rem; margin-top: 1.5rem; }
          a { color: #38bdf8; }
        </style>
      </head>
      <body>
        <h1>oxylow Crawler Bot</h1>
        <p>You have received a visit from <code>oxylow</code>, the official web crawler and search indexer for <strong>Oxygen Low's Software</strong>.</p>
        <div class="card">
          <h2>Bot Identity & Compliance</h2>
          <ul>
            <li><strong>User-Agent:</strong> <code>Mozilla/5.0 (compatible; oxylow/1.0; +https://oxygenlow.com/bot; support@oxygenlow.com)</code></li>
            <li><strong>Robots.txt:</strong> oxylow strictly respects <code>robots.txt</code> rules (both <code>User-agent: oxylow</code> and <code>User-agent: *</code>), including <code>Disallow</code> directives and <code>Crawl-delay</code> rate limiting.</li>
            <li><strong>Politeness:</strong> oxylow enforces minimum delays between requests to the same domain.</li>
            <li><strong>Contact & Abuse:</strong> If you have questions, feedback, or need to report crawler issues, please contact us at <a href="mailto:support@oxygenlow.com">support@oxygenlow.com</a>.</li>
          </ul>
        </div>
      </body>
    </html>
  `, 200, { "Content-Type": "text/html; charset=utf-8" });
});
app.get("/api/banned-ips", async (c) => {
  const bannedIps = getActiveDefenderBannedIps().map(publicDefenderBannedIp);
  return c.json({ banned_ips: bannedIps, total: bannedIps.length });
});
if (!process.env.VITEST) {
  resumeInterruptedCrawls();
}
var index_default = app;

// server/serve.ts
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs10 from "node:fs";
import path10 from "node:path";
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
    indexHtml = fs10.readFileSync(path10.resolve("./dist/spa/index.html"), "utf-8");
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
var envPort = process.env.PORT;
var port = envPort && !isNaN(Number(envPort)) ? parseInt(envPort, 10) : envPort || 3e3;
var server = serve(
  {
    fetch: index_default.fetch,
    port
  },
  (info) => {
    const address = typeof info === "string" ? info : typeof info === "object" && info && "port" in info ? `http://localhost:${info.port}` : String(port);
    console.log(`Listening on ${address}`);
  }
);
