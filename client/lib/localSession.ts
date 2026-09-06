export interface LocalSession {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    username: string;
    role?: string;
    user_metadata?: {
      username?: string;
      full_name?: string;
      role?: string;
      [key: string]: any;
    };
  };
}

const LOCAL_SESSION_KEY = "oxygen_auth_session";

export function getLocalSession(): LocalSession | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setLocalSession(session: LocalSession | null) {
  try {
    if (typeof localStorage === "undefined") return;
    if (session) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch {}
}
