// PrismJS bootstrap module.
// We need the global `Prism` to exist BEFORE grammar component files execute,
// because they are self-invoking `(function(Prism){...})(Prism)` scripts.
//
// ES `import` declarations are hoisted, so we CANNOT set the global first
// and then import grammars with static imports — they'd run before our code.
//
// Vite doesn't support CJS `require()` in ESM modules either.
//
// Solution: We split this into two phases.
//   Phase 1 (this module top-level): import Prism core, set the global.
//   Phase 2 (loadGrammars): dynamically import grammar components.
//
// CodeHighlighter calls `await loadGrammars()` once before first use.

import PrismCore from "prismjs";

// Set the global immediately at module evaluation time.
if (typeof window !== "undefined") {
  (window as any).Prism = PrismCore;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).Prism = PrismCore;
}
if (typeof self !== "undefined") {
  (self as any).Prism = PrismCore;
}

let grammarsLoaded = false;
let loadPromise: Promise<void> | null = null;

export async function loadGrammars(): Promise<void> {
  if (typeof window !== "undefined") {
    (window as any).Prism = PrismCore;
  }
  if (typeof globalThis !== "undefined") {
    (globalThis as any).Prism = PrismCore;
  }
  if (typeof self !== "undefined") {
    (self as any).Prism = PrismCore;
  }

  if (grammarsLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Each dynamic import() is evaluated AFTER the module body above has run,
    // so `window.Prism` / `globalThis.Prism` is already set.
    await import("prismjs/components/prism-clike");
    await import("prismjs/components/prism-javascript");
    await import("prismjs/components/prism-typescript");
    await import("prismjs/components/prism-markup");
    await import("prismjs/components/prism-jsx");
    await import("prismjs/components/prism-tsx");
    await import("prismjs/components/prism-python");
    await import("prismjs/components/prism-bash");
    await import("prismjs/components/prism-json");
    await import("prismjs/components/prism-sql");
    await import("prismjs/components/prism-yaml");
    await import("prismjs/components/prism-markdown");
    await import("prismjs/components/prism-c");
    await import("prismjs/components/prism-cpp");
    await import("prismjs/components/prism-csharp");
    await import("prismjs/components/prism-rust");
    await import("prismjs/components/prism-go");
    await import("prismjs/components/prism-java");
    await import("prismjs/components/prism-diff");
    await import("prismjs/components/prism-docker");
    await import("prismjs/components/prism-lua");
    await import("prismjs/components/prism-graphql");

    grammarsLoaded = true;
  })();

  return loadPromise;
}

export const Prism = PrismCore;
export default PrismCore;
