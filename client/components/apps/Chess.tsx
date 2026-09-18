import React, { useState, useEffect, useCallback, useRef } from "react";
import { Chess, Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RotateCcw,
  Sparkles,
  Trophy,
  AlertTriangle,
  Users,
  Bot,
  Clock,
  Copy,
  Check,
  Flag,
  Handshake,
  Undo2,
  Send,
  MessageSquare,
  ArrowLeft,
  Loader2,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/contexts/LanguageContext";
import { ChessRtcManager, ChessRtcMessage } from "@/services/chessRtc";

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
    const boardValue = evaluateBoard(game, aiColor);
    game.undo();

    const randomValue = Math.random() * 0.1;
    if (boardValue + randomValue > bestValue) {
      bestValue = boardValue + randomValue;
      bestMove = move;
    }
  }

  return bestMove.san;
}

interface ChatMessage {
  id: string;
  sender: "me" | "opponent";
  text: string;
  time: string;
}

function formatClockTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function ChessApp() {
  const { t } = useTranslation();

  // Mode Selection: "ai" | "online"
  const [mode, setMode] = useState<"ai" | "online">("ai");

  // Core Game State (shared by both modes)
  const [game, setGame] = useState<Chess>(() => new Chess());
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [gameStatus, setGameStatus] = useState<string>("");
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [boardWidth, setBoardWidth] = useState(400);
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Online Multiplayer State
  const [onlineState, setOnlineState] = useState<"lobby" | "waiting" | "playing">("lobby");
  const [colorPref, setColorPref] = useState<"w" | "b" | "random">("random");
  const [timeControl, setTimeControl] = useState<number>(5); // minutes (0 = untimed)
  const [roomId, setRoomId] = useState<string>("");
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const [onlineMyColor, setOnlineMyColor] = useState<"w" | "b">("w");
  const [onlineOpponentColor, setOnlineOpponentColor] = useState<"w" | "b">("b");
  const [whiteClock, setWhiteClock] = useState<number>(300);
  const [blackClock, setBlackClock] = useState<number>(300);
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);

  // Interactive In-Game Dialog States
  const [incomingDrawOffer, setIncomingDrawOffer] = useState<boolean>(false);
  const [drawOfferPending, setDrawOfferPending] = useState<boolean>(false);
  const [incomingTakeback, setIncomingTakeback] = useState<boolean>(false);
  const [takebackPending, setTakebackPending] = useState<boolean>(false);
  const [incomingRematch, setIncomingRematch] = useState<boolean>(false);
  const [rematchPending, setRematchPending] = useState<boolean>(false);
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // In-Game Chat
  const [activeSideTab, setActiveSideTab] = useState<"moves" | "chat">("moves");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [hasUnreadChat, setHasUnreadChat] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const rtcRef = useRef<ChessRtcManager | null>(null);

  // Board Resizing
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setBoardWidth(Math.max(280, Math.min(600, width)));
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update Game Status Text
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

  // Chess Clock countdown in Online mode
  useEffect(() => {
    if (
      mode !== "online" ||
      onlineState !== "playing" ||
      isGameOver ||
      timeControl === 0 ||
      reconnectCountdown !== null
    ) {
      return;
    }

    const timer = setInterval(() => {
      if (game.turn() === "w") {
        setWhiteClock((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsGameOver(true);
            setGameStatus(t("games.chessTimeBlackWins"));
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackClock((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsGameOver(true);
            setGameStatus(t("games.chessTimeWhiteWins"));
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, onlineState, isGameOver, game, timeControl, reconnectCountdown, t]);

  // Handle incoming RTC message
  const handleRtcMessage = useCallback(
    (msg: ChessRtcMessage) => {
      switch (msg.type) {
        case "move": {
          try {
            const gameCopy = new Chess();
            if (msg.fen) {
              gameCopy.load(msg.fen);
            } else {
              if (game.history().length > 0) {
                gameCopy.loadPgn(game.pgn());
              }
              gameCopy.move({
                from: msg.from,
                to: msg.to,
                promotion: msg.promotion,
              });
            }
            setGame(gameCopy);
            updateStatus(gameCopy);

            if (typeof msg.whiteClock === "number") setWhiteClock(msg.whiteClock);
            if (typeof msg.blackClock === "number") setBlackClock(msg.blackClock);
          } catch (e) {
            console.error("Error applying opponent move", e);
          }
          break;
        }

        case "chat": {
          setChatMessages((prev) => [
            ...prev,
            {
              id: msg.id || String(Date.now()),
              sender: "opponent",
              text: msg.text,
              time: msg.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
          if (activeSideTab !== "chat") {
            setHasUnreadChat(true);
          }
          break;
        }

        case "draw_offer": {
          setIncomingDrawOffer(true);
          break;
        }

        case "draw_response": {
          setDrawOfferPending(false);
          if (msg.accepted) {
            setIsGameOver(true);
            setGameStatus(t("games.chessDraw"));
          } else {
            setNotificationBanner(t("games.chessDrawDeclined"));
            setTimeout(() => setNotificationBanner(null), 4000);
          }
          break;
        }

        case "resign": {
          setIsGameOver(true);
          const winnerText =
            onlineMyColor === "w"
              ? t("games.chessWhiteWins") + ` (${t("games.chessOpponent")} ${t("games.chessResigned")})`
              : t("games.chessBlackWins") + ` (${t("games.chessOpponent")} ${t("games.chessResigned")})`;
          setGameStatus(winnerText);
          break;
        }

        case "takeback_offer": {
          setIncomingTakeback(true);
          break;
        }

        case "takeback_response": {
          setTakebackPending(false);
          if (msg.accepted) {
            // Undo last two moves (or one move) to restore player's turn
            const gameCopy = new Chess();
            if (game.history().length > 0) {
              gameCopy.loadPgn(game.pgn());
              gameCopy.undo();
              if (gameCopy.turn() !== onlineMyColor) {
                gameCopy.undo();
              }
            }
            setGame(gameCopy);
            updateStatus(gameCopy);
          } else {
            setNotificationBanner(t("games.chessTakebackDeclined"));
            setTimeout(() => setNotificationBanner(null), 4000);
          }
          break;
        }

        case "rematch_offer": {
          setIncomingRematch(true);
          break;
        }

        case "rematch_response": {
          setRematchPending(false);
          if (msg.accepted) {
            // Start rematch, swap colors
            const newMyColor = onlineMyColor === "w" ? "b" : "w";
            const newOppColor = newMyColor === "w" ? "b" : "w";
            setOnlineMyColor(newMyColor);
            setOnlineOpponentColor(newOppColor);

            const newGame = new Chess();
            setGame(newGame);
            updateStatus(newGame);
            setIsGameOver(false);
            setWhiteClock(timeControl * 60);
            setBlackClock(timeControl * 60);
            setMoveFrom(null);
            setOptionSquares({});
            setNotificationBanner(null);
          }
          break;
        }
      }
    },
    [game, activeSideTab, onlineMyColor, timeControl, t, updateStatus],
  );

  // Initialize WebRTC Manager
  useEffect(() => {
    const rtc = new ChessRtcManager({
      onConnected: () => {
        setIsPeerConnected(true);
        setReconnectCountdown(null);
        setOnlineState("playing");
      },
      onDisconnected: () => {
        setIsPeerConnected(false);
        setReconnectCountdown(null);
        // If match was active, award win to remaining player
        setIsGameOver(true);
        setGameStatus(t("games.chessOpponentDisconnected"));
      },
      onReconnecting: (seconds) => {
        setIsPeerConnected(false);
        setReconnectCountdown(seconds);
      },
      onMessage: handleRtcMessage,
      onError: (err) => {
        setErrorMessage(err);
      },
    });

    rtcRef.current = rtc;

    return () => {
      rtc.cleanup();
    };
  }, [handleRtcMessage, t]);

  // Scroll chat to bottom
  useEffect(() => {
    if (activeSideTab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setHasUnreadChat(false);
    }
  }, [chatMessages, activeSideTab]);

  // Execute Move
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

          // If Online, broadcast move to opponent
          if (mode === "online" && onlineState === "playing") {
            rtcRef.current?.sendMessage({
              type: "move",
              from: result.from,
              to: result.to,
              promotion: result.promotion,
              san: result.san,
              fen: gameCopy.fen(),
              whiteClock,
              blackClock,
            });
          }

          return true;
        }
      } catch {
        // Invalid move
      }
      return false;
    },
    [game, mode, onlineState, whiteClock, blackClock, updateStatus],
  );

  // AI Move logic
  useEffect(() => {
    if (mode === "ai" && !isGameOver && game.turn() !== playerColor) {
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
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [mode, game, isGameOver, makeMove, playerColor]);

  // Online Matchmaking: Create Room
  const handleCreateRoom = async () => {
    if (!rtcRef.current) return;
    setIsConnecting(true);
    setErrorMessage("");

    try {
      const res = await rtcRef.current.createRoom(colorPref, timeControl);
      setRoomId(res.roomId);
      setOnlineMyColor(res.yourColor);
      setOnlineOpponentColor(res.yourColor === "w" ? "b" : "w");
      setWhiteClock(timeControl * 60);
      setBlackClock(timeControl * 60);

      const newGame = new Chess();
      setGame(newGame);
      updateStatus(newGame);
      setIsGameOver(false);
      setChatMessages([]);

      setOnlineState("waiting");
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to create room");
    } finally {
      setIsConnecting(false);
    }
  };

  // Online Matchmaking: Join Room
  const handleJoinRoom = async () => {
    if (!rtcRef.current || !joinCodeInput.trim()) return;
    setIsConnecting(true);
    setErrorMessage("");

    try {
      const cleanCode = joinCodeInput.trim().toUpperCase();
      const res = await rtcRef.current.joinRoom(cleanCode);
      setRoomId(res.roomId);
      setOnlineMyColor(res.yourColor);
      setOnlineOpponentColor(res.opponentColor);
      setTimeControl(res.timeLimit);
      setWhiteClock(res.timeLimit * 60);
      setBlackClock(res.timeLimit * 60);

      const newGame = new Chess();
      setGame(newGame);
      updateStatus(newGame);
      setIsGameOver(false);
      setChatMessages([]);

      setOnlineState("playing");
      setIsPeerConnected(true);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to join room");
    } finally {
      setIsConnecting(false);
    }
  };

  // Leave room and return to lobby
  const handleLeaveOnlineRoom = () => {
    rtcRef.current?.cleanup();
    setOnlineState("lobby");
    setRoomId("");
    setIsPeerConnected(false);
    setReconnectCountdown(null);
    setNotificationBanner(null);
    setIncomingDrawOffer(false);
    setIncomingTakeback(false);
    setIncomingRematch(false);
    const newGame = new Chess();
    setGame(newGame);
    updateStatus(newGame);
    setIsGameOver(false);
  };

  // Copy room link
  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // In-Game Online Actions: Draw
  const handleOfferDraw = () => {
    if (isGameOver || !isPeerConnected || drawOfferPending) return;
    setDrawOfferPending(true);
    rtcRef.current?.sendMessage({ type: "draw_offer" });
  };

  const handleRespondDraw = (accepted: boolean) => {
    setIncomingDrawOffer(false);
    rtcRef.current?.sendMessage({ type: "draw_response", accepted });
    if (accepted) {
      setIsGameOver(true);
      setGameStatus(t("games.chessDraw"));
    }
  };

  // In-Game Online Actions: Resign
  const handleResign = () => {
    if (isGameOver || !isPeerConnected) return;
    if (window.confirm(t("games.chessResignConfirm"))) {
      rtcRef.current?.sendMessage({ type: "resign" });
      setIsGameOver(true);
      const winner =
        onlineMyColor === "w" ? t("games.chessBlackWins") : t("games.chessWhiteWins");
      setGameStatus(`${winner} (${t("games.chessYou")} ${t("games.chessResigned")})`);
    }
  };

  // In-Game Online Actions: Takeback
  const handleRequestTakeback = () => {
    if (isGameOver || !isPeerConnected || takebackPending) return;
    setTakebackPending(true);
    rtcRef.current?.sendMessage({ type: "takeback_offer" });
  };

  const handleRespondTakeback = (accepted: boolean) => {
    setIncomingTakeback(false);
    rtcRef.current?.sendMessage({ type: "takeback_response", accepted });
    if (accepted) {
      const gameCopy = new Chess();
      if (game.history().length > 0) {
        gameCopy.loadPgn(game.pgn());
        gameCopy.undo();
        if (gameCopy.turn() === onlineMyColor) {
          gameCopy.undo();
        }
      }
      setGame(gameCopy);
      updateStatus(gameCopy);
    }
  };

  // In-Game Online Actions: Rematch
  const handleOfferRematch = () => {
    if (!isPeerConnected || rematchPending) return;
    setRematchPending(true);
    rtcRef.current?.sendMessage({ type: "rematch_offer" });
  };

  const handleRespondRematch = (accepted: boolean) => {
    setIncomingRematch(false);
    rtcRef.current?.sendMessage({ type: "rematch_response", accepted });
    if (accepted) {
      const newMyColor = onlineMyColor === "w" ? "b" : "w";
      const newOppColor = newMyColor === "w" ? "b" : "w";
      setOnlineMyColor(newMyColor);
      setOnlineOpponentColor(newOppColor);

      const newGame = new Chess();
      setGame(newGame);
      updateStatus(newGame);
      setIsGameOver(false);
      setWhiteClock(timeControl * 60);
      setBlackClock(timeControl * 60);
      setMoveFrom(null);
      setOptionSquares({});
    }
  };

  // In-Game Online Actions: Send Chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msgId = String(Date.now());

    rtcRef.current?.sendMessage({
      type: "chat",
      id: msgId,
      text,
      time,
    });

    setChatMessages((prev) => [
      ...prev,
      {
        id: msgId,
        sender: "me",
        text,
        time,
      },
    ]);
    setChatInput("");
  };

  // Drag & Drop Handling
  function onPieceDrop({
    piece,
    sourceSquare,
    targetSquare,
  }: {
    piece: { pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean {
    const activeColor = mode === "ai" ? playerColor : onlineMyColor;
    if (
      !targetSquare ||
      game.turn() !== activeColor ||
      isGameOver ||
      (mode === "online" && reconnectCountdown !== null)
    ) {
      return false;
    }

    const isPawn = piece.pieceType.toLowerCase().endsWith("p");
    const isPromotion =
      isPawn &&
      ((activeColor === "w" && targetSquare.endsWith("8")) ||
        (activeColor === "b" && targetSquare.endsWith("1")));

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

  function canDragPiece({ piece }: { piece: { pieceType: string } }): boolean {
    const activeColor = mode === "ai" ? playerColor : onlineMyColor;
    if (
      isGameOver ||
      game.turn() !== activeColor ||
      (mode === "online" && reconnectCountdown !== null)
    ) {
      return false;
    }
    return piece.pieceType.startsWith(activeColor);
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
    const activeColor = mode === "ai" ? playerColor : onlineMyColor;
    if (
      game.turn() !== activeColor ||
      isGameOver ||
      (mode === "online" && reconnectCountdown !== null)
    ) {
      return;
    }

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

  // AI Game Reset
  function resetAiGame(color: "w" | "b" = playerColor) {
    const newGame = new Chess();
    setGame(newGame);
    setPlayerColor(color);
    updateStatus(newGame);
    setIsGameOver(false);
    setMoveFrom(null);
    setOptionSquares({});
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-5xl mx-auto h-full w-full">
      {/* Top Mode Segmented Switch */}
      <div className="flex items-center justify-between w-full mb-6">
        <div className="flex items-center gap-3">
          {mode === "ai" ? (
            <Sparkles className="w-8 h-8 text-cyan-500" />
          ) : (
            <Users className="w-8 h-8 text-cyan-500" />
          )}
          <h2 className="text-3xl font-bold text-white tracking-tight">
            {t("games.chessTitle")}
          </h2>
        </div>

        <div className="flex items-center bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
          <Button
            onClick={() => {
              setMode("ai");
              setNotificationBanner(null);
            }}
            variant="ghost"
            size="sm"
            className={`flex items-center gap-2 rounded-lg text-sm px-3.5 transition-all ${
              mode === "ai"
                ? "bg-cyan-600 text-white font-semibold shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Bot className="w-4 h-4" />
            {t("games.chessPlayVsAi")}
          </Button>
          <Button
            onClick={() => {
              setMode("online");
              setNotificationBanner(null);
            }}
            variant="ghost"
            size="sm"
            className={`flex items-center gap-2 rounded-lg text-sm px-3.5 transition-all ${
              mode === "online"
                ? "bg-cyan-600 text-white font-semibold shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            {t("games.chessPlayOnline")}
          </Button>
        </div>
      </div>

      {/* ONLINE LOBBY VIEW */}
      {mode === "online" && onlineState === "lobby" && (
        <div className="grid md:grid-cols-2 gap-8 w-full max-w-3xl my-6">
          {/* Create Room Card */}
          <Card className="bg-slate-900/60 border-slate-800 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 text-cyan-400">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-xl font-bold text-white">
                  {t("games.chessCreateGame")}
                </h3>
              </div>

              <div className="flex flex-col gap-4 mb-6">
                {/* Color Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    {t("games.chessColorPreference")}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setColorPref("w")}
                      className={`text-sm py-2 border-slate-700 ${
                        colorPref === "w"
                          ? "bg-white text-slate-950 font-bold border-white"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {t("games.chessColorWhite")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setColorPref("random")}
                      className={`text-sm py-2 border-slate-700 ${
                        colorPref === "random"
                          ? "bg-cyan-600 text-white font-bold border-cyan-500"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {t("games.chessColorRandom")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setColorPref("b")}
                      className={`text-sm py-2 border-slate-700 ${
                        colorPref === "b"
                          ? "bg-slate-950 text-white font-bold border-purple-500"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {t("games.chessColorBlack")}
                    </Button>
                  </div>
                </div>

                {/* Time Controls */}
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    {t("games.chessTimeControl")}
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 3, 5, 10, 15].map((mins) => (
                      <Button
                        key={mins}
                        type="button"
                        variant="outline"
                        onClick={() => setTimeControl(mins)}
                        className={`text-xs py-1.5 px-1 border-slate-700 ${
                          timeControl === mins
                            ? "bg-cyan-600 text-white font-bold border-cyan-500"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {mins === 0 ? t("games.chessUntimed") : `${mins} ${t("games.chessMinutes")}`}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleCreateRoom}
              disabled={isConnecting}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-5"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("games.chessConnecting")}
                </>
              ) : (
                t("games.chessCreateGame")
              )}
            </Button>
          </Card>

          {/* Join Room Card */}
          <Card className="bg-slate-900/60 border-slate-800 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 text-purple-400">
                <Users className="w-5 h-5" />
                <h3 className="text-xl font-bold text-white">{t("games.chessJoinGame")}</h3>
              </div>

              <div className="flex flex-col gap-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    {t("games.chessRoomCode")}
                  </label>
                  <Input
                    placeholder={t("games.chessEnterCode")}
                    value={joinCodeInput}
                    maxLength={6}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    className="bg-slate-950 border-slate-700 text-white font-mono text-center tracking-widest text-lg uppercase py-5"
                  />
                </div>
                {errorMessage && (
                  <p className="text-sm text-red-400 font-medium">{errorMessage}</p>
                )}
              </div>
            </div>

            <Button
              onClick={handleJoinRoom}
              disabled={isConnecting || !joinCodeInput.trim()}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-5"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("games.chessConnecting")}
                </>
              ) : (
                t("games.chessJoin")
              )}
            </Button>
          </Card>
        </div>
      )}

      {/* ONLINE WAITING ROOM VIEW */}
      {mode === "online" && onlineState === "waiting" && (
        <Card className="bg-slate-900/60 border-slate-800 p-8 max-w-md w-full text-center my-8">
          <div className="flex justify-center mb-4">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {t("games.chessWaitingForOpponent")}
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            {t("games.chessShareCodePrompt")}
          </p>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6">
            <span className="font-mono text-4xl font-bold tracking-widest text-cyan-400 select-all">
              {roomId}
            </span>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="flex-1 border-slate-700 hover:bg-slate-800 text-white gap-2"
            >
              {copiedLink ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copiedLink ? t("games.chessCopied") : t("games.chessCopyLink")}
            </Button>
            <Button
              onClick={handleLeaveOnlineRoom}
              variant="ghost"
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {t("games.chessLeaveRoom")}
            </Button>
          </div>
        </Card>
      )}

      {/* ACTIVE GAME VIEW (AI Mode or Online Playing Mode) */}
      {(mode === "ai" || (mode === "online" && onlineState === "playing")) && (
        <div className="grid md:grid-cols-12 gap-8 w-full">
          {/* Left Column: Game Info / Controls */}
          <div className="md:col-span-4 flex flex-col gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-6 flex flex-col gap-4">
                {/* Status Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <span className="text-slate-400 font-medium">
                    {t("games.chessStatus")}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      isGameOver
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : mode === "ai"
                          ? game.turn() === playerColor
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                            : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          : game.turn() === onlineMyColor
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                            : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    }
                  >
                    {isGameOver
                      ? t("games.chessGameOver")
                      : mode === "ai"
                        ? game.turn() === playerColor
                          ? t("games.chessYourTurn")
                          : t("games.chessAiThinking")
                        : game.turn() === onlineMyColor
                          ? t("games.chessYourTurn")
                          : t("games.chessOpponentTurn")}
                  </Badge>
                </div>

                {/* Status Description */}
                <div className="py-2 flex items-center gap-3">
                  {isGameOver ? (
                    <Trophy className="w-6 h-6 text-yellow-500 shrink-0" />
                  ) : game.isCheck() ? (
                    <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                  ) : null}
                  <p className="text-base font-semibold text-white">{gameStatus}</p>
                </div>

                {/* Reconnection Countdown Banner */}
                {reconnectCountdown !== null && (
                  <div className="bg-red-950/60 border border-red-700/50 rounded-lg p-3 text-sm text-red-300 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>
                      {t("games.chessReconnecting").replace("{seconds}", String(reconnectCountdown))}
                    </span>
                  </div>
                )}

                {/* Notification Alert Banner */}
                {notificationBanner && (
                  <div className="bg-cyan-950/60 border border-cyan-700/50 rounded-lg p-3 text-sm text-cyan-300">
                    {notificationBanner}
                  </div>
                )}

                {/* Interactive Incoming Offers in Online Mode */}
                {mode === "online" && (
                  <>
                    {incomingDrawOffer && (
                      <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg flex flex-col gap-2">
                        <p className="text-xs font-medium text-slate-200">
                          {t("games.chessDrawOffered")}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRespondDraw(true)}
                            className="bg-green-600 hover:bg-green-500 text-xs py-1 px-3"
                          >
                            {t("games.chessAccept")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRespondDraw(false)}
                            className="text-slate-400 hover:text-white text-xs py-1 px-3"
                          >
                            {t("games.chessDecline")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {incomingTakeback && (
                      <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg flex flex-col gap-2">
                        <p className="text-xs font-medium text-slate-200">
                          {t("games.chessTakebackRequested")}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRespondTakeback(true)}
                            className="bg-green-600 hover:bg-green-500 text-xs py-1 px-3"
                          >
                            {t("games.chessAccept")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRespondTakeback(false)}
                            className="text-slate-400 hover:text-white text-xs py-1 px-3"
                          >
                            {t("games.chessDecline")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {incomingRematch && (
                      <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg flex flex-col gap-2">
                        <p className="text-xs font-medium text-slate-200">
                          {t("games.chessRematchOffered")}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRespondRematch(true)}
                            className="bg-green-600 hover:bg-green-500 text-xs py-1 px-3"
                          >
                            {t("games.chessAccept")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRespondRematch(false)}
                            className="text-slate-400 hover:text-white text-xs py-1 px-3"
                          >
                            {t("games.chessDecline")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* AI Controls: Play White / Play Black */}
                {mode === "ai" && (
                  <div className="pt-4 border-t border-slate-800 flex gap-2">
                    <Button
                      onClick={() => resetAiGame("w")}
                      variant="secondary"
                      className={`flex-1 flex items-center justify-center gap-2 text-white ${
                        playerColor === "w"
                          ? "bg-cyan-600 hover:bg-cyan-500"
                          : "bg-slate-800 hover:bg-slate-700"
                      }`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      {t("games.chessPlayWhite")}
                    </Button>
                    <Button
                      onClick={() => resetAiGame("b")}
                      variant="secondary"
                      className={`flex-1 flex items-center justify-center gap-2 text-white ${
                        playerColor === "b"
                          ? "bg-purple-600 hover:bg-purple-500"
                          : "bg-slate-800 hover:bg-slate-700"
                      }`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      {t("games.chessPlayBlack")}
                    </Button>
                  </div>
                )}

                {/* Online Controls: Resign, Draw, Takeback, Rematch */}
                {mode === "online" && (
                  <div className="pt-4 border-t border-slate-800 flex flex-col gap-2">
                    {!isGameOver ? (
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          onClick={handleOfferDraw}
                          disabled={drawOfferPending || !isPeerConnected}
                          variant="outline"
                          size="sm"
                          className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1.5"
                        >
                          <Handshake className="w-3.5 h-3.5" />
                          {t("games.chessOfferDraw")}
                        </Button>
                        <Button
                          onClick={handleRequestTakeback}
                          disabled={takebackPending || !isPeerConnected}
                          variant="outline"
                          size="sm"
                          className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1.5"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          {t("games.chessRequestTakeback")}
                        </Button>
                        <Button
                          onClick={handleResign}
                          disabled={!isPeerConnected}
                          variant="outline"
                          size="sm"
                          className="border-red-900/50 text-red-400 hover:bg-red-950/50 text-xs flex items-center gap-1.5"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          {t("games.chessResign")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          onClick={handleOfferRematch}
                          disabled={rematchPending || !isPeerConnected}
                          className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4" />
                          {rematchPending ? t("games.chessConnecting") : t("games.chessRematch")}
                        </Button>
                        <Button
                          onClick={handleLeaveOnlineRoom}
                          variant="ghost"
                          className="text-slate-400 hover:text-white text-xs"
                        >
                          {t("games.chessLeaveRoom")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Side Panel: Tabs for Move History & Chat */}
            <Card className="bg-slate-900/50 border-slate-800 flex-grow">
              <CardContent className="p-4">
                {mode === "online" ? (
                  <div className="flex flex-col h-64">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveSideTab("moves")}
                        className={`flex items-center gap-1.5 text-xs py-1 px-3 ${
                          activeSideTab === "moves"
                            ? "bg-slate-800 text-white font-semibold"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <History className="w-3.5 h-3.5" />
                        {t("games.chessMoveHistory")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveSideTab("chat")}
                        className={`flex items-center gap-1.5 text-xs py-1 px-3 relative ${
                          activeSideTab === "chat"
                            ? "bg-slate-800 text-white font-semibold"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {t("games.chessChat")}
                        {hasUnreadChat && activeSideTab !== "chat" && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 absolute top-1 right-1" />
                        )}
                      </Button>
                    </div>

                    {activeSideTab === "moves" ? (
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {game.history().length === 0 ? (
                          <p className="text-slate-600 text-center italic mt-12">
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
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                          {chatMessages.length === 0 ? (
                            <p className="text-slate-600 text-center italic mt-12 text-xs">
                              {t("games.chessChatPlaceholder")}
                            </p>
                          ) : (
                            chatMessages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`flex flex-col ${
                                  msg.sender === "me" ? "items-end" : "items-start"
                                }`}
                              >
                                <div
                                  className={`rounded-lg px-3 py-1.5 text-xs max-w-[85%] ${
                                    msg.sender === "me"
                                      ? "bg-cyan-600 text-white"
                                      : "bg-slate-800 text-slate-200"
                                  }`}
                                >
                                  {msg.text}
                                </div>
                                <span className="text-[10px] text-slate-500 px-1 mt-0.5">
                                  {msg.time}
                                </span>
                              </div>
                            ))
                          )}
                          <div ref={chatBottomRef} />
                        </div>

                        <form onSubmit={handleSendChat} className="flex gap-2 mt-2 pt-2 border-t border-slate-800">
                          <Input
                            placeholder={t("games.chessChatPlaceholder")}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            className="bg-slate-950 border-slate-700 text-xs py-1 h-8"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={!chatInput.trim()}
                            className="bg-cyan-600 hover:bg-cyan-500 h-8 px-2.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
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
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Board with Clocks */}
          <div
            className="md:col-span-8 flex flex-col justify-center items-center gap-2"
            ref={containerRef}
          >
            {/* Top Opponent Banner in Online Mode */}
            {mode === "online" && (
              <div
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 rounded-t-lg border-t border-x border-slate-800"
                style={{ maxWidth: boardWidth }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      onlineOpponentColor === "w"
                        ? "bg-white border border-slate-400"
                        : "bg-slate-900 border border-slate-600"
                    }`}
                  />
                  <span className="text-sm font-semibold text-slate-200">
                    {t("games.chessOpponent")}
                  </span>
                </div>
                {timeControl > 0 && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-sm font-bold ${
                      (onlineOpponentColor === "w" ? whiteClock : blackClock) < 30
                        ? "bg-red-500/20 text-red-400 animate-pulse"
                        : game.turn() === onlineOpponentColor
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {formatClockTime(onlineOpponentColor === "w" ? whiteClock : blackClock)}
                  </div>
                )}
              </div>
            )}

            {/* Chessboard */}
            <div
              className={`w-full overflow-hidden shadow-2xl border-4 border-slate-800 ${
                mode === "online" ? "rounded-none" : "rounded-lg"
              }`}
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
                  boardOrientation:
                    mode === "ai"
                      ? playerColor === "w"
                        ? "white"
                        : "black"
                      : onlineMyColor === "w"
                        ? "white"
                        : "black",
                  animationDurationInMs: 200,
                }}
              />
            </div>

            {/* Bottom Player Banner in Online Mode */}
            {mode === "online" && (
              <div
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 rounded-b-lg border-b border-x border-slate-800"
                style={{ maxWidth: boardWidth }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      onlineMyColor === "w"
                        ? "bg-white border border-slate-400"
                        : "bg-slate-900 border border-slate-600"
                    }`}
                  />
                  <span className="text-sm font-semibold text-slate-200">
                    {t("games.chessYou")}
                  </span>
                </div>
                {timeControl > 0 && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-sm font-bold ${
                      (onlineMyColor === "w" ? whiteClock : blackClock) < 30
                        ? "bg-red-500/20 text-red-400 animate-pulse"
                        : game.turn() === onlineMyColor
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {formatClockTime(onlineMyColor === "w" ? whiteClock : blackClock)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
