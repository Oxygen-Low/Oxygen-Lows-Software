import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Trophy, Frown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSudoku } from "sudoku-gen";

type Difficulty = "easy" | "medium" | "hard" | "expert";

interface CellData {
  value: string;
  isInitial: boolean;
  isError: boolean;
}

export function SudokuApp() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [puzzle, setPuzzle] = useState("");
  const [solution, setSolution] = useState("");
  const [board, setBoard] = useState<CellData[]>([]);
  const [status, setStatus] = useState<"idle" | "playing" | "won">("idle");
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const initGame = useCallback(
    (diff: Difficulty = difficulty) => {
      const { puzzle: newPuzzle, solution: newSolution } = getSudoku(diff);
      setPuzzle(newPuzzle);
      setSolution(newSolution);

      const initialBoard = newPuzzle.split("").map((char) => ({
        value: char === "-" ? "" : char,
        isInitial: char !== "-",
        isError: false,
      }));

      setBoard(initialBoard);
      setStatus("playing");
      setSelectedCell(null);
    },
    [difficulty],
  );

  useEffect(() => {
    initGame(difficulty);
  }, [initGame, difficulty]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== "playing" || selectedCell === null) return;
      if (board[selectedCell].isInitial) return;

      if (e.key >= "1" && e.key <= "9") {
        updateCell(selectedCell, e.key);
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        updateCell(selectedCell, "");
      } else if (e.key.startsWith("Arrow")) {
        // Keyboard navigation
        e.preventDefault();
        const row = Math.floor(selectedCell / 9);
        const col = selectedCell % 9;
        let newRow = row;
        let newCol = col;

        if (e.key === "ArrowUp") newRow = Math.max(0, row - 1);
        if (e.key === "ArrowDown") newRow = Math.min(8, row + 1);
        if (e.key === "ArrowLeft") newCol = Math.max(0, col - 1);
        if (e.key === "ArrowRight") newCol = Math.min(8, col + 1);

        setSelectedCell(newRow * 9 + newCol);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, selectedCell, board]);

  const updateCell = (index: number, val: string) => {
    const newBoard = [...board];
    newBoard[index] = {
      ...newBoard[index],
      value: val,
      isError: val !== "" && val !== solution[index],
    };
    setBoard(newBoard);

    // Check win condition
    const isComplete = newBoard.every((cell, i) => cell.value === solution[i]);
    if (isComplete) {
      setStatus("won");
    }
  };

  const getCellClasses = (index: number) => {
    const row = Math.floor(index / 9);
    const col = index % 9;

    const isSelected = selectedCell === index;
    const isRelated =
      selectedCell !== null &&
      (Math.floor(selectedCell / 9) === row ||
        selectedCell % 9 === col ||
        (Math.floor(Math.floor(selectedCell / 9) / 3) === Math.floor(row / 3) &&
          Math.floor((selectedCell % 9) / 3) === Math.floor(col / 3)));

    const isSameValue =
      selectedCell !== null &&
      board[index].value !== "" &&
      board[selectedCell].value === board[index].value;

    const cell = board[index];

    return cn(
      "w-8 h-8 xs:w-9 xs:h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center text-sm sm:text-lg md:text-xl font-medium cursor-pointer transition-colors border-r border-b select-none touch-manipulation",
      // Thicker borders for 3x3 grids
      col % 3 === 2 && col !== 8 && "border-r-2 border-r-slate-400",
      row % 3 === 2 && row !== 8 && "border-b-2 border-b-slate-400",
      col === 8 && "border-r-transparent",
      row === 8 && "border-b-transparent",

      // Default cell styling
      "border-slate-700 bg-slate-900 text-slate-200",

      // Initial vs Input
      cell.isInitial && "text-slate-300 bg-slate-800/50",
      !cell.isInitial && "text-cyan-400",

      // Error
      cell.isError && "text-red-400 bg-red-950/30",

      // Interaction states
      isSelected && "bg-cyan-900/40 text-cyan-50",
      !isSelected && isSameValue && "bg-cyan-950/40",
      !isSelected && !isSameValue && isRelated && "bg-slate-800",
    );
  };

  return (
    <div className="flex flex-col items-center h-full w-full py-4 sm:py-8 text-slate-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-6 shadow-2xl flex flex-col max-w-[98%] sm:max-w-[95%] items-center w-full">
        {/* Header Controls */}
        <div className="flex w-full items-center justify-between mb-4 sm:mb-8 pb-4 sm:pb-6 border-b border-slate-800 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-500" />
            <h3 className="text-lg sm:text-xl font-bold text-white">Sudoku</h3>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="expert">Expert</option>
            </select>

            <button
              onClick={() => initGame()}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              title="New Game"
              aria-label="New Game"
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 hover:text-white" />
            </button>
          </div>
        </div>

        {/* Status indicator */}
        {status === "won" && (
          <div className="mb-4 sm:mb-6 flex items-center gap-2 text-yellow-400 bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20 animate-in fade-in zoom-in">
            <Trophy className="w-5 h-5" />
            <span className="font-bold">Puzzle Solved!</span>
          </div>
        )}

        {/* Board */}
        <div className="bg-slate-700 p-[2px] rounded-lg shadow-xl max-w-full overflow-hidden">
          <div className="grid grid-cols-9 bg-slate-800 rounded-md overflow-hidden">
            {board.map((cell, index) => (
              <div
                key={index}
                className={getCellClasses(index)}
                onClick={() => setSelectedCell(index)}
              >
                {cell.value}
              </div>
            ))}
          </div>
        </div>

        {/* On-Screen Number Keypad for Touch Devices */}
        <div className="mt-6 sm:mt-8 w-full max-w-[340px]">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  if (selectedCell !== null && !board[selectedCell].isInitial) {
                    updateCell(selectedCell, num.toString());
                  }
                }}
                className="bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 text-white rounded-lg h-11 sm:h-12 flex items-center justify-center font-bold text-lg sm:text-xl border border-slate-700 transition-colors"
              >
                {num}
              </button>
            ))}
            {[6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  if (selectedCell !== null && !board[selectedCell].isInitial) {
                    updateCell(selectedCell, num.toString());
                  }
                }}
                className="bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 text-white rounded-lg h-11 sm:h-12 flex items-center justify-center font-bold text-lg sm:text-xl border border-slate-700 transition-colors"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (selectedCell !== null && !board[selectedCell].isInitial) {
                  updateCell(selectedCell, "");
                }
              }}
              title="Clear selected cell"
              aria-label="Clear selected cell"
              className="bg-red-950/50 hover:bg-red-900/50 active:bg-red-800 text-red-300 rounded-lg h-11 sm:h-12 flex items-center justify-center font-bold text-xs sm:text-sm border border-red-900/50 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
