import React, { useRef, useState, useEffect } from "react";
import { Minus, Square, X, Move } from "lucide-react";
import { cn } from "@/lib/utils";

interface WindowFrameProps {
  id: string;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMove: (x: number, y: number) => void;
  onResize?: (width: number, height: number) => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({
  id,
  title,
  isOpen,
  isMinimized,
  x,
  y,
  width,
  height,
  zIndex,
  onFocus,
  onClose,
  onMinimize,
  onMove,
  onResize,
  children,
  icon,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0, startW: 0, startH: 0 });

  if (!isOpen || isMinimized) return null;

  const handleTitlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onFocus();
    setIsDragging(true);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: x,
      startY: y,
      startW: width,
      startH: height,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleTitlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.mouseX;
    const dy = e.clientY - dragStart.current.mouseY;
    onMove(Math.max(0, dragStart.current.startX + dx), Math.max(0, dragStart.current.startY + dy));
  };

  const handleTitlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onFocus();
    setIsResizing(true);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: x,
      startY: y,
      startW: width,
      startH: height,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing || !onResize) return;
    const dx = e.clientX - dragStart.current.mouseX;
    const dy = e.clientY - dragStart.current.mouseY;
    onResize(
      Math.max(340, dragStart.current.startW + dx),
      Math.max(220, dragStart.current.startH + dy)
    );
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    setIsResizing(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  return (
    <div
      onPointerDown={onFocus}
      className={cn(
        "absolute flex flex-col rounded-lg border shadow-2xl overflow-hidden select-none transition-shadow",
        "bg-slate-950/95 border-slate-700/80 backdrop-blur-md"
      )}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex,
      }}
    >
      {/* Window Header Title Bar */}
      <div
        onPointerDown={handleTitlePointerDown}
        onPointerMove={handleTitlePointerMove}
        onPointerUp={handleTitlePointerUp}
        onPointerCancel={handleTitlePointerUp}
        className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700/80 cursor-move text-xs font-semibold text-slate-200"
      >
        <div className="flex items-center gap-2 truncate">
          {icon}
          <span className="truncate">{title}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <button
            type="button"
            onClick={onMinimize}
            className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-red-900/80 text-slate-400 hover:text-red-200 rounded transition"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Window Body Content */}
      <div className="flex-1 overflow-hidden relative">{children}</div>

      {/* Bottom-right Resize Handle */}
      {onResize && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center opacity-60 hover:opacity-100 z-50"
          title="Resize"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" className="fill-slate-400">
            <circle cx="6" cy="6" r="1" />
            <circle cx="6" cy="3" r="1" />
            <circle cx="3" cy="6" r="1" />
          </svg>
        </div>
      )}
    </div>
  );
};
