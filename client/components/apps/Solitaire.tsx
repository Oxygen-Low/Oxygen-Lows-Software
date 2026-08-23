import React, { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import {
  Card as CardUI,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Suit = "hearts" | "diamonds" | "clubs" | "spades";
interface Card {
  id: string;
  suit: Suit;
  value: number;
  faceUp: boolean;
}

interface GameState {
  deck: Card[];
  waste: Card[];
  tableau: Card[][];
  foundation: Card[][];
}

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = Array.from({ length: 13 }, (_, i) => i + 1);

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ id: `${suit}-${value}`, suit, value, faceUp: false });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getCardColor(suit: Suit) {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

function getSuitSymbol(suit: Suit) {
  switch (suit) {
    case "hearts":
      return "♥";
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
    case "spades":
      return "♠";
  }
}

function getValueSymbol(value: number) {
  switch (value) {
    case 1:
      return "A";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    default:
      return value.toString();
  }
}

const DraggableCard = ({
  card,
  pileType,
  pileIndex,
  cardIndex,
  children,
}: any) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: card.id,
      data: { card, pileType, pileIndex, cardIndex },
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`${isDragging ? "opacity-50" : ""}`}
    >
      {children}
    </div>
  );
};

const DroppablePile = ({ id, children, className }: any) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "ring-2 ring-cyan-500 rounded-md" : ""}`}
    >
      {children}
    </div>
  );
};

const CardView = ({ card }: { card: Card }) => {
  if (!card.faceUp) {
    return (
      <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-md bg-blue-800 border-2 border-white/20 shadow-md flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')]">
        <div className="w-12 h-20 sm:w-16 sm:h-24 border border-white/10 rounded" />
      </div>
    );
  }

  const isRed = getCardColor(card.suit) === "red";
  return (
    <div
      className={`w-16 h-24 sm:w-20 sm:h-28 rounded-md bg-white border border-gray-300 shadow-md flex flex-col justify-between p-1.5 ${isRed ? "text-red-500" : "text-slate-900"}`}
    >
      <div className="text-sm sm:text-base font-bold leading-none">
        {getValueSymbol(card.value)}
      </div>
      <div className="text-2xl sm:text-4xl text-center self-center">
        {getSuitSymbol(card.suit)}
      </div>
      <div className="text-sm sm:text-base font-bold leading-none self-end rotate-180">
        {getValueSymbol(card.value)}
      </div>
    </div>
  );
};

export function SolitaireApp() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  useEffect(() => {
    startNewGame();
  }, []);

  const startNewGame = () => {
    const deck = createDeck();
    const tableau: Card[][] = Array.from({ length: 7 }, () => []);

    // Deal tableau
    for (let i = 0; i < 7; i++) {
      for (let j = i; j < 7; j++) {
        const card = deck.pop()!;
        if (i === j) card.faceUp = true;
        tableau[j].push(card);
      }
    }

    setGameState({
      deck,
      waste: [],
      tableau,
      foundation: [[], [], [], []],
    });
  };

  const handleDeckClick = () => {
    if (!gameState) return;
    setGameState((prev) => {
      if (!prev) return prev;
      const next = { ...prev };

      if (next.deck.length === 0) {
        // Recycle waste to deck
        if (next.waste.length === 0) return prev;
        next.deck = [...next.waste]
          .reverse()
          .map((c) => ({ ...c, faceUp: false }));
        next.waste = [];
      } else {
        // Draw 1 card
        const card = next.deck.pop()!;
        card.faceUp = true;
        next.waste = [...next.waste, card];
      }
      return next;
    });
  };

  const checkWinCondition = (state: GameState) => {
    const isWon = state.foundation.every((pile) => pile.length === 13);
    if (isWon) {
      toast.success("Congratulations! You won!");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const cardData = active.data.current?.card as Card;
    if (cardData && !cardData.faceUp) return; // Prevent dragging face down cards
    setActiveId(active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !gameState) return;

    const activeData = active.data.current;
    if (!activeData || !activeData.card) return;

    const sourcePileType = activeData.pileType;
    const sourcePileIndex = activeData.pileIndex;
    const sourceCardIndex = activeData.cardIndex;

    // Parse target
    const overId = over.id as string;
    let targetPileType = "";
    let targetPileIndex = -1;

    if (overId.startsWith("tableau-")) {
      targetPileType = "tableau";
      targetPileIndex = parseInt(overId.replace("tableau-", ""));
    } else if (overId.startsWith("foundation-")) {
      targetPileType = "foundation";
      targetPileIndex = parseInt(overId.replace("foundation-", ""));
    }

    if (!targetPileType || targetPileIndex === -1) return;

    setGameState((prev) => {
      if (!prev) return prev;
      const next = {
        deck: [...prev.deck],
        waste: [...prev.waste],
        tableau: prev.tableau.map((p) => [...p]),
        foundation: prev.foundation.map((p) => [...p]),
      };

      // Get dragged cards
      let draggedCards: Card[] = [];
      if (sourcePileType === "waste") {
        draggedCards = [next.waste[next.waste.length - 1]];
      } else if (sourcePileType === "foundation") {
        draggedCards = [
          next.foundation[sourcePileIndex][
            next.foundation[sourcePileIndex].length - 1
          ],
        ];
      } else if (sourcePileType === "tableau") {
        draggedCards = next.tableau[sourcePileIndex].slice(sourceCardIndex);
      }

      const topCard = draggedCards[0];

      // Validate move
      let isValidMove = false;

      if (targetPileType === "foundation") {
        // Can only move one card to foundation
        if (draggedCards.length !== 1) return prev;

        const targetPile = next.foundation[targetPileIndex];
        if (targetPile.length === 0) {
          isValidMove = topCard.value === 1; // Must be Ace
        } else {
          const targetTop = targetPile[targetPile.length - 1];
          isValidMove =
            topCard.suit === targetTop.suit &&
            topCard.value === targetTop.value + 1;
        }
      } else if (targetPileType === "tableau") {
        const targetPile = next.tableau[targetPileIndex];
        if (targetPile.length === 0) {
          isValidMove = topCard.value === 13; // Must be King
        } else {
          const targetTop = targetPile[targetPile.length - 1];
          isValidMove =
            getCardColor(topCard.suit) !== getCardColor(targetTop.suit) &&
            topCard.value === targetTop.value - 1;
        }
      }

      if (!isValidMove) return prev;

      // Apply move
      if (sourcePileType === "waste") {
        next.waste.pop();
      } else if (sourcePileType === "foundation") {
        next.foundation[sourcePileIndex].pop();
      } else if (sourcePileType === "tableau") {
        next.tableau[sourcePileIndex] = next.tableau[sourcePileIndex].slice(
          0,
          sourceCardIndex,
        );
        // Flip new top card of source pile
        if (next.tableau[sourcePileIndex].length > 0) {
          const newTop =
            next.tableau[sourcePileIndex][
              next.tableau[sourcePileIndex].length - 1
            ];
          if (!newTop.faceUp) {
            newTop.faceUp = true;
          }
        }
      }

      if (targetPileType === "foundation") {
        next.foundation[targetPileIndex].push(draggedCards[0]);
      } else if (targetPileType === "tableau") {
        next.tableau[targetPileIndex].push(...draggedCards);
      }

      setTimeout(() => checkWinCondition(next), 100);
      return next;
    });
  };

  if (!gameState) return null;

  const activeCardData = activeId
    ? gameState.waste.find((c) => c.id === activeId) ||
      gameState.foundation.flat().find((c) => c.id === activeId) ||
      gameState.tableau.flat().find((c) => c.id === activeId)
    : null;

  // Find dragged cards for overlay
  let draggedCardsForOverlay: Card[] = [];
  if (activeId) {
    // Determine source
    for (let i = 0; i < 7; i++) {
      const idx = gameState.tableau[i].findIndex((c) => c.id === activeId);
      if (idx !== -1) {
        draggedCardsForOverlay = gameState.tableau[i].slice(idx);
        break;
      }
    }
    if (draggedCardsForOverlay.length === 0) {
      if (activeCardData) draggedCardsForOverlay = [activeCardData];
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full w-full bg-[#185536] rounded-xl overflow-hidden shadow-xl border border-white/10 select-none">
        <div className="flex items-center justify-between p-4 bg-black/20 text-white">
          <h2 className="text-xl font-bold font-serif flex items-center gap-2">
            <span className="text-2xl">♠</span> Solitaire
          </h2>
          <Button
            onClick={startNewGame}
            variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            New Game
          </Button>
        </div>

        <div className="flex-1 p-4 sm:p-6 overflow-auto">
          <div className="max-w-4xl mx-auto min-w-[700px]">
            {/* Top Row: Deck, Waste, Foundation */}
            <div className="flex justify-between mb-8">
              <div className="flex gap-4">
                {/* Deck */}
                <div
                  className="w-16 h-24 sm:w-20 sm:h-28 rounded-md bg-black/20 border-2 border-white/10 flex items-center justify-center cursor-pointer hover:bg-black/30 transition-colors"
                  onClick={handleDeckClick}
                >
                  {gameState.deck.length > 0 ? (
                    <div className="w-full h-full rounded-md bg-blue-800 border-2 border-white/20 flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')]">
                      <RefreshCw className="w-6 h-6 text-white/50 opacity-0" />
                    </div>
                  ) : (
                    <RefreshCw className="w-8 h-8 text-white/30" />
                  )}
                </div>

                {/* Waste */}
                <div className="w-16 h-24 sm:w-20 sm:h-28 relative">
                  {gameState.waste.map((card, i) => (
                    <div
                      key={card.id}
                      className="absolute inset-0"
                      style={{
                        transform: `translateX(${Math.min(i, 2) * 2}px)`,
                      }}
                    >
                      {i === gameState.waste.length - 1 ? (
                        <DraggableCard
                          card={card}
                          pileType="waste"
                          pileIndex={0}
                          cardIndex={i}
                        >
                          <CardView card={card} />
                        </DraggableCard>
                      ) : (
                        <CardView card={card} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Foundation */}
              <div className="flex gap-4">
                {gameState.foundation.map((pile, i) => (
                  <DroppablePile
                    key={`foundation-${i}`}
                    id={`foundation-${i}`}
                    className="w-16 h-24 sm:w-20 sm:h-28 rounded-md bg-black/20 border-2 border-white/10 relative flex items-center justify-center"
                  >
                    {pile.length === 0 && (
                      <div className="text-4xl text-white/10 absolute font-serif">
                        A
                      </div>
                    )}
                    {pile.map((card, j) => (
                      <div key={card.id} className="absolute inset-0">
                        {j === pile.length - 1 ? (
                          <DraggableCard
                            card={card}
                            pileType="foundation"
                            pileIndex={i}
                            cardIndex={j}
                          >
                            <CardView card={card} />
                          </DraggableCard>
                        ) : (
                          <CardView card={card} />
                        )}
                      </div>
                    ))}
                  </DroppablePile>
                ))}
              </div>
            </div>

            {/* Bottom Row: Tableau */}
            <div className="flex justify-between gap-4">
              {gameState.tableau.map((pile, i) => (
                <DroppablePile
                  key={`tableau-${i}`}
                  id={`tableau-${i}`}
                  className="flex-1 min-h-[400px] relative"
                >
                  <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-md bg-black/10 border-2 border-white/5 absolute top-0 left-1/2 -translate-x-1/2" />

                  {pile.map((card, j) => (
                    <div
                      key={card.id}
                      className="absolute top-0 left-1/2 -translate-x-1/2"
                      style={{ top: `${j * 24}px` }}
                    >
                      {card.faceUp ? (
                        <DraggableCard
                          card={card}
                          pileType="tableau"
                          pileIndex={i}
                          cardIndex={j}
                        >
                          <CardView card={card} />
                        </DraggableCard>
                      ) : (
                        <CardView card={card} />
                      )}
                    </div>
                  ))}
                </DroppablePile>
              ))}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeId && draggedCardsForOverlay.length > 0 ? (
            <div className="relative pointer-events-none">
              {draggedCardsForOverlay.map((card, j) => (
                <div
                  key={card.id}
                  className="absolute top-0 left-0"
                  style={{ top: `${j * 24}px` }}
                >
                  <CardView card={card} />
                </div>
              ))}
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
