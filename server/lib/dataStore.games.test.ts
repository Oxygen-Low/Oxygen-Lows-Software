import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  initUserFolder,
  getTableFilePath,
  getTableRows,
  queryTable,
  insertTable,
  updateTable,
  upsertTable,
  deleteTable,
  callRpc,
  getAcceptedFriendIds,
  pruneExpiredGameSnapshots,
  UserGameRecord,
  UserPlaytimeRecord,
  UserPresenceRecord,
  GameSyncConfigRecord,
  GameSnapshotRecord,
  GameConflictRecord,
} from "./dataStore.ts";

describe("dataStore - Game Tables & Social RPCs", () => {
  const user1 = "90001";
  const user2 = "90002";
  const user3 = "90003";
  const user4 = "90004";
  const testUserIds = [user1, user2, user3, user4];

  const cleanup = () => {
    for (const uid of testUserIds) {
      const userDir = path.join(DATA_DIR, uid);
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true, force: true });
      }
    }
  };

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Directory & Table Initialization", () => {
    it("should initialize Data/<userId>/games/ with games.json, playtime.json, and presence.json", () => {
      initUserFolder(user1, {
        username: "gamer1",
        email: "gamer1@example.com",
        passwordHash: "hash1",
        salt: "salt1",
      });

      const userDir = path.join(DATA_DIR, user1);
      const gamesDir = path.join(userDir, "games");
      expect(fs.existsSync(gamesDir)).toBe(true);

      const gamesFile = path.join(gamesDir, "games.json");
      const playtimeFile = path.join(gamesDir, "playtime.json");
      const presenceFile = path.join(gamesDir, "presence.json");
      const prefsFile = path.join(userDir, "preferences.json");

      expect(fs.existsSync(gamesFile)).toBe(true);
      expect(fs.existsSync(playtimeFile)).toBe(true);
      expect(fs.existsSync(presenceFile)).toBe(true);

      expect(JSON.parse(fs.readFileSync(gamesFile, "utf-8"))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(playtimeFile, "utf-8"))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(presenceFile, "utf-8"))).toEqual([]);

      const prefs = JSON.parse(fs.readFileSync(prefsFile, "utf-8"));
      expect(prefs.share_game_activity).toBe(true);
    });

    it("should resolve getTableFilePath for user_games, user_playtime, user_presence and aliases", () => {
      const expectedGamesPath = path.join(
        DATA_DIR,
        user1,
        "games",
        "games.json",
      );
      const expectedPlaytimePath = path.join(
        DATA_DIR,
        user1,
        "games",
        "playtime.json",
      );
      const expectedPresencePath = path.join(
        DATA_DIR,
        user1,
        "games",
        "presence.json",
      );

      expect(getTableFilePath("user_games", user1)).toBe(expectedGamesPath);
      expect(getTableFilePath("games", user1)).toBe(expectedGamesPath);
      expect(getTableFilePath("game_library", user1)).toBe(expectedGamesPath);
      expect(getTableFilePath("installed_games", user1)).toBe(
        expectedGamesPath,
      );
      expect(getTableFilePath("custom_games", user1)).toBe(expectedGamesPath);

      expect(getTableFilePath("user_playtime", user1)).toBe(
        expectedPlaytimePath,
      );
      expect(getTableFilePath("game_playtime", user1)).toBe(
        expectedPlaytimePath,
      );
      expect(getTableFilePath("playtime", user1)).toBe(expectedPlaytimePath);
      expect(getTableFilePath("playtimes", user1)).toBe(expectedPlaytimePath);

      expect(getTableFilePath("user_presence", user1)).toBe(
        expectedPresencePath,
      );
      expect(getTableFilePath("game_presence", user1)).toBe(
        expectedPresencePath,
      );
      expect(getTableFilePath("presence", user1)).toBe(expectedPresencePath);
      expect(getTableFilePath("presences", user1)).toBe(expectedPresencePath);
    });

    it("should allow generic CRUD operations on user_games table", () => {
      initUserFolder(user1, {
        username: "crudgamer",
        email: "crudgamer@example.com",
        passwordHash: "h",
        salt: "s",
      });

      // Insert
      const inserted = insertTable(
        "user_games",
        {
          id: "steam_730",
          game_id: "steam_730",
          title: "Counter-Strike 2",
          platform: "steam",
          is_custom: false,
          playtime_seconds: 1200,
        },
        user1,
      );
      expect(inserted.title).toBe("Counter-Strike 2");

      // Query
      const queried = queryTable({
        table: "user_games",
        filters: [{ field: "platform", operator: "eq", value: "steam" }],
        userId: user1,
      });
      expect(queried).toHaveLength(1);
      expect(queried[0].game_id).toBe("steam_730");

      // Update
      const updated = updateTable(
        "user_games",
        [{ field: "game_id", operator: "eq", value: "steam_730" }],
        { playtime_seconds: 2400 },
        user1,
      );
      expect(updated[0].playtime_seconds).toBe(2400);

      // Delete
      const deleted = deleteTable(
        "user_games",
        [{ field: "game_id", operator: "eq", value: "steam_730" }],
        user1,
      );
      expect(deleted).toHaveLength(1);
      expect(getTableRows("user_games", user1)).toHaveLength(0);
    });
  });

  describe("Game RPCs", () => {
    beforeEach(() => {
      initUserFolder(user1, {
        username: "player1",
        email: "player1@example.com",
        passwordHash: "h1",
        salt: "s1",
      });
      initUserFolder(user2, {
        username: "player2",
        email: "player2@example.com",
        passwordHash: "h2",
        salt: "s2",
      });
      initUserFolder(user3, {
        username: "player3",
        email: "player3@example.com",
        passwordHash: "h3",
        salt: "s3",
      });
      initUserFolder(user4, {
        username: "player4",
        email: "player4@example.com",
        passwordHash: "h4",
        salt: "s4",
      });
    });

    describe("sync_user_games", () => {
      it("should sync scanned games and preserve existing custom games and playtime", () => {
        // First, add a custom game
        callRpc(
          "add_custom_game",
          {
            title: "My Custom Emulator",
            executable_path: "C:\\Emulators\\retro.exe",
            playtime_seconds: 500,
          },
          user1,
        );

        // Sync scanned games
        const syncResult = callRpc(
          "sync_user_games",
          {
            games: [
              {
                game_id: "steam_1091500",
                title: "Cyberpunk 2077",
                platform: "steam",
                launch_url: "steam://rungameid/1091500",
                playtime_seconds: 3600,
              },
              {
                game_id: "epic_Sugar",
                title: "Alan Wake 2",
                platform: "epic",
                launch_url: "com.epicgames.launcher://apps/Sugar?action=launch",
                playtime_seconds: 1800,
              },
            ],
          },
          user1,
        );

        expect(syncResult.success).toBe(true);
        expect(syncResult.count).toBe(3); // 1 custom + 2 scanned

        const games = getTableRows("user_games", user1) as UserGameRecord[];
        expect(
          games.some((g) => g.title === "My Custom Emulator" && g.is_custom),
        ).toBe(true);
        expect(
          games.some(
            (g) => g.game_id === "steam_1091500" && g.playtime_seconds === 3600,
          ),
        ).toBe(true);

        // Re-sync with updated playtime
        callRpc(
          "sync_user_games",
          {
            games: [
              {
                game_id: "steam_1091500",
                title: "Cyberpunk 2077",
                platform: "steam",
                playtime_seconds: 7200,
              },
            ],
          },
          user1,
        );

        const updatedGames = getTableRows(
          "user_games",
          user1,
        ) as UserGameRecord[];
        const cp = updatedGames.find((g) => g.game_id === "steam_1091500");
        expect(cp?.playtime_seconds).toBe(7200);
      });
    });

    describe("add_custom_game", () => {
      it("should add and update custom games with is_custom: true", () => {
        const added = callRpc(
          "add_custom_game",
          {
            title: "Super Mario 64 PC Port",
            executable_path: "C:\\Games\\sm64.exe",
            icon_url: "file:///C:/Games/sm64.ico",
          },
          user1,
        );

        expect(added.success).toBe(true);
        expect(added.game.title).toBe("Super Mario 64 PC Port");
        expect(added.game.platform).toBe("custom");
        expect(added.game.is_custom).toBe(true);
        expect(added.game.executable_path).toBe("C:\\Games\\sm64.exe");

        // Update custom game
        const updated = callRpc(
          "add_custom_game",
          {
            id: added.game.id,
            title: "Super Mario 64 PC Enhanced",
            executable_path: "C:\\Games\\sm64_v2.exe",
          },
          user1,
        );

        expect(updated.game.title).toBe("Super Mario 64 PC Enhanced");
        expect(updated.game.executable_path).toBe("C:\\Games\\sm64_v2.exe");
        expect(getTableRows("user_games", user1)).toHaveLength(1);
      });
    });

    describe("log_playtime & get_user_playtime", () => {
      it("should accumulate playtime seconds and update both user_playtime and user_games", () => {
        callRpc(
          "sync_user_games",
          {
            games: [
              {
                game_id: "steam_730",
                title: "Counter-Strike 2",
                platform: "steam",
                playtime_seconds: 100,
              },
            ],
          },
          user1,
        );

        // Log 300 seconds
        const log1 = callRpc(
          "log_playtime",
          {
            game_id: "steam_730",
            duration_seconds: 300,
          },
          user1,
        );
        expect(log1.success).toBe(true);
        expect(log1.total_seconds).toBe(300);

        // Log another 200 seconds
        const log2 = callRpc(
          "log_playtime",
          {
            game_id: "steam_730",
            duration_seconds: 200,
          },
          user1,
        );
        expect(log2.total_seconds).toBe(500);

        // Check user_games record was updated
        const game = (
          getTableRows("user_games", user1) as UserGameRecord[]
        ).find((g) => g.game_id === "steam_730");
        expect(game?.playtime_seconds).toBe(600); // 100 initial + 300 + 200
        expect(game?.last_played_at).toBeDefined();

        // Check get_user_playtime for specific game
        const specificPt = callRpc(
          "get_user_playtime",
          { game_id: "steam_730" },
          user1,
        );
        expect(specificPt.success).toBe(true);
        expect(specificPt.total_seconds).toBe(600);

        // Check get_user_playtime dictionary
        const allPt = callRpc("get_user_playtime", {}, user1);
        expect(allPt.success).toBe(true);
        expect(allPt.games["steam_730"]).toBe(600);
      });
    });

    describe("set_game_presence", () => {
      it("should update user presence active now-playing status", () => {
        const presence = callRpc(
          "set_game_presence",
          {
            is_playing: true,
            game_id: "steam_1091500",
            game_title: "Cyberpunk 2077",
            platform: "steam",
          },
          user1,
        );

        expect(presence.success).toBe(true);
        expect(presence.is_playing).toBe(true);
        expect(presence.game_id).toBe("steam_1091500");
        expect(presence.game_title).toBe("Cyberpunk 2077");

        const rows = getTableRows(
          "user_presence",
          user1,
        ) as UserPresenceRecord[];
        expect(rows).toHaveLength(1);
        expect(rows[0].is_playing).toBe(true);

        // Stop playing
        const stopped = callRpc(
          "set_game_presence",
          {
            is_playing: false,
          },
          user1,
        );
        expect(stopped.is_playing).toBe(false);
        expect(stopped.game_id).toBeNull();
      });
    });

    describe("get_game_friends & get_friends_game_activity with Friendship and Privacy", () => {
      beforeEach(() => {
        // Setup friendships:
        // user1 <-> user2 (accepted, user1 is sender)
        insertTable(
          "friendships",
          {
            id: "f1-2",
            user_id: user1,
            friend_id: user2,
            status: "accepted",
          },
          user1,
        );

        // user1 <-> user3 (accepted, user3 is sender in user3 folder)
        insertTable(
          "friendships",
          {
            id: "f3-1",
            user_id: user3,
            friend_id: user1,
            status: "accepted",
          },
          user3,
        );

        // user1 <-> user4 (pending request - should NOT be included)
        insertTable(
          "friendships",
          {
            id: "f1-4",
            user_id: user1,
            friend_id: user4,
            status: "pending",
          },
          user1,
        );

        // User2 owns Cyberpunk 2077 and is currently playing it
        callRpc(
          "sync_user_games",
          {
            games: [
              {
                game_id: "steam_1091500",
                title: "Cyberpunk 2077",
                platform: "steam",
                playtime_seconds: 7200,
              },
            ],
          },
          user2,
        );
        callRpc(
          "set_game_presence",
          {
            is_playing: true,
            game_id: "steam_1091500",
            game_title: "Cyberpunk 2077",
            platform: "steam",
          },
          user2,
        );

        // User3 owns Cyberpunk 2077, played 1500s, but is NOT currently playing
        callRpc(
          "sync_user_games",
          {
            games: [
              {
                game_id: "steam_1091500",
                title: "Cyberpunk 2077",
                platform: "steam",
                playtime_seconds: 1500,
              },
            ],
          },
          user3,
        );

        // User4 owns Cyberpunk 2077 (pending friend)
        callRpc(
          "sync_user_games",
          {
            games: [
              {
                game_id: "steam_1091500",
                title: "Cyberpunk 2077",
                platform: "steam",
                playtime_seconds: 9000,
              },
            ],
          },
          user4,
        );
      });

      it("should resolve accepted bidirectional friends via getAcceptedFriendIds", () => {
        const friendIds = getAcceptedFriendIds(user1);
        expect(friendIds).toContain(user2);
        expect(friendIds).toContain(user3);
        expect(friendIds).not.toContain(user4);
      });

      it("should return friends who own the specified game with playtime and live playing presence", () => {
        const gameFriends = callRpc(
          "get_game_friends",
          { game_id: "steam_1091500" },
          user1,
        );

        expect(gameFriends).toHaveLength(2); // user2 and user3

        const friend2 = gameFriends.find((f: any) => f.user_id === user2);
        expect(friend2).toBeDefined();
        expect(friend2.username).toBe("player2");
        expect(friend2.playtime_seconds).toBe(7200);
        expect(friend2.is_playing).toBe(true);

        const friend3 = gameFriends.find((f: any) => f.user_id === user3);
        expect(friend3).toBeDefined();
        expect(friend3.username).toBe("player3");
        expect(friend3.playtime_seconds).toBe(1500);
        expect(friend3.is_playing).toBe(false);
      });

      it("should respect privacy settings when friend sets share_game_activity: false", () => {
        // User2 turns off game activity sharing
        callRpc(
          "upsert_user_preferences",
          { share_game_activity: false },
          user2,
        );

        const gameFriends = callRpc(
          "get_game_friends",
          { game_id: "steam_1091500" },
          user1,
        );

        // User2 should now be excluded
        expect(gameFriends).toHaveLength(1);
        expect(gameFriends[0].user_id).toBe(user3);

        // Check get_friends_game_activity
        const activity = callRpc("get_friends_game_activity", {}, user1);
        expect(activity.some((a: any) => a.user_id === user2)).toBe(false);
        expect(activity.some((a: any) => a.user_id === user3)).toBe(true);
      });

      it("should handle heartbeat expiration (>3 minutes) as not currently playing", () => {
        // Set presence updated_at to 5 minutes ago for user2
        const fiveMinutesAgo = new Date(
          Date.now() - 5 * 60 * 1000,
        ).toISOString();
        const presenceRecord = {
          id: user2,
          user_id: user2,
          game_id: "steam_1091500",
          game_title: "Cyberpunk 2077",
          platform: "steam",
          is_playing: true,
          started_at: fiveMinutesAgo,
          updated_at: fiveMinutesAgo,
        };
        fs.writeFileSync(
          path.join(DATA_DIR, user2, "games", "presence.json"),
          JSON.stringify([presenceRecord], null, 2),
        );

        const gameFriends = callRpc(
          "get_game_friends",
          { game_id: "steam_1091500" },
          user1,
        );

        const friend2 = gameFriends.find((f: any) => f.user_id === user2);
        expect(friend2?.is_playing).toBe(false);
      });

      it("should exclude blocked users from get_game_friends and get_friends_game_activity", () => {
        // User1 blocks User3
        insertTable(
          "blocks",
          {
            id: "b1-3",
            user_id: user1,
            blocked_id: user3,
          },
          user1,
        );

        const gameFriends = callRpc(
          "get_game_friends",
          { game_id: "steam_1091500" },
          user1,
        );

        expect(gameFriends).toHaveLength(1);
        expect(gameFriends[0].user_id).toBe(user2);
      });

      it("should return overall friend game activity via get_friends_game_activity", () => {
        const activities = callRpc("get_friends_game_activity", {}, user1);
        expect(activities.length).toBeGreaterThanOrEqual(2);

        const act2 = activities.find((a: any) => a.user_id === user2);
        expect(act2.is_playing).toBe(true);
        expect(act2.current_game.game_title).toBe("Cyberpunk 2077");
        expect(act2.total_games_count).toBe(1);
      });
    });
  });
});

describe("Game Cloud Sync, Snapshots, Retention Engine & Conflict Management", () => {
  const syncUser1 = "90010";
  const syncUser2 = "90011";
  const testSyncUserIds = [syncUser1, syncUser2];

  const cleanupSyncUsers = () => {
    for (const uid of testSyncUserIds) {
      const userDir = path.join(DATA_DIR, uid);
      try {
        if (fs.existsSync(userDir)) {
          fs.rmSync(userDir, { recursive: true, force: true });
        }
      } catch {}

      const storageDir = path.join(process.cwd(), "uploads", "Storage", uid);
      try {
        if (fs.existsSync(storageDir)) {
          fs.rmSync(storageDir, { recursive: true, force: true });
        }
      } catch {}
    }
  };

  beforeEach(() => {
    cleanupSyncUsers();
    initUserFolder(syncUser1, {
      username: "syncplayer1",
      email: "syncplayer1@example.com",
      passwordHash: "h_sync1",
      salt: "s_sync1",
    });
  });

  afterEach(() => {
    cleanupSyncUsers();
  });

  describe("Directory & Table Mapping", () => {
    it("should initialize sync_config.json, snapshots.json, conflicts.json and storage directory", () => {
      const userDir = path.join(DATA_DIR, syncUser1);
      const gamesDir = path.join(userDir, "games");
      expect(fs.existsSync(gamesDir)).toBe(true);

      const syncConfigFile = path.join(gamesDir, "sync_config.json");
      const snapshotsFile = path.join(gamesDir, "snapshots.json");
      const conflictsFile = path.join(gamesDir, "conflicts.json");

      expect(fs.existsSync(syncConfigFile)).toBe(true);
      expect(fs.existsSync(snapshotsFile)).toBe(true);
      expect(fs.existsSync(conflictsFile)).toBe(true);

      expect(JSON.parse(fs.readFileSync(syncConfigFile, "utf-8"))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(snapshotsFile, "utf-8"))).toEqual([]);
      expect(JSON.parse(fs.readFileSync(conflictsFile, "utf-8"))).toEqual([]);

      const userGamesUploadDir = path.join(
        process.cwd(),
        "uploads",
        "Storage",
        syncUser1,
        "games",
      );
      expect(fs.existsSync(userGamesUploadDir)).toBe(true);
    });

    it("should resolve getTableFilePath for game sync tables and their aliases", () => {
      const expectedSyncConfigPath = path.join(
        DATA_DIR,
        syncUser1,
        "games",
        "sync_config.json",
      );
      const expectedSnapshotsPath = path.join(
        DATA_DIR,
        syncUser1,
        "games",
        "snapshots.json",
      );
      const expectedConflictsPath = path.join(
        DATA_DIR,
        syncUser1,
        "games",
        "conflicts.json",
      );

      // game_sync_configs aliases
      expect(getTableFilePath("game_sync_configs", syncUser1)).toBe(
        expectedSyncConfigPath,
      );
      expect(getTableFilePath("game_sync_config", syncUser1)).toBe(
        expectedSyncConfigPath,
      );
      expect(getTableFilePath("game_sync_settings", syncUser1)).toBe(
        expectedSyncConfigPath,
      );
      expect(getTableFilePath("game_sync_preferences", syncUser1)).toBe(
        expectedSyncConfigPath,
      );

      // game_snapshots aliases
      expect(getTableFilePath("game_snapshots", syncUser1)).toBe(
        expectedSnapshotsPath,
      );
      expect(getTableFilePath("game_snapshot", syncUser1)).toBe(
        expectedSnapshotsPath,
      );
      expect(getTableFilePath("game_sync_snapshots", syncUser1)).toBe(
        expectedSnapshotsPath,
      );
      expect(getTableFilePath("game_sync_items", syncUser1)).toBe(
        expectedSnapshotsPath,
      );
      expect(getTableFilePath("game_saves_snapshots", syncUser1)).toBe(
        expectedSnapshotsPath,
      );

      // game_conflicts aliases
      expect(getTableFilePath("game_conflicts", syncUser1)).toBe(
        expectedConflictsPath,
      );
      expect(getTableFilePath("game_conflict", syncUser1)).toBe(
        expectedConflictsPath,
      );
      expect(getTableFilePath("game_sync_conflicts", syncUser1)).toBe(
        expectedConflictsPath,
      );

      // Path traversal security check
      expect(getTableFilePath("game_sync_configs", "../../evil")).toBeNull();
      expect(getTableFilePath("game_snapshots", "../..")).toBeNull();
    });

    it("should allow generic CRUD operations on game_sync_configs and game_snapshots", () => {
      // 1. Insert
      const config = insertTable(
        "game_sync_configs",
        {
          id: "rimworld",
          game_id: "rimworld",
          enabled: true,
          categories: { saves: true, mod_lists: true },
        },
        syncUser1,
      );
      expect(config.id).toBe("rimworld");

      // 2. Query
      const queried = queryTable({
        table: "game_sync_configs",
        filters: [{ field: "game_id", operator: "eq", value: "rimworld" }],
        userId: syncUser1,
      });
      expect(queried).toHaveLength(1);
      expect(queried[0].enabled).toBe(true);

      // 3. Update
      const updated = updateTable(
        "game_sync_configs",
        [{ field: "game_id", operator: "eq", value: "rimworld" }],
        { enabled: false },
        syncUser1,
      );
      expect(updated[0].enabled).toBe(false);

      // 4. Upsert
      const upserted = upsertTable(
        "game_sync_configs",
        {
          id: "rimworld",
          game_id: "rimworld",
          enabled: true,
          categories: { saves: true, mod_lists: false },
        },
        syncUser1,
        "id",
      );
      expect(upserted.enabled).toBe(true);
      expect(upserted.categories.mod_lists).toBe(false);

      // 5. Delete
      deleteTable(
        "game_sync_configs",
        [{ field: "game_id", operator: "eq", value: "rimworld" }],
        syncUser1,
      );
      expect(getTableRows("game_sync_configs", syncUser1)).toHaveLength(0);
    });
  });

  describe("RPC: get_game_sync_configs & upsert_game_sync_config", () => {
    it("should upsert and retrieve game sync config with all category toggles and custom paths", () => {
      const res = callRpc(
        "upsert_game_sync_config",
        {
          game_id: "rimworld",
          enabled: true,
          categories: {
            saves: true,
            mod_lists: true,
            custom_mods: false,
            ideologies: true,
            xenotypes: true,
          },
          custom_paths: {
            install_path: "D:\\Games\\RimWorld",
            save_path:
              "C:\\Users\\User\\AppData\\LocalLow\\Ludeon Studios\\RimWorld\\Saves",
            mods_path: "D:\\Games\\RimWorld\\Mods",
          },
          sync_status: "idle",
        },
        syncUser1,
      );

      expect(res.success).toBe(true);
      expect(res.config.game_id).toBe("rimworld");
      expect(res.config.categories.saves).toBe(true);
      expect(res.config.categories.custom_mods).toBe(false);
      expect(res.config.categories.ideologies).toBe(true);
      expect(res.config.custom_paths.install_path).toBe("D:\\Games\\RimWorld");

      // Retrieve specific game config
      const getSingle = callRpc(
        "get_game_sync_configs",
        { game_id: "rimworld" },
        syncUser1,
      );
      expect(getSingle.success).toBe(true);
      expect(getSingle.config.game_id).toBe("rimworld");

      // Retrieve all configs
      const getAll = callRpc("get_game_sync_configs", {}, syncUser1);
      expect(getAll.success).toBe(true);
      expect(getAll.configs).toHaveLength(1);

      // Partial category update preserves existing toggles
      const updateRes = callRpc(
        "upsert_game_sync_config",
        {
          game_id: "rimworld",
          categories: { custom_mods: true },
        },
        syncUser1,
      );
      expect(updateRes.success).toBe(true);
      expect(updateRes.config.categories.custom_mods).toBe(true);
      expect(updateRes.config.categories.saves).toBe(true); // preserved
      expect(updateRes.config.categories.ideologies).toBe(true); // preserved
    });

    it("should handle error cases and validation for upsert_game_sync_config and get_game_sync_configs", () => {
      // Unauthorized call without userId
      const unauthGet = callRpc("get_game_sync_configs", {});
      expect(unauthGet.success).toBe(false);
      expect(unauthGet.error).toBe("Unauthorized");

      const unauthUpsert = callRpc("upsert_game_sync_config", {
        game_id: "rain_world",
      });
      expect(unauthUpsert.success).toBe(false);
      expect(unauthUpsert.error).toBe("Unauthorized");

      // Missing game_id
      const missingId = callRpc("upsert_game_sync_config", {}, syncUser1);
      expect(missingId.success).toBe(false);
      expect(missingId.error).toBe("game_id is required");

      // Path traversal game_id
      const traversalId = callRpc(
        "upsert_game_sync_config",
        { game_id: "../evil_game" },
        syncUser1,
      );
      expect(traversalId.success).toBe(false);
      expect(traversalId.error).toBe("Invalid game_id");

      // Request nonexistent config returns null config
      const nonExistent = callRpc(
        "get_game_sync_configs",
        { game_id: "nonexistent" },
        syncUser1,
      );
      expect(nonExistent.success).toBe(true);
      expect(nonExistent.config).toBeNull();
    });
  });

  describe("Retention Engine: 24h Auto-Sync vs Permanent Manual Saves", () => {
    it("should automatically set 24h expiration on auto-synced mod lists and null on manual saves", () => {
      // 1. Auto-synced mod list
      const autoRes = callRpc(
        "create_game_snapshot",
        {
          game_id: "rain_world",
          category: "mod_lists",
          content_hash: "hash_auto_modlist",
          file_size: 2048,
          item_count: 10,
          is_manual: false,
        },
        syncUser1,
      );
      expect(autoRes.success).toBe(true);
      expect(autoRes.snapshot.is_manual).toBe(false);
      expect(autoRes.snapshot.expires_at).not.toBeNull();

      const expTime = new Date(autoRes.snapshot.expires_at).getTime();
      const now = Date.now();
      expect(expTime - now).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(expTime - now).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);

      // 2. Manual named save (permanent)
      const manualRes = callRpc(
        "create_game_snapshot",
        {
          game_id: "rain_world",
          category: "mod_lists",
          name: "My Expedition Mod Loadout",
          content_hash: "hash_manual_modlist",
          file_size: 4096,
          item_count: 14,
          is_manual: true,
        },
        syncUser1,
      );
      expect(manualRes.success).toBe(true);
      expect(manualRes.snapshot.is_manual).toBe(true);
      expect(manualRes.snapshot.expires_at).toBeNull();
      expect(manualRes.snapshot.name).toBe("My Expedition Mod Loadout");

      // 3. Auto-synced non-modlist (e.g. saves) without explicit expires_at
      const saveRes = callRpc(
        "create_game_snapshot",
        {
          game_id: "rain_world",
          category: "saves",
          content_hash: "hash_save_1",
          file_size: 10240,
          item_count: 1,
          is_manual: false,
        },
        syncUser1,
      );
      expect(saveRes.success).toBe(true);
      expect(saveRes.snapshot.expires_at).toBeNull();
    });

    it("should promote an auto-synced mod list to a permanent manual save via promote_game_snapshot", () => {
      const autoRes = callRpc(
        "create_game_snapshot",
        {
          game_id: "kenshi",
          category: "mod_lists",
          content_hash: "hash_kenshi_auto",
          file_size: 1024,
          item_count: 5,
          is_manual: false,
        },
        syncUser1,
      );
      expect(autoRes.snapshot.expires_at).not.toBeNull();

      const promoteRes = callRpc(
        "promote_game_snapshot",
        {
          snapshot_id: autoRes.snapshot.id,
          name: "Permanent Kenshi Overhaul",
        },
        syncUser1,
      );
      expect(promoteRes.success).toBe(true);
      expect(promoteRes.snapshot.is_manual).toBe(true);
      expect(promoteRes.snapshot.expires_at).toBeNull();
      expect(promoteRes.snapshot.name).toBe("Permanent Kenshi Overhaul");

      // Verify it is not pruned
      pruneExpiredGameSnapshots(syncUser1);
      const checkRes = callRpc(
        "get_game_snapshots",
        { game_id: "kenshi" },
        syncUser1,
      );
      expect(
        checkRes.snapshots.some((s: any) => s.id === autoRes.snapshot.id),
      ).toBe(true);
    });

    it("should prune expired auto-sync items while preserving manual snapshots and cleaning physical files", () => {
      // Create a test upload file to verify physical cleanup
      const snapStorageRelative = path.join(
        "Storage",
        syncUser1,
        "games",
        "barotrauma_expired.zip",
      );
      const snapStorageAbs = path.join(
        process.cwd(),
        "uploads",
        snapStorageRelative,
      );
      fs.mkdirSync(path.dirname(snapStorageAbs), { recursive: true });
      fs.writeFileSync(snapStorageAbs, "dummy zip content", "utf-8");
      expect(fs.existsSync(snapStorageAbs)).toBe(true);

      const yesterday = new Date(
        Date.now() - 25 * 60 * 60 * 1000,
      ).toISOString();
      const expiredAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

      // Expired auto-sync snapshot
      insertTable(
        "game_snapshots",
        {
          id: "snap_expired_1",
          user_id: syncUser1,
          game_id: "barotrauma",
          category: "mod_lists",
          name: "Expired Auto-sync Barotrauma",
          is_manual: false,
          expires_at: expiredAt,
          storage_path: snapStorageRelative,
          content_hash: "hash_exp",
          file_size: 5000,
          item_count: 5,
          created_at: yesterday,
          updated_at: yesterday,
        },
        syncUser1,
      );

      // Permanent manual snapshot
      insertTable(
        "game_snapshots",
        {
          id: "snap_permanent_1",
          user_id: syncUser1,
          game_id: "barotrauma",
          category: "submarines",
          name: "Typhon Custom Submarine",
          is_manual: true,
          expires_at: null,
          content_hash: "hash_sub",
          file_size: 50000,
          item_count: 1,
          created_at: yesterday,
          updated_at: yesterday,
        },
        syncUser1,
      );

      // Calling get_game_snapshots triggers lazy pruning
      const listRes = callRpc(
        "get_game_snapshots",
        { game_id: "barotrauma" },
        syncUser1,
      );
      expect(listRes.success).toBe(true);
      expect(
        listRes.snapshots.some((s: any) => s.id === "snap_expired_1"),
      ).toBe(false);
      expect(
        listRes.snapshots.some((s: any) => s.id === "snap_permanent_1"),
      ).toBe(true);

      // Verify physical file was removed
      expect(fs.existsSync(snapStorageAbs)).toBe(false);

      // Calling get_game_snapshots with include_expired: true returns without pruning
      // Let's insert another expired snapshot
      insertTable(
        "game_snapshots",
        {
          id: "snap_expired_2",
          user_id: syncUser1,
          game_id: "barotrauma",
          category: "mod_lists",
          name: "Second Expired",
          is_manual: false,
          expires_at: expiredAt,
          content_hash: "hash_exp_2",
          file_size: 1000,
          item_count: 1,
          created_at: yesterday,
          updated_at: yesterday,
        },
        syncUser1,
      );

      const listWithExpired = callRpc(
        "get_game_snapshots",
        { game_id: "barotrauma", include_expired: true },
        syncUser1,
      );
      expect(
        listWithExpired.snapshots.some((s: any) => s.id === "snap_expired_2"),
      ).toBe(true);

      // Calling pruneExpiredGameSnapshots directly returns stats
      const pruneStats = pruneExpiredGameSnapshots(syncUser1);
      expect(pruneStats.prunedCount).toBe(1);
      expect(pruneStats.freedBytes).toBe(1000);
    });

    it("should restore snapshot metadata and delete snapshot correctly", () => {
      const created = callRpc(
        "create_game_snapshot",
        {
          game_id: "ostranauts",
          category: "saves",
          name: "Derelict Salvage",
          content_hash: "hash_ostra_salvage",
          file_size: 15000,
          item_count: 1,
          is_manual: true,
          summary: { ship_name: "K-Leg Tug" },
        },
        syncUser1,
      );

      // Restore
      const restoreRes = callRpc(
        "restore_game_snapshot",
        { snapshot_id: created.snapshot.id },
        syncUser1,
      );
      expect(restoreRes.success).toBe(true);
      expect(restoreRes.snapshot.name).toBe("Derelict Salvage");
      expect(restoreRes.restore_target.content_hash).toBe("hash_ostra_salvage");
      expect(restoreRes.restore_target.summary.ship_name).toBe("K-Leg Tug");

      // Delete
      const deleteRes = callRpc(
        "delete_game_snapshot",
        { snapshot_id: created.snapshot.id },
        syncUser1,
      );
      expect(deleteRes.success).toBe(true);
      expect(deleteRes.deleted_id).toBe(created.snapshot.id);

      const afterDelete = callRpc(
        "get_game_snapshots",
        { game_id: "ostranauts" },
        syncUser1,
      );
      expect(afterDelete.snapshots).toHaveLength(0);

      // Error handling on non-existent snapshot
      const nonExistentRestore = callRpc(
        "restore_game_snapshot",
        { snapshot_id: "nonexistent" },
        syncUser1,
      );
      expect(nonExistentRestore.success).toBe(false);
      expect(nonExistentRestore.error).toBe("Snapshot not found");

      const nonExistentDelete = callRpc(
        "delete_game_snapshot",
        { snapshot_id: "nonexistent" },
        syncUser1,
      );
      expect(nonExistentDelete.success).toBe(false);
      expect(nonExistentDelete.error).toBe("Snapshot not found");
    });
  });

  describe("Interactive Conflict Management RPCs", () => {
    const cloudSnapId = "cloud_snap_space_haven";
    const conflictId = "conflict_space_haven_1";

    beforeEach(() => {
      // Seed cloud snapshot
      insertTable(
        "game_snapshots",
        {
          id: cloudSnapId,
          user_id: syncUser1,
          game_id: "space_haven",
          category: "saves",
          name: "Cloud Fleet Save Alpha",
          is_manual: true,
          expires_at: null,
          content_hash: "cloud_hash_123",
          file_size: 120000,
          item_count: 1,
          summary: { fleet_name: "Nebula Explorers" },
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
        },
        syncUser1,
      );

      // Seed active conflict
      insertTable(
        "game_conflicts",
        {
          id: conflictId,
          user_id: syncUser1,
          game_id: "space_haven",
          category: "saves",
          status: "active",
          local_version: {
            timestamp: new Date().toISOString(),
            content_hash: "local_hash_456",
            file_size: 125000,
            item_count: 1,
            summary: { fleet_name: "Local Fleet Beta" },
            storage_temp_path: "Storage/" + syncUser1 + "/games/local_temp.zip",
          },
          cloud_version: {
            snapshot_id: cloudSnapId,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            content_hash: "cloud_hash_123",
            file_size: 120000,
            item_count: 1,
            summary: { fleet_name: "Nebula Explorers" },
          },
          created_at: new Date().toISOString(),
        },
        syncUser1,
      );

      // Put sync config into paused_conflict
      callRpc(
        "upsert_game_sync_config",
        {
          game_id: "space_haven",
          sync_status: "paused_conflict",
        },
        syncUser1,
      );
    });

    it("should retrieve active conflicts via get_game_conflicts", () => {
      const res = callRpc(
        "get_game_conflicts",
        { game_id: "space_haven" },
        syncUser1,
      );
      expect(res.success).toBe(true);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].id).toBe(conflictId);
      expect(res.conflicts[0].status).toBe("active");
    });

    it('should resolve conflict with "keep_local" mode', () => {
      const res = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_local",
          archive_name: "Resolved Local Save",
        },
        syncUser1,
      );

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_local");
      expect(res.conflict.status).toBe("resolved");
      expect(res.conflict.resolution).toBe("keep_local");
      expect(res.active_snapshot.content_hash).toBe("local_hash_456");
      expect(res.active_snapshot.is_manual).toBe(true);
      expect(res.active_snapshot.expires_at).toBeNull();

      // Verify sync_status resumed to idle
      const cfg = callRpc(
        "get_game_sync_configs",
        { game_id: "space_haven" },
        syncUser1,
      );
      expect(cfg.config.sync_status).toBe("idle");
    });

    it('should resolve conflict with "keep_cloud" mode', () => {
      const res = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_cloud",
        },
        syncUser1,
      );

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_cloud");
      expect(res.conflict.status).toBe("resolved");
      expect(res.active_snapshot.id).toBe(cloudSnapId);

      // Verify sync_status resumed to idle
      const cfg = callRpc(
        "get_game_sync_configs",
        { game_id: "space_haven" },
        syncUser1,
      );
      expect(cfg.config.sync_status).toBe("idle");
    });

    it('should resolve conflict with "keep_both" mode (non-destructive archive)', () => {
      const res = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_both",
          archive_name: "Archived Local Conflict Save",
        },
        syncUser1,
      );

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_both");
      expect(res.conflict.status).toBe("resolved");
      expect(res.archived_snapshot).toBeDefined();
      expect(res.archived_snapshot.is_archived).toBe(true);
      expect(res.archived_snapshot.archive_reason).toBe(
        "conflict_alternate_local",
      );
      expect(res.archived_snapshot.name).toBe("Archived Local Conflict Save");
      expect(res.archived_snapshot.expires_at).toBeNull(); // Permanent archive
      expect(res.active_snapshot.id).toBe(cloudSnapId);

      // Check that normal snapshot list hides archived unless requested
      const normalList = callRpc(
        "get_game_snapshots",
        { game_id: "space_haven" },
        syncUser1,
      );
      expect(
        normalList.snapshots.some(
          (s: any) => s.id === res.archived_snapshot.id,
        ),
      ).toBe(false);

      const archiveList = callRpc(
        "get_game_snapshots",
        { game_id: "space_haven", include_archived: true },
        syncUser1,
      );
      expect(
        archiveList.snapshots.some(
          (s: any) => s.id === res.archived_snapshot.id,
        ),
      ).toBe(true);

      const cfg = callRpc(
        "get_game_sync_configs",
        { game_id: "space_haven" },
        syncUser1,
      );
      expect(cfg.config.sync_status).toBe("idle");
    });

    it("should reject resolving an already resolved conflict or invalid resolution", () => {
      // 1. Resolve conflict first time
      const firstRes = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_local",
        },
        syncUser1,
      );
      expect(firstRes.success).toBe(true);

      // 2. Attempt to resolve again
      const secondRes = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_cloud",
        },
        syncUser1,
      );
      expect(secondRes.success).toBe(false);
      expect(secondRes.error).toContain("already resolved");

      // 3. Invalid resolution string
      const invalidRes = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: "nonexistent",
          resolution: "keep_neither",
        },
        syncUser1,
      );
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.error).toContain("Invalid resolution");

      // 4. Missing conflict_id
      const missingIdRes = callRpc(
        "resolve_game_conflict",
        {
          resolution: "keep_local",
        },
        syncUser1,
      );
      expect(missingIdRes.success).toBe(false);
      expect(missingIdRes.error).toBe("conflict_id is required");
    });
  });

  /* -------------------------------------------------------------------------
   * Security & Adversarial Defense Test Suite
   * ------------------------------------------------------------------------- */
  describe("Negative Security Tests: File Deletion, Retention & Tenant Isolation", () => {
    const canaryOutsideUploads = path.join(
      process.cwd(),
      "scratch_security_canary.tmp",
    );
    const siblingUploadsDir = path.join(process.cwd(), "uploads_backup");
    const siblingCanaryFile = path.join(siblingUploadsDir, "sibling_canary.zip");

    const cleanupCanaryFiles = () => {
      try {
        if (fs.existsSync(canaryOutsideUploads))
          fs.unlinkSync(canaryOutsideUploads);
      } catch {}
      try {
        if (fs.existsSync(siblingCanaryFile)) fs.unlinkSync(siblingCanaryFile);
        if (fs.existsSync(siblingUploadsDir))
          fs.rmSync(siblingUploadsDir, { recursive: true, force: true });
      } catch {}
    };

    beforeEach(() => {
      cleanupCanaryFiles();
      initUserFolder(syncUser2, {
        username: "syncplayer2",
        email: "syncplayer2@example.com",
        passwordHash: "h_sync2",
        salt: "s_sync2",
      });
    });

    afterEach(() => {
      cleanupCanaryFiles();
    });

    /* -----------------------------------------------------------------------
     * 1. delete_game_snapshot File Deletion Boundary Tests
     * ----------------------------------------------------------------------- */
    describe("delete_game_snapshot File Deletion Boundary", () => {
      it("should reject arbitrary file deletion outside uploads/ when snapshot storage_path attempts path traversal", () => {
        // Place canary file in project root
        fs.writeFileSync(canaryOutsideUploads, "CRITICAL ROOT DATA", "utf-8");
        expect(fs.existsSync(canaryOutsideUploads)).toBe(true);

        // Seed snapshot for syncUser1 pointing outside uploads
        const snap = insertTable(
          "game_snapshots",
          {
            id: "snap_traversal_attack",
            user_id: syncUser1,
            game_id: "rain_world",
            category: "saves",
            name: "Traversal Exploit Snapshot",
            is_manual: true,
            expires_at: null,
            storage_path: "../scratch_security_canary.tmp",
            content_hash: "hash_malicious",
            file_size: 100,
            item_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser1,
        );

        // Attempt deletion
        const res = callRpc(
          "delete_game_snapshot",
          { snapshot_id: snap.id },
          syncUser1,
        );
        expect(res.success).toBe(true);

        // Security assertion: Canary file outside uploads must NOT be deleted
        expect(fs.existsSync(canaryOutsideUploads)).toBe(true);
      });

      it("should prevent cross-tenant file deletion when user1 deletes snapshot pointing to user2's storage", () => {
        // Create physical storage file in User 2's folder
        const user2StorageRel = path.join(
          "Storage",
          syncUser2,
          "games",
          "user2_vital_save.zip",
        );
        const user2StorageAbs = path.join(
          process.cwd(),
          "uploads",
          user2StorageRel,
        );
        fs.mkdirSync(path.dirname(user2StorageAbs), { recursive: true });
        fs.writeFileSync(user2StorageAbs, "USER 2 PROPRIETARY SAVE", "utf-8");
        expect(fs.existsSync(user2StorageAbs)).toBe(true);

        // Seed snapshot for syncUser1 pointing to syncUser2's storage path
        const snap = insertTable(
          "game_snapshots",
          {
            id: "snap_cross_tenant_exploit",
            user_id: syncUser1,
            game_id: "barotrauma",
            category: "saves",
            name: "Cross Tenant Attack",
            is_manual: true,
            expires_at: null,
            storage_path: user2StorageRel,
            content_hash: "hash_cross",
            file_size: 200,
            item_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser1,
        );

        // User 1 deletes their snapshot
        const res = callRpc(
          "delete_game_snapshot",
          { snapshot_id: snap.id },
          syncUser1,
        );
        expect(res.success).toBe(true);

        // Security assertion: User 2's physical file must NOT be deleted
        expect(fs.existsSync(user2StorageAbs)).toBe(true);
      });

      it("should reject deleting files when storage_path is an absolute path outside user directory", () => {
        fs.writeFileSync(canaryOutsideUploads, "CANARY ABSOLUTE PATH", "utf-8");
        expect(fs.existsSync(canaryOutsideUploads)).toBe(true);

        const snap = insertTable(
          "game_snapshots",
          {
            id: "snap_absolute_path_exploit",
            user_id: syncUser1,
            game_id: "rimworld",
            category: "saves",
            name: "Absolute Path Exploit",
            is_manual: true,
            expires_at: null,
            storage_path: canaryOutsideUploads,
            content_hash: "hash_abs",
            file_size: 150,
            item_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser1,
        );

        const res = callRpc(
          "delete_game_snapshot",
          { snapshot_id: snap.id },
          syncUser1,
        );
        expect(res.success).toBe(true);
        expect(fs.existsSync(canaryOutsideUploads)).toBe(true);
      });

      it("should legitimately delete file when storage_path is properly contained in user's storage directory", () => {
        const user1StorageRel = path.join(
          "Storage",
          syncUser1,
          "games",
          "legit_user1_save.zip",
        );
        const user1StorageAbs = path.join(
          process.cwd(),
          "uploads",
          user1StorageRel,
        );
        fs.mkdirSync(path.dirname(user1StorageAbs), { recursive: true });
        fs.writeFileSync(user1StorageAbs, "LEGIT USER 1 SAVE", "utf-8");
        expect(fs.existsSync(user1StorageAbs)).toBe(true);

        const snap = insertTable(
          "game_snapshots",
          {
            id: "snap_legit_user1",
            user_id: syncUser1,
            game_id: "ostranauts",
            category: "saves",
            name: "Legitimate Manual Save",
            is_manual: true,
            expires_at: null,
            storage_path: user1StorageRel,
            content_hash: "hash_legit",
            file_size: 500,
            item_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser1,
        );

        const res = callRpc(
          "delete_game_snapshot",
          { snapshot_id: snap.id },
          syncUser1,
        );
        expect(res.success).toBe(true);

        // Physical file inside user's directory IS removed
        expect(fs.existsSync(user1StorageAbs)).toBe(false);
      });
    });

    /* -----------------------------------------------------------------------
     * 2. pruneExpiredGameSnapshots Cross-Tenant & Traversal Safety Tests
     * ----------------------------------------------------------------------- */
    describe("pruneExpiredGameSnapshots Cross-Tenant Safety", () => {
      it("should prevent cross-tenant file deletion during user-scoped snapshot pruning", () => {
        // Create User 2's valuable save file
        const user2FileRel = path.join(
          "Storage",
          syncUser2,
          "games",
          "user2_valuable_modlist.zip",
        );
        const user2FileAbs = path.join(process.cwd(), "uploads", user2FileRel);
        fs.mkdirSync(path.dirname(user2FileAbs), { recursive: true });
        fs.writeFileSync(user2FileAbs, "USER 2 ACTIVE MODLIST", "utf-8");
        expect(fs.existsSync(user2FileAbs)).toBe(true);

        // Expired snapshot in User 1's table pointing to User 2's file
        const yesterday = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
        const expiredTime = new Date(Date.now() - 1000).toISOString();

        insertTable(
          "game_snapshots",
          {
            id: "snap_exp_malicious_user1",
            user_id: syncUser1,
            game_id: "kenshi",
            category: "mod_lists",
            name: "Expired Exploit",
            is_manual: false,
            expires_at: expiredTime,
            storage_path: user2FileRel,
            content_hash: "hash_exp_cross",
            file_size: 3000,
            item_count: 1,
            created_at: yesterday,
            updated_at: yesterday,
          },
          syncUser1,
        );

        // Prune User 1's expired snapshots
        const stats = pruneExpiredGameSnapshots(syncUser1);
        expect(stats.prunedCount).toBe(1);

        // Security assertion: User 2's file must NOT have been unlinked
        expect(fs.existsSync(user2FileAbs)).toBe(true);
      });

      it("should prevent cross-tenant deletion during global prune without targetUserId", () => {
        const user2FileRel = path.join(
          "Storage",
          syncUser2,
          "games",
          "user2_global_protected.zip",
        );
        const user2FileAbs = path.join(process.cwd(), "uploads", user2FileRel);
        fs.mkdirSync(path.dirname(user2FileAbs), { recursive: true });
        fs.writeFileSync(
          user2FileAbs,
          "USER 2 PROTECTED GLOBAL ARCHIVE",
          "utf-8",
        );

        const yesterday = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
        const expiredTime = new Date(Date.now() - 1000).toISOString();

        // Expired snapshot for User 1 pointing to User 2
        insertTable(
          "game_snapshots",
          {
            id: "snap_exp_global_attack",
            user_id: syncUser1,
            game_id: "space_haven",
            category: "saves",
            name: "Expired Global Exploit",
            is_manual: false,
            expires_at: expiredTime,
            storage_path: user2FileRel,
            content_hash: "hash_glob",
            file_size: 4000,
            item_count: 1,
            created_at: yesterday,
            updated_at: yesterday,
          },
          syncUser1,
        );

        // Global prune across all users
        pruneExpiredGameSnapshots();

        // Security assertion: User 2's file remains intact
        expect(fs.existsSync(user2FileAbs)).toBe(true);
      });

      it("should reject deleting files in sibling directories with matching prefix during pruning", () => {
        fs.mkdirSync(siblingUploadsDir, { recursive: true });
        fs.writeFileSync(siblingCanaryFile, "SIBLING BACKUP DATA", "utf-8");
        expect(fs.existsSync(siblingCanaryFile)).toBe(true);

        const yesterday = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
        const expiredTime = new Date(Date.now() - 1000).toISOString();

        insertTable(
          "game_snapshots",
          {
            id: "snap_exp_sibling_prefix",
            user_id: syncUser1,
            game_id: "barotrauma",
            category: "mod_lists",
            name: "Sibling Attack",
            is_manual: false,
            expires_at: expiredTime,
            storage_path: "../uploads_backup/sibling_canary.zip",
            content_hash: "hash_sib",
            file_size: 500,
            item_count: 1,
            created_at: yesterday,
            updated_at: yesterday,
          },
          syncUser1,
        );

        pruneExpiredGameSnapshots(syncUser1);

        // Security assertion: Sibling directory file must NOT be deleted
        expect(fs.existsSync(siblingCanaryFile)).toBe(true);
      });

      it("should legitimately delete user's own expired file during retention pruning", () => {
        const user1ExpRel = path.join(
          "Storage",
          syncUser1,
          "games",
          "user1_legit_expired.zip",
        );
        const user1ExpAbs = path.join(process.cwd(), "uploads", user1ExpRel);
        fs.mkdirSync(path.dirname(user1ExpAbs), { recursive: true });
        fs.writeFileSync(user1ExpAbs, "USER 1 EXPIRED MODLIST", "utf-8");
        expect(fs.existsSync(user1ExpAbs)).toBe(true);

        const yesterday = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
        const expiredTime = new Date(Date.now() - 1000).toISOString();

        insertTable(
          "game_snapshots",
          {
            id: "snap_exp_legit_user1",
            user_id: syncUser1,
            game_id: "kenshi",
            category: "mod_lists",
            name: "Legit Expired Modlist",
            is_manual: false,
            expires_at: expiredTime,
            storage_path: user1ExpRel,
            content_hash: "hash_legit_exp",
            file_size: 2500,
            item_count: 1,
            created_at: yesterday,
            updated_at: yesterday,
          },
          syncUser1,
        );

        const stats = pruneExpiredGameSnapshots(syncUser1);
        expect(stats.prunedCount).toBeGreaterThanOrEqual(1);

        // Legitimate file inside user's directory IS removed
        expect(fs.existsSync(user1ExpAbs)).toBe(false);
      });
    });

    /* -----------------------------------------------------------------------
     * 3. create_game_snapshot Path Traversal & Category Validation Tests
     * ----------------------------------------------------------------------- */
    describe("create_game_snapshot Input Validation & Path Traversal Prevention", () => {
      it("should reject path traversal in game_id with .. or absolute path", () => {
        const traversalGameIds = [
          "../evil_game",
          "../../root_escape",
          "rain_world/../../etc",
          "C:\\Windows\\System32",
          "/etc/passwd",
        ];

        for (const badId of traversalGameIds) {
          const res = callRpc(
            "create_game_snapshot",
            {
              game_id: badId,
              category: "saves",
              name: "Attack Snapshot",
            },
            syncUser1,
          );

          expect(res.success).toBe(false);
          expect(res.error).toMatch(/Invalid game_id/i);
        }

        // Verify no snapshots were written for malicious game_ids
        const list = callRpc("get_game_snapshots", {}, syncUser1);
        expect(list.snapshots).toHaveLength(0);
      });

      it("should reject invalid or unwhitelisted categories in create_game_snapshot", () => {
        const invalidCategories = [
          "invalid_category",
          "../escaped_category",
          "arbitrary_input",
          "malicious_scripts",
          "",
        ];

        for (const badCat of invalidCategories) {
          const res = callRpc(
            "create_game_snapshot",
            {
              game_id: "rain_world",
              category: badCat,
              name: "Bad Category Snapshot",
            },
            syncUser1,
          );

          expect(res.success).toBe(false);
          expect(res.error).toMatch(
            /Invalid category|category are required|category is required/i,
          );
        }

        // Verify valid categories succeed
        const validCategories = [
          "saves",
          "mod_lists",
          "custom_mods",
          "ideologies",
          "xenotypes",
          "submarines",
          "data",
        ];

        for (const goodCat of validCategories) {
          const res = callRpc(
            "create_game_snapshot",
            {
              game_id: "rain_world",
              category: goodCat,
              name: `Valid ${goodCat} Snapshot`,
              is_manual: true,
            },
            syncUser1,
          );

          expect(res.success).toBe(true);
          expect(res.snapshot.category).toBe(goodCat);
        }
      });

      it("should reject path traversal in storage_path when creating snapshot", () => {
        const badStoragePaths = [
          "../scratch_canary.tmp",
          "../../uploads_backup/save.zip",
          "Storage/../../windows/system32/calc.exe",
          "C:\\Windows\\System32\\cmd.exe",
          "/etc/shadow",
        ];

        for (const badPath of badStoragePaths) {
          const res = callRpc(
            "create_game_snapshot",
            {
              game_id: "rain_world",
              category: "saves",
              name: "Traversal Storage Snapshot",
              storage_path: badPath,
            },
            syncUser1,
          );

          expect(res.success).toBe(false);
          expect(res.error).toMatch(/Invalid storage_path|path traversal/i);
        }
      });

      it("should reject storage_path targeting another tenant and accept legitimate storage_path", () => {
        // Cross-tenant storage path
        const crossTenantPath = `Storage/${syncUser2}/games/stolen.zip`;
        const crossRes = callRpc(
          "create_game_snapshot",
          {
            game_id: "rain_world",
            category: "saves",
            name: "Cross-Tenant Storage Snapshot",
            storage_path: crossTenantPath,
          },
          syncUser1,
        );

        expect(crossRes.success).toBe(false);
        expect(crossRes.error).toMatch(/Invalid storage_path|path traversal/i);

        // Legitimate storage path strictly inside user1's folder
        const legitPath = `Storage/${syncUser1}/games/legit_save_1.zip`;
        const legitRes = callRpc(
          "create_game_snapshot",
          {
            game_id: "rain_world",
            category: "saves",
            name: "Legit Storage Snapshot",
            storage_path: legitPath,
          },
          syncUser1,
        );

        expect(legitRes.success).toBe(true);
        expect(legitRes.snapshot.storage_path).toBe(legitPath);
      });
    });

    /* -----------------------------------------------------------------------
     * 4. getTableRows & queryTable Multi-Tenant Data Isolation Tests
     * ----------------------------------------------------------------------- */
    describe("getTableRows & queryTable Multi-Tenant Isolation", () => {
      beforeEach(() => {
        // Seed User 1 with private sync config, snapshot, conflict, and user game
        insertTable(
          "game_sync_configs",
          {
            id: "rimworld",
            user_id: syncUser1,
            game_id: "rimworld",
            enabled: true,
            categories: { saves: true },
            custom_paths: {
              install_path: "C:\\Users\\User1\\Games\\RimWorld",
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser1,
        );

        insertTable(
          "game_snapshots",
          {
            id: "snap_tenant1_private",
            user_id: syncUser1,
            game_id: "rimworld",
            category: "saves",
            name: "User1 Private Colony",
            is_manual: true,
            expires_at: null,
            content_hash: "hash_u1",
            file_size: 1000,
            item_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser1,
        );

        insertTable(
          "game_conflicts",
          {
            id: "conflict_tenant1_private",
            user_id: syncUser1,
            game_id: "rimworld",
            category: "saves",
            status: "active",
            local_version: {
              timestamp: new Date().toISOString(),
              content_hash: "u1_l",
              file_size: 1000,
              item_count: 1,
            },
            cloud_version: {
              snapshot_id: "s1",
              timestamp: new Date().toISOString(),
              content_hash: "u1_c",
              file_size: 1000,
              item_count: 1,
            },
            created_at: new Date().toISOString(),
          },
          syncUser1,
        );

        insertTable(
          "user_games",
          {
            id: "steam_730",
            user_id: syncUser1,
            game_id: "steam_730",
            title: "Counter-Strike 2",
            platform: "steam",
            is_custom: false,
          },
          syncUser1,
        );

        // Seed User 2 with distinct private sync config, snapshot, conflict, and user game
        insertTable(
          "game_sync_configs",
          {
            id: "barotrauma",
            user_id: syncUser2,
            game_id: "barotrauma",
            enabled: true,
            categories: { submarines: true },
            custom_paths: { install_path: "D:\\Games\\User2\\Barotrauma" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser2,
        );

        insertTable(
          "game_snapshots",
          {
            id: "snap_tenant2_private",
            user_id: syncUser2,
            game_id: "barotrauma",
            category: "submarines",
            name: "User2 Secret Submarine",
            is_manual: true,
            expires_at: null,
            content_hash: "hash_u2",
            file_size: 2000,
            item_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          syncUser2,
        );

        insertTable(
          "game_conflicts",
          {
            id: "conflict_tenant2_private",
            user_id: syncUser2,
            game_id: "barotrauma",
            category: "submarines",
            status: "active",
            local_version: {
              timestamp: new Date().toISOString(),
              content_hash: "u2_l",
              file_size: 2000,
              item_count: 1,
            },
            cloud_version: {
              snapshot_id: "s2",
              timestamp: new Date().toISOString(),
              content_hash: "u2_c",
              file_size: 2000,
              item_count: 1,
            },
            created_at: new Date().toISOString(),
          },
          syncUser2,
        );

        insertTable(
          "user_games",
          {
            id: "steam_1091500",
            user_id: syncUser2,
            game_id: "steam_1091500",
            title: "Cyberpunk 2077",
            platform: "steam",
            is_custom: false,
          },
          syncUser2,
        );
      });

      it("should return empty array [] when getTableRows is called without userId for all game tables and aliases", () => {
        const gameTablesToTest = [
          // game_sync_configs and aliases
          "game_sync_configs",
          "game_sync_config",
          "game_sync_settings",
          "game_sync_preferences",
          // game_snapshots and aliases
          "game_snapshots",
          "game_snapshot",
          "game_sync_snapshots",
          "game_sync_items",
          "game_saves_snapshots",
          // game_conflicts and aliases
          "game_conflicts",
          "game_conflict",
          "game_sync_conflicts",
          // user game tables and aliases
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
          "presences",
        ];

        for (const tbl of gameTablesToTest) {
          // Calling without argument (undefined)
          const rowsUndefined = getTableRows(tbl);
          expect(rowsUndefined).toEqual([]);

          // Calling with empty string
          const rowsEmptyStr = getTableRows(tbl, "");
          expect(rowsEmptyStr).toEqual([]);

          // Calling with whitespace string
          const rowsWhitespace = getTableRows(tbl, "   ");
          expect(rowsWhitespace).toEqual([]);
        }
      });

      it("should return empty array [] when queryTable is called without userId for game tables", () => {
        // Querying game_sync_configs without userId returns empty array
        const unauthConfigs = queryTable({ table: "game_sync_configs" });
        expect(unauthConfigs).toEqual([]);

        // Querying game_snapshots without userId returns empty array
        const unauthSnapshots = queryTable({ table: "game_snapshots" });
        expect(unauthSnapshots).toEqual([]);

        // Querying game_conflicts without userId returns empty array
        const unauthConflicts = queryTable({ table: "game_conflicts" });
        expect(unauthConflicts).toEqual([]);

        // Querying user_games without userId returns empty array
        const unauthGames = queryTable({ table: "user_games" });
        expect(unauthGames).toEqual([]);

        // Querying with filters but without userId must still return empty array
        const filteredUnauth = queryTable({
          table: "game_sync_configs",
          filters: [{ field: "game_id", operator: "eq", value: "rimworld" }],
        });
        expect(filteredUnauth).toEqual([]);
      });

      it("should isolate data when querying with authorized userId (positive controls)", () => {
        // User 1 queries
        const u1Configs = queryTable({
          table: "game_sync_configs",
          userId: syncUser1,
        });
        expect(u1Configs).toHaveLength(1);
        expect(u1Configs[0].game_id).toBe("rimworld");

        const u1Snapshots = queryTable({
          table: "game_snapshots",
          userId: syncUser1,
        });
        expect(u1Snapshots).toHaveLength(1);
        expect(u1Snapshots[0].name).toBe("User1 Private Colony");

        // User 2 queries
        const u2Configs = queryTable({
          table: "game_sync_configs",
          userId: syncUser2,
        });
        expect(u2Configs).toHaveLength(1);
        expect(u2Configs[0].game_id).toBe("barotrauma");

        const u2Snapshots = queryTable({
          table: "game_snapshots",
          userId: syncUser2,
        });
        expect(u2Snapshots).toHaveLength(1);
        expect(u2Snapshots[0].name).toBe("User2 Secret Submarine");

        // Cross-check: User 1 cannot retrieve User 2's snapshot via filter
        const u1CrossCheck = queryTable({
          table: "game_snapshots",
          filters: [
            { field: "id", operator: "eq", value: "snap_tenant2_private" },
          ],
          userId: syncUser1,
        });
        expect(u1CrossCheck).toHaveLength(0);
      });
    });
  });
});

