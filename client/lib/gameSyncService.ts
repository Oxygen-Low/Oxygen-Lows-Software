/**
 * @file client/lib/gameSyncService.ts
 * @description Core Cloud Synchronization Engine, Multi-Trigger Debouncing,
 * Process Lifecycle Hooks, Custom Mod Packaging, and Interactive Conflict Subsystem
 * for Oxygen Low's Software Game Library.
 */

import { zipSync } from "fflate";
import {
  type SupportedGameId,
  type GameDataCategory,
  type SupportedGameDefinition,
  type ResolvedPathInfo,
  getSupportedGame,
  resolveCategoryPath,
  resolveEffectiveCategoryPaths,
  createDefaultGameSyncConfig,
  normalizeGameId,
} from "./supportedGames";

import {
  type GameSyncConfigRecord,
  type GameSnapshotRecord,
  type GameConflictRecord,
  type GameConflictVersion,
} from "../../server/lib/dataStore";

import { db } from "./db";
import {
  isDesktopBridgeAvailable,
  setupGameBridgeListeners,
  addPushEventListener,
} from "./desktopBridge";

// ============================================================================
// Types and Interfaces
// ============================================================================

export type SyncTrigger =
  | "file_watcher"
  | "session_start"
  | "session_end"
  | "manual_sync";

export type SyncStatus = "idle" | "syncing" | "paused_conflict" | "error";

export interface SyncProgressInfo {
  stage:
    | "idle"
    | "scanning"
    | "hashing"
    | "packaging"
    | "uploading"
    | "downloading"
    | "complete";
  percent: number;
  message?: string;
  bytesTransferred?: number;
  totalBytes?: number;
}

export interface CategorySyncState {
  categoryId: string;
  status: SyncStatus;
  progress: SyncProgressInfo;
  lastSyncedAt: string | null;
  lastError: string | null;
  activeConflictId: string | null;
  pendingDebounce: boolean;
  pendingSessionEnd: boolean;
}

export interface GameSyncState {
  gameId: string;
  status: SyncStatus;
  categories: Record<string, CategorySyncState>;
  isSessionActive: boolean;
  activeSessionStartedAt?: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SyncResult {
  success: boolean;
  gameId: string;
  trigger: SyncTrigger;
  syncedCategories: string[];
  skippedCategories: string[];
  conflictsDetected: GameConflictRecord[];
  snapshotsCreated: GameSnapshotRecord[];
  error?: string;
}

export interface PreFlightCheckResult {
  canLaunch: boolean;
  action: "ready" | "download_needed" | "conflict_detected" | "error";
  conflict?: GameConflictRecord;
  snapshot?: GameSnapshotRecord;
  message?: string;
}

export interface VersionMeta {
  timestamp: string;
  contentHash: string;
  fileSize: number;
  itemCount: number;
  summary?: any;
  storageTempPath?: string;
}

export interface ManualSnapshotOptions {
  gameId: string;
  category: GameDataCategory | string;
  name: string;
  summary?: Record<string, any>;
  storagePath?: string;
  contentHash?: string;
  fileSize?: number;
  itemCount?: number;
}

export interface ConflictResolutionOptions {
  conflictId: string;
  resolution: "keep_local" | "keep_cloud" | "keep_both";
  archiveName?: string;
}

export interface ResolveConflictResult {
  success: boolean;
  resolution: string;
  conflict: GameConflictRecord;
  active_snapshot?: GameSnapshotRecord | null;
  archived_snapshot?: GameSnapshotRecord | null;
  error?: string;
}

export type GameSyncEvent =
  | { type: "state_changed"; gameId: string; state: GameSyncState }
  | { type: "sync_started"; gameId: string; trigger: SyncTrigger; categories: string[] }
  | { type: "sync_progress"; gameId: string; categoryId: string; progress: SyncProgressInfo }
  | { type: "sync_completed"; gameId: string; result: SyncResult }
  | { type: "sync_error"; gameId: string; categoryId?: string; error: string }
  | { type: "conflict_detected"; gameId: string; conflict: GameConflictRecord }
  | { type: "conflict_resolved"; gameId: string; conflictId: string; resolution: string };

export type GameSyncEventListener = (event: GameSyncEvent) => void;

export interface ExtractedModMetadata {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  targetGameVersion?: string;
  supportedVersions?: string[];
  requirements?: string[];
  isCore?: boolean;
}

export interface ModFileEntry {
  relativePath: string;
  data: Uint8Array;
  size: number;
  hash?: string;
}

export interface PackagedCustomModBundle {
  gameId: string;
  modId: string;
  modName: string;
  folderName: string;
  archiveBuffer: Uint8Array;
  archiveSizeBytes: number;
  archiveSha256: string;
  manifestSha256: string;
  fileCount: number;
  uncompressedSizeBytes: number;
  metadata: ExtractedModMetadata;
}

export interface CustomModPackageResult {
  success: boolean;
  gameId: string;
  modId: string;
  modName: string;
  archiveBuffer?: Uint8Array;
  archiveSizeBytes?: number;
  archiveSha256?: string;
  manifestSha256?: string;
  fileCount?: number;
  uncompressedSizeBytes?: number;
  metadata?: ExtractedModMetadata;
  error?: string;
}

export type RpcCaller = (
  fn: string,
  args?: any
) => Promise<{ data: any; error?: any }>;

export interface GameSyncServiceOptions {
  slidingWindowMs?: number;
  maxWaitMs?: number;
  rpcCaller?: RpcCaller;
  dbClient?: any;
  bridge?: {
    isAvailable?: () => boolean;
    setupGameBridgeListeners?: typeof setupGameBridgeListeners;
    addPushEventListener?: typeof addPushEventListener;
  };
}

// 500 MB account storage boundary ceiling
export const MAX_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;

// Fixed epoch date for byte-for-byte deterministic zip creation (2026-01-01 00:00:00 UTC)
export const DETERMINISTIC_ZIP_EPOCH = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

// ============================================================================
// Hashing & Checksum Helpers
// ============================================================================

/**
 * Calculates deterministic SHA-256 hash using Web Crypto with fallback to Node.js crypto.
 */
export async function calculateSha256(data: Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes as any);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Node.js fallback
  try {
    const nodeCrypto = await import("node:crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    throw new Error("No cryptographic digest provider available for SHA-256 calculation");
  }
}

// ============================================================================
// Mod Metadata Parsers & DLC Filter
// ============================================================================

/**
 * Checks whether a folder name corresponds to an official expansion or DLC that
 * must be excluded from custom mod packaging.
 */
export function isDlcOrExpansion(
  gameId: SupportedGameId | string,
  folderName: string
): boolean {
  const normGame = normalizeGameId(gameId);
  const lowerFolder = folderName.trim().toLowerCase();

  switch (normGame) {
    case "rain_world":
      return ["moreslugcats", "expedition"].includes(lowerFolder);
    case "rimworld":
      return ["core", "royalty", "ideology", "biotech", "anomaly"].includes(
        lowerFolder
      );
    case "barotrauma":
      return ["vanilla"].includes(lowerFolder);
    default:
      return false;
  }
}

/**
 * Parses Rain World modinfo.json metadata.
 */
export function parseRainWorldModInfo(
  jsonText: string,
  folderName: string
): ExtractedModMetadata {
  try {
    const parsed = JSON.parse(jsonText);
    return {
      id: String(parsed.id || folderName).trim(),
      name: String(parsed.name || folderName).trim(),
      version: String(parsed.version || "1.0.0").trim(),
      author: parsed.author ? String(parsed.author).trim() : undefined,
      description: parsed.description ? String(parsed.description).trim() : undefined,
      targetGameVersion: parsed.target_game_version
        ? String(parsed.target_game_version).trim()
        : undefined,
      requirements: Array.isArray(parsed.requirements)
        ? parsed.requirements.map(String)
        : [],
    };
  } catch {
    return {
      id: folderName,
      name: folderName,
      version: "1.0.0",
    };
  }
}

/**
 * Parses RimWorld About/About.xml metadata.
 */
export function parseRimWorldAboutXml(
  xmlText: string,
  folderName: string
): ExtractedModMetadata {
  const getTag = (tag: string): string | undefined => {
    const match = xmlText.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "is"));
    return match ? match[1].trim() : undefined;
  };

  const getListItems = (parentTag: string): string[] => {
    const parentMatch = xmlText.match(
      new RegExp(`<${parentTag}>(.*?)</${parentTag}>`, "is")
    );
    if (!parentMatch) return [];
    const items: string[] = [];
    const itemRegex = /<li>(.*?)<\/li>/gis;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(parentMatch[1])) !== null) {
      if (m[1].trim()) items.push(m[1].trim());
    }
    return items;
  };

  const packageId = getTag("packageId") || folderName;
  const name = getTag("name") || folderName;
  const author = getTag("author") || getTag("authors") || undefined;
  const description = getTag("description") || undefined;
  const supportedVersions = getListItems("supportedVersions");
  const version =
    supportedVersions.length > 0
      ? supportedVersions[supportedVersions.length - 1]
      : "1.5";

  return {
    id: packageId,
    name,
    version,
    author,
    description,
    supportedVersions,
  };
}

/**
 * Parses Barotrauma filelist.xml metadata.
 */
export function parseBarotraumaFileList(
  xmlText: string,
  folderName: string
): ExtractedModMetadata {
  const nameMatch = xmlText.match(/name\s*=\s*["']([^"']+)["']/i);
  const versionMatch = xmlText.match(/modversion\s*=\s*["']([^"']+)["']/i);
  const gameVersionMatch = xmlText.match(/gameversion\s*=\s*["']([^"']+)["']/i);
  const coreMatch = xmlText.match(/corepackage\s*=\s*["']([^"']+)["']/i);

  const name = nameMatch ? nameMatch[1].trim() : folderName;
  const version = versionMatch ? versionMatch[1].trim() : "1.0.0";
  const targetGameVersion = gameVersionMatch ? gameVersionMatch[1].trim() : undefined;
  const isCore = coreMatch ? coreMatch[1].toLowerCase() === "true" : false;

  return {
    id: folderName,
    name,
    version,
    targetGameVersion,
    isCore,
  };
}

/**
 * Constructs a byte-for-byte deterministic ZIP archive and dual SHA-256 checksums
 * from an array of mod file entries.
 */
export async function createDeterministicModZip(
  files: ModFileEntry[]
): Promise<{
  zipBytes: Uint8Array;
  archiveHash: string;
  manifestHash: string;
}> {
  // Normalize paths and sort alphabetically by normalized relative path
  const normalizedFiles = files.map((f) => ({
    ...f,
    normPath: f.relativePath.replace(/\\/g, "/").replace(/^\/+/, ""),
  }));

  normalizedFiles.sort((a, b) => a.normPath.localeCompare(b.normPath));

  const fflateEntries: Record<string, [Uint8Array, { mtime: Date; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {};
  const manifestLines: string[] = [];

  for (const file of normalizedFiles) {
    fflateEntries[file.normPath] = [
      file.data,
      {
        mtime: DETERMINISTIC_ZIP_EPOCH,
        level: 6,
      },
    ];

    const fileHash = file.hash || (await calculateSha256(file.data));
    manifestLines.push(`${file.normPath}:${file.size}:${fileHash}`);
  }

  // Generate deterministic zip bytes
  const zipBytes = zipSync(fflateEntries);

  // Compute dual SHA-256 checksums
  const archiveHash = await calculateSha256(zipBytes);
  const manifestData = new TextEncoder().encode(manifestLines.join("\n"));
  const manifestHash = await calculateSha256(manifestData);

  return { zipBytes, archiveHash, manifestHash };
}

// ============================================================================
// Concurrency Mutex
// ============================================================================

/**
 * Per-game asynchronous mutual exclusion lock.
 * Serializes operations on the same gameId while allowing independent games to run concurrently.
 */
export class GameSyncMutex {
  private locks = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existingLock = this.locks.get(key) || Promise.resolve();
    let resolveNext!: () => void;
    const newLock = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });

    this.locks.set(
      key,
      existingLock.then(
        () => newLock,
        () => newLock
      )
    );

    try {
      await existingLock;
      return await fn();
    } finally {
      resolveNext();
      if (this.locks.get(key) === newLock) {
        this.locks.delete(key);
      }
    }
  }

  isLocked(key: string): boolean {
    return this.locks.has(key);
  }
}

// ============================================================================
// Multi-Trigger Debounce Coordinator
// ============================================================================

export interface DebounceEntry {
  timer: any;
  maxWaitTimer: any;
  startTime: number;
  dirtyFiles: Set<string>;
  gameId: string;
  categoryId: string;
  onExecute: (gameId: string, categoryId: string, dirtyFiles: string[]) => void;
}

/**
 * Sliding window debouncer with starvation ceiling (max-wait ceiling).
 * Default sliding window: 3500ms (configurable between 3000ms and 4000ms).
 * Default max-wait ceiling: 15,000ms.
 */
export class DebounceCoordinator {
  private debounceMap = new Map<string, DebounceEntry>();
  private readonly debounceDelayMs: number;
  private readonly maxWaitMs: number;

  constructor(debounceDelayMs = 3500, maxWaitMs = 15000) {
    this.debounceDelayMs = Math.max(100, debounceDelayMs);
    this.maxWaitMs = Math.max(this.debounceDelayMs, maxWaitMs);
  }

  getDelayMs(): number {
    return this.debounceDelayMs;
  }

  getMaxWaitMs(): number {
    return this.maxWaitMs;
  }

  trigger(
    gameId: string,
    categoryId: string,
    filePath: string,
    onExecute: (gameId: string, categoryId: string, dirtyFiles: string[]) => void
  ): void {
    const key = `${gameId}:${categoryId}`;
    const now = Date.now();
    const existing = this.debounceMap.get(key);

    if (existing) {
      existing.dirtyFiles.add(filePath);
      existing.onExecute = onExecute;
      clearTimeout(existing.timer);

      // Starvation ceiling: if pending writes have spanned longer than maxWaitMs, force flush
      if (now - existing.startTime >= this.maxWaitMs) {
        this.flush(key);
        return;
      }

      existing.timer = setTimeout(() => {
        this.flush(key);
      }, this.debounceDelayMs);
    } else {
      const entry: DebounceEntry = {
        timer: null,
        maxWaitTimer: null,
        startTime: now,
        dirtyFiles: new Set([filePath]),
        gameId,
        categoryId,
        onExecute,
      };

      entry.timer = setTimeout(() => {
        this.flush(key);
      }, this.debounceDelayMs);

      entry.maxWaitTimer = setTimeout(() => {
        this.flush(key);
      }, this.maxWaitMs);

      this.debounceMap.set(key, entry);
    }
  }

  flush(
    key: string,
    customExecute?: (gameId: string, categoryId: string, dirtyFiles: string[]) => void
  ): void {
    const entry = this.debounceMap.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    clearTimeout(entry.maxWaitTimer);
    this.debounceMap.delete(key);

    const exec = customExecute || entry.onExecute;
    exec(entry.gameId, entry.categoryId, Array.from(entry.dirtyFiles));
  }

  flushAll(
    customExecute?: (gameId: string, categoryId: string, dirtyFiles: string[]) => void
  ): void {
    const keys = Array.from(this.debounceMap.keys());
    for (const key of keys) {
      this.flush(key, customExecute);
    }
  }

  cancelForGame(gameId: string): void {
    for (const [key, entry] of this.debounceMap.entries()) {
      if (entry.gameId === gameId) {
        clearTimeout(entry.timer);
        clearTimeout(entry.maxWaitTimer);
        this.debounceMap.delete(key);
      }
    }
  }

  cancelAll(): void {
    for (const entry of this.debounceMap.values()) {
      clearTimeout(entry.timer);
      clearTimeout(entry.maxWaitTimer);
    }
    this.debounceMap.clear();
  }

  isPending(gameId: string, categoryId?: string): boolean {
    if (categoryId) {
      return this.debounceMap.has(`${gameId}:${categoryId}`);
    }
    for (const entry of this.debounceMap.values()) {
      if (entry.gameId === gameId) return true;
    }
    return false;
  }

  getPendingFiles(gameId: string, categoryId: string): string[] {
    const entry = this.debounceMap.get(`${gameId}:${categoryId}`);
    return entry ? Array.from(entry.dirtyFiles) : [];
  }
}

// ============================================================================
// Retention Helpers
// ============================================================================

/**
 * Creates an auto-synced mod list snapshot with enforced 24-hour expiration window.
 */
export async function createAutoSyncedModListSnapshot(
  gameId: string,
  contentHash: string,
  fileSize: number,
  itemCount: number,
  summary: any,
  storagePath?: string,
  rpc?: RpcCaller
): Promise<GameSnapshotRecord> {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TWENTY_FOUR_HOURS_MS).toISOString();
  const name = `Auto-sync ${now.toISOString().replace(/T/, " ").slice(0, 19)}`;

  const caller = rpc || ((fn, args) => db.rpc(fn, args));
  const res = await caller("create_game_snapshot", {
    game_id: gameId,
    category: "mod_lists",
    name,
    is_manual: false,
    expires_at: expiresAt,
    content_hash: contentHash,
    file_size: fileSize,
    item_count: itemCount,
    storage_path: storagePath,
    summary,
  });

  if (!res.data?.success || !res.data?.snapshot) {
    throw new Error(
      res.error?.message || res.data?.error || "Failed to create auto-sync snapshot"
    );
  }
  return res.data.snapshot;
}

/**
 * Creates a permanent manual snapshot with no expiration date.
 */
export async function createManualGameSnapshot(
  gameId: string,
  category: string,
  name: string,
  contentHash: string,
  fileSize: number,
  itemCount: number,
  summary: any,
  storagePath?: string,
  rpc?: RpcCaller
): Promise<GameSnapshotRecord> {
  const caller = rpc || ((fn, args) => db.rpc(fn, args));
  const res = await caller("create_game_snapshot", {
    game_id: gameId,
    category,
    name: name.trim(),
    is_manual: true,
    expires_at: null,
    content_hash: contentHash,
    file_size: fileSize,
    item_count: itemCount,
    storage_path: storagePath,
    summary,
  });

  if (!res.data?.success || !res.data?.snapshot) {
    throw new Error(
      res.error?.message || res.data?.error || "Failed to create manual snapshot"
    );
  }
  return res.data.snapshot;
}

/**
 * Promotes an auto-synced snapshot to a permanent named snapshot.
 */
export async function promoteGameSnapshot(
  snapshotId: string,
  newName?: string,
  rpc?: RpcCaller
): Promise<GameSnapshotRecord> {
  const caller = rpc || ((fn, args) => db.rpc(fn, args));
  const res = await caller("promote_game_snapshot", {
    snapshot_id: snapshotId,
    name: newName ? newName.trim() : undefined,
  });

  if (!res.data?.success || !res.data?.snapshot) {
    throw new Error(
      res.error?.message || res.data?.error || "Failed to promote snapshot"
    );
  }
  return res.data.snapshot;
}

// ============================================================================
// Core GameSyncService Implementation
// ============================================================================

export class GameSyncService {
  private static instance: GameSyncService | null = null;
  private mutex = new GameSyncMutex();
  private debounce: DebounceCoordinator;
  private listeners = new Set<GameSyncEventListener>();
  private states = new Map<string, GameSyncState>();
  private activeSessions = new Map<
    string,
    { startedAt: string; title?: string; dirtyCategories: Set<string> }
  >();
  private bridgeUnsubscribe: (() => void) | null = null;
  private isInitialized = false;

  private rpcCaller: RpcCaller;
  private dbClient: any;
  private bridgeAdapter: any;

  constructor(options?: GameSyncServiceOptions) {
    const windowMs = options?.slidingWindowMs ?? 3500;
    const maxWaitMs = options?.maxWaitMs ?? 15000;
    this.debounce = new DebounceCoordinator(windowMs, maxWaitMs);

    this.rpcCaller = options?.rpcCaller || ((fn, args) => db.rpc(fn, args));
    this.dbClient = options?.dbClient || db;
    this.bridgeAdapter = options?.bridge || {
      isAvailable: isDesktopBridgeAvailable,
      setupGameBridgeListeners,
      addPushEventListener,
    };
  }

  public static getInstance(options?: GameSyncServiceOptions): GameSyncService {
    if (!GameSyncService.instance) {
      GameSyncService.instance = new GameSyncService(options);
    }
    return GameSyncService.instance;
  }

  public static resetInstance(): void {
    if (GameSyncService.instance) {
      GameSyncService.instance.destroy();
      GameSyncService.instance = null;
    }
  }

  /**
   * Initializes desktop bridge listeners and push subscriptions.
   */
  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const isAvailable = this.bridgeAdapter?.isAvailable
      ? this.bridgeAdapter.isAvailable()
      : isDesktopBridgeAvailable();

    if (isAvailable && this.bridgeAdapter?.setupGameBridgeListeners) {
      const unsub = this.bridgeAdapter.setupGameBridgeListeners(
        (data: any) => this.handlePlaytimeTick(data),
        (data: any) => this.handleSessionEnded(data),
        (data: any) => this.handleSessionStarted(data)
      );

      const pushUnsub = this.bridgeAdapter.addPushEventListener?.(
        (eventName: string, payload: any) => {
          if (eventName === "game_file_changed" || eventName === "file_changed") {
            this.handleFileChangedEvent(payload);
          }
        }
      );

      this.bridgeUnsubscribe = () => {
        unsub?.();
        pushUnsub?.();
      };
    }
  }

  /**
   * Cleans up all event listeners and timers.
   */
  public destroy(): void {
    this.debounce.cancelAll();
    if (this.bridgeUnsubscribe) {
      this.bridgeUnsubscribe();
      this.bridgeUnsubscribe = null;
    }
    this.listeners.clear();
    this.activeSessions.clear();
    this.isInitialized = false;
  }

  public subscribe(listener: GameSyncEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(gameId: string): GameSyncState {
    const canonical = normalizeGameId(gameId) || gameId;
    let state = this.states.get(canonical);
    if (!state) {
      state = {
        gameId: canonical,
        status: "idle",
        categories: {},
        isSessionActive: this.activeSessions.has(canonical),
        lastSyncedAt: null,
        lastError: null,
      };
      this.states.set(canonical, state);
    }
    return state;
  }

  public getAllStates(): Record<string, GameSyncState> {
    const res: Record<string, GameSyncState> = {};
    for (const [id, state] of this.states.entries()) {
      res[id] = state;
    }
    return res;
  }

  // --------------------------------------------------------------------------
  // Debounced File Watcher Trigger
  // --------------------------------------------------------------------------

  /**
   * Primary entry point for file system watcher notifications.
   */
  public onFileChanged(gameId: string, category: string, filePath = ""): void {
    const canonical = normalizeGameId(gameId) || gameId;

    // In-flight gameplay lockout: if game is currently playing, defer upload until session ends
    if (this.activeSessions.has(canonical)) {
      const session = this.activeSessions.get(canonical);
      if (session) {
        session.dirtyCategories.add(category);
      }
      this.markCategoryPendingSessionEnd(canonical, category, true);
      return;
    }

    this.markCategoryPendingDebounce(canonical, category, true);

    this.debounce.trigger(canonical, category, filePath, (gId, catId) => {
      this.markCategoryPendingDebounce(gId, catId, false);
      this.syncGame(gId, { trigger: "file_watcher", categoryIds: [catId] }).catch(
        (err) => {
          console.error(`[GameSyncService] Debounced sync error on ${gId}:${catId}:`, err);
        }
      );
    });
  }

  /**
   * Adapter for bridge push events.
   */
  public handleFileChangedEvent(payload: any): void {
    const rawGameId = payload?.gameId || payload?.game_id;
    const category = payload?.category;
    const filePath = payload?.filePath || payload?.file_path || "";
    if (!rawGameId || !category) return;
    this.onFileChanged(rawGameId, category, filePath);
  }

  // --------------------------------------------------------------------------
  // Process Lifecycle Hooks
  // --------------------------------------------------------------------------

  /**
   * Pre-flight hook triggered when game process starts.
   * Performs conflict detection and verifies whether cloud has newer data.
   */
  public async handleSessionStarted(data: any): Promise<PreFlightCheckResult> {
    const rawGameId = typeof data === "string" ? data : data?.gameId || data?.game_id;
    const canonical = normalizeGameId(rawGameId);
    if (!canonical) {
      return { canLaunch: true, action: "ready" };
    }

    const startedAt =
      typeof data === "object" && data?.startedAt
        ? data.startedAt
        : new Date().toISOString();
    const title = typeof data === "object" ? data?.title : undefined;

    this.activeSessions.set(canonical, {
      startedAt,
      title,
      dirtyCategories: new Set<string>(),
    });

    this.updateGameState(canonical, {
      isSessionActive: true,
      activeSessionStartedAt: startedAt,
    });

    return this.mutex.runExclusive(canonical, async () => {
      try {
        // 1. Check for active unresolved conflicts
        const conflictRes = await this.rpcCaller("get_game_conflicts", {
          game_id: canonical,
          status: "active",
        });

        if (conflictRes.data?.conflicts && conflictRes.data.conflicts.length > 0) {
          const activeConflict = conflictRes.data.conflicts[0];
          this.updateGameState(canonical, { status: "paused_conflict" });
          this.emit({
            type: "conflict_detected",
            gameId: canonical,
            conflict: activeConflict,
          });
          return {
            canLaunch: false,
            action: "conflict_detected",
            conflict: activeConflict,
            message: `Active sync conflict detected in category "${activeConflict.category}". Resolve before playing.`,
          };
        }

        // 2. Query cloud snapshots to see if cloud is newer than local working copy
        const snapRes = await this.rpcCaller("get_game_snapshots", {
          game_id: canonical,
        });

        const snapshots: GameSnapshotRecord[] = snapRes.data?.snapshots || [];
        if (snapshots.length > 0) {
          const latestCloudSnap = snapshots[0];
          let localSyncedAt = this.getState(canonical).lastSyncedAt;

          if (!localSyncedAt) {
            try {
              const cfgRes = await this.rpcCaller("get_game_sync_configs", {
                game_id: canonical,
              });
              localSyncedAt = cfgRes.data?.config?.last_synced_at || null;
            } catch {}
          }

          const cloudTime = new Date(latestCloudSnap.created_at).getTime();
          const localTime = localSyncedAt ? new Date(localSyncedAt).getTime() : 0;

          if (!localSyncedAt || cloudTime > localTime) {
            return {
              canLaunch: true,
              action: "download_needed",
              snapshot: latestCloudSnap,
              message: "Cloud repository has a newer save/mod snapshot. Downloading latest version recommended.",
            };
          }
        }

        return { canLaunch: true, action: "ready" };
      } catch (err: any) {
        console.warn(`[GameSyncService] Pre-flight warning for ${canonical}:`, err);
        return {
          canLaunch: true,
          action: "error",
          message: err?.message || String(err),
        };
      }
    });
  }

  public async onGameSessionStarted(gameId: string): Promise<PreFlightCheckResult> {
    return this.handleSessionStarted({ gameId });
  }

  /**
   * Definitive sync hook triggered when game process terminates.
   * File locks released by Windows. Commits all dirty categories to cloud.
   */
  public async handleSessionEnded(data: any): Promise<SyncResult> {
    const rawGameId = typeof data === "string" ? data : data?.gameId || data?.game_id;
    const canonical = normalizeGameId(rawGameId);
    if (!canonical) {
      return {
        success: false,
        gameId: String(rawGameId),
        trigger: "session_end",
        syncedCategories: [],
        skippedCategories: [],
        conflictsDetected: [],
        snapshotsCreated: [],
        error: `Unsupported game: ${rawGameId}`,
      };
    }

    const session = this.activeSessions.get(canonical);
    const dirtyCats = session ? Array.from(session.dirtyCategories) : undefined;

    this.activeSessions.delete(canonical);
    this.updateGameState(canonical, {
      isSessionActive: false,
      activeSessionStartedAt: undefined,
    });

    // Cancel lingering debounce timers because session-end triggers definitive sync
    this.debounce.cancelForGame(canonical);

    // Clear pending session-end flags
    const state = this.getState(canonical);
    for (const cat of Object.values(state.categories)) {
      cat.pendingSessionEnd = false;
      cat.pendingDebounce = false;
    }

    return this.syncGame(canonical, {
      trigger: "session_end",
      categoryIds: dirtyCats && dirtyCats.length > 0 ? dirtyCats : undefined,
    });
  }

  public async onGameSessionEnded(gameId: string): Promise<SyncResult> {
    return this.handleSessionEnded({ gameId });
  }

  // --------------------------------------------------------------------------
  // Core Synchronization Routine
  // --------------------------------------------------------------------------

  /**
   * Synchronizes one or more categories of a game.
   */
  public async syncGame(
    gameId: string,
    options?: {
      trigger?: SyncTrigger;
      categoryIds?: string[];
      isManual?: boolean;
      customSnapshotName?: string;
      localVersions?: Record<string, VersionMeta>;
    }
  ): Promise<SyncResult> {
    const canonical = normalizeGameId(gameId);
    if (!canonical) {
      throw new Error(`Unsupported game: ${gameId}`);
    }

    const trigger = options?.trigger || "manual_sync";

    // Concurrency mutex: per-game exclusive lock
    return this.mutex.runExclusive(canonical, async () => {
      const gameDef = getSupportedGame(canonical);
      if (!gameDef) {
        throw new Error(`Unsupported game: ${canonical}`);
      }

      // 1. Fetch or initialize sync config
      let config: GameSyncConfigRecord | null = null;
      try {
        const cfgRes = await this.rpcCaller("get_game_sync_configs", {
          game_id: canonical,
        });
        config = cfgRes.data?.config || null;
      } catch {}

      if (!config) {
        config = createDefaultGameSyncConfig(canonical, "current_user");
        try {
          await this.rpcCaller("upsert_game_sync_config", config);
        } catch {}
      }

      // Check master enable switch
      if (!config.enabled && trigger !== "manual_sync") {
        return {
          success: true,
          gameId: canonical,
          trigger,
          syncedCategories: [],
          skippedCategories: gameDef.categories.map((c) => c.id),
          conflictsDetected: [],
          snapshotsCreated: [],
        };
      }

      this.updateGameState(canonical, { status: "syncing", lastError: null });
      this.emit({
        type: "sync_started",
        gameId: canonical,
        trigger,
        categories: options?.categoryIds || Object.keys(config.categories || {}),
      });

      const syncedCategories: string[] = [];
      const skippedCategories: string[] = [];
      const conflictsDetected: GameConflictRecord[] = [];
      const snapshotsCreated: GameSnapshotRecord[] = [];

      // Determine which categories to process
      for (const catDef of gameDef.categories) {
        const catId = catDef.id;

        // Skip if not requested
        if (options?.categoryIds && !options.categoryIds.includes(catId)) {
          skippedCategories.push(catId);
          continue;
        }

        // Skip if toggled off (unless manual explicit sync)
        if (
          config.categories &&
          config.categories[catId] === false &&
          trigger !== "manual_sync"
        ) {
          skippedCategories.push(catId);
          continue;
        }

        this.updateCategoryState(canonical, catId, {
          status: "syncing",
          progress: { stage: "scanning", percent: 10 },
        });

        try {
          // Check for active conflicts on server for this category
          const conflictRes = await this.rpcCaller("get_game_conflicts", {
            game_id: canonical,
            status: "active",
          });

          const activeConflicts: GameConflictRecord[] = conflictRes.data?.conflicts || [];
          const existingCatConflict = activeConflicts.find((c) => c.category === catId);

          if (existingCatConflict) {
            this.updateCategoryState(canonical, catId, {
              status: "paused_conflict",
              activeConflictId: existingCatConflict.id,
              progress: { stage: "idle", percent: 0 },
            });
            conflictsDetected.push(existingCatConflict);
            continue;
          }

          // Query active cloud snapshots for category
          const snapRes = await this.rpcCaller("get_game_snapshots", {
            game_id: canonical,
            category: catId,
          });

          const cloudSnapshots: GameSnapshotRecord[] = snapRes.data?.snapshots || [];
          const latestCloudSnap = cloudSnapshots.length > 0 ? cloudSnapshots[0] : null;

          // Local version metadata provided or synthesized
          const localMeta: VersionMeta = options?.localVersions?.[catId] || {
            timestamp: new Date().toISOString(),
            contentHash: `hash_${catId}_${Date.now()}`,
            fileSize: 1024,
            itemCount: 1,
            summary: {},
          };

          // Check conflict condition
          const hasConflict = this.detectConflict(
            localMeta,
            latestCloudSnap,
            config.last_synced_at || null
          );

          if (hasConflict && latestCloudSnap) {
            const conflict = await this.registerConflict({
              gameId: canonical,
              category: catId,
              local: localMeta,
              cloud: latestCloudSnap,
            });
            conflictsDetected.push(conflict);
            this.updateCategoryState(canonical, catId, {
              status: "paused_conflict",
              activeConflictId: conflict.id,
              progress: { stage: "idle", percent: 0 },
            });
            continue;
          }

          // If content hashes match, clean fast-forward (no snapshot needed)
          if (
            latestCloudSnap &&
            localMeta.contentHash === latestCloudSnap.content_hash
          ) {
            syncedCategories.push(catId);
            this.updateCategoryState(canonical, catId, {
              status: "idle",
              lastSyncedAt: new Date().toISOString(),
              progress: { stage: "complete", percent: 100 },
            });
            continue;
          }

          // Upload new snapshot to cloud
          const isManual = Boolean(options?.isManual);
          let expiresAt: string | null = null;
          if (isManual) {
            expiresAt = null;
          } else if (catId === "mod_lists") {
            const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
            expiresAt = new Date(Date.now() + TWENTY_FOUR_HOURS_MS).toISOString();
          }

          const snapshotName =
            options?.customSnapshotName ||
            (isManual
              ? `Manual Snapshot ${new Date().toISOString().replace(/T/, " ").slice(0, 19)}`
              : `Auto-sync ${new Date().toISOString().replace(/T/, " ").slice(0, 19)}`);

          const createRes = await this.rpcCaller("create_game_snapshot", {
            game_id: canonical,
            category: catId,
            name: snapshotName,
            is_manual: isManual,
            expires_at: expiresAt,
            content_hash: localMeta.contentHash,
            file_size: localMeta.fileSize,
            item_count: localMeta.itemCount,
            summary: localMeta.summary || {},
          });

          if (createRes.data?.snapshot) {
            snapshotsCreated.push(createRes.data.snapshot);
          }

          syncedCategories.push(catId);
          this.updateCategoryState(canonical, catId, {
            status: "idle",
            lastSyncedAt: new Date().toISOString(),
            progress: { stage: "complete", percent: 100 },
          });
        } catch (catErr: any) {
          this.updateCategoryState(canonical, catId, {
            status: "error",
            lastError: catErr?.message || String(catErr),
            progress: { stage: "idle", percent: 0 },
          });
          this.emit({
            type: "sync_error",
            gameId: canonical,
            categoryId: catId,
            error: catErr?.message || String(catErr),
          });
        }
      }

      const hasActiveConflicts = conflictsDetected.length > 0;
      const finalStatus: SyncStatus = hasActiveConflicts
        ? "paused_conflict"
        : "idle";

      const now = new Date().toISOString();
      this.updateGameState(canonical, {
        status: finalStatus,
        lastSyncedAt: hasActiveConflicts ? this.getState(canonical).lastSyncedAt : now,
      });

      const result: SyncResult = {
        success: conflictsDetected.length === 0,
        gameId: canonical,
        trigger,
        syncedCategories,
        skippedCategories,
        conflictsDetected,
        snapshotsCreated,
      };

      this.emit({ type: "sync_completed", gameId: canonical, result });
      return result;
    });
  }

  /**
   * Manual sync trigger bypasses debounce timers and flushes immediately.
   */
  public async syncNow(
    gameId: string,
    categoryIds?: string[] | string
  ): Promise<SyncResult> {
    const canonical = normalizeGameId(gameId) || gameId;
    this.debounce.cancelForGame(canonical);

    const catArray =
      typeof categoryIds === "string"
        ? [categoryIds]
        : Array.isArray(categoryIds)
          ? categoryIds
          : undefined;

    return this.syncGame(canonical, {
      trigger: "manual_sync",
      categoryIds: catArray,
      isManual: false,
    });
  }

  // --------------------------------------------------------------------------
  // Manual Snapshots & Retention Promotion
  // --------------------------------------------------------------------------

  public async createManualSnapshot(
    options: ManualSnapshotOptions
  ): Promise<GameSnapshotRecord> {
    const canonical = normalizeGameId(options.gameId) || options.gameId;
    return createManualGameSnapshot(
      canonical,
      options.category,
      options.name,
      options.contentHash || `manual_hash_${Date.now()}`,
      options.fileSize || 0,
      options.itemCount || 1,
      options.summary || {},
      options.storagePath,
      this.rpcCaller
    );
  }

  public async promoteSnapshot(
    snapshotId: string,
    newName?: string
  ): Promise<GameSnapshotRecord> {
    return promoteGameSnapshot(snapshotId, newName, this.rpcCaller);
  }

  // --------------------------------------------------------------------------
  // Interactive Conflict Management
  // --------------------------------------------------------------------------

  /**
   * Determines whether local and cloud states are in conflict.
   *
   * Invariant:
   * Conflict occurs IF AND ONLY IF:
   * 1. Hashes differ (H_L !== H_C)
   * 2. AND both have diverged since last clean sync (T_L > T_S and T_C > T_S, or T_S is null).
   */
  public detectConflict(
    local: VersionMeta,
    cloud: GameSnapshotRecord | null,
    lastSyncedAt: string | null
  ): boolean {
    if (!cloud) return false;
    if (local.contentHash === cloud.content_hash) return false;

    // If never synced before, divergent states constitute a conflict
    if (!lastSyncedAt) return true;

    const syncTime = new Date(lastSyncedAt).getTime();
    if (isNaN(syncTime)) return true;

    const localTime = new Date(local.timestamp).getTime();
    const cloudTime = new Date(cloud.created_at || cloud.updated_at).getTime();

    // Clean fast-forward cases:
    // Only local changed:
    if (cloudTime <= syncTime && localTime > syncTime) return false;
    // Only cloud changed:
    if (localTime <= syncTime && cloudTime > syncTime) return false;
    // Neither changed (handled by hash, but check timestamps):
    if (localTime <= syncTime && cloudTime <= syncTime) return false;

    // Both modified after last sync: true conflict
    return true;
  }

  /**
   * Registers a newly detected conflict in DataStore and transitions category to paused_conflict.
   */
  public async registerConflict(options: {
    gameId: string;
    category: string;
    local: VersionMeta;
    cloud: GameSnapshotRecord;
  }): Promise<GameConflictRecord> {
    const canonical = normalizeGameId(options.gameId) || options.gameId;
    const now = new Date().toISOString();

    const conflictId = `conflict_${canonical}_${options.category}_${Date.now()}`;
    const conflictRecord: GameConflictRecord = {
      id: conflictId,
      user_id: options.cloud.user_id || "current_user",
      game_id: canonical,
      category: options.category,
      status: "active",
      local_version: {
        timestamp: options.local.timestamp || now,
        content_hash: options.local.contentHash,
        file_size: options.local.fileSize,
        item_count: options.local.itemCount,
        summary: options.local.summary,
        storage_temp_path: options.local.storageTempPath,
      },
      cloud_version: {
        snapshot_id: options.cloud.id,
        timestamp: options.cloud.created_at,
        content_hash: options.cloud.content_hash,
        file_size: options.cloud.file_size,
        item_count: options.cloud.item_count,
        summary: options.cloud.summary,
      },
      created_at: now,
    };

    // Insert into game_conflicts table
    try {
      await this.dbClient.from("game_conflicts").insert(conflictRecord);
    } catch {
      // Fallback: RPC if table insert not supported by mock adapter
      try {
        await this.rpcCaller("create_game_conflict", conflictRecord);
      } catch {}
    }

    this.updateCategoryState(canonical, options.category, {
      status: "paused_conflict",
      activeConflictId: conflictId,
    });
    this.updateGameState(canonical, { status: "paused_conflict" });

    this.emit({
      type: "conflict_detected",
      gameId: canonical,
      conflict: conflictRecord,
    });

    return conflictRecord;
  }

  /**
   * Resolves an interactive conflict with "keep_local", "keep_cloud", or "keep_both".
   */
  public async resolveConflict(
    options: ConflictResolutionOptions
  ): Promise<ResolveConflictResult> {
    if (
      !["keep_local", "keep_cloud", "keep_both"].includes(options.resolution)
    ) {
      throw new Error(
        'Invalid resolution. Must be "keep_local", "keep_cloud", or "keep_both"'
      );
    }

    const res = await this.rpcCaller("resolve_game_conflict", {
      conflict_id: options.conflictId,
      resolution: options.resolution,
      archive_name: options.archiveName,
    });

    if (!res.data?.success) {
      throw new Error(
        res.error?.message || res.data?.error || "Failed to resolve conflict"
      );
    }

    const conflict: GameConflictRecord = res.data.conflict;
    const canonical = conflict.game_id;

    // Reset category and game state from paused_conflict to idle
    this.updateCategoryState(canonical, String(conflict.category), {
      status: "idle",
      activeConflictId: null,
    });

    // Check if any other category for this game is in conflict
    const state = this.getState(canonical);
    const hasRemainingConflicts = Object.values(state.categories).some(
      (c) => c.status === "paused_conflict"
    );

    this.updateGameState(canonical, {
      status: hasRemainingConflicts ? "paused_conflict" : "idle",
      lastSyncedAt: new Date().toISOString(),
    });

    this.emit({
      type: "conflict_resolved",
      gameId: canonical,
      conflictId: options.conflictId,
      resolution: options.resolution,
    });

    return {
      success: true,
      resolution: options.resolution,
      conflict,
      active_snapshot: res.data.active_snapshot,
      archived_snapshot: res.data.archived_snapshot,
    };
  }

  public async resolveGameConflict(
    conflictId: string,
    resolution: "keep_local" | "keep_cloud" | "keep_both",
    archiveName?: string
  ): Promise<ResolveConflictResult> {
    return this.resolveConflict({ conflictId, resolution, archiveName });
  }

  // --------------------------------------------------------------------------
  // Custom Mod Packaging
  // --------------------------------------------------------------------------

  /**
   * Packages a local custom mod directory into a deterministic zip bundle.
   */
  public async packageModDirectory(
    gameId: string,
    folderName: string,
    files: ModFileEntry[]
  ): Promise<PackagedCustomModBundle> {
    const canonical = normalizeGameId(gameId) || gameId;

    // Check DLC / Expansion exclusion
    if (isDlcOrExpansion(canonical, folderName)) {
      throw new Error(
        `Directory "${folderName}" is an official DLC or core expansion and cannot be packaged as a custom mod.`
      );
    }

    // Account quota boundary check
    const totalUncompressedBytes = files.reduce((acc, f) => acc + f.size, 0);
    if (totalUncompressedBytes > MAX_STORAGE_QUOTA_BYTES) {
      throw new Error("File size exceeds maximum quota limit (500 MB)");
    }

    // Extract metadata
    let metadata: ExtractedModMetadata = {
      id: folderName,
      name: folderName,
      version: "1.0.0",
    };

    if (canonical === "rain_world") {
      const infoFile = files.find(
        (f) =>
          f.relativePath.toLowerCase() === "modinfo.json" ||
          f.relativePath.toLowerCase().endsWith("/modinfo.json")
      );
      if (infoFile) {
        const text = new TextDecoder().decode(infoFile.data);
        metadata = parseRainWorldModInfo(text, folderName);
      }
    } else if (canonical === "rimworld") {
      const aboutFile = files.find(
        (f) =>
          f.relativePath.toLowerCase().includes("about/about.xml") ||
          f.relativePath.toLowerCase() === "about.xml"
      );
      if (aboutFile) {
        const text = new TextDecoder().decode(aboutFile.data);
        metadata = parseRimWorldAboutXml(text, folderName);
      }
    } else if (canonical === "barotrauma") {
      const listFile = files.find(
        (f) =>
          f.relativePath.toLowerCase() === "filelist.xml" ||
          f.relativePath.toLowerCase().endsWith("/filelist.xml")
      );
      if (listFile) {
        const text = new TextDecoder().decode(listFile.data);
        metadata = parseBarotraumaFileList(text, folderName);
      }
    }

    // Create deterministic ZIP
    const { zipBytes, archiveHash, manifestHash } =
      await createDeterministicModZip(files);

    if (zipBytes.length > MAX_STORAGE_QUOTA_BYTES) {
      throw new Error("File size exceeds maximum quota limit (500 MB)");
    }

    return {
      gameId: canonical,
      modId: metadata.id,
      modName: metadata.name,
      folderName,
      archiveBuffer: zipBytes,
      archiveSizeBytes: zipBytes.length,
      archiveSha256: archiveHash,
      manifestSha256: manifestHash,
      fileCount: files.length,
      uncompressedSizeBytes: totalUncompressedBytes,
      metadata,
    };
  }

  public async packageCustomMod(
    gameId: string,
    modDirectoryName: string,
    files: ModFileEntry[] = []
  ): Promise<CustomModPackageResult> {
    try {
      const bundle = await this.packageModDirectory(
        gameId,
        modDirectoryName,
        files
      );
      return {
        success: true,
        gameId: bundle.gameId,
        modId: bundle.modId,
        modName: bundle.modName,
        archiveBuffer: bundle.archiveBuffer,
        archiveSizeBytes: bundle.archiveSizeBytes,
        archiveSha256: bundle.archiveSha256,
        manifestSha256: bundle.manifestSha256,
        fileCount: bundle.fileCount,
        uncompressedSizeBytes: bundle.uncompressedSizeBytes,
        metadata: bundle.metadata,
      };
    } catch (err: any) {
      return {
        success: false,
        gameId,
        modId: modDirectoryName,
        modName: modDirectoryName,
        error: err?.message || String(err),
      };
    }
  }

  // --------------------------------------------------------------------------
  // Internal Helpers
  // --------------------------------------------------------------------------

  private updateGameState(gameId: string, partial: Partial<GameSyncState>): void {
    const current = this.getState(gameId);
    const updated: GameSyncState = {
      ...current,
      ...partial,
      categories: partial.categories || current.categories,
    };
    this.states.set(gameId, updated);
    this.emit({ type: "state_changed", gameId, state: updated });
  }

  private updateCategoryState(
    gameId: string,
    categoryId: string,
    partial: Partial<CategorySyncState>
  ): void {
    const current = this.getState(gameId);
    const currentCat: CategorySyncState = current.categories[categoryId] || {
      categoryId,
      status: "idle",
      progress: { stage: "idle", percent: 0 },
      lastSyncedAt: null,
      lastError: null,
      activeConflictId: null,
      pendingDebounce: false,
      pendingSessionEnd: false,
    };

    const updatedCat: CategorySyncState = {
      ...currentCat,
      ...partial,
    };

    const updatedCategories = {
      ...current.categories,
      [categoryId]: updatedCat,
    };

    this.updateGameState(gameId, { categories: updatedCategories });
  }

  private markCategoryPendingDebounce(
    gameId: string,
    categoryId: string,
    pending: boolean
  ): void {
    this.updateCategoryState(gameId, categoryId, { pendingDebounce: pending });
  }

  private markCategoryPendingSessionEnd(
    gameId: string,
    categoryId: string,
    pending: boolean
  ): void {
    this.updateCategoryState(gameId, categoryId, { pendingSessionEnd: pending });
  }

  private handlePlaytimeTick(data: any): void {
    // Playtime heartbeat
  }

  private emit(event: GameSyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[GameSyncService] Error in event listener:", err);
      }
    }
  }
}

export const gameSyncService = GameSyncService.getInstance();
