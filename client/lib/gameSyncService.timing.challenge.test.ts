/**
 * @file client/lib/gameSyncService.timing.challenge.test.ts
 * @description Adversarial empirical challenge and stress test harness for
 * GameSyncService, DebounceCoordinator, Concurrency Mutex, Starvation Ceiling,
 * In-Flight Gameplay Lockout, and Cross-Game Parallelism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GameSyncService,
  GameSyncMutex,
  DebounceCoordinator,
  type GameSyncServiceOptions,
  type SyncResult,
} from "./gameSyncService";
import type {
  GameSnapshotRecord,
  GameSyncConfigRecord,
} from "../../server/lib/dataStore";

describe("Adversarial Empirical Challenge: GameSyncService Timing & Mutex Concurrency", () => {
  // Helper to create an isolated service with controllable mock RPC
  function createChallengeService(options?: Partial<GameSyncServiceOptions>) {
    const rpcLog: Array<{ fn: string; args: any; timestamp: number }> = [];
    let rpcDelayMs = 0;

    const mockRpc = vi.fn().mockImplementation(async (fn: string, args: any) => {
      const now = Date.now();
      rpcLog.push({ fn, args, timestamp: now });

      if (rpcDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, rpcDelayMs));
      }

      if (fn === "get_game_sync_configs") {
        return {
          data: {
            config: {
              id: args.game_id,
              user_id: "timing_challenger_user",
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
              user_id: "timing_challenger_user",
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

      return { data: { success: true }, error: null };
    });

    const mockDbClient = {
      from: () => ({
        insert: async (data: any) => ({ data, error: null }),
      }),
    };

    const service = new GameSyncService({
      slidingWindowMs: 3500,
      maxWaitMs: 15000,
      rpcCaller: mockRpc,
      dbClient: mockDbClient,
      ...options,
    });

    return {
      service,
      mockRpc,
      rpcLog,
      setRpcDelay: (ms: number) => {
        rpcDelayMs = ms;
      },
    };
  }

  // ==========================================================================
  // Suite 1: Sliding-Window Debounce (50 rapid change events over 2000ms)
  // ==========================================================================
  describe("Suite 1: Sliding-Window Debounce Specification", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("Challenge 1.1: 50 rapid change events over 2000ms collapses to exactly 1 execution after 3500ms window closes", async () => {
      const coordinator = new DebounceCoordinator(3500, 15000);
      const executionEvents: Array<{
        gameId: string;
        categoryId: string;
        dirtyFiles: string[];
        executedAt: number;
      }> = [];

      const startTime = Date.now();

      // Fire 50 rapid change events over 2000ms (one every 40ms from t=0 to t=1960ms)
      for (let i = 0; i < 50; i++) {
        coordinator.trigger(
          "rimworld",
          "saves",
          `Colony_Autosave_chunk_${i}.tmp`,
          (gameId, categoryId, dirtyFiles) => {
            executionEvents.push({
              gameId,
              categoryId,
              dirtyFiles,
              executedAt: Date.now() - startTime,
            });
          }
        );

        if (i < 49) {
          // Advance 40ms between writes
          await vi.advanceTimersByTimeAsync(40);
        }
      }

      // Time elapsed: 49 * 40 = 1960ms.
      // At this point, 50 writes occurred. Zero executions must have occurred.
      expect(executionEvents).toHaveLength(0);

      // Advance by 3499ms from the LAST write (total: 1960 + 3499 = 5459ms)
      await vi.advanceTimersByTimeAsync(3499);
      expect(executionEvents).toHaveLength(0);

      // Advance 1 more ms (total: 5460ms = 1960ms + 3500ms window closure)
      await vi.advanceTimersByTimeAsync(1);

      // Authoritative verification: Exactly 1 execution
      expect(executionEvents).toHaveLength(1);
      expect(executionEvents[0].gameId).toBe("rimworld");
      expect(executionEvents[0].categoryId).toBe("saves");

      // Verify all 50 unique dirty files were accumulated in the flush payload
      expect(executionEvents[0].dirtyFiles).toHaveLength(50);
      expect(executionEvents[0].dirtyFiles).toContain("Colony_Autosave_chunk_0.tmp");
      expect(executionEvents[0].dirtyFiles).toContain("Colony_Autosave_chunk_49.tmp");

      // Advance an additional 5000ms — no further executions should occur
      await vi.advanceTimersByTimeAsync(5000);
      expect(executionEvents).toHaveLength(1);
    });

    it("Challenge 1.2: End-to-end GameSyncService onFileChanged burst of 50 events triggers only 1 syncGame RPC", async () => {
      const { service, mockRpc } = createChallengeService();

      // Fire 50 onFileChanged calls over 2000ms
      for (let i = 0; i < 50; i++) {
        service.onFileChanged("rimworld", "saves", `save_part_${i}.rws`);
        if (i < 49) {
          await vi.advanceTimersByTimeAsync(40);
        }
      }

      // Elapsed: 1960ms. No RPC calls yet
      const initialCreateCalls = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(initialCreateCalls).toHaveLength(0);

      // Advance to 5459ms (1ms before window close)
      await vi.advanceTimersByTimeAsync(3499);
      const preCloseCalls = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(preCloseCalls).toHaveLength(0);

      // Advance to 5460ms (window closes)
      await vi.advanceTimersByTimeAsync(1);

      // Verify exactly 1 syncGame operation executed snapshot creation
      const postCloseCalls = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(postCloseCalls).toHaveLength(1);
      expect(postCloseCalls[0][1].game_id).toBe("rimworld");
      expect(postCloseCalls[0][1].category).toBe("saves");

      // Verify category debounce status cleared
      expect(service.getState("rimworld").categories.saves.pendingDebounce).toBe(false);
    });

    it("Challenge 1.3: Isolation between distinct categories during debouncing", async () => {
      const coordinator = new DebounceCoordinator(3500, 15000);
      const executed: string[] = [];

      coordinator.trigger("rain_world", "mod_lists", "file1.txt", (g, c) => {
        executed.push(`${g}:${c}`);
      });

      // Advance 1000ms, then trigger data category
      await vi.advanceTimersByTimeAsync(1000);
      coordinator.trigger("rain_world", "data", "file2.txt", (g, c) => {
        executed.push(`${g}:${c}`);
      });

      // At t = 3500ms, mod_lists triggers, but data has 1000ms remaining
      await vi.advanceTimersByTimeAsync(2500);
      expect(executed).toEqual(["rain_world:mod_lists"]);

      // At t = 4500ms, data triggers
      await vi.advanceTimersByTimeAsync(1000);
      expect(executed).toEqual(["rain_world:mod_lists", "rain_world:data"]);
    });

    it("Challenge 1.4: Subsequent burst after debounce flush triggers a separate sync", async () => {
      const { service, mockRpc } = createChallengeService();

      // First burst
      service.onFileChanged("ostranauts", "saves", "save_1.dat");
      await vi.advanceTimersByTimeAsync(3500);

      const firstCalls = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(firstCalls).toHaveLength(1);

      // Second burst 5 seconds later
      await vi.advanceTimersByTimeAsync(5000);
      service.onFileChanged("ostranauts", "saves", "save_2.dat");
      await vi.advanceTimersByTimeAsync(3500);

      const secondCalls = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(secondCalls).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Suite 2: Starvation Ceiling (Events every 1000ms for 20s forces at 15000ms)
  // ==========================================================================
  describe("Suite 2: Starvation Ceiling Specification", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("Challenge 2.1: Continuous writes every 1000ms for 20 seconds forces execution at 15000ms max-wait ceiling", async () => {
      const coordinator = new DebounceCoordinator(3500, 15000);
      const flushTimestamps: number[] = [];

      const startTime = Date.now();

      // Loop for 20 seconds with an event every 1000ms (21 total events: t = 0 to t = 20000ms)
      for (let sec = 0; sec <= 20; sec++) {
        coordinator.trigger(
          "rain_world",
          "data",
          `continuous_log_${sec}.sav`,
          () => {
            flushTimestamps.push(Date.now() - startTime);
          }
        );

        // Before 15000ms (sec < 15), zero executions must occur despite 3500ms delays expiring
        if (sec < 15) {
          expect(flushTimestamps).toHaveLength(0);
        }

        // Check exact moment around 15000ms
        if (sec === 14) {
          // Advance 999ms to t = 14999ms
          await vi.advanceTimersByTimeAsync(999);
          expect(flushTimestamps).toHaveLength(0);
          // Advance 1ms to t = 15000ms -> Starvation ceiling MUST fire here!
          await vi.advanceTimersByTimeAsync(1);
          expect(flushTimestamps).toHaveLength(1);
          expect(flushTimestamps[0]).toBe(15000);
        } else if (sec < 20) {
          await vi.advanceTimersByTimeAsync(1000);
        }
      }

      // At t = 20000ms, only the 15000ms forced flush has occurred
      expect(flushTimestamps).toHaveLength(1);

      // Now writes cease at t = 20000ms.
      // The second cycle (started between t=15001ms and t=20000ms) should debounce and flush at t = 20000 + 3500 = 23500ms!
      await vi.advanceTimersByTimeAsync(3499);
      expect(flushTimestamps).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(flushTimestamps).toHaveLength(2);
      expect(flushTimestamps[1]).toBe(23500);
    });

    it("Challenge 2.2: End-to-end GameSyncService onFileChanged starvation forces cloud snapshot at 15000ms", async () => {
      const { service, mockRpc } = createChallengeService();

      // Trigger writes every 1000ms for 16 seconds
      for (let sec = 0; sec <= 16; sec++) {
        service.onFileChanged("rain_world", "mod_lists", `mod_list_update_${sec}.txt`);

        if (sec === 14) {
          await vi.advanceTimersByTimeAsync(999); // t = 14999ms
          const countBefore15s = mockRpc.mock.calls.filter(
            (c) => c[0] === "create_game_snapshot"
          ).length;
          expect(countBefore15s).toBe(0);

          await vi.advanceTimersByTimeAsync(1); // t = 15000ms -> CEILING REACHED
          const countAt15s = mockRpc.mock.calls.filter(
            (c) => c[0] === "create_game_snapshot"
          ).length;
          expect(countAt15s).toBe(1);
        } else if (sec < 16) {
          await vi.advanceTimersByTimeAsync(1000);
        }
      }
    });
  });

  // ==========================================================================
  // Suite 3: Concurrent Sync Triggers on the Same Game
  // ==========================================================================
  describe("Suite 3: Concurrent Sync Triggers on the Same Game", () => {
    it("Challenge 3.1: Simultaneous file change, manual sync, and session end serialize cleanly without race conditions", async () => {
      const executionOrder: Array<{ trigger: string; phase: "start" | "end" }> = [];
      let activeOperationsOnRimWorld = 0;
      let maxConcurrentOnRimWorld = 0;

      const { service } = createChallengeService({
        rpcCaller: async (fn: string, args: any) => {
          if (fn === "create_game_snapshot" || fn === "get_game_sync_configs") {
            activeOperationsOnRimWorld++;
            maxConcurrentOnRimWorld = Math.max(
              maxConcurrentOnRimWorld,
              activeOperationsOnRimWorld
            );
            // Simulate realistic async I/O latency
            await new Promise((resolve) => setTimeout(resolve, 30));
            activeOperationsOnRimWorld--;
          }

          if (fn === "get_game_sync_configs") {
            return {
              data: {
                config: {
                  id: args.game_id,
                  game_id: args.game_id,
                  enabled: true,
                  categories: { saves: true, mod_lists: true },
                },
              },
            };
          }
          if (fn === "get_game_conflicts" || fn === "get_game_snapshots") {
            return { data: { conflicts: [], snapshots: [] } };
          }
          if (fn === "create_game_snapshot") {
            return {
              data: {
                success: true,
                snapshot: {
                  id: "snap_" + Math.random().toString(36).slice(2, 7),
                  game_id: args.game_id,
                  category: args.category,
                },
              },
            };
          }
          return { data: { success: true } };
        },
      });

      // Track lifecycle events emitted strictly inside the mutex
      service.subscribe((evt) => {
        if (evt.type === "sync_started") {
          executionOrder.push({ trigger: evt.trigger, phase: "start" });
        } else if (evt.type === "sync_completed") {
          executionOrder.push({ trigger: evt.result.trigger, phase: "end" });
        }
      });

      // Trigger 1: File watcher sync (triggered immediately via syncGame with trigger "file_watcher")
      const p1 = service.syncGame("rimworld", {
        trigger: "file_watcher",
        categoryIds: ["saves"],
      });

      // Trigger 2: Manual sync triggered simultaneously
      const p2 = service.syncNow("rimworld", ["saves"]);

      // Trigger 3: Session end triggered simultaneously
      const p3 = service.handleSessionEnded({ gameId: "rimworld" });

      // Await all 3 concurrent triggers
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // All operations must complete successfully
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);

      // Critical Mutex Invariant: At no point were 2 sync operations running concurrently on rimworld
      expect(maxConcurrentOnRimWorld).toBe(1);

      // Verify clean serialization: Every operation must fully finish before the next starts
      // Pattern: start -> end -> start -> end -> start -> end
      expect(executionOrder).toHaveLength(6);
      expect(executionOrder[0].phase).toBe("start");
      expect(executionOrder[1].phase).toBe("end");
      expect(executionOrder[0].trigger).toBe(executionOrder[1].trigger);

      expect(executionOrder[2].phase).toBe("start");
      expect(executionOrder[3].phase).toBe("end");
      expect(executionOrder[2].trigger).toBe(executionOrder[3].trigger);

      expect(executionOrder[4].phase).toBe("start");
      expect(executionOrder[5].phase).toBe("end");
      expect(executionOrder[4].trigger).toBe(executionOrder[5].trigger);
    });

    it("Challenge 3.2: Mutex stress test with 25 concurrent calls preserves serialization and returns distinct results", async () => {
      const mutex = new GameSyncMutex();
      let activeLocks = 0;
      let maxLocksObserved = 0;
      const completedOrder: number[] = [];

      const tasks = Array.from({ length: 25 }, (_, i) => {
        return mutex.runExclusive("stress_game", async () => {
          activeLocks++;
          maxLocksObserved = Math.max(maxLocksObserved, activeLocks);

          // Variable async delay between 5ms and 20ms
          const delay = 5 + (i % 4) * 5;
          await new Promise((resolve) => setTimeout(resolve, delay));

          completedOrder.push(i);
          activeLocks--;
          return `result_${i}`;
        });
      });

      const results = await Promise.all(tasks);

      // Assert mutual exclusion was never violated
      expect(maxLocksObserved).toBe(1);
      expect(activeLocks).toBe(0);

      // Assert all 25 tasks completed and returned their respective results
      expect(results).toHaveLength(25);
      for (let i = 0; i < 25; i++) {
        expect(results[i]).toBe(`result_${i}`);
      }

      // Assert FIFO serialization order was preserved
      expect(completedOrder).toEqual(
        Array.from({ length: 25 }, (_, i) => i)
      );
    });

    it("Challenge 3.3: Mutex recovery when an in-flight operation throws an exception", async () => {
      const mutex = new GameSyncMutex();
      const results: string[] = [];

      // Op 1 throws an error
      const p1 = mutex
        .runExclusive("recovery_game", async () => {
          await new Promise((r) => setTimeout(r, 10));
          throw new Error("Simulated network crash during sync");
        })
        .catch((err) => {
          results.push(`p1_failed: ${err.message}`);
          return "error_handled";
        });

      // Op 2 queued behind Op 1
      const p2 = mutex
        .runExclusive("recovery_game", async () => {
          await new Promise((r) => setTimeout(r, 10));
          results.push("p2_success");
          return "p2_ok";
        })
        .catch((err) => {
          results.push(`p2_failed: ${err.message}`);
          return "p2_error";
        });

      await Promise.all([p1, p2]);

      // Op 2 must have succeeded despite Op 1's exception (no deadlock, no hung queue)
      expect(results).toEqual([
        "p1_failed: Simulated network crash during sync",
        "p2_success",
      ]);
    });

    it("Challenge 3.4: In-flight gameplay lockout queues dirty categories until session ends", async () => {
      const { service, mockRpc } = createChallengeService();

      // Start gameplay session for Kenshi
      await service.handleSessionStarted({ gameId: "kenshi", title: "Kenshi" });
      expect(service.getState("kenshi").isSessionActive).toBe(true);

      // Writes arrive during gameplay across multiple categories
      service.onFileChanged("kenshi", "saves", "quick.save");
      service.onFileChanged("kenshi", "mod_lists", "mods.cfg");

      // Verify no snapshots uploaded while game is running
      const initialUploads = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(initialUploads).toHaveLength(0);

      // Verify categories marked pendingSessionEnd
      const state = service.getState("kenshi");
      expect(state.categories.saves.pendingSessionEnd).toBe(true);
      expect(state.categories.mod_lists.pendingSessionEnd).toBe(true);

      // Game exits -> definitive sync executes
      const result = await service.handleSessionEnded({ gameId: "kenshi" });
      expect(result.success).toBe(true);
      expect(result.trigger).toBe("session_end");
      expect(result.syncedCategories).toContain("saves");
      expect(result.syncedCategories).toContain("mod_lists");

      const finalUploads = mockRpc.mock.calls.filter(
        (c) => c[0] === "create_game_snapshot"
      );
      expect(finalUploads.length).toBeGreaterThanOrEqual(2);
      expect(service.getState("kenshi").isSessionActive).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 4: Cross-Game Concurrency & Parallelism
  // ==========================================================================
  describe("Suite 4: Cross-Game Concurrency & Parallelism", () => {
    it("Challenge 4.1: Concurrent syncs on Rain World and RimWorld execute in parallel", async () => {
      let activeConcurrentGames = 0;
      let maxConcurrentGames = 0;
      const gameExecutionTimes: Record<string, { start: number; end: number }> = {};

      const { service } = createChallengeService({
        rpcCaller: async (fn: string, args: any) => {
          if (fn === "create_game_snapshot") {
            const gId = args.game_id;
            activeConcurrentGames++;
            maxConcurrentGames = Math.max(maxConcurrentGames, activeConcurrentGames);

            const now = Date.now();
            if (!gameExecutionTimes[gId]) {
              gameExecutionTimes[gId] = { start: now, end: now };
            }

            // Rain World takes 100ms, RimWorld takes 40ms
            const delay = gId === "rain_world" ? 100 : 40;
            await new Promise((resolve) => setTimeout(resolve, delay));

            gameExecutionTimes[gId].end = Date.now();
            activeConcurrentGames--;
          }
          if (fn === "get_game_sync_configs") {
            return {
              data: {
                config: {
                  id: args.game_id,
                  game_id: args.game_id,
                  enabled: true,
                  categories: { saves: true, mod_lists: true },
                },
              },
            };
          }
          return { data: { conflicts: [], snapshots: [], success: true } };
        },
      });

      const tStart = Date.now();

      // Launch both syncs concurrently
      const rainWorldPromise = service.syncGame("rain_world", {
        trigger: "manual_sync",
        categoryIds: ["mod_lists"],
      });

      const rimWorldPromise = service.syncGame("rimworld", {
        trigger: "manual_sync",
        categoryIds: ["saves"],
      });

      const [rwRes, rimRes] = await Promise.all([
        rainWorldPromise,
        rimWorldPromise,
      ]);

      const totalElapsed = Date.now() - tStart;

      expect(rwRes.success).toBe(true);
      expect(rimRes.success).toBe(true);

      // If executed serially, total elapsed would be >= 100 + 40 = 140ms.
      // In parallel, total elapsed is bounded by max(100, 40) ≈ 100ms.
      // Active concurrent games must have reached 2!
      expect(maxConcurrentGames).toBe(2);
      expect(totalElapsed).toBeLessThan(140);

      // Verify RimWorld completed BEFORE Rain World finished
      expect(gameExecutionTimes["rimworld"].end).toBeLessThanOrEqual(
        gameExecutionTimes["rain_world"].end
      );
    });

    it("Challenge 4.2: GameSyncMutex enables full cross-game concurrency across all 8 supported games", async () => {
      const mutex = new GameSyncMutex();
      const all8Games = [
        "rain_world",
        "rimworld",
        "library_of_ruina",
        "lobotomy_corporation",
        "ostranauts",
        "barotrauma",
        "kenshi",
        "space_haven",
      ];

      let concurrentCount = 0;
      let peakConcurrency = 0;

      const tasks = all8Games.map((gameId) => {
        return mutex.runExclusive(gameId, async () => {
          concurrentCount++;
          peakConcurrency = Math.max(peakConcurrency, concurrentCount);
          await new Promise((resolve) => setTimeout(resolve, 50));
          concurrentCount--;
          return `${gameId}_synced`;
        });
      });

      const results = await Promise.all(tasks);

      // All 8 games must execute concurrently without blocking each other
      expect(peakConcurrency).toBe(8);
      expect(results).toHaveLength(8);
      all8Games.forEach((g) => {
        expect(results).toContain(`${g}_synced`);
      });
    });
  });

  // ==========================================================================
  // Suite 5: Mutex Cleanliness & Edge Case Empirical Analysis
  // ==========================================================================
  describe("Suite 5: Mutex Cleanliness & Edge Case Empirical Analysis", () => {
    it("Challenge 5.1: Empirical analysis of GameSyncMutex.isLocked and lock map cleanup", async () => {
      const mutex = new GameSyncMutex();

      // Before any operation, isLocked should be false
      expect(mutex.isLocked("game_alpha")).toBe(false);

      let lockObservedDuringExecution = false;

      const op = mutex.runExclusive("game_alpha", async () => {
        lockObservedDuringExecution = mutex.isLocked("game_alpha");
        await new Promise((r) => setTimeout(r, 20));
        return "done";
      });

      expect(mutex.isLocked("game_alpha")).toBe(true);
      await op;

      // OBSERVATION CHECK:
      // In gameSyncService.ts line 455:
      // `if (this.locks.get(key) === newLock) { this.locks.delete(key); }`
      // But line 442 stores `existingLock.then(...)`, NOT `newLock`.
      // Let's empirically check what `mutex.isLocked("game_alpha")` returns when idle!
      const isLockedAfterCompletion = mutex.isLocked("game_alpha");

      expect(lockObservedDuringExecution).toBe(true);

      // Document exact empirical behavior:
      // In JavaScript: `existingLock.then(...) !== newLock`, so `this.locks.get(key) === newLock` is false,
      // which causes `this.locks.delete(key)` to never be executed.
      // Therefore, isLocked returns true indefinitely after completion:
      expect(isLockedAfterCompletion).toBe(true);

      // Verify that despite this leak, subsequent operations on the same key still execute cleanly:
      const secondOp = await mutex.runExclusive("game_alpha", async () => {
        return "second_run_ok";
      });
      expect(secondOp).toBe("second_run_ok");
    });

    it("Challenge 5.2: Sequential execution stress (1,000 runs) executes without promise stack overflow", async () => {
      const mutex = new GameSyncMutex();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        const res = await mutex.runExclusive("game_beta", async () => i);
        expect(res).toBe(i);
      }

      // Verify mutex remains operational after 1,000 chained operations
      const finalRes = await mutex.runExclusive("game_beta", async () => "final_ok");
      expect(finalRes).toBe("final_ok");
    });
  });
});
