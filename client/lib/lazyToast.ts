import type { ExternalToast } from "sonner";

type ToastFn = (
  message: string,
  data?: ExternalToast,
) => void | string | number;

type ToastMethod = "message" | "info" | "error" | "success" | "warning" | "loading";

let toastPromise: Promise<{
  default: typeof import("sonner").toast;
}> | null = null;

function getToast() {
  if (!toastPromise) {
    toastPromise = import("sonner").then((m) => ({ default: m.toast }));
  }
  return toastPromise;
}

/**
 * Fire-and-forget toast helper that keeps `sonner` out of the initial bundle.
 * Delegates to the matching `sonner` toast method so the toast keeps its
 * semantic type (info/error/success/...) instead of becoming a plain message.
 */
export function notify(
  message: string,
  data?: ExternalToast,
  method: ToastMethod = "message",
): void {
  void getToast().then(({ default: toast }) => {
    const toastFn = (toast[method] ?? toast.message) as ToastFn;
    toastFn(message, data);
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
  (message: string, data?: ExternalToast) => notify(message, data, "message"),
  {
    info: ((message, data) => notify(message, data, "info")) as ToastFn,
    error: ((message, data) => notify(message, data, "error")) as ToastFn,
    success: ((message, data) => notify(message, data, "success")) as ToastFn,
    warning: ((message, data) => notify(message, data, "warning")) as ToastFn,
    loading: ((message, data) => notify(message, data, "loading")) as ToastFn,
  },
);
