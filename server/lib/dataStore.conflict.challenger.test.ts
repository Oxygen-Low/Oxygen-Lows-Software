import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  initUserFolder,
  getTableRows,
  insertTable,
  callRpc,
  pruneExpiredGameSnapshots,
  GameSyncConfigRecord,
  GameSnapshotRecord,
  GameConflictRecord,
} from "./dataStore.ts";

describe("Challenger: Conflict Resolution RPC Empirical Stress Test", () => {
  const challengerUser1 = "88001";
  const challengerUser2 = "88002";
  const testUsers = [challengerUser1, challengerUser2];

  const cleanup = () => {
    for (const uid of testUsers) {
      const udir = path.join(DATA_DIR, uid);
      if (fs.existsSync(udir)) {
        try {
          fs.rmSync(udir, { recursive: true, force: true });
        } catch {}
      }
    }
  };

  beforeEach(() => {
    cleanup();
    for (const uid of testUsers) {
      initUserFolder(uid, {
        username: `user_${uid}`,
        email: `user_${uid}@test.local`,
        passwordHash: "hash123",
        salt: "salt123",
      });
    }
  });

  afterEach(() => {
    cleanup();
  });

  describe("keep_local resolution", () => {
    it("promotes local version to active manual snapshot, restores sync_status to idle, and preserves metadata", () => {
      const cloudSnapId = "cloud_snap_rainworld_1";
      const conflictId = "conflict_rainworld_1";

      // 1. Seed cloud snapshot
      insertTable(
        "game_snapshots",
        {
          id: cloudSnapId,
          user_id: challengerUser1,
          game_id: "rain_world",
          category: "mod_lists",
          name: "Cloud Expedition Modpack",
          is_manual: false,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          content_hash: "sha256_cloud_hash_abc",
          file_size: 45000,
          item_count: 12,
          summary: { mod_count: 12, mods: ["Downpour", "DevTools"] },
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
        },
        challengerUser1,
      );

      // 2. Seed active conflict
      insertTable(
        "game_conflicts",
        {
          id: conflictId,
          user_id: challengerUser1,
          game_id: "rain_world",
          category: "mod_lists",
          status: "active",
          local_version: {
            timestamp: new Date().toISOString(),
            content_hash: "sha256_local_hash_def",
            file_size: 48500,
            item_count: 14,
            summary: { mod_count: 14, mods: ["Downpour", "DevTools", "CustomSlugcat", "MoreSlugcats"] },
            storage_temp_path: `Storage/${challengerUser1}/games/local_rw_mods.zip`,
          },
          cloud_version: {
            snapshot_id: cloudSnapId,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            content_hash: "sha256_cloud_hash_abc",
            file_size: 45000,
            item_count: 12,
            summary: { mod_count: 12, mods: ["Downpour", "DevTools"] },
          },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      // 3. Mark sync_status as paused_conflict
      callRpc(
        "upsert_game_sync_config",
        {
          game_id: "rain_world",
          sync_status: "paused_conflict",
        },
        challengerUser1,
      );

      // 4. Resolve conflict with keep_local
      const res = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_local",
          archive_name: "Expedition Local Survivor Pack",
        },
        challengerUser1,
      );

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_local");
      expect(res.conflict.status).toBe("resolved");
      expect(res.conflict.resolution).toBe("keep_local");
      expect(res.conflict.resolved_at).toBeDefined();

      // Check active_snapshot properties
      const activeSnap = res.active_snapshot;
      expect(activeSnap).toBeDefined();
      expect(activeSnap.id).toBeDefined();
      expect(activeSnap.id).not.toBe(cloudSnapId);
      expect(activeSnap.name).toBe("Expedition Local Survivor Pack");
      expect(activeSnap.content_hash).toBe("sha256_local_hash_def");
      expect(activeSnap.file_size).toBe(48500);
      expect(activeSnap.item_count).toBe(14);
      expect(activeSnap.storage_path).toBe(`Storage/${challengerUser1}/games/local_rw_mods.zip`);
      expect(activeSnap.is_manual).toBe(true);
      expect(activeSnap.expires_at).toBeNull();
      expect(activeSnap.summary.mod_count).toBe(14);

      // Check that sync_status is restored to idle
      const configRes = callRpc(
        "get_game_sync_configs",
        { game_id: "rain_world" },
        challengerUser1,
      );
      expect(configRes.config.sync_status).toBe("idle");

      // Verify active snapshot is retrievable via get_game_snapshots
      const snapList = callRpc(
        "get_game_snapshots",
        { game_id: "rain_world", category: "mod_lists" },
        challengerUser1,
      );
      expect(snapList.snapshots.some((s: any) => s.id === activeSnap.id)).toBe(true);

      // Verify active snapshot survives pruning
      pruneExpiredGameSnapshots(challengerUser1);
      const afterPrune = callRpc(
        "get_game_snapshots",
        { game_id: "rain_world", category: "mod_lists" },
        challengerUser1,
      );
      expect(afterPrune.snapshots.some((s: any) => s.id === activeSnap.id)).toBe(true);
    });
  });

  describe("keep_cloud resolution", () => {
    it("retains existing cloud snapshot as active, restores sync_status to idle, and creates no duplicates", () => {
      const cloudSnapId = "cloud_snap_rimworld_1";
      const conflictId = "conflict_rimworld_1";

      // 1. Seed cloud snapshot
      insertTable(
        "game_snapshots",
        {
          id: cloudSnapId,
          user_id: challengerUser1,
          game_id: "rimworld",
          category: "saves",
          name: "Colony Year 5 - Cassandra Hard",
          is_manual: true,
          expires_at: null,
          content_hash: "sha256_cloud_rw_colony",
          file_size: 980000,
          item_count: 1,
          summary: { colonists: 8, wealth: 154000 },
          created_at: new Date(Date.now() - 7200000).toISOString(),
          updated_at: new Date(Date.now() - 7200000).toISOString(),
        },
        challengerUser1,
      );

      // 2. Seed active conflict
      insertTable(
        "game_conflicts",
        {
          id: conflictId,
          user_id: challengerUser1,
          game_id: "rimworld",
          category: "saves",
          status: "active",
          local_version: {
            timestamp: new Date().toISOString(),
            content_hash: "sha256_local_rw_colony",
            file_size: 985000,
            item_count: 1,
            summary: { colonists: 9, wealth: 160000 },
            storage_temp_path: `Storage/${challengerUser1}/games/local_rimworld_colony.zip`,
          },
          cloud_version: {
            snapshot_id: cloudSnapId,
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            content_hash: "sha256_cloud_rw_colony",
            file_size: 980000,
            item_count: 1,
            summary: { colonists: 8, wealth: 154000 },
          },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      // 3. Mark sync_status as paused_conflict
      callRpc(
        "upsert_game_sync_config",
        {
          game_id: "rimworld",
          sync_status: "paused_conflict",
        },
        challengerUser1,
      );

      const countBefore = (getTableRows("game_snapshots", challengerUser1) as GameSnapshotRecord[]).length;
      expect(countBefore).toBe(1);

      // 4. Resolve conflict with keep_cloud
      const res = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_cloud",
        },
        challengerUser1,
      );

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_cloud");
      expect(res.active_snapshot).toBeDefined();
      expect(res.active_snapshot.id).toBe(cloudSnapId);
      expect(res.archived_snapshot).toBeNull();
      expect(res.conflict.status).toBe("resolved");
      expect(res.conflict.resolution).toBe("keep_cloud");

      // Verify no extra snapshots were created
      const countAfter = (getTableRows("game_snapshots", challengerUser1) as GameSnapshotRecord[]).length;
      expect(countAfter).toBe(1);

      // Check sync_status returned to idle
      const configRes = callRpc(
        "get_game_sync_configs",
        { game_id: "rimworld" },
        challengerUser1,
      );
      expect(configRes.config.sync_status).toBe("idle");
    });
  });

  describe("keep_both resolution", () => {
    it("safely archives local version as permanent backup snapshot with zero data loss, retains cloud snapshot as active, and hides archive from default list", () => {
      const cloudSnapId = "cloud_snap_barotrauma_1";
      const conflictId = "conflict_barotrauma_1";

      // 1. Seed cloud snapshot
      insertTable(
        "game_snapshots",
        {
          id: cloudSnapId,
          user_id: challengerUser1,
          game_id: "barotrauma",
          category: "submarines",
          name: "Orca Mark II Submarine",
          is_manual: true,
          expires_at: null,
          content_hash: "sha256_cloud_orca_hash",
          file_size: 250000,
          item_count: 1,
          summary: { hull_health: 100, class: "Deep Diver" },
          created_at: new Date(Date.now() - 5000000).toISOString(),
          updated_at: new Date(Date.now() - 5000000).toISOString(),
        },
        challengerUser1,
      );

      // 2. Seed active conflict
      insertTable(
        "game_conflicts",
        {
          id: conflictId,
          user_id: challengerUser1,
          game_id: "barotrauma",
          category: "submarines",
          status: "active",
          local_version: {
            timestamp: new Date().toISOString(),
            content_hash: "sha256_local_orca_upgraded_hash",
            file_size: 265000,
            item_count: 1,
            summary: { hull_health: 100, class: "Deep Diver Upgraded Coilguns" },
            storage_temp_path: `Storage/${challengerUser1}/games/orca_upgraded.sub`,
          },
          cloud_version: {
            snapshot_id: cloudSnapId,
            timestamp: new Date(Date.now() - 5000000).toISOString(),
            content_hash: "sha256_cloud_orca_hash",
            file_size: 250000,
            item_count: 1,
            summary: { hull_health: 100, class: "Deep Diver" },
          },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      // 3. Mark sync_status as paused_conflict
      callRpc(
        "upsert_game_sync_config",
        {
          game_id: "barotrauma",
          sync_status: "paused_conflict",
        },
        challengerUser1,
      );

      // 4. Resolve conflict with keep_both
      const res = callRpc(
        "resolve_game_conflict",
        {
          conflict_id: conflictId,
          resolution: "keep_both",
          archive_name: "Orca II Alternate Variant Local",
        },
        challengerUser1,
      );

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_both");
      expect(res.conflict.status).toBe("resolved");
      expect(res.conflict.resolution).toBe("keep_both");

      // Active snapshot is the cloud snapshot
      expect(res.active_snapshot).toBeDefined();
      expect(res.active_snapshot.id).toBe(cloudSnapId);

      // Archived snapshot is created from local version
      const arch = res.archived_snapshot;
      expect(arch).toBeDefined();
      expect(arch.is_archived).toBe(true);
      expect(arch.archive_reason).toBe("conflict_alternate_local");
      expect(arch.is_manual).toBe(true);
      expect(arch.expires_at).toBeNull(); // Permanent retention
      expect(arch.name).toBe("Orca II Alternate Variant Local");
      expect(arch.content_hash).toBe("sha256_local_orca_upgraded_hash");
      expect(arch.file_size).toBe(265000);
      expect(arch.item_count).toBe(1);
      expect(arch.storage_path).toBe(`Storage/${challengerUser1}/games/orca_upgraded.sub`);
      expect(arch.summary.class).toBe("Deep Diver Upgraded Coilguns");

      // Verify ZERO DATA LOSS: both exist in game_snapshots
      const allRows = getTableRows("game_snapshots", challengerUser1) as GameSnapshotRecord[];
      expect(allRows).toHaveLength(2);
      expect(allRows.some((s) => s.id === cloudSnapId && !s.is_archived)).toBe(true);
      expect(allRows.some((s) => s.id === arch.id && s.is_archived === true)).toBe(true);

      // Check default get_game_snapshots hides archived snapshot
      const defaultView = callRpc(
        "get_game_snapshots",
        { game_id: "barotrauma" },
        challengerUser1,
      );
      expect(defaultView.snapshots).toHaveLength(1);
      expect(defaultView.snapshots[0].id).toBe(cloudSnapId);
      expect(defaultView.snapshots.some((s: any) => s.id === arch.id)).toBe(false);

      // Check include_archived: true displays both
      const archivedView = callRpc(
        "get_game_snapshots",
        { game_id: "barotrauma", include_archived: true },
        challengerUser1,
      );
      expect(archivedView.snapshots).toHaveLength(2);
      expect(archivedView.snapshots.some((s: any) => s.id === arch.id)).toBe(true);

      // Check that pruning does NOT touch archived snapshot
      pruneExpiredGameSnapshots(challengerUser1);
      const afterPrune = callRpc(
        "get_game_snapshots",
        { game_id: "barotrauma", include_archived: true },
        challengerUser1,
      );
      expect(afterPrune.snapshots.some((s: any) => s.id === arch.id)).toBe(true);

      // Check sync_status returns to idle
      const configRes = callRpc(
        "get_game_sync_configs",
        { game_id: "barotrauma" },
        challengerUser1,
      );
      expect(configRes.config.sync_status).toBe("idle");
    });
  });

  describe("Error cases, Edge cases and Boundary Conditions", () => {
    it("rejects double resolve attempts with clear error message", () => {
      const conflictId = "conflict_kenshi_1";
      insertTable(
        "game_conflicts",
        {
          id: conflictId,
          user_id: challengerUser1,
          game_id: "kenshi",
          category: "saves",
          status: "active",
          local_version: {
            timestamp: new Date().toISOString(),
            content_hash: "local_h",
            file_size: 100,
            item_count: 1,
          },
          cloud_version: {
            snapshot_id: "snap_kenshi_c",
            timestamp: new Date().toISOString(),
            content_hash: "cloud_h",
            file_size: 100,
            item_count: 1,
          },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      // First resolution succeeds
      const first = callRpc(
        "resolve_game_conflict",
        { conflict_id: conflictId, resolution: "keep_local" },
        challengerUser1,
      );
      expect(first.success).toBe(true);

      // Second resolution fails
      const second = callRpc(
        "resolve_game_conflict",
        { conflict_id: conflictId, resolution: "keep_cloud" },
        challengerUser1,
      );
      expect(second.success).toBe(false);
      expect(second.error).toContain("already resolved");

      // Third resolution with keep_both also fails
      const third = callRpc(
        "resolve_game_conflict",
        { conflict_id: conflictId, resolution: "keep_both" },
        challengerUser1,
      );
      expect(third.success).toBe(false);
      expect(third.error).toContain("already resolved");
    });

    it("rejects invalid resolution modes (typos, arbitrary strings, missing)", () => {
      const conflictId = "conflict_kenshi_2";
      insertTable(
        "game_conflicts",
        {
          id: conflictId,
          user_id: challengerUser1,
          game_id: "kenshi",
          category: "saves",
          status: "active",
          local_version: { timestamp: new Date().toISOString(), content_hash: "lh", file_size: 10, item_count: 1 },
          cloud_version: { snapshot_id: "s1", timestamp: new Date().toISOString(), content_hash: "ch", file_size: 10, item_count: 1 },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      const invalidModes = ["keep_neither", "merge", "override", "keep_all", "", "KEEP_LOCAL", "123"];
      for (const mode of invalidModes) {
        const res = callRpc(
          "resolve_game_conflict",
          { conflict_id: conflictId, resolution: mode },
          challengerUser1,
        );
        expect(res.success).toBe(false);
        expect(res.error).toContain('Invalid resolution. Must be "keep_local", "keep_cloud", or "keep_both"');
      }
    });

    it("rejects missing or empty conflict_id", () => {
      const res1 = callRpc("resolve_game_conflict", { resolution: "keep_local" }, challengerUser1);
      expect(res1.success).toBe(false);
      expect(res1.error).toBe("conflict_id is required");

      const res2 = callRpc("resolve_game_conflict", { conflict_id: "   ", resolution: "keep_local" }, challengerUser1);
      expect(res2.success).toBe(false);
      expect(res2.error).toBe("conflict_id is required");
    });

    it("rejects resolution of nonexistent conflict_id", () => {
      const res = callRpc(
        "resolve_game_conflict",
        { conflict_id: "non_existent_conflict_uuid", resolution: "keep_local" },
        challengerUser1,
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe("Conflict not found");
    });

    it("enforces cross-user isolation: User B cannot resolve User A conflict", () => {
      const conflictId = "conflict_user1_ostranauts";
      insertTable(
        "game_conflicts",
        {
          id: conflictId,
          user_id: challengerUser1,
          game_id: "ostranauts",
          category: "saves",
          status: "active",
          local_version: { timestamp: new Date().toISOString(), content_hash: "lh", file_size: 10, item_count: 1 },
          cloud_version: { snapshot_id: "s1", timestamp: new Date().toISOString(), content_hash: "ch", file_size: 10, item_count: 1 },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      // User 2 attempts to resolve User 1 conflict
      const rogueRes = callRpc(
        "resolve_game_conflict",
        { conflict_id: conflictId, resolution: "keep_local" },
        challengerUser2,
      );
      expect(rogueRes.success).toBe(false);
      expect(rogueRes.error).toBe("Conflict not found");

      // Verify User 1 conflict remains active and untouched
      const conflicts = callRpc("get_game_conflicts", { game_id: "ostranauts" }, challengerUser1);
      expect(conflicts.conflicts).toHaveLength(1);
      expect(conflicts.conflicts[0].status).toBe("active");
    });

    it("rejects resolution call when userId is not provided (unauthorized)", () => {
      const res = callRpc("resolve_game_conflict", {
        conflict_id: "any_id",
        resolution: "keep_local",
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Unauthorized");
    });

    it("handles multiple games independently: resolving game A leaves game B sync_status as paused_conflict", () => {
      // Setup Game A (RimWorld) in paused_conflict
      callRpc("upsert_game_sync_config", { game_id: "rimworld", sync_status: "paused_conflict" }, challengerUser1);
      insertTable(
        "game_conflicts",
        {
          id: "conflict_rw",
          user_id: challengerUser1,
          game_id: "rimworld",
          category: "saves",
          status: "active",
          local_version: { timestamp: new Date().toISOString(), content_hash: "l1", file_size: 10, item_count: 1 },
          cloud_version: { snapshot_id: "c1", timestamp: new Date().toISOString(), content_hash: "c1", file_size: 10, item_count: 1 },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      // Setup Game B (Rain World) in paused_conflict
      callRpc("upsert_game_sync_config", { game_id: "rain_world", sync_status: "paused_conflict" }, challengerUser1);
      insertTable(
        "game_conflicts",
        {
          id: "conflict_rain",
          user_id: challengerUser1,
          game_id: "rain_world",
          category: "mod_lists",
          status: "active",
          local_version: { timestamp: new Date().toISOString(), content_hash: "l2", file_size: 20, item_count: 2 },
          cloud_version: { snapshot_id: "c2", timestamp: new Date().toISOString(), content_hash: "c2", file_size: 20, item_count: 2 },
          created_at: new Date().toISOString(),
        },
        challengerUser1,
      );

      // Resolve RimWorld
      const resolveRw = callRpc("resolve_game_conflict", { conflict_id: "conflict_rw", resolution: "keep_local" }, challengerUser1);
      expect(resolveRw.success).toBe(true);

      // Check RimWorld is idle
      const rwConfig = callRpc("get_game_sync_configs", { game_id: "rimworld" }, challengerUser1);
      expect(rwConfig.config.sync_status).toBe("idle");

      // Check Rain World remains paused_conflict!
      const rainConfig = callRpc("get_game_sync_configs", { game_id: "rain_world" }, challengerUser1);
      expect(rainConfig.config.sync_status).toBe("paused_conflict");

      // Check Rain World conflict is still active
      const rainConflicts = callRpc("get_game_conflicts", { game_id: "rain_world", status: "active" }, challengerUser1);
      expect(rainConflicts.conflicts).toHaveLength(1);
      expect(rainConflicts.conflicts[0].id).toBe("conflict_rain");
    });
  });
});
