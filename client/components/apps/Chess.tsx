import React, { useState, useEffect, useCallback, useRef } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { RotateCcw, BrainCircuit, Trophy, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Piece values for simple evaluation
const PIECE_VALUES: Record<string, number> = {
  p: 10,
  n: 30,
  b: 30,
  r: 50,
  q: 90,
  k: 900,
};

// Evaluate the board from Black's perspective (since AI plays Black)
function evaluateBoard(game: Chess): number {
  let totalEvaluation = 0;
  const board = game.board();
  
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        const val = PIECE_VALUES[piece.type] || 0;
        // AI plays Black, so Black pieces add to the score, White subtracts
        totalEvaluation += piece.color === 'b' ? val : -val;
      }
    }
  }
  return totalEvaluation;
}

// Simple 1-ply search to find the best move
function calculateBestMove(game: Chess): string {
  const possibleMoves = game.moves({ verbose: true }) as Move[];
  
  if (possibleMoves.length === 0) return "";
  
  let bestMove = possibleMoves[0];
  let bestValue = -9999;
  
  for (const move of possibleMoves) {
    game.move(move.san);
    
    // Evaluate the board after this move
    const boardValue = evaluateBoard(game);
    
    // Undo the move to restore state
    game.undo();
    
    // Add a tiny random value to break ties (makes it less deterministic)
    const randomValue = Math.random() * 0.1;
    
    if (boardValue + randomValue > bestValue) {
      bestValue = boardValue + randomValue;
      bestMove = move;
    }
  }
  
  return bestMove.san;
}

export function ChessApp() {
  const [game, setGame] = useState<Chess>(new Chess());
  const [gameStatus, setGameStatus] = useState<string>("White to move");
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [boardWidth, setBoardWidth] = useState(400);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle board resizing
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        // Max width 600px, min 280px
        setBoardWidth(Math.max(280, Math.min(600, width)));
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const updateStatus = useCallback((currentGame: Chess) => {
    if (currentGame.isCheckmate()) {
      setIsGameOver(true);
      setGameStatus(`Checkmate! ${currentGame.turn() === "w" ? "Black" : "White"} wins.`);
    } else if (currentGame.isDraw()) {
      setIsGameOver(true);
      if (currentGame.isStalemate()) {
        setGameStatus("Draw by stalemate.");
      } else if (currentGame.isThreefoldRepetition()) {
        setGameStatus("Draw by repetition.");
      } else if (currentGame.isInsufficientMaterial()) {
        setGameStatus("Draw by insufficient material.");
      } else {
        setGameStatus("Game drawn.");
      }
    } else {
      setIsGameOver(false);
      let statusText = currentGame.turn() === "w" ? "White to move" : "Black to move";
      if (currentGame.isCheck()) {
        statusText += " - Check!";
      }
      setGameStatus(statusText);
    }
  }, []);

  const makeMove = useCallback(
    (move: any) => {
      try {
        const gameCopy = new Chess(game.fen());
        const result = gameCopy.move(move);
        
        if (result) {
          setGame(gameCopy);
          updateStatus(gameCopy);
          return true;
        }
      } catch (e) {
        // Invalid move
      }
      return false;
    },
    [game, updateStatus]
  );

  // AI Move logic
  useEffect(() => {
    if (!isGameOver && game.turn() === "b") {
      const timer = setTimeout(() => {
        const gameCopy = new Chess(game.fen());
        const bestMove = calculateBestMove(gameCopy);
        
        if (bestMove) {
          makeMove(bestMove);
        }
      }, 500); // 500ms delay to feel more natural
      
      return () => clearTimeout(timer);
    }
  }, [game, isGameOver, makeMove]);

  function onDrop(sourceSquare: string, targetSquare: string, piece: string) {
    // Only allow white to move via drag and drop
    if (game.turn() === "b" || isGameOver) return false;

    const promotion = piece[1].toLowerCase() ?? "q";
    const success = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: promotion,
    });
    if (success) {
      setMoveFrom(null);
      setOptionSquares({});
    }
    return success;
  }

  function getMoveOptions(square: string) {
    const moves = game.moves({
      square: square as any,
      verbose: true,
    }) as Move[];
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, React.CSSProperties> = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as any) && game.get(move.to as any).color !== game.get(square as any)?.color
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
      return move;
    });
    newSquares[square] = {
      background: "rgba(255, 255, 0, 0.4)",
    };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClick(square: string) {
    if (game.turn() === "b" || isGameOver) return;

    if (!moveFrom) {
      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) setMoveFrom(square);
      return;
    }

    const moveOptions = game.moves({
      square: moveFrom as any,
      verbose: true,
    }) as Move[];

    const foundMove = moveOptions.find((m) => m.to === square);
    
    if (foundMove) {
      const success = makeMove({
        from: moveFrom,
        to: square,
        promotion: "q",
      });
      if (success) {
        setMoveFrom(null);
        setOptionSquares({});
      }
    } else {
      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) setMoveFrom(square);
      else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    }
  }

  function resetGame() {
    const newGame = new Chess();
    setGame(newGame);
    updateStatus(newGame);
    setIsGameOver(false);
    setMoveFrom(null);
    setOptionSquares({});
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-4xl mx-auto h-full w-full">
      <div className="flex items-center gap-3 mb-6">
        <BrainCircuit className="w-8 h-8 text-cyan-500" />
        <h1 className="text-3xl font-bold text-white tracking-tight">Play vs AI</h1>
      </div>

      <div className="grid md:grid-cols-12 gap-8 w-full">
        {/* Left Column: Game Info */}
        <div className="md:col-span-4 flex flex-col gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <span className="text-slate-400 font-medium">Status</span>
                <Badge 
                  variant="outline" 
                  className={
                    isGameOver 
                      ? "bg-red-500/10 text-red-400 border-red-500/20" 
                      : game.turn() === 'w' 
                        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  }
                >
                  {isGameOver ? "Game Over" : game.turn() === 'w' ? "Your Turn" : "AI Thinking..."}
                </Badge>
              </div>
              
              <div className="py-4 flex items-center gap-3">
                {isGameOver ? (
                  <Trophy className="w-6 h-6 text-yellow-500" />
                ) : game.isCheck() ? (
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                ) : null}
                <p className="text-lg font-semibold text-white">
                  {gameStatus}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <Button 
                  onClick={resetGame} 
                  variant="secondary" 
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white"
                >
                  <RotateCcw className="w-4 h-4" />
                  New Game
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-800 flex-grow">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Move History</h3>
              <div className="h-48 overflow-y-auto pr-2 custom-scrollbar">
                {game.history().length === 0 ? (
                  <p className="text-slate-600 text-center italic mt-10">No moves yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {game.history().reduce((result: any[], move, index) => {
                      if (index % 2 === 0) {
                        result.push([move]);
                      } else {
                        result[result.length - 1].push(move);
                      }
                      return result;
                    }, []).map((pair: string[], i: number) => (
                      <React.Fragment key={i}>
                        <div className="text-slate-300 font-mono"><span className="text-slate-600 w-6 inline-block">{i + 1}.</span> {pair[0]}</div>
                        <div className="text-cyan-400 font-mono">{pair[1] || ""}</div>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Board */}
        <div className="md:col-span-8 flex justify-center items-center" ref={containerRef}>
          <div 
            className="w-full rounded-lg overflow-hidden shadow-2xl border-4 border-slate-800" 
            style={{ maxWidth: boardWidth }}
          >
            <Chessboard 
              position={game.fen()} 
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              customSquareStyles={optionSquares}
              boardWidth={boardWidth}
              customDarkSquareStyle={{ backgroundColor: "#334155" }}
              customLightSquareStyle={{ backgroundColor: "#cbd5e1" }}
              arePremovesAllowed={false}
              isDraggablePiece={({ piece }) => piece[0] === 'w' && game.turn() === 'w' && !isGameOver}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
