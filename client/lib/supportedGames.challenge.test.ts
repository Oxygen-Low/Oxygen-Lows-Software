/**
 * @file client/lib/supportedGames.challenge.test.ts
 * @description Adversarial empirical challenge and stress test harness for
 * Supported Games Directory, 3-Tier Override Hierarchy, Path Traversal Security,
 * and Boundary Cases.
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
  type SystemPaths,
  type GameCategoryDefinition,
} from "./supportedGames";

import type { GameSyncConfigRecord } from "../../server/lib/dataStore";

const MOCK_SYS: SystemPaths = {
  userProfile: "C:\\Users\\EmpiricalTester",
  appData: "C:\\Users\\EmpiricalTester\\AppData\\Roaming",
  appDataRoaming: "C:\\Users\\EmpiricalTester\\AppData\\Roaming",
  localAppData: "C:\\Users\\EmpiricalTester\\AppData\\Local",
  appDataLocal: "C:\\Users\\EmpiricalTester\\AppData\\Local",
  localLow: "C:\\Users\\EmpiricalTester\\AppData\\LocalLow",
  appDataLocalLow: "C:\\Users\\EmpiricalTester\\AppData\\LocalLow",
  savedGames: "C:\\Users\\EmpiricalTester\\Saved Games",
  documents: "C:\\Users\\EmpiricalTester\\Documents",
  programFilesX86: "C:\\Program Files (x86)",
  steamPath: "C:\\Program Files (x86)\\Steam",
  steamLibraries: [
    "C:\\Program Files (x86)\\Steam",
    "D:\\SteamLibrary",
  ],
};

describe("Empirical Challenge: 18 Categories Across All 8 Games Matrix", () => {
  const EXPECTED_MATRIX: Record<SupportedGameId, string[]> = {
    rain_world: ["data", "custom_mods", "mod_lists"],
    rimworld: ["saves", "custom_mods", "ideologies", "xenotypes", "mod_lists"],
    library_of_ruina: ["data"],
    lobotomy_corporation: ["data"],
    ostranauts: ["saves"],
    barotrauma: ["submarines", "saves", "custom_mods", "mod_lists"],
    kenshi: ["saves", "mod_lists"],
    space_haven: ["saves"],
  };

  it("should match exact matrix of 18 categories across 8 games", () => {
    let count = 0;
    for (const [gameId, expectedCats] of Object.entries(EXPECTED_MATRIX)) {
      const game = getSupportedGame(gameId);
      expect(game).toBeDefined();
      const catIds = game!.categories.map((c) => c.id);
      expect(catIds).toEqual(expectedCats);
      count += catIds.length;
    }
    expect(count).toBe(18);
  });

  it("should resolve default system path (Level 3) for every single category", () => {
    for (const [gameId, expectedCats] of Object.entries(EXPECTED_MATRIX)) {
      for (const catId of expectedCats) {
        const resolved = resolveCategoryPath(gameId, catId, null, MOCK_SYS);
        expect(resolved.gameId).toBe(gameId);
        expect(resolved.category.id).toBe(catId);
        expect(resolved.source).toBe("default_system");
        expect(resolved.isCustom).toBe(false);
        expect(resolved.path).toBeTruthy();
        expect(resolved.path).not.toContain("..");
        expect(resolved.path).toMatch(/^[A-Za-z]:\\/);

        // Check pathType root alignment
        const catDef = resolved.category;
        if (catDef.pathType === "appdata_locallow") {
          expect(resolved.path.startsWith(MOCK_SYS.localLow)).toBe(true);
        } else if (catDef.pathType === "appdata_local") {
          expect(resolved.path.startsWith(MOCK_SYS.localAppData)).toBe(true);
        } else if (catDef.pathType === "appdata_roaming") {
          expect(resolved.path.startsWith(MOCK_SYS.appData)).toBe(true);
        } else if (catDef.pathType === "saved_games") {
          expect(resolved.path.startsWith(MOCK_SYS.savedGames)).toBe(true);
        } else if (catDef.pathType === "game_install") {
          expect(resolved.path.startsWith(MOCK_SYS.steamPath)).toBe(true);
        }
      }
    }
  });

  it("should accurately resolve effective paths batch via resolveEffectiveCategoryPaths", () => {
    for (const gameId of Object.keys(EXPECTED_MATRIX)) {
      const result = resolveEffectiveCategoryPaths(gameId, null, { env: MOCK_SYS });
      const expectedCats = EXPECTED_MATRIX[gameId as SupportedGameId];
      expect(Object.keys(result)).toEqual(expectedCats);
      for (const cat of expectedCats) {
        expect(result[cat].source).toBe("default_system");
      }
    }
  });
});

describe("Empirical Challenge: 3-Tier Override Hierarchy", () => {
  it("Hierarchy: Level 1 (specific custom) overrides Level 1 (generic key), Level 2, and Level 3", () => {
    const config: GameSyncConfigRecord = {
      id: "rimworld",
      user_id: "user-test",
      game_id: "rimworld",
      enabled: true,
      categories: { ideologies: true },
      custom_paths: {
        ideologies: "D:\\Custom\\RimWorld\\IdeologiesSpecific",
        save_path: "D:\\Custom\\RimWorld\\GenericSaves",
        install_path: "D:\\Games\\RimWorldCustomInstall",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolved = resolveCategoryPath("rimworld", "ideologies", config, {
      detectedInstallPath: "E:\\Steam\\steamapps\\common\\RimWorld",
      env: MOCK_SYS,
    });

    expect(resolved.source).toBe("user_override");
    expect(resolved.isCustom).toBe(true);
    expect(resolved.path).toBe("D:\\Custom\\RimWorld\\IdeologiesSpecific");
  });

  it("Hierarchy: Level 1 (generic customPathKey) overrides Level 2 (detected) and Level 3 (default)", () => {
    const config: GameSyncConfigRecord = {
      id: "rimworld",
      user_id: "user-test",
      game_id: "rimworld",
      enabled: true,
      categories: { xenotypes: true },
      custom_paths: {
        save_path: "D:\\Custom\\RimWorld\\GenericSaves",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolved = resolveCategoryPath("rimworld", "xenotypes", config, {
      detectedInstallPath: "E:\\Steam\\steamapps\\common\\RimWorld",
      env: MOCK_SYS,
    });

    expect(resolved.source).toBe("user_override");
    expect(resolved.isCustom).toBe(true);
    expect(resolved.path).toBe("D:\\Custom\\RimWorld\\GenericSaves");
  });

  it("Hierarchy: Level 1 (custom install_path) overrides Level 2 for game_install categories", () => {
    const config: GameSyncConfigRecord = {
      id: "rain_world",
      user_id: "user-test",
      game_id: "rain_world",
      enabled: true,
      categories: { custom_mods: true },
      custom_paths: {
        install_path: "F:\\PortableGames\\RainWorld",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolved = resolveCategoryPath("rain_world", "custom_mods", config, {
      detectedInstallPath: "E:\\Steam\\steamapps\\common\\Rain World",
      env: MOCK_SYS,
    });

    expect(resolved.source).toBe("user_install_dir");
    expect(resolved.isCustom).toBe(true);
    expect(resolved.path).toBe(
      "F:\\PortableGames\\RainWorld\\RainWorld_Data\\StreamingAssets\\mods"
    );
  });

  it("Hierarchy: Level 2 (detected install) overrides Level 3 (system default) for game_install category", () => {
    const resolved = resolveCategoryPath("space_haven", "saves", null, {
      detectedInstallPath: "D:\\SteamLibrary\\steamapps\\common\\Space Haven",
      env: MOCK_SYS,
    });

    expect(resolved.source).toBe("detected_install");
    expect(resolved.isCustom).toBe(false);
    expect(resolved.path).toBe(
      "D:\\SteamLibrary\\steamapps\\common\\Space Haven\\savegames"
    );
  });

  it("Hierarchy: Level 2 with preferInstallDirectory overrides Level 3 when fallback install path exists", () => {
    const resolved = resolveCategoryPath("rain_world", "data", null, {
      detectedInstallPath: "D:\\SteamLibrary\\steamapps\\common\\Rain World",
      preferInstallDirectory: true,
      env: MOCK_SYS,
    });

    expect(resolved.source).toBe("detected_install");
    expect(resolved.isCustom).toBe(false);
    expect(resolved.path).toBe(
      "D:\\SteamLibrary\\steamapps\\common\\Rain World\\UserData"
    );
  });

  it("Hierarchy: Level 3 (system default) is preserved when Level 2 is given without preferInstallDirectory for AppData categories", () => {
    const resolved = resolveCategoryPath("rain_world", "data", null, {
      detectedInstallPath: "D:\\SteamLibrary\\steamapps\\common\\Rain World",
      preferInstallDirectory: false,
      env: MOCK_SYS,
    });

    expect(resolved.source).toBe("default_system");
    expect(resolved.isCustom).toBe(false);
    expect(resolved.path).toBe(
      "C:\\Users\\EmpiricalTester\\AppData\\LocalLow\\Videocult\\Rain World"
    );
  });
});

describe("Empirical Challenge: Adversarial Path Traversal & Injection Defense", () => {
  const DANGEROUS_PATHS = [
    "../../../Windows/System32",
    "..\\..\\..\\Windows\\System32",
    "C:\\Games\\..\\..\\Secret",
    "C:/Games/../../Secret",
    "C:\\Games\\..\\Secret",
    "C:/Games/../Secret",
    "C:\\Games\\foo\\..",
    "C:\\Games\\foo\\..\\",
    "C:/Games/foo/..",
    "C:/Games/foo/../",
    "..",
    "..\\",
    "../",
    "C:\\Games\\Secret\0malicious",
    "\0C:\\Games\\Secret",
    "C:\\Games\\Secret\0",
    "foo/bar",
    "foo\\bar",
    "C:foo\\bar",
    "\\foo\\bar",
    "/etc/passwd",
    "/var/log",
    "   ",
    "",
  ];

  it("validateCustomPath should reject every single dangerous path", () => {
    for (const badPath of DANGEROUS_PATHS) {
      const val = validateCustomPath(badPath);
      expect(val.valid, `Expected invalid for: ${JSON.stringify(badPath)}`).toBe(false);
      expect(val.reason).toBeDefined();
    }
  });

  it("resolveCategoryPath should NEVER use a traversal or malicious custom path", () => {
    for (const badPath of DANGEROUS_PATHS) {
      const config: GameSyncConfigRecord = {
        id: "kenshi",
        user_id: "user-test",
        game_id: "kenshi",
        enabled: true,
        categories: { saves: true },
        custom_paths: {
          saves: badPath,
          save_path: badPath,
          install_path: badPath,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const resolved = resolveCategoryPath("kenshi", "saves", config, { env: MOCK_SYS });
      // MUST NOT be user_override with badPath!
      expect(resolved.source).toBe("default_system");
      expect(resolved.isCustom).toBe(false);
      expect(resolved.path).not.toContain("..");
      expect(resolved.path).not.toContain("\0");
      expect(resolved.path).toBe("C:\\Users\\EmpiricalTester\\AppData\\Local\\kenshi\\save");
    }
  });

  it("validateCustomPath should accept valid UNC network paths without traversal", () => {
    const validUnc = "\\\\nas-server\\game_saves\\rimworld";
    expect(validateCustomPath(validUnc).valid).toBe(true);
  });

  it("BUG #1: normalizePath should preserve exactly 2 leading backslashes for UNC paths", () => {
    const inputUnc = "\\\\nas-server\\game_saves\\rimworld";
    const normalized = normalizePath(inputUnc);
    // BUG REPORT: Currently produces "\\\nas-server\game_saves\rimworld" (3 backslashes)
    // because line 648 does `(isUnc ? "\\\\" : "") + norm.replace(/\\+/g, "\\")`
    // and norm.replace already condensed the leading backslashes to a single backslash.
    expect(normalized).toBe("\\\\nas-server\\game_saves\\rimworld");
  });

  it("should reject UNC paths containing directory traversal", () => {
    const badUnc = "\\\\nas-server\\share\\..\\secret";
    expect(validateCustomPath(badUnc).valid).toBe(false);
  });

  it("should defensively reject directory traversal in options.detectedInstallPath and fallback safely", () => {
    const maliciousOptions = {
      detectedInstallPath: "C:\\Games\\..\\..\\Windows",
      env: {
        userProfile: "C:\\Users\\EmpiricalTester",
        appDataRoaming: "C:\\Users\\EmpiricalTester\\AppData\\Roaming",
        localAppData: "C:\\Users\\EmpiricalTester\\AppData\\Local",
        localLow: "C:\\Users\\EmpiricalTester\\AppData\\LocalLow",
        savedGames: "C:\\Users\\EmpiricalTester\\Saved Games",
      },
    };

    const resolved = resolveCategoryPath(
      "rain_world",
      "custom_mods",
      null,
      maliciousOptions
    );

    expect(resolved.source).not.toBe("detected_install");
    expect(resolved.path).not.toContain("..");
  });
});

describe("Empirical Challenge: Boundary Conditions & Edge Cases", () => {
  it("should throw on invalid / unknown game IDs in resolveCategoryPath", () => {
    expect(() => resolveCategoryPath("", "saves")).toThrow(/Unknown supported game ID/);
    expect(() => resolveCategoryPath("   ", "saves")).toThrow(/Unknown supported game ID/);
    expect(() => resolveCategoryPath("cyberpunk_2077", "saves")).toThrow(/Unknown supported game ID/);
    expect(() => resolveCategoryPath(null as any, "saves")).toThrow(/Unknown supported game ID/);
    expect(() => resolveCategoryPath(9999999, "saves")).toThrow(/Unknown supported game ID/);
  });

  it("should throw on cross-game category queries", () => {
    // Rain World does NOT have submarines (Barotrauma only)
    expect(() => resolveCategoryPath("rain_world", "submarines")).toThrow(/Category "submarines" is not supported for game "rain_world"/);

    // RimWorld does NOT have data (Lobotomy / Ruina / Rain World only)
    expect(() => resolveCategoryPath("rimworld", "data")).toThrow(/Category "data" is not supported for game "rimworld"/);

    // Space Haven does NOT have mod_lists
    expect(() => resolveCategoryPath("space_haven", "mod_lists")).toThrow(/Category "mod_lists" is not supported for game "space_haven"/);

    // Non-existent category
    expect(() => resolveCategoryPath("barotrauma", "invented_category")).toThrow(/Category "invented_category" is not supported for game "barotrauma"/);
  });

  it("should handle null and empty configs gracefully in resolveEffectiveCategoryPaths", () => {
    const nullConfigResult = resolveEffectiveCategoryPaths("library_of_ruina", null, { env: MOCK_SYS });
    expect(nullConfigResult.data).toBeDefined();
    expect(nullConfigResult.data.source).toBe("default_system");

    const emptyConfig: GameSyncConfigRecord = {
      id: "library_of_ruina",
      user_id: "u1",
      game_id: "library_of_ruina",
      enabled: false,
      categories: {},
      created_at: "",
      updated_at: "",
    };
    const emptyResult = resolveEffectiveCategoryPaths("library_of_ruina", emptyConfig, { env: MOCK_SYS });
    expect(emptyResult.data).toBeDefined();
    expect(emptyResult.data.source).toBe("default_system");
  });

  it("should return empty object for invalid game ID in batch methods", () => {
    expect(resolveEffectiveCategoryPaths("unknown_game", null)).toEqual({});
    expect(resolveStandardGamePaths("unknown_game")).toEqual({});
  });

  it("should support polymorphic arguments in resolveCategoryPath", () => {
    // 1. (gameId, categoryId)
    const r1 = resolveCategoryPath("kenshi", "saves");
    expect(r1.path).toBeTruthy();

    // 2. (gameId, categoryId, config)
    const r2 = resolveCategoryPath("kenshi", "saves", null);
    expect(r2.path).toBeTruthy();

    // 3. (gameId, categoryId, config, envOverrides)
    const r3 = resolveCategoryPath("kenshi", "saves", null, MOCK_SYS);
    expect(r3.path).toBe("C:\\Users\\EmpiricalTester\\AppData\\Local\\kenshi\\save");

    // 4. (gameId, categoryId, config, options)
    const r4 = resolveCategoryPath("kenshi", "saves", null, { env: MOCK_SYS });
    expect(r4.path).toBe("C:\\Users\\EmpiricalTester\\AppData\\Local\\kenshi\\save");

    // 5. (gameId, categoryId, config, envOverrides, options)
    const r5 = resolveCategoryPath("kenshi", "saves", null, MOCK_SYS, {
      detectedInstallPath: "D:\\Games\\Kenshi",
    });
    expect(r5.path).toBe("C:\\Users\\EmpiricalTester\\AppData\\Local\\kenshi\\save");
  });
});

describe("Empirical Challenge: Steam VDF Parsing Stress", () => {
  it("should handle empty, whitespace, and truncated VDF contents without errors", () => {
    expect(parseSteamLibraryFolders("")).toEqual([]);
    expect(parseSteamLibraryFolders("   \n\t  ")).toEqual([]);
    expect(parseSteamLibraryFoldersDetailed("")).toEqual([]);
    expect(parseSteamLibraryFolders("invalid vdf with no paths")).toEqual([]);
  });

  it("should handle complex multi-drive VDF with standard multiline apps block", () => {
    const complexVdf = `
      // Steam library folders configuration
      "libraryfolders"
      {
        "0"
        {
          "path"    "C:\\\\Program Files (x86)\\\\Steam"
          "label"   ""
          "contentid"   "829103810293"
          "totalsize"   "1000000000000"
          "apps"
          {
            "294100"    "3500000000"
            "674440"    "1200000000"
          }
        }
        "1"
        {
          "path"    "D:\\\\SteamLibrary"
          "label"   "Secondary SSD"
          "apps"
          {
            "602960"    "2500000000"
          }
        }
        "2"
        {
          "path"    "E:\\\\FastGames"
          "apps"
          {
            "233860"    "15000000000"
          }
        }
      }
    `;

    const parsed = parseSteamLibraryFolders(complexVdf);
    expect(parsed).toEqual([
      "C:\\Program Files (x86)\\Steam",
      "D:\\SteamLibrary",
      "E:\\FastGames",
    ]);

    const detailed = parseSteamLibraryFoldersDetailed(complexVdf);
    expect(detailed).toHaveLength(3);
    expect(detailed[0].appIds).toContain("294100");
    expect(detailed[0].appIds).toContain("674440");
    expect(detailed[1].label).toBe("Secondary SSD");
    expect(detailed[1].appIds).toContain("602960");
    expect(detailed[2].appIds).toContain("233860");
  });

  it("findSteamGameInstall should prioritize detailed indexed AppId in standard multiline VDF", () => {
    const multilineVdf = `
      "libraryfolders"
      {
        "0"
        {
          "path" "C:\\\\Steam"
          "apps"
          {
            "674440" "100"
          }
        }
        "1"
        {
          "path" "D:\\\\SteamLibrary"
          "apps"
          {
            "294100" "200"
          }
        }
      }
    `;
    const detailed = parseSteamLibraryFoldersDetailed(multilineVdf);
    const rimworld = getSupportedGame("rimworld")!;

    const installPath = findSteamGameInstall(detailed, rimworld);
    expect(installPath).toBe("D:\\SteamLibrary\\steamapps\\common\\RimWorld");
  });

  it("BUG #2: parseSteamLibraryFoldersDetailed should extract appIds from inline or compact apps blocks", () => {
    // Compact or inline apps blocks, as also written in worker's client/lib/supportedGames.test.ts lines 466, 471, 476
    const inlineVdf = `
      "libraryfolders"
      {
        "0"
        {
          "path" "C:\\\\Steam"
          "apps" { "674440" "100" }
        }
        "1"
        {
          "path" "D:\\\\SteamLibrary"
          "apps" { "294100" "200" }
        }
      }
    `;
    const detailed = parseSteamLibraryFoldersDetailed(inlineVdf);
    // BUG REPORT: When line has "}", parser immediately hits `continue;` and never extracts "apps" or appIds!
    expect(detailed[0].appIds).toContain("674440");
    expect(detailed[1].appIds).toContain("294100");
  });

  it("findSteamGameInstall should probe libraries in order with fileExists callback", () => {
    const libraries = ["C:\\Steam", "D:\\SteamLibrary", "E:\\Games"];
    const kenshi = getSupportedGame("kenshi")!;

    const installPath = findSteamGameInstall(libraries, kenshi, {
      fileExists: (p) => p === "D:\\SteamLibrary\\steamapps\\common\\Kenshi",
    });

    expect(installPath).toBe("D:\\SteamLibrary\\steamapps\\common\\Kenshi");
  });
});
