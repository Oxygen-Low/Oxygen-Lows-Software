import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  initUserFolder,
  insertTable,
  saveTableRows,
  callRpc,
  pruneExpiredGameSnapshots,
  GameSnapshotRecord,
} from "./dataStore.ts";

describe("Empirical Challenge: Retention Engine, Mod List 24h Expiry & File Storage", () => {
  const challengeUser1 = "88101";
  const challengeUser2 = "88102";
  const challengeUser3 = "88103";
  const testUserIds = [challengeUser1, challengeUser2, challengeUser3];

  const cleanupTestUsers = () => {
    for (const uid of testUserIds) {
      // Clean Data/<userId>
      const userDir = path.join(DATA_DIR, uid);
      if (fs.existsSync(userDir)) {
        try {
          fs.rmSync(userDir, { recursive: true, force: true });
        } catch {}
      }

      // Clean uploads/Storage/<userId>
      const uploadUserDir = path.join(process.cwd(), "uploads", "Storage", uid);
      if (fs.existsSync(uploadUserDir)) {
        try {
          fs.rmSync(uploadUserDir, { recursive: true, force: true });
        } catch {}
      }
    }
  };

  beforeEach(() => {
    cleanupTestUsers();
    for (const uid of testUserIds) {
      initUserFolder(uid, {
        username: `c_user_${uid}`,
        email: `c_user_${uid}@example.com`,
        passwordHash: "h_c",
        salt: "s_c",
      });
    }
  });

  afterEach(() => {
    cleanupTestUsers();
  });

  // Helper to create dummy file in uploads/
  function createTestUploadFile(relativePath: string, content: string = "dummy"): string {
    const absPath = path.resolve(process.cwd(), "uploads", relativePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf-8");
    return absPath;
  }

  // =========================================================================
  // 1. 24h Auto-Sync Mod Lists Expiration Mechanics
  // =========================================================================
  describe("1. 24-Hour Auto-Sync Mod Lists Expiration Mechanics", () => {
    it("should calculate expires_at as exactly Date.now() + 24 hours (±1000ms) for auto-sync mod lists", () => {
      const beforeTime = Date.now();
      const res = callRpc(
        "create_game_snapshot",
        {
          game_id: "rain_world",
          category: "mod_lists",
          content_hash: "hash_rw_modlist",
          file_size: 2048,
          item_count: 8,
          is_manual: false,
        },
        challengeUser1,
      );
      const afterTime = Date.now();

      expect(res.success).toBe(true);
      expect(res.snapshot.is_manual).toBe(false);
      expect(res.snapshot.expires_at).toBeTruthy();

      const expTime = new Date(res.snapshot.expires_at).getTime();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

      expect(expTime).toBeGreaterThanOrEqual(beforeTime + TWENTY_FOUR_HOURS);
      expect(expTime).toBeLessThanOrEqual(afterTime + TWENTY_FOUR_HOURS + 1000);
    });

    it("should NOT expire an auto-sync mod list that has time remaining (boundary: now + 5000ms)", () => {
      const futureExp = new Date(Date.now() + 5000).toISOString();
      insertTable(
        "game_snapshots",
        {
          id: "snap_future_1",
          user_id: challengeUser1,
          game_id: "rimworld",
          category: "mod_lists",
          name: "Active Mod List",
          is_manual: false,
          expires_at: futureExp,
          content_hash: "hash_active",
          file_size: 3000,
          item_count: 20,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser1,
      );

      const pruneResult = pruneExpiredGameSnapshots(challengeUser1);
      expect(pruneResult.prunedCount).toBe(0);
      expect(pruneResult.freedBytes).toBe(0);

      const listRes = callRpc("get_game_snapshots", { game_id: "rimworld" }, challengeUser1);
      expect(listRes.snapshots).toHaveLength(1);
      expect(listRes.snapshots[0].id).toBe("snap_future_1");
    });

    it("should expire an auto-sync mod list as soon as expires_at <= Date.now() (boundary: now - 1ms)", () => {
      const pastExp = new Date(Date.now() - 10).toISOString();
      insertTable(
        "game_snapshots",
        {
          id: "snap_past_1",
          user_id: challengeUser1,
          game_id: "rimworld",
          category: "mod_lists",
          name: "Just Expired Mod List",
          is_manual: false,
          expires_at: pastExp,
          content_hash: "hash_past",
          file_size: 3500,
          item_count: 15,
          created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        },
        challengeUser1,
      );

      const pruneResult = pruneExpiredGameSnapshots(challengeUser1);
      expect(pruneResult.prunedCount).toBe(1);
      expect(pruneResult.freedBytes).toBe(3500);

      // Verify it is completely gone from DB
      const listRes = callRpc("get_game_snapshots", { game_id: "rimworld" }, challengeUser1);
      expect(listRes.snapshots).toHaveLength(0);
    });

    it("should NOT assign expiration to non-mod_lists auto-sync categories by default (e.g. saves, custom_mods)", () => {
      const nonModCategories = ["saves", "custom_mods", "ideologies", "xenotypes", "submarines", "data"] as const;

      for (const cat of nonModCategories) {
        const res = callRpc(
          "create_game_snapshot",
          {
            game_id: "barotrauma",
            category: cat,
            content_hash: `hash_${cat}`,
            file_size: 1024,
            item_count: 1,
            is_manual: false,
          },
          challengeUser1,
        );
        expect(res.success).toBe(true);
        expect(res.snapshot.expires_at).toBeNull();
      }
    });

    it("should respect explicit custom expires_at when passed in create_game_snapshot", () => {
      const customExp = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const res = callRpc(
        "create_game_snapshot",
        {
          game_id: "kenshi",
          category: "mod_lists",
          content_hash: "hash_custom_exp",
          file_size: 1024,
          is_manual: false,
          expires_at: customExp,
        },
        challengeUser1,
      );
      expect(res.success).toBe(true);
      expect(res.snapshot.expires_at).toBe(customExp);
    });

    it("should lazily prune expired snapshots upon calling get_game_snapshots unless include_expired: true", () => {
      const pastExp = new Date(Date.now() - 1000).toISOString();
      insertTable(
        "game_snapshots",
        {
          id: "snap_lazy_exp",
          user_id: challengeUser1,
          game_id: "kenshi",
          category: "mod_lists",
          name: "Lazy Expired",
          is_manual: false,
          expires_at: pastExp,
          content_hash: "h_lazy",
          file_size: 100,
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser1,
      );

      // include_expired: true should NOT prune
      const withExpired = callRpc(
        "get_game_snapshots",
        { game_id: "kenshi", include_expired: true },
        challengeUser1,
      );
      expect(withExpired.snapshots.some((s: any) => s.id === "snap_lazy_exp")).toBe(true);

      // Standard call without include_expired triggers prune
      const withoutExpired = callRpc(
        "get_game_snapshots",
        { game_id: "kenshi" },
        challengeUser1,
      );
      expect(withoutExpired.snapshots.some((s: any) => s.id === "snap_lazy_exp")).toBe(false);
    });
  });

  // =========================================================================
  // 2. Permanent Manual Saves Never Expiring
  // =========================================================================
  describe("2. Permanent Manual Saves NEVER Expiring", () => {
    it("should guarantee expires_at is null for manual saves even if expires_at is passed in arguments", () => {
      const passedExp = new Date(Date.now() - 3600000).toISOString();
      const res = callRpc(
        "create_game_snapshot",
        {
          game_id: "rain_world",
          category: "mod_lists",
          name: "Manual Preservation Override",
          content_hash: "hash_man_override",
          file_size: 4096,
          item_count: 5,
          is_manual: true,
          expires_at: passedExp, // Attempting to pass an expiration to a manual save
        },
        challengeUser1,
      );

      expect(res.success).toBe(true);
      expect(res.snapshot.is_manual).toBe(true);
      expect(res.snapshot.expires_at).toBeNull();
    });

    it("should NEVER prune a manual snapshot even if expires_at was somehow populated in DB with past date", () => {
      const pastExp = new Date(Date.now() - 1000000).toISOString();
      insertTable(
        "game_snapshots",
        {
          id: "snap_manual_anomalous",
          user_id: challengeUser1,
          game_id: "ostranauts",
          category: "saves",
          name: "Manual Save With Corrupt Timestamp",
          is_manual: true, // Manual flag is true!
          expires_at: pastExp,
          content_hash: "hash_anom",
          file_size: 9999,
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser1,
      );

      const stats = pruneExpiredGameSnapshots(challengeUser1);
      expect(stats.prunedCount).toBe(0);

      const listRes = callRpc("get_game_snapshots", { game_id: "ostranauts" }, challengeUser1);
      expect(listRes.snapshots.some((s: any) => s.id === "snap_manual_anomalous")).toBe(true);
    });

    it("should withstand 20 consecutive aggressive prune runs without deleting permanent manual saves", () => {
      callRpc(
        "create_game_snapshot",
        {
          game_id: "space_haven",
          category: "saves",
          name: "Alpha 19 Safe Haven",
          is_manual: true,
          content_hash: "hash_sh_safe",
          file_size: 20000,
          item_count: 1,
        },
        challengeUser1,
      );

      for (let i = 0; i < 20; i++) {
        pruneExpiredGameSnapshots(challengeUser1);
      }

      const listRes = callRpc("get_game_snapshots", { game_id: "space_haven" }, challengeUser1);
      expect(listRes.snapshots).toHaveLength(1);
      expect(listRes.snapshots[0].name).toBe("Alpha 19 Safe Haven");
      expect(listRes.snapshots[0].is_manual).toBe(true);
      expect(listRes.snapshots[0].expires_at).toBeNull();
    });
  });

  // =========================================================================
  // 3. Snapshot Promotion from Auto-Sync to Manual
  // =========================================================================
  describe("3. Snapshot Promotion from Auto-Sync to Manual", () => {
    it("should promote auto-synced mod list: set is_manual=true, expires_at=null, and update name", () => {
      const created = callRpc(
        "create_game_snapshot",
        {
          game_id: "barotrauma",
          category: "mod_lists",
          content_hash: "h_promo",
          file_size: 512,
          item_count: 3,
          is_manual: false,
        },
        challengeUser1,
      );
      expect(created.snapshot.is_manual).toBe(false);
      expect(created.snapshot.expires_at).toBeTruthy();

      const promoted = callRpc(
        "promote_game_snapshot",
        {
          snapshot_id: created.snapshot.id,
          name: "Campaign Ready Mod Loadout",
        },
        challengeUser1,
      );

      expect(promoted.success).toBe(true);
      expect(promoted.snapshot.id).toBe(created.snapshot.id);
      expect(promoted.snapshot.is_manual).toBe(true);
      expect(promoted.snapshot.expires_at).toBeNull();
      expect(promoted.snapshot.name).toBe("Campaign Ready Mod Loadout");

      // Verify that after promotion, running prune does NOT delete it
      pruneExpiredGameSnapshots(challengeUser1);
      const list = callRpc("get_game_snapshots", { game_id: "barotrauma" }, challengeUser1);
      expect(list.snapshots.some((s: any) => s.id === created.snapshot.id)).toBe(true);
    });

    it("should retain existing name if new name is not specified during promotion", () => {
      const created = callRpc(
        "create_game_snapshot",
        {
          game_id: "barotrauma",
          category: "mod_lists",
          name: "Auto-sync Default Title",
          content_hash: "h_title",
          file_size: 256,
          item_count: 1,
          is_manual: false,
        },
        challengeUser1,
      );

      const promoted = callRpc(
        "promote_game_snapshot",
        { snapshot_id: created.snapshot.id },
        challengeUser1,
      );

      expect(promoted.success).toBe(true);
      expect(promoted.snapshot.name).toBe("Auto-sync Default Title");
      expect(promoted.snapshot.is_manual).toBe(true);
      expect(promoted.snapshot.expires_at).toBeNull();
    });

    it("should handle promote_game_snapshot on already manual snapshot idempotently", () => {
      const manual = callRpc(
        "create_game_snapshot",
        {
          game_id: "kenshi",
          category: "saves",
          name: "Initial Manual",
          is_manual: true,
          content_hash: "h_m",
        },
        challengeUser1,
      );

      const promoAgain = callRpc(
        "promote_game_snapshot",
        { snapshot_id: manual.snapshot.id, name: "Updated Manual Title" },
        challengeUser1,
      );
      expect(promoAgain.success).toBe(true);
      expect(promoAgain.snapshot.is_manual).toBe(true);
      expect(promoAgain.snapshot.expires_at).toBeNull();
      expect(promoAgain.snapshot.name).toBe("Updated Manual Title");
    });

    it("should return error when snapshot_id does not exist or unauthorized", () => {
      const noAuth = callRpc("promote_game_snapshot", { snapshot_id: "nonexistent" });
      expect(noAuth.success).toBe(false);
      expect(noAuth.error).toBe("Unauthorized");

      const noId = callRpc("promote_game_snapshot", {}, challengeUser1);
      expect(noId.success).toBe(false);
      expect(noId.error).toBe("snapshot_id is required");

      const notFound = callRpc(
        "promote_game_snapshot",
        { snapshot_id: "ghost_snapshot_id" },
        challengeUser1,
      );
      expect(notFound.success).toBe(false);
      expect(notFound.error).toBe("Snapshot not found");
    });
  });

  // =========================================================================
  // 4. Physical File Deletion when storage_path is Present
  // =========================================================================
  describe("4. Physical File Deletion when storage_path is Present", () => {
    it("should unlink physical archive file when auto-sync snapshot expires and accurately tally freedBytes", () => {
      const relPath = path.join("Storage", challengeUser1, "games", "rainworld_archive_expired.zip");
      const absPath = createTestUploadFile(relPath, "binary zip payload of 2048 bytes");
      expect(fs.existsSync(absPath)).toBe(true);

      const pastExp = new Date(Date.now() - 3600000).toISOString();
      insertTable(
        "game_snapshots",
        {
          id: "snap_with_file_1",
          user_id: challengeUser1,
          game_id: "rain_world",
          category: "mod_lists",
          name: "Expired RW Mod List with File",
          is_manual: false,
          expires_at: pastExp,
          storage_path: relPath,
          content_hash: "hash_rw_zip",
          file_size: 2048,
          item_count: 5,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date(Date.now() - 86400000).toISOString(),
        },
        challengeUser1,
      );

      const stats = pruneExpiredGameSnapshots(challengeUser1);
      expect(stats.prunedCount).toBe(1);
      expect(stats.freedBytes).toBe(2048);

      // File must be deleted
      expect(fs.existsSync(absPath)).toBe(false);
    });

    it("should NEVER delete physical file if snapshot is manual", () => {
      const relPath = path.join("Storage", challengeUser1, "games", "rimworld_manual_save.zip");
      const absPath = createTestUploadFile(relPath, "critical manual save data");
      expect(fs.existsSync(absPath)).toBe(true);

      insertTable(
        "game_snapshots",
        {
          id: "snap_manual_with_file",
          user_id: challengeUser1,
          game_id: "rimworld",
          category: "saves",
          name: "My 10-Year Colony",
          is_manual: true,
          expires_at: null,
          storage_path: relPath,
          content_hash: "hash_rw_manual",
          file_size: 50000,
          item_count: 1,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date(Date.now() - 86400000).toISOString(),
        },
        challengeUser1,
      );

      const stats = pruneExpiredGameSnapshots(challengeUser1);
      expect(stats.prunedCount).toBe(0);
      expect(stats.freedBytes).toBe(0);

      // Physical file must still exist
      expect(fs.existsSync(absPath)).toBe(true);
    });

    it("should safely tolerate missing physical files without throwing or halting pruning", () => {
      const nonExistentRelPath = path.join("Storage", challengeUser1, "games", "ghost_file.zip");
      const pastExp = new Date(Date.now() - 3600000).toISOString();

      insertTable(
        "game_snapshots",
        {
          id: "snap_missing_file",
          user_id: challengeUser1,
          game_id: "library_of_ruina",
          category: "data",
          name: "Missing File Snapshot",
          is_manual: false,
          expires_at: pastExp,
          storage_path: nonExistentRelPath,
          content_hash: "hash_missing",
          file_size: 1500,
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser1,
      );

      expect(() => pruneExpiredGameSnapshots(challengeUser1)).not.toThrow();
      const list = callRpc("get_game_snapshots", { game_id: "library_of_ruina" }, challengeUser1);
      expect(list.snapshots).toHaveLength(0);
    });

    it("should prevent directory traversal file deletion in pruneExpiredGameSnapshots", () => {
      // Create a decoy file outside uploads (e.g. in test user folder or temp area)
      const externalDir = path.join(DATA_DIR, challengeUser1, "decoy");
      fs.mkdirSync(externalDir, { recursive: true });
      const externalFile = path.join(externalDir, "do_not_delete.txt");
      fs.writeFileSync(externalFile, "precious data", "utf-8");
      expect(fs.existsSync(externalFile)).toBe(true);

      const pastExp = new Date(Date.now() - 3600000).toISOString();
      const traversalPath = path.relative(
        path.resolve(process.cwd(), "uploads"),
        externalFile,
      );

      insertTable(
        "game_snapshots",
        {
          id: "snap_traversal_attack",
          user_id: challengeUser1,
          game_id: "kenshi",
          category: "mod_lists",
          name: "Exploit Snapshot",
          is_manual: false,
          expires_at: pastExp,
          storage_path: traversalPath,
          content_hash: "hash_evil",
          file_size: 666,
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser1,
      );

      pruneExpiredGameSnapshots(challengeUser1);

      // Decoy file outside uploads must remain intact!
      expect(fs.existsSync(externalFile)).toBe(true);
    });

    it("should delete physical storage file upon calling delete_game_snapshot RPC", () => {
      const relPath = path.join("Storage", challengeUser1, "games", "explicit_delete.zip");
      const absPath = createTestUploadFile(relPath, "file to be deleted via RPC");
      expect(fs.existsSync(absPath)).toBe(true);

      const created = callRpc(
        "create_game_snapshot",
        {
          game_id: "ostranauts",
          category: "saves",
          name: "To Be Deleted",
          storage_path: relPath,
          content_hash: "h_del",
          file_size: 1234,
          is_manual: true,
        },
        challengeUser1,
      );

      const delRes = callRpc(
        "delete_game_snapshot",
        { snapshot_id: created.snapshot.id },
        challengeUser1,
      );
      expect(delRes.success).toBe(true);
      expect(delRes.deleted_id).toBe(created.snapshot.id);

      // Verify physical file was unlinked
      expect(fs.existsSync(absPath)).toBe(false);

      // Verify DB record is gone
      const list = callRpc("get_game_snapshots", { game_id: "ostranauts" }, challengeUser1);
      expect(list.snapshots).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. Stress, Multi-User, and Chaos Pruning
  // =========================================================================
  describe("5. High-Load Stress, Multi-User & Chaos Pruning", () => {
    it(
      "should stress-test 150 snapshots with 75 expired and 75 permanent/future snapshots",
      () => {
        const now = Date.now();
        const pastExp = new Date(now - 3600000).toISOString();
        const futureExp = new Date(now + 3600000).toISOString();

        let expectedFreedBytes = 0;
        const createdFiles: string[] = [];
        const allSnapshots: any[] = [];

        for (let i = 0; i < 75; i++) {
          // Expired auto-sync with file
          const relPath = path.join("Storage", challengeUser1, "games", `stress_exp_${i}.zip`);
          const absPath = createTestUploadFile(relPath, `content_${i}`);
          createdFiles.push(absPath);
          expectedFreedBytes += 100 + i;

          allSnapshots.push({
            id: `snap_exp_${i}`,
            user_id: challengeUser1,
            game_id: "rimworld",
            category: "mod_lists",
            name: `Expired Mod List ${i}`,
            is_manual: false,
            expires_at: pastExp,
            storage_path: relPath,
            file_size: 100 + i,
            content_hash: `hash_${i}`,
            item_count: i + 1,
            created_at: new Date(now - 90000000).toISOString(),
            updated_at: new Date(now - 90000000).toISOString(),
          });
        }

        for (let i = 0; i < 40; i++) {
          // Future auto-sync (should NOT be pruned)
          allSnapshots.push({
            id: `snap_future_${i}`,
            user_id: challengeUser1,
            game_id: "rimworld",
            category: "mod_lists",
            name: `Future Mod List ${i}`,
            is_manual: false,
            expires_at: futureExp,
            file_size: 500,
            content_hash: `hash_future_${i}`,
            item_count: 10,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        for (let i = 0; i < 35; i++) {
          // Manual permanent saves (should NOT be pruned)
          allSnapshots.push({
            id: `snap_manual_${i}`,
            user_id: challengeUser1,
            game_id: "rimworld",
            category: "saves",
            name: `Manual Save ${i}`,
            is_manual: true,
            expires_at: null,
            file_size: 1000,
            content_hash: `hash_manual_${i}`,
            item_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        saveTableRows("game_snapshots", challengeUser1, allSnapshots);

      const stats = pruneExpiredGameSnapshots(challengeUser1);
      expect(stats.prunedCount).toBe(75);
      expect(stats.freedBytes).toBe(expectedFreedBytes);

      // All 75 files must be deleted
      for (const f of createdFiles) {
        expect(fs.existsSync(f)).toBe(false);
      }

      // 40 future + 35 manual = 75 snapshots must remain in DB
      const remaining = callRpc(
        "get_game_snapshots",
        { game_id: "rimworld", include_expired: true },
        challengeUser1,
      );
      expect(remaining.snapshots).toHaveLength(75);
      expect(remaining.snapshots.filter((s: any) => s.is_manual)).toHaveLength(35);
      expect(remaining.snapshots.filter((s: any) => !s.is_manual)).toHaveLength(40);
    }, 30000);

    it("should perform global prune across ALL users when userId argument is omitted", () => {
      const pastExp = new Date(Date.now() - 3600000).toISOString();

      insertTable(
        "game_snapshots",
        {
          id: "snap_u1_exp",
          user_id: challengeUser1,
          game_id: "barotrauma",
          category: "mod_lists",
          name: "User 1 Expired",
          is_manual: false,
          expires_at: pastExp,
          file_size: 1000,
          content_hash: "h_u1",
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser1,
      );

      insertTable(
        "game_snapshots",
        {
          id: "snap_u2_exp",
          user_id: challengeUser2,
          game_id: "kenshi",
          category: "mod_lists",
          name: "User 2 Expired",
          is_manual: false,
          expires_at: pastExp,
          file_size: 2000,
          content_hash: "h_u2",
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser2,
      );

      insertTable(
        "game_snapshots",
        {
          id: "snap_u3_manual",
          user_id: challengeUser3,
          game_id: "ostranauts",
          category: "saves",
          name: "User 3 Manual",
          is_manual: true,
          expires_at: null,
          file_size: 3000,
          content_hash: "h_u3",
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser3,
      );

      // Global prune with no user specified
      const globalStats = pruneExpiredGameSnapshots();
      expect(globalStats.prunedCount).toBeGreaterThanOrEqual(2);
      expect(globalStats.freedBytes).toBeGreaterThanOrEqual(3000);

      // User 1 & 2's expired snapshots should be gone
      const u1List = callRpc("get_game_snapshots", { game_id: "barotrauma" }, challengeUser1);
      expect(u1List.snapshots).toHaveLength(0);

      const u2List = callRpc("get_game_snapshots", { game_id: "kenshi" }, challengeUser2);
      expect(u2List.snapshots).toHaveLength(0);

      // User 3's manual snapshot must remain
      const u3List = callRpc("get_game_snapshots", { game_id: "ostranauts" }, challengeUser3);
      expect(u3List.snapshots).toHaveLength(1);
    });

    it("should handle corrupt or abnormal date strings gracefully without throwing", () => {
      insertTable(
        "game_snapshots",
        {
          id: "snap_invalid_date",
          user_id: challengeUser1,
          game_id: "lobotomy_corporation",
          category: "data",
          name: "Corrupt Date Snapshot",
          is_manual: false,
          expires_at: "NOT_A_VALID_DATE_STRING",
          file_size: "invalid_size" as any,
          content_hash: "h_corrupt",
          item_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        challengeUser1,
      );

      let stats: any;
      expect(() => {
        stats = pruneExpiredGameSnapshots(challengeUser1);
      }).not.toThrow();

      // Because date is invalid, it is not pruned
      expect(stats.prunedCount).toBe(0);
    });
  });
});
