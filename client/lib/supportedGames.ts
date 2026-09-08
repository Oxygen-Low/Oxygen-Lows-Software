/**
 * @file client/lib/supportedGames.ts
 * @description Supported Games Directory, Categories, Steam VDF Parser, and Path Resolution Engine
 * for Oxygen Low's Software Game Save & Mod Cloud Sync Subsystem.
 *
 * Covers all 8 supported games, exact 18 categories, Steam VDF parsing (modern + legacy),
 * system paths resolution, 3-tier custom path override hierarchy, path traversal security defense,
 * and dataStore compatibility helpers.
 */

import type {
  GameSyncConfigRecord,
  GameSnapshotRecord,
} from "../../server/lib/dataStore";

export type {
  GameSyncConfigRecord,
  GameSnapshotRecord,
};

export type GameDataCategory =
  | "saves"
  | "mod_lists"
  | "custom_mods"
  | "ideologies"
  | "xenotypes"
  | "submarines"
  | "data";

export const VALID_GAME_DATA_CATEGORIES: readonly GameDataCategory[] = [
  "saves",
  "mod_lists",
  "custom_mods",
  "ideologies",
  "xenotypes",
  "submarines",
  "data",
] as const;

export type PathType =
  | "appdata_locallow"
  | "appdata_local"
  | "appdata_roaming"
  | "saved_games"
  | "game_install";

export type PackagingMode = "file" | "directory" | "zip_bundle";

export type SupportedGameId =
  | "rain_world"
  | "rimworld"
  | "library_of_ruina"
  | "lobotomy_corporation"
  | "ostranauts"
  | "barotrauma"
  | "kenshi"
  | "space_haven";

export type PathResolutionSource =
  | "user_override"
  | "user_custom"
  | "user_install_dir"
  | "detected_install"
  | "default_system"
  | "standard_default"
  | "fallback_system"
  | "fallback_install";

export interface CategoryFallbackPath {
  pathType: PathType;
  relativePath: string;
}

export interface GameCategoryDefinition {
  /** Category identifier matching GameDataCategory in server/lib/dataStore.ts */
  id: GameDataCategory;
  /** Human-readable category label */
  name: string;
  /** User-facing description of what this category stores and synchronizes */
  description: string;
  /** Default toggle state when initializing sync configuration */
  defaultEnabled: boolean;
  /** Primary system or install path location */
  pathType: PathType;
  /** Relative sub-path from the pathType root */
  relativePath: string;
  /** Optional fallback paths (e.g. classic install directory paths vs modern AppData) */
  fallbackPaths?: CategoryFallbackPath[];
  /** Convenience alias for the first fallback relative path */
  fallbackRelativePath?: string;
  /** File glob patterns or extensions captured by this category */
  filePatterns: string[];
  /** How this data is packaged for cloud snapshot storage */
  packagingMode: PackagingMode;
  /** Corresponding key in GameSyncConfigRecord.custom_paths */
  customPathKey: "save_path" | "mods_path" | "config_path" | "install_path";
  /** Patterns to exclude from packaging (e.g., official DLC folders or temp files) */
  excludePatterns?: string[];
  /** Flag indicating if this category is subject to the 24-hour auto-sync retention rule */
  isModList?: boolean;
  /** Flag indicating if this category represents local custom non-Workshop mods */
  isCustomMod?: boolean;
}

export interface SupportedGameDefinition {
  /** Unique canonical game identifier */
  id: SupportedGameId;
  /** Full display title */
  name: string;
  /** Title alias for compatibility */
  title: string;
  /** Official Steam App ID */
  steamAppId: number;
  /** Known executable file names */
  defaultExecutableNames: string[];
  /** Primary executable name alias */
  executableName: string;
  /** Default Steam common install folder name */
  defaultInstallDirName: string;
  /** Default install folder alias */
  defaultInstallFolder: string;
  /** Optional alternate common folder names */
  alternateInstallFolders?: string[];
  /** All recognized data categories for this game */
  categories: GameCategoryDefinition[];
  /** Optional banner and icon asset paths */
  iconUrl?: string;
  bannerUrl?: string;
}

export interface SteamLibraryFolder {
  path: string;
  label?: string;
  appIds: string[];
  apps?: Record<string, string>;
}

export interface SystemPaths {
  userProfile: string;
  appData: string;
  appDataRoaming: string;
  localAppData: string;
  appDataLocal: string;
  localLow: string;
  appDataLocalLow: string;
  savedGames: string;
  documents: string;
  programFilesX86: string;
  steamPath: string;
  steamLibraries?: string[];
}

export interface ResolvedPathInfo {
  gameId: string;
  category: GameCategoryDefinition;
  categoryId?: string;
  path: string;
  source: PathResolutionSource;
  isCustom: boolean;
  baseDirectory: string;
  relativePath?: string;
  fallbackPath?: string;
  exists?: boolean;
  securityWarning?: string;
}

/**
 * Complete list of all 8 supported games and their exact 18 categories.
 */
export const SUPPORTED_GAMES: readonly SupportedGameDefinition[] = [
  // 1. Rain World (3 categories: data, custom_mods, mod_lists)
  {
    id: "rain_world",
    name: "Rain World",
    title: "Rain World",
    steamAppId: 674440,
    defaultExecutableNames: ["RainWorld.exe"],
    executableName: "RainWorld.exe",
    defaultInstallDirName: "Rain World",
    defaultInstallFolder: "Rain World",
    categories: [
      {
        id: "data",
        name: "Game Data & Progress",
        description: "Campaign saves, progression, expedition state, and game options",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Videocult/Rain World",
        fallbackPaths: [
          {
            pathType: "game_install",
            relativePath: "UserData",
          },
        ],
        fallbackRelativePath: "UserData",
        filePatterns: ["sav", "sav2", "sav3", "options", "expedition", "sav_*.txt", "*.txt"],
        packagingMode: "directory",
        customPathKey: "save_path",
      },
      {
        id: "custom_mods",
        name: "Custom Mods",
        description: "Local non-Workshop mods installed in StreamingAssets/mods",
        defaultEnabled: true,
        pathType: "game_install",
        relativePath: "RainWorld_Data/StreamingAssets/mods",
        filePatterns: ["*"],
        packagingMode: "zip_bundle",
        customPathKey: "mods_path",
        excludePatterns: ["moreslugcats", "expedition"],
        isCustomMod: true,
      },
      {
        id: "mod_lists",
        name: "Mod List & Config",
        description: "Active mod load order and enabled plugin selection (enabledMods.txt)",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Videocult/Rain World",
        filePatterns: ["enabledMods.txt", "modConfigs.txt"],
        packagingMode: "file",
        customPathKey: "config_path",
        isModList: true,
      },
    ],
  },

  // 2. RimWorld (5 categories: saves, custom_mods, ideologies, xenotypes, mod_lists)
  {
    id: "rimworld",
    name: "RimWorld",
    title: "RimWorld",
    steamAppId: 294100,
    defaultExecutableNames: ["RimWorldWin64.exe", "RimWorld.exe"],
    executableName: "RimWorldWin64.exe",
    defaultInstallDirName: "RimWorld",
    defaultInstallFolder: "RimWorld",
    categories: [
      {
        id: "saves",
        name: "Colony Saves",
        description: "Colony world and pawn save files (.rws)",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Ludeon Studios/RimWorld by Ludeon Studios/Saves",
        filePatterns: ["*.rws"],
        packagingMode: "file",
        customPathKey: "save_path",
      },
      {
        id: "custom_mods",
        name: "Custom Mods",
        description: "Local non-Workshop mods placed in the RimWorld Mods folder",
        defaultEnabled: true,
        pathType: "game_install",
        relativePath: "Mods",
        filePatterns: ["*"],
        packagingMode: "zip_bundle",
        customPathKey: "mods_path",
        excludePatterns: ["Core", "Royalty", "Ideology", "Biotech", "Anomaly"],
        isCustomMod: true,
      },
      {
        id: "ideologies",
        name: "Custom Ideologies",
        description: "Player-created religion and ideology templates (.rwi)",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Ludeon Studios/RimWorld by Ludeon Studios/Ideologies",
        filePatterns: ["*.rwi"],
        packagingMode: "file",
        customPathKey: "save_path",
      },
      {
        id: "xenotypes",
        name: "Custom Xenotypes",
        description: "Custom genetically engineered biotech xenotype templates (.rwx)",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Ludeon Studios/RimWorld by Ludeon Studios/Xenotypes",
        filePatterns: ["*.rwx"],
        packagingMode: "file",
        customPathKey: "save_path",
      },
      {
        id: "mod_lists",
        name: "Active Mod List & Config",
        description: "Active mod load order (ModsConfig.xml) and exported mod manager profiles",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Ludeon Studios/RimWorld by Ludeon Studios/Config",
        fallbackPaths: [
          {
            pathType: "appdata_locallow",
            relativePath: "Ludeon Studios/RimWorld by Ludeon Studios/ModLists",
          },
        ],
        fallbackRelativePath: "Ludeon Studios/RimWorld by Ludeon Studios/ModLists",
        filePatterns: ["ModsConfig.xml", "*.xml"],
        packagingMode: "file",
        customPathKey: "config_path",
        isModList: true,
      },
    ],
  },

  // 3. Library Of Ruina (1 category: data)
  {
    id: "library_of_ruina",
    name: "Library Of Ruina",
    title: "Library Of Ruina",
    steamAppId: 1256670,
    defaultExecutableNames: ["LibraryOfRuina.exe"],
    executableName: "LibraryOfRuina.exe",
    defaultInstallDirName: "Library Of Ruina",
    defaultInstallFolder: "Library Of Ruina",
    categories: [
      {
        id: "data",
        name: "Library Data & Decks",
        description: "Battle history, invitation receptions, key pages, and deck configurations",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Project_Moon/LibraryOfRuina",
        filePatterns: ["SaveData*.dat", "Option.dat", "BaseMod/*", "*.dat"],
        packagingMode: "directory",
        customPathKey: "save_path",
      },
    ],
  },

  // 4. Lobotomy Corporation (1 category: data)
  {
    id: "lobotomy_corporation",
    name: "Lobotomy Corporation",
    title: "Lobotomy Corporation",
    steamAppId: 568220,
    defaultExecutableNames: ["LobotomyCorp.exe"],
    executableName: "LobotomyCorp.exe",
    defaultInstallDirName: "LobotomyCorp",
    defaultInstallFolder: "LobotomyCorp",
    categories: [
      {
        id: "data",
        name: "Facility Data & Codex",
        description: "Abnormalities observation codex, employee deployments, and manager progress",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Project_Moon/Lobotomy",
        filePatterns: [
          "saveData.dat",
          "creatureSaveData.dat",
          "unlockedEquipList.dat",
          "agentData.dat",
          "option.dat",
          "BaseMod/*",
          "*.dat",
        ],
        packagingMode: "directory",
        customPathKey: "save_path",
      },
    ],
  },

  // 5. Ostranauts (1 category: saves)
  {
    id: "ostranauts",
    name: "Ostranauts",
    title: "Ostranauts",
    steamAppId: 1022980,
    defaultExecutableNames: ["Ostranauts.exe"],
    executableName: "Ostranauts.exe",
    defaultInstallDirName: "Ostranauts",
    defaultInstallFolder: "Ostranauts",
    categories: [
      {
        id: "saves",
        name: "Ship & Career Saves",
        description: "Player ship state, crew telemetry, hull pressure, and career saves",
        defaultEnabled: true,
        pathType: "appdata_locallow",
        relativePath: "Blue Bottle Games/Ostranauts/saves",
        fallbackPaths: [
          {
            pathType: "game_install",
            relativePath: "saves",
          },
          {
            pathType: "appdata_roaming",
            relativePath: "BlueBottleGames/Ostranauts/saves",
          },
        ],
        fallbackRelativePath: "saves",
        filePatterns: ["*.json", "save_*", "*"],
        packagingMode: "directory",
        customPathKey: "save_path",
      },
    ],
  },

  // 6. Barotrauma (4 categories: submarines, saves, custom_mods, mod_lists)
  {
    id: "barotrauma",
    name: "Barotrauma",
    title: "Barotrauma",
    steamAppId: 602960,
    defaultExecutableNames: ["Barotrauma.exe"],
    executableName: "Barotrauma.exe",
    defaultInstallDirName: "Barotrauma",
    defaultInstallFolder: "Barotrauma",
    categories: [
      {
        id: "submarines",
        name: "Custom Submarines",
        description: "Player-designed submarines, shuttles, and outposts (.sub)",
        defaultEnabled: true,
        pathType: "appdata_local",
        relativePath: "Daedalic Entertainment GmbH/Barotrauma/Submarines",
        fallbackPaths: [
          {
            pathType: "game_install",
            relativePath: "Submarines",
          },
        ],
        fallbackRelativePath: "Submarines",
        filePatterns: ["*.sub"],
        packagingMode: "file",
        customPathKey: "save_path",
      },
      {
        id: "saves",
        name: "Campaign Saves",
        description: "Singleplayer and multiplayer submarine campaign save archives (.save)",
        defaultEnabled: true,
        pathType: "appdata_local",
        relativePath: "Daedalic Entertainment GmbH/Barotrauma/Multiplayer",
        fallbackPaths: [
          {
            pathType: "appdata_local",
            relativePath: "Daedalic Entertainment GmbH/Barotrauma",
          },
          {
            pathType: "game_install",
            relativePath: "Data/Saves",
          },
        ],
        fallbackRelativePath: "Daedalic Entertainment GmbH/Barotrauma",
        filePatterns: ["*.save"],
        packagingMode: "file",
        customPathKey: "save_path",
      },
      {
        id: "custom_mods",
        name: "Custom Mods",
        description: "Locally authored mod packages containing filelist.xml",
        defaultEnabled: true,
        pathType: "appdata_local",
        relativePath: "Daedalic Entertainment GmbH/Barotrauma/Mods",
        fallbackPaths: [
          {
            pathType: "game_install",
            relativePath: "Mods",
          },
        ],
        fallbackRelativePath: "Mods",
        filePatterns: ["*"],
        packagingMode: "zip_bundle",
        customPathKey: "mods_path",
        isCustomMod: true,
      },
      {
        id: "mod_lists",
        name: "Mod List & Load Order",
        description: "Active content packages and enabled mod priority list (config_player.xml)",
        defaultEnabled: true,
        pathType: "appdata_local",
        relativePath: "Daedalic Entertainment GmbH/Barotrauma",
        filePatterns: ["config_player.xml"],
        packagingMode: "file",
        customPathKey: "config_path",
        isModList: true,
      },
    ],
  },

  // 7. Kenshi (2 categories: saves, mod_lists)
  {
    id: "kenshi",
    name: "Kenshi",
    title: "Kenshi",
    steamAppId: 233860,
    defaultExecutableNames: ["kenshi_x64.exe", "kenshi.exe"],
    executableName: "kenshi_x64.exe",
    defaultInstallDirName: "Kenshi",
    defaultInstallFolder: "Kenshi",
    categories: [
      {
        id: "saves",
        name: "Squad & World Saves",
        description: "Platoons, base building, world state, and squad save folders",
        defaultEnabled: true,
        pathType: "appdata_local",
        relativePath: "kenshi/save",
        fallbackPaths: [
          {
            pathType: "game_install",
            relativePath: "save",
          },
        ],
        fallbackRelativePath: "save",
        filePatterns: ["*"],
        packagingMode: "directory",
        customPathKey: "save_path",
      },
      {
        id: "mod_lists",
        name: "Mod Load Order",
        description: "Active mod load order and enabled mods configuration (mods.cfg)",
        defaultEnabled: true,
        pathType: "game_install",
        relativePath: "data",
        fallbackPaths: [
          {
            pathType: "appdata_local",
            relativePath: "kenshi/data",
          },
        ],
        fallbackRelativePath: "data",
        filePatterns: ["mods.cfg"],
        packagingMode: "file",
        customPathKey: "config_path",
        isModList: true,
      },
    ],
  },

  // 8. Space Haven (1 category: saves)
  {
    id: "space_haven",
    name: "Space Haven",
    title: "Space Haven",
    steamAppId: 979110,
    defaultExecutableNames: ["spacehaven.exe"],
    executableName: "spacehaven.exe",
    defaultInstallDirName: "Space Haven",
    defaultInstallFolder: "Space Haven",
    categories: [
      {
        id: "saves",
        name: "Spaceship & Crew Saves",
        description: "Ship layout, crew status, derelict exploration, and galaxy state",
        defaultEnabled: true,
        pathType: "game_install",
        relativePath: "savegames",
        fallbackPaths: [
          {
            pathType: "appdata_roaming",
            relativePath: "SpaceHaven/savegames",
          },
        ],
        fallbackRelativePath: "SpaceHaven/savegames",
        filePatterns: ["*"],
        packagingMode: "directory",
        customPathKey: "save_path",
      },
    ],
  },
] as const;

/**
 * Mapping of common aliases and alternate identifiers to canonical SupportedGameId.
 */
export const GAME_ID_ALIASES: Readonly<Record<string, SupportedGameId>> = {
  rain_world: "rain_world",
  rainworld: "rain_world",
  "674440": "rain_world",

  rimworld: "rimworld",
  rim_world: "rimworld",
  "294100": "rimworld",

  library_of_ruina: "library_of_ruina",
  libraryofruina: "library_of_ruina",
  ruina: "library_of_ruina",
  "1256670": "library_of_ruina",

  lobotomy_corporation: "lobotomy_corporation",
  lobotomy_corp: "lobotomy_corporation",
  lobotomycorp: "lobotomy_corporation",
  lobotomy: "lobotomy_corporation",
  "568220": "lobotomy_corporation",

  ostranauts: "ostranauts",
  "1022980": "ostranauts",

  barotrauma: "barotrauma",
  "602960": "barotrauma",

  kenshi: "kenshi",
  "233860": "kenshi",

  space_haven: "space_haven",
  spacehaven: "space_haven",
  "979110": "space_haven",
};

/**
 * Quick lookup map by canonical game ID.
 */
export const SUPPORTED_GAME_MAP = new Map<SupportedGameId, SupportedGameDefinition>(
  SUPPORTED_GAMES.map((game) => [game.id, game])
);

/**
 * Steam App ID to canonical game ID mapping.
 */
export const STEAM_APP_ID_TO_GAME_ID: Readonly<Record<number, SupportedGameId>> = {
  674440: "rain_world",
  294100: "rimworld",
  1256670: "library_of_ruina",
  568220: "lobotomy_corporation",
  1022980: "ostranauts",
  602960: "barotrauma",
  233860: "kenshi",
  979110: "space_haven",
};

/**
 * Total counts for validation.
 */
export const TOTAL_SUPPORTED_GAMES_COUNT = 8;
export const TOTAL_CATEGORIES_COUNT = 18;

// ============================================================================
// Path Normalization & Safe Operations
// ============================================================================

/**
 * Normalizes a file system path string to standard Windows format.
 * - Converts forward slashes to backslashes.
 * - Collapses redundant backslashes while preserving leading UNC prefix (\\\\).
 * - Trims trailing backslashes (unless it's a drive root like C:\\).
 */
export function normalizePath(p: string): string {
  if (!p || typeof p !== "string") return "";
  let norm = p.trim().replace(/\//g, "\\");
  const isUnc = norm.startsWith("\\\\");
  norm = norm.replace(/\\+/g, "\\");
  if (isUnc) {
    norm = "\\" + norm;
  }
  if (norm.length > 3 && norm.endsWith("\\") && !/^[A-Za-z]:\\$/.test(norm) && norm !== "\\\\") {
    norm = norm.slice(0, -1);
  }
  return norm;
}

/**
 * Dependency-free path joiner that normalizes and produces clean Windows paths.
 */
export function joinPaths(...parts: (string | undefined | null)[]): string {
  const valid = parts.filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  if (valid.length === 0) return "";

  let result = valid[0].replace(/\//g, "\\");
  for (let i = 1; i < valid.length; i++) {
    const part = valid[i].replace(/\//g, "\\");
    if (result.endsWith("\\") && part.startsWith("\\")) {
      result += part.slice(1);
    } else if (!result.endsWith("\\") && !part.startsWith("\\")) {
      result += "\\" + part;
    } else {
      result += part;
    }
  }
  return normalizePath(result);
}

/**
 * Validates custom paths against directory traversal, null bytes, and non-absolute roots.
 */
export function validateCustomPath(
  inputPath: string
): { valid: boolean; reason?: string } {
  if (!inputPath || typeof inputPath !== "string" || !inputPath.trim()) {
    return { valid: false, reason: "empty_path" };
  }
  const clean = inputPath.trim();

  // Null byte check
  if (clean.includes("\0")) {
    return { valid: false, reason: "null_byte_detected" };
  }

  // Directory traversal check
  if (
    clean.includes("..\\") ||
    clean.includes("../") ||
    clean === ".." ||
    clean.endsWith("\\..") ||
    clean.endsWith("/..") ||
    clean.includes("\\..\\") ||
    clean.includes("/../")
  ) {
    return { valid: false, reason: "path_traversal_detected" };
  }

  // Absolute root check (Windows drive letter or UNC)
  if (!/^[A-Za-z]:[\\/]|^\\\\/.test(clean)) {
    return { valid: false, reason: "invalid_root" };
  }

  return { valid: true };
}

// ============================================================================
// Steam VDF Parsing Engine
// ============================================================================

/**
 * Unescapes VDF string characters (\\\\ -> \\, \\\" -> \").
 */
function unescapeVdfString(val: string): string {
  return val.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}

/**
 * Validates if a string value looks like a filesystem path rather than an app size or metadata.
 */
function isLikelyPathString(val: string): boolean {
  if (!val || typeof val !== "string" || val.length < 3) return false;
  if (/^\d+$/.test(val)) return false; // purely numeric (e.g. app size)
  return /[\\/:]/.test(val);
}

/**
 * Parses Steam libraryfolders.vdf detailed data (including paths, labels, and app IDs).
 * Handles modern Steam schemas ("0" { "path" "..." "apps" { ... } }) and legacy schemas ("1" "D:\\SteamLibrary").
 */
export function parseSteamLibraryFoldersDetailed(
  vdfContent: string
): SteamLibraryFolder[] {
  if (!vdfContent || typeof vdfContent !== "string") return [];

  const results: SteamLibraryFolder[] = [];
  const seenPaths = new Set<string>();

  const recordLibrary = (
    rawPath: string,
    appIds: string[] = [],
    apps: Record<string, string> = {},
    label?: string
  ) => {
    const norm = normalizePath(unescapeVdfString(rawPath));
    if (!norm || seenPaths.has(norm.toLowerCase())) return;
    seenPaths.add(norm.toLowerCase());
    results.push({ path: norm, appIds, apps, label });
  };

  // Stage 1: KeyValues line-by-line block walk
  const lines = vdfContent.split(/\r?\n/);
  let currentBlockPath: string | null = null;
  let currentBlockLabel: string | undefined;
  let currentBlockApps: Record<string, string> = {};
  let currentBlockAppIds: string[] = [];
  let inAppsBlock = false;
  let depth = 0;

  for (let line of lines) {
    const commentIdx = line.indexOf("//");
    if (commentIdx !== -1) line = line.substring(0, commentIdx);
    const trimmed = line.trim();
    if (!trimmed) continue;

    const openCount = (trimmed.match(/{/g) || []).length;
    const closeCount = (trimmed.match(/}/g) || []).length;

    // Check for inline app pairs if inAppsBlock or line contains "apps"
    if (inAppsBlock || /"apps"/i.test(trimmed)) {
      const appMatches = [...trimmed.matchAll(/"(\d+)"\s+"([^"]*)"/g)];
      for (const match of appMatches) {
        // Exclude block keys ("0", "1", "2") unless we are explicitly inside an apps block
        if (inAppsBlock || (match[1] !== "0" && match[1] !== "1" && match[1] !== "2")) {
          if (!currentBlockApps[match[1]]) {
            currentBlockAppIds.push(match[1]);
          }
          currentBlockApps[match[1]] = match[2];
        }
      }
    }

    if (openCount > 0) depth += openCount;

    // Modern "path" property
    const pathMatch = trimmed.match(/"path"\s+"([^"]+)"/i);
    if (pathMatch) {
      if (currentBlockPath) {
        recordLibrary(
          currentBlockPath,
          currentBlockAppIds,
          currentBlockApps,
          currentBlockLabel
        );
        currentBlockApps = {};
        currentBlockAppIds = [];
        currentBlockLabel = undefined;
      }
      currentBlockPath = pathMatch[1];
    }

    // Modern "label" property
    const labelMatch = trimmed.match(/"label"\s+"([^"]+)"/i);
    if (labelMatch) {
      currentBlockLabel = labelMatch[1];
    }

    // Modern "apps" block start
    if (/"apps"/i.test(trimmed)) {
      inAppsBlock = true;
    }

    // Legacy schema: "1" "D:\\SteamLibrary" at depth 1
    if (depth === 1) {
      const legacyMatch = trimmed.match(/^"(\d+)"\s+"([^"]+)"/);
      if (legacyMatch && isLikelyPathString(legacyMatch[2])) {
        recordLibrary(legacyMatch[2]);
      }
    }

    if (closeCount > 0) {
      depth = Math.max(0, depth - closeCount);
      if (inAppsBlock && depth <= 2) {
        inAppsBlock = false;
      }
      if (depth <= 1 && currentBlockPath) {
        recordLibrary(
          currentBlockPath,
          currentBlockAppIds,
          currentBlockApps,
          currentBlockLabel
        );
        currentBlockPath = null;
        currentBlockLabel = undefined;
        currentBlockApps = {};
        currentBlockAppIds = [];
      }
    }
  }

  // Flush any lingering open block
  if (currentBlockPath) {
    recordLibrary(
      currentBlockPath,
      currentBlockAppIds,
      currentBlockApps,
      currentBlockLabel
    );
  }

  // Stage 2: Fallback regex if Stage 1 found nothing (e.g. malformed braces)
  if (results.length === 0) {
    const modernRegex = /"path"\s+"([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = modernRegex.exec(vdfContent)) !== null) {
      recordLibrary(match[1]);
    }

    const legacyRegex = /"(\d+)"\s+"([^"]+)"/g;
    while ((match = legacyRegex.exec(vdfContent)) !== null) {
      if (isLikelyPathString(match[2])) {
        recordLibrary(match[2]);
      }
    }
  }

  return results;
}

/**
 * Public parser returning unique normalized Steam library folder paths.
 */
export function parseSteamLibraryFolders(vdfContent: string): string[] {
  return parseSteamLibraryFoldersDetailed(vdfContent).map((lib) => lib.path);
}

/**
 * Resolves the installed game directory across Steam libraries.
 */
export function findSteamGameInstall(
  libraryFolders: (string | SteamLibraryFolder)[],
  game: SupportedGameDefinition,
  options?: {
    fileExists?: (path: string) => boolean;
  }
): string | null {
  if (!libraryFolders || libraryFolders.length === 0) return null;

  const normalizedLibs: SteamLibraryFolder[] = libraryFolders.map((item) => {
    if (typeof item === "string") {
      return { path: normalizePath(item), appIds: [] };
    }
    return {
      ...item,
      path: normalizePath(item.path),
      appIds: item.appIds || [],
    };
  });

  const installFolders = [
    game.defaultInstallDirName,
    ...(game.alternateInstallFolders || []),
  ];

  const strAppId = String(game.steamAppId);

  // 1. Check if detailed VDF matched this app ID directly to a library folder
  const matchedLib = normalizedLibs.find(
    (lib) =>
      lib.appIds.includes(strAppId) ||
      (lib.apps && Object.prototype.hasOwnProperty.call(lib.apps, strAppId))
  );

  if (matchedLib) {
    for (const folder of installFolders) {
      const candidate = joinPaths(matchedLib.path, "steamapps", "common", folder);
      if (options?.fileExists) {
        if (options.fileExists(candidate)) return candidate;
      } else {
        return candidate;
      }
    }
  }

  // 2. Probe with fileExists across all library folders in order
  if (options?.fileExists) {
    for (const lib of normalizedLibs) {
      for (const folder of installFolders) {
        const candidate = joinPaths(lib.path, "steamapps", "common", folder);
        if (options.fileExists(candidate)) {
          return candidate;
        }
      }
    }
  }

  // 3. Fallback candidate in primary library
  return joinPaths(
    normalizedLibs[0].path,
    "steamapps",
    "common",
    game.defaultInstallDirName
  );
}

// ============================================================================
// Windows Environment Path Resolution
// ============================================================================

/**
 * Resolves system directories for Windows, with full override support for hermetic testing.
 * Safe to execute in both Node.js and browser environments.
 */
export function getDefaultSystemPaths(
  overrides?: Partial<SystemPaths>
): SystemPaths {
  const isNode =
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env === "object";

  const env = isNode ? process.env : {};

  const userProfile =
    overrides?.userProfile ||
    env.USERPROFILE ||
    env.HOME ||
    "C:\\Users\\Default";

  const appData =
    overrides?.appData ||
    overrides?.appDataRoaming ||
    env.APPDATA ||
    joinPaths(userProfile, "AppData", "Roaming");

  const localAppData =
    overrides?.localAppData ||
    overrides?.appDataLocal ||
    env.LOCALAPPDATA ||
    joinPaths(userProfile, "AppData", "Local");

  const localLow =
    overrides?.localLow ||
    overrides?.appDataLocalLow ||
    joinPaths(userProfile, "AppData", "LocalLow");

  const savedGames =
    overrides?.savedGames ||
    joinPaths(userProfile, "Saved Games");

  const documents =
    overrides?.documents ||
    joinPaths(userProfile, "Documents");

  const programFilesX86 =
    overrides?.programFilesX86 ||
    env["ProgramFiles(x86)"] ||
    env.ProgramFiles ||
    "C:\\Program Files (x86)";

  const steamPath =
    overrides?.steamPath ||
    joinPaths(programFilesX86, "Steam");

  const steamLibraries = overrides?.steamLibraries
    ? overrides.steamLibraries.map(normalizePath)
    : [normalizePath(steamPath)];

  return {
    userProfile: normalizePath(userProfile),
    appData: normalizePath(appData),
    appDataRoaming: normalizePath(appData),
    localAppData: normalizePath(localAppData),
    appDataLocal: normalizePath(localAppData),
    localLow: normalizePath(localLow),
    appDataLocalLow: normalizePath(localLow),
    savedGames: normalizePath(savedGames),
    documents: normalizePath(documents),
    programFilesX86: normalizePath(programFilesX86),
    steamPath: normalizePath(steamPath),
    steamLibraries,
  };
}

// ============================================================================
// Lookup & Query Helpers
// ============================================================================

/**
 * Resolves a game identifier, alias, or Steam App ID to canonical SupportedGameId.
 */
export function normalizeGameId(
  gameIdOrAppId: string | number
): SupportedGameId | null {
  if (typeof gameIdOrAppId === "number") {
    return STEAM_APP_ID_TO_GAME_ID[gameIdOrAppId] || null;
  }
  if (!gameIdOrAppId || typeof gameIdOrAppId !== "string") {
    return null;
  }
  const clean = gameIdOrAppId.trim().toLowerCase();
  return GAME_ID_ALIASES[clean] || null;
}

/**
 * Returns all supported games.
 */
export function getSupportedGames(): SupportedGameDefinition[] {
  return [...SUPPORTED_GAMES];
}

/**
 * Retrieves the SupportedGameDefinition by canonical ID, alias, or Steam App ID.
 */
export function getSupportedGame(
  gameIdOrAppId: string | number
): SupportedGameDefinition | undefined {
  const canonicalId = normalizeGameId(gameIdOrAppId);
  if (!canonicalId) return undefined;
  return SUPPORTED_GAME_MAP.get(canonicalId);
}

/**
 * Checks if a game identifier or Steam App ID is supported.
 */
export function isSupportedGame(gameIdOrAppId: string | number): boolean {
  return normalizeGameId(gameIdOrAppId) !== null;
}

/**
 * Returns all categories supported by the specified game.
 */
export function getGameCategories(
  gameIdOrAppId: string | number
): GameCategoryDefinition[] {
  const game = getSupportedGame(gameIdOrAppId);
  return game ? [...game.categories] : [];
}

/**
 * Retrieves a specific category definition for a game.
 */
export function getGameCategory(
  gameIdOrAppId: string | number,
  categoryId: string
): GameCategoryDefinition | undefined {
  const categories = getGameCategories(gameIdOrAppId);
  return categories.find((c) => c.id === categoryId);
}

/**
 * Validates whether a category is supported for a specific game.
 */
export function validateCategoryForGame(
  gameIdOrAppId: string | number,
  categoryId: string
): boolean {
  const category = getGameCategory(gameIdOrAppId, categoryId);
  return category !== undefined;
}

/**
 * Generates the default category toggles map (all categories true by default).
 */
export function getDefaultCategoryToggles(
  gameIdOrAppId: string | number
): Record<string, boolean> {
  const categories = getGameCategories(gameIdOrAppId);
  const toggles: Record<string, boolean> = {};
  for (const cat of categories) {
    toggles[cat.id] = cat.defaultEnabled;
  }
  return toggles;
}

/**
 * Maps a GameDataCategory to the default custom_paths property key in GameSyncConfigRecord.
 */
export function getCustomPathKeyForCategory(
  category: GameDataCategory
): "save_path" | "mods_path" | "config_path" | "install_path" {
  switch (category) {
    case "saves":
    case "ideologies":
    case "xenotypes":
    case "submarines":
    case "data":
      return "save_path";
    case "custom_mods":
      return "mods_path";
    case "mod_lists":
      return "config_path";
    default:
      return "save_path";
  }
}

/**
 * Creates a default GameSyncConfigRecord with all categories enabled.
 */
export function createDefaultGameSyncConfig(
  gameId: SupportedGameId | string,
  userId: string
): GameSyncConfigRecord {
  const canonical = normalizeGameId(gameId);
  const game = canonical ? getSupportedGame(canonical) : undefined;
  if (!game) {
    throw new Error(`Unknown supported game ID: "${gameId}"`);
  }

  const categories: Record<string, boolean> = {};
  for (const cat of game.categories) {
    categories[cat.id] = cat.defaultEnabled;
  }

  const now = new Date().toISOString();
  return {
    id: game.id,
    user_id: userId,
    game_id: game.id,
    enabled: true,
    categories,
    custom_paths: {},
    sync_status: "idle",
    last_synced_at: null,
    created_at: now,
    updated_at: now,
  };
}

// ============================================================================
// 3-Tier Custom Path Override Hierarchy Resolution
// ============================================================================

export interface ResolveCategoryPathOptions {
  config?: GameSyncConfigRecord | null;
  detectedInstallPath?: string;
  env?: Partial<SystemPaths>;
  systemPaths?: Partial<SystemPaths>;
  preferInstallDirectory?: boolean;
}

/**
 * Resolves the effective operating path for a game data category following the 3-tier hierarchy:
 * - Level 1: Explicit user custom path override (`custom_paths[category]`, `custom_paths.save_path`, etc.)
 * - Level 2: Detected game installation directory (`detectedInstallPath` + relative path)
 * - Level 3: Known standard default system directory (AppData LocalLow, Local, Roaming, Saved Games, Steam common)
 */
export function resolveCategoryPath(
  gameIdOrAppId: string | number,
  categoryId: string,
  config?: GameSyncConfigRecord | null,
  optionsOrEnv?: Partial<SystemPaths> | ResolveCategoryPathOptions,
  maybeOptions?: ResolveCategoryPathOptions
): ResolvedPathInfo {
  const game = getSupportedGame(gameIdOrAppId);
  if (!game) {
    throw new Error(`Unknown supported game ID: "${gameIdOrAppId}"`);
  }

  const categoryDef = game.categories.find((c) => c.id === categoryId);
  if (!categoryDef) {
    throw new Error(
      `Category "${categoryId}" is not supported for game "${game.id}". Valid categories: [${game.categories.map((c) => c.id).join(", ")}]`
    );
  }

  // Parse polymorphic options / env
  let envOverrides: Partial<SystemPaths> | undefined;
  let options: ResolveCategoryPathOptions | undefined;

  if (optionsOrEnv) {
    if (
      "userProfile" in optionsOrEnv ||
      "appData" in optionsOrEnv ||
      "appDataRoaming" in optionsOrEnv ||
      "localAppData" in optionsOrEnv ||
      "appDataLocal" in optionsOrEnv ||
      "localLow" in optionsOrEnv ||
      "appDataLocalLow" in optionsOrEnv ||
      "savedGames" in optionsOrEnv
    ) {
      envOverrides = optionsOrEnv as Partial<SystemPaths>;
      options = maybeOptions;
    } else {
      options = optionsOrEnv as ResolveCategoryPathOptions;
      envOverrides = options.env || options.systemPaths;
    }
  }

  const activeConfig = config ?? options?.config ?? null;
  const sysPaths = getDefaultSystemPaths(envOverrides);
  const detectedInstall =
    options?.detectedInstallPath &&
    validateCustomPath(options.detectedInstallPath).valid
      ? normalizePath(options.detectedInstallPath)
      : undefined;

  // -------------------------------------------------------------------------
  // LEVEL 1: Explicit User Custom Path Override
  // -------------------------------------------------------------------------
  const customPaths = activeConfig?.custom_paths;
  if (customPaths) {
    // 1a. Category-specific override (e.g. custom_paths.ideologies or custom_paths.saves)
    const specificCustom = customPaths[categoryId];
    if (specificCustom && specificCustom.trim().length > 0) {
      const val = validateCustomPath(specificCustom);
      if (val.valid) {
        const normalized = normalizePath(specificCustom);
        return {
          gameId: game.id,
          category: categoryDef,
          categoryId: categoryDef.id,
          path: normalized,
          source: "user_override",
          isCustom: true,
          baseDirectory: normalized,
        };
      }
    }

    // 1b. Generic category customPathKey override (e.g. custom_paths.save_path)
    const genericKey = categoryDef.customPathKey;
    const genericCustom = customPaths[genericKey];
    if (genericCustom && genericCustom.trim().length > 0) {
      const val = validateCustomPath(genericCustom);
      if (val.valid) {
        const normalized = normalizePath(genericCustom);
        return {
          gameId: game.id,
          category: categoryDef,
          categoryId: categoryDef.id,
          path: normalized,
          source: "user_override",
          isCustom: true,
          baseDirectory: normalized,
        };
      }
    }

    // 1c. Custom install_path override for game_install categories
    if (categoryDef.pathType === "game_install" && customPaths.install_path) {
      const installVal = validateCustomPath(customPaths.install_path);
      if (installVal.valid) {
        const normalizedInstall = normalizePath(customPaths.install_path);
        const fullPath = joinPaths(normalizedInstall, categoryDef.relativePath);
        return {
          gameId: game.id,
          category: categoryDef,
          categoryId: categoryDef.id,
          path: fullPath,
          source: "user_install_dir",
          isCustom: true,
          baseDirectory: normalizedInstall,
          relativePath: categoryDef.relativePath,
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // LEVEL 2: Detected Game Installation Directory
  // -------------------------------------------------------------------------
  if (detectedInstall) {
    if (categoryDef.pathType === "game_install") {
      const fullPath = joinPaths(detectedInstall, categoryDef.relativePath);
      return {
        gameId: game.id,
        category: categoryDef,
        categoryId: categoryDef.id,
        path: fullPath,
        source: "detected_install",
        isCustom: false,
        baseDirectory: detectedInstall,
        relativePath: categoryDef.relativePath,
      };
    }

    // If preferInstallDirectory is set and game category has an install fallback
    if (options?.preferInstallDirectory) {
      const installFallback = categoryDef.fallbackPaths?.find(
        (f) => f.pathType === "game_install"
      );
      if (installFallback) {
        const fullPath = joinPaths(detectedInstall, installFallback.relativePath);
        return {
          gameId: game.id,
          category: categoryDef,
          categoryId: categoryDef.id,
          path: fullPath,
          source: "detected_install",
          isCustom: false,
          baseDirectory: detectedInstall,
          relativePath: installFallback.relativePath,
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // LEVEL 3: Known Standard Default System Directory
  // -------------------------------------------------------------------------
  let baseDir: string;
  switch (categoryDef.pathType) {
    case "appdata_locallow":
      baseDir = sysPaths.localLow;
      break;
    case "appdata_local":
      baseDir = sysPaths.localAppData;
      break;
    case "appdata_roaming":
      baseDir = sysPaths.appData;
      break;
    case "saved_games":
      baseDir = sysPaths.savedGames;
      break;
    case "game_install":
      baseDir = joinPaths(
        sysPaths.steamPath,
        "steamapps",
        "common",
        game.defaultInstallDirName
      );
      break;
    default:
      baseDir = sysPaths.localLow;
  }

  const resolvedPath = joinPaths(baseDir, categoryDef.relativePath);

  // Compute fallback path if defined
  let fallbackPath: string | undefined;
  if (categoryDef.fallbackPaths && categoryDef.fallbackPaths.length > 0) {
    const primaryFallback = categoryDef.fallbackPaths[0];
    let fallbackBaseDir = baseDir;
    switch (primaryFallback.pathType) {
      case "appdata_locallow":
        fallbackBaseDir = sysPaths.localLow;
        break;
      case "appdata_local":
        fallbackBaseDir = sysPaths.localAppData;
        break;
      case "appdata_roaming":
        fallbackBaseDir = sysPaths.appData;
        break;
      case "saved_games":
        fallbackBaseDir = sysPaths.savedGames;
        break;
      case "game_install":
        fallbackBaseDir = joinPaths(
          sysPaths.steamPath,
          "steamapps",
          "common",
          game.defaultInstallDirName
        );
        break;
    }
    fallbackPath = joinPaths(fallbackBaseDir, primaryFallback.relativePath);
  }

  return {
    gameId: game.id,
    category: categoryDef,
    categoryId: categoryDef.id,
    path: resolvedPath,
    source: "default_system",
    isCustom: false,
    baseDirectory: baseDir,
    relativePath: categoryDef.relativePath,
    fallbackPath,
  };
}

/**
 * Resolves standard default paths for all categories of a game.
 */
export function resolveStandardGamePaths(
  gameIdOrAppId: string | number,
  env?: Partial<SystemPaths>
): Record<string, ResolvedPathInfo> {
  const game = getSupportedGame(gameIdOrAppId);
  if (!game) return {};

  const results: Record<string, ResolvedPathInfo> = {};
  for (const cat of game.categories) {
    results[cat.id] = resolveCategoryPath(game.id, cat.id, null, env);
  }
  return results;
}

/**
 * Resolves effective paths for all categories of a game with user config and detected install.
 */
export function resolveEffectiveCategoryPaths(
  gameIdOrAppId: string | number,
  config?: GameSyncConfigRecord | null,
  options?: ResolveCategoryPathOptions
): Record<string, ResolvedPathInfo> {
  const game = getSupportedGame(gameIdOrAppId);
  if (!game) return {};

  const results: Record<string, ResolvedPathInfo> = {};
  for (const cat of game.categories) {
    results[cat.id] = resolveCategoryPath(game.id, cat.id, config, options);
  }
  return results;
}
