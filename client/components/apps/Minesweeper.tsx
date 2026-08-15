import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Flag, Bomb, Frown, Smile, Trophy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Difficulty = "beginner" | "intermediate" | "expert" | "insane";

interface LevelConfig {
  name: string;
  rows: number;
  cols: number;
  mines: number;
}

const LEVELS: Record<Difficulty, LevelConfig> = {
  beginner: { name: "Beginner", rows: 9, cols: 9, mines: 10 },
  intermediate: { name: "Intermediate", rows: 16, cols: 16, mines: 40 },
  expert: { name: "Expert", rows: 16, cols: 30, mines: 99 },
  insane: { name: "Insane", rows: 100, cols: 100, mines: 2000 },
};

interface CellData {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
}

const Cell = React.memo(
  ({
    data,
    onClick,
    onContextMenu,
    onDoubleClick,
  }: {
    data: CellData;
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDoubleClick: () => void;
  }) => {
    return (
      <div
        className={cn(
          "w-6 h-6 flex items-center justify-center text-sm font-bold cursor-pointer select-none border transition-colors",
          data.isRevealed
            ? "bg-slate-800 border-slate-700"
            : "bg-slate-700 border-slate-500 hover:bg-slate-600",
          data.isRevealed && data.isMine && "bg-red-500/20 border-red-500/50"
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        {data.isRevealed ? (
          data.isMine ? (
            <Bomb className="w-4 h-4 text-red-500" />
          ) : data.neighborMines > 0 ? (
            <span
              className={cn(
                data.neighborMines === 1 && "text-blue-400",
                data.neighborMines === 2 && "text-green-400",
                data.neighborMines === 3 && "text-red-400",
                data.neighborMines === 4 && "text-purple-400",
                data.neighborMines === 5 && "text-yellow-400",
                data.neighborMines === 6 && "text-cyan-400",
                data.neighborMines === 7 && "text-orange-400",
                data.neighborMines === 8 && "text-pink-400"
              )}
            >
              {data.neighborMines}
            </span>
          ) : null
        ) : data.isFlagged ? (
          <Flag className="w-4 h-4 text-red-500" />
        ) : null}
      </div>
    );
  }
);

export function MinesweeperApp() {
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [board, setBoard] = useState<CellData[]>([]);
  const [status, setStatus] = useState<"idle" | "playing" | "won" | "lost">("idle");
  const [flags, setFlags] = useState(0);
  const [time, setTime] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);

  const config = LEVELS[difficulty];
  const { rows, cols, mines } = config;

  // Initialize empty board
  const initBoard = useCallback(() => {
    const newBoard = Array(rows * cols)
      .fill(null)
      .map(() => ({
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborMines: 0,
      }));
    setBoard(newBoard);
    setStatus("idle");
    setFlags(0);
    setTime(0);
    setRevealedCount(0);
  }, [rows, cols]);

  useEffect(() => {
    initBoard();
  }, [initBoard]);

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "playing") {
      interval = setInterval(() => {
        setTime((t) => Math.min(t + 1, 999));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const getNeighbors = (index: number, totalRows: number, totalCols: number) => {
    const r = Math.floor(index / totalCols);
    const c = index % totalCols;
    const neighbors: number[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < totalRows && nc >= 0 && nc < totalCols) {
          neighbors.push(nr * totalCols + nc);
        }
      }
    }
    return neighbors;
  };

  const placeMines = (firstClickIndex: number, currentBoard: CellData[]) => {
    const safeZone = new Set([
      firstClickIndex,
      ...getNeighbors(firstClickIndex, rows, cols),
    ]);
    
    let minesPlaced = 0;
    while (minesPlaced < mines) {
      const idx = Math.floor(Math.random() * (rows * cols));
      if (!currentBoard[idx].isMine && !safeZone.has(idx)) {
        currentBoard[idx].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate neighbor mines
    for (let i = 0; i < rows * cols; i++) {
      if (!currentBoard[i].isMine) {
        let count = 0;
        const neighbors = getNeighbors(i, rows, cols);
        for (const n of neighbors) {
          if (currentBoard[n].isMine) count++;
        }
        currentBoard[i].neighborMines = count;
      }
    }
  };

  const handleCellClick = (index: number) => {
    if (status === "won" || status === "lost" || board[index].isFlagged || board[index].isRevealed) {
      return;
    }

    let newBoard = [...board];
    let currentStatus = status;
    let currentRevealedCount = revealedCount;

    if (currentStatus === "idle") {
      placeMines(index, newBoard);
      currentStatus = "playing";
      setStatus("playing");
    }

    if (newBoard[index].isMine) {
      // Game over
      newBoard.forEach((cell) => {
        if (cell.isMine) cell.isRevealed = true;
      });
      setBoard(newBoard);
      setStatus("lost");
      return;
    }

    // Flood fill to reveal connected empty cells
    const queue = [index];
    const visited = new Set([index]);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (!newBoard[curr].isRevealed && !newBoard[curr].isFlagged) {
        newBoard[curr].isRevealed = true;
        currentRevealedCount++;
        
        if (newBoard[curr].neighborMines === 0) {
          const neighbors = getNeighbors(curr, rows, cols);
          for (const n of neighbors) {
            if (!visited.has(n)) {
              visited.add(n);
              queue.push(n);
            }
          }
        }
      }
    }

    setBoard(newBoard);
    setRevealedCount(currentRevealedCount);

    if (currentRevealedCount === rows * cols - mines) {
      setStatus("won");
      // Flag all remaining mines
      setBoard((prev) =>
        prev.map((c) => (c.isMine && !c.isFlagged ? { ...c, isFlagged: true } : c))
      );
      setFlags(mines);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    if (status === "won" || status === "lost" || board[index].isRevealed) {
      return;
    }

    const newBoard = [...board];
    const cell = newBoard[index];

    if (!cell.isFlagged && flags < mines) {
      cell.isFlagged = true;
      setFlags((f) => f + 1);
    } else if (cell.isFlagged) {
      cell.isFlagged = false;
      setFlags((f) => f - 1);
    }

    setBoard(newBoard);
  };

  const handleDoubleClick = (index: number) => {
    if (status !== "playing" || !board[index].isRevealed || board[index].neighborMines === 0) {
      return;
    }

    const neighbors = getNeighbors(index, rows, cols);
    const flaggedCount = neighbors.filter((n) => board[n].isFlagged).length;

    if (flaggedCount === board[index].neighborMines) {
      let hitMine = false;
      let newBoard = [...board];
      let currentRevealedCount = revealedCount;

      const queue: number[] = [];
      const visited = new Set<number>();

      neighbors.forEach((n) => {
        if (!newBoard[n].isRevealed && !newBoard[n].isFlagged) {
          if (newBoard[n].isMine) {
            hitMine = true;
          } else {
            queue.push(n);
            visited.add(n);
          }
        }
      });

      if (hitMine) {
        newBoard.forEach((cell) => {
          if (cell.isMine) cell.isRevealed = true;
        });
        setBoard(newBoard);
        setStatus("lost");
        return;
      }

      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (!newBoard[curr].isRevealed && !newBoard[curr].isFlagged) {
          newBoard[curr].isRevealed = true;
          currentRevealedCount++;
          
          if (newBoard[curr].neighborMines === 0) {
            const nextNeighbors = getNeighbors(curr, rows, cols);
            for (const n of nextNeighbors) {
              if (!visited.has(n)) {
                visited.add(n);
                queue.push(n);
              }
            }
          }
        }
      }

      setBoard(newBoard);
      setRevealedCount(currentRevealedCount);

      if (currentRevealedCount === rows * cols - mines) {
        setStatus("won");
        setBoard((prev) =>
          prev.map((c) => (c.isMine && !c.isFlagged ? { ...c, isFlagged: true } : c))
        );
        setFlags(mines);
      }
    }
  };

  return (
    <div className="flex flex-col items-center h-full w-full py-8 text-slate-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col max-w-[95%] max-h-full overflow-hidden">
        
        {/* Header Controls */}
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-800 shrink-0 gap-4 flex-wrap">
          <div className="flex flex-col items-center gap-1 min-w-[80px] bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Mines</span>
            <span className="text-2xl font-mono text-red-500">
              {(mines - flags).toString().padStart(3, "0")}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={initBoard}
              className="p-3 rounded-full hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 group focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {status === "lost" ? (
                <Frown className="w-8 h-8 text-red-400 group-hover:scale-110 transition-transform" />
              ) : status === "won" ? (
                <Trophy className="w-8 h-8 text-yellow-400 group-hover:scale-110 transition-transform" />
              ) : (
                <Smile className="w-8 h-8 text-cyan-400 group-hover:scale-110 transition-transform" />
              )}
            </button>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {Object.entries(LEVELS).map(([key, lvl]) => (
                <option key={key} value={key}>
                  {lvl.name} ({lvl.cols}x{lvl.rows})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col items-center gap-1 min-w-[80px] bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Time</span>
            <span className="text-2xl font-mono text-cyan-500">
              {time.toString().padStart(3, "0")}
            </span>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 min-h-0 relative">
          <div
            className="grid gap-[1px] mx-auto bg-slate-800"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              width: "max-content",
            }}
          >
            {board.map((cell, index) => (
              <Cell
                key={index}
                data={cell}
                onClick={() => handleCellClick(index)}
                onContextMenu={(e) => handleContextMenu(e, index)}
                onDoubleClick={() => handleDoubleClick(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
