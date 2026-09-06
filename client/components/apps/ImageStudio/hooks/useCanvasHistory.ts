import { useState, useCallback, useRef } from "react";
import { CanvasProject } from "../types";

const MAX_HISTORY = 40;

export function useCanvasHistory(initialProject: CanvasProject) {
  const [project, setProjectInternal] = useState<CanvasProject>(initialProject);
  const undoStack = useRef<CanvasProject[]>([]);
  const redoStack = useRef<CanvasProject[]>([]);
  const lastPushedTime = useRef<number>(0);

  const setProject = useCallback(
    (
      newProjectOrUpdater:
        | CanvasProject
        | ((prev: CanvasProject) => CanvasProject),
      recordHistory = true,
    ) => {
      setProjectInternal((prevProject) => {
        const nextProject =
          typeof newProjectOrUpdater === "function"
            ? newProjectOrUpdater(prevProject)
            : newProjectOrUpdater;

        if (recordHistory) {
          const now = Date.now();
          // Debounce rapid continuous property changes (e.g. slider drags within 150ms)
          if (now - lastPushedTime.current > 150) {
            undoStack.current = [
              ...undoStack.current.slice(-MAX_HISTORY + 1),
              prevProject,
            ];
            redoStack.current = [];
            lastPushedTime.current = now;
          }
        }

        return nextProject;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const previous = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);

    setProjectInternal((current) => {
      redoStack.current = [...redoStack.current, current];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);

    setProjectInternal((current) => {
      undoStack.current = [...undoStack.current, current];
      return next;
    });
  }, []);

  const resetHistory = useCallback((newInitialProject: CanvasProject) => {
    undoStack.current = [];
    redoStack.current = [];
    setProjectInternal(newInitialProject);
  }, []);

  return {
    project,
    setProject,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    resetHistory,
  };
}
