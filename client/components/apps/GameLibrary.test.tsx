/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  GameLibrary,
  formatPlaytime,
  formatDetailedPlaytime,
} from "./GameLibrary";
import * as desktopBridge from "@/lib/desktopBridge";
import { supabase, db } from "@/lib/db";

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockScannedGames: desktopBridge.InstalledGame[] = [
  {
    id: "steam_1091500",
    title: "Cyberpunk 2077",
    platform: "steam",
    launchUri: "steam://rungameid/1091500",
    executablePath:
      "C:\\Steam\\steamapps\\common\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe",
    installPath: "C:\\Steam\\steamapps\\common\\Cyberpunk 2077",
    bannerUrl:
      "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg",
    isCustom: false,
    playtime_seconds: 7200,
    last_played_at: "2026-08-30T10:00:00Z",
  },
  {
    id: "epic_Fortnite",
    title: "Fortnite",
    platform: "epic",
    launchUri:
      "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true",
    executablePath:
      "C:\\Epic\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe",
    installPath: "C:\\Epic\\Fortnite",
    iconUrl: "https://epicgames.com/fortnite_icon.png",
    isCustom: false,
    playtime_seconds: 3600,
    last_played_at: "2026-08-29T15:00:00Z",
  },
  {
    id: "ea_ApexLegends",
    title: "Apex Legends",
    platform: "ea",
    launchUri: "origin2://game/launch?offerIds=ApexLegends",
    executablePath: "C:\\EA Games\\Apex\\r5apex.exe",
    isCustom: false,
    playtime_seconds: 1800,
    last_played_at: "2026-08-28T12:00:00Z",
  },
  {
    id: "custom_indie_game",
    title: "My Indie Game",
    platform: "custom",
    executablePath: "C:\\Games\\IndieGame\\game.exe",
    isCustom: true,
    playtime_seconds: 600,
    last_played_at: "2026-08-25T08:00:00Z",
  },
];

const mockFriendsData = [
  {
    user_id: "user_friend_1",
    friend_id: "user_friend_1",
    username: "gamer_pro",
    display_name: "Gamer Pro",
    avatar_url: null,
    playtime_seconds: 14400,
    is_playing: true,
    last_played_at: "2026-08-31T12:00:00Z",
  },
  {
    user_id: "user_friend_2",
    friend_id: "user_friend_2",
    username: "retro_player",
    display_name: "Retro Player",
    avatar_url: null,
    playtime_seconds: 3600,
    is_playing: false,
    last_played_at: "2026-08-20T10:00:00Z",
  },
];

vi.mock("@/lib/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof desktopBridge>();
  return {
    ...actual,
    isDesktopBridgeAvailable: vi.fn(),
    scanInstalledGames: vi.fn(),
    launchGame: vi.fn(),
    pickGameExecutable: vi.fn(),
    getGameIcon: vi.fn(),
    getRunningGames: vi.fn(),
    setupGameBridgeListeners: vi.fn(),
  };
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
    from: vi.fn(() => {
      const builder: any = {
        select: vi.fn(() => builder),
        execute: vi.fn().mockResolvedValue({
          data: mockScannedGames,
          error: null,
        }),
      };
      return builder;
    }),
    rpc: vi.fn().mockImplementation((name: string, args: any) => {
      if (name === "sync_user_games") {
        return Promise.resolve({
          data: {
            success: true,
            count: mockScannedGames.length,
            games: mockScannedGames,
          },
          error: null,
        });
      }
      if (name === "get_user_playtime") {
        return Promise.resolve({
          data: {
            steam_1091500: 7200,
            epic_Fortnite: 3600,
            ea_ApexLegends: 1800,
            custom_indie_game: 600,
          },
          error: null,
        });
      }
      if (name === "get_game_friends") {
        return Promise.resolve({
          data: mockFriendsData,
          error: null,
        });
      }
      if (name === "add_custom_game") {
        return Promise.resolve({
          data: {
            id: "custom_new_123",
            game_id: "custom_new_123",
            title: args.title,
            executable_path: args.executable_path,
            platform: "custom",
            is_custom: true,
          },
          error: null,
        });
      }
      if (name === "set_game_presence" || name === "log_playtime") {
        return Promise.resolve({
          data: { success: true },
          error: null,
        });
      }
      if (name === "get_game_sync_configs") {
        return Promise.resolve({
          data: {
            success: true,
            configs: [
              {
                id: "rimworld",
                game_id: "rimworld",
                enabled: true,
                categories: { saves: true, mod_lists: true, custom_mods: true },
                created_at: "2026-09-08T10:00:00Z",
                updated_at: "2026-09-08T10:00:00Z",
              },
            ],
          },
          error: null,
        });
      }
      if (name === "upsert_game_sync_config") {
        return Promise.resolve({
          data: {
            success: true,
            config: {
              id: args.game_id,
              game_id: args.game_id,
              enabled: args.enabled !== undefined ? args.enabled : true,
              categories: args.categories || {},
              custom_paths: args.custom_paths || {},
              created_at: "2026-09-08T10:00:00Z",
              updated_at: "2026-09-08T10:00:00Z",
            },
          },
          error: null,
        });
      }
      if (name === "get_game_snapshots") {
        return Promise.resolve({
          data: {
            success: true,
            count: 2,
            snapshots: [
              {
                id: "snap_auto_1",
                game_id: "rimworld",
                category: "mod_lists",
                name: "Auto-Sync Mod List",
                is_manual: false,
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                content_hash: "hash_auto_1234567890",
                file_size: 4096,
                item_count: 15,
                created_at: "2026-09-08T12:00:00Z",
                updated_at: "2026-09-08T12:00:00Z",
              },
              {
                id: "snap_manual_1",
                game_id: "rimworld",
                category: "saves",
                name: "Year 5 Colony Save",
                is_manual: true,
                expires_at: null,
                content_hash: "hash_manual_0987654321",
                file_size: 1048576,
                item_count: 1,
                created_at: "2026-09-08T11:00:00Z",
                updated_at: "2026-09-08T11:00:00Z",
              },
            ],
          },
          error: null,
        });
      }
      if (name === "create_game_snapshot") {
        return Promise.resolve({
          data: {
            success: true,
            snapshot: {
              id: "snap_new_manual",
              game_id: args.game_id,
              category: args.category,
              name: args.name,
              is_manual: true,
              expires_at: null,
              content_hash: args.content_hash || "mock_hash",
              file_size: args.file_size || 1024,
              item_count: args.item_count || 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
          error: null,
        });
      }
      if (name === "promote_game_snapshot") {
        return Promise.resolve({
          data: {
            success: true,
            snapshot: {
              id: args.snapshot_id,
              is_manual: true,
              expires_at: null,
            },
          },
          error: null,
        });
      }
      if (name === "restore_game_snapshot" || name === "delete_game_snapshot") {
        return Promise.resolve({
          data: { success: true },
          error: null,
        });
      }
      if (name === "get_game_conflicts") {
        return Promise.resolve({
          data: {
            success: true,
            conflicts: [],
          },
          error: null,
        });
      }
      if (name === "resolve_game_conflict") {
        return Promise.resolve({
          data: {
            success: true,
            resolution: args.resolution,
            conflict: {
              id: args.conflict_id,
              game_id: "rimworld",
              category: "saves",
              status: "resolved",
            },
          },
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

describe("GameLibrary Formatting Utilities", () => {
  it("formats seconds correctly into compact and detailed playtime strings", () => {
    expect(formatPlaytime(30)).toBe("< 1 min");
    expect(formatPlaytime(120)).toBe("2m");
    expect(formatPlaytime(3600)).toBe("1h");
    expect(formatPlaytime(3660)).toBe("1h 1m");
    expect(formatPlaytime(7320)).toBe("2h 2m");

    expect(formatDetailedPlaytime(0)).toBe("0 min");
    expect(formatDetailedPlaytime(180)).toBe("3 min");
    expect(formatDetailedPlaytime(3600)).toBe("1 hrs 0 min");
    expect(formatDetailedPlaytime(5400)).toBe("1 hrs 30 min");
  });
});

describe("GameLibrary Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (desktopBridge.isDesktopBridgeAvailable as any).mockReturnValue(true);
    (desktopBridge.scanInstalledGames as any).mockResolvedValue(
      mockScannedGames,
    );
    (desktopBridge.launchGame as any).mockResolvedValue({ success: true });
    (desktopBridge.getRunningGames as any).mockResolvedValue({
      runningGames: [],
    });
    (desktopBridge.setupGameBridgeListeners as any).mockReturnValue(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  describe("Web Browser Gating", () => {
    it("renders desktop requirement card with download button when bridge is unavailable", () => {
      (desktopBridge.isDesktopBridgeAvailable as any).mockReturnValue(false);

      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      expect(screen.getByText("Desktop App Required")).toBeDefined();
      expect(
        screen.getByText(
          /Game Library requires Oxygen Low's Software desktop app/,
        ),
      ).toBeDefined();
      expect(screen.getByText("Download Desktop App")).toBeDefined();
      expect(
        screen.getByRole("link", { name: /Download Desktop App/i }),
      ).toBeDefined();
    });
  });

  describe("Desktop Library UI & Platform Filtering", () => {
    it("scans and displays all detected games in grid view by default", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
        expect(screen.getByText("Fortnite")).toBeDefined();
        expect(screen.getByText("Apex Legends")).toBeDefined();
        expect(screen.getByText("My Indie Game")).toBeDefined();
      });

      expect(desktopBridge.scanInstalledGames).toHaveBeenCalled();
      expect(supabase.rpc).toHaveBeenCalledWith("sync_user_games", {
        games: mockScannedGames,
      });
    });

    it("filters games by platform tabs", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      // Filter to Steam only
      const steamTab = screen.getByRole("button", { name: /Steam/i });
      fireEvent.click(steamTab);

      expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      expect(screen.queryByText("Fortnite")).toBeNull();
      expect(screen.queryByText("Apex Legends")).toBeNull();
      expect(screen.queryByText("My Indie Game")).toBeNull();

      // Filter to Custom only
      const customTab = screen.getByRole("button", { name: /^Custom/i });
      fireEvent.click(customTab);

      expect(screen.getByText("My Indie Game")).toBeDefined();
      expect(screen.queryByText("Cyberpunk 2077")).toBeNull();

      // Switch back to All
      const allTab = screen.getByRole("button", { name: /All/i });
      fireEvent.click(allTab);

      expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      expect(screen.getByText("Fortnite")).toBeDefined();
    });

    it("filters games in real-time via search input", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      const searchInput = screen.getByPlaceholderText(/Search/i);
      fireEvent.change(searchInput, { target: { value: "Fort" } });

      expect(screen.getByText("Fortnite")).toBeDefined();
      expect(screen.queryByText("Cyberpunk 2077")).toBeNull();
      expect(screen.queryByText("Apex Legends")).toBeNull();

      fireEvent.change(searchInput, { target: { value: "NonExistentGame" } });
      expect(screen.getByText("No games found")).toBeDefined();
    });

    it("toggles between Grid View and List View", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      // Click List View button
      const listButton = screen.getByLabelText("List View");
      fireEvent.click(listButton);

      // Verify list elements render (executable paths shown in list mode)
      expect(
        screen.getByText(/steamapps\\common\\Cyberpunk 2077/),
      ).toBeDefined();

      // Click Grid View button
      const gridButton = screen.getByLabelText("Grid View");
      fireEvent.click(gridButton);

      expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
    });
  });

  describe("Game Launching", () => {
    it("launches game via desktop bridge when Play button is clicked", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      const playButtons = screen.getAllByRole("button", { name: /^Play$/i });
      fireEvent.click(playButtons[0]);

      await waitFor(() => {
        expect(desktopBridge.launchGame).toHaveBeenCalledWith(
          expect.objectContaining({
            gameId: "steam_1091500",
            platform: "steam",
            title: "Cyberpunk 2077",
          }),
        );
        expect(supabase.rpc).toHaveBeenCalledWith("set_game_presence", {
          game_id: "steam_1091500",
          game_title: "Cyberpunk 2077",
          platform: "steam",
          is_playing: true,
        });
      });
    });
  });

  describe("Add Custom Game Dialog", () => {
    it("opens modal, allows picking executable via bridge, and saves custom game", async () => {
      (desktopBridge.pickGameExecutable as any).mockResolvedValue({
        title: "Hollow Knight",
        executablePath: "C:\\Games\\HollowKnight\\hollow_knight.exe",
        iconDataUrl: "data:image/png;base64,mockIconData",
      });

      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      const addGameBtn = screen.getAllByRole("button", {
        name: /Add Custom Game/i,
      })[0];
      fireEvent.click(addGameBtn);

      expect(
        screen.getByRole("heading", { name: "Add Custom Game" }),
      ).toBeDefined();

      // Click Browse
      const browseBtn = screen.getByRole("button", { name: /Browse/i });
      fireEvent.click(browseBtn);

      await waitFor(() => {
        expect(desktopBridge.pickGameExecutable).toHaveBeenCalled();
        const titleInput = screen.getByLabelText(
          /Game Title/i,
        ) as HTMLInputElement;
        const exeInput = screen.getByLabelText(
          /Executable Path/i,
        ) as HTMLInputElement;
        expect(titleInput.value).toBe("Hollow Knight");
        expect(exeInput.value).toBe(
          "C:\\Games\\HollowKnight\\hollow_knight.exe",
        );
      });

      // Submit Form
      const submitBtn = screen.getByRole("button", { name: /^Add Game$/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith(
          "add_custom_game",
          expect.objectContaining({
            title: "Hollow Knight",
            executable_path: "C:\\Games\\HollowKnight\\hollow_knight.exe",
          }),
        );
        expect(screen.getByText("Hollow Knight")).toBeDefined();
      });
    });
  });

  describe("Game Details Modal & Friends Section", () => {
    it("opens details modal, displays playtime and loads friends who own the game with live status", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      // Click the Cyberpunk card
      const cyberpunkCard = screen.getByText("Cyberpunk 2077");
      fireEvent.click(cyberpunkCard);

      // Verify Details modal contents
      await waitFor(() => {
        expect(screen.getByText("Friends with this Game")).toBeDefined();
        expect(supabase.rpc).toHaveBeenCalledWith("get_game_friends", {
          game_id: "steam_1091500",
          game_title: "Cyberpunk 2077",
        });
      });

      // Check friend entries
      await waitFor(() => {
        expect(screen.getByText("Gamer Pro")).toBeDefined();
        expect(screen.getByText("@gamer_pro")).toBeDefined();
        expect(screen.getByText("Retro Player")).toBeDefined();
        expect(screen.getByText("@retro_player")).toBeDefined();
        expect(screen.getByText("Playing Now")).toBeDefined();
      });

      // Close modal
      const closeBtn = screen.getAllByRole("button", { name: /Close/i })[0];
      fireEvent.click(closeBtn);
    });

    it("displays empty state when no friends own the game", async () => {
      (supabase.rpc as any).mockImplementation((name: string) => {
        if (name === "get_game_friends") {
          return Promise.resolve({ data: [], error: null });
        }
        if (name === "get_user_playtime") {
          return Promise.resolve({ data: {}, error: null });
        }
        if (name === "sync_user_games") {
          return Promise.resolve({
            data: { games: mockScannedGames },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      fireEvent.click(screen.getByText("Cyberpunk 2077"));

      await waitFor(() => {
        expect(
          screen.getByText("None of your friends own this game yet."),
        ).toBeDefined();
      });
    });
  });

  describe("Push Event Listeners", () => {
    it("subscribes to bridge listeners on mount and unregisters on unmount", () => {
      const mockUnsubscribe = vi.fn();
      (desktopBridge.setupGameBridgeListeners as any).mockReturnValue(
        mockUnsubscribe,
      );

      const { unmount } = render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      expect(desktopBridge.setupGameBridgeListeners).toHaveBeenCalled();

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe("Milestone 4: Cloud Sync & Supported Games UI Integration", () => {
    it("renders 'Supported Games' button in header and opens modal with all 8 games", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("supported-games-btn")).toBeDefined();
      });

      // Click Supported Games button
      fireEvent.click(screen.getByTestId("supported-games-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("supported-games-modal")).toBeDefined();
        // Verify recognized games are listed
        expect(screen.getByText("Rain World")).toBeDefined();
        expect(screen.getByText("RimWorld")).toBeDefined();
        expect(screen.getByText("Library Of Ruina")).toBeDefined();
        expect(screen.getByText("Lobotomy Corporation")).toBeDefined();
        expect(screen.getByText("Ostranauts")).toBeDefined();
        expect(screen.getByText("Barotrauma")).toBeDefined();
        expect(screen.getByText("Kenshi")).toBeDefined();
        expect(screen.getByText("Space Haven")).toBeDefined();
      });
    });

    it("allows toggling global sync switches in Supported Games modal", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByTestId("supported-games-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("enable-all-btn")).toBeDefined();
        expect(screen.getByTestId("disable-all-btn")).toBeDefined();
      });

      // Click Disable All
      fireEvent.click(screen.getByTestId("disable-all-btn"));
      await waitFor(() => {
        expect(db.rpc).toHaveBeenCalledWith("upsert_game_sync_config", expect.objectContaining({
          enabled: false,
        }));
      });

      // Click Enable All
      fireEvent.click(screen.getByTestId("enable-all-btn"));
      await waitFor(() => {
        expect(db.rpc).toHaveBeenCalledWith("upsert_game_sync_config", expect.objectContaining({
          enabled: true,
        }));
      });
    });

    it("allows switching to Saves & Mods tab in Game Details dialog", async () => {
      render(
        <MemoryRouter>
          <GameLibrary />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cyberpunk 2077")).toBeDefined();
      });

      // Open details dialog
      fireEvent.click(screen.getByText("Cyberpunk 2077"));

      await waitFor(() => {
        expect(screen.getByTestId("game-details-tab-bar")).toBeDefined();
        expect(screen.getByTestId("tab-btn-overview")).toBeDefined();
        expect(screen.getByTestId("tab-btn-saves-mods")).toBeDefined();
      });

      // Switch to Saves & Mods tab
      fireEvent.click(screen.getByTestId("tab-btn-saves-mods"));

      await waitFor(() => {
        expect(screen.getByTestId("unsupported-game-view")).toBeDefined();
      });

      // Switch back to Overview
      fireEvent.click(screen.getByTestId("tab-btn-overview"));

      await waitFor(() => {
        expect(screen.getByText("Friends with this Game")).toBeDefined();
      });
    });
  });
});
