import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Trophy, RefreshCcw, CheckCircle2, ArrowRight, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

type Direction = "across" | "down";

interface CellData {
  solution: string;
  number?: number;
  isBlack?: boolean;
}

const PUZZLE_SIZE = 5;

const PUZZLE_DATA: CellData[][] = [
  [{ solution: "W", number: 1 }, { solution: "A", number: 2 }, { solution: "T", number: 3 }, { solution: "E", number: 4 }, { solution: "R", number: 5 }],
  [{ solution: "A", number: 6 }, { solution: "L" }, { solution: "I" }, { solution: "V" }, { solution: "E" }],
  [{ solution: "T", number: 7 }, { solution: "I" }, { solution: "M" }, { solution: "E" }, { solution: "S" }],
  [{ solution: "E", number: 8 }, { solution: "V" }, { solution: "E" }, { solution: "N" }, { solution: "T" }],
  [{ solution: "R", number: 9 }, { solution: "E" }, { solution: "S" }, { solution: "T" }, { solution: "S" }]
];

interface Clue {
  number: number;
  clue: string;
  row: number;
  col: number;
  length: number;
}

const CLUES: { across: Clue[]; down: Clue[] } = {
  across: [
    { number: 1, clue: "Clear liquid", row: 0, col: 0, length: 5 },
    { number: 6, clue: "Not dead", row: 1, col: 0, length: 5 },
    { number: 7, clue: "Multiplies", row: 2, col: 0, length: 5 },
    { number: 8, clue: "A planned public or social occasion", row: 3, col: 0, length: 5 },
    { number: 9, clue: "Takes a break", row: 4, col: 0, length: 5 }
  ],
  down: [
    { number: 1, clue: "Clear liquid", row: 0, col: 0, length: 5 },
    { number: 2, clue: "Not dead", row: 0, col: 1, length: 5 },
    { number: 3, clue: "Multiplies", row: 0, col: 2, length: 5 },
    { number: 4, clue: "A planned public or social occasion", row: 0, col: 3, length: 5 },
    { number: 5, clue: "Takes a break", row: 0, col: 4, length: 5 }
  ]
};

export const CrosswordApp: React.FC = () => {
  const [gridState, setGridState] = useState<string[][]>(
    Array(PUZZLE_SIZE).fill(null).map(() => Array(PUZZLE_SIZE).fill(""))
  );
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
  const [direction, setDirection] = useState<Direction>("across");
  const [isWon, setIsWon] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[][]>(
    Array(PUZZLE_SIZE).fill(null).map(() => Array(PUZZLE_SIZE).fill(null))
  );

  useEffect(() => {
    checkWinCondition();
  }, [gridState]);

  const checkWinCondition = () => {
    let won = true;
    for (let r = 0; r < PUZZLE_SIZE; r++) {
      for (let c = 0; c < PUZZLE_SIZE; c++) {
        const cell = PUZZLE_DATA[r][c];
        if (!cell.isBlack) {
          if (gridState[r][c].toUpperCase() !== cell.solution.toUpperCase()) {
            won = false;
            break;
          }
        }
      }
      if (!won) break;
    }
    if (won && !isWon) {
      setIsWon(true);
    }
  };

  const getActiveWordCells = (): { r: number; c: number }[] => {
    if (!selectedCell) return [];
    const cells = [];
    let { r, c } = selectedCell;

    if (direction === "across") {
      // Go left to find start
      let startC = c;
      while (startC > 0 && !PUZZLE_DATA[r][startC - 1].isBlack) {
        startC--;
      }
      // Collect cells going right
      let currentC = startC;
      while (currentC < PUZZLE_SIZE && !PUZZLE_DATA[r][currentC].isBlack) {
        cells.push({ r, c: currentC });
        currentC++;
      }
    } else {
      // Go up to find start
      let startR = r;
      while (startR > 0 && !PUZZLE_DATA[startR - 1][c].isBlack) {
        startR--;
      }
      // Collect cells going down
      let currentR = startR;
      while (currentR < PUZZLE_SIZE && !PUZZLE_DATA[currentR][c].isBlack) {
        cells.push({ r: currentR, c });
        currentR++;
      }
    }
    return cells;
  };

  const activeWordCells = getActiveWordCells();
  const isActiveCell = (r: number, c: number) => activeWordCells.some(cell => cell.r === r && cell.c === c);

  const getActiveClue = () => {
    if (!selectedCell || activeWordCells.length === 0) return null;
    const firstCell = activeWordCells[0];
    const clues = CLUES[direction];
    return clues.find(clue => clue.row === firstCell.r && clue.col === firstCell.c);
  };

  const handleCellClick = (r: number, c: number) => {
    if (PUZZLE_DATA[r][c].isBlack) return;
    
    if (selectedCell?.r === r && selectedCell?.c === c) {
      setDirection(prev => prev === "across" ? "down" : "across");
    } else {
      setSelectedCell({ r, c });
    }
    
    inputRefs.current[r][c]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      
      const newGrid = [...gridState];
      if (newGrid[r][c] !== "") {
        newGrid[r][c] = "";
        setGridState(newGrid);
      } else {
        // Move back
        moveToNextCell(r, c, -1);
      }
    } else if (e.key === "ArrowRight") {
      if (direction === "across") moveToNextCell(r, c, 1);
      else { setDirection("across"); moveToNextCell(r, c, 1); }
    } else if (e.key === "ArrowLeft") {
      if (direction === "across") moveToNextCell(r, c, -1);
      else { setDirection("across"); moveToNextCell(r, c, -1); }
    } else if (e.key === "ArrowDown") {
      if (direction === "down") moveToNextCell(r, c, 1);
      else { setDirection("down"); moveToNextCell(r, c, 1); }
    } else if (e.key === "ArrowUp") {
      if (direction === "down") moveToNextCell(r, c, -1);
      else { setDirection("down"); moveToNextCell(r, c, -1); }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, r: number, c: number) => {
    const val = e.target.value.slice(-1).toUpperCase(); // Take only the last typed character
    if (!/^[A-Z]*$/.test(val)) return;

    const newGrid = [...gridState];
    newGrid[r][c] = val;
    setGridState(newGrid);

    if (val !== "") {
      moveToNextCell(r, c, 1);
    }
  };

  const moveToNextCell = (r: number, c: number, step: number) => {
    let nextR = r;
    let nextC = c;

    if (direction === "across") {
      nextC += step;
      if (nextC >= PUZZLE_SIZE || nextC < 0 || PUZZLE_DATA[nextR][nextC].isBlack) return;
    } else {
      nextR += step;
      if (nextR >= PUZZLE_SIZE || nextR < 0 || PUZZLE_DATA[nextR][nextC].isBlack) return;
    }

    setSelectedCell({ r: nextR, c: nextC });
    inputRefs.current[nextR][nextC]?.focus();
  };

  const resetGame = () => {
    setGridState(Array(PUZZLE_SIZE).fill(null).map(() => Array(PUZZLE_SIZE).fill("")));
    setSelectedCell(null);
    setDirection("across");
    setIsWon(false);
  };

  const activeClue = getActiveClue();

  return (
    <div className="flex flex-col h-full bg-slate-950 p-4 md:p-8 rounded-xl relative overflow-hidden text-slate-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Crossword
            {isWon && <CheckCircle2 className="text-cyan-400 w-8 h-8" />}
          </h2>
          <p className="text-slate-400 text-sm mt-1">Complete the grid to win</p>
        </div>
        <Button 
          variant="outline" 
          onClick={resetGame}
          className="border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <RefreshCcw className="w-4 h-4 mr-2" />
          Reset
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
        
        {/* Puzzle Board Container */}
        <div className="flex-1 flex flex-col items-center justify-start lg:justify-center">
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-2xl">
            <div 
              className="grid gap-0 border-t-2 border-l-2 border-slate-700 bg-slate-700" 
              style={{ gridTemplateColumns: `repeat(${PUZZLE_SIZE}, minmax(0, 1fr))` }}
            >
              {PUZZLE_DATA.map((row, r) => (
                row.map((cell, c) => (
                  <div 
                    key={`${r}-${c}`}
                    className={cn(
                      "w-10 h-10 md:w-14 md:h-14 lg:w-16 lg:h-16 relative border-r-2 border-b-2 border-slate-700 transition-colors",
                      cell.isBlack ? "bg-slate-950" : "bg-white",
                      isActiveCell(r, c) && !cell.isBlack && "bg-cyan-100",
                      selectedCell?.r === r && selectedCell?.c === c && !cell.isBlack && "bg-cyan-300"
                    )}
                    onClick={() => handleCellClick(r, c)}
                  >
                    {!cell.isBlack && (
                      <>
                        {cell.number && (
                          <span className="absolute top-0.5 left-1 text-[9px] md:text-[11px] font-semibold text-slate-800 select-none z-10">
                            {cell.number}
                          </span>
                        )}
                        <input
                          ref={(el) => { inputRefs.current[r][c] = el; }}
                          type="text"
                          maxLength={1}
                          value={gridState[r][c]}
                          onChange={(e) => handleChange(e, r, c)}
                          onKeyDown={(e) => handleKeyDown(e, r, c)}
                          onFocus={() => {
                            if (selectedCell?.r !== r || selectedCell?.c !== c) {
                              setSelectedCell({ r, c });
                            }
                          }}
                          className={cn(
                            "absolute inset-0 w-full h-full text-center bg-transparent border-none focus:outline-none focus:ring-0",
                            "text-xl md:text-2xl font-bold uppercase text-slate-900 caret-transparent cursor-pointer",
                            isWon && "text-cyan-600"
                          )}
                          disabled={isWon}
                        />
                      </>
                    )}
                  </div>
                ))
              ))}
            </div>
          </div>
          
          {/* Active Clue Banner (Mobile mainly) */}
          <div className="mt-6 w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-lg p-4 text-center min-h-[80px] flex items-center justify-center">
            {activeClue ? (
              <div>
                <span className="font-bold text-cyan-400 mr-2">
                  {activeClue.number} {direction.toUpperCase()}:
                </span>
                <span className="text-white text-lg">{activeClue.clue}</span>
              </div>
            ) : (
              <span className="text-slate-500 italic">Select a cell to view clue</span>
            )}
          </div>
        </div>

        {/* Clues Sidebar */}
        <div className="w-full lg:w-80 flex flex-col gap-6 h-[400px] lg:h-auto">
          {["across", "down"].map((dir) => (
            <Card key={dir} className="flex-1 flex flex-col bg-slate-900 border-slate-800 overflow-hidden">
              <div className="p-4 bg-slate-800/50 border-b border-slate-800 font-bold text-white capitalize flex items-center gap-2">
                {dir === "across" ? <ArrowRight className="w-4 h-4 text-cyan-400" /> : <ArrowDown className="w-4 h-4 text-cyan-400" />}
                {dir}
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 pr-4">
                  {CLUES[dir as Direction].map((clue) => (
                    <div 
                      key={clue.number}
                      className={cn(
                        "text-sm p-2 rounded cursor-pointer transition-colors flex gap-3",
                        activeClue?.number === clue.number && direction === dir
                          ? "bg-cyan-950 text-cyan-100 border border-cyan-800"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-300 border border-transparent"
                      )}
                      onClick={() => {
                        setDirection(dir as Direction);
                        setSelectedCell({ r: clue.row, c: clue.col });
                        inputRefs.current[clue.row][clue.col]?.focus();
                      }}
                    >
                      <span className="font-bold text-slate-500 shrink-0">{clue.number}</span>
                      <span>{clue.clue}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          ))}
        </div>
        
      </div>

      {isWon && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-300">
            <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
            <h3 className="text-3xl font-bold text-white mb-2">You Won!</h3>
            <p className="text-slate-400 mb-8">Great job completing the crossword puzzle.</p>
            <Button 
              onClick={resetGame} 
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-6 text-lg rounded-xl"
            >
              Play Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
