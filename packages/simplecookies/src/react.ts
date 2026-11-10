import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  SimpleCookiesClient,
  readStoredConsent,
  shouldShowBanner,
} from "./client.js";
import { initScriptGating, pushConsentMode, renderBanner } from "./banner.js";
import type {
  ConsentSelection,
  SimpleCookiesConfig,
  StoredConsent,
} from "./types.js";

type Ctx = {
  client: SimpleCookiesClient;
  consent: StoredConsent | null;
  acceptAll: () => Promise<void>;
  rejectAll: () => Promise<void>;
  save: (selection: Partial<ConsentSelection>) => Promise<void>;
  isAllowed: (category: keyof ConsentSelection) => boolean;
};

const SimpleCookiesContext = createContext<Ctx | null>(null);

export function useSimpleCookies(): Ctx {
  const ctx = useContext(SimpleCookiesContext);
  if (!ctx) throw new Error("useSimpleCookies must be used inside <SimpleCookiesProvider>");
  return ctx;
}

export function useSimpleCookiesCategory(category: keyof ConsentSelection): boolean {
  const { isAllowed } = useSimpleCookies();
  return isAllowed(category);
}

export function SimpleCookiesProvider({
  config,
  children,
  autoShow = true,
}: {
  config: SimpleCookiesConfig;
  children?: ReactNode;
  autoShow?: boolean;
}) {
  const clientRef = useRef<SimpleCookiesClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new SimpleCookiesClient(config);
  }
  const client = clientRef.current;
  const [consent, setConsent] = useState<StoredConsent | null>(() => readStoredConsent());

  useEffect(() => {
    let cancelled = false;
    let unmountBanner: (() => void) | null = null;
    const off = client.onConsentChange((c) => {
      setConsent({ ...c });
      pushConsentMode(c.selection);
    });
    void client
      .fetchConfig()
      .then(() => {
        if (cancelled) return;
        setConsent(client.getConsent());
        initScriptGating(client);
        client.startSync();
        if (autoShow && shouldShowBanner(client.getConsent(), client.bannerConfig)) {
          unmountBanner = renderBanner(client);
        }
        const current = client.getConsent();
        if (current) pushConsentMode(current.selection);
      })
      .catch(() => {
        if (cancelled) return;
        initScriptGating(client);
        if (autoShow) unmountBanner = renderBanner(client);
      });
    return () => {
      cancelled = true;
      off();
      client.stopSync();
      unmountBanner?.();
    };
  }, [client, autoShow]);

  const acceptAll = useCallback(async () => {
    const c = await client.acceptAll();
    setConsent({ ...c });
  }, [client]);
  const rejectAll = useCallback(async () => {
    const c = await client.rejectAll();
    setConsent({ ...c });
  }, [client]);
  const save = useCallback(
    async (selection: Partial<ConsentSelection>) => {
      const c = await client.setConsent(selection);
      setConsent({ ...c });
    },
    [client],
  );
  const isAllowed = useCallback(
    (category: keyof ConsentSelection) => client.isAllowed(category),
    [client],
  );

  const value = useMemo<Ctx>(
    () => ({ client, consent, acceptAll, rejectAll, save, isAllowed }),
    [client, consent, acceptAll, rejectAll, save, isAllowed],
  );

  return createElement(SimpleCookiesContext.Provider, { value }, children);
}

/** React banner that mirrors the vanilla banner but lives inside React tree. */
export function SimpleCookiesBanner({ onDone }: { onDone?: (c: StoredConsent) => void }) {
  const { client, acceptAll, rejectAll, save } = useSimpleCookies();
  const [visible, setVisible] = useState(true);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<ConsentSelection>({
    necessary: true,
    preferences: false,
    statistics: false,
    marketing: false,
    custom: false,
  });
  const cfg = client.bannerConfig;

  useEffect(() => {
    const current = client.getConsent();
    if (current) {
      setDraft(current.selection);
      setVisible(false);
    } else {
      setVisible(shouldShowBanner(null, cfg));
    }
    const off = client.onConsentChange((c) => {
      setDraft(c.selection);
      setVisible(false);
      onDone?.(c);
    });
    return off;
  }, [client, cfg, onDone]);

  if (!visible) return null;

  const wrapStyle: Record<string, string> = {
    position: "fixed",
    zIndex: "2147483647",
    left: "16px",
    right: "16px",
    bottom: "16px",
    maxWidth: "560px",
    margin: "0 auto",
    background: cfg.background,
    color: cfg.textColor,
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontSize: "14px",
    lineHeight: "1.5",
  };

  const btn = (label: string, primary: boolean) => ({
    margin: "6px 6px 0 0",
    padding: "8px 14px",
    borderRadius: "8px",
    cursor: "pointer" as const,
    border: primary ? `1px solid ${cfg.accent}` : "1px solid rgba(128,128,128,0.5)",
    background: primary ? cfg.accent : "transparent",
    color: primary ? "#0b0f19" : "inherit",
    fontWeight: 600,
  });

  const keys: Array<keyof ConsentSelection> = ["necessary", "preferences", "statistics", "marketing", "custom"];

  return createElement(
    "div",
    { role: "dialog", "aria-live": "polite", style: wrapStyle },
    createElement("div", { style: { fontWeight: 700, fontSize: "16px", marginBottom: "6px" } }, cfg.title),
    createElement("div", null, cfg.text),
    customizing
      ? createElement(
          "div",
          { style: { marginTop: "10px" } },
          keys.map((key) => {
            const cat = cfg.categories[key];
            if (!cat?.enabled && key !== "necessary") return null;
            return createElement(
              "label",
              { key, style: { display: "flex", gap: "8px", marginTop: "6px" } },
              createElement("input", {
                type: "checkbox",
                checked: key === "necessary" ? true : Boolean(draft[key]),
                disabled: key === "necessary",
                onChange: (e: { target: { checked: boolean } }) =>
                  setDraft((prev) => ({ ...prev, [key]: e.target.checked } as ConsentSelection)),
              }),
              createElement(
                "span",
                null,
                createElement("strong", null, cat?.label || key),
                " ",
                cat?.description || "",
              ),
            );
          }),
        )
      : null,
    createElement(
      "div",
      { style: { marginTop: "12px" } },
      createElement("button", { style: btn(cfg.acceptLabel, true), onClick: () => void acceptAll() }, cfg.acceptLabel),
      createElement("button", { style: btn(cfg.rejectLabel, false), onClick: () => void rejectAll() }, cfg.rejectLabel),
      cfg.showCustomize && !customizing
        ? createElement("button", { style: btn(cfg.customizeLabel, false), onClick: () => setCustomizing(true) }, cfg.customizeLabel)
        : null,
      customizing
        ? createElement("button", { style: btn(cfg.saveLabel, true), onClick: () => void save(draft) }, cfg.saveLabel)
        : null,
    ),
    (cfg.showPoweredBy || (cfg as any)?.show_powered_by)
      ? createElement(
          "div",
          { style: { marginTop: "10px", fontSize: "11px", opacity: 0.6 } },
          "Powered by SimpleCookies — free & unlimited",
        )
      : null,
  );
}
