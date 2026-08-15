import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw, Trophy, Hash } from "lucide-react";

const CATEGORIES: Record<string, string[]> = {
  "Animals": ["DOG", "CAT", "ELEPHANT", "LION", "TIGER", "GIRAFFE", "MONKEY", "ZEBRA", "BEAR", "WOLF", "KANGAROO", "PENGUIN", "DOLPHIN", "WHALE", "SHARK"],
  "Fruits": ["APPLE", "BANANA", "ORANGE", "GRAPE", "STRAWBERRY", "WATERMELON", "MANGO", "PINEAPPLE", "KIWI", "PEACH", "CHERRY", "PEAR", "PLUM", "LEMON", "LIME"],
  "Countries": ["JAPAN", "BRAZIL", "CANADA", "FRANCE", "GERMANY", "ITALY", "SPAIN", "MEXICO", "INDIA", "CHINA", "EGYPT", "AUSTRALIA", "KENYA", "PERU", "CHILE"],
  "Colors": ["RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE", "PINK", "BROWN", "BLACK", "WHITE", "GRAY", "CYAN", "MAGENTA", "INDIGO", "VIOLET"],
  "Sports": ["SOCCER", "BASKETBALL", "TENNIS", "BASEBALL", "GOLF", "VOLLEYBALL", "RUGBY", "CRICKET", "HOCKEY", "BOXING", "SWIMMING", "CYCLING", "SKATING", "SKIING", "SURFING"],
  "Vehicles": ["CAR", "TRUCK", "BUS", "BICYCLE", "MOTORCYCLE", "AIRPLANE", "HELICOPTER", "BOAT", "SHIP", "TRAIN", "SUBWAY", "TRACTOR", "SCOOTER", "VAN", "AMBULANCE"],
  "Vegetables": ["CARROT", "BROCCOLI", "SPINACH", "POTATO", "TOMATO", "ONION", "GARLIC", "PEPPER", "CABBAGE", "LETTUCE", "CUCUMBER", "CELERY", "RADISH", "TURNIP", "PEA"],
  "Programming": ["REACT", "TYPESCRIPT", "PYTHON", "JAVA", "GOLANG", "RUST", "SWIFT", "KOTLIN", "RUBY", "PHP", "SCALA", "HASKELL", "CLOJURE", "ELIXIR", "DART"],
  "Instruments": ["PIANO", "GUITAR", "VIOLIN", "DRUM", "FLUTE", "TRUMPET", "SAXOPHONE", "CELLO", "BASS", "HARP", "CLARINET", "TROMBONE", "UKULELE", "BANJO", "ACCORDION"],
  "Professions": ["DOCTOR", "NURSE", "TEACHER", "ENGINEER", "PILOT", "FARMER", "ARTIST", "CHEF", "ACTOR", "SINGER", "POLICE", "LAWYER", "WRITER", "DENTIST", "BAKER"],
  "Weather": ["RAIN", "SNOW", "SUN", "CLOUD", "WIND", "STORM", "FOG", "HAIL", "TORNADO", "HURRICANE", "BREEZE", "BLIZZARD", "THUNDER", "LIGHTNING", "FROST"],
  "Clothing": ["SHIRT", "PANTS", "DRESS", "SKIRT", "JACKET", "COAT", "SWEATER", "SOCKS", "SHOES", "HAT", "GLOVES", "SCARF", "BELT", "TIE", "BOOTS"],
  "Furniture": ["CHAIR", "TABLE", "SOFA", "BED", "DESK", "CABINET", "WARDROBE", "SHELF", "DRESSER", "COUCH", "STOOL", "BENCH", "FUTON", "HAMMOCK", "OTTOMAN"],
  "Kitchen": ["PLATE", "BOWL", "CUP", "GLASS", "FORK", "KNIFE", "SPOON", "PAN", "POT", "SPATULA", "WHISK", "BLENDER", "TOASTER", "OVEN", "MICROWAVE"],
  "Astronomy": ["SUN", "MOON", "STAR", "PLANET", "GALAXY", "COMET", "ASTEROID", "METEOR", "ORBIT", "ECLIPSE", "NEBULA", "QUASAR", "PULSAR", "COSMOS", "SPACE"],
  "Body Parts": ["HEAD", "EYE", "EAR", "NOSE", "MOUTH", "ARM", "HAND", "FINGER", "LEG", "FOOT", "TOE", "KNEE", "ELBOW", "SHOULDER", "HEART"],
  "Shapes": ["CIRCLE", "SQUARE", "TRIANGLE", "RECTANGLE", "OVAL", "DIAMOND", "STAR", "HEART", "PENTAGON", "HEXAGON", "OCTAGON", "SPHERE", "CUBE", "CONE", "CYLINDER"],
  "School Subjects": ["MATH", "SCIENCE", "HISTORY", "GEOGRAPHY", "ENGLISH", "PHYSICS", "BIOLOGY", "CHEMISTRY", "ART", "MUSIC", "DRAMA", "LATIN", "FRENCH", "SPANISH", "ALGEBRA"],
  "Emotions": ["HAPPY", "SAD", "ANGRY", "AFRAID", "JOY", "SORROW", "FEAR", "DISGUST", "SURPRISE", "TRUST", "LOVE", "HATE", "PRIDE", "SHAME", "GUILT"],
  "Birds": ["EAGLE", "HAWK", "OWL", "PIGEON", "DOVE", "SWAN", "DUCK", "GOOSE", "ROBIN", "SPARROW", "PARROT", "CROW", "RAVEN", "PEACOCK", "PENGUIN"]
};

const GRID_SIZE = 12;

type Point = { r: number; c: number };

const generateBoard = () => {
  const grid: string[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(""));
  const wordsToFind: string[] = [];
  
  const categoryNames = Object.keys(CATEGORIES);
  const randomCategory = categoryNames[Math.floor(Math.random() * categoryNames.length)];
  const categoryWords = CATEGORIES[randomCategory];
  
  // Select 10 random words from the chosen category
  const selectedWords = [...categoryWords].sort(() => 0.5 - Math.random()).slice(0, 10);
  
  for (const word of selectedWords) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 200) {
      attempts++;
      const r = Math.floor(Math.random() * GRID_SIZE);
      const c = Math.floor(Math.random() * GRID_SIZE);
      const dirR = Math.floor(Math.random() * 3) - 1;
      const dirC = Math.floor(Math.random() * 3) - 1;
      if (dirR === 0 && dirC === 0) continue;
      
      let canPlace = true;
      for (let i = 0; i < word.length; i++) {
        const nr = r + i * dirR;
        const nc = c + i * dirC;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) {
          canPlace = false; break;
        }
        if (grid[nr][nc] !== "" && grid[nr][nc] !== word[i]) {
          canPlace = false; break;
        }
      }
      
      if (canPlace) {
        for (let i = 0; i < word.length; i++) {
          grid[r + i * dirR][c + i * dirC] = word[i];
        }
        wordsToFind.push(word);
        placed = true;
      }
    }
  }
  
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === "") {
        grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
      }
    }
  }
  
  return { grid, wordsToFind: wordsToFind.sort(), category: randomCategory };
};

const getLineCells = (start: Point, end: Point) => {
  const dr = end.r - start.r;
  const dc = end.c - start.c;
  
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [];
  
  const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
  const stepC = dc === 0 ? 0 : dc / Math.abs(dc);
  const len = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  
  const cells = [];
  for (let i = 0; i < len; i++) {
    cells.push({ r: start.r + i * stepR, c: start.c + i * stepC });
  }
  return cells;
};

export function WordSearchApp() {
  const [grid, setGrid] = useState<string[][]>([]);
  const [wordsToFind, setWordsToFind] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("");
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [foundCells, setFoundCells] = useState<Set<string>>(new Set());
  
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [currentHover, setCurrentHover] = useState<Point | null>(null);
  const [clickStart, setClickStart] = useState<Point | null>(null);

  const initGame = useCallback(() => {
    const { grid: newGrid, wordsToFind: newWords, category: newCategory } = generateBoard();
    setGrid(newGrid);
    setWordsToFind(newWords);
    setCategory(newCategory);
    setFoundWords(new Set());
    setFoundCells(new Set());
    setIsDragging(false);
    setSelectionStart(null);
    setCurrentHover(null);
    setClickStart(null);
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const checkSelection = (start: Point, end: Point) => {
    const cells = getLineCells(start, end);
    if (cells.length === 0) return;
    
    const word = cells.map(cell => grid[cell.r][cell.c]).join("");
    const reverseWord = word.split("").reverse().join("");
    
    if (wordsToFind.includes(word) && !foundWords.has(word)) {
      setFoundWords(prev => new Set(prev).add(word));
      setFoundCells(prev => {
        const next = new Set(prev);
        cells.forEach(c => next.add(`${c.r},${c.c}`));
        return next;
      });
    } else if (wordsToFind.includes(reverseWord) && !foundWords.has(reverseWord)) {
      setFoundWords(prev => new Set(prev).add(reverseWord));
      setFoundCells(prev => {
        const next = new Set(prev);
        cells.forEach(c => next.add(`${c.r},${c.c}`));
        return next;
      });
    }
  };

  const handlePointerDown = (r: number, c: number) => {
    if (clickStart) {
      checkSelection(clickStart, { r, c });
      setClickStart(null);
      setCurrentHover(null);
    } else {
      setIsDragging(true);
      setSelectionStart({ r, c });
      setCurrentHover({ r, c });
    }
  };

  const handlePointerEnter = (r: number, c: number) => {
    if (isDragging) {
      setCurrentHover({ r, c });
    } else if (clickStart) {
      setCurrentHover({ r, c });
    }
  };

  const handlePointerUp = () => {
    if (isDragging) {
      setIsDragging(false);
      if (selectionStart && currentHover) {
        if (selectionStart.r !== currentHover.r || selectionStart.c !== currentHover.c) {
          // Drag end
          checkSelection(selectionStart, currentHover);
          setSelectionStart(null);
          setCurrentHover(null);
        } else {
          // It was just a click
          setClickStart(selectionStart);
          setSelectionStart(null);
        }
      }
    }
  };

  const handlePointerLeave = () => {
    // Left empty intentionally.
  };
  
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setSelectionStart(null);
        setCurrentHover(null);
      }
    };
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => window.removeEventListener("pointerup", handleGlobalPointerUp);
  }, [isDragging]);

  const activeHighlightCells = new Set<string>();
  if ((isDragging && selectionStart && currentHover) || (clickStart && currentHover)) {
    const start = isDragging ? selectionStart! : clickStart!;
    const cells = getLineCells(start, currentHover);
    cells.forEach(c => activeHighlightCells.add(`${c.r},${c.c}`));
  }

  const isWin = foundWords.size === wordsToFind.length && wordsToFind.length > 0;

  return (
    <div className="flex flex-col md:flex-row gap-8 items-start w-full max-w-5xl mx-auto p-4 select-none touch-none">
      <div className="flex-1 space-y-6 w-full max-w-md mx-auto md:mx-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Word Search</h2>
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Hash className="w-4 h-4" />
              <span className="font-medium text-cyan-400">{category}</span>
              <span>•</span>
              <span>{wordsToFind.length} words</span>
            </div>
          </div>
          <Button onClick={initGame} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            New Game
          </Button>
        </div>

        {isWin && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center animate-in fade-in zoom-in duration-500">
            <Trophy className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">You Won!</h3>
            <p className="text-green-300">All words found in the {category} category!</p>
            <Button onClick={initGame} className="mt-4 bg-green-600 hover:bg-green-500 text-white">
              Play Again
            </Button>
          </div>
        )}

        <div 
          className="bg-slate-900 border border-slate-800 rounded-xl p-2 md:p-4 aspect-square flex flex-col justify-between"
          onPointerLeave={handlePointerLeave}
        >
          {grid.map((row, r) => (
            <div key={r} className="flex justify-between flex-1">
              {row.map((letter, c) => {
                const cellKey = `${r},${c}`;
                const isFound = foundCells.has(cellKey);
                const isActiveHighlight = activeHighlightCells.has(cellKey);
                const isStartOrEnd = 
                  (selectionStart?.r === r && selectionStart?.c === c) || 
                  (clickStart?.r === r && clickStart?.c === c) ||
                  (currentHover?.r === r && currentHover?.c === c && (isDragging || clickStart));
                
                return (
                  <div
                    key={cellKey}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'touch') e.preventDefault();
                      handlePointerDown(r, c);
                    }}
                    onPointerEnter={() => handlePointerEnter(r, c)}
                    onPointerUp={handlePointerUp}
                    className={cn(
                      "flex-1 m-0.5 md:m-1 flex items-center justify-center rounded-md md:rounded-lg text-sm md:text-xl font-bold cursor-pointer transition-colors duration-150",
                      isActiveHighlight ? "bg-cyan-500 text-white shadow-sm" :
                      isFound ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                      "bg-slate-800/50 text-slate-300 hover:bg-slate-800",
                      isStartOrEnd && isActiveHighlight && "bg-cyan-400"
                    )}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full md:w-64 space-y-4 shrink-0">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 md:p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            Words to Find
            <span className="bg-slate-800 text-xs py-1 px-2 rounded-full text-slate-300">
              {foundWords.size}/{wordsToFind.length}
            </span>
          </h3>
          <ul className="grid grid-cols-2 md:grid-cols-1 gap-2">
            {wordsToFind.map((word) => (
              <li 
                key={word}
                className={cn(
                  "font-medium transition-all duration-300",
                  foundWords.has(word) 
                    ? "text-slate-500 line-through decoration-slate-600 decoration-2" 
                    : "text-slate-200"
                )}
              >
                {word}
              </li>
            ))}
          </ul>
        </div>
        
        <div className="text-xs text-slate-500 p-2">
          <p><strong>Tip:</strong> You can click and drag to select words, or click the first letter and then the last letter.</p>
        </div>
      </div>
    </div>
  );
}
