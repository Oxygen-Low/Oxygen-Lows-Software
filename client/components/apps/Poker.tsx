import React, { useState, useEffect, useCallback } from "react";
import { Coins, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hand as PokerHand } from "pokersolver";

type Phase = "pre-flop" | "flop" | "turn" | "river" | "showdown" | "game-over";
type Action = "fold" | "check" | "call" | "raise";

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

function shuffle(array: string[]) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

const PlayingCard = ({
  card,
  hidden = false,
}: {
  card: string;
  hidden?: boolean;
}) => {
  if (hidden) {
    return (
      <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg bg-blue-800 border-2 border-white flex items-center justify-center shadow-lg">
        <div className="w-[85%] h-[90%] border-2 border-blue-400 rounded bg-blue-700/50 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.1)_5px,rgba(255,255,255,0.1)_10px)]" />
      </div>
    );
  }
  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1];
  const isRed = suit === "h" || suit === "d";
  const suitSymbol = { s: "♠", h: "♥", d: "♦", c: "♣" }[suit as string] || suit;

  return (
    <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg bg-white border border-slate-300 flex flex-col items-center justify-between p-1 shadow-lg shrink-0">
      <div
        className={cn(
          "text-base sm:text-xl font-bold w-full leading-none text-left",
          isRed ? "text-red-600" : "text-black",
        )}
      >
        {rank}
      </div>
      <div
        className={cn(
          "text-2xl sm:text-4xl leading-none",
          isRed ? "text-red-600" : "text-black",
        )}
      >
        {suitSymbol}
      </div>
      <div
        className={cn(
          "text-base sm:text-xl font-bold w-full leading-none text-right rotate-180",
          isRed ? "text-red-600" : "text-black",
        )}
      >
        {rank}
      </div>
    </div>
  );
};

export function PokerApp() {
  const INITIAL_CHIPS = 1000;
  const BLIND = 10;

  const [playerChips, setPlayerChips] = useState(INITIAL_CHIPS);
  const [aiChips, setAiChips] = useState(INITIAL_CHIPS);
  const [pot, setPot] = useState(0);
  const [playerBet, setPlayerBet] = useState(0);
  const [aiBet, setAiBet] = useState(0);

  const [deck, setDeck] = useState<string[]>([]);
  const [playerHand, setPlayerHand] = useState<string[]>([]);
  const [aiHand, setAiHand] = useState<string[]>([]);
  const [communityCards, setCommunityCards] = useState<string[]>([]);

  const [phase, setPhase] = useState<Phase>("game-over");
  const [turn, setTurn] = useState<"player" | "ai">("player");
  const [message, setMessage] = useState("Welcome to Texas Hold'em!");

  const dealNewHand = useCallback(() => {
    if (playerChips <= 0) {
      setMessage("You are out of chips! Game Over.");
      return;
    }
    if (aiChips <= 0) {
      setMessage("AI is out of chips! You Win!");
      return;
    }

    const newDeck = shuffle(createDeck());
    const newPlayerHand = [newDeck.pop()!, newDeck.pop()!];
    const newAiHand = [newDeck.pop()!, newDeck.pop()!];

    setDeck(newDeck);
    setPlayerHand(newPlayerHand);
    setAiHand(newAiHand);
    setCommunityCards([]);

    // Reset bets
    setPlayerBet(BLIND);
    setAiBet(BLIND);
    setPlayerChips((prev) => prev - BLIND);
    setAiChips((prev) => prev - BLIND);
    setPot(BLIND * 2);
    setPhase("pre-flop");
    setTurn("player"); // Player acts first for simplicity
    setMessage("Pre-flop: Your turn to act.");
  }, [playerChips, aiChips]);

  useEffect(() => {
    if (phase === "game-over" && playerHand.length === 0) {
      // initial load
      dealNewHand();
    }
  }, [phase, playerHand, dealNewHand]);

  const advancePhase = useCallback(() => {
    setPlayerBet(0);
    setAiBet(0);
    if (phase === "pre-flop") {
      setCommunityCards([deck.pop()!, deck.pop()!, deck.pop()!]);
      setPhase("flop");
      setTurn("player");
      setMessage("Flop: Your turn.");
    } else if (phase === "flop") {
      setCommunityCards((prev) => [...prev, deck.pop()!]);
      setPhase("turn");
      setTurn("player");
      setMessage("Turn: Your turn.");
    } else if (phase === "turn") {
      setCommunityCards((prev) => [...prev, deck.pop()!]);
      setPhase("river");
      setTurn("player");
      setMessage("River: Your turn.");
    } else if (phase === "river") {
      setPhase("showdown");
      evaluateShowdown();
    }
  }, [phase, deck]);

  const evaluateShowdown = () => {
    try {
      const pHand = PokerHand.solve([...playerHand, ...communityCards]);
      const aHand = PokerHand.solve([...aiHand, ...communityCards]);

      const winner = PokerHand.winners([pHand, aHand]);

      if (winner.length === 2) {
        // Tie
        setMessage(`Split Pot! Both have ${pHand.name}`);
        setPlayerChips((prev) => prev + pot / 2);
        setAiChips((prev) => prev + pot / 2);
      } else if (winner[0] === pHand) {
        setMessage(`You Win! ${pHand.name} beats ${aHand.name}`);
        setPlayerChips((prev) => prev + pot);
      } else {
        setMessage(`AI Wins! ${aHand.name} beats ${pHand.name}`);
        setAiChips((prev) => prev + pot);
      }
    } catch (e) {
      console.error(e);
      setMessage("Error evaluating hands");
    }
    setPot(0);
    setTurn("player");
  };

  const handlePlayerAction = (action: Action) => {
    if (turn !== "player" || phase === "showdown" || phase === "game-over")
      return;

    if (action === "fold") {
      setMessage("You folded. AI wins the pot.");
      setAiChips((prev) => prev + pot);
      setPot(0);
      setPhase("showdown"); // skip to end
      return;
    }

    let toCall = Math.max(0, aiBet - playerBet);
    if (action === "check" || action === "call") {
      if (toCall > 0) {
        toCall = Math.min(toCall, playerChips); // all in case
        setPlayerChips((prev) => prev - toCall);
        setPlayerBet((prev) => prev + toCall);
        setPot((prev) => prev + toCall);
        setMessage("You called.");
      } else {
        setMessage("You checked.");
      }
      setTurn("ai");
    } else if (action === "raise") {
      const raiseAmt = toCall + BLIND * 2;
      const actualRaise = Math.min(raiseAmt, playerChips);
      setPlayerChips((prev) => prev - actualRaise);
      setPlayerBet((prev) => prev + actualRaise);
      setPot((prev) => prev + actualRaise);
      setMessage(`You raised ${actualRaise}.`);
      setTurn("ai");
    }
  };

  // Simple AI logic
  useEffect(() => {
    if (turn === "ai" && phase !== "showdown" && phase !== "game-over") {
      const timer = setTimeout(() => {
        let toCall = Math.max(0, playerBet - aiBet);

        // Very basic AI decision
        const random = Math.random();

        if (toCall > aiChips / 2 && random < 0.3) {
          // Fold if bet is too big and bad luck
          setMessage("AI folded. You win the pot!");
          setPlayerChips((prev) => prev + pot);
          setPot(0);
          setPhase("showdown");
        } else if (toCall > 0) {
          // Just call
          toCall = Math.min(toCall, aiChips);
          setAiChips((prev) => prev - toCall);
          setAiBet((prev) => prev + toCall);
          setPot((prev) => prev + toCall);
          setMessage("AI called.");
          advancePhase();
        } else {
          // Check or random small bet
          if (random < 0.2 && aiChips > BLIND) {
            // 20% bluff/bet
            const betAmt = Math.min(BLIND * 2, aiChips);
            setAiChips((prev) => prev - betAmt);
            setAiBet((prev) => prev + betAmt);
            setPot((prev) => prev + betAmt);
            setMessage(`AI bets ${betAmt}.`);
            setTurn("player");
          } else {
            setMessage("AI checked.");
            advancePhase();
          }
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [turn, phase, playerBet, aiBet, aiChips, pot, advancePhase]);

  const canCheck = playerBet >= aiBet;
  const toCallAmt = Math.max(0, aiBet - playerBet);

  return (
    <div className="flex flex-col items-center h-full w-full py-6 text-slate-200">
      <div className="bg-emerald-950 border-4 border-emerald-900 rounded-3xl p-6 shadow-2xl flex flex-col w-full max-w-4xl relative overflow-hidden">
        {/* Pot and Messages */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-0 pointer-events-none w-full px-4 text-center">
          <div className="bg-black/40 px-6 py-2 rounded-full mb-4 border border-emerald-700/50 backdrop-blur-sm">
            <span className="text-emerald-400 font-bold tracking-widest uppercase text-sm">
              Pot
            </span>
            <span className="text-white ml-3 text-xl font-mono">${pot}</span>
          </div>
          <div className="text-white/90 text-lg font-medium drop-shadow-md bg-black/30 px-4 py-1 rounded-xl">
            {message}
          </div>
        </div>

        {/* AI Area */}
        <div className="flex justify-between items-start w-full z-10 mb-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-700">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                <span className="text-xs font-bold">AI</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-400 uppercase font-bold">
                  AI Opponent
                </span>
                <span className="text-lg font-mono text-white flex items-center gap-1">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  {aiChips}
                </span>
              </div>
            </div>
            {aiBet > 0 && (
              <div className="self-start bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-xs font-bold border border-yellow-500/30">
                Bet: ${aiBet}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {aiHand.map((card, i) => (
              <PlayingCard key={i} card={card} hidden={phase !== "showdown"} />
            ))}
          </div>
        </div>

        {/* Community Cards */}
        <div className="flex justify-center gap-2 min-h-[112px] my-4 z-10">
          {communityCards.map((card, i) => (
            <PlayingCard key={i} card={card} />
          ))}
        </div>

        {/* Player Area */}
        <div className="flex justify-between items-end w-full z-10 mt-8">
          <div className="flex gap-2">
            {playerHand.map((card, i) => (
              <PlayingCard key={i} card={card} />
            ))}
          </div>

          <div className="flex flex-col items-end gap-2">
            {playerBet > 0 && (
              <div className="bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-xs font-bold border border-yellow-500/30">
                Bet: ${playerBet}
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-700">
              <div className="flex flex-col items-end">
                <span className="text-xs text-slate-400 uppercase font-bold">
                  You
                </span>
                <span className="text-lg font-mono text-white flex items-center gap-1">
                  {playerChips}
                  <Coins className="w-4 h-4 text-yellow-500" />
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                <span className="text-xs font-bold">P1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 flex justify-center gap-4 z-10 flex-wrap">
          {phase === "showdown" ? (
            <button
              onClick={dealNewHand}
              className="flex items-center gap-2 px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-cyan-500/20 hover:-translate-y-0.5 active:translate-y-0"
            >
              <RefreshCw className="w-5 h-5" />
              Next Hand
            </button>
          ) : (
            <>
              <button
                onClick={() => handlePlayerAction("fold")}
                disabled={turn !== "player"}
                className="px-6 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/50 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Fold
              </button>
              <button
                onClick={() => handlePlayerAction(canCheck ? "check" : "call")}
                disabled={turn !== "player"}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600"
              >
                {canCheck ? "Check" : `Call $${toCallAmt}`}
              </button>
              <button
                onClick={() => handlePlayerAction("raise")}
                disabled={turn !== "player" || playerChips <= toCallAmt}
                className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                Raise ${BLIND * 2 + toCallAmt}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
