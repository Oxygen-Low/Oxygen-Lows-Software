/**
 * Run a callback once the browser is idle (or shortly after first paint on
 * browsers without requestIdleCallback). Used to defer non-critical work such
 * as sidebar data fetches and polling so it never competes with the initial
 * route render for bandwidth or main-thread time.
 */
export function runWhenIdle(callback: () => void, timeout = 1500): () => void {
  if (typeof window === "undefined") {
    callback();
    return () => {};
  }

  const ric = (window as any).requestIdleCallback as
    ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
  const cic = (window as any).cancelIdleCallback as
    ((id: number) => void) | undefined;

  if (typeof ric === "function") {
    const id = ric(callback, { timeout });
    return () => cic?.(id);
  }

  const id = window.setTimeout(callback, 200);
  return () => window.clearTimeout(id);
}
