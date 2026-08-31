export interface InstalledGame {
  id: string;
  title: string;
  platform: string;
  launchUri?: string;
  executablePath?: string;
  installPath?: string;
  iconUrl?: string;
  bannerUrl?: string;
  isCustom?: boolean;
  executableName?: string;
  sizeOnDisk?: number;
  lastUpdated?: string;
  playtime_seconds?: number;
  last_played_at?: string | null;
}

export interface LaunchGameParams {
  gameId: string;
  platform: string;
  title?: string;
  launchUri?: string;
  executablePath?: string;
  arguments?: string;
  workingDirectory?: string;
  executableName?: string;
}

export interface LaunchResult {
  success: boolean;
  message?: string;
  processId?: number;
}

export interface PickGameResult {
  title: string;
  executablePath: string;
  iconDataUrl?: string;
}

export interface RunningGameSession {
  gameId: string;
  title: string;
  platform: string;
  processId?: number;
  processName?: string;
  startedAt: string;
  elapsedSeconds: number;
  totalSessionSeconds?: number;
}

export interface GameScanResult {
  games: InstalledGame[];
  scannedAt?: string;
  platformsScanned?: string[];
}

type PushEventListener = (eventName: string, data: any) => void;

const pendingBridgeCalls = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();

const pushEventListeners = new Set<PushEventListener>();

let bridgeListenerInitialized = false;

export function initBridgeListener() {
  if (bridgeListenerInitialized) return;
  bridgeListenerInitialized = true;

  const webview = (window as any).chrome?.webview;
  if (!webview) return;

  webview.addEventListener("message", (event: any) => {
    try {
      const data =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (!data) return;

      // Handle RPC / Request-Response calls
      if (data.id && pendingBridgeCalls.has(data.id)) {
        const { resolve, reject } = pendingBridgeCalls.get(data.id)!;
        pendingBridgeCalls.delete(data.id);
        if (data.success) {
          resolve(data.data !== undefined ? data.data : data);
        } else {
          reject(new Error(data.error || "Bridge call failed"));
        }
        return;
      }

      // Handle push events (event, event_type, or @event)
      const eventName = data.event || data.event_type || data["@event"];
      if (eventName) {
        const payload = data.data !== undefined ? data.data : data;
        for (const listener of pushEventListeners) {
          try {
            listener(eventName, payload);
          } catch (err) {
            console.error("Error in bridge event listener", err);
          }
        }
      }
    } catch {
      // Ignore non-JSON messages
    }
  });
}

export function isDesktopBridgeAvailable(): boolean {
  return !!(window as any).chrome?.webview;
}

export function callDesktopBridge<T = any>(
  command: string,
  params: Record<string, any> = {},
  timeoutMs = 60000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const webview = (window as any).chrome?.webview;
    if (!webview) {
      reject(
        new Error("Desktop bridge not available. Run in the desktop app."),
      );
      return;
    }

    initBridgeListener();

    const id = crypto.randomUUID();
    pendingBridgeCalls.set(id, { resolve, reject });

    setTimeout(() => {
      if (pendingBridgeCalls.has(id)) {
        pendingBridgeCalls.delete(id);
        reject(new Error("Bridge call timed out"));
      }
    }, timeoutMs);

    webview.postMessage(JSON.stringify({ command, id, ...params }));
  });
}

export async function toggleFullscreen(): Promise<{ isFullscreen: boolean }> {
  return callDesktopBridge<{ isFullscreen: boolean }>("toggle_fullscreen");
}

export async function setFullscreen(
  fullscreen: boolean,
): Promise<{ isFullscreen: boolean }> {
  return callDesktopBridge<{ isFullscreen: boolean }>("set_fullscreen", {
    fullscreen,
  });
}

export async function isFullscreen(): Promise<{ isFullscreen: boolean }> {
  return callDesktopBridge<{ isFullscreen: boolean }>("is_fullscreen");
}

export async function scanInstalledGames(): Promise<InstalledGame[]> {
  const result = await callDesktopBridge<
    { games?: InstalledGame[] } | InstalledGame[]
  >("scan_installed_games");
  if (Array.isArray(result)) return result;
  return result?.games || [];
}

export async function launchGame(
  params: LaunchGameParams,
): Promise<LaunchResult> {
  return callDesktopBridge<LaunchResult>("launch_game", params);
}

export async function pickGameExecutable(): Promise<PickGameResult | null> {
  return callDesktopBridge<PickGameResult | null>("pick_game_executable");
}

export async function getGameIcon(
  executablePath: string,
  gameId?: string,
): Promise<{ iconDataUrl: string }> {
  return callDesktopBridge<{ iconDataUrl: string }>("get_game_icon", {
    executablePath,
    gameId,
  });
}

export async function getRunningGames(): Promise<{
  runningGames: RunningGameSession[];
}> {
  const res = await callDesktopBridge<{ runningGames: RunningGameSession[] }>(
    "get_running_games",
  );
  return { runningGames: res?.runningGames || [] };
}

export function addPushEventListener(listener: PushEventListener): () => void {
  initBridgeListener();
  pushEventListeners.add(listener);
  return () => {
    pushEventListeners.delete(listener);
  };
}

export function setupGameBridgeListeners(
  onPlaytimeTick?: (data: any) => void,
  onSessionEnded?: (data: any) => void,
  onSessionStarted?: (data: any) => void,
): () => void {
  return addPushEventListener((eventName, payload) => {
    if (eventName === "game_playtime_tick" && onPlaytimeTick) {
      onPlaytimeTick(payload);
    } else if (eventName === "game_session_ended" && onSessionEnded) {
      onSessionEnded(payload);
    } else if (eventName === "game_session_started" && onSessionStarted) {
      onSessionStarted(payload);
    }
  });
}
