import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { clamp } from "./constants";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  defaultValue?: number;
  /** Use logarithmic scaling (e.g. frequency). */
  log?: boolean;
  step?: number;
  size?: number;
  color?: string;
  format?: (value: number) => string;
  hideLabel?: boolean;
  className?: string;
}

/** Rotary knob: drag vertically, scroll, or use arrow keys. Double-click resets. */
export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  onChange,
  defaultValue,
  log = false,
  step,
  size = 36,
  color = "#22d3ee",
  format,
  hideLabel,
  className,
}) => {
  const drag = useRef<{ y: number; norm: number } | null>(null);
  const toNorm = (v: number) =>
    log ? Math.log(clamp(v, min, max) / min) / Math.log(max / min) : (clamp(v, min, max) - min) / (max - min);
  const fromNorm = (n: number) => {
    const c = clamp(n, 0, 1);
    let v = log ? min * Math.pow(max / min, c) : min + c * (max - min);
    if (step) v = Math.round(v / step) * step;
    return clamp(v, min, max);
  };
  const norm = toNorm(value);
  const angle = -135 + norm * 270;

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, norm };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const range = e.shiftKey ? 800 : 160;
    const n = drag.current.norm + (drag.current.y - e.clientY) / range;
    onChange(fromNorm(n));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.shiftKey ? 0.01 : 0.05;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(fromNorm(norm + delta));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(fromNorm(norm - delta));
    } else if (e.key === "Home") {
      onChange(min);
    } else if (e.key === "End") {
      onChange(max);
    }
  };

  const display = format ? format(value) : value.toFixed(2);
  const r = size / 2 - 3;
  const arc = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [size / 2 + r * Math.cos(rad), size / 2 + r * Math.sin(rad)];
  };
  const [sx, sy] = arc(-135);
  const [ex, ey] = arc(angle);
  const large = angle - -135 > 180 ? 1 : 0;

  return (
    <div className={cn("flex flex-col items-center gap-0.5 select-none", className)} title={`${label}: ${display}`}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(4))}
        aria-valuetext={display}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onKeyDown={onKeyDown}
        onWheel={(e) => onChange(fromNorm(norm + (e.deltaY < 0 ? 0.03 : -0.03)))}
        className="cursor-ns-resize rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-none"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="#0f172a" stroke="#334155" strokeWidth={3} />
          {norm > 0.001 && (
            <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
          )}
          <line
            x1={size / 2}
            y1={size / 2}
            x2={size / 2 + (r - 4) * Math.cos(((angle - 90) * Math.PI) / 180)}
            y2={size / 2 + (r - 4) * Math.sin(((angle - 90) * Math.PI) / 180)}
            stroke="#e2e8f0"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      {!hideLabel && (
        <>
          <span className="text-[10px] uppercase tracking-wide text-slate-400 leading-none text-center max-w-[72px] truncate">{label}</span>
          <span className="text-[10px] text-slate-500 font-mono leading-none">{display}</span>
        </>
      )}
    </div>
  );
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  closeLabel: string;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, footer, wide, closeLabel }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl",
          wide ? "max-w-4xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const ToggleButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; activeClass?: string }
> = ({ active, activeClass = "bg-cyan-500 text-slate-950", className, children, ...rest }) => (
  <button
    type="button"
    aria-pressed={active}
    className={cn(
      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase transition-colors",
      active ? activeClass : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
      className,
    )}
    {...rest}
  >
    {children}
  </button>
);

export const fmtPercent = (v: number) => `${Math.round(v * 100)}%`;
export const fmtPan = (v: number) => (Math.abs(v) < 0.02 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`);
export const fmtHz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
export const fmtDb = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`;
export const fmtSec = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`);
