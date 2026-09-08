/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { SupportedGamesModal } from "./SupportedGamesModal";
import { GameSavesAndModsTab } from "./GameSavesAndModsTab";
import { ConflictResolverModal } from "./ConflictResolverModal";
import { SUPPORTED_GAMES, getSupportedGame, type SupportedGameId } from "@/lib/supportedGames";
import { db } from "@/lib/db";
import type { InstalledGame } from "@/lib/desktopBridge";
import type { GameConflictRecord, GameSnapshotRecord } from "../../../../server/lib/dataStore";

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.confirm
global.confirm = vi.fn(() => true);

vi.mock("@/lib/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    isDesktopBridgeAvailable: vi.fn(() => true),
    pickGameExecutable: vi.fn().mockResolvedValue({
      title: "RimWorld",
      executablePath: "C:\\Games\\RimWorld\\RimWorldWin64.exe",
    }),
    setupGameBridgeListeners: vi.fn(),
    addPushEventListener: vi.fn(),
  };
});

// Hoisted mock state
const { mockSnapshots, mockActiveConflicts, rpcInvocations } = vi.hoisted(() => {
  const rpcInvocations: Array<{ name: string; args: any }> = [];

  const mockActiveConflicts: Record<string, GameConflictRecord> = {
    rimworld: {
      id: "conflict_rimworld_saves_1",
      user_id: "user_challenger",
      game_id: "rimworld",
      category: "saves",
      status: "active",
      local_version: {
        timestamp: "2026-09-08T17:00:00Z", // Newer
        content_hash: "abcdef1234567890abcdef1234567890abcdef12",
        file_size: 5242880, // 5MB (Larger)
        item_count: 12, // More items
        summary: { files: ["Permadeath_1.rws"] },
      },
      cloud_version: {
        snapshot_id: "snap_cloud_rw_1",
        timestamp: "2026-09-08T12:00:00Z",
        content_hash: "123456abcdef7890123456abcdef7890123456ab",
        file_size: 2097152, // 2MB
        item_count: 5,
        summary: { files: ["Colony_Old.rws"] },
      },
      created_at: "2026-09-08T17:05:00Z",
    },
  };

  const mockSnapshots: GameSnapshotRecord[] = [
    {
      id: "snap_auto_modlist_1",
      user_id: "user_challenger",
      game_id: "rimworld",
      category: "mod_lists",
      name: "Auto-Synced Mod List - 2026-09-08",
      is_manual: false,
      created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), // 4h ago
      updated_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 20 * 3600 * 1000).toISOString(), // 20h remaining
      content_hash: "hash_mod_111",
      file_size: 4096,
      item_count: 42,
    },
    {
      id: "snap_manual_save_1",
      user_id: "user_challenger",
      game_id: "rimworld",
      category: "saves",
      name: "Year 10 Megacity Endgame",
      is_manual: true,
      expires_at: null, // Permanent
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-01T10:00:00Z",
      content_hash: "hash_save_222",
      file_size: 15728640, // 15MB
      item_count: 8,
    },
    {
      id: "snap_archived_backup_1",
      user_id: "user_challenger",
      game_id: "rimworld",
      category: "saves",
      name: "RimWorld_saves_backup_2026-09-07",
      is_manual: true,
      is_archived: true,
      archive_reason: "conflict_alternate_cloud",
      expires_at: null,
      created_at: "2026-09-07T14:00:00Z",
      updated_at: "2026-09-07T14:00:00Z",
      content_hash: "hash_arch_333",
      file_size: 2097152,
      item_count: 5,
    },
  ];

  return { mockSnapshots, mockActiveConflicts, rpcInvocations };
});

vi.mock("@/lib/db", () => {
  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user_challenger" } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "user_challenger" } } },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    rpc: vi.fn().mockImplementation((name: string, args: any) => {
      rpcInvocations.push({ name, args });

      if (name === "get_game_sync_configs") {
        return Promise.resolve({
          data: {
            config: {
              game_id: args?.game_id || "rimworld",
              enabled: true,
              categories: {
                saves: true,
                custom_mods: true,
                ideologies: true,
                xenotypes: true,
                mod_lists: true,
              },
            },
            configs: SUPPORTED_GAMES.map((g) => ({
              game_id: g.id,
              enabled: true,
              categories: Object.fromEntries(g.categories.map((c) => [c.id, true])),
            })),
          },
          error: null,
        });
      }

      if (name === "get_game_snapshots") {
        const category = args?.category;
        let filtered = [...mockSnapshots];
        if (category && category !== "all") {
          filtered = filtered.filter((s) => s.category === category);
        }
        return Promise.resolve({
          data: { snapshots: filtered },
          error: null,
        });
      }

      if (name === "get_game_conflicts") {
        const list = Object.values(mockActiveConflicts);
        return Promise.resolve({
          data: { conflicts: list },
          error: null,
        });
      }

      if (name === "upsert_game_sync_config") {
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (name === "create_game_snapshot") {
        return Promise.resolve({
          data: { success: true, snapshot_id: "snap_manual_" + Date.now() },
          error: null,
        });
      }

      if (name === "promote_game_snapshot") {
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (name === "delete_game_snapshot") {
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (name === "restore_game_snapshot") {
        return Promise.resolve({ data: { success: true }, error: null });
      }

      if (name === "resolve_game_conflict") {
        const conflict = mockActiveConflicts[args?.game_id || "rimworld"] || mockActiveConflicts.rimworld;
        return Promise.resolve({
          data: {
            success: true,
            resolution: args?.resolution,
            archive_name: args?.archive_name,
            conflict: {
              ...conflict,
              status: "resolved",
              resolution: args?.resolution,
            },
          },
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    }),
  };

  return { db: mockClient, supabase: mockClient };
});

describe("Empirical Challenger: E2E & Functional Acceptance Criteria", () => {
  beforeEach(() => {
    rpcInvocations.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // =========================================================================
  // AC 1: ALL 8 GAMES RECOGNIZED WITH EXACT DATA CATEGORIES IN UI
  // =========================================================================
  describe("AC 1: 8 Supported Games & Exact Data Category Schemas", () => {
    const EXPECTED_SPEC: Record<SupportedGameId, string[]> = {
      rain_world: ["data", "custom_mods", "mod_lists"],
      rimworld: ["saves", "custom_mods", "ideologies", "xenotypes", "mod_lists"],
      library_of_ruina: ["data"],
      lobotomy_corporation: ["data"],
      ostranauts: ["saves"],
      barotrauma: ["submarines", "saves", "custom_mods", "mod_lists"],
      kenshi: ["saves", "mod_lists"],
      space_haven: ["saves"],
    };

    it("verifies all 8 games are defined in SUPPORTED_GAMES with exact expected categories", () => {
      expect(SUPPORTED_GAMES.length).toBe(8);

      for (const [gameId, expectedCategories] of Object.entries(EXPECTED_SPEC)) {
        const gameDef = getSupportedGame(gameId);
        expect(gameDef).toBeDefined();
        const actualCatIds = gameDef!.categories.map((c) => c.id);
        expect(actualCatIds).toEqual(expectedCategories);
      }
    });

    it("renders all 8 game cards in SupportedGamesModal with exact category toggle elements", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("supported-games-modal")).toBeDefined();
      });

      // Assert all 8 titles rendered in modal
      expect(screen.getByText("Rain World")).toBeDefined();
      expect(screen.getByText("RimWorld")).toBeDefined();
      expect(screen.getByText("Library Of Ruina")).toBeDefined();
      expect(screen.getByText("Lobotomy Corporation")).toBeDefined();
      expect(screen.getByText("Ostranauts")).toBeDefined();
      expect(screen.getByText("Barotrauma")).toBeDefined();
      expect(screen.getByText("Kenshi")).toBeDefined();
      expect(screen.getByText("Space Haven")).toBeDefined();

      // For every single game, verify every expected category toggle button exists
      for (const [gameId, catIds] of Object.entries(EXPECTED_SPEC)) {
        for (const catId of catIds) {
          const toggle = screen.getByTestId(`category-toggle-${gameId}-${catId}`);
          expect(toggle).toBeDefined();
        }
      }
    });

    it("filters supported games dynamically by game name, category, or title", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("search-supported-games-input")).toBeDefined();
      });

      const searchInput = screen.getByTestId("search-supported-games-input");

      // Search "submarines" -> only Barotrauma has submarines
      fireEvent.change(searchInput, { target: { value: "submarines" } });
      expect(screen.getByText("Barotrauma")).toBeDefined();
      expect(screen.queryByText("RimWorld")).toBeNull();
      expect(screen.queryByText("Rain World")).toBeNull();

      // Search "xenotypes" -> only RimWorld has xenotypes
      fireEvent.change(searchInput, { target: { value: "xenotypes" } });
      expect(screen.getByText("RimWorld")).toBeDefined();
      expect(screen.queryByText("Barotrauma")).toBeNull();

      // Clear search -> all 8 returned
      fireEvent.change(searchInput, { target: { value: "" } });
      expect(screen.getByText("Rain World")).toBeDefined();
      expect(screen.getByText("RimWorld")).toBeDefined();
      expect(screen.getByText("Space Haven")).toBeDefined();
    });

    it("renders GameSavesAndModsTab with exact categories for each supported game and fallback for unsupported", async () => {
      // Test Barotrauma (submarines, saves, custom_mods, mod_lists)
      const baroDef = getSupportedGame("barotrauma")!;
      const mockBaroGame: InstalledGame = {
        id: "barotrauma",
        title: "Barotrauma",
        platform: "steam",
        isCustom: false,
      };

      const { unmount } = render(
        <GameSavesAndModsTab game={mockBaroGame} supportedDef={baroDef} />
      );

      await waitFor(() => {
        expect(screen.getByTestId("game-saves-mods-tab")).toBeDefined();
      });

      expect(screen.getByTestId("category-config-row-submarines")).toBeDefined();
      expect(screen.getByTestId("category-config-row-saves")).toBeDefined();
      expect(screen.getByTestId("category-config-row-custom_mods")).toBeDefined();
      expect(screen.getByTestId("category-config-row-mod_lists")).toBeDefined();
      // Should NOT have xenotypes
      expect(screen.queryByTestId("category-config-row-xenotypes")).toBeNull();

      unmount();

      // Test Unsupported Game (e.g. Cyberpunk 2077)
      const unsupportedGame: InstalledGame = {
        id: "steam_1091500",
        title: "Cyberpunk 2077",
        platform: "steam",
        isCustom: false,
      };

      render(<GameSavesAndModsTab game={unsupportedGame} />);

      await waitFor(() => {
        expect(screen.getByTestId("unsupported-game-view")).toBeDefined();
        expect(screen.getByText("Cloud Sync Not Supported for This Title")).toBeDefined();
      });
    });
  });

  // =========================================================================
  // AC 2: CATEGORY SYNC TOGGLES OPERATE INDEPENDENTLY & PERSIST STATE
  // =========================================================================
  describe("AC 2: Category Sync Toggles Operate Independently", () => {
    it("toggles single category without mutating other categories in SupportedGamesModal", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("category-toggle-rimworld-xenotypes")).toBeDefined();
      });

      // Toggle RimWorld xenotypes
      fireEvent.click(screen.getByTestId("category-toggle-rimworld-xenotypes"));

      await waitFor(() => {
        const call = rpcInvocations.find(
          (c) => c.name === "upsert_game_sync_config" && c.args.game_id === "rimworld"
        );
        expect(call).toBeDefined();
        expect(call!.args.categories).toBeDefined();
        // Specifically toggled xenotypes to false
        expect(call!.args.categories.xenotypes).toBe(false);
      });
    });

    it("toggles master game switch and enables/disables all category controls", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("master-switch-kenshi")).toBeDefined();
      });

      // Toggle Kenshi master switch off
      fireEvent.click(screen.getByTestId("master-switch-kenshi"));

      await waitFor(() => {
        const call = rpcInvocations.find(
          (c) => c.name === "upsert_game_sync_config" && c.args.game_id === "kenshi"
        );
        expect(call).toBeDefined();
        expect(call!.args.enabled).toBe(false);
      });

      // Verify category buttons are disabled when master switch is off
      const kenshiSavesBtn = screen.getByTestId("category-toggle-kenshi-saves") as HTMLButtonElement;
      expect(kenshiSavesBtn.disabled).toBe(true);
    });

    it("executes Enable All and Disable All global batch actions across all 8 games", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("disable-all-btn")).toBeDefined();
      });

      // Click Disable All
      fireEvent.click(screen.getByTestId("disable-all-btn"));

      await waitFor(() => {
        const disableCalls = rpcInvocations.filter(
          (c) => c.name === "upsert_game_sync_config" && c.args.enabled === false
        );
        // All 8 games disabled
        expect(disableCalls.length).toBe(8);
      });

      rpcInvocations.length = 0;

      // Click Enable All
      fireEvent.click(screen.getByTestId("enable-all-btn"));

      await waitFor(() => {
        const enableCalls = rpcInvocations.filter(
          (c) => c.name === "upsert_game_sync_config" && c.args.enabled === true
        );
        expect(enableCalls.length).toBe(8);
      });
    });

    it("verifies independent category switches inside GameSavesAndModsTab", async () => {
      const rwDef = getSupportedGame("rimworld")!;
      const mockGame: InstalledGame = {
        id: "rimworld",
        title: "RimWorld",
        platform: "steam",
        isCustom: false,
      };

      render(<GameSavesAndModsTab game={mockGame} supportedDef={rwDef} />);

      await waitFor(() => {
        expect(screen.getByTestId("category-switch-mod_lists")).toBeDefined();
      });

      // Toggle mod_lists category switch
      fireEvent.click(screen.getByTestId("category-switch-mod_lists"));

      await waitFor(() => {
        const call = rpcInvocations.find(
          (c) => c.name === "upsert_game_sync_config" && c.args.game_id === "rimworld"
        );
        expect(call).toBeDefined();
        expect(call!.args.categories.mod_lists).toBe(false);
      });
    });
  });

  // =========================================================================
  // AC 3: 24-HOUR AUTO-SYNC RETENTION VS PERMANENT MANUAL SAVES
  // =========================================================================
  describe("AC 3: 24-Hour Mod List Retention vs Permanent Manual Saves", () => {
    const rwDef = getSupportedGame("rimworld")!;
    const mockGame: InstalledGame = {
      id: "rimworld",
      title: "RimWorld",
      platform: "steam",
      isCustom: false,
    };

    it("displays 24h Auto-Sync badge on expiring mod list and Permanent Save badge on manual snapshot", async () => {
      render(<GameSavesAndModsTab game={mockGame} supportedDef={rwDef} />);

      await waitFor(() => {
        expect(screen.getByTestId("snapshots-list")).toBeDefined();
      });

      // 1. Check Auto-Synced Mod List item
      const autoItem = screen.getByTestId("snapshot-item-snap_auto_modlist_1");
      expect(autoItem).toBeDefined();
      expect(autoItem.textContent).toContain("24h Auto-Sync");
      expect(autoItem.textContent).toContain("Expires in");

      // 2. Check Permanent Save item
      const manualItem = screen.getByTestId("snapshot-item-snap_manual_save_1");
      expect(manualItem).toBeDefined();
      expect(manualItem.textContent).toContain("Permanent Save");
      expect(manualItem.textContent).not.toContain("Expires in");

      // 3. Check Archived Backup item
      const archItem = screen.getByTestId("snapshot-item-snap_archived_backup_1");
      expect(archItem).toBeDefined();
      expect(archItem.textContent).toContain("Archived Backup");
    });

    it("creates a manual snapshot with user-supplied name and persists as permanent save", async () => {
      render(<GameSavesAndModsTab game={mockGame} supportedDef={rwDef} />);

      await waitFor(() => {
        expect(screen.getByTestId("create-snapshot-btn")).toBeDefined();
      });

      const nameInput = screen.getByTestId("snapshot-name-input");
      fireEvent.change(nameInput, {
        target: { value: "Pre-Raid Defensive Formation" },
      });

      const catSelect = screen.getByTestId("snapshot-category-select");
      fireEvent.change(catSelect, { target: { value: "saves" } });

      fireEvent.click(screen.getByTestId("create-snapshot-btn"));

      await waitFor(() => {
        const createCall = rpcInvocations.find((c) => c.name === "create_game_snapshot");
        expect(createCall).toBeDefined();
        expect(createCall!.args.game_id).toBe("rimworld");
        expect(createCall!.args.name).toBe("Pre-Raid Defensive Formation");
        expect(createCall!.args.is_manual).toBe(true);
      });
    });

    it("promotes (pins) a 24h auto-sync snapshot to permanent status", async () => {
      render(<GameSavesAndModsTab game={mockGame} supportedDef={rwDef} />);

      await waitFor(() => {
        expect(
          screen.getByTestId("pin-snapshot-btn-snap_auto_modlist_1")
        ).toBeDefined();
      });

      // Pin the auto-sync snapshot
      fireEvent.click(screen.getByTestId("pin-snapshot-btn-snap_auto_modlist_1"));

      await waitFor(() => {
        const promoteCall = rpcInvocations.find(
          (c) => c.name === "promote_game_snapshot"
        );
        expect(promoteCall).toBeDefined();
        expect(promoteCall!.args.snapshot_id).toBe("snap_auto_modlist_1");
      });
    });

    it("filters snapshot list by category pills", async () => {
      render(<GameSavesAndModsTab game={mockGame} supportedDef={rwDef} />);

      await waitFor(() => {
        expect(screen.getByTestId("snapshots-list")).toBeDefined();
      });

      // Click "Colony Saves" category pill
      const savesPill = screen.getByRole("button", { name: /Colony Saves/i });
      fireEvent.click(savesPill);

      // Saves snapshots should remain, mod_lists snapshot should be hidden
      expect(screen.getByTestId("snapshot-item-snap_manual_save_1")).toBeDefined();
      expect(screen.queryByTestId("snapshot-item-snap_auto_modlist_1")).toBeNull();
    });
  });

  // =========================================================================
  // AC 4: CONFLICT DETECTION & THREE-WAY RESOLUTION EXECUTION
  // =========================================================================
  describe("AC 4: Conflict Detection and Keep Local / Keep Cloud / Keep Both Resolution", () => {
    it("detects conflict in SupportedGamesModal and reveals conflict warning with resolve button", async () => {
      const mockOpenResolver = vi.fn();

      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[]}
          onOpenConflictResolver={mockOpenResolver}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("resolve-conflict-btn-rimworld")).toBeDefined();
      });

      // Badge indicates Paused (Conflict)
      const rimworldCard = screen.getByTestId("supported-game-card-rimworld");
      expect(rimworldCard.textContent).toContain("Paused (Conflict)");

      // Click Resolve Conflict button
      fireEvent.click(screen.getByTestId("resolve-conflict-btn-rimworld"));
      expect(mockOpenResolver).toHaveBeenCalledWith(
        expect.objectContaining({ id: "conflict_rimworld_saves_1" })
      );
    });

    it("detects conflict banner in GameSavesAndModsTab", async () => {
      const rwDef = getSupportedGame("rimworld")!;
      const mockGame: InstalledGame = {
        id: "rimworld",
        title: "RimWorld",
        platform: "steam",
        isCustom: false,
      };
      const mockOpenResolver = vi.fn();

      render(
        <GameSavesAndModsTab
          game={mockGame}
          supportedDef={rwDef}
          onOpenConflictResolver={mockOpenResolver}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("conflict-warning-banner")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("resolve-conflict-banner-btn"));
      expect(mockOpenResolver).toHaveBeenCalled();
    });

    it("verifies ConflictResolverModal side-by-side diff analysis and executes Keep Local", async () => {
      const conflict = mockActiveConflicts.rimworld;
      const onResolved = vi.fn();
      const onClose = vi.fn();

      render(
        <ConflictResolverModal
          open={true}
          conflict={conflict}
          onClose={onClose}
          onResolved={onResolved}
        />
      );

      // Verify diff indicators: local is newer (5:00 vs 12:00) and larger (5MB vs 2MB)
      const localCard = screen.getByTestId("local-version-card");
      expect(localCard.textContent).toContain("Newer");
      expect(localCard.textContent).toContain("Larger");
      expect(localCard.textContent).toContain("More items");

      // Select Keep Local
      fireEvent.click(screen.getByTestId("choice-keep-local"));
      fireEvent.click(screen.getByTestId("confirm-resolution-btn"));

      await waitFor(() => {
        const resolveCall = rpcInvocations.find(
          (c) => c.name === "resolve_game_conflict"
        );
        expect(resolveCall).toBeDefined();
        expect(resolveCall!.args.conflict_id).toBe("conflict_rimworld_saves_1");
        expect(resolveCall!.args.resolution).toBe("keep_local");
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("executes Keep Cloud resolution in ConflictResolverModal", async () => {
      const conflict = mockActiveConflicts.rimworld;
      const onResolved = vi.fn();
      const onClose = vi.fn();

      render(
        <ConflictResolverModal
          open={true}
          conflict={conflict}
          onClose={onClose}
          onResolved={onResolved}
        />
      );

      // Select Keep Cloud
      fireEvent.click(screen.getByTestId("choice-keep-cloud"));
      fireEvent.click(screen.getByTestId("confirm-resolution-btn"));

      await waitFor(() => {
        const resolveCall = rpcInvocations.find(
          (c) => c.name === "resolve_game_conflict"
        );
        expect(resolveCall).toBeDefined();
        expect(resolveCall!.args.resolution).toBe("keep_cloud");
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("executes Keep Both resolution with custom archive backup name", async () => {
      const conflict = mockActiveConflicts.rimworld;
      const onResolved = vi.fn();
      const onClose = vi.fn();

      render(
        <ConflictResolverModal
          open={true}
          conflict={conflict}
          onClose={onClose}
          onResolved={onResolved}
        />
      );

      // Select Keep Both
      fireEvent.click(screen.getByTestId("choice-keep-both"));
      expect(screen.getByTestId("archive-name-input")).toBeDefined();

      const archiveInput = screen.getByTestId("archive-name-input");
      fireEvent.change(archiveInput, {
        target: { value: "RimWorld_Safety_Archive_123" },
      });

      fireEvent.click(screen.getByTestId("confirm-resolution-btn"));

      await waitFor(() => {
        const resolveCall = rpcInvocations.find(
          (c) => c.name === "resolve_game_conflict"
        );
        expect(resolveCall).toBeDefined();
        expect(resolveCall!.args.resolution).toBe("keep_both");
        expect(resolveCall!.args.archive_name).toBe("RimWorld_Safety_Archive_123");
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // ADVERSARIAL CHALLENGES & BOUNDARY CONDITIONS
  // =========================================================================
  describe("Adversarial Challenges & Defensive Constraints", () => {
    it("blocks path traversal in custom paths configuration", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Rain World")).toBeDefined();
      });

      // Expand custom path configuration for Rain World (first game)
      const expandBtn = screen.getAllByRole("button", { name: /Path Configuration/i })[0];
      fireEvent.click(expandBtn);

      await waitFor(() => {
        expect(screen.getByTestId("custom-install-path-input-rain_world")).toBeDefined();
      });

      const installInput = screen.getByTestId("custom-install-path-input-rain_world");
      // Malicious traversal attempt
      fireEvent.change(installInput, {
        target: { value: "C:\\Games\\..\\..\\Windows\\System32" },
      });

      fireEvent.click(screen.getByTestId("save-custom-paths-btn-rain_world"));

      await waitFor(() => {
        // Security error is rendered
        expect(
          screen.getByText(/Path traversal outside allowed directories is blocked for security/i)
        ).toBeDefined();
      });

      // Assert DB RPC was NOT called with the malicious path
      const saveCalls = rpcInvocations.filter(
        (c) =>
          c.name === "upsert_game_sync_config" &&
          c.args.custom_paths?.install_path?.includes("System32")
      );
      expect(saveCalls.length).toBe(0);
    });

    it("blocks official expansion bundling in Custom Mod packaging", async () => {
      const rwDef = getSupportedGame("rimworld")!;
      const mockGame: InstalledGame = {
        id: "rimworld",
        title: "RimWorld",
        platform: "steam",
        isCustom: false,
      };

      render(<GameSavesAndModsTab game={mockGame} supportedDef={rwDef} />);

      await waitFor(() => {
        expect(screen.getByTestId("custom-mod-name-input")).toBeDefined();
      });

      const input = screen.getByTestId("custom-mod-name-input");
      const packageBtn = screen.getByTestId("package-mod-btn");

      // Attempt to package official expansion "Biotech"
      fireEvent.change(input, { target: { value: "Biotech" } });
      fireEvent.click(packageBtn);

      // Error toast or blocking occurs, input is NOT cleared
      expect((input as HTMLInputElement).value).toBe("Biotech");

      // Attempt "Royalty"
      fireEvent.change(input, { target: { value: "royalty" } });
      fireEvent.click(packageBtn);
      expect((input as HTMLInputElement).value).toBe("royalty");
    });
  });
});
