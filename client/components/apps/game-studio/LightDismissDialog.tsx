import React, { useEffect, useRef } from "react";

export interface LightDismissDialogProps {
  open: boolean;
  onClose: () => void;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Native <dialog closedby="any"> modal component opened via showModal()
 * with the bounding-rect light-dismiss fallback for browsers without HTMLDialogElement.prototype.closedBy.
 */
export const LightDismissDialog: React.FC<LightDismissDialogProps> = ({
  open,
  onClose,
  ariaLabelledBy,
  ariaLabel,
  className = "",
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          try {
            dialog.showModal();
          } catch {
            dialog.setAttribute("open", "");
          }
        } else {
          dialog.setAttribute("open", "");
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      onClose();
    };

    dialog.addEventListener("close", handleNativeClose);

    // Fallback for browsers without closedby support
    const hasClosedBySupport =
      typeof HTMLDialogElement !== "undefined" &&
      "closedBy" in HTMLDialogElement.prototype;

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (isDialogContent) return;
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        onClose();
      }
    };

    if (!hasClosedBySupport) {
      dialog.addEventListener("click", handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener("close", handleNativeClose);
      if (!hasClosedBySupport) {
        dialog.removeEventListener("click", handleBackdropClick);
      }
    };
  }, [onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as any)}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      className={`backdrop:bg-black/70 backdrop:backdrop-blur-sm bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl p-0 shadow-2xl max-w-4xl w-[94vw] max-h-[92vh] overflow-hidden ${className}`}
    >
      {children}
    </dialog>
  );
};
