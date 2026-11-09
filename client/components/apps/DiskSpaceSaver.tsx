import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  isDesktopBridgeAvailable,
  getDrives,
  scanDiskUsage,
  openInExplorer,
  DriveInfo,
  DiskFolderEntry,
  DiskFileEntry,
  DiskSafeCleanupEntry,
  DiskScanResult,
} from "@/lib/desktopBridge";
import {
  HardDrive,
  FolderOpen,
  File,
  ScanLine,
  ChevronDown,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function SizeBar({
  sizeBytes,
  maxBytes,
}: {
  sizeBytes: number;
  maxBytes: number;
}) {
  const pct = maxBytes > 0 ? Math.min((sizeBytes / maxBytes) * 100, 100) : 0;
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
      <div
        className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
} 

function RowContextMenu({
  contextMenu,
  onClose,
  onOpenInExplorer,
  label,
}: {
  contextMenu: ContextMenuState;
  onClose: () => void;
  onOpenInExplorer: (path: string) => void;
  label: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[200px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-left"
        onClick={() => {
          onOpenInExplorer(contextMenu.path);
          onClose();
        }}
      >
        <FolderOpen className="w-4 h-4" />
        {label}
      </button>
    </div>
  );
}

export function DiskSpaceSaverApp() {
  const { t } = useTranslation();
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<DriveInfo | null>(null);
  const [scanResult, setScanResult] = useState<DiskScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"folders" | "files" | "safe">("folders");
  const [driveDropdownOpen, setDriveDropdownOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const scanAbortRef = useRef(false);

  const loadDrives = useCallback(async () => {
    if (!isDesktopBridgeAvailable()) return;
    setLoadingDrives(true);
    setError(null);
    try {
      const result = await getDrives();
      setDrives(result);
      if (result.length > 0 && !selectedDrive) {
        setSelectedDrive(result[0]);
      }
    } catch (err: any) {
      setError(
        err?.message ||
          t(
            "diskSpaceSaver.errorLoadingDrives",
            undefined,
            "Failed to load drives.",
          ),
      );
    } finally {
      setLoadingDrives(false);
    }
  }, [selectedDrive, t]);

  // Load drives on mount
  useEffect(() => {
    loadDrives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close drive dropdown when clicking outside
  useEffect(() => {
    if (!driveDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      setDriveDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [driveDropdownOpen]);

  const startScan = useCallback(async () => {
    if (!selectedDrive) return;
    scanAbortRef.current = false;
    setScanning(true);
    setScanResult(null);
    setError(null);
    try {
      const result = await scanDiskUsage(selectedDrive.rootPath);
      setScanResult(result);
      toast.success(
        t("diskSpaceSaver.scanComplete", undefined, "Scan complete!") +
          " " +
          result.totalScanned.toLocaleString() +
          " " +
          t("diskSpaceSaver.filesScanned", undefined, "files scanned."),
      );
    } catch (err: any) {
      if (!scanAbortRef.current) {
        const msg =
          err?.message ||
          t("diskSpaceSaver.errorScanning", undefined, "Scan failed.");
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setScanning(false);
    }
  }, [selectedDrive, t]);

  const handleOpenInExplorer = useCallback(async (path: string) => {
    try {
      await openInExplorer(path);
    } catch (err: any) {
      toast.error(err?.message || "Failed to open in Explorer.");
    }
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, path });
    },
    [],
  );

  if (!isDesktopBridgeAvailable()) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <HardDrive className="w-12 h-12" />
        <p className="text-lg font-medium">
          {t(
            "diskSpaceSaver.desktopOnly",
            undefined,
            "Disk Space Saver is only available in the desktop app.",
          )}
        </p>
      </div>
    );
  }

  const maxFolderSize = scanResult?.folders?.[0]?.sizeBytes ?? 1;
  const maxFileSize = scanResult?.topFiles?.[0]?.sizeBytes ?? 1;
  const safeCleanup: DiskSafeCleanupEntry[] = scanResult?.safeCleanup ?? [];
  const maxSafeSize = safeCleanup[0]?.sizeBytes ?? 1;
  const totalSafeBytes = safeCleanup.reduce((sum, e) => sum + e.sizeBytes, 0);

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-4">
      {/* Context menu */}
      {contextMenu && (
        <RowContextMenu
          contextMenu={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpenInExplorer={handleOpenInExplorer}
          label={t(
            "diskSpaceSaver.openInExplorer",
            undefined,
            "Open in File Explorer",
          )}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-cyan-500" />
          <h2 className="text-lg font-semibold">
            {t("diskSpaceSaver.title", undefined, "Disk Space Saver")}
          </h2>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Drive Selector */}
          <div className="relative">
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background text-sm hover:bg-muted transition-colors min-w-[160px]"
              onClick={(e) => {
                e.stopPropagation();
                setDriveDropdownOpen((v) => !v);
              }}
              disabled={loadingDrives || scanning}
            >
              {loadingDrives ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <HardDrive className="w-4 h-4 text-cyan-500" />
              )}
              <span className="flex-1 text-left truncate">
                {selectedDrive
                  ? `${selectedDrive.label} (${selectedDrive.name}) — ${formatBytes(selectedDrive.totalBytes)}`
                  : t(
                      "diskSpaceSaver.selectDrive",
                      undefined,
                      "Select Drive...",
                    )}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {driveDropdownOpen && drives.length > 0 && (
              <div
                className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg min-w-[260px]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {drives.map((drive) => (
                  <button
                    key={drive.rootPath}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-left"
                    onClick={() => {
                      setSelectedDrive(drive);
                      setDriveDropdownOpen(false);
                      setScanResult(null);
                    }}
                  >
                    <HardDrive className="w-4 h-4 text-cyan-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">
                        {drive.label} ({drive.name})
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(drive.usedBytes)} used /{" "}
                        {formatBytes(drive.totalBytes)} total
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scan Button */}
          <button
            className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={startScan}
            disabled={!selectedDrive || scanning}
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("diskSpaceSaver.scanning", undefined, "Scanning...")}
              </>
            ) : (
              <>
                <ScanLine className="w-4 h-4" />
                {t("diskSpaceSaver.scan", undefined, "Scan")}
              </>
            )}
          </button>

          {/* Refresh drives */}
          <button
            className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-background text-sm hover:bg-muted transition-colors"
            onClick={loadDrives}
            disabled={loadingDrives || scanning}
            title={t("common.refresh", undefined, "Refresh")}
          >
            <RefreshCw
              className={`w-4 h-4 ${loadingDrives ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Drive usage bar */}
      {selectedDrive && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {t("diskSpaceSaver.used", undefined, "Used")}:{" "}
              {formatBytes(selectedDrive.usedBytes)}
            </span>
            <span>
              {t("diskSpaceSaver.free", undefined, "Free")}:{" "}
              {formatBytes(selectedDrive.freeBytes)}
            </span>
            <span>
              {t("diskSpaceSaver.total", undefined, "Total")}:{" "}
              {formatBytes(selectedDrive.totalBytes)}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-cyan-500 h-2 rounded-full"
              style={{
                width: `${Math.min((selectedDrive.usedBytes / selectedDrive.totalBytes) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Scanning message */}
      {scanning && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-500 shrink-0" />
          <div>
            <p className="font-medium">
              {t(
                "diskSpaceSaver.scanningDisk",
                undefined,
                "Scanning disk...",
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              {t(
                "diskSpaceSaver.scanningHint",
                undefined,
                "This may take a few minutes for large drives. Includes safe system caches (shader/temp/update). Driver/system files are never listed.",
              )}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {scanResult && !scanning && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {/* Stats */}
          <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
            <span>
              {scanResult.totalScanned.toLocaleString()}{" "}
              {t("diskSpaceSaver.filesScanned", undefined, "files scanned")}
            </span>
            <span>·</span>
            <span>
              {scanResult.folders.length}{" "}
              {t("diskSpaceSaver.folders", undefined, "folders")}
            </span>
            <span>·</span>
            <span>
              {scanResult.topFiles.length}{" "}
              {t("diskSpaceSaver.largeFiles", undefined, "large files")}
            </span>
            {safeCleanup.length > 0 && (
              <>
                <span>·</span>
                <span className="font-medium text-emerald-500">
                  {formatBytes(totalSafeBytes)}{" "}
                  {t("diskSpaceSaver.safeTotal", undefined, "safe to delete")}
                </span>
              </>
            )}
          </div>

          {/* Safe cleanup hint */}
          {activeTab === "safe" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {t(
                  "diskSpaceSaver.safeHint",
                  undefined,
                  "Verified regenerable caches only — delete CONTENTS, not folders. Close games/apps first, skip locked files, empty the Recycle Bin to free space. Windows.old removes the rollback option. Driver and system files are never listed.",
                )}
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-border gap-4">
            <button
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "folders"
                  ? "border-b-2 border-cyan-500 text-cyan-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("folders")}
            >
              <span className="flex items-center gap-1">
                <FolderOpen className="w-4 h-4" />
                {t(
                  "diskSpaceSaver.tabFolders",
                  undefined,
                  "Folders by Size",
                )}
              </span>
            </button>
            <button
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "files"
                  ? "border-b-2 border-cyan-500 text-cyan-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("files")}
            >
              <span className="flex items-center gap-1">
                <File className="w-4 h-4" />
                {t("diskSpaceSaver.tabFiles", undefined, "Largest Files")}
              </span>
            </button>
            <button
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === "safe"
                  ? "border-b-2 border-emerald-500 text-emerald-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("safe")}
            >
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                {t("diskSpaceSaver.tabSafe", undefined, "Safe to Delete")}
                {safeCleanup.length > 0 && (
                  <span className="text-xs font-normal opacity-80">
                    ({formatBytes(totalSafeBytes)})
                  </span>
                )}
              </span>
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === "folders" && (
              <div className="space-y-1">
                {scanResult.folders.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    {t(
                      "diskSpaceSaver.noFolders",
                      undefined,
                      "No folders found.",
                    )}
                  </p>
                ) : (
                  scanResult.folders.map((folder: DiskFolderEntry, i: number) => (
                    <div
                      key={folder.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted cursor-default group"
                      onContextMenu={(e) => handleContextMenu(e, folder.path)}
                    >
                      <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">
                        {i + 1}
                      </span>
                      <FolderOpen className="w-4 h-4 text-yellow-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          title={folder.path}
                        >
                          {folder.name || folder.path}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {folder.path}
                        </p>
                        <SizeBar
                          sizeBytes={folder.sizeBytes}
                          maxBytes={maxFolderSize}
                        />
                      </div>
                      <span className="text-sm font-mono font-semibold text-cyan-500 shrink-0">
                        {formatBytes(folder.sizeBytes)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "files" && (
              <div className="space-y-1">
                {scanResult.topFiles.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    {t(
                      "diskSpaceSaver.noLargeFiles",
                      undefined,
                      "No large files found (> 10 MB).",
                    )}
                  </p>
                ) : (
                  scanResult.topFiles.map((file: DiskFileEntry, i: number) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted cursor-default group"
                      onContextMenu={(e) => handleContextMenu(e, file.path)}
                    >
                      <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">
                        {i + 1}
                      </span>
                      <File className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          title={file.path}
                        >
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {file.directory}
                        </p>
                        <SizeBar
                          sizeBytes={file.sizeBytes}
                          maxBytes={maxFileSize}
                        />
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-0.5">
                        <span className="text-sm font-mono font-semibold text-cyan-500">
                          {formatBytes(file.sizeBytes)}
                        </span>
                        {file.extension && (
                          <span className="text-xs text-muted-foreground uppercase">
                            {file.extension.replace(".", "")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "safe" && (
              <div className="space-y-1">
                {safeCleanup.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    {t(
                      "diskSpaceSaver.noSafeCleanup",
                      undefined,
                      "No safe cleanup found. Shader, temp and update caches may be empty — or the desktop app needs updating.",
                    )}
                  </p>
                ) : (
                  safeCleanup.map((entry: DiskSafeCleanupEntry, i: number) => (
                    <div
                      key={entry.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted cursor-default group"
                      onContextMenu={(e) => handleContextMenu(e, entry.path)}
                    >
                      <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">
                        {i + 1}
                      </span>
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          title={entry.path}
                        >
                          {entry.name || entry.path}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.path}
                        </p>
                        <SizeBar sizeBytes={entry.sizeBytes} maxBytes={maxSafeSize} />
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-0.5">
                        <span className="text-sm font-mono font-semibold text-emerald-500">
                          {formatBytes(entry.sizeBytes)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.fileCount.toLocaleString()}{" "}
                          {t("diskSpaceSaver.filesCount", undefined, "files")}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state when no scan yet */}
      {!scanResult && !scanning && !error && selectedDrive && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <HardDrive className="w-12 h-12 opacity-30" />
          <p className="text-sm">
            {t(
              "diskSpaceSaver.clickScan",
              undefined,
              "Select a drive and click Scan to analyze disk usage.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
