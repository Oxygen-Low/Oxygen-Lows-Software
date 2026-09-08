/**
 * @file client/lib/supportedGames.test.ts
 * @description Comprehensive unit test suite for Supported Games Directory,
 * Category Metadata, Steam VDF Parsing, and Path Resolution Engine.
 *
 * Covers all 6 test domains from explorer_games_m2_3 and tests real implementations.
 */

import { describe, it, expect } from "vitest";
import {
  SUPPORTED_GAMES,
  SUPPORTED_GAME_MAP,
  GAME_ID_ALIASES,
  STEAM_APP_ID_TO_GAME_ID,
  TOTAL_SUPPORTED_GAMES_COUNT,
  TOTAL_CATEGORIES_COUNT,
  normalizeGameId,
  getSupportedGame,
  getSupportedGames,
  isSupportedGame,
  getGameCategories,
  getGameCategory,
  validateCategoryForGame,
  getDefaultCategoryToggles,
  getCustomPathKeyForCategory,
  createDefaultGameSyncConfig,
  normalizePath,
  joinPaths,
  validateCustomPath,
  parseSteamLibraryFolders,
  parseSteamLibraryFoldersDetailed,
  findSteamGameInstall,
  getDefaultSystemPaths,
  resolveCategoryPath,
  resolveStandardGamePaths,
  resolveEffectiveCategoryPaths,
  type SupportedGameId,
  type SupportedGameDefinition,
  type GameCategoryDefinition,
  type PathType,
  type PackagingMode,
  type SystemPaths,
  type ResolvedPathInfo,
} from "./supportedGames";

import {
  VALID_GAME_DATA_CATEGORIES,
  type GameDataCategory,
  type GameSyncConfigRecord,
  type GameSnapshotRecord,
} from "../../server/lib/dataStore";

// Standard mock Windows environment fixture
const MOCK_WINDOWS_ENV: SystemPaths = {
  userProfile: "C:\\Users\\TestGamer",
  appData: "C:\\Users\\TestGamer\\AppData\\Roaming",
  appDataRoaming: "C:\\Users\\TestGamer\\AppData\\Roaming",
  localAppData: "C:\\Users\\TestGamer\\AppData\\Local",
  appDataLocal: "C:\\Users\\TestGamer\\AppData\\Local",
  localLow: "C:\\Users\\TestGamer\\AppData\\LocalLow",
  appDataLocalLow: "C:\\Users\\TestGamer\\AppData\\LocalLow",
  savedGames: "C:\\Users\\TestGamer\\Saved Games",
  documents: "C:\\Users\\TestGamer\\Documents",
  programFilesX86: "C:\\Program Files (x86)",
  steamPath: "C:\\Program Files (x86)\\Steam",
  steamLibraries: [
    "C:\\Program Files (x86)\\Steam",
    "D:\\SteamLibrary",
    "E:\\Games\\Steam",
  ],
};

// ============================================================================
// 1. Schema Completeness, Category Uniqueness & Type Validity
// ============================================================================
describe("supportedGames - Schema Completeness & Catalog Integrity", () => {
  it("should contain exactly 8 recognized games", () => {
    expect(SUPPORTED_GAMES).toHaveLength(TOTAL_SUPPORTED_GAMES_COUNT);
    expect(SUPPORTED_GAMES).toHaveLength(8);
    expect(getSupportedGames()).toHaveLength(8);
  });

  it("should contain all 8 required canonical game IDs", () => {
    const canonicalIds: SupportedGameId[] = [
      "rain_world",
      "rimworld",
      "library_of_ruina",
      "lobotomy_corporation",
      "ostranauts",
      "barotrauma",
      "kenshi",
      "space_haven",
    ];

    const presentIds = SUPPORTED_GAMES.map((g) => g.id);
    for (const expectedId of canonicalIds) {
      expect(presentIds).toContain(expectedId);
    }
  });

  it("should enforce uniqueness among all game IDs and Steam App IDs", () => {
    const ids = SUPPORTED_GAMES.map((g) => g.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    const appIds = SUPPORTED_GAMES.map((g) => g.steamAppId);
    const uniqueAppIds = new Set(appIds);
    expect(uniqueAppIds.size).toBe(appIds.length);
  });

  it("should define valid metadata fields for every game definition", () => {
    for (const game of SUPPORTED_GAMES) {
      expect(game.id).toBeTruthy();
      expect(typeof game.id).toBe("string");
      expect(game.name).toBeTruthy();
      expect(typeof game.name).toBe("string");
      expect(game.steamAppId).toBeGreaterThan(0);
      expect(Array.isArray(game.defaultExecutableNames)).toBe(true);
      expect(game.defaultExecutableNames.length).toBeGreaterThan(0);
      expect(game.defaultInstallDirName).toBeTruthy();
      expect(Array.isArray(game.categories)).toBe(true);
      expect(game.categories.length).toBeGreaterThan(0);
    }
  });

  it("should contain exactly 18 total categories across all 8 games", () => {
    const totalCategories = SUPPORTED_GAMES.reduce(
      (sum, g) => sum + g.categories.length,
      0
    );
    expect(totalCategories).toBe(TOTAL_CATEGORIES_COUNT);
    expect(totalCategories).toBe(18);
  });

  it("should have exact expected category counts per game", () => {
    const expectedCounts: Record<SupportedGameId, number> = {
      rain_world: 3,
      rimworld: 5,
      library_of_ruina: 1,
      lobotomy_corporation: 1,
      ostranauts: 1,
      barotrauma: 4,
      kenshi: 2,
      space_haven: 1,
    };

    for (const [gameId, expectedCount] of Object.entries(expectedCounts)) {
      const game = getSupportedGame(gameId);
      expect(game).toBeDefined();
      expect(game?.categories).toHaveLength(expectedCount);
    }
  });

  it("should enforce category uniqueness within each game", () => {
    for (const game of SUPPORTED_GAMES) {
      const catIds = game.categories.map((c) => c.id);
      const uniqueCatIds = new Set(catIds);
      expect(uniqueCatIds.size).toBe(catIds.length);
    }
  });

  it("should ensure every category ID matches valid GameDataCategory from server/lib/dataStore.ts", () => {
    for (const game of SUPPORTED_GAMES) {
      for (const cat of game.categories) {
        expect(VALID_GAME_DATA_CATEGORIES).toContain(cat.id);
      }
    }
  });

  it("should ensure every category definition has valid properties and defaultEnabled = true", () => {
    const validPathTypes: PathType[] = [
      "appdata_locallow",
      "appdata_local",
      "appdata_roaming",
      "saved_games",
      "game_install",
    ];

    const validPackagingModes: PackagingMode[] = [
      "file",
      "directory",
      "zip_bundle",
    ];

    for (const game of SUPPORTED_GAMES) {
      for (const cat of game.categories) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.description).toBeTruthy();
        expect(cat.defaultEnabled).toBe(true);
        expect(validPathTypes).toContain(cat.pathType);
        expect(cat.relativePath).toBeTruthy();
        expect(Array.isArray(cat.filePatterns)).toBe(true);
        expect(cat.filePatterns.length).toBeGreaterThan(0);
        expect(validPackagingModes).toContain(cat.packagingMode);
        expect(["save_path", "mods_path", "config_path", "install_path"]).toContain(
          cat.customPathKey
        );
      }
    }
  });

  it("should correctly identify mod_lists and custom_mods flags", () => {
    const rimworld = getSupportedGame("rimworld")!;
    const rwModList = rimworld.categories.find((c) => c.id === "mod_lists");
    const rwCustomMod = rimworld.categories.find((c) => c.id === "custom_mods");
    const rwSaves = rimworld.categories.find((c) => c.id === "saves");

    expect(rwModList?.isModList).toBe(true);
    expect(rwCustomMod?.isCustomMod).toBe(true);
    expect(rwSaves?.isModList).toBeFalsy();
    expect(rwSaves?.isCustomMod).toBeFalsy();
  });
});

// ============================================================================
// 2. Exact Category Breakdown Matrix
// ============================================================================
describe("supportedGames - Per-Game Category Matrix Verification", () => {
  it("Rain World: data, custom_mods, mod_lists", () => {
    const game = getSupportedGame("rain_world")!;
    const ids = game.categories.map((c) => c.id);
    expect(ids).toEqual(["data", "custom_mods", "mod_lists"]);

    const dataCat = game.categories.find((c) => c.id === "data")!;
    expect(dataCat.pathType).toBe("appdata_locallow");
    expect(dataCat.relativePath).toBe("Videocult/Rain World");

    const customModCat = game.categories.find((c) => c.id === "custom_mods")!;
    expect(customModCat.pathType).toBe("game_install");
    expect(customModCat.relativePath).toBe("RainWorld_Data/StreamingAssets/mods");
    expect(customModCat.excludePatterns).toContain("moreslugcats");

    const modListCat = game.categories.find((c) => c.id === "mod_lists")!;
    expect(modListCat.pathType).toBe("appdata_locallow");
  });

  it("RimWorld: saves, custom_mods, ideologies, xenotypes, mod_lists", () => {
    const game = getSupportedGame("rimworld")!;
    const ids = game.categories.map((c) => c.id);
    expect(ids).toEqual(["saves", "custom_mods", "ideologies", "xenotypes", "mod_lists"]);

    const saves = game.categories.find((c) => c.id === "saves")!;
    expect(saves.pathType).toBe("appdata_locallow");
    expect(saves.filePatterns).toContain("*.rws");

    const customMods = game.categories.find((c) => c.id === "custom_mods")!;
    expect(customMods.pathType).toBe("game_install");
    expect(customMods.relativePath).toBe("Mods");
    expect(customMods.excludePatterns).toContain("Core");
    expect(customMods.excludePatterns).toContain("Biotech");

    const ideologies = game.categories.find((c) => c.id === "ideologies")!;
    expect(ideologies.filePatterns).toContain("*.rwi");

    const xenotypes = game.categories.find((c) => c.id === "xenotypes")!;
    expect(xenotypes.filePatterns).toContain("*.rwx");

    const modLists = game.categories.find((c) => c.id === "mod_lists")!;
    expect(modLists.filePatterns).toContain("ModsConfig.xml");
  });

  it("Library Of Ruina: data", () => {
    const game = getSupportedGame("library_of_ruina")!;
    expect(game.categories.map((c) => c.id)).toEqual(["data"]);
    const dataCat = game.categories[0];
    expect(dataCat.pathType).toBe("appdata_locallow");
    expect(dataCat.relativePath).toBe("Project_Moon/LibraryOfRuina");
  });

  it("Lobotomy Corporation: data", () => {
    const game = getSupportedGame("lobotomy_corporation")!;
    expect(game.categories.map((c) => c.id)).toEqual(["data"]);
    const dataCat = game.categories[0];
    expect(dataCat.pathType).toBe("appdata_locallow");
    expect(dataCat.relativePath).toBe("Project_Moon/Lobotomy");
  });

  it("Ostranauts: saves with install dir fallback", () => {
    const game = getSupportedGame("ostranauts")!;
    expect(game.categories.map((c) => c.id)).toEqual(["saves"]);
    const savesCat = game.categories[0];
    expect(savesCat.pathType).toBe("appdata_locallow");
    expect(savesCat.relativePath).toBe("Blue Bottle Games/Ostranauts/saves");
    expect(savesCat.fallbackPaths).toBeDefined();
    expect(savesCat.fallbackPaths?.some((f) => f.pathType === "game_install")).toBe(true);
  });

  it("Barotrauma: submarines, saves, custom_mods, mod_lists", () => {
    const game = getSupportedGame("barotrauma")!;
    expect(game.categories.map((c) => c.id)).toEqual([
      "submarines",
      "saves",
      "custom_mods",
      "mod_lists",
    ]);

    const subs = game.categories.find((c) => c.id === "submarines")!;
    expect(subs.pathType).toBe("appdata_local");
    expect(subs.filePatterns).toContain("*.sub");

    const saves = game.categories.find((c) => c.id === "saves")!;
    expect(saves.pathType).toBe("appdata_local");
    expect(saves.filePatterns).toContain("*.save");

    const mods = game.categories.find((c) => c.id === "custom_mods")!;
    expect(mods.pathType).toBe("appdata_local");

    const modLists = game.categories.find((c) => c.id === "mod_lists")!;
    expect(modLists.filePatterns).toContain("config_player.xml");
  });

  it("Kenshi: saves, mod_lists", () => {
    const game = getSupportedGame("kenshi")!;
    expect(game.categories.map((c) => c.id)).toEqual(["saves", "mod_lists"]);

    const saves = game.categories.find((c) => c.id === "saves")!;
    expect(saves.pathType).toBe("appdata_local");
    expect(saves.relativePath).toBe("kenshi/save");

    const modLists = game.categories.find((c) => c.id === "mod_lists")!;
    expect(modLists.pathType).toBe("game_install");
    expect(modLists.relativePath).toBe("data");
    expect(modLists.filePatterns).toContain("mods.cfg");
  });

  it("Space Haven: saves with roaming fallback", () => {
    const game = getSupportedGame("space_haven")!;
    expect(game.categories.map((c) => c.id)).toEqual(["saves"]);
    const saves = game.categories[0];
    expect(saves.pathType).toBe("game_install");
    expect(saves.relativePath).toBe("savegames");
    expect(saves.fallbackPaths?.some((f) => f.pathType === "appdata_roaming")).toBe(true);
  });
});

// ============================================================================
// 3. Game Identifier Normalization & Lookup Helpers
// ============================================================================
describe("supportedGames - Identifier Resolution & Lookups", () => {
  it("should normalize string game IDs, aliases, and Steam App IDs", () => {
    // Exact canonical
    expect(normalizeGameId("rain_world")).toBe("rain_world");
    expect(normalizeGameId("rimworld")).toBe("rimworld");

    // Case insensitivity & whitespace trimming
    expect(normalizeGameId("  Rain_World  ")).toBe("rain_world");
    expect(normalizeGameId("RIMWORLD")).toBe("rimworld");
    expect(normalizeGameId("Kenshi")).toBe("kenshi");

    // Common aliases
    expect(normalizeGameId("rainworld")).toBe("rain_world");
    expect(normalizeGameId("lobotomy_corp")).toBe("lobotomy_corporation");
    expect(normalizeGameId("lobotomycorp")).toBe("lobotomy_corporation");
    expect(normalizeGameId("libraryofruina")).toBe("library_of_ruina");
    expect(normalizeGameId("spacehaven")).toBe("space_haven");

    // Numeric and string Steam App IDs
    expect(normalizeGameId(674440)).toBe("rain_world");
    expect(normalizeGameId("674440")).toBe("rain_world");
    expect(normalizeGameId(294100)).toBe("rimworld");
    expect(normalizeGameId("294100")).toBe("rimworld");
    expect(normalizeGameId(602960)).toBe("barotrauma");
  });

  it("should return null for unrecognized game IDs or invalid App IDs", () => {
    expect(normalizeGameId("half_life_3")).toBeNull();
    expect(normalizeGameId("portal_2")).toBeNull();
    expect(normalizeGameId(999999999)).toBeNull();
    expect(normalizeGameId("")).toBeNull();
    expect(normalizeGameId("   ")).toBeNull();
  });

  it("should look up games via getSupportedGame() and isSupportedGame()", () => {
    const rimworld = getSupportedGame("rimworld");
    expect(rimworld).toBeDefined();
    expect(rimworld?.name).toBe("RimWorld");
    expect(isSupportedGame("rimworld")).toBe(true);

    const baroByAppId = getSupportedGame(602960);
    expect(baroByAppId).toBeDefined();
    expect(baroByAppId?.id).toBe("barotrauma");
    expect(isSupportedGame(602960)).toBe(true);

    expect(getSupportedGame("invalid_game")).toBeUndefined();
    expect(isSupportedGame("invalid_game")).toBe(false);
  });

  it("should validate category existence via validateCategoryForGame() and getGameCategory()", () => {
    expect(validateCategoryForGame("rimworld", "saves")).toBe(true);
    expect(validateCategoryForGame("rimworld", "ideologies")).toBe(true);
    expect(validateCategoryForGame("rimworld", "submarines")).toBe(false);

    expect(validateCategoryForGame("barotrauma", "submarines")).toBe(true);
    expect(validateCategoryForGame("barotrauma", "xenotypes")).toBe(false);

    expect(validateCategoryForGame("space_haven", "saves")).toBe(true);
    expect(validateCategoryForGame("space_haven", "custom_mods")).toBe(false);

    expect(validateCategoryForGame("invalid_game", "saves")).toBe(false);

    const cat = getGameCategory("rain_world", "custom_mods");
    expect(cat).toBeDefined();
    expect(cat?.id).toBe("custom_mods");
  });

  it("should initialize default toggles to true for all supported categories", () => {
    const toggles = getDefaultCategoryToggles("rimworld");
    expect(toggles).toEqual({
      saves: true,
      custom_mods: true,
      ideologies: true,
      xenotypes: true,
      mod_lists: true,
    });
  });

  it("should map categories to proper customPathKey in GameSyncConfigRecord", () => {
    expect(getCustomPathKeyForCategory("saves")).toBe("save_path");
    expect(getCustomPathKeyForCategory("ideologies")).toBe("save_path");
    expect(getCustomPathKeyForCategory("xenotypes")).toBe("save_path");
    expect(getCustomPathKeyForCategory("submarines")).toBe("save_path");
    expect(getCustomPathKeyForCategory("data")).toBe("save_path");
    expect(getCustomPathKeyForCategory("custom_mods")).toBe("mods_path");
    expect(getCustomPathKeyForCategory("mod_lists")).toBe("config_path");
  });
});

// ============================================================================
// 4. Steam libraryfolders.vdf Parsing Tests
// ============================================================================
describe("supportedGames - Steam libraryfolders.vdf Parsing", () => {
  it("should parse single modern Steam library folder", () => {
    const singleVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
    "label"   ""
    "contentid"   "12345678"
    "total_size"    "500000000000"
    "apps"
    {
      "228980"    "1500000"
      "294100"    "350000000"
    }
  }
}`;
    const result = parseSteamLibraryFolders(singleVdf);
    expect(result).toEqual(["C:\\Program Files (x86)\\Steam"]);

    const detailed = parseSteamLibraryFoldersDetailed(singleVdf);
    expect(detailed).toHaveLength(1);
    expect(detailed[0].path).toBe("C:\\Program Files (x86)\\Steam");
    expect(detailed[0].appIds).toContain("294100");
  });

  it("should parse multi-drive modern Steam libraries across C, D, E", () => {
    const multiVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
    "apps" { "228980" "100" }
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary"
    "apps" { "294100" "200" "674440" "300" }
  }
  "2"
  {
    "path"    "E:\\\\Games\\\\Steam"
    "apps" { "602960" "400" }
  }
}`;
    const result = parseSteamLibraryFolders(multiVdf);
    expect(result).toHaveLength(3);
    expect(result).toContain("C:\\Program Files (x86)\\Steam");
    expect(result).toContain("D:\\SteamLibrary");
    expect(result).toContain("E:\\Games\\Steam");
  });

  it("should parse legacy Steam v1 format with numeric keys", () => {
    const legacyVdf = `
"LibraryFolders"
{
  "TimeNextStatsReport"   "1600000000"
  "ContentStatsID"    "123456789"
  "1"   "D:\\\\SteamLibrary"
  "2"   "E:\\\\Games\\\\Steam"
}`;
    const result = parseSteamLibraryFolders(legacyVdf);
    expect(result).toHaveLength(2);
    expect(result).toContain("D:\\SteamLibrary");
    expect(result).toContain("E:\\Games\\Steam");
    // Should NOT treat timestamp / content id as path
    expect(result).not.toContain("1600000000");
    expect(result).not.toContain("123456789");
  });

  it("should handle forward slashes and unescaped path separators", () => {
    const mixedVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:/Program Files (x86)/Steam"
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary\\\\"
  }
}`;
    const result = parseSteamLibraryFolders(mixedVdf);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toBe("C:\\Program Files (x86)\\Steam");
    expect(result[1]).toBe("D:\\SteamLibrary");
  });

  it("should gracefully handle empty or whitespace VDF content", () => {
    expect(parseSteamLibraryFolders("")).toEqual([]);
    expect(parseSteamLibraryFolders("   \n\t  ")).toEqual([]);
  });

  it("should handle corrupted, truncated, or non-VDF text without crashing", () => {
    expect(parseSteamLibraryFolders("not a vdf file at all")).toEqual([]);
    expect(parseSteamLibraryFolders("<html><body>404 Not Found</body></html>")).toEqual([]);
    expect(parseSteamLibraryFolders("{ 'json': true }")).toEqual([]);
    expect(parseSteamLibraryFolders('"libraryfolders" { "0" { "path" ')).toEqual([]);
  });

  it("should handle Unicode and international directory paths", () => {
    const unicodeVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "D:\\\\Игры\\\\SteamLibrary"
  }
  "1"
  {
    "path"    "C:\\\\Juegos\\\\Steam"
  }
}`;
    const result = parseSteamLibraryFolders(unicodeVdf);
    expect(result).toContain("D:\\Игры\\SteamLibrary");
    expect(result).toContain("C:\\Juegos\\Steam");
  });

  it("should locate installed Steam games using findSteamGameInstall", () => {
    const rainWorld = getSupportedGame("rain_world")!;
    const libs = [
      {
        path: "C:\\Program Files (x86)\\Steam",
        appIds: ["228980"],
      },
      {
        path: "D:\\SteamLibrary",
        appIds: ["674440"],
      },
    ];

    // Priority 1: VDF AppId matching
    const found = findSteamGameInstall(libs, rainWorld);
    expect(found).toBe("D:\\SteamLibrary\\steamapps\\common\\Rain World");

    // Priority 2: fileExists probe
    const fileProbeLibs = ["C:\\Program Files (x86)\\Steam", "E:\\Games\\Steam"];
    const foundByProbe = findSteamGameInstall(fileProbeLibs, rainWorld, {
      fileExists: (p) => p.startsWith("E:\\Games\\Steam"),
    });
    expect(foundByProbe).toBe("E:\\Games\\Steam\\steamapps\\common\\Rain World");

    // Empty libs -> null
    expect(findSteamGameInstall([], rainWorld)).toBeNull();
  });
});

// ============================================================================
// 5. Path Resolution Across Simulated Windows Environments
// ============================================================================
describe("supportedGames - Path Resolution Across Windows Environments", () => {
  it("should resolve Rain World data to LocalLow", () => {
    const res = resolveCategoryPath("rain_world", "data", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(res).not.toBeNull();
    expect(res.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\LocalLow\\Videocult\\Rain World"
    );
    expect(res.source).toBe("default_system");
  });

  it("should resolve Rain World custom_mods relative to detected install path", () => {
    const res = resolveCategoryPath("rain_world", "custom_mods", null, {
      detectedInstallPath: "D:\\SteamLibrary\\steamapps\\common\\Rain World",
      env: MOCK_WINDOWS_ENV,
    });
    expect(res).not.toBeNull();
    expect(res.path).toBe(
      "D:\\SteamLibrary\\steamapps\\common\\Rain World\\RainWorld_Data\\StreamingAssets\\mods"
    );
    expect(res.source).toBe("detected_install");
  });

  it("should resolve RimWorld saves to LocalLow Saves directory", () => {
    const res = resolveCategoryPath("rimworld", "saves", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(res.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Saves"
    );
  });

  it("should resolve RimWorld ideologies and xenotypes to LocalLow subfolders", () => {
    const ideo = resolveCategoryPath("rimworld", "ideologies", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(ideo.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Ideologies"
    );

    const xeno = resolveCategoryPath("rimworld", "xenotypes", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(xeno.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Xenotypes"
    );
  });

  it("should resolve RimWorld mod_lists to LocalLow Config directory", () => {
    const res = resolveCategoryPath("rimworld", "mod_lists", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(res.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config"
    );
  });

  it("should resolve Barotrauma submarines, saves, and custom mods to LocalAppData", () => {
    const subs = resolveCategoryPath("barotrauma", "submarines", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(subs.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\Local\\Daedalic Entertainment GmbH\\Barotrauma\\Submarines"
    );

    const saves = resolveCategoryPath("barotrauma", "saves", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(saves.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\Local\\Daedalic Entertainment GmbH\\Barotrauma\\Multiplayer"
    );

    const mods = resolveCategoryPath("barotrauma", "custom_mods", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(mods.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\Local\\Daedalic Entertainment GmbH\\Barotrauma\\Mods"
    );
  });

  it("should resolve Kenshi saves to LocalAppData kenshi\\save", () => {
    const res = resolveCategoryPath("kenshi", "saves", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(res.path).toBe("C:\\Users\\TestGamer\\AppData\\Local\\kenshi\\save");
  });

  it("should resolve Space Haven saves relative to install path when detected", () => {
    const res = resolveCategoryPath("space_haven", "saves", null, {
      detectedInstallPath: "E:\\Games\\Space Haven",
      env: MOCK_WINDOWS_ENV,
    });
    expect(res.path).toBe("E:\\Games\\Space Haven\\savegames");
    expect(res.source).toBe("detected_install");
  });

  it("should batch resolve standard game paths across all categories", () => {
    const standardPaths = resolveStandardGamePaths("rimworld", MOCK_WINDOWS_ENV);
    expect(Object.keys(standardPaths)).toHaveLength(5);
    expect(standardPaths.saves.path).toContain("Saves");
    expect(standardPaths.custom_mods.path).toContain("Mods");
  });
});

// ============================================================================
// 6. Custom Path Override Hierarchy Tests (Level 1 > Level 2 > Level 3)
// ============================================================================
describe("supportedGames - Override Hierarchy Verification", () => {
  it("Level 1 (User Override) wins over Level 2 (Detected) and Level 3 (Default)", () => {
    const config: GameSyncConfigRecord = {
      id: "rimworld",
      user_id: "user1",
      game_id: "rimworld",
      enabled: true,
      categories: { saves: true },
      custom_paths: {
        save_path: "Z:\\CustomRimWorldSaves",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = resolveCategoryPath("rimworld", "saves", config, {
      detectedInstallPath: "D:\\SteamLibrary\\steamapps\\common\\RimWorld",
      env: MOCK_WINDOWS_ENV,
    });

    expect(res.path).toBe("Z:\\CustomRimWorldSaves");
    expect(res.source).toBe("user_override");
    expect(res.isCustom).toBe(true);
  });

  it("Category-specific override takes precedence over generic save_path override", () => {
    const config: GameSyncConfigRecord = {
      id: "rimworld",
      user_id: "user1",
      game_id: "rimworld",
      enabled: true,
      categories: { saves: true, ideologies: true },
      custom_paths: {
        save_path: "Z:\\GenericSaves",
        ideologies: "Y:\\SpecificIdeologies",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const savesRes = resolveCategoryPath("rimworld", "saves", config, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(savesRes.path).toBe("Z:\\GenericSaves");

    const ideoRes = resolveCategoryPath("rimworld", "ideologies", config, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(ideoRes.path).toBe("Y:\\SpecificIdeologies");
  });

  it("Level 1 custom install_path override takes precedence for game_install categories", () => {
    const config: GameSyncConfigRecord = {
      id: "rain_world",
      user_id: "user1",
      game_id: "rain_world",
      enabled: true,
      categories: { custom_mods: true },
      custom_paths: {
        install_path: "X:\\PortableGames\\RainWorld",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = resolveCategoryPath("rain_world", "custom_mods", config, {
      detectedInstallPath: "D:\\SteamLibrary\\steamapps\\common\\Rain World",
      env: MOCK_WINDOWS_ENV,
    });

    expect(res.path).toBe(
      "X:\\PortableGames\\RainWorld\\RainWorld_Data\\StreamingAssets\\mods"
    );
    expect(res.source).toBe("user_install_dir");
    expect(res.isCustom).toBe(true);
  });

  it("Level 2 (Detected Install) wins over Level 3 (Default System) when no Level 1 override", () => {
    const res = resolveCategoryPath("rimworld", "custom_mods", null, {
      detectedInstallPath: "E:\\SteamLibrary\\steamapps\\common\\RimWorld",
      env: MOCK_WINDOWS_ENV,
    });

    expect(res.path).toBe("E:\\SteamLibrary\\steamapps\\common\\RimWorld\\Mods");
    expect(res.source).toBe("detected_install");
  });

  it("Level 3 (Default System) applies when neither user override nor detected install exists", () => {
    const res = resolveCategoryPath("rain_world", "data", null, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(res.source).toBe("default_system");
  });

  it("Empty or whitespace custom path overrides are treated as absent", () => {
    const config: GameSyncConfigRecord = {
      id: "rimworld",
      user_id: "user1",
      game_id: "rimworld",
      enabled: true,
      categories: { saves: true },
      custom_paths: {
        save_path: "   ",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = resolveCategoryPath("rimworld", "saves", config, {
      env: MOCK_WINDOWS_ENV,
    });
    expect(res.source).toBe("default_system");
    expect(res.path).toBe(
      "C:\\Users\\TestGamer\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Saves"
    );
  });
});

// ============================================================================
// 7. Negative & Boundary Tests
// ============================================================================
describe("supportedGames - Negative & Boundary Tests", () => {
  it("should return undefined/null for invalid or empty game IDs", () => {
    expect(getSupportedGame("")).toBeUndefined();
    expect(getSupportedGame("unknown_game_xyz")).toBeUndefined();
    expect(getSupportedGame(9999999)).toBeUndefined();
    expect(getGameCategories("invalid_game")).toEqual([]);
  });

  it("should return false when querying invalid categories for valid games", () => {
    expect(validateCategoryForGame("rain_world", "invalid_category")).toBe(false);
    expect(validateCategoryForGame("rain_world", "ideologies")).toBe(false);
    expect(validateCategoryForGame("rimworld", "submarines")).toBe(false);
    expect(validateCategoryForGame("kenshi", "custom_mods")).toBe(false);
    expect(validateCategoryForGame("space_haven", "mod_lists")).toBe(false);
  });

  it("should throw a descriptive Error when resolveCategoryPath is called with an unknown game or category", () => {
    expect(() =>
      resolveCategoryPath("invalid_game", "saves", null, { env: MOCK_WINDOWS_ENV })
    ).toThrow(/Unknown supported game ID/i);

    expect(() =>
      resolveCategoryPath("rain_world", "invalid_cat", null, { env: MOCK_WINDOWS_ENV })
    ).toThrow(/Category "invalid_cat" is not supported/i);
  });

  it("should detect and reject directory traversal attempts in custom paths", () => {
    const maliciousPaths = [
      "../../../../Windows/System32",
      "C:\\Games\\..\\..\\Windows\\System32",
      "D:\\Steam\\steamapps\\..\\..\\..\\Windows",
      "C:/Games/../../Windows/System32",
      "..\\SecretSaves",
    ];

    for (const badPath of maliciousPaths) {
      const result = validateCustomPath(badPath);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("path_traversal_detected");
    }
  });

  it("should detect and reject null bytes in custom paths", () => {
    const nullBytePath = "C:\\Games\\RimWorld\0\\Saves";
    const result = validateCustomPath(nullBytePath);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("null_byte_detected");
  });

  it("should reject non-absolute or relative paths", () => {
    const relativePaths = ["saves\\my_save", "relative/path/to/game", "MyGame/Saves"];
    for (const rel of relativePaths) {
      const result = validateCustomPath(rel);
      expect(result.valid).toBe(false);
    }
  });

  it("should accept valid Windows absolute paths and UNC paths", () => {
    const validPaths = [
      "C:\\Games\\RimWorld\\Saves",
      "D:\\SteamLibrary\\steamapps\\common\\Rain World",
      "E:\\Custom Mod Directory\\Mods",
      "\\\\NetworkShare\\GameSaves\\RimWorld",
    ];
    for (const goodPath of validPaths) {
      const result = validateCustomPath(goodPath);
      expect(result.valid).toBe(true);
    }
  });
});

// ============================================================================
// 8. Interface Contract Validation (server/lib/dataStore.ts)
// ============================================================================
describe("supportedGames - Interface Contract Alignment with dataStore.ts", () => {
  it("should match every GameDataCategory literal from server/lib/dataStore.ts", () => {
    const knownBackendCategories: readonly GameDataCategory[] = [
      "saves",
      "mod_lists",
      "custom_mods",
      "ideologies",
      "xenotypes",
      "submarines",
      "data",
    ];

    expect(VALID_GAME_DATA_CATEGORIES).toEqual(knownBackendCategories);

    // Verify every category across all games is within VALID_GAME_DATA_CATEGORIES
    for (const game of SUPPORTED_GAMES) {
      for (const cat of game.categories) {
        expect(VALID_GAME_DATA_CATEGORIES).toContain(cat.id);
      }
    }
  });

  it("should verify that every one of the 7 GameDataCategories is used by at least one game", () => {
    const usedCategories = new Set<GameDataCategory>();
    for (const game of SUPPORTED_GAMES) {
      for (const cat of game.categories) {
        usedCategories.add(cat.id);
      }
    }

    for (const expected of VALID_GAME_DATA_CATEGORIES) {
      expect(usedCategories.has(expected)).toBe(true);
    }
    expect(usedCategories.size).toBe(7);
  });

  it("should produce valid GameSyncConfigRecord structures via default config generator", () => {
    const config = createDefaultGameSyncConfig("rimworld", "user_123");
    expect(config.id).toBe("rimworld");
    expect(config.game_id).toBe("rimworld");
    expect(config.user_id).toBe("user_123");
    expect(config.enabled).toBe(true);
    expect(config.sync_status).toBe("idle");
    expect(config.categories).toEqual({
      saves: true,
      custom_mods: true,
      ideologies: true,
      xenotypes: true,
      mod_lists: true,
    });
  });

  it("should verify snapshot retention policy rules: 24h for auto-sync vs permanent for manual", () => {
    const createSnapshotRecord = (
      gameId: SupportedGameId,
      category: GameDataCategory,
      isManual: boolean,
      name: string
    ): GameSnapshotRecord => {
      const now = Date.now();
      const expiresAt = isManual
        ? null
        : new Date(now + 24 * 60 * 60 * 1000).toISOString();

      return {
        id: `snap_${now}`,
        user_id: "user_123",
        game_id: gameId,
        category,
        name,
        is_manual: isManual,
        expires_at: expiresAt,
        content_hash: "mock_sha256_hash",
        file_size: 1024,
        item_count: 5,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
    };

    // Auto-synced snapshot expires in ~24h
    const autoSnap = createSnapshotRecord(
      "rain_world",
      "mod_lists",
      false,
      "Auto-Sync 2026-09-07"
    );
    expect(autoSnap.is_manual).toBe(false);
    expect(autoSnap.expires_at).not.toBeNull();
    const expiryMs = new Date(autoSnap.expires_at!).getTime();
    const createdMs = new Date(autoSnap.created_at).getTime();
    expect(expiryMs - createdMs).toBe(24 * 60 * 60 * 1000);

    // Manual snapshot never expires (expires_at is null)
    const manualSnap = createSnapshotRecord(
      "rimworld",
      "saves",
      true,
      "Colony 5500 Day 120"
    );
    expect(manualSnap.is_manual).toBe(true);
    expect(manualSnap.expires_at).toBeNull();
  });

  describe("9. Robustness & Defect Remediations", () => {
    it("should normalize UNC network share paths with exactly 2 leading backslashes", () => {
      expect(normalizePath("\\\\server\\share\\path")).toBe("\\\\server\\share\\path");
      expect(normalizePath("//server/share/path/")).toBe("\\\\server\\share\\path");
      expect(normalizePath("\\\\\\server\\\\share")).toBe("\\\\server\\share");
    });

    it("should parse inline apps blocks in parseSteamLibraryFoldersDetailed", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Steam"
    "apps" { "294100" "100" "674440" "200" }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      expect(detailed).toHaveLength(1);
      expect(detailed[0].appIds).toContain("294100");
      expect(detailed[0].appIds).toContain("674440");
      expect(detailed[0].apps?.["294100"]).toBe("100");
      expect(detailed[0].apps?.["674440"]).toBe("200");
    });

    it("should preserve multiple libraries when braces are omitted (flat zero-brace VDF)", () => {
      const flatVdf = `
"path" "C:\\\\SteamOne"
"path" "D:\\\\SteamTwo"
`;
      const detailed = parseSteamLibraryFoldersDetailed(flatVdf);
      const paths = detailed.map((d) => d.path);
      expect(paths).toContain("C:\\SteamOne");
      expect(paths).toContain("D:\\SteamTwo");
    });

    it("should defensively validate detectedInstallPath against traversal in resolveCategoryPath", () => {
      const result = resolveCategoryPath("rimworld", "saves", null, {
        detectedInstallPath: "C:\\Games\\..\\..\\Windows",
        env: {
          userProfile: "C:\\Users\\TestUser",
          appDataLocalLow: "C:\\Users\\TestUser\\AppData\\LocalLow",
        },
      });
      expect(result.source).not.toBe("detected_install");
      expect(result.path).not.toContain("..");
      expect(result.path).toBe("C:\\Users\\TestUser\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Saves");
    });
  });
});
