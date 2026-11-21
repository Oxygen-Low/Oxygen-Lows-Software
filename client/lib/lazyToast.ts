import type { ExternalToast } from "sonner";

type ToastFn = (
  message: string,
  data?: ExternalToast,
) => void | string | number;

let toastPromise: Promise<{
  default: typeof import("sonner").toast;
}> | null = null;

function getToast() {
  if (!toastPromise) {
    toastPromise = import("sonner").then((m) => ({ default: m.toast }));
  }
  return toastPromise;
}

/** Fire-and-forget toast helper that keeps `sonner` out of the initial bundle. */
export function notify(message: string, data?: ExternalToast): void {
  void getToast().then(({ default: toast }) => {
    toast(message, data);
  });
}

export interface LazyToast {
  (message: string, data?: ExternalToast): void;
  info: ToastFn;
  error: ToastFn;
  success: ToastFn;
  warning: ToastFn;
  loading: ToastFn;
}

/**
 * A drop-in `toast`-shaped object. Methods are async under the hood (the
 * module is loaded on first use) but return void so callers cannot rely on a
 * synchronous dismiss id — no entry-level caller does.
 */
export const lazyToast: LazyToast = Object.assign(
  (message: string, data?: ExternalToast) => notify(message, data),
  {
    info: ((message, data) => notify(message, data)) as ToastFn,
    error: ((message, data) => notify(message, data)) as ToastFn,
    success: ((message, data) => notify(message, data)) as ToastFn,
    warning: ((message, data) => notify(message, data)) as ToastFn,
    loading: ((message, data) => notify(message, data)) as ToastFn,
  },
);
