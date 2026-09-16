import React, { useState, useEffect, useCallback, useRef } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { RotateCcw, Sparkles, Trophy, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/contexts/LanguageContext";

// Piece values for simple evaluation
const PIECE_VALUES: Record<string, number> = {
  p: 10,
  n: 30,
  b: 30,
  r: 50,
  q: 90,
  k: 900,
};

// Evaluate the board from AI's perspective
function evaluateBoard(game: Chess, aiColor: "w" | "b"): number {
  if (game.isCheckmate()) {
    return game.turn() === aiColor ? -10000 : 10000;
  }
  if (game.isDraw()) {
    return 0;
  }
  let totalEvaluation = 0;
  const board = game.board();

  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const piece = board[i][j];
      if (piece) {
        const val = PIECE_VALUES[piece.type] || 0;
        // AI color pieces add to the score, opponent subtracts
        totalEvaluation += piece.color === aiColor ? val : -val;
      }
    }
  }
  return totalEvaluation;
}

// Simple 1-ply search to find the best move
function calculateBestMove(game: Chess, aiColor: "w" | "b"): string {
  const possibleMoves = game.moves({ verbose: true }) as Move[];

  if (possibleMoves.length === 0) return "";

  let bestMove = possibleMoves[0];
  let bestValue = -99999;

  for (const move of possibleMoves) {
    game.move(move.san);

    // Evaluate the board after this move
    const boardValue = evaluateBoard(game, aiColor);

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
  const { t } = useTranslation();
  const [game, setGame] = useState<Chess>(() => new Chess());
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [gameStatus, setGameStatus] = useState<string>("");
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [boardWidth, setBoardWidth] = useState(400);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<
    Record<string, React.CSSProperties>
  >({});
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

  const updateStatus = useCallback(
    (currentGame: Chess) => {
      if (currentGame.isCheckmate()) {
        setIsGameOver(true);
        const winner =
          currentGame.turn() === "w"
            ? t("games.chessBlackWins")
            : t("games.chessWhiteWins");
        setGameStatus(winner);
      } else if (currentGame.isDraw()) {
        setIsGameOver(true);
        if (currentGame.isStalemate()) {
          setGameStatus(t("games.chessDrawStalemate"));
        } else if (currentGame.isThreefoldRepetition()) {
          setGameStatus(t("games.chessDrawRepetition"));
        } else if (currentGame.isInsufficientMaterial()) {
          setGameStatus(t("games.chessDrawMaterial"));
        } else {
          setGameStatus(t("games.chessDraw"));
        }
      } else {
        setIsGameOver(false);
        let statusText =
          currentGame.turn() === "w"
            ? t("games.chessWhiteToMove")
            : t("games.chessBlackToMove");
        if (currentGame.isCheck()) {
          statusText += ` - ${t("games.chessCheck")}`;
        }
        setGameStatus(statusText);
      }
    },
    [t],
  );

  useEffect(() => {
    updateStatus(game);
  }, [updateStatus, game]);

  const makeMove = useCallback(
    (move: any) => {
      try {
        const gameCopy = new Chess();
        if (game.history().length > 0) {
          gameCopy.loadPgn(game.pgn());
        }
        const result = gameCopy.move(move);

        if (result) {
          setGame(gameCopy);
          updateStatus(gameCopy);
          return true;
        }
      } catch {
        // Invalid move
      }
      return false;
    },
    [game, updateStatus],
  );

  // AI Move logic
  useEffect(() => {
    if (!isGameOver && game.turn() !== playerColor) {
      const aiColor = playerColor === "w" ? "b" : "w";
      const timer = setTimeout(() => {
        const gameCopy = new Chess();
        if (game.history().length > 0) {
          gameCopy.loadPgn(game.pgn());
        }
        const bestMove = calculateBestMove(gameCopy, aiColor);

        if (bestMove) {
          makeMove(bestMove);
        }
      }, 500); // 500ms delay to feel more natural

      return () => clearTimeout(timer);
    }
  }, [game, isGameOver, makeMove, playerColor]);

  function onPieceDrop({
    piece,
    sourceSquare,
    targetSquare,
  }: {
    piece: { pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean {
    // Only allow player to move via drag and drop
    if (!targetSquare || game.turn() !== playerColor || isGameOver) return false;

    const isPawn = piece.pieceType.toLowerCase().endsWith("p");
    const isPromotion =
      isPawn &&
      ((playerColor === "w" && targetSquare.endsWith("8")) ||
        (playerColor === "b" && targetSquare.endsWith("1")));

    const success = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: isPromotion ? "q" : undefined,
    });
    if (success) {
      setMoveFrom(null);
      setOptionSquares({});
    }
    return Boolean(success);
  }

  function canDragPiece({
    piece,
  }: {
    piece: { pieceType: string };
  }): boolean {
    if (isGameOver || game.turn() !== playerColor) return false;
    return piece.pieceType.startsWith(playerColor);
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
    moves.forEach((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as any) &&
          game.get(move.to as any)?.color !== game.get(square as any)?.color
            ? "radial-gradient(circle, rgba(239, 68, 68, 0.5) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0, 0, 0, 0.3) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
    newSquares[square] = {
      background: "rgba(255, 255, 0, 0.4)",
    };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClick({ square }: { square: string }) {
    if (game.turn() !== playerColor || isGameOver) return;

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
      const isPromotion = foundMove.promotion !== undefined;
      const success = makeMove({
        from: moveFrom,
        to: square,
        promotion: isPromotion ? "q" : undefined,
      });
      if (success) {
        setMoveFrom(null);
        setOptionSquares({});
      }
    } else {
      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) {
        setMoveFrom(square);
      } else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    }
  }

  function resetGame(color: "w" | "b" = playerColor) {
    const newGame = new Chess();
    setGame(newGame);
    setPlayerColor(color);
    updateStatus(newGame);
    setIsGameOver(false);
    setMoveFrom(null);
    setOptionSquares({});
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-4xl mx-auto h-full w-full">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-8 h-8 text-cyan-500" />
        <h2 className="text-3xl font-bold text-white tracking-tight">
          {t("games.chessPlayVsAi")}
        </h2>
      </div>

      <div className="grid md:grid-cols-12 gap-8 w-full">
        {/* Left Column: Game Info */}
        <div className="md:col-span-4 flex flex-col gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <span className="text-slate-400 font-medium">
                  {t("games.chessStatus")}
                </span>
                <Badge
                  variant="outline"
                  className={
                    isGameOver
                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                      : game.turn() === playerColor
                        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  }
                >
                  {isGameOver
                    ? t("games.chessGameOver")
                    : game.turn() === playerColor
                      ? t("games.chessYourTurn")
                      : t("games.chessAiThinking")}
                </Badge>
              </div>

              <div className="py-4 flex items-center gap-3">
                {isGameOver ? (
                  <Trophy className="w-6 h-6 text-yellow-500" />
                ) : game.isCheck() ? (
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                ) : null}
                <p className="text-lg font-semibold text-white">{gameStatus}</p>
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-2">
                <Button
                  onClick={() => resetGame("w")}
                  variant="secondary"
                  className={`flex-1 flex items-center justify-center gap-2 text-white ${playerColor === "w" ? "bg-cyan-600 hover:bg-cyan-500" : "bg-slate-800 hover:bg-slate-700"}`}
                >
                  <RotateCcw className="w-4 h-4" />
                  {t("games.chessPlayWhite")}
                </Button>
                <Button
                  onClick={() => resetGame("b")}
                  variant="secondary"
                  className={`flex-1 flex items-center justify-center gap-2 text-white ${playerColor === "b" ? "bg-purple-600 hover:bg-purple-500" : "bg-slate-800 hover:bg-slate-700"}`}
                >
                  <RotateCcw className="w-4 h-4" />
                  {t("games.chessPlayBlack")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 flex-grow">
            <CardContent className="p-6">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                {t("games.chessMoveHistory")}
              </h3>
              <div className="h-48 overflow-y-auto pr-2 custom-scrollbar">
                {game.history().length === 0 ? (
                  <p className="text-slate-600 text-center italic mt-10">
                    {t("games.chessNoMoves")}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {game
                      .history()
                      .reduce((result: any[], move, index) => {
                        if (index % 2 === 0) {
                          result.push([move]);
                        } else {
                          result[result.length - 1].push(move);
                        }
                        return result;
                      }, [])
                      .map((pair: string[], i: number) => (
                        <React.Fragment key={i}>
                          <div className="text-slate-300 font-mono">
                            <span className="text-slate-600 w-6 inline-block">
                              {i + 1}.
                            </span>{" "}
                            {pair[0]}
                          </div>
                          <div className="text-cyan-400 font-mono">
                            {pair[1] || ""}
                          </div>
                        </React.Fragment>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Board */}
        <div
          className="md:col-span-8 flex justify-center items-center"
          ref={containerRef}
        >
          <div
            className="w-full rounded-lg overflow-hidden shadow-2xl border-4 border-slate-800"
            style={{ maxWidth: boardWidth }}
          >
            <Chessboard
              options={{
                position: game.fen(),
                onPieceDrop: onPieceDrop,
                onSquareClick: onSquareClick,
                canDragPiece: canDragPiece,
                squareStyles: optionSquares,
                darkSquareStyle: { backgroundColor: "#334155" },
                lightSquareStyle: { backgroundColor: "#cbd5e1" },
                boardOrientation: playerColor === "w" ? "white" : "black",
                animationDurationInMs: 200,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
