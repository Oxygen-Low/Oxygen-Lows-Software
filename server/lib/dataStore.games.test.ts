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
  UserGameRecord,
  UserPlaytimeRecord,
  UserPresenceRecord,
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
