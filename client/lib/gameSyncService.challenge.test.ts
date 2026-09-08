/**
 * @file client/lib/gameSyncService.challenge.test.ts
 * @description Empirical adversarial challenge and stress test harness for
 * GameSyncService conflict detection, 3-way resolution, deterministic zip packaging,
 * DLC exclusions, and account storage quota boundary enforcement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  GameSyncService,
  calculateSha256,
  createDeterministicModZip,
  isDlcOrExpansion,
  MAX_STORAGE_QUOTA_BYTES,
  type ModFileEntry,
  type VersionMeta,
  type GameSyncServiceOptions,
} from "./gameSyncService";
import {
  DATA_DIR,
  initUserFolder,
  callRpc,
  getTableRows,
  type GameSnapshotRecord,
  type GameConflictRecord,
  type GameSyncConfigRecord,
} from "../../server/lib/dataStore";

describe("GameSyncService Empirical Challenger Suite", () => {
  // Helper to create an isolated mock service
  function createMockService(customRpc?: any) {
    const rpcCalls: Array<{ fn: string; args: any }> = [];

    const defaultRpc = vi.fn().mockImplementation(async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });

      if (fn === "get_game_sync_configs") {
        return {
          data: {
            config: {
              id: args.game_id,
              user_id: "challenger_user_1",
              game_id: args.game_id,
              enabled: true,
              categories: {
                saves: true,
                mod_lists: true,
                custom_mods: true,
                data: true,
              },
              custom_paths: {},
              last_synced_at: "2026-09-01T12:00:00Z",
              sync_status: "idle",
              created_at: "2026-09-01T12:00:00Z",
              updated_at: "2026-09-01T12:00:00Z",
            } as GameSyncConfigRecord,
          },
          error: null,
        };
      }

      if (fn === "get_game_conflicts") {
        return { data: { conflicts: [] }, error: null };
      }

      if (fn === "get_game_snapshots") {
        return { data: { snapshots: [] }, error: null };
      }

      if (fn === "create_game_snapshot") {
        return {
          data: {
            success: true,
            snapshot: {
              id: "snap_" + Math.random().toString(36).slice(2, 8),
              user_id: "challenger_user_1",
              game_id: args.game_id,
              category: args.category,
              name: args.name,
              is_manual: Boolean(args.is_manual),
              expires_at: args.expires_at || null,
              content_hash: args.content_hash,
              file_size: args.file_size,
              item_count: args.item_count,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as GameSnapshotRecord,
          },
          error: null,
        };
      }

      if (fn === "resolve_game_conflict") {
        const resolution = args.resolution;
        return {
          data: {
            success: true,
            resolution,
            conflict: {
              id: args.conflict_id,
              user_id: "challenger_user_1",
              game_id: "rimworld",
              category: "saves",
              status: "resolved",
              resolution,
              resolved_at: new Date().toISOString(),
            } as GameConflictRecord,
            active_snapshot: {
              id: "snap_active_winner",
              is_manual: true,
              expires_at: null,
            },
            archived_snapshot:
              resolution === "keep_both"
                ? {
                    id: "snap_archived_backup",
                    is_archived: true,
                    archive_reason: "conflict_alternate_local",
                    is_manual: true,
                    expires_at: null,
                  }
                : null,
          },
          error: null,
        };
      }

      return { data: { success: true }, error: null };
    });

    const service = new GameSyncService({
      slidingWindowMs: 3500,
      maxWaitMs: 15000,
      rpcCaller: customRpc || defaultRpc,
      dbClient: {
        from: () => ({
          insert: async (data: any) => ({ data, error: null }),
        }),
      },
    });

    return { service, defaultRpc, rpcCalls };
  }

  // ==========================================================================
  // 1. Conflict Detection Invariant & Temporal Boundary Mining
  // ==========================================================================
  describe("1. Conflict Detection Invariant & Temporal Boundary Mining", () => {
    const syncAnchor = "2026-09-04T12:00:00.000Z";
    const syncAnchorMs = new Date(syncAnchor).getTime();

    const baseLocal: VersionMeta = {
      timestamp: "2026-09-05T12:00:00.000Z", // newer than anchor (+24h)
      contentHash: "hash_local_unique",
      fileSize: 4096,
      itemCount: 2,
    };

    const baseCloud: GameSnapshotRecord = {
      id: "snap_cloud_ref",
      user_id: "user1",
      game_id: "rimworld",
      category: "saves",
      name: "Cloud Snapshot",
      is_manual: true,
      expires_at: null,
      content_hash: "hash_cloud_unique",
      file_size: 4096,
      item_count: 2,
      created_at: "2026-09-05T14:00:00.000Z", // newer than anchor (+26h)
      updated_at: "2026-09-05T14:00:00.000Z",
    };

    it("1.1 Invariant: Divergent hashes trigger conflict ONLY when BOTH local and cloud > last_synced_at", () => {
      const { service } = createMockService();

      // True conflict: local is newer than sync AND cloud is newer than sync
      expect(service.detectConflict(baseLocal, baseCloud, syncAnchor)).toBe(true);
    });

    it("1.2 Fast-forward upload: Local newer, Cloud older or equal to last_synced_at -> NO conflict", () => {
      const { service } = createMockService();

      // Cloud exactly at sync anchor
      const cloudAtSync: GameSnapshotRecord = {
        ...baseCloud,
        created_at: syncAnchor,
        updated_at: syncAnchor,
      };
      expect(service.detectConflict(baseLocal, cloudAtSync, syncAnchor)).toBe(false);

      // Cloud prior to sync anchor
      const cloudBeforeSync: GameSnapshotRecord = {
        ...baseCloud,
        created_at: new Date(syncAnchorMs - 3600000).toISOString(),
        updated_at: new Date(syncAnchorMs - 3600000).toISOString(),
      };
      expect(service.detectConflict(baseLocal, cloudBeforeSync, syncAnchor)).toBe(false);
    });

    it("1.3 Fast-forward download: Cloud newer, Local older or equal to last_synced_at -> NO conflict", () => {
      const { service } = createMockService();

      // Local exactly at sync anchor
      const localAtSync: VersionMeta = {
        ...baseLocal,
        timestamp: syncAnchor,
      };
      expect(service.detectConflict(localAtSync, baseCloud, syncAnchor)).toBe(false);

      // Local prior to sync anchor
      const localBeforeSync: VersionMeta = {
        ...baseLocal,
        timestamp: new Date(syncAnchorMs - 3600000).toISOString(),
      };
      expect(service.detectConflict(localBeforeSync, baseCloud, syncAnchor)).toBe(false);
    });

    it("1.4 Stale / neither changed: Both local and cloud older or equal to last_synced_at -> NO conflict", () => {
      const { service } = createMockService();

      const olderLocal: VersionMeta = {
        ...baseLocal,
        timestamp: new Date(syncAnchorMs - 10000).toISOString(),
      };
      const olderCloud: GameSnapshotRecord = {
        ...baseCloud,
        created_at: new Date(syncAnchorMs - 5000).toISOString(),
      };
      expect(service.detectConflict(olderLocal, olderCloud, syncAnchor)).toBe(false);
    });

    it("1.5 Initial sync: Null last_synced_at with divergent hashes MUST trigger conflict", () => {
      const { service } = createMockService();
      expect(service.detectConflict(baseLocal, baseCloud, null)).toBe(true);
    });

    it("1.6 Corrupt timestamp string: Malformed last_synced_at safely triggers conflict", () => {
      const { service } = createMockService();
      expect(service.detectConflict(baseLocal, baseCloud, "NOT_A_DATE")).toBe(true);
      expect(service.detectConflict(baseLocal, baseCloud, "")).toBe(true);
    });

    it("1.7 Corrupt version dates: Malformed local or cloud timestamp safely triggers conflict", () => {
      const { service } = createMockService();

      const corruptLocal: VersionMeta = {
        ...baseLocal,
        timestamp: "invalid-local-timestamp",
      };
      expect(service.detectConflict(corruptLocal, baseCloud, syncAnchor)).toBe(true);

      const corruptCloud: GameSnapshotRecord = {
        ...baseCloud,
        created_at: "invalid-cloud-timestamp",
        updated_at: "invalid-cloud-timestamp",
      };
      expect(service.detectConflict(baseLocal, corruptCloud, syncAnchor)).toBe(true);
    });

    it("1.8 Identical hashes ALWAYS bypass conflict regardless of newer timestamps", () => {
      const { service } = createMockService();

      const identicalLocal: VersionMeta = {
        ...baseLocal,
        contentHash: baseCloud.content_hash, // Identical hash
      };

      // Both modified in the future, but hashes match -> No conflict
      expect(service.detectConflict(identicalLocal, baseCloud, syncAnchor)).toBe(false);

      // Initial sync with identical hash -> No conflict
      expect(service.detectConflict(identicalLocal, baseCloud, null)).toBe(false);
    });

    it("1.9 Sync execution transitions game and category status to paused_conflict", async () => {
      const { service } = createMockService(async (fn: string) => {
        if (fn === "get_game_sync_configs") {
          return {
            data: {
              config: {
                id: "kenshi",
                game_id: "kenshi",
                enabled: true,
                categories: { saves: true, mod_lists: true },
                last_synced_at: "2026-09-01T00:00:00Z",
              },
            },
            error: null,
          };
        }
        if (fn === "get_game_conflicts") return { data: { conflicts: [] }, error: null };
        if (fn === "get_game_snapshots") {
          return {
            data: {
              snapshots: [
                {
                  id: "snap_cloud_kenshi",
                  content_hash: "hash_cloud_kenshi_1",
                  created_at: "2026-09-05T00:00:00Z",
                },
              ],
            },
            error: null,
          };
        }
        return { data: { success: true }, error: null };
      });

      const syncRes = await service.syncGame("kenshi", {
        trigger: "manual_sync",
        categoryIds: ["saves"],
        localVersions: {
          saves: {
            timestamp: "2026-09-05T02:00:00Z",
            contentHash: "hash_local_kenshi_1",
            fileSize: 1024,
            itemCount: 1,
          },
        },
      });

      expect(syncRes.success).toBe(false);
      expect(syncRes.conflictsDetected).toHaveLength(1);
      expect(syncRes.conflictsDetected[0].category).toBe("saves");

      const kenshiState = service.getState("kenshi");
      expect(kenshiState.status).toBe("paused_conflict");
      expect(kenshiState.categories.saves.status).toBe("paused_conflict");
      expect(kenshiState.categories.saves.activeConflictId).toBeTruthy();
    });
  });

  // ==========================================================================
  // 2. Three-Way Conflict Resolution Modes & Zero Data Loss
  // ==========================================================================
  describe("2. Three-Way Conflict Resolution Modes & Zero Data Loss", () => {
    it("2.1 'keep_local' resolution: Promotes local version as active snapshot", async () => {
      const { service, defaultRpc } = createMockService();

      const result = await service.resolveConflict({
        conflictId: "conflict_001",
        resolution: "keep_local",
        archiveName: "My Local Override",
      });

      expect(result.success).toBe(true);
      expect(result.resolution).toBe("keep_local");
      expect(service.getState("rimworld").status).toBe("idle");

      const call = defaultRpc.mock.calls.find((c) => c[0] === "resolve_game_conflict");
      expect(call).toBeDefined();
      expect(call![1].conflict_id).toBe("conflict_001");
      expect(call![1].resolution).toBe("keep_local");
      expect(call![1].archive_name).toBe("My Local Override");
    });

    it("2.2 'keep_cloud' resolution: Retains cloud snapshot without archiving", async () => {
      const { service, defaultRpc } = createMockService();

      const result = await service.resolveConflict({
        conflictId: "conflict_002",
        resolution: "keep_cloud",
      });

      expect(result.success).toBe(true);
      expect(result.resolution).toBe("keep_cloud");
      expect(result.archived_snapshot).toBeNull();
      expect(service.getState("rimworld").status).toBe("idle");
    });

    it("2.3 'keep_both' resolution: Safely archives local version with is_archived: true and correct reason", async () => {
      const { service, defaultRpc } = createMockService();

      const result = await service.resolveConflict({
        conflictId: "conflict_003",
        resolution: "keep_both",
        archiveName: "Local Backup Colony",
      });

      expect(result.success).toBe(true);
      expect(result.resolution).toBe("keep_both");
      expect(result.archived_snapshot).toBeDefined();
      expect(result.archived_snapshot?.is_archived).toBe(true);
      expect(result.archived_snapshot?.archive_reason).toBe("conflict_alternate_local");
      expect(result.archived_snapshot?.is_manual).toBe(true);
      expect(result.archived_snapshot?.expires_at).toBeNull(); // Permanent: safe from 24h pruning
      expect(service.getState("rimworld").status).toBe("idle");

      const call = defaultRpc.mock.calls.find((c) => c[0] === "resolve_game_conflict");
      expect(call![1].resolution).toBe("keep_both");
    });

    it("2.4 Multi-category conflict isolation: Resolving one category keeps remaining categories in conflict", async () => {
      const { service, defaultRpc } = createMockService();

      // Seed game state with two active conflicts across distinct categories
      const state = service.getState("barotrauma");
      state.status = "paused_conflict";
      state.categories.submarines = {
        categoryId: "submarines",
        status: "paused_conflict",
        progress: { stage: "idle", percent: 0 },
        lastSyncedAt: null,
        lastError: null,
        activeConflictId: "conflict_submarines",
        pendingDebounce: false,
        pendingSessionEnd: false,
      };
      state.categories.saves = {
        categoryId: "saves",
        status: "paused_conflict",
        progress: { stage: "idle", percent: 0 },
        lastSyncedAt: null,
        lastError: null,
        activeConflictId: "conflict_saves",
        pendingDebounce: false,
        pendingSessionEnd: false,
      };

      defaultRpc.mockImplementation(async (fn: string, args: any) => {
        if (fn === "resolve_game_conflict") {
          const cat = args.conflict_id === "conflict_submarines" ? "submarines" : "saves";
          return {
            data: {
              success: true,
              resolution: args.resolution,
              conflict: {
                id: args.conflict_id,
                user_id: "user1",
                game_id: "barotrauma",
                category: cat,
                status: "resolved",
              },
            },
            error: null,
          };
        }
        return { data: { success: true }, error: null };
      });

      // Step 1: Resolve submarines conflict
      await service.resolveConflict({
        conflictId: "conflict_submarines",
        resolution: "keep_both",
      });

      // Submarines is now idle, but saves is STILL paused_conflict -> overall game must remain paused_conflict
      expect(service.getState("barotrauma").categories.submarines.status).toBe("idle");
      expect(service.getState("barotrauma").categories.saves.status).toBe("paused_conflict");
      expect(service.getState("barotrauma").status).toBe("paused_conflict");

      // Step 2: Resolve saves conflict
      await service.resolveConflict({
        conflictId: "conflict_saves",
        resolution: "keep_cloud",
      });

      // Both categories resolved -> overall game transitions to idle
      expect(service.getState("barotrauma").categories.saves.status).toBe("idle");
      expect(service.getState("barotrauma").status).toBe("idle");
    });

    it("2.5 Rejects invalid resolution strings immediately", async () => {
      const { service } = createMockService();

      await expect(
        service.resolveConflict({
          conflictId: "conflict_004",
          resolution: "keep_neither" as any,
        })
      ).rejects.toThrow(/Invalid resolution/);
    });
  });

  // ==========================================================================
  // 3. Real Server DataStore Integration (Physical Disk Persistence)
  // ==========================================================================
  describe("3. Real Server DataStore Integration (Physical Disk Persistence)", () => {
    const testUserId = "challenger_test_user_777";
    const userDir = path.join(DATA_DIR, testUserId);

    beforeEach(() => {
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true, force: true });
      }
      initUserFolder(testUserId, {
        username: "challenger777",
        email: "challenger777@example.com",
      });
    });

    afterEach(() => {
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true, force: true });
      }
    });

    it("3.1 End-to-end: keep_both writes an archived snapshot to physical snapshots.json without overwriting active", async () => {
      // 1. Create active cloud snapshot on server via real callRpc
      const snapRes = callRpc(
        "create_game_snapshot",
        {
          game_id: "rimworld",
          category: "saves",
          name: "Active Cloud Colony",
          is_manual: true,
          content_hash: "cloud_sha256_original",
          file_size: 10240,
          item_count: 3,
        },
        testUserId
      );
      expect(snapRes.success).toBe(true);
      const cloudSnapshotId = snapRes.snapshot.id;

      // 2. Create conflict record on server
      const conflictId = "conflict_real_disk_test";
      const conflictRecord: GameConflictRecord = {
        id: conflictId,
        user_id: testUserId,
        game_id: "rimworld",
        category: "saves",
        status: "active",
        local_version: {
          timestamp: "2026-09-07T12:00:00Z",
          content_hash: "local_sha256_divergent",
          file_size: 20480,
          item_count: 5,
          summary: { colony_name: "Local Divergent Colony" },
        },
        cloud_version: {
          snapshot_id: cloudSnapshotId,
          timestamp: "2026-09-07T11:00:00Z",
          content_hash: "cloud_sha256_original",
          file_size: 10240,
          item_count: 3,
        },
        created_at: new Date().toISOString(),
      };

      // Insert directly into table
      const conflictsPath = path.join(userDir, "games", "conflicts.json");
      fs.writeFileSync(conflictsPath, JSON.stringify([conflictRecord], null, 2), "utf8");

      // 3. Setup GameSyncService wired to call real callRpc
      const realRpcCaller = async (fn: string, args: any) => {
        const out = callRpc(fn, args, testUserId);
        if (!out || out.success === false) {
          return { data: out, error: { message: out?.error || "RPC failed" } };
        }
        return { data: out, error: null };
      };

      const realService = new GameSyncService({
        rpcCaller: realRpcCaller,
      });

      // 4. Resolve conflict with keep_both
      const resolveResult = await realService.resolveConflict({
        conflictId,
        resolution: "keep_both",
        archiveName: "Preserved Local Branch",
      });

      expect(resolveResult.success).toBe(true);
      expect(resolveResult.resolution).toBe("keep_both");
      expect(resolveResult.archived_snapshot?.is_archived).toBe(true);
      expect(resolveResult.archived_snapshot?.archive_reason).toBe(
        "conflict_alternate_local"
      );

      // 5. Read physical snapshots.json directly from disk to verify persistence
      const snapshotsPath = path.join(userDir, "games", "snapshots.json");
      expect(fs.existsSync(snapshotsPath)).toBe(true);
      const physicalSnapshots: GameSnapshotRecord[] = JSON.parse(
        fs.readFileSync(snapshotsPath, "utf8")
      );

      // Must have exactly 2 snapshots: active original cloud snapshot and archived local snapshot
      expect(physicalSnapshots).toHaveLength(2);

      const archivedOnDisk = physicalSnapshots.find((s) => s.is_archived === true);
      expect(archivedOnDisk).toBeDefined();
      expect(archivedOnDisk?.name).toBe("Preserved Local Branch");
      expect(archivedOnDisk?.archive_reason).toBe("conflict_alternate_local");
      expect(archivedOnDisk?.content_hash).toBe("local_sha256_divergent");
      expect(archivedOnDisk?.file_size).toBe(20480);
      expect(archivedOnDisk?.item_count).toBe(5);
      expect(archivedOnDisk?.is_manual).toBe(true);
      expect(archivedOnDisk?.expires_at).toBeNull(); // Permanent preservation

      const activeOnDisk = physicalSnapshots.find((s) => s.id === cloudSnapshotId);
      expect(activeOnDisk).toBeDefined();
      expect(activeOnDisk?.content_hash).toBe("cloud_sha256_original");
    });
  });

  // ==========================================================================
  // 4. Mod Packaging: Deterministic Hashing & Permutations
  // ==========================================================================
  describe("4. Mod Packaging: Deterministic Hashing & Permutations", () => {
    const fileA: ModFileEntry = {
      relativePath: "About/About.xml",
      data: new TextEncoder().encode("<ModMetaData><name>Alpha</name></ModMetaData>"),
      size: 47,
    };
    const fileB: ModFileEntry = {
      relativePath: "Defs/ThingDefs.xml",
      data: new TextEncoder().encode("<Defs><ThingDef Name='Gun'/></Defs>"),
      size: 35,
    };
    const fileC: ModFileEntry = {
      relativePath: "Textures/Items/Gun.png",
      data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]),
      size: 10,
    };

    it("4.1 Determinism: All 6 permutations of 3 files generate bit-for-bit identical archives & dual SHA-256", async () => {
      const p1 = [fileA, fileB, fileC];
      const p2 = [fileA, fileC, fileB];
      const p3 = [fileB, fileA, fileC];
      const p4 = [fileB, fileC, fileA];
      const p5 = [fileC, fileA, fileB];
      const p6 = [fileC, fileB, fileA];

      const bundles = await Promise.all([
        createDeterministicModZip(p1),
        createDeterministicModZip(p2),
        createDeterministicModZip(p3),
        createDeterministicModZip(p4),
        createDeterministicModZip(p5),
        createDeterministicModZip(p6),
      ]);

      const expectedArchiveHash = bundles[0].archiveHash;
      const expectedManifestHash = bundles[0].manifestHash;
      const expectedByteLength = bundles[0].zipBytes.length;

      for (let i = 1; i < bundles.length; i++) {
        expect(bundles[i].archiveHash).toBe(expectedArchiveHash);
        expect(bundles[i].manifestHash).toBe(expectedManifestHash);
        expect(bundles[i].zipBytes.length).toBe(expectedByteLength);
        expect(bundles[i].zipBytes).toEqual(bundles[0].zipBytes);
      }
    });

    it("4.2 Path separator normalization: Windows backslashes match POSIX forward slashes exactly", async () => {
      const windowsFiles: ModFileEntry[] = [
        {
          relativePath: "About\\About.xml",
          data: fileA.data,
          size: fileA.size,
        },
        {
          relativePath: "Defs\\Sub\\ThingDefs.xml",
          data: fileB.data,
          size: fileB.size,
        },
      ];

      const posixFiles: ModFileEntry[] = [
        {
          relativePath: "About/About.xml",
          data: fileA.data,
          size: fileA.size,
        },
        {
          relativePath: "Defs/Sub/ThingDefs.xml",
          data: fileB.data,
          size: fileB.size,
        },
      ];

      const leadingSlashFiles: ModFileEntry[] = [
        {
          relativePath: "/About/About.xml",
          data: fileA.data,
          size: fileA.size,
        },
        {
          relativePath: "/Defs/Sub/ThingDefs.xml",
          data: fileB.data,
          size: fileB.size,
        },
      ];

      const winBundle = await createDeterministicModZip(windowsFiles);
      const posixBundle = await createDeterministicModZip(posixFiles);
      const leadingBundle = await createDeterministicModZip(leadingSlashFiles);

      expect(winBundle.archiveHash).toBe(posixBundle.archiveHash);
      expect(posixBundle.archiveHash).toBe(leadingBundle.archiveHash);
      expect(winBundle.manifestHash).toBe(posixBundle.manifestHash);
      expect(winBundle.zipBytes).toEqual(posixBundle.zipBytes);
    });

    it("4.3 Empty directory packaging creates valid zip without error", async () => {
      const emptyBundle = await createDeterministicModZip([]);
      expect(emptyBundle.zipBytes).toBeInstanceOf(Uint8Array);
      expect(emptyBundle.zipBytes.length).toBeGreaterThan(0); // Valid empty zip header (22 bytes)
      expect(emptyBundle.archiveHash).toHaveLength(64);
      expect(emptyBundle.manifestHash).toHaveLength(64);
    });
  });

  // ==========================================================================
  // 5. DLC & Official Expansion Exclusions
  // ==========================================================================
  describe("5. DLC & Official Expansion Exclusions", () => {
    it("5.1 Rain World DLC exclusions: moreslugcats and expedition (case & whitespace insensitive)", () => {
      const dlcCases = [
        "moreslugcats",
        "MoreSlugcats",
        "MORESLUGCATS",
        "  moreslugcats  ",
        "expedition",
        "Expedition",
        "EXPEDITION",
      ];
      for (const name of dlcCases) {
        expect(isDlcOrExpansion("rain_world", name)).toBe(true);
      }

      // Valid custom mods must NOT be excluded
      expect(isDlcOrExpansion("rain_world", "CustomSlugcat")).toBe(false);
      expect(isDlcOrExpansion("rain_world", "moreslugcats_plus")).toBe(false);
      expect(isDlcOrExpansion("rain_world", "expedition_revamped")).toBe(false);
    });

    it("5.2 RimWorld DLC exclusions: Core, Royalty, Ideology, Biotech, Anomaly", () => {
      const dlcCases = [
        "Core",
        "core",
        "CORE",
        "Royalty",
        "royalty",
        "Ideology",
        "ideology",
        "Biotech",
        "biotech",
        "BIOTECH",
        "  Biotech  ",
        "Anomaly",
        "anomaly",
      ];
      for (const name of dlcCases) {
        expect(isDlcOrExpansion("rimworld", name)).toBe(true);
      }

      // Custom mods must NOT be excluded
      expect(isDlcOrExpansion("rimworld", "CombatExtended")).toBe(false);
      expect(isDlcOrExpansion("rimworld", "CoreSK")).toBe(false);
      expect(isDlcOrExpansion("rimworld", "BiotechExpanded")).toBe(false);
      expect(isDlcOrExpansion("rimworld", "IdeologyTweaks")).toBe(false);
    });

    it("5.3 Barotrauma DLC exclusions: Vanilla", () => {
      expect(isDlcOrExpansion("barotrauma", "Vanilla")).toBe(true);
      expect(isDlcOrExpansion("barotrauma", "vanilla")).toBe(true);
      expect(isDlcOrExpansion("barotrauma", "  VANILLA  ")).toBe(true);

      // Custom mods must NOT be excluded
      expect(isDlcOrExpansion("barotrauma", "Neurotrauma")).toBe(false);
      expect(isDlcOrExpansion("barotrauma", "VanillaUpgrades")).toBe(false);
    });

    it("5.4 Non-custom-mod games do not produce false exclusions", () => {
      expect(isDlcOrExpansion("kenshi", "Vanilla")).toBe(false);
      expect(isDlcOrExpansion("space_haven", "Core")).toBe(false);
      expect(isDlcOrExpansion("library_of_ruina", "Core")).toBe(false);
    });

    it("5.5 packageModDirectory throws explicit exception on DLC directories", async () => {
      const { service } = createMockService();

      await expect(
        service.packageModDirectory("rimworld", "Biotech", [
          { relativePath: "About/About.xml", data: new Uint8Array([1]), size: 1 },
        ])
      ).rejects.toThrow(/official DLC or core expansion/);

      await expect(
        service.packageModDirectory("rain_world", "moreslugcats", [
          { relativePath: "modinfo.json", data: new Uint8Array([1]), size: 1 },
        ])
      ).rejects.toThrow(/official DLC or core expansion/);

      await expect(
        service.packageModDirectory("barotrauma", "Vanilla", [
          { relativePath: "filelist.xml", data: new Uint8Array([1]), size: 1 },
        ])
      ).rejects.toThrow(/official DLC or core expansion/);
    });

    it("5.6 packageCustomMod returns structured failure object on DLC directories", async () => {
      const { service } = createMockService();

      const result = await service.packageCustomMod("rimworld", "Core", []);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/official DLC or core expansion/);
    });
  });

  // ==========================================================================
  // 6. Account Storage Quota (500 MB Boundary Enforcement)
  // ==========================================================================
  describe("6. Account Storage Quota (500 MB Boundary Enforcement)", () => {
    it("6.1 Exactly 500 MB uncompressed (524,288,000 bytes) passes the quota boundary", async () => {
      const { service } = createMockService();

      // Report exactly 500 MB in file entry
      const exactQuotaFile: ModFileEntry = {
        relativePath: "modinfo.json",
        data: new TextEncoder().encode(JSON.stringify({ id: "quota_exact", version: "1.0" })),
        size: MAX_STORAGE_QUOTA_BYTES, // Exactly 500 MB
      };

      const bundle = await service.packageModDirectory("rain_world", "ValidQuotaMod", [
        exactQuotaFile,
      ]);
      expect(bundle).toBeDefined();
      expect(bundle.uncompressedSizeBytes).toBe(MAX_STORAGE_QUOTA_BYTES);
    });

    it("6.2 500 MB + 1 byte (524,288,001 bytes) uncompressed is rejected immediately", async () => {
      const { service } = createMockService();

      const overflowFile: ModFileEntry = {
        relativePath: "modinfo.json",
        data: new TextEncoder().encode(JSON.stringify({ id: "overflow", version: "1.0" })),
        size: MAX_STORAGE_QUOTA_BYTES + 1, // 500 MB + 1 byte
      };

      await expect(
        service.packageModDirectory("rain_world", "OverflowMod", [overflowFile])
      ).rejects.toThrow(/File size exceeds maximum quota limit \(500 MB\)/);
    });

    it("6.3 Cumulative multi-file overflow across multiple entries is rejected", async () => {
      const { service } = createMockService();

      const file1: ModFileEntry = {
        relativePath: "part1.dat",
        data: new Uint8Array([1, 2, 3]),
        size: 300 * 1024 * 1024, // 300 MB
      };
      const file2: ModFileEntry = {
        relativePath: "part2.dat",
        data: new Uint8Array([4, 5, 6]),
        size: 201 * 1024 * 1024, // 201 MB (Total = 501 MB)
      };

      await expect(
        service.packageModDirectory("rimworld", "SplitBigMod", [file1, file2])
      ).rejects.toThrow(/File size exceeds maximum quota limit \(500 MB\)/);
    });

    it("6.4 packageCustomMod handles quota rejection returning structured error without crashing", async () => {
      const { service } = createMockService();

      const oversizedFile: ModFileEntry = {
        relativePath: "big.bin",
        data: new Uint8Array([1]),
        size: MAX_STORAGE_QUOTA_BYTES + 1048576,
      };

      const result = await service.packageCustomMod("barotrauma", "MegaSub", [
        oversizedFile,
      ]);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/File size exceeds maximum quota limit \(500 MB\)/);
    });
  });
});
