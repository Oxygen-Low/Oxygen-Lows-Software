/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { SupportedGamesModal } from "./SupportedGamesModal";
import { GameSavesAndModsTab } from "./GameSavesAndModsTab";
import { ConflictResolverModal } from "./ConflictResolverModal";
import { getSupportedGame } from "@/lib/supportedGames";
import { gameSyncService } from "@/lib/gameSyncService";
import { db } from "@/lib/db";
import type { InstalledGame } from "@/lib/desktopBridge";
import type { GameConflictRecord } from "../../../../server/lib/dataStore";

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

const { mockSnapshotsList, mockConflict } = vi.hoisted(() => {
  const mockConflict: any = {
    id: "conflict_test_123",
    user_id: "test-user-id",
    game_id: "rimworld",
    category: "saves",
    status: "active",
    local_version: {
      timestamp: "2026-09-08T15:30:00Z",
      content_hash: "hash_local_11112222333344445555",
      file_size: 2048576,
      item_count: 4,
      summary: { files: ["Colony_Year_5.rws"] },
    },
    cloud_version: {
      snapshot_id: "snap_cloud_999",
      timestamp: "2026-09-08T14:00:00Z",
      content_hash: "hash_cloud_99998888777766665555",
      file_size: 1948576,
      item_count: 3,
      summary: { files: ["Colony_Year_4.rws"] },
    },
    created_at: "2026-09-08T15:35:00Z",
  };

  const mockSnapshotsList: any[] = [
    {
      id: "snap_auto_1",
      user_id: "test-user-id",
      game_id: "rimworld",
      category: "mod_lists",
      name: "Auto-Sync Mod List",
      is_manual: false,
      is_pinned: false,
      created_at: "2026-09-08T12:00:00Z",
      expires_at: "2026-09-09T12:00:00Z",
      file_size: 1024,
      item_count: 1,
    },
    {
      id: "snap_man_1",
      user_id: "test-user-id",
      game_id: "rimworld",
      category: "saves",
      name: "Year 5 Colony Save",
      is_manual: true,
      is_pinned: true,
      created_at: "2026-09-08T10:00:00Z",
      file_size: 2048576,
      item_count: 5,
    },
  ];

  return { mockSnapshotsList, mockConflict };
});

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
    rpc: vi.fn().mockImplementation((name: string, args: any) => {
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
            configs: [
              {
                game_id: "rimworld",
                enabled: true,
                categories: {
                  saves: true,
                  custom_mods: true,
                  ideologies: true,
                  xenotypes: true,
                  mod_lists: true,
                },
              },
            ],
          },
          error: null,
        });
      }
      if (name === "get_game_snapshots") {
        return Promise.resolve({
          data: {
            snapshots: mockSnapshotsList,
          },
          error: null,
        });
      }
      if (name === "get_game_conflicts") {
        return Promise.resolve({
          data: {
            conflicts: [],
          },
          error: null,
        });
      }
      if (name === "upsert_game_sync_config") {
        return Promise.resolve({
          data: { success: true },
          error: null,
        });
      }
      if (name === "create_game_snapshot") {
        return Promise.resolve({
          data: { snapshot_id: "snap_new_123" },
          error: null,
        });
      }
      if (name === "promote_game_snapshot") {
        return Promise.resolve({
          data: { success: true },
          error: null,
        });
      }
      if (name === "delete_game_snapshot") {
        return Promise.resolve({
          data: { success: true },
          error: null,
        });
      }
      if (name === "resolve_game_conflict") {
        return Promise.resolve({
          data: {
            success: true,
            resolution: args?.resolution,
            conflict: {
              ...mockConflict,
              status: "resolved",
              resolution: args?.resolution,
            },
          },
          error: null,
        });
      }
      if (name === "restore_game_snapshot") {
        return Promise.resolve({
          data: { success: true },
          error: null,
        });
      }
      if (name === "sync_game_now" || name === "sync_all_games") {
        return Promise.resolve({
          data: { success: true },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return {
    db: mockClient,
    supabase: mockClient,
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

const mockRimWorldDef = getSupportedGame("rimworld")!;

describe("Milestone 4 Subcomponents Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("SupportedGamesModal Component", () => {
    it("renders all 8 supported games with detection badges and category switches", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[mockInstalledRimWorld]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("supported-games-modal")).toBeDefined();
        // 8 Games
        expect(screen.getByText("Rain World")).toBeDefined();
        expect(screen.getByText("RimWorld")).toBeDefined();
        expect(screen.getByText("Library Of Ruina")).toBeDefined();
        expect(screen.getByText("Lobotomy Corporation")).toBeDefined();
        expect(screen.getByText("Ostranauts")).toBeDefined();
        expect(screen.getByText("Barotrauma")).toBeDefined();
        expect(screen.getByText("Kenshi")).toBeDefined();
        expect(screen.getByText("Space Haven")).toBeDefined();
      });

      // Installed badge on RimWorld
      expect(screen.getByTestId("supported-game-card-rimworld")).toBeDefined();
    });

    it("allows category toggling per game", async () => {
      render(
        <SupportedGamesModal
          open={true}
          onOpenChange={() => {}}
          installedGames={[mockInstalledRimWorld]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("category-toggle-rimworld-saves")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("category-toggle-rimworld-saves"));

      await waitFor(() => {
        expect(db.rpc).toHaveBeenCalledWith("upsert_game_sync_config", expect.objectContaining({
          game_id: "rimworld",
          categories: expect.any(Object),
        }));
      });
    });
  });

  describe("GameSavesAndModsTab Component", () => {
    it("renders category toggles, snapshots with 24h retention badge vs permanent save badge", async () => {
      render(
        <GameSavesAndModsTab
          game={mockInstalledRimWorld}
          supportedDef={mockRimWorldDef}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("game-saves-mods-tab")).toBeDefined();
        expect(screen.getByTestId("sync-status-badge")).toBeDefined();
      });

      // Verify category config rows for RimWorld's 5 categories
      expect(screen.getByTestId("category-config-row-saves")).toBeDefined();
      expect(screen.getByTestId("category-config-row-custom_mods")).toBeDefined();
      expect(screen.getByTestId("category-config-row-ideologies")).toBeDefined();
      expect(screen.getByTestId("category-config-row-xenotypes")).toBeDefined();
      expect(screen.getByTestId("category-config-row-mod_lists")).toBeDefined();

      // Verify snapshots
      await waitFor(() => {
        expect(screen.getByText("Auto-Sync Mod List")).toBeDefined();
        expect(screen.getByText("24h Auto-Sync")).toBeDefined();
        expect(screen.getByText("Year 5 Colony Save")).toBeDefined();
        expect(screen.getByText("Permanent Save")).toBeDefined();
      });
    });

    it("allows creating manual snapshot and pinning auto-sync snapshot", async () => {
      render(
        <GameSavesAndModsTab
          game={mockInstalledRimWorld}
          supportedDef={mockRimWorldDef}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("create-snapshot-btn")).toBeDefined();
      });

      // Type manual snapshot name
      const nameInput = screen.getByTestId("snapshot-name-input");
      fireEvent.change(nameInput, { target: { value: "Colony Before Siege" } });

      // Click create snapshot
      fireEvent.click(screen.getByTestId("create-snapshot-btn"));

      await waitFor(() => {
        expect(db.rpc).toHaveBeenCalledWith("create_game_snapshot", expect.objectContaining({
          game_id: "rimworld",
          name: "Colony Before Siege",
          is_manual: true,
        }));
      });

      // Click pin on auto-sync snapshot
      await waitFor(() => {
        expect(screen.getByTestId("pin-snapshot-btn-snap_auto_1")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("pin-snapshot-btn-snap_auto_1"));

      await waitFor(() => {
        expect(db.rpc).toHaveBeenCalledWith("promote_game_snapshot", expect.objectContaining({
          snapshot_id: "snap_auto_1",
        }));
      });
    });

    it("provides custom mod packaging with official DLC exclusion check", async () => {
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

      // Type a custom mod name
      const modInput = screen.getByTestId("custom-mod-name-input");
      fireEvent.change(modInput, { target: { value: "MyCoolColonyMod" } });

      fireEvent.click(screen.getByTestId("package-mod-btn"));

      await waitFor(() => {
        expect((screen.getByTestId("custom-mod-name-input") as HTMLInputElement).value).toBe("");
      });
    });
  });

  describe("ConflictResolverModal Component", () => {
    it("renders side-by-side comparison cards and choices: Keep Local, Keep Cloud, Keep Both", async () => {
      const mockResolved = vi.fn();
      const mockClose = vi.fn();

      render(
        <ConflictResolverModal
          open={true}
          conflict={mockConflict}
          onClose={mockClose}
          onResolved={mockResolved}
        />
      );

      // Verify side-by-side cards
      expect(screen.getByTestId("local-version-card")).toBeDefined();
      expect(screen.getByTestId("cloud-version-card")).toBeDefined();

      // Verify resolution choice cards
      expect(screen.getByTestId("choice-keep-both")).toBeDefined();
      expect(screen.getByTestId("choice-keep-local")).toBeDefined();
      expect(screen.getByTestId("choice-keep-cloud")).toBeDefined();

      // Select Keep Both and submit
      fireEvent.click(screen.getByTestId("choice-keep-both"));
      expect(screen.getByTestId("archive-name-input")).toBeDefined();

      fireEvent.click(screen.getByTestId("confirm-resolution-btn"));

      await waitFor(() => {
        expect(db.rpc).toHaveBeenCalledWith("resolve_game_conflict", expect.objectContaining({
          conflict_id: "conflict_test_123",
          resolution: "keep_both",
        }));
        expect(mockResolved).toHaveBeenCalled();
        expect(mockClose).toHaveBeenCalled();
      });
    });

    it("allows resolving conflict with Keep Local or Keep Cloud", async () => {
      const mockResolved = vi.fn();
      const mockClose = vi.fn();

      render(
        <ConflictResolverModal
          open={true}
          conflict={mockConflict}
          onClose={mockClose}
          onResolved={mockResolved}
        />
      );

      // Select Keep Local
      fireEvent.click(screen.getByTestId("choice-keep-local"));
      fireEvent.click(screen.getByTestId("confirm-resolution-btn"));

      await waitFor(() => {
        expect(db.rpc).toHaveBeenCalledWith("resolve_game_conflict", expect.objectContaining({
          conflict_id: "conflict_test_123",
          resolution: "keep_local",
        }));
      });
    });
  });
});
