/**
 * @file client/lib/supportedGames.vdf.stress.test.ts
 * @description Empirical Stress-Testing & Adversarial Test Suite for Steam VDF Parser
 * and Path Normalization Engine in supportedGames.ts.
 *
 * Authored by challenger_games_m2_1 to empirically test and challenge:
 * 1. Malformed and corrupted VDF files (unclosed quotes/braces, garbage tokens, CRLF/LF, Unicode).
 * 2. Extremely large VDF inputs with hundreds to thousands of app IDs (scale & performance).
 * 3. Numeric app sizes vs drive paths vs legacy numeric keys.
 * 4. Legacy VDF schemas vs modern VDF schemas and hybrid structures.
 * 5. Edge cases: UNC paths, drive-root paths, inline tokens.
 * 6. Empirical mutation fuzzing.
 * 7. Verification of proposed fixes for discovered defects.
 */

import { describe, it, expect } from "vitest";
import {
  parseSteamLibraryFolders,
  parseSteamLibraryFoldersDetailed,
  findSteamGameInstall,
  getSupportedGame,
  normalizePath,
  type SteamLibraryFolder,
} from "./supportedGames";

// ============================================================================
// Prototype Fix Functions (Verified by Challenger)
// ============================================================================

/**
 * Proposed fix for normalizePath: correctly preserves UNC leading \\ without triple backslash.
 */
function fixedNormalizePath(p: string): string {
  if (!p || typeof p !== "string") return "";
  let norm = p.trim().replace(/\//g, "\\");
  const isUnc = norm.startsWith("\\\\");
  norm = norm.replace(/\\+/g, "\\");
  if (isUnc) {
    norm = "\\" + norm;
  }
  if (norm.length > 3 && norm.endsWith("\\")) {
    norm = norm.slice(0, -1);
  }
  return norm;
}

/**
 * Proposed fix for parseSteamLibraryFoldersDetailed:
 * - Flushes pending library if a new "path" is encountered before the old block closes.
 * - Accurately counts { and } occurrences per line.
 * - Extracts inline apps entries on the same line as "apps" or braces.
 */
function fixedParseSteamLibraryFoldersDetailed(vdfContent: string): SteamLibraryFolder[] {
  if (!vdfContent || typeof vdfContent !== "string") return [];

  const results: SteamLibraryFolder[] = [];
  const seenPaths = new Set<string>();

  const recordLibrary = (
    rawPath: string,
    appIds: string[] = [],
    apps: Record<string, string> = {},
    label?: string
  ) => {
    const norm = fixedNormalizePath(rawPath.replace(/\\\\/g, "\\").replace(/\\"/g, '"'));
    if (!norm || seenPaths.has(norm.toLowerCase())) return;
    seenPaths.add(norm.toLowerCase());
    results.push({ path: norm, appIds, apps, label });
  };

  const isLikelyPath = (val: string): boolean => {
    if (!val || typeof val !== "string" || val.length < 3) return false;
    if (/^\d+$/.test(val)) return false;
    return /[\\/:]/.test(val);
  };

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
        // Exclude the block key itself if it were purely numeric
        if (match[1] !== "0" && match[1] !== "1" && match[1] !== "2" || inAppsBlock) {
          currentBlockAppIds.push(match[1]);
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

    // Modern apps entries when already inside apps block
    if (inAppsBlock && !trimmed.includes("{") && !trimmed.includes("}")) {
      const appMatch = trimmed.match(/"(\d+)"\s+"([^"]*)"/);
      if (appMatch) {
        if (!currentBlockApps[appMatch[1]]) {
          currentBlockAppIds.push(appMatch[1]);
          currentBlockApps[appMatch[1]] = appMatch[2];
        }
      }
    }

    // Legacy schema: "1" "D:\\SteamLibrary" at depth 1
    if (depth === 1) {
      const legacyMatch = trimmed.match(/^"(\d+)"\s+"([^"]+)"/);
      if (legacyMatch && isLikelyPath(legacyMatch[2])) {
        recordLibrary(legacyMatch[2]);
      }
    }

    if (closeCount > 0) {
      depth -= closeCount;
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

  // Flush lingering block
  if (currentBlockPath) {
    recordLibrary(
      currentBlockPath,
      currentBlockAppIds,
      currentBlockApps,
      currentBlockLabel
    );
  }

  // Fallback regex if nothing found
  if (results.length === 0) {
    const modernRegex = /"path"\s+"([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = modernRegex.exec(vdfContent)) !== null) {
      recordLibrary(match[1]);
    }

    const legacyRegex = /"(\d+)"\s+"([^"]+)"/g;
    while ((match = legacyRegex.exec(vdfContent)) !== null) {
      if (isLikelyPath(match[2])) {
        recordLibrary(match[2]);
      }
    }
  }

  return results;
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Steam VDF Parser - Empirical Stress & Adversarial Test Suite", () => {
  describe("Domain 1: Malformed & Corrupted VDF Files", () => {
    it("1.1 should safely handle unclosed root curly brace", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
    "apps"
    {
      "294100"    "350000000"
    }
  }
`;
      const folders = parseSteamLibraryFolders(vdf);
      expect(folders).toContain("C:\\Program Files (x86)\\Steam");

      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      expect(detailed.length).toBe(1);
      expect(detailed[0].appIds).toContain("294100");
    });

    it("1.2 should safely handle unclosed library block brace", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Steam"
`;
      const folders = parseSteamLibraryFolders(vdf);
      expect(folders).toContain("C:\\Steam");
    });

    it("1.3 should safely handle unclosed apps block brace", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Steam"
    "apps"
    {
      "294100"    "100"
      "674440"    "200"
`;
      const folders = parseSteamLibraryFolders(vdf);
      expect(folders).toContain("C:\\Steam");

      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      expect(detailed.length).toBe(1);
      expect(detailed[0].appIds).toContain("294100");
      expect(detailed[0].appIds).toContain("674440");
    });

    it("1.4 should safely handle multiple unclosed quotes in keys and values", () => {
      const vdf = `
"libraryfolders"
{
  "0
  {
    "path "C:\\\\BrokenKey"
    "path" "C:\\\\ValidPath1"
    "apps"
    {
      "294100 "12345"
      "674440" 98765"
      "602960" "100"
    }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      expect(detailed.length).toBe(1);
      expect(detailed[0].path).toBe("C:\\ValidPath1");
      expect(detailed[0].appIds).toContain("602960");
    });

    it("1.5 should handle negative brace balance (excess closing braces)", () => {
      const vdf = `
}
}
}
"libraryfolders"
{
  "0"
  {
    "path"    "D:\\\\SteamLibrary"
  }
}
}
}`;
      const folders = parseSteamLibraryFolders(vdf);
      expect(folders).toContain("D:\\SteamLibrary");
    });

    it("1.6 should handle non-VDF garbage inputs without throwing errors", () => {
      const garbageInputs = [
        "<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><h1>Server Error</h1></body></html>",
        '{"json": true, "path": "not/a/vdf", "nested": {"array": [1,2,3]}}',
        "<?xml version=\"1.0\"?><steam><library path=\"C:\\Steam\" /></steam>",
        "SELECT * FROM steam_libraries WHERE 1=1; DROP TABLE steam; --",
        "\x00\x01\x02\x03\xFF\xFE\xFD",
        "         \r\n\t\r\n       ",
        "null",
        "undefined",
        "[object Object]",
      ];

      for (const input of garbageInputs) {
        expect(() => parseSteamLibraryFolders(input)).not.toThrow();
        expect(() => parseSteamLibraryFoldersDetailed(input)).not.toThrow();
      }
    });

    it("1.7 should handle mixed CRLF, LF, and CR line endings seamlessly", () => {
      const crlfVdf = '"libraryfolders"\r\n{\r\n\t"0"\r\n\t{\r\n\t\t"path"\t\t"C:\\\\SteamCRLF"\r\n\t}\r\n}';
      const lfVdf = '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\SteamLF"\n\t}\n}';
      const mixedVdf = '"libraryfolders"\r\n{\n\t"0"\r\n\t{\n\t\t"path"\t\t"C:\\\\SteamMixed"\r\n\t}\n}';

      expect(parseSteamLibraryFolders(crlfVdf)).toEqual(["C:\\SteamCRLF"]);
      expect(parseSteamLibraryFolders(lfVdf)).toEqual(["C:\\SteamLF"]);
      expect(parseSteamLibraryFolders(mixedVdf)).toEqual(["C:\\SteamMixed"]);
    });

    it("1.8 should preserve Unicode and non-ASCII paths in multiple languages", () => {
      const unicodeVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "D:\\\\Игры\\\\SteamLibrary"
    "label"   "Русский"
  }
  "1"
  {
    "path"    "E:\\\\スチーム\\\\ライブラリ"
    "label"   "日本語"
  }
  "2"
  {
    "path"    "F:\\\\스팀\\\\게임"
    "label"   "한국어"
  }
  "3"
  {
    "path"    "G:\\\\蒸汽平台\\\\SteamGames"
    "label"   "简体中文"
  }
  "4"
  {
    "path"    "H:\\\\Juegos Español\\\\Steam"
    "label"   "Español"
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(unicodeVdf);
      expect(detailed).toHaveLength(5);
      expect(detailed[0].path).toBe("D:\\Игры\\SteamLibrary");
      expect(detailed[0].label).toBe("Русский");
      expect(detailed[1].path).toBe("E:\\スチーム\\ライブラリ");
      expect(detailed[1].label).toBe("日本語");
      expect(detailed[2].path).toBe("F:\\스팀\\게임");
      expect(detailed[2].label).toBe("한국어");
      expect(detailed[3].path).toBe("G:\\蒸汽平台\\SteamGames");
      expect(detailed[3].label).toBe("简体中文");
      expect(detailed[4].path).toBe("H:\\Juegos Español\\Steam");
      expect(detailed[4].label).toBe("Español");
    });

    it("1.9 should ignore comments without corrupting valid paths", () => {
      const vdf = `
// Valve Steam libraryfolders configuration file
"libraryfolders"
{
  // Primary SSD Library
  "0"
  {
    "path"    "C:\\\\Steam" // installed here
    // "path" "C:\\\\OldPathDoNotUse"
    "apps"
    {
      "294100"    "100" // RimWorld
      // "674440" "200"
    }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      expect(detailed).toHaveLength(1);
      expect(detailed[0].path).toBe("C:\\Steam");
      expect(detailed[0].appIds).toContain("294100");
      expect(detailed[0].appIds).not.toContain("674440");
      const paths = parseSteamLibraryFolders(vdf);
      expect(paths).not.toContain("C:\\OldPathDoNotUse");
    });
  });

  describe("Domain 2: Large Scale & High Volume Performance", () => {
    it("2.1 should parse a library folder with 500 installed app IDs accurately", () => {
      const appIds: string[] = [];
      const appLines: string[] = [];
      for (let i = 1000; i < 1500; i++) {
        const id = String(i * 10);
        appIds.push(id);
        appLines.push(`      "${id}"    "${i * 500000}"`);
      }

      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "D:\\\\HeavySteam"
    "apps"
    {
${appLines.join("\n")}
    }
  }
}`;

      const t0 = performance.now();
      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      const elapsed = performance.now() - t0;

      expect(detailed).toHaveLength(1);
      expect(detailed[0].path).toBe("D:\\HeavySteam");
      expect(detailed[0].appIds).toHaveLength(500);
      expect(detailed[0].apps).toBeDefined();
      expect(Object.keys(detailed[0].apps!).length).toBe(500);

      for (const id of appIds) {
        expect(detailed[0].apps![id]).toBeDefined();
      }

      expect(elapsed).toBeLessThan(50);
    });

    it("2.2 should partition 1,000 apps across 5 multi-drive libraries correctly", () => {
      const libraries = [
        { drive: "C", path: "C:\\\\Steam", count: 200, offset: 1000 },
        { drive: "D", path: "D:\\\\SteamLib1", count: 200, offset: 2000 },
        { drive: "E", path: "E:\\\\SteamLib2", count: 200, offset: 3000 },
        { drive: "F", path: "F:\\\\SteamLib3", count: 200, offset: 4000 },
        { drive: "G", path: "G:\\\\SteamLib4", count: 200, offset: 5000 },
      ];

      const blocks = libraries.map((lib, idx) => {
        const apps = Array.from({ length: lib.count }, (_, i) => {
          const appId = String(lib.offset + i);
          return `      "${appId}"    "1234567"`;
        }).join("\n");

        return `  "${idx}"
  {
    "path"    "${lib.path}"
    "apps"
    {
${apps}
    }
  }`;
      });

      const fullVdf = `"libraryfolders"\n{\n${blocks.join("\n")}\n}`;

      const t0 = performance.now();
      const detailed = parseSteamLibraryFoldersDetailed(fullVdf);
      const elapsed = performance.now() - t0;

      expect(detailed).toHaveLength(5);
      expect(detailed.map((l) => l.path)).toEqual([
        "C:\\Steam",
        "D:\\SteamLib1",
        "E:\\SteamLib2",
        "F:\\SteamLib3",
        "G:\\SteamLib4",
      ]);

      for (let i = 0; i < 5; i++) {
        expect(detailed[i].appIds).toHaveLength(200);
        expect(detailed[i].appIds[0]).toBe(String(libraries[i].offset));
      }

      expect(elapsed).toBeLessThan(100);
    });

    it("2.3 should stress-test 5,000 app entries in linear time without memory spikes", () => {
      const lines: string[] = [];
      for (let i = 1; i <= 5000; i++) {
        lines.push(`      "${i}"    "${i * 1024}"`);
      }

      const massiveVdf = `"libraryfolders"\n{\n  "0"\n  {\n    "path"    "D:\\\\Massive"\n    "apps"\n    {\n${lines.join("\n")}\n    }\n  }\n}`;

      const t0 = performance.now();
      const detailed = parseSteamLibraryFoldersDetailed(massiveVdf);
      const elapsed = performance.now() - t0;

      expect(detailed).toHaveLength(1);
      expect(detailed[0].appIds).toHaveLength(5000);
      expect(elapsed).toBeLessThan(250);
    });

    it("2.4 should integrate with findSteamGameInstall across standard multi-line libraries", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Steam"
    "apps"
    {
      "228980"    "100"
    }
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary"
    "apps"
    {
      "294100"    "100"
    }
  }
  "2"
  {
    "path"    "E:\\\\FastGames"
    "apps"
    {
      "602960"    "100"
    }
  }
  "3"
  {
    "path"    "F:\\\\Archive"
    "apps"
    {
      "674440"    "100"
    }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      const barotrauma = getSupportedGame("barotrauma")!;
      const rimworld = getSupportedGame("rimworld")!;
      const rainWorld = getSupportedGame("rain_world")!;

      const baroPath = findSteamGameInstall(detailed, barotrauma);
      expect(baroPath).toBe("E:\\FastGames\\steamapps\\common\\Barotrauma");

      const rimPath = findSteamGameInstall(detailed, rimworld);
      expect(rimPath).toBe("D:\\SteamLibrary\\steamapps\\common\\RimWorld");

      const rainPath = findSteamGameInstall(detailed, rainWorld);
      expect(rainPath).toBe("F:\\Archive\\steamapps\\common\\Rain World");
    });
  });

  describe("Domain 3: Numeric App Sizes vs Drive Paths vs Legacy Keys", () => {
    it("3.1 should never mistake huge byte sizes for paths", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
    "total_size"    "1999999999999"
    "update_clean_bytes"    "524288000"
    "time_last_update_corruption"    "1625091234"
    "apps"
    {
      "294100"    "35000000000"
      "674440"    "12800000000"
    }
  }
}`;
      const paths = parseSteamLibraryFolders(vdf);
      expect(paths).toEqual(["C:\\Program Files (x86)\\Steam"]);
      expect(paths).not.toContain("1999999999999");
      expect(paths).not.toContain("524288000");
      expect(paths).not.toContain("1625091234");
      expect(paths).not.toContain("35000000000");
      expect(paths).not.toContain("12800000000");
    });

    it("3.2 should distinguish paths with purely numeric directory names from app sizes", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "D:\\\\Games\\\\123\\\\Steam"
    "apps"
    {
      "294100"    "100"
    }
  }
  "1"
  {
    "path"    "E:\\\\1022980\\\\SteamLibrary"
    "apps"
    {
      "1022980"    "200"
    }
  }
}`;
      const paths = parseSteamLibraryFolders(vdf);
      expect(paths).toHaveLength(2);
      expect(paths).toContain("D:\\Games\\123\\Steam");
      expect(paths).toContain("E:\\1022980\\SteamLibrary");
    });

    it("3.3 should handle legacy VDF with numeric metadata keys alongside library paths", () => {
      const legacyVdf = `
"LibraryFolders"
{
  "TimeNextStatsReport"   "1600000000"
  "ContentStatsID"        "9876543210123"
  "1"                     "D:\\\\SteamGames"
  "2"                     "E:\\\\HighSpeed\\\\Steam"
  "3"                     "99999999999"
  "4"                     ""
}
`;
      const paths = parseSteamLibraryFolders(legacyVdf);
      expect(paths).toHaveLength(2);
      expect(paths).toContain("D:\\SteamGames");
      expect(paths).toContain("E:\\HighSpeed\\Steam");
      expect(paths).not.toContain("99999999999");
      expect(paths).not.toContain("1600000000");
      expect(paths).not.toContain("9876543210123");
      expect(paths).not.toContain("");
    });
  });

  describe("Domain 4: Legacy VDF vs Modern VDF Schemas", () => {
    it("4.1 should parse legacy Steam v1 format with 10+ numeric libraries", () => {
      const lines: string[] = ['"LibraryFolders"', "{", '  "TimeNextStatsReport" "1500000000"'];
      for (let i = 1; i <= 10; i++) {
        lines.push(`  "${i}"  "D:\\\\SteamDrive_${i}"`);
      }
      lines.push("}");

      const legacyVdf = lines.join("\n");
      const paths = parseSteamLibraryFolders(legacyVdf);
      expect(paths).toHaveLength(10);
      for (let i = 1; i <= 10; i++) {
        expect(paths).toContain(`D:\\SteamDrive_${i}`);
      }
    });

    it("4.2 should parse modern Steam v2 format with nested mount_info sub-blocks", () => {
      const vdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
    "label"   "Internal NVMe"
    "mount_info"
    {
      "mount_id"    "nvme0n1"
      "filesystem"  "ntfs"
    }
    "apps"
    {
      "294100"    "450000000"
      "674440"    "120000000"
    }
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary"
    "label"   "Secondary SATA"
    "mount_info"
    {
      "mount_id"    "sda1"
    }
    "apps"
    {
      "602960"    "800000000"
    }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(vdf);
      expect(detailed).toHaveLength(2);
      expect(detailed[0].path).toBe("C:\\Program Files (x86)\\Steam");
      expect(detailed[0].label).toBe("Internal NVMe");
      expect(detailed[0].appIds).toEqual(["294100", "674440"]);

      expect(detailed[1].path).toBe("D:\\SteamLibrary");
      expect(detailed[1].label).toBe("Secondary SATA");
      expect(detailed[1].appIds).toEqual(["602960"]);
    });

    it("4.3 should parse hybrid VDF containing both modern and legacy style entries", () => {
      const hybridVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Steam"
    "apps"
    {
      "294100" "100"
    }
  }
  "1"    "D:\\\\LegacySteamDrive"
}
`;
      const paths = parseSteamLibraryFolders(hybridVdf);
      expect(paths).toContain("C:\\Steam");
      expect(paths).toContain("D:\\LegacySteamDrive");
    });

    it("4.4 should deduplicate duplicate entries across casing and slashes", () => {
      const duplicateVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
  }
  "1"
  {
    "path"    "c:/program files (x86)/steam/"
  }
  "2"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam\\\\"
  }
  "3"
  {
    "path"    "D:\\\\SteamLibrary"
  }
}`;
      const paths = parseSteamLibraryFolders(duplicateVdf);
      expect(paths).toHaveLength(2);
      expect(paths[0]).toBe("C:\\Program Files (x86)\\Steam");
      expect(paths[1]).toBe("D:\\SteamLibrary");
    });
  });

  describe("Domain 5: Edge Cases, Drive Roots & Formatting Variations", () => {
    it("5.1 should handle drive-root paths properly with multi-line apps block", () => {
      const rootVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "D:\\\\"
    "apps"
    {
      "674440"    "200"
    }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(rootVdf);
      expect(detailed).toHaveLength(1);
      expect(detailed[0].path).toBe("D:\\");
      expect(detailed[0].appIds).toContain("674440");
    });

    it("5.2 should handle whitespace-heavy formatting with irregular tabs and spaces", () => {
      const messyVdf = `
\t\t"libraryfolders"
\t\t{
   "0"
   {
\t\t\t\t"path"\t\t\t\t     "C:\\\\MessyTabs\\\\Steam"    \t\t
      "label"   "My SSD"
      "apps"
      {
         "294100"       "123"
      }
   }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(messyVdf);
      expect(detailed).toHaveLength(1);
      expect(detailed[0].path).toBe("C:\\MessyTabs\\Steam");
      expect(detailed[0].label).toBe("My SSD");
      expect(detailed[0].appIds).toContain("294100");
    });

    it("5.3 should handle unescaped backslashes in path values gracefully", () => {
      const rawBackslashVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\Program Files (x86)\\Steam"
    "apps"
    {
      "294100"    "100"
    }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(rawBackslashVdf);
      expect(detailed).toHaveLength(1);
      expect(detailed[0].path).toBe("C:\\Program Files (x86)\\Steam");
    });

    it("5.4 should handle empty path properties without generating blank entries", () => {
      const emptyPathVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    ""
  }
  "1"
  {
    "path"    "   "
  }
  "2"
  {
    "path"    "D:\\\\RealSteam"
  }
}`;
      const paths = parseSteamLibraryFolders(emptyPathVdf);
      expect(paths).toEqual(["D:\\RealSteam"]);
    });
  });

  describe("Domain 6: Empirical Fuzzing & Mutation Testing", () => {
    const validSeedVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
    "label"   "Main NVMe"
    "apps"
    {
      "294100"    "350000000"
      "674440"    "120000000"
      "602960"    "850000000"
    }
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary"
    "apps"
    {
      "233860"    "1400000000"
    }
  }
}`;

    it("6.1 should survive 100 random mutation fuzz runs without throwing or hanging", () => {
      const mutations: string[] = [];

      for (let i = 0; i < 100; i++) {
        let mutated = validSeedVdf;
        const mutationCount = 1 + (i % 5);
        for (let m = 0; m < mutationCount; m++) {
          const mode = (i + m) % 6;
          switch (mode) {
            case 0:
              mutated = mutated.substring(0, Math.floor((mutated.length * (i + 1)) / 100));
              break;
            case 1:
              mutated = mutated.replace(/"/g, i % 2 === 0 ? "" : "''");
              break;
            case 2:
              mutated = mutated.replace(/Steam/g, "Steam\x00Corrupt");
              break;
            case 3:
              mutated = mutated.replace(/{/g, "}").replace(/}/g, "{");
              break;
            case 4:
              mutated = mutated + "\n" + mutated.slice(0, 50);
              break;
            case 5:
              mutated = mutated.replace(/path/gi, i % 2 === 0 ? "PATH" : "ptah");
              break;
          }
        }
        mutations.push(mutated);
      }

      for (let i = 0; i < mutations.length; i++) {
        expect(() => {
          const res1 = parseSteamLibraryFolders(mutations[i]);
          expect(Array.isArray(res1)).toBe(true);
          const res2 = parseSteamLibraryFoldersDetailed(mutations[i]);
          expect(Array.isArray(res2)).toBe(true);
        }).not.toThrow();
      }
    });

    it("6.2 should survive 100 random truncation slice lengths without throwing", () => {
      for (let len = 0; len < validSeedVdf.length; len += Math.floor(validSeedVdf.length / 100)) {
        const sliced = validSeedVdf.slice(0, len);
        expect(() => {
          const res = parseSteamLibraryFoldersDetailed(sliced);
          expect(Array.isArray(res)).toBe(true);
        }).not.toThrow();
      }
    });
  });

  describe("Domain 7: Empirical Bug Verifications & Remediations", () => {
    it("7.1 [REMEDIATED DEFECT 1] normalizePath preserves exactly two leading backslashes for UNC paths", () => {
      const inputUnc = "\\\\nas-server\\games\\SteamLibrary";
      const normalized = normalizePath(inputUnc);
      expect(normalized).toBe("\\\\nas-server\\games\\SteamLibrary");
      expect(normalized.startsWith("\\\\")).toBe(true);
      expect(normalized.startsWith("\\\\\\")).toBe(false);
    });

    it("7.2 [REMEDIATED DEFECT 2] parseSteamLibraryFoldersDetailed extracts app IDs when apps block is formatted inline", () => {
      const inlineVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Steam"
    "apps" { "294100" "100" }
  }
}`;
      const detailed = parseSteamLibraryFoldersDetailed(inlineVdf);
      expect(detailed).toHaveLength(1);
      expect(detailed[0].appIds).toContain("294100");
      expect(detailed[0].apps?.["294100"]).toBe("100");
    });

    it("7.3 [REMEDIATED DEFECT 3] parseSteamLibraryFoldersDetailed flushes and preserves libraries when braces are omitted between blocks", () => {
      const unclosedVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\SteamOne"
  "1"
  {
    "path"    "D:\\\\SteamTwo"
  }
}`;
      const folders = parseSteamLibraryFolders(unclosedVdf);
      expect(folders).toContain("C:\\SteamOne");
      expect(folders).toContain("D:\\SteamTwo");
    });
  });

  describe("Domain 8: Verification of Proposed Fixes", () => {
    it("8.1 fixedNormalizePath should correctly normalize UNC paths to exactly 2 backslashes", () => {
      const unc = "\\\\nas-server\\games\\SteamLibrary";
      const result = fixedNormalizePath(unc);
      expect(result).toBe("\\\\nas-server\\games\\SteamLibrary");
      expect(result.startsWith("\\\\")).toBe(true);
      expect(result.startsWith("\\\\\\")).toBe(false);

      // Verify regular paths still normalize properly
      expect(fixedNormalizePath("C:/Program Files/Steam/")).toBe("C:\\Program Files\\Steam");
      expect(fixedNormalizePath("D:\\")).toBe("D:\\");
    });

    it("8.2 fixedParseSteamLibraryFoldersDetailed should extract app IDs from inline apps blocks", () => {
      const inlineVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Steam"
    "apps" { "294100" "100" "674440" "200" }
  }
}`;
      const detailed = fixedParseSteamLibraryFoldersDetailed(inlineVdf);
      expect(detailed).toHaveLength(1);
      expect(detailed[0].appIds).toContain("294100");
      expect(detailed[0].appIds).toContain("674440");
      expect(detailed[0].apps?.["294100"]).toBe("100");
    });

    it("8.3 fixedParseSteamLibraryFoldersDetailed should preserve consecutive libraries even if braces are missing between them", () => {
      const unclosedVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\SteamOne"
  "1"
  {
    "path"    "D:\\\\SteamTwo"
  }
}`;
      const detailed = fixedParseSteamLibraryFoldersDetailed(unclosedVdf);
      const paths = detailed.map((d) => d.path);
      expect(paths).toContain("C:\\SteamOne");
      expect(paths).toContain("D:\\SteamTwo");
    });
  });
});
