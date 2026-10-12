export interface PollinationsConfig {
  configured: boolean;
  appKey: string | null;
  supporterAppKey: string | null;
  hasSupporterApp: boolean;
}

export interface PollinationsAuthResult {
  apiKey: string;
  isSupporter: boolean;
}

const STORAGE_SESSION_AUTH_STATE = "pollinations_auth_state";
const STORAGE_SESSION_CODE_VERIFIER = "pollinations_pkce_verifier";
const STORAGE_SESSION_IS_SUPPORTER = "pollinations_auth_is_supporter";
const STORAGE_SESSION_CLIENT_ID = "pollinations_auth_client_id";

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateRandomString(length = 43): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => possible[b % possible.length])
    .join("");
}

export async function generatePkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = generateRandomString(64);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const codeChallenge = base64UrlEncode(digest);
  return { codeVerifier, codeChallenge };
}

let cachedConfig: PollinationsConfig | null = null;
let lastFetchTime = 0;

export async function fetchPollinationsConfig(): Promise<PollinationsConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastFetchTime < 60000) {
    return cachedConfig;
  }
  try {
    const res = await fetch("/api/ai/pollinations/config");
    if (res.ok) {
      const data = await res.json();
      cachedConfig = data;
      lastFetchTime = now;
      return data;
    }
  } catch (err) {
    console.warn("Failed to fetch Pollinations config from server:", err);
  }
  return {
    configured: false,
    appKey: null,
    supporterAppKey: null,
    hasSupporterApp: false,
  };
}

export function getPollinationsRedirectUri(): string {
  return `${window.location.origin}/oauth/pollinations/callback`;
}

/**
 * Initiates the Pollinations OAuth flow.
 * In 'popup' mode, opens a centered popup and resolves once authorization completes.
 * In 'redirect' mode, redirects the window to Pollinations.
 */
export async function initiatePollinationsOAuth({
  isSupporter = false,
  mode = "popup",
}: {
  isSupporter?: boolean;
  mode?: "popup" | "redirect";
} = {}): Promise<PollinationsAuthResult> {
  const config = await fetchPollinationsConfig();
  const targetKey = isSupporter
    ? config.supporterAppKey || config.appKey
    : config.appKey || config.supporterAppKey;

  const clientId = targetKey || undefined;
  const redirectUri = getPollinationsRedirectUri();
  const state = generateRandomString(32);
  const { codeVerifier, codeChallenge } = await generatePkcePair();

  // Save in sessionStorage and localStorage for popup/tab communication
  try {
    sessionStorage.setItem(STORAGE_SESSION_AUTH_STATE, state);
    sessionStorage.setItem(STORAGE_SESSION_CODE_VERIFIER, codeVerifier);
    sessionStorage.setItem(
      STORAGE_SESSION_IS_SUPPORTER,
      isSupporter ? "true" : "false",
    );
    if (clientId) {
      sessionStorage.setItem(STORAGE_SESSION_CLIENT_ID, clientId);
    }
    localStorage.setItem(STORAGE_SESSION_AUTH_STATE, state);
    localStorage.setItem(STORAGE_SESSION_CODE_VERIFIER, codeVerifier);
    localStorage.setItem(
      STORAGE_SESSION_IS_SUPPORTER,
      isSupporter ? "true" : "false",
    );
    if (clientId) {
      localStorage.setItem(STORAGE_SESSION_CLIENT_ID, clientId);
    }
  } catch {}

  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "profile usage",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  if (clientId) {
    params.set("client_id", clientId);
  }

  const authUrl = `https://enter.pollinations.ai/authorize?${params.toString()}`;

  if (mode === "redirect") {
    window.location.href = authUrl;
    return new Promise(() => {});
  }

  // Popup Mode
  const width = 520;
  const height = 680;
  const left = Math.max(0, (window.innerWidth - width) / 2 + window.screenX);
  const top = Math.max(0, (window.innerHeight - height) / 2 + window.screenY);

  const popup = window.open(
    authUrl,
    "PollinationsAuthPopup",
    `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes,scrollbars=yes`,
  );

  if (!popup || popup.closed || typeof popup.closed === "undefined") {
    // If popup was blocked, fallback to full page redirect
    window.location.href = authUrl;
    return new Promise(() => {});
  }

  return new Promise<PollinationsAuthResult>((resolve, reject) => {
    let checkInterval: NodeJS.Timeout | null = null;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "POLLINATIONS_AUTH_SUCCESS") {
        cleanup();
        try {
          popup?.close();
        } catch {}
        resolve({
          apiKey: event.data.apiKey,
          isSupporter: !!event.data.isSupporter,
        });
      } else if (event.data?.type === "POLLINATIONS_AUTH_ERROR") {
        cleanup();
        try {
          popup?.close();
        } catch {}
        reject(new Error(event.data.error || "Authorization failed"));
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "pollinations_auth_result" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          localStorage.removeItem("pollinations_auth_result");
          if (parsed.success && parsed.apiKey) {
            cleanup();
            try {
              popup?.close();
            } catch {}
            resolve({
              apiKey: parsed.apiKey,
              isSupporter: !!parsed.isSupporter,
            });
          } else if (parsed.error) {
            cleanup();
            try {
              popup?.close();
            } catch {}
            reject(new Error(parsed.error));
          }
        } catch {}
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);

    checkInterval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Pollinations login window was closed."));
      }
    }, 1000);
  });
}

/**
 * Exchanges authorization code for an API key token.
 */
export async function exchangePollinationsAuthCode({
  code,
  state,
}: {
  code: string;
  state?: string;
}): Promise<PollinationsAuthResult> {
  const savedState =
    sessionStorage.getItem(STORAGE_SESSION_AUTH_STATE) ||
    localStorage.getItem(STORAGE_SESSION_AUTH_STATE);
  const codeVerifier =
    sessionStorage.getItem(STORAGE_SESSION_CODE_VERIFIER) ||
    localStorage.getItem(STORAGE_SESSION_CODE_VERIFIER);
  const isSupporter =
    (sessionStorage.getItem(STORAGE_SESSION_IS_SUPPORTER) ||
      localStorage.getItem(STORAGE_SESSION_IS_SUPPORTER)) === "true";
  const clientId =
    sessionStorage.getItem(STORAGE_SESSION_CLIENT_ID) ||
    localStorage.getItem(STORAGE_SESSION_CLIENT_ID) ||
    undefined;

  if (savedState && state && savedState !== state) {
    throw new Error(
      "OAuth authentication state mismatch. Please retry connecting your Pollinations account.",
    );
  }

  if (!codeVerifier) {
    throw new Error(
      "Missing PKCE authorization verifier. Please retry connecting your Pollinations account.",
    );
  }

  const redirectUri = getPollinationsRedirectUri();

  // Try server proxy first
  let tokenData: any = null;
  try {
    const res = await fetch("/api/ai/pollinations/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      }),
    });

    if (res.ok) {
      tokenData = await res.json();
    }
  } catch {}

  // Direct fallback to Pollinations token endpoint if server proxy failed
  if (!tokenData) {
    const directRes = await fetch(
      "https://enter.pollinations.ai/api/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          ...(clientId ? { client_id: clientId } : {}),
        }),
      },
    );

    if (!directRes.ok) {
      const errText = await directRes.text();
      throw new Error(`Token exchange failed: ${errText}`);
    }
    tokenData = await directRes.json();
  }

  const apiKey =
    tokenData.access_token ||
    tokenData.api_key ||
    tokenData.token ||
    tokenData.key ||
    (typeof tokenData === "string" ? tokenData : "");

  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("No API key returned from Pollinations.");
  }

  return {
    apiKey: apiKey.trim(),
    isSupporter,
  };
}
