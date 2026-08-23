const pendingBridgeCalls = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();

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
      if (data.id && pendingBridgeCalls.has(data.id)) {
        const { resolve, reject } = pendingBridgeCalls.get(data.id)!;
        pendingBridgeCalls.delete(data.id);
        if (data.success) {
          resolve(data.data);
        } else {
          reject(new Error(data.error || "Bridge call failed"));
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
