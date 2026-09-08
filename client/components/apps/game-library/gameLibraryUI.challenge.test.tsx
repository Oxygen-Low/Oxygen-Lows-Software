/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { SupportedGamesModal } from "./SupportedGamesModal";
import { GameSavesAndModsTab } from "./GameSavesAndModsTab";
import { ConflictResolverModal } from "./ConflictResolverModal";
import { GameLibrary } from "../GameLibrary";
import { getSupportedGame } from "@/lib/supportedGames";
import { gameSyncService } from "@/lib/gameSyncService";
import { db, supabase } from "@/lib/db";
import * as desktopBridge from "@/lib/desktopBridge";
import { toast } from "sonner";
import type { InstalledGame } from "@/lib/desktopBridge";
import type {
  GameConflictRecord,
  GameSnapshotRecord,
  GameSyncConfigRecord,
} from "../../../../server/lib/dataStore";

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.confirm
global.confirm = vi.fn(() => true);

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    isDesktopBridgeAvailable: vi.fn(() => true),
    scanInstalledGames: vi.fn(),
    launchGame: vi.fn(),
    pickGameExecutable: vi.fn().mockResolvedValue({
      title: "RimWorld",
      executablePath: "C:\\Games\\RimWorld\\RimWorldWin64.exe",
    }),
    getGameIcon: vi.fn(),
    getRunningGames: vi.fn().mockResolvedValue([]),
    setupGameBridgeListeners: vi.fn(() => () => {}),
    addPushEventListener: vi.fn(),
  };
});

const mockInstalledRimWorld: InstalledGame = {
  id: "rimworld",
  title: "RimWorld",
  platform: "steam",
  launchUri: "steam://rungameid/294100",
  executablePath: "C:\\Steam\\steamapps\\common\\RimWorld\\RimWorldWin64.exe",
  installPath: "C:\\Steam\\steamapps\\common\\RimWorld",
  isCustom: false,
};

const mockInstalledRainWorld: InstalledGame = {
  id: "rainworld",
  title: "Rain World",
  platform: "steam",
  launchUri: "steam://rungameid/674940",
  executablePath: "C:\\Steam\\steamapps\\common\\Rain World\\RainWorld.exe",
  installPath: "C:\\Steam\\steamapps\\common\\Rain World",
  isCustom: false,
};

const mockInstalledCyberpunk: InstalledGame = {
  id: "steam_1091500",
  title: "Cyberpunk 2077",
  platform: "steam",
  launchUri: "steam://rungameid/1091500",
  executablePath: "C:\\Steam\\steamapps\\common\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe",
  installPath: "C:\\Steam\\steamapps\\common\\Cyberpunk 2077",
  isCustom: false,
};

const mockRimWorldDef = getSupportedGame("rimworld")!;

let rpcMockCalls: Record<string, any[]> = {};
let dbConfigs: Record<string, GameSyncConfigRecord> = {};
let dbSnapshots: GameSnapshotRecord[] = [];
let dbConflicts: GameConflictRecord[] = [];

vi.mock("@/lib/db", () => {
  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-id" } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "test-user-id" } } },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => {
      const builder: any = {
        select: vi.fn(() => builder),
        execute: vi.fn().mockResolvedValue({
          data: [mockInstalledRimWorld, mockInstalledRainWorld, mockInstalledCyberpunk],
          error: null,
        }),
      };
      return builder;
    }),
    rpc: vi.fn().mockImplementation((name: string, args: any) => {
      rpcMockCalls[name] = rpcMockCalls[name] || [];
      rpcMockCalls[name].push(args);

      if (name === "get_game_sync_configs") {
        if (args?.game_id) {
          return Promise.resolve({
            data: {
              config: dbConfigs[args.game_id] || {
                id: args.game_id,
                game_id: args.game_id,
                enabled: true,
                categories: { saves: true, mod_lists: true, custom_mods: true },
                custom_paths: {},
              },
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            configs: Object.values(dbConfigs),
          },
          error: null,
        });
      }
      if (name === "upsert_game_sync_config") {
        const gid = args.game_id;
        dbConfigs[gid] = {
          ...(dbConfigs[gid] || {
            id: gid,
            user_id: "test-user-id",
            game_id: gid,
            enabled: true,
            categories: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
          ...args,
          custom_paths: {
            ...(dbConfigs[gid]?.custom_paths || {}),
            ...(args.custom_paths || {}),
          },
        };
        return Promise.resolve({ data: { success: true }, error: null });
      }
      if (name === "get_game_snapshots") {
        let filtered = [...dbSnapshots];
        if (args?.game_id) {
          filtered = filtered.filter((s) => s.game_id === args.game_id);
        }
        return Promise.resolve({
          data: { snapshots: filtered },
          error: null,
        });
      }
      if (name === "create_game_snapshot") {
        const snap: GameSnapshotRecord = {
          id: `snap_${Date.now()}`,
          user_id: "test-user-id",
          game_id: args.game_id,
          category: args.category,
          name: args.name,
          is_manual: args.is_manual ?? true,
          expires_at: args.is_manual ? null : new Date(Date.now() + 86400000).toISOString(),
          content_hash: "mock_hash_1234567890",
          file_size: args.file_size || 1024,
          item_count: args.item_count || 1,
          summary: args.summary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        dbSnapshots.push(snap);
        return Promise.resolve({ data: { snapshot_id: snap.id }, error: null });
      }
      if (name === "promote_game_snapshot") {
        const s = dbSnapshots.find((x) => x.id === args.snapshot_id);
        if (s) {
          s.is_manual = true;
          s.expires_at = null;
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }
      if (name === "delete_game_snapshot") {
        dbSnapshots = dbSnapshots.filter((x) => x.id !== args.snapshot_id);
        return Promise.resolve({ data: { success: true }, error: null });
      }
      if (name === "restore_game_snapshot") {
        return Promise.resolve({ data: { success: true }, error: null });
      }
      if (name === "get_game_conflicts") {
        let filtered = [...dbConflicts];
        if (args?.game_id) {
          filtered = filtered.filter((c) => c.game_id === args.game_id);
        }
        if (args?.status) {
          filtered = filtered.filter((c) => c.status === args.status);
        }
        return Promise.resolve({
          data: { conflicts: filtered },
          error: null,
        });
      }
      if (name === "resolve_game_conflict") {
        const c = dbConflicts.find((x) => x.id === args.conflict_id);
        if (c) {
          c.status = "resolved";
          c.resolution = args.resolution;
        }
        return Promise.resolve({
          data: {
            success: true,
            resolution: args.resolution,
          },
          error: null,
        });
      }
      if (name === "sync_user_games") {
        return Promise.resolve({ data: { synced: 3 }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return {
    db: mockClient,
    supabase: mockClient,
  };
});

describe("Adversarial UI Component Challenge Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMockCalls = {};
    dbConfigs = {
      rimworld: {
        id: "rimworld",
        user_id: "test-user-id",
        game_id: "rimworld",
        enabled: true,
        categories: { saves: true, custom_mods: true, ideologies: true, xenotypes: true, mod_lists: true },
        custom_paths: {},
        created_at: "2026-09-08T00:00:00Z",
        updated_at: "2026-09-08T00:00:00Z",
      },
    };
    dbSnapshots = [];
    dbConflicts = [];
    (desktopBridge.scanInstalledGames as any).mockResolvedValue([
      mockInstalledRimWorld,
      mockInstalledRainWorld,
      mockInstalledCyberpunk,
    ]);
    (desktopBridge.setupGameBridgeListeners as any).mockReturnValue(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // SECTION 1: Path Traversal & Security in SupportedGamesModal
  // ==========================================================================
  describe("Security Stress: Custom Path Traversal & Injection Blocking", () => {
    const dangerousPaths = [
      "C:\\Games\\RimWorld\\..\\..\\Windows\\System32",
      "D:/SteamLibrary/../../etc/passwd",
      "..",
      "../..",
      "..\\..",
      "C:\\Games\\RimWorld\\..",
      "D:/Games/RimWorld/..",
      "\\\\malicious-server\\share\\..\\secret",
      "C:\\Games\\RimWorld\0\\secret_exploit",
      "relative/path/to/game",
      "1:\\InvalidDrive\\Games",
      "C:Games\\RelativeNoSlash",
      "/root/linux/path/not/windows",
    ];

    for (const badPath of dangerousPaths) {
      it(`should strictly reject path traversal vector: ${JSON.stringify(badPath)} in installPath and prevent saving`, async () => {
        render(
          <SupportedGamesModal
            open={true}
            onOpenChange={() => {}}
            installedGames={[mockInstalledRimWorld]}
          />
        );

        // Expand path configuration for RimWorld
        await waitFor(() => {
          expect(screen.getByTestId("supported-game-card-rimworld")).toBeDefined();
        });

        // Click Path Configuration expander button
        const card = screen.getByTestId("supported-game-card-rimworld");
        const pathExpander = card.querySelector("button.text-\\[11px\\]");
        expect(pathExpander).not.toBeNull();
        fireEvent.click(pathExpander!);

        await waitFor(() => {
          expect(screen.getByTestId("custom-install-path-input-rimworld")).toBeDefined();
          expect(screen.getByTestId("save-custom-paths-btn-rimworld")).toBeDefined();
        });

        // Inject malicious install path
        const installInput = screen.getByTestId("custom-install-path-input-rimworld");
        fireEvent.change(installInput, { target: { value: badPath } });

        // Attempt to save
        const saveBtn = screen.getByTestId("save-custom-paths-btn-rimworld");
        fireEvent.click(saveBtn);

        // Assert that security warning error message is rendered
        await waitFor(() => {
          expect(
            screen.getByText("Path traversal outside allowed directories is blocked for security.")
          ).toBeDefined();
        });

        // Assert that db.rpc upsert_game_sync_config was NOT called with this bad path
        const upsertCalls = rpcMockCalls["upsert_game_sync_config"] || [];
        const badSaved = upsertCalls.some(
          (c) => c.custom_paths && c.custom_paths.install_path === badPath
        );
        expect(badSaved).toBe(false);
      });

      it(`should strictly reject path traversal vector: ${JSON.stringify(badPath)} in savePath and prevent saving`, async () => {
        render(
          <SupportedGamesModal
            open={true}
            onOpenChange={() => {}}
            installedGames={[mockInstalledRimWorld]}
          />
        );

        await waitFor(() => {
          expect(screen.getByTestId("supported-game-card-rimworld")).toBeDefined();
        });

        const card = screen.getByTestId("supported-game-card-rimworld");
        const pathExpander = card.querySelector("button.text-\\[11px\\]");
        fireEvent.click(pathExpander!);

        await waitFor(() => {
          expect(screen.getByTestId("custom-save-path-input-rimworld")).toBeDefined();
        });

        // Set valid install path, but malicious save path
        const installInput = screen.getByTestId("custom-install-path-input-rimworld");
        fireEvent.change(installInput, { target: { value: "C:\\Games\\RimWorld" } });

        const saveInput = screen.getByTestId("custom-save-path-input-rimworld");
        fireEvent.change(saveInput, { target: { value: badPath } });

        const saveBtn = screen.getByTestId("save-custom-paths-btn-rimworld");
        fireEvent.click(saveBtn);

        await waitFor(() => {
          expect(
            screen.getByText("Path traversal outside allowed directories is blocked for security.")
          ).toBeDefined();
        });

        const upsertCalls = rpcMockCalls["upsert_game_sync_config"] || [];
        const badSaved = upsertCalls.some(
          (c) => c.custom_paths && c.custom_paths.save_path === badPath
        );
        expect(badSaved).toBe(false);
      });
    }

    it("accepts legitimate paths and clears error upon correction", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[mockInstalledRimWorld]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("supported-game-card-rimworld")).toBeDefined();
      });

      const card = screen.getByTestId("supported-game-card-rimworld");
      const pathExpander = card.querySelector("button.text-\\[11px\\]");
      fireEvent.click(pathExpander!);

      await waitFor(() => {
        expect(screen.getByTestId("custom-install-path-input-rimworld")).toBeDefined();
      });

      const installInput = screen.getByTestId("custom-install-path-input-rimworld");
      // First, trigger error
      fireEvent.change(installInput, { target: { value: "C:\\Bad\\..\\Windows" } });
      fireEvent.click(screen.getByTestId("save-custom-paths-btn-rimworld"));

      await waitFor(() => {
        expect(
          screen.getByText("Path traversal outside allowed directories is blocked for security.")
        ).toBeDefined();
      });

      // Now correct to valid absolute path
      fireEvent.change(installInput, { target: { value: "D:\\SteamLibrary\\steamapps\\common\\RimWorld" } });

      // Error message should disappear upon typing
      expect(
        screen.queryByText("Path traversal outside allowed directories is blocked for security.")
      ).toBeNull();

      fireEvent.click(screen.getByTestId("save-custom-paths-btn-rimworld"));

      await waitFor(() => {
        expect(rpcMockCalls["upsert_game_sync_config"]).toBeDefined();
        expect(dbConfigs["rimworld"].custom_paths?.install_path).toBe(
          "D:\\SteamLibrary\\steamapps\\common\\RimWorld"
        );
      });
    });
  });

  // ==========================================================================
  // SECTION 2: Official DLC Expansion Name Protection
  // ==========================================================================
  describe("Adversarial Stress: Official DLC Expansion Name Protection", () => {
    const protectedExpansions = [
      // RimWorld official expansions
      "Royalty",
      "royalty",
      "ROYALTY",
      "rOyAlTy",
      "Ideology",
      "ideology",
      "IDEOLOGY",
      "Biotech",
      "biotech",
      "BIOTECH",
      "Anomaly",
      "anomaly",
      "ANOMALY",
      "Core",
      "core",
      "CORE",
      // Rain World official expansions
      "MoreSlugcats",
      "moreslugcats",
      "MORESLUGCATS",
      "Expedition",
      "expedition",
      "EXPEDITION",
      // General protected
      "Vanilla",
      "vanilla",
      "VANILLA",
      // With whitespace
      "  Royalty  ",
      "\tBiotech\n",
      "   moreslugcats   ",
    ];

    for (const expName of protectedExpansions) {
      it(`blocks custom mod packaging for official expansion name: ${JSON.stringify(expName)}`, async () => {
        const packageModSpy = vi.spyOn(gameSyncService, "packageCustomMod");

        render(
          <GameSavesAndModsTab
            game={mockInstalledRimWorld}
            supportedDef={mockRimWorldDef}
          />
        );

        await waitFor(() => {
          expect(screen.getByTestId("custom-mod-name-input")).toBeDefined();
          expect(screen.getByTestId("package-mod-btn")).toBeDefined();
        });

        const modInput = screen.getByTestId("custom-mod-name-input");
        fireEvent.change(modInput, { target: { value: expName } });

        const packageBtn = screen.getByTestId("package-mod-btn");
        fireEvent.click(packageBtn);

        // Verify toast.error was triggered specifically for protected expansion files
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringMatching(/Official expansion files are protected and cannot be packaged as custom mods\./i)
        );

        // Verify gameSyncService.packageCustomMod was NEVER called
        expect(packageModSpy).not.toHaveBeenCalled();

        packageModSpy.mockRestore();
      });
    }

    it("allows legitimately named community mods including mods prefixed with VanillaExpanded", async () => {
      const packageModSpy = vi.spyOn(gameSyncService, "packageCustomMod").mockResolvedValue({
        success: true,
        gameId: "rimworld",
        modId: "snap_community_mod_1",
        modName: "CommunityMod",
      });

      render(
        <GameSavesAndModsTab
          game={mockInstalledRimWorld}
          supportedDef={mockRimWorldDef}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("custom-mod-name-input")).toBeDefined();
      });

      const allowedMods = ["CombatExtended", "Hospitality", "AlphaAnimals", "VanillaExpandedFramework"];

      for (const modName of allowedMods) {
        const modInput = screen.getByTestId("custom-mod-name-input");
        fireEvent.change(modInput, { target: { value: modName } });
        fireEvent.click(screen.getByTestId("package-mod-btn"));

        await waitFor(() => {
          expect(packageModSpy).toHaveBeenCalledWith(
            "rimworld",
            modName,
            expect.any(Array)
          );
        });
      }

      packageModSpy.mockRestore();
    });
  });

  // ==========================================================================
  // SECTION 3: Retention Rules Display (24h Auto-Sync vs Permanent Save)
  // ==========================================================================
  describe("Retention Rules & Badging Precision Stress", () => {
    it("displays exact 24h retention badge and live countdown for auto-sync snapshots", async () => {
      const now = Date.now();
      const snapExpiresIn20h: GameSnapshotRecord = {
        id: "snap_auto_20h",
        user_id: "test-user-id",
        game_id: "rimworld",
        category: "mod_lists",
        name: "Auto-Sync Mod List 20h",
        is_manual: false,
        expires_at: new Date(now + 20 * 3600 * 1000).toISOString(),
        content_hash: "hash_auto_20h",
        file_size: 4096,
        item_count: 12,
        created_at: new Date(now - 4 * 3600 * 1000).toISOString(),
        updated_at: new Date(now - 4 * 3600 * 1000).toISOString(),
      };

      const snapPermanent: GameSnapshotRecord = {
        id: "snap_manual_permanent",
        user_id: "test-user-id",
        game_id: "rimworld",
        category: "saves",
        name: "Year 10 Grand Base",
        is_manual: true,
        expires_at: null,
        content_hash: "hash_manual_perm",
        file_size: 10485760,
        item_count: 8,
        created_at: new Date(now - 86400000).toISOString(),
        updated_at: new Date(now - 86400000).toISOString(),
      };

      const snapArchived: GameSnapshotRecord = {
        id: "snap_archived_backup",
        user_id: "test-user-id",
        game_id: "rimworld",
        category: "saves",
        name: "Conflict Backup Archive",
        is_manual: true,
        is_archived: true,
        archive_reason: "conflict_alternate_cloud",
        expires_at: null,
        content_hash: "hash_archived",
        file_size: 5242880,
        item_count: 5,
        created_at: new Date(now - 172800000).toISOString(),
        updated_at: new Date(now - 172800000).toISOString(),
      };

      dbSnapshots = [snapExpiresIn20h, snapPermanent, snapArchived];

      render(
        <GameSavesAndModsTab
          game={mockInstalledRimWorld}
          supportedDef={mockRimWorldDef}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("snapshot-item-snap_auto_20h")).toBeDefined();
        expect(screen.getByTestId("snapshot-item-snap_manual_permanent")).toBeDefined();
        expect(screen.getByTestId("snapshot-item-snap_archived_backup")).toBeDefined();
      });

      // 1. Check Auto-Sync snapshot:
      const autoItem = screen.getByTestId("snapshot-item-snap_auto_20h");
      expect(autoItem.textContent).toContain("24h Auto-Sync");
      expect(autoItem.textContent).toContain("Expires in 20h");
      // Must have Pin button
      expect(screen.getByTestId("pin-snapshot-btn-snap_auto_20h")).toBeDefined();

      // 2. Check Permanent snapshot:
      const permItem = screen.getByTestId("snapshot-item-snap_manual_permanent");
      expect(permItem.textContent).toContain("Permanent Save");
      // Must NOT have expiration notice
      expect(permItem.textContent).not.toContain("Expires in");
      // Must NOT have Pin button
      expect(screen.queryByTestId("pin-snapshot-btn-snap_manual_permanent")).toBeNull();

      // 3. Check Archived snapshot:
      const archItem = screen.getByTestId("snapshot-item-snap_archived_backup");
      expect(archItem.textContent).toContain("Permanent Save");
      expect(archItem.textContent).toContain("Archived Backup");
      expect(archItem.textContent).not.toContain("Expires in");
    });

    it("filters snapshots accurately across category tabs", async () => {
      const now = Date.now();
      dbSnapshots = [
        {
          id: "snap_save_1",
          user_id: "test-user-id",
          game_id: "rimworld",
          category: "saves",
          name: "Saves Only Snapshot",
          is_manual: true,
          expires_at: null,
          content_hash: "hash_s",
          file_size: 1024,
          item_count: 1,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
        },
        {
          id: "snap_mods_1",
          user_id: "test-user-id",
          game_id: "rimworld",
          category: "mod_lists",
          name: "Mod Lists Only Snapshot",
          is_manual: false,
          expires_at: new Date(now + 3600000).toISOString(),
          content_hash: "hash_m",
          file_size: 512,
          item_count: 10,
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
        },
      ];

      render(
        <GameSavesAndModsTab
          game={mockInstalledRimWorld}
          supportedDef={mockRimWorldDef}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Saves Only Snapshot")).toBeDefined();
        expect(screen.getByText("Mod Lists Only Snapshot")).toBeDefined();
      });

      // Filter by 'Colony Saves' (RimWorld saves category name)
      const savesFilterBtn = screen.getByRole("button", { name: /Colony Saves/i });
      fireEvent.click(savesFilterBtn);

      expect(screen.getByText("Saves Only Snapshot")).toBeDefined();
      expect(screen.queryByText("Mod Lists Only Snapshot")).toBeNull();

      // Filter by 'Active Mod List & Config' (RimWorld mod_lists category name)
      const modListsFilterBtn = screen.getByRole("button", { name: /Active Mod List/i });
      fireEvent.click(modListsFilterBtn);

      expect(screen.getByText("Mod Lists Only Snapshot")).toBeDefined();
      expect(screen.queryByText("Saves Only Snapshot")).toBeNull();

      // Filter by 'All Categories'
      const allFilterBtn = screen.getByRole("button", { name: /^All Categories/i });
      fireEvent.click(allFilterBtn);

      expect(screen.getByText("Saves Only Snapshot")).toBeDefined();
      expect(screen.getByText("Mod Lists Only Snapshot")).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 4: Interactive Conflict Resolution Modal Stress
  // ==========================================================================
  describe("Interactive Conflict Resolution Modal Stress", () => {
    it("computes diff tags correctly when local is newer and larger", async () => {
      const mockConflict: GameConflictRecord = {
        id: "conflict_stress_1",
        user_id: "test-user-id",
        game_id: "rimworld",
        category: "saves",
        status: "active",
        local_version: {
          timestamp: "2026-09-08T16:00:00Z", // newer
          content_hash: "local_hash_9999",
          file_size: 5000000, // larger
          item_count: 10, // more
          summary: { files: ["save1.rws"] },
        },
        cloud_version: {
          snapshot_id: "snap_cloud_1",
          timestamp: "2026-09-08T10:00:00Z",
          content_hash: "cloud_hash_1111",
          file_size: 2000000,
          item_count: 4,
          summary: { files: ["save0.rws"] },
        },
        created_at: "2026-09-08T16:05:00Z",
      };

      render(
        <ConflictResolverModal
          open={true}
          conflict={mockConflict}
          onClose={() => {}}
        />
      );

      // Local card should have "Newer", "Larger", "More items"
      const localCard = screen.getByTestId("local-version-card");
      expect(localCard.textContent).toContain("Newer");
      expect(localCard.textContent).toContain("Larger");
      expect(localCard.textContent).toContain("More items");

      // Cloud card should NOT have them
      const cloudCard = screen.getByTestId("cloud-version-card");
      expect(cloudCard.textContent).not.toContain("Newer");
      expect(cloudCard.textContent).not.toContain("Larger");
      expect(cloudCard.textContent).not.toContain("More items");
    });

    it("handles Keep Both with custom archive backup naming and persists resolution", async () => {
      const mockConflict: GameConflictRecord = {
        id: "conflict_stress_2",
        user_id: "test-user-id",
        game_id: "barotrauma",
        category: "submarines",
        status: "active",
        local_version: {
          timestamp: "2026-09-08T12:00:00Z",
          content_hash: "local_sub_hash",
          file_size: 1024,
          item_count: 1,
        },
        cloud_version: {
          snapshot_id: "snap_sub_cloud",
          timestamp: "2026-09-08T14:00:00Z",
          content_hash: "cloud_sub_hash",
          file_size: 1024,
          item_count: 1,
        },
        created_at: "2026-09-08T14:05:00Z",
      };

      const resolveConflictSpy = vi.spyOn(gameSyncService, "resolveConflict").mockResolvedValue({
        success: true,
        resolution: "keep_both",
        conflict: mockConflict,
        archived_snapshot: null,
      });

      const onResolvedMock = vi.fn();
      const onCloseMock = vi.fn();

      render(
        <ConflictResolverModal
          open={true}
          conflict={mockConflict}
          onClose={onCloseMock}
          onResolved={onResolvedMock}
        />
      );

      // Verify default choice is keep_both
      expect(screen.getByTestId("choice-keep-both")).toBeDefined();
      const archiveInput = screen.getByTestId("archive-name-input");
      expect(archiveInput).toBeDefined();

      // Enter custom archive backup name
      fireEvent.change(archiveInput, { target: { value: "MySubmarine_PreConflict_Backup" } });

      // Confirm
      fireEvent.click(screen.getByTestId("confirm-resolution-btn"));

      await waitFor(() => {
        expect(resolveConflictSpy).toHaveBeenCalledWith({
          conflictId: "conflict_stress_2",
          resolution: "keep_both",
          archiveName: "MySubmarine_PreConflict_Backup",
        });
        expect(onResolvedMock).toHaveBeenCalled();
        expect(onCloseMock).toHaveBeenCalled();
      });

      resolveConflictSpy.mockRestore();
    });
  });

  // ==========================================================================
  // SECTION 5: Tab Navigation Stability, Rapid Switching & State Isolation
  // ==========================================================================
  describe("Tab Navigation Stability & State Isolation in GameLibrary", () => {
    it("handles rapid alternating tab switches between Overview and Saves & Mods without state corruption", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("RimWorld")).toBeDefined();
      });

      // Open RimWorld card
      fireEvent.click(screen.getByText("RimWorld"));

      await waitFor(() => {
        expect(screen.getByTestId("game-details-tab-bar")).toBeDefined();
      });

      const overviewBtn = screen.getByTestId("tab-btn-overview");
      const savesModsBtn = screen.getByTestId("tab-btn-saves-mods");

      // Perform 10 rapid alternating tab switches
      for (let i = 0; i < 5; i++) {
        fireEvent.click(savesModsBtn);
        fireEvent.click(overviewBtn);
      }

      // Finally click saves_mods
      fireEvent.click(savesModsBtn);

      await waitFor(() => {
        expect(screen.getByTestId("game-saves-mods-tab")).toBeDefined();
      });

      // Switch back to overview
      fireEvent.click(overviewBtn);

      await waitFor(() => {
        expect(screen.getByText("Friends with this Game")).toBeDefined();
      });
    });

    it("verifies state isolation: closing details dialog on Saves & Mods resets next game to Overview", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("RimWorld")).toBeDefined();
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      // 1. Open RimWorld
      fireEvent.click(screen.getByText("RimWorld"));

      await waitFor(() => {
        expect(screen.getByTestId("tab-btn-saves-mods")).toBeDefined();
      });

      // 2. Switch RimWorld to Saves & Mods tab
      fireEvent.click(screen.getByTestId("tab-btn-saves-mods"));

      await waitFor(() => {
        expect(screen.getByTestId("game-saves-mods-tab")).toBeDefined();
      });

      // 3. Close the dialog using footer button
      const closeButtons = screen.getAllByRole("button", { name: /Close/i });
      fireEvent.click(closeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByTestId("game-details-tab-bar")).toBeNull();
      });

      // 4. Open Cyberpunk 2077
      fireEvent.click(screen.getByText("Cyberpunk 2077"));

      // 5. Must strictly default to Overview tab!
      await waitFor(() => {
        expect(screen.getByTestId("game-details-tab-bar")).toBeDefined();
        expect(screen.getByText("Friends with this Game")).toBeDefined();
        expect(screen.queryByTestId("game-saves-mods-tab")).toBeNull();
        expect(screen.queryByTestId("unsupported-game-view")).toBeNull();
      });
    });

    it("verifies opening Game Details directly from SupportedGamesModal external link", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId("supported-games-btn")).toBeDefined();
      });

      // Open Supported Games modal
      fireEvent.click(screen.getByTestId("supported-games-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("supported-games-modal")).toBeDefined();
        expect(screen.getByTestId("supported-game-card-rimworld")).toBeDefined();
      });

      // Find the external link button for RimWorld
      const rimworldCard = screen.getByTestId("supported-game-card-rimworld");
      const externalLinkBtn = rimworldCard.querySelector("button.text-cyan-400");
      expect(externalLinkBtn).not.toBeNull();

      // Click external link button
      fireEvent.click(externalLinkBtn!);

      // SupportedGamesModal should close
      await waitFor(() => {
        expect(screen.queryByTestId("supported-games-modal")).toBeNull();
      });

      // Game Details dialog should open with requested "saves_mods" tab preserved
      await waitFor(() => {
        expect(screen.getByTestId("game-saves-mods-tab")).toBeDefined();
        expect(screen.queryByText("Friends with this Game")).toBeNull();
      });
    });
  });
});

