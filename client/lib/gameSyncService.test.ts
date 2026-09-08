/**
 * @file client/lib/gameSyncService.test.ts
 * @description Comprehensive unit and integration test suite for GameSyncService,
 * Debounce Coordinator, Process Lifecycle Hooks, Custom Mod Packaging,
 * Retention Rules, and Interactive Conflict Subsystem.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  GameSyncService,
  GameSyncMutex,
  DebounceCoordinator,
  calculateSha256,
  createDeterministicModZip,
  parseRainWorldModInfo,
  parseRimWorldAboutXml,
  parseBarotraumaFileList,
  isDlcOrExpansion,
  createAutoSyncedModListSnapshot,
  createManualGameSnapshot,
  promoteGameSnapshot,
  MAX_STORAGE_QUOTA_BYTES,
  type ModFileEntry,
  type VersionMeta,
  type GameSyncServiceOptions,
} from "./gameSyncService";
import type {
  GameSnapshotRecord,
  GameConflictRecord,
  GameSyncConfigRecord,
} from "../../server/lib/dataStore";

describe("GameSyncService Subsystem", () => {
  // Helper to create an isolated service instance with a programmable mock RPC
  function createTestService(options?: Partial<GameSyncServiceOptions>) {
    const rpcCalls: Array<{ fn: string; args: any }> = [];
    const mockDbTableInserts: Array<{ table: string; data: any }> = [];

    const mockRpc = vi.fn().mockImplementation(async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });

      if (fn === "get_game_sync_configs") {
        return {
          data: {
            config: {
              id: args.game_id,
              user_id: "test_user_1",
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
        return {
          data: {
            conflicts: [],
          },
          error: null,
        };
      }

      if (fn === "get_game_snapshots") {
        return {
          data: {
            snapshots: [],
          },
          error: null,
        };
      }

      if (fn === "create_game_snapshot") {
        return {
          data: {
            success: true,
            snapshot: {
              id: "snap_" + Math.random().toString(36).slice(2, 8),
              user_id: "test_user_1",
              game_id: args.game_id,
              category: args.category,
              name: args.name,
              is_manual: Boolean(args.is_manual),
              expires_at: args.expires_at || null,
              storage_path: args.storage_path,
              content_hash: args.content_hash,
              file_size: args.file_size,
              item_count: args.item_count,
              summary: args.summary || {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as GameSnapshotRecord,
          },
          error: null,
        };
      }

      if (fn === "promote_game_snapshot") {
        return {
          data: {
            success: true,
            snapshot: {
              id: args.snapshot_id,
              user_id: "test_user_1",
              game_id: "rain_world",
              category: "mod_lists",
              name: args.name || "Promoted Permanent",
              is_manual: true,
              expires_at: null,
              content_hash: "hash_promoted",
              file_size: 2048,
              item_count: 5,
              created_at: "2026-09-01T12:00:00Z",
              updated_at: new Date().toISOString(),
            } as GameSnapshotRecord,
          },
          error: null,
        };
      }

      if (fn === "resolve_game_conflict") {
        return {
          data: {
            success: true,
            resolution: args.resolution,
            conflict: {
              id: args.conflict_id,
              user_id: "test_user_1",
              game_id: "rimworld",
              category: "saves",
              status: "resolved",
              resolution: args.resolution,
              resolved_at: new Date().toISOString(),
            } as GameConflictRecord,
            active_snapshot: {
              id: "snap_active_resolved",
              is_manual: true,
              expires_at: null,
            },
            archived_snapshot:
              args.resolution === "keep_both"
                ? {
                    id: "snap_archived_backup",
                    is_archived: true,
                    archive_reason: "conflict_alternate_local",
                  }
                : null,
          },
          error: null,
        };
      }

      return { data: { success: true }, error: null };
    });

    const mockDbClient = {
      from: (table: string) => ({
        insert: async (data: any) => {
          mockDbTableInserts.push({ table, data });
          return { data, error: null };
        },
      }),
    };

    const service = new GameSyncService({
      slidingWindowMs: 3500,
      maxWaitMs: 15000,
      rpcCaller: mockRpc,
      dbClient: mockDbClient,
      ...options,
    });

    return { service, mockRpc, rpcCalls, mockDbTableInserts };
  }

  // ==========================================================================
  // Suite 1: Multi-Trigger Debounce Specification
  // ==========================================================================
  describe("Suite 1: Multi-Trigger Debounce Specification", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("Test 1.1: Single file write fires sync after exactly slidingWindowMs (3500ms)", async () => {
      const { service, mockRpc } = createTestService();
      service.onFileChanged("rimworld", "saves", "C:/RimWorld/Saves/Colony1.rws");

      // Before 3500ms, zero sync calls made
      await vi.advanceTimersByTimeAsync(3499);
      expect(mockRpc).not.toHaveBeenCalled();

      // At exactly 3500ms, debounce flushes and triggers sync
      await vi.advanceTimersByTimeAsync(1);
      expect(mockRpc).toHaveBeenCalled();
    });

    it("Test 1.2: Rapid write bursts reset the sliding window (debounce collapse)", async () => {
      const { service, mockRpc } = createTestService();

      // Simulate 5 rapid writes spaced 500ms apart
      service.onFileChanged("rimworld", "saves", "file1.tmp");
      await vi.advanceTimersByTimeAsync(500);
      service.onFileChanged("rimworld", "saves", "file2.tmp");
      await vi.advanceTimersByTimeAsync(500);
      service.onFileChanged("rimworld", "saves", "file3.tmp");
      await vi.advanceTimersByTimeAsync(500);
      service.onFileChanged("rimworld", "saves", "file4.tmp");
      await vi.advanceTimersByTimeAsync(500);
      service.onFileChanged("rimworld", "saves", "Colony1.rws");

      // Total time elapsed: 2000ms. Still within sliding window
      expect(mockRpc).not.toHaveBeenCalled();

      // Advance by 3499ms from the LAST write (total 5499ms)
      await vi.advanceTimersByTimeAsync(3499);
      expect(mockRpc).not.toHaveBeenCalled();

      // At 3500ms after last write, exactly one sync triggers
      await vi.advanceTimersByTimeAsync(1);
      expect(mockRpc).toHaveBeenCalled();
    });

    it("Test 1.3: Category and game debounce isolation", async () => {
      const coordinator = new DebounceCoordinator(3500, 15000);
      const executed: string[] = [];

      coordinator.trigger("rain_world", "mod_lists", "enabledMods.txt", (g, c) => {
        executed.push(`${g}:${c}`);
      });

      // At t = 1000ms, trigger a different category
      await vi.advanceTimersByTimeAsync(1000);
      coordinator.trigger("rain_world", "data", "sav.txt", (g, c) => {
        executed.push(`${g}:${c}`);
      });

      // At t = 3500ms, mod_lists triggers, but data has not reached 3500ms
      await vi.advanceTimersByTimeAsync(2500);
      expect(executed).toEqual(["rain_world:mod_lists"]);

      // At t = 4500ms, data reaches 3500ms and triggers
      await vi.advanceTimersByTimeAsync(1000);
      expect(executed).toEqual(["rain_world:mod_lists", "rain_world:data"]);
    });

    it("Test 1.4: Max-wait starvation ceiling (forces flush at 15000ms)", async () => {
      const coordinator = new DebounceCoordinator(3500, 15000);
      const executed: string[] = [];

      // Continuous writes every 2000ms (which would otherwise delay indefinitely)
      coordinator.trigger("rimworld", "saves", "chunk1.dat", (g, c) => {
        executed.push(`${g}:${c}`);
      });

      for (let t = 2000; t < 14000; t += 2000) {
        await vi.advanceTimersByTimeAsync(2000);
        coordinator.trigger("rimworld", "saves", `chunk_${t}.dat`, (g, c) => {
          executed.push(`${g}:${c}`);
        });
        expect(executed).toHaveLength(0);
      }

      // Advance past 15000ms ceiling: starvation ceiling triggers forced flush
      await vi.advanceTimersByTimeAsync(3000);
      expect(executed).toContain("rimworld:saves");
    });

    it("Test 1.5: In-flight gameplay lockout suppresses uploads until session ends", async () => {
      const { service, mockRpc } = createTestService();

      // Start gameplay session
      await service.handleSessionStarted({ gameId: "rimworld", title: "RimWorld" });
      expect(service.getState("rimworld").isSessionActive).toBe(true);

      // Writes occur during active game session
      service.onFileChanged("rimworld", "saves", "autosave.rws");
      await vi.advanceTimersByTimeAsync(10000);

      // Verify category is marked pendingSessionEnd and NO cloud snapshot RPC was sent
      const state = service.getState("rimworld");
      expect(state.categories.saves.pendingSessionEnd).toBe(true);
      const snapshotCalls = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(snapshotCalls).toHaveLength(0);

      // Terminate game session -> triggers definitive sync committing saves
      await service.handleSessionEnded({ gameId: "rimworld" });
      const finalSnapshotCalls = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(finalSnapshotCalls.length).toBeGreaterThan(0);
      expect(service.getState("rimworld").isSessionActive).toBe(false);
    });

    it("Test 1.6: Cancellation and flush methods on debounce coordinator", () => {
      const coordinator = new DebounceCoordinator(3500, 15000);
      const executed: string[] = [];

      coordinator.trigger("barotrauma", "submarines", "sub1.sub", (g, c) => {
        executed.push(`${g}:${c}`);
      });
      expect(coordinator.isPending("barotrauma", "submarines")).toBe(true);
      expect(coordinator.getPendingFiles("barotrauma", "submarines")).toEqual([
        "sub1.sub",
      ]);

      // Flush immediately
      coordinator.flush("barotrauma:submarines");
      expect(executed).toEqual(["barotrauma:submarines"]);
      expect(coordinator.isPending("barotrauma", "submarines")).toBe(false);

      // Test cancelForGame
      coordinator.trigger("barotrauma", "submarines", "sub2.sub", () => {});
      coordinator.cancelForGame("barotrauma");
      expect(coordinator.isPending("barotrauma")).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 2: Process Lifecycle Hook Specification
  // ==========================================================================
  describe("Suite 2: Process Lifecycle Hook Specification", () => {
    it("Test 2.1: handleSessionStarted detects newer cloud snapshot and alerts download_needed", async () => {
      const { service, mockRpc } = createTestService();

      // Seed state with an older local sync timestamp
      const localState = service.getState("kenshi");
      localState.lastSyncedAt = "2026-09-01T10:00:00Z";

      // Mock cloud snapshot newer than local timestamp
      mockRpc.mockImplementation(async (fn: string) => {
        if (fn === "get_game_conflicts") return { data: { conflicts: [] } };
        if (fn === "get_game_snapshots") {
          return {
            data: {
              snapshots: [
                {
                  id: "cloud_snap_kenshi_newer",
                  created_at: "2026-09-05T12:00:00Z",
                  name: "Newer Cloud Save",
                },
              ],
            },
          };
        }
        return { data: { success: true } };
      });

      const result = await service.handleSessionStarted({ gameId: "kenshi" });
      expect(result.canLaunch).toBe(true);
      expect(result.action).toBe("download_needed");
      expect(result.snapshot?.id).toBe("cloud_snap_kenshi_newer");
    });

    it("Test 2.2: handleSessionStarted halts and flags active conflict", async () => {
      const { service, mockRpc } = createTestService();

      // Mock an existing active conflict on the server
      const existingConflict: GameConflictRecord = {
        id: "conf_baro_1",
        user_id: "user1",
        game_id: "barotrauma",
        category: "submarines",
        status: "active",
        local_version: {
          timestamp: "2026-09-06T12:00:00Z",
          content_hash: "hash_local",
          file_size: 500,
          item_count: 1,
        },
        cloud_version: {
          snapshot_id: "s1",
          timestamp: "2026-09-06T12:00:00Z",
          content_hash: "hash_cloud",
          file_size: 500,
          item_count: 1,
        },
        created_at: "2026-09-06T12:00:00Z",
      };

      mockRpc.mockImplementation(async (fn: string) => {
        if (fn === "get_game_conflicts") {
          return { data: { conflicts: [existingConflict] } };
        }
        return { data: { success: true } };
      });

      const result = await service.handleSessionStarted({ gameId: "barotrauma" });
      expect(result.canLaunch).toBe(false);
      expect(result.action).toBe("conflict_detected");
      expect(result.conflict?.id).toBe("conf_baro_1");
      expect(service.getState("barotrauma").status).toBe("paused_conflict");
    });

    it("Test 2.3: handleSessionEnded definitive sync commits changes", async () => {
      const { service, mockRpc } = createTestService();

      await service.handleSessionStarted({ gameId: "space_haven" });
      const syncResult = await service.handleSessionEnded({ gameId: "space_haven" });

      expect(syncResult.success).toBe(true);
      expect(syncResult.trigger).toBe("session_end");
      expect(syncResult.syncedCategories).toContain("saves");

      const created = mockRpc.mock.calls.find((c) => c[0] === "create_game_snapshot");
      expect(created).toBeDefined();
      expect(created![1].game_id).toBe("space_haven");
    });

    it("Test 2.4: Mutex concurrency lockout serializes overlapping operations on same game", async () => {
      const mutex = new GameSyncMutex();
      const executionOrder: string[] = [];

      const p1 = mutex.runExclusive("rain_world", async () => {
        executionOrder.push("p1_start");
        await new Promise((r) => setTimeout(r, 50));
        executionOrder.push("p1_end");
        return "r1";
      });

      const p2 = mutex.runExclusive("rain_world", async () => {
        executionOrder.push("p2_start");
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push("p2_end");
        return "r2";
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe("r1");
      expect(r2).toBe("r2");
      expect(executionOrder).toEqual(["p1_start", "p1_end", "p2_start", "p2_end"]);
    });

    it("Test 2.5: Mutex concurrency parallelism allows independent games to run concurrently", async () => {
      const mutex = new GameSyncMutex();
      const executionOrder: string[] = [];

      const p1 = mutex.runExclusive("rain_world", async () => {
        executionOrder.push("rain_world_start");
        await new Promise((r) => setTimeout(r, 40));
        executionOrder.push("rain_world_end");
      });

      const p2 = mutex.runExclusive("rimworld", async () => {
        executionOrder.push("rimworld_start");
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push("rimworld_end");
      });

      await Promise.all([p1, p2]);
      // rimworld completes before rain_world because they run concurrently
      expect(executionOrder).toEqual([
        "rain_world_start",
        "rimworld_start",
        "rimworld_end",
        "rain_world_end",
      ]);
    });
  });

  // ==========================================================================
  // Suite 3: Manual Sync & Retention Specification
  // ==========================================================================
  describe("Suite 3: Manual Sync & Retention Specification", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("Test 3.1: syncNow bypasses debounce timers and executes immediately", async () => {
      const { service, mockRpc } = createTestService();

      service.onFileChanged("rimworld", "mod_lists", "ModsConfig.xml");
      expect(mockRpc).not.toHaveBeenCalled();

      // Trigger syncNow immediately
      const syncPromise = service.syncNow("rimworld", "mod_lists");
      await vi.advanceTimersByTimeAsync(1);
      const res = await syncPromise;

      expect(res.success).toBe(true);
      expect(res.trigger).toBe("manual_sync");
      expect(mockRpc).toHaveBeenCalled();
    });

    it("Test 3.2: Auto-synced mod list sets 24-hour expiration window", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          snapshot: { id: "snap_auto_1", expires_at: "2026-09-08T12:00:00Z" },
        },
      });

      const snap = await createAutoSyncedModListSnapshot(
        "rain_world",
        "hash_mod_list_123",
        512,
        4,
        { mods: ["slugcat_mod_1"] },
        undefined,
        mockRpc
      );

      expect(snap).toBeDefined();
      expect(mockRpc).toHaveBeenCalledTimes(1);
      const payload = mockRpc.mock.calls[0][1];
      expect(payload.game_id).toBe("rain_world");
      expect(payload.category).toBe("mod_lists");
      expect(payload.is_manual).toBe(false);
      expect(payload.expires_at).toBeTruthy();

      // Verify expiration timestamp is approximately 24 hours in the future
      const expiresAtMs = new Date(payload.expires_at).getTime();
      const diffHours = (expiresAtMs - Date.now()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 1);
    });

    it("Test 3.3: Manual named snapshot sets permanent retention (expires_at: null, is_manual: true)", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          snapshot: { id: "snap_manual_1", is_manual: true, expires_at: null },
        },
      });

      const snap = await createManualGameSnapshot(
        "rimworld",
        "saves",
        "Before Mechanoid Attack",
        "hash_colony_save",
        1048576,
        1,
        { colony: "Alpha Base" },
        undefined,
        mockRpc
      );

      expect(snap).toBeDefined();
      const payload = mockRpc.mock.calls[0][1];
      expect(payload.is_manual).toBe(true);
      expect(payload.expires_at).toBeNull();
      expect(payload.name).toBe("Before Mechanoid Attack");
    });

    it("Test 3.4: Snapshot promotion converts auto-synced snapshot to permanent", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          snapshot: {
            id: "snap_auto_1",
            name: "Promoted Permanent Setup",
            is_manual: true,
            expires_at: null,
          },
        },
      });

      const promoted = await promoteGameSnapshot(
        "snap_auto_1",
        "Promoted Permanent Setup",
        mockRpc
      );
      expect(promoted.is_manual).toBe(true);
      expect(promoted.expires_at).toBeNull();
      expect(promoted.name).toBe("Promoted Permanent Setup");
      expect(mockRpc.mock.calls[0][1].snapshot_id).toBe("snap_auto_1");
    });

    it("Test 3.5: Master toggle disabled skips sync unless explicit manual trigger", async () => {
      const { service } = createTestService({
        rpcCaller: async (fn: string) => {
          if (fn === "get_game_sync_configs") {
            return {
              data: {
                config: {
                  id: "rain_world",
                  game_id: "rain_world",
                  enabled: false, // Master switch OFF
                  categories: { data: true },
                },
              },
              error: null,
            };
          }
          return { data: { success: true }, error: null };
        },
      });

      // Background file_watcher trigger is skipped
      const watcherResult = await service.syncGame("rain_world", {
        trigger: "file_watcher",
      });
      expect(watcherResult.syncedCategories).toHaveLength(0);
      expect(watcherResult.skippedCategories.length).toBeGreaterThan(0);

      // Manual sync trigger proceeds
      const manualResult = await service.syncGame("rain_world", {
        trigger: "manual_sync",
      });
      expect(manualResult.syncedCategories.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Suite 4: Custom Mod Packaging & Checksum Specification
  // ==========================================================================
  describe("Suite 4: Custom Mod Packaging & Checksum Specification", () => {
    it("Test 4.1: Custom mod packaging with DLC exclusion", async () => {
      expect(isDlcOrExpansion("rain_world", "moreslugcats")).toBe(true);
      expect(isDlcOrExpansion("rain_world", "expedition")).toBe(true);
      expect(isDlcOrExpansion("rain_world", "CustomSlugcatMod")).toBe(false);

      expect(isDlcOrExpansion("rimworld", "Core")).toBe(true);
      expect(isDlcOrExpansion("rimworld", "Royalty")).toBe(true);
      expect(isDlcOrExpansion("rimworld", "Ideology")).toBe(true);
      expect(isDlcOrExpansion("rimworld", "Biotech")).toBe(true);
      expect(isDlcOrExpansion("rimworld", "Anomaly")).toBe(true);
      expect(isDlcOrExpansion("rimworld", "CombatExtended")).toBe(false);

      expect(isDlcOrExpansion("barotrauma", "Vanilla")).toBe(true);
      expect(isDlcOrExpansion("barotrauma", "Neurotrauma")).toBe(false);

      // Attempting to package Core DLC should throw error
      const { service } = createTestService();
      await expect(
        service.packageModDirectory("rimworld", "Core", [
          { relativePath: "About/About.xml", data: new Uint8Array([1]), size: 1 },
        ])
      ).rejects.toThrow(/official DLC or core expansion/);
    });

    it("Test 4.2: Deterministic SHA-256 calculation (sorting invariance)", async () => {
      const fileA: ModFileEntry = {
        relativePath: "textures/icon.png",
        data: new Uint8Array([10, 20, 30, 40]),
        size: 4,
      };
      const fileB: ModFileEntry = {
        relativePath: "modinfo.json",
        data: new TextEncoder().encode(JSON.stringify({ id: "modA", version: "1.0.0" })),
        size: 34,
      };
      const fileC: ModFileEntry = {
        relativePath: "plugins/main.dll",
        data: new Uint8Array([50, 60, 70, 80]),
        size: 4,
      };

      // Traverse in order A, B, C
      const bundle1 = await createDeterministicModZip([fileA, fileB, fileC]);
      // Traverse in reverse order C, B, A
      const bundle2 = await createDeterministicModZip([fileC, fileB, fileA]);
      // Traverse in mixed order B, A, C
      const bundle3 = await createDeterministicModZip([fileB, fileA, fileC]);

      // All three must produce identical archive hashes, manifest hashes, and zip bytes
      expect(bundle1.archiveHash).toBe(bundle2.archiveHash);
      expect(bundle2.archiveHash).toBe(bundle3.archiveHash);
      expect(bundle1.manifestHash).toBe(bundle2.manifestHash);
      expect(bundle1.zipBytes).toEqual(bundle2.zipBytes);
      expect(bundle2.zipBytes).toEqual(bundle3.zipBytes);
    });

    it("Test 4.3: Mod manifest metadata extraction for Rain World, RimWorld, and Barotrauma", () => {
      // Rain World
      const rwJson = JSON.stringify({
        id: "com.slugcat.stealth",
        name: "Stealth Slugcat",
        version: "2.1.0",
        author: "Hunter",
        target_game_version: "v1.9.15",
        requirements: ["MoreSlugcats"],
      });
      const rwMeta = parseRainWorldModInfo(rwJson, "StealthSlugcatFolder");
      expect(rwMeta.id).toBe("com.slugcat.stealth");
      expect(rwMeta.name).toBe("Stealth Slugcat");
      expect(rwMeta.version).toBe("2.1.0");
      expect(rwMeta.author).toBe("Hunter");
      expect(rwMeta.requirements).toEqual(["MoreSlugcats"]);

      // RimWorld
      const rwXml = `
        <ModMetaData>
          <packageId>Author.CombatExtended</packageId>
          <name>Combat Extended</name>
          <author>CE Team</author>
          <description>Complete overhaul of RimWorld combat.</description>
          <supportedVersions>
            <li>1.4</li>
            <li>1.5</li>
          </supportedVersions>
        </ModMetaData>
      `;
      const rimMeta = parseRimWorldAboutXml(rwXml, "CombatExtended");
      expect(rimMeta.id).toBe("Author.CombatExtended");
      expect(rimMeta.name).toBe("Combat Extended");
      expect(rimMeta.author).toBe("CE Team");
      expect(rimMeta.version).toBe("1.5");
      expect(rimMeta.supportedVersions).toEqual(["1.4", "1.5"]);

      // Barotrauma
      const baroXml = `<contentpackage name="Enhanced Reactor" modversion="1.4.2" gameversion="1.0.8" corepackage="false"/>`;
      const baroMeta = parseBarotraumaFileList(baroXml, "EnhancedReactor");
      expect(baroMeta.name).toBe("Enhanced Reactor");
      expect(baroMeta.version).toBe("1.4.2");
      expect(baroMeta.targetGameVersion).toBe("1.0.8");
      expect(baroMeta.isCore).toBe(false);
    });

    it("Test 4.4: 500 MB account quota boundary check", async () => {
      const { service } = createTestService();

      // Create dummy entry reporting > 500 MB
      const oversizedFile: ModFileEntry = {
        relativePath: "huge.bin",
        data: new Uint8Array([1, 2, 3]),
        size: MAX_STORAGE_QUOTA_BYTES + 1024,
      };

      await expect(
        service.packageModDirectory("rain_world", "MegaMod", [oversizedFile])
      ).rejects.toThrow(/File size exceeds maximum quota limit \(500 MB\)/);
    });
  });

  // ==========================================================================
  // Suite 5: Conflict Detection & Resolution Specification
  // ==========================================================================
  describe("Suite 5: Conflict Detection & Resolution Specification", () => {
    const localVersion: VersionMeta = {
      timestamp: "2026-09-05T14:00:00Z",
      contentHash: "hash_local_v2",
      fileSize: 4096,
      itemCount: 2,
    };

    const cloudSnapshot: GameSnapshotRecord = {
      id: "snap_cloud_v2",
      user_id: "user1",
      game_id: "rimworld",
      category: "saves",
      name: "Cloud Colony",
      is_manual: true,
      expires_at: null,
      content_hash: "hash_cloud_v2",
      file_size: 4096,
      item_count: 2,
      created_at: "2026-09-05T13:00:00Z",
      updated_at: "2026-09-05T13:00:00Z",
    };

    it("Test 5.1: Divergence detection trigger (differing hashes and both modified after sync)", () => {
      const { service } = createTestService();
      // Last synced at 2026-09-01. Local at 2026-09-05, Cloud at 2026-09-05. Divergence!
      const isConflict = service.detectConflict(
        localVersion,
        cloudSnapshot,
        "2026-09-01T12:00:00Z"
      );
      expect(isConflict).toBe(true);
    });

    it("Test 5.2: Matching content hashes bypass conflict", () => {
      const { service } = createTestService();
      const identicalLocal: VersionMeta = {
        ...localVersion,
        contentHash: "hash_cloud_v2", // Same hash as cloud
      };

      const isConflict = service.detectConflict(
        identicalLocal,
        cloudSnapshot,
        "2026-09-01T12:00:00Z"
      );
      expect(isConflict).toBe(false);
    });

    it("Test 5.3: Clean fast-forwards bypass conflict", () => {
      const { service } = createTestService();
      const syncAnchor = "2026-09-04T12:00:00Z";

      // Case A: Cloud unchanged since sync (created 2026-09-03), only local modified (2026-09-05)
      const olderCloud: GameSnapshotRecord = {
        ...cloudSnapshot,
        created_at: "2026-09-03T12:00:00Z",
      };
      expect(service.detectConflict(localVersion, olderCloud, syncAnchor)).toBe(false);

      // Case B: Local unchanged since sync (2026-09-03), only cloud modified (2026-09-05)
      const olderLocal: VersionMeta = {
        ...localVersion,
        timestamp: "2026-09-03T12:00:00Z",
      };
      const newerCloud: GameSnapshotRecord = {
        ...cloudSnapshot,
        created_at: "2026-09-05T12:00:00Z",
      };
      expect(service.detectConflict(olderLocal, newerCloud, syncAnchor)).toBe(false);
    });

    it("Test 5.4: State transitions to paused_conflict when conflict is detected during sync", async () => {
      const { service } = createTestService({
        rpcCaller: async (fn: string, args: any) => {
          if (fn === "get_game_sync_configs") {
            return {
              data: {
                config: {
                  id: "ostranauts",
                  game_id: "ostranauts",
                  enabled: true,
                  categories: { saves: true },
                  last_synced_at: "2026-09-01T12:00:00Z",
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
                    id: "cloud_snap_ostranauts",
                    content_hash: "cloud_hash_abc",
                    created_at: "2026-09-05T12:00:00Z",
                  },
                ],
              },
              error: null,
            };
          }
          return { data: { success: true }, error: null };
        },
      });

      // Execute sync with diverging local state
      const syncResult = await service.syncGame("ostranauts", {
        trigger: "manual_sync",
        localVersions: {
          saves: {
            timestamp: "2026-09-05T15:00:00Z",
            contentHash: "local_hash_xyz",
            fileSize: 2048,
            itemCount: 1,
          },
        },
      });

      expect(syncResult.conflictsDetected.length).toBe(1);
      expect(service.getState("ostranauts").status).toBe("paused_conflict");
      expect(service.getState("ostranauts").categories.saves.status).toBe(
        "paused_conflict"
      );
    });

    it("Test 5.5: Resolution with keep_local promotes local version to active manual snapshot", async () => {
      const { service, mockRpc } = createTestService();

      const res = await service.resolveConflict({
        conflictId: "conflict_rimworld_saves_1",
        resolution: "keep_local",
        archiveName: "Local Colony Main",
      });

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_local");
      expect(service.getState("rimworld").status).toBe("idle");

      const resolveCall = mockRpc.mock.calls.find(
        (c) => c[0] === "resolve_game_conflict"
      );
      expect(resolveCall).toBeDefined();
      expect(resolveCall![1].resolution).toBe("keep_local");
      expect(resolveCall![1].archive_name).toBe("Local Colony Main");
    });

    it("Test 5.6: Resolution with keep_cloud retains cloud version", async () => {
      const { service, mockRpc } = createTestService();

      const res = await service.resolveConflict({
        conflictId: "conflict_rimworld_saves_2",
        resolution: "keep_cloud",
      });

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_cloud");
      expect(service.getState("rimworld").status).toBe("idle");
    });

    it("Test 5.7: Resolution with keep_both archives local version safely", async () => {
      const { service, mockRpc } = createTestService();

      const res = await service.resolveConflict({
        conflictId: "conflict_rimworld_saves_3",
        resolution: "keep_both",
        archiveName: "Archived Local Save Before Cloud Pull",
      });

      expect(res.success).toBe(true);
      expect(res.resolution).toBe("keep_both");
      expect(res.archived_snapshot?.is_archived).toBe(true);
      expect(res.archived_snapshot?.archive_reason).toBe("conflict_alternate_local");
      expect(service.getState("rimworld").status).toBe("idle");
    });

    it("Test 5.8: Double-resolution protection and error handling", async () => {
      const { service } = createTestService({
        rpcCaller: async (fn: string) => {
          if (fn === "resolve_game_conflict") {
            return {
              data: { success: false, error: "Conflict is already resolved" },
              error: null,
            };
          }
          return { data: { success: true }, error: null };
        },
      });

      await expect(
        service.resolveConflict({
          conflictId: "conf_already_resolved",
          resolution: "keep_local",
        })
      ).rejects.toThrow(/Conflict is already resolved/);
    });

    it("Test 5.9: Invalid resolution mode rejection", async () => {
      const { service } = createTestService();

      await expect(
        service.resolveConflict({
          conflictId: "conf_invalid",
          resolution: "invalid_resolution_mode" as any,
        })
      ).rejects.toThrow(/Invalid resolution/);
    });
  });
});
