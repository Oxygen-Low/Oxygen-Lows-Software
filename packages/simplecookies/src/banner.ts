import type { SimpleCookiesClient } from "./client.js";
import { SimpleCookiesClient as SimpleCookiesClientImpl } from "./client.js";
import {
  allGrantedSelection,
  defaultConsentSelection,
  normalizeSelection,
  type BannerConfig,
  type CookieCategory,
  type ConsentSelection,
} from "./types.js";

const MOUNT_ID = "simplecookies-banner";
const GATED_SCRIPT_TYPE = "text/plain";
const GATED_CATEGORY_ATTR = "data-simplecookies-category";

// ---------------------------------------------------------------------------
// DOM helpers (textContent only — never innerHTML with user-controlled text)
// ---------------------------------------------------------------------------

function el(tag: string, text?: string, attrs?: Record<string, string>): HTMLElement {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  return node;
}

function styleMount(mount: HTMLElement, config: BannerConfig): void {
  const base: Record<string, string> = {
    position: "fixed",
    zIndex: "2147483647",
    maxWidth: "560px",
    width: "calc(100vw - 32px)",
    background: config.background,
    color: config.textColor,
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontSize: "14px",
    lineHeight: "1.5",
  };
  switch (config.position) {
    case "top":
      base.top = "16px";
      base.left = "50%";
      base.transform = "translateX(-50%)";
      break;
    case "left":
      base.left = "16px";
      base.bottom = "16px";
      break;
    case "right":
      base.right = "16px";
      base.bottom = "16px";
      break;
    case "center":
      base.top = "50%";
      base.left = "50%";
      base.transform = "translate(-50%, -50%)";
      break;
    default:
      base.left = "50%";
      base.transform = "translateX(-50%)";
      base.bottom = "16px";
  }
  Object.assign(mount.style, base);
}

function button(label: string, accent: string, primary: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.style.margin = "6px 6px 0 0";
  btn.style.padding = "8px 14px";
  btn.style.borderRadius = "8px";
  btn.style.cursor = "pointer";
  btn.style.border = primary ? `1px solid ${accent}` : "1px solid rgba(128,128,128,0.5)";
  btn.style.background = primary ? accent : "transparent";
  btn.style.color = primary ? "#0b0f19" : "inherit";
  btn.style.fontWeight = "600";
  return btn;
}

const CATEGORY_ORDER: Array<keyof ConsentSelection> = [
  "necessary",
  "preferences",
  "statistics",
  "marketing",
  "custom",
];

// ---------------------------------------------------------------------------
// Script gating: scripts marked data-simplecookies-category stay inert until OK
// ---------------------------------------------------------------------------

export function markGatedScripts(): void {
  const scripts = document.querySelectorAll(
    `script[src][${GATED_CATEGORY_ATTR}]`,
  );
  scripts.forEach((s) => {
    const script = s as HTMLScriptElement;
    if (script.type === GATED_SCRIPT_TYPE) return;
    script.setAttribute("data-original-type", script.type || "");
    script.type = GATED_SCRIPT_TYPE;
  });
}

export function releaseGatedScripts(selection: ConsentSelection): void {
  const scripts = document.querySelectorAll(
    `script[src][${GATED_CATEGORY_ATTR}][type="${GATED_SCRIPT_TYPE}"]`,
  );
  scripts.forEach((s) => {
    const gated = s as HTMLScriptElement;
    const category = (gated.getAttribute(GATED_CATEGORY_ATTR) || "marketing") as CookieCategory;
    const allowed =
      category === "necessary" || Boolean(selection[category as keyof ConsentSelection]);
    if (!allowed) return;
    const replacement = document.createElement("script");
    replacement.src = gated.src;
    for (const attr of gated.attributes) {
      if (attr.name === "type") continue;
      if (attr.name === GATED_CATEGORY_ATTR) continue;
      replacement.setAttribute(attr.name, attr.value);
    }
    replacement.type = gated.getAttribute("data-original-type") || "text/javascript";
    gated.replaceWith(replacement);
  });
}

export function initScriptGating(client: SimpleCookiesClient): void {
  markGatedScripts();
  const consent = client.getConsent();
  if (consent) {
    releaseGatedScripts(consent.selection);
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLScriptElement && node.hasAttribute(GATED_CATEGORY_ATTR)) {
          const current = client.getConsent();
          if (current) releaseGatedScripts(current.selection);
          else if (node.type !== GATED_SCRIPT_TYPE) {
            const originalType = node.type;
            node.setAttribute("data-original-type", originalType);
            node.type = GATED_SCRIPT_TYPE;
          }
        }
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  client.onConsentChange((c) => releaseGatedScripts(c.selection));
}

// ---------------------------------------------------------------------------
// Consent Mode v2 bridge (dataLayer)
// ---------------------------------------------------------------------------

export function pushConsentMode(selection: ConsentSelection): void {
  try {
    const w = window as unknown as { dataLayer?: unknown[] };
    if (!Array.isArray(w.dataLayer)) return;
    const state = {
      ad_storage: selection.marketing ? "granted" : "denied",
      analytics_storage: selection.statistics ? "granted" : "denied",
      functionality_storage: selection.preferences ? "granted" : "denied",
      security_storage: "granted",
    };
    w.dataLayer.push({ event: "simplecookies_consent", consent: state });
    w.dataLayer.push(["consent", "update", state]);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Banner mount
// ---------------------------------------------------------------------------

function removeMount(): void {
  document.getElementById(MOUNT_ID)?.remove();
}

export function renderBanner(client: SimpleCookiesClient): () => void {
  const config = client.bannerConfig;
  let draft: ConsentSelection = {
    ...defaultConsentSelection(),
    ...client.getConsent()?.selection,
  };

  const mount = el("div", undefined, { id: MOUNT_ID, role: "dialog", "aria-live": "polite" });
  styleMount(mount, config);

  const title = el("div", config.title);
  title.style.fontWeight = "700";
  title.style.fontSize = "16px";
  title.style.marginBottom = "6px";
  mount.append(title);

  const text = el("div", config.text);
  mount.append(text);

  const prefs = el("div");
  prefs.style.marginTop = "10px";
  const toggles = new Map<keyof ConsentSelection, HTMLInputElement>();

  for (const key of CATEGORY_ORDER) {
    const cat = config.categories[key];
    if (!cat?.enabled && key !== "necessary") continue;
    const row = el("label");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.alignItems = "flex-start";
    row.style.marginTop = "6px";
    row.style.cursor = key === "necessary" ? "not-allowed" : "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = key === "necessary" ? true : Boolean(draft[key]);
    checkbox.disabled = key === "necessary";
    checkbox.style.marginTop = "3px";
    toggles.set(key, checkbox);
    checkbox.addEventListener("change", () => {
      draft = { ...draft, [key]: checkbox.checked } as ConsentSelection;
    });

    const labels = el("span");
    const labelText = el("strong", cat?.label || key);
    const desc = el("span", cat?.description || "");
    desc.style.opacity = "0.8";
    labels.append(labelText, document.createTextNode(" "), desc);
    row.append(checkbox, labels);
    prefs.append(row);
  }
  prefs.hidden = true;
  mount.append(prefs);

  const actions = el("div");
  actions.style.marginTop = "12px";

  let unregister: (() => void) | null = null;

  const onDone = () => {
    pushConsentMode(draft);
    removeMount();
  };

  const acceptBtn = button(config.acceptLabel, config.accent, true);
  acceptBtn.addEventListener("click", () => {
    draft = allGrantedSelection();
    void client.acceptAll().then(onDone).catch(onDone);
  });

  const rejectBtn = button(config.rejectLabel, config.accent, false);
  rejectBtn.addEventListener("click", () => {
    draft = defaultConsentSelection();
    void client.rejectAll().then(onDone).catch(onDone);
  });

  actions.append(acceptBtn, rejectBtn);

  if (config.showCustomize) {
    const customizeBtn = button(config.customizeLabel, config.accent, false);
    const saveBtn = button(config.saveLabel, config.accent, true);
    saveBtn.hidden = true;
    customizeBtn.addEventListener("click", () => {
      prefs.hidden = false;
      customizeBtn.hidden = true;
      saveBtn.hidden = false;
    });
    saveBtn.addEventListener("click", () => {
      draft = normalizeSelection(draft);
      void client.setConsent(draft).then(onDone).catch(onDone);
    });
    actions.append(customizeBtn, saveBtn);
  }

  mount.append(actions);

  if (config.showPoweredBy) {
    const powered = el("div", "Powered by SimpleCookies — free & unlimited");
    powered.style.marginTop = "10px";
    powered.style.fontSize = "11px";
    powered.style.opacity = "0.6";
    mount.append(powered);
  }

  removeMount();
  document.body.append(mount);

  // Keep draft in sync if consent changes elsewhere.
  unregister = client.onConsentChange((c) => {
    draft = c.selection;
    toggles.forEach((checkbox, key) => {
      checkbox.checked = key === "necessary" ? true : Boolean(c.selection[key]);
    });
  });

  return () => {
    unregister?.();
    removeMount();
  };
}

/** Auto-init for the CDN `<script data-api-key>` tag. */
export function autoInitFromScriptTag(): void {
  const script = document.currentScript as HTMLScriptElement | null;
  const apiKey =
    script?.getAttribute("data-api-key") ||
    script?.getAttribute("data-project") ||
    "";
  if (!apiKey) return;
  const apiUrl = script?.getAttribute("data-api-url") || undefined;
  const client = new SimpleCookiesClientImpl({ apiKey, apiUrl, autoMount: true });
  void (async () => {
    try {
      await client.fetchConfig();
      initScriptGating(client);
      client.startSync();
      const consent = client.getConsent();
      const currentClient = client;
      const show =
        !consent ||
        consent.policyVersion !== currentClient.bannerConfig.policyVersion;
      if (show) renderBanner(client);
      if (consent) pushConsentMode(consent.selection);
    } catch {
      // Offline mode: still gate scripts and show banner with defaults.
      initScriptGating(client);
      renderBanner(client);
    }
  })();
}

if (typeof document !== "undefined") {
  autoInitFromScriptTag();
}
