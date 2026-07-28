import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  activeRooms,
  generateRoomId,
  startGame,
  advanceGamePhase,
  GameRoom,
  Player,
  logGameEvent
} from "../lib/gameEngine";

const SUPABASE_URL = "https://vqmukrmpgvavscsyefqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export const gameRouter = Router();

// Middleware to authenticate user via JWT
async function authenticateUser(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization token" });
  }
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return res.status(401).json({ error: "Invalid token or user not authenticated" });
  }

  (req as any).user = user;
  (req as any).token = token;
  next();
}

/**
 * POST /api/social-deduction/create
 * Create a new game room
 */
gameRouter.post("/create", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { aiModel } = req.body;
  const roomId = generateRoomId();

  const newRoom: GameRoom = {
    roomId,
    creatorId: user.id,
    players: [
      {
        seat: 1,
        name: user.email?.split("@")[0] || "Player1",
        isAi: false,
        role: "",
        faction: "Town",
        subalignment: "Support",
        isAlive: true,
        will: "",
        authUserId: user.id
      }
    ],
    phase: "Lobby",
    day: 1,
    logs: [],
    messages: [],
    defendantSeat: null,
    trialVoters: {},
    lastWills: {},
    aiModel: aiModel || "Smart",
    isAiRunning: false
  };

  activeRooms.set(roomId, newRoom);
  logGameEvent(newRoom, `Lobby created by ${user.email}`);

  res.json({ roomId, room: newRoom });
});

/**
 * POST /api/social-deduction/join
 * Join an existing lobby
 */
gameRouter.post("/join", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId } = req.body;

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (room.phase !== "Lobby") {
    return res.status(400).json({ error: "Game has already started" });
  }

  if (room.players.length >= 15) {
    return res.status(400).json({ error: "Lobby is full" });
  }

  // Check if player already in lobby
  if (room.players.some((p) => p.authUserId === user.id)) {
    return res.json({ room });
  }

  const nextSeat = room.players.length + 1;
  const newPlayer: Player = {
    seat: nextSeat,
    name: user.email?.split("@")[0] || `Player${nextSeat}`,
    isAi: false,
    role: "",
    faction: "Town",
    subalignment: "Support",
    isAlive: true,
    will: "",
    authUserId: user.id
  };

  room.players.push(newPlayer);
  logGameEvent(room, `${newPlayer.name} joined the lobby at Seat ${nextSeat}.`);

  res.json({ room });
});

/**
 * POST /api/social-deduction/start
 * Start the game and fill empty slots with AI
 */
gameRouter.post("/start", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, numPlayers } = req.body;

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (room.creatorId !== user.id) {
    return res.status(403).json({ error: "Only the creator can start the game" });
  }

  // Autofill empty seats with LLM AI players up to requested count
  const targetCount = numPlayers || 10;
  if (targetCount < 5 || targetCount > 15) {
    return res.status(400).json({ error: "Recommended lobby count must be between 5 and 15 players." });
  }

  const currentCount = room.players.length;
  if (currentCount < targetCount) {
    const aiNames = [
      "Sherlock", "Watson", "Moriarty", "Alice", "Bob",
      "Charlie", "Gaston", "Bramble", "Arthur", "Merlin"
    ];

    for (let i = currentCount; i < targetCount; i++) {
      const nextSeat = i + 1;
      const aiName = aiNames[(nextSeat - 1) % aiNames.length] + `_AI`;
      room.players.push({
        seat: nextSeat,
        name: aiName,
        isAi: true,
        role: "",
        faction: "Town",
        subalignment: "Support",
        isAlive: true,
        will: "",
        aiModel: room.aiModel
      });
    }
  }

  startGame(room);
  res.json({ room });
});

/**
 * GET /api/social-deduction/sync
 * Sync latest game room state
 */
gameRouter.get("/sync", authenticateUser, (req, res) => {
  const { roomId } = req.query;
  const room = activeRooms.get(String(roomId)?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json({ room });
});

/**
 * POST /api/social-deduction/speak
 * Human player speaks in Day / Trial phase
 */
gameRouter.post("/speak", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, text, isFactionOnly } = req.body;

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive) {
    return res.status(403).json({ error: "Only living players can speak." });
  }

  room.messages.push({
    senderSeat: player.seat,
    senderName: player.name,
    text,
    isFactionOnly: !!isFactionOnly,
    round: 1,
    phase: room.phase,
    day: room.day
  });

  res.json({ room });
});

/**
 * POST /api/social-deduction/vote
 * Human player submits their vote
 */
gameRouter.post("/vote", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, targetSeat } = req.body;

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive) {
    return res.status(403).json({ error: "Only active players can vote." });
  }

  player.voteTarget = targetSeat;
  logGameEvent(room, `${player.name} voted for Seat ${targetSeat}`);

  res.json({ room });
});

/**
 * POST /api/social-deduction/verdict
 * Human player submits guilty/innocent trial verdict
 */
gameRouter.post("/verdict", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, verdict } = req.body; // "Guilty" | "Innocent" | "Abstain"

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive) {
    return res.status(403).json({ error: "Only active players can vote verdict." });
  }

  player.defenseVotes = verdict;
  room.trialVoters[player.seat] = verdict;
  logGameEvent(room, `${player.name} voted verdict: ${verdict}`);

  res.json({ room });
});

/**
 * POST /api/social-deduction/action
 * Human player submits night actions
 */
gameRouter.post("/action", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, targetSeat, ability } = req.body;

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive) {
    return res.status(403).json({ error: "Only active players can take night actions." });
  }

  player.nightActionTarget = targetSeat;
  player.nightActionAbility = ability;
  logGameEvent(room, `${player.name} queued night target on Seat ${targetSeat}`);

  res.json({ room });
});

/**
 * POST /api/social-deduction/will
 * Human player updates their last will
 */
gameRouter.post("/will", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, will } = req.body;

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (player) {
    player.will = will;
    room.lastWills[player.seat] = will;
  }

  res.json({ room });
});

/**
 * POST /api/social-deduction/advance
 * Manually advance phase (for humans playing, triggering AI speech and state transition)
 */
gameRouter.post("/advance", authenticateUser, async (req, res) => {
  const { roomId } = req.body;
  const token = (req as any).token;

  const room = activeRooms.get(roomId?.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  await advanceGamePhase(room, token);
  res.json({ room });
});
