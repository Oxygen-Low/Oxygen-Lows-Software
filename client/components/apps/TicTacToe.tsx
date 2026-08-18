import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, User, Users } from "lucide-react";

type Player = "X" | "O" | null;
type GameMode = "Singleplayer" | "Multiplayer";

export function TicTacToeApp() {
  const [board, setBoard] = useState<Player[]>(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState<boolean>(true);
  const [mode, setMode] = useState<GameMode>("Singleplayer");
  const [winner, setWinner] = useState<Player | "Draw" | null>(null);

  const checkWinner = (squares: Player[]) => {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    if (!squares.includes(null)) {
      return "Draw";
    }
    return null;
  };

  const makeMove = useCallback(
    (index: number) => {
      if (board[index] || winner) return;

      const newBoard = [...board];
      newBoard[index] = xIsNext ? "X" : "O";
      setBoard(newBoard);

      const newWinner = checkWinner(newBoard);
      if (newWinner) {
        setWinner(newWinner);
      } else {
        setXIsNext(!xIsNext);
      }
    },
    [board, winner, xIsNext]
  );

  useEffect(() => {
    if (mode === "Singleplayer" && !xIsNext && !winner) {
      // AI's turn (O)
      const timer = setTimeout(() => {
        const availableMoves = board
          .map((val, idx) => (val === null ? idx : null))
          .filter((val) => val !== null) as number[];

        if (availableMoves.length > 0) {
          // Simple random AI
          const randomMove =
            availableMoves[Math.floor(Math.random() * availableMoves.length)];
          makeMove(randomMove);
        }
      }, 500); // slight delay for realism
      return () => clearTimeout(timer);
    }
  }, [xIsNext, mode, winner, board, makeMove]);

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setXIsNext(true);
    setWinner(null);
  };

  const renderSquare = (i: number) => {
    return (
      <Button
        variant="outline"
        className={`h-24 w-24 text-4xl font-bold ${
          board[i] === "X"
            ? "text-blue-500"
            : board[i] === "O"
            ? "text-red-500"
            : ""
        }`}
        onClick={() => makeMove(i)}
        disabled={!!board[i] || !!winner || (mode === "Singleplayer" && !xIsNext)}
      >
        {board[i]}
      </Button>
    );
  };

  return (
    <div className="flex flex-col items-center p-4 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant={mode === "Singleplayer" ? "default" : "outline"}
          onClick={() => {
            setMode("Singleplayer");
            resetGame();
          }}
          className="gap-2"
        >
          <User className="w-4 h-4" />
          Singleplayer
        </Button>
        <Button
          variant={mode === "Multiplayer" ? "default" : "outline"}
          onClick={() => {
            setMode("Multiplayer");
            resetGame();
          }}
          className="gap-2"
        >
          <Users className="w-4 h-4" />
          Multiplayer
        </Button>
      </div>

      <div className="text-xl font-semibold text-slate-200">
        {winner
          ? winner === "Draw"
            ? "It's a Draw!"
            : `Winner: ${winner}`
          : `Next Player: ${xIsNext ? "X" : "O"}`}
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-2">
            {board.map((_, i) => (
              <div key={i}>{renderSquare(i)}</div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={resetGame} variant="secondary" className="gap-2">
        <RotateCcw className="w-4 h-4" />
        Restart Game
      </Button>
    </div>
  );
}
