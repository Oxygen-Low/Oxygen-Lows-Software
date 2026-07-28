import { Router, Request, Response, RequestHandler } from "express";
import { getAuthenticatedClient } from "../lib/supabase";
import {
  activeRooms,
  generateRoomId,
  startGame,
  advanceGamePhase,
  GameRoom,
  Player,
  logGameEvent
} from "../lib/gameEngine";
import { roleRegistry, Faction, Subalignment } from "../../shared/roleRegistry";
import { rateLimit } from "express-rate-limit";

export const gameRouter = Router();

// Stricter limiter per user for `/create` to protect activeRooms memory usage
const createLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 5, // Limit each IP or user to 5 room creations per minute
  message: { error: "Too many rooms created. Please wait before hosting another." },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Normalization helper for Room IDs
 */
export function normalizeRoomId(roomId: any): string {
  if (typeof roomId !== "string" || !roomId.trim()) {
    throw new Error("Invalid Room ID specified.");
  }
  return roomId.trim().toUpperCase();
}

// Middleware to authenticate user via standard JWT and getAuthenticatedClient helper
const authenticateUser: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "No authorization token" });
    return;
  }
  const token = authHeader.replace("Bearer ", "");

  try {
    const supabase = getAuthenticatedClient(token);
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      res.status(401).json({ error: "Invalid token or user not authenticated" });
      return;
    }

    (req as any).user = user;
    (req as any).token = token;
    next();
  } catch (err: any) {
    res.status(503).json({ error: "Supabase service unavailable: " + err.message });
  }
};

/**
 * Viewer-aware redaction helper
 * Hides other active players' roles, factions, and secret night actions,
 * and masks faction-only messages the requester is not allowed to see.
 * Additionally sanitizes lastWills and trialVoters maps for living other players.
 */
export function redactRoomState(room: GameRoom, userId: string): GameRoom {
  const requester = room.players.find((p) => p.authUserId === userId);
  if (!requester) return room; // No reduction if viewer not inside the game

  const sanitizedPlayers: Player[] = room.players.map((p) => {
    const isMe = p.authUserId === userId;
    if (isMe || !p.isAlive) {
      // Keep full data for self or dead players
      return { ...p };
    }
    // Redact secret details for active other players
    return {
      ...p,
      role: "",
      faction: "Town" as Faction, // Hide actual faction
      subalignment: "Support" as Subalignment,
      will: "", // Hide current active drafts
      nightActionTarget: undefined,
      nightActionAbility: undefined,
      voteTarget: undefined,
      defenseVotes: undefined
    };
  });

  const sanitizedMessages = room.messages.filter((m) => {
    if (!m.isFactionOnly) return true;
    // Faction messages only visible to members of the sender's same faction
    const sender = room.players.find((p) => p.seat === m.senderSeat);
    if (!sender) return false;
    return sender.faction === requester.faction;
  });

  // Redact global lastWills and trialVoters entries for other living players
  const sanitizedLastWills: { [seat: number]: string } = {};
  const sanitizedTrialVoters: { [voterSeat: number]: "Guilty" | "Innocent" | "Abstain" } = {};

  room.players.forEach((p) => {
    const isMe = p.authUserId === userId;
    if (isMe || !p.isAlive) {
      if (room.lastWills[p.seat] !== undefined) {
        sanitizedLastWills[p.seat] = room.lastWills[p.seat];
      }
      if (room.trialVoters[p.seat] !== undefined) {
        sanitizedTrialVoters[p.seat] = room.trialVoters[p.seat];
      }
    }
  });

  return {
    ...room,
    players: sanitizedPlayers,
    messages: sanitizedMessages,
    lastWills: sanitizedLastWills,
    trialVoters: sanitizedTrialVoters
  };
}

/**
 * Validation guard helper to validate incoming requests safely
 */
function validateRequestFields(fields: Record<string, { type: string; value: any; required?: boolean }>) {
  for (const [name, meta] of Object.entries(fields)) {
    if (meta.required && (meta.value === undefined || meta.value === null)) {
      throw new Error(`Missing required field: ${name}`);
    }
    if (meta.value !== undefined && meta.value !== null && typeof meta.value !== meta.type) {
      throw new Error(`Invalid field type for ${name}. Expected ${meta.type}`);
    }
  }
}

/**
 * Helper to get handle/display name instead of email
 */
function getPlayerDisplayName(user: any): string {
  if (user.user_metadata?.username) return user.user_metadata.username;
  if (user.email) return user.email.split("@")[0];
  return `Player_${user.id.substring(0, 5)}`;
}

/**
 * POST /api/social-deduction/create
 * Create a new game room (throttled)
 */
gameRouter.post("/create", authenticateUser, createLimiter, (req, res) => {
  const user = (req as any).user;
  const { aiModel } = req.body;

  try {
    validateRequestFields({
      aiModel: { type: "string", value: aiModel }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const roomId = generateRoomId();
  const handle = getPlayerDisplayName(user);

  const newRoom: GameRoom = {
    roomId,
    creatorId: user.id,
    players: [
      {
        seat: 1,
        name: handle,
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
    isAiRunning: false,
    lastActivity: Date.now()
  };

  activeRooms.set(roomId, newRoom);
  logGameEvent(newRoom, `Lobby created by user ID: ${user.id}`);

  res.json({ roomId, room: redactRoomState(newRoom, user.id) });
});

/**
 * POST /api/social-deduction/join
 * Join an existing lobby
 */
gameRouter.post("/join", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId } = req.body;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.phase !== "Lobby") {
    res.status(400).json({ error: "Game has already started" });
    return;
  }

  if (room.players.length >= 15) {
    res.status(400).json({ error: "Lobby is full" });
    return;
  }

  // Check if player already in lobby
  if (room.players.some((p) => p.authUserId === user.id)) {
    res.json({ room: redactRoomState(room, user.id) });
    return;
  }

  const nextSeat = room.players.length + 1;
  const handle = getPlayerDisplayName(user);
  const newPlayer: Player = {
    seat: nextSeat,
    name: handle,
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

  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * POST /api/social-deduction/start
 * Start the game and fill empty slots with AI
 */
gameRouter.post("/start", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, numPlayers } = req.body;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
    validateRequestFields({
      numPlayers: { type: "number", value: numPlayers }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.creatorId !== user.id) {
    res.status(403).json({ error: "Only the creator can start the game" });
    return;
  }

  if (room.phase !== "Lobby") {
    res.status(409).json({ error: "Game has already started" });
    return;
  }

  const targetCount = numPlayers || 10;
  if (targetCount < 5 || targetCount > 15) {
    res.status(400).json({ error: "Recommended lobby count must be between 5 and 15 players." });
    return;
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

  try {
    startGame(room);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * GET /api/social-deduction/sync
 * Sync latest game room state (Viewer-aware)
 */
gameRouter.get("/sync", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId } = req.query;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  // Ensure authenticated user is a member of the room
  const isMember = room.players.some((p) => p.authUserId === user.id);
  if (!isMember) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }

  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * POST /api/social-deduction/speak
 * Human player speaks in Day / Trial phase
 */
gameRouter.post("/speak", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, text, isFactionOnly } = req.body;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
    validateRequestFields({
      text: { type: "string", value: text, required: true },
      isFactionOnly: { type: "boolean", value: isFactionOnly }
    });
    if (text.length > 500) {
      throw new Error("Message text exceeds the maximum character limit.");
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive) {
    res.status(403).json({ error: "Only living players can speak." });
    return;
  }

  // Permitted speech phases
  const permittedSpeechPhases = ["DayTalk1", "DayTalk2", "TrialDefense", "TrialTalk", "NightCoordination"];
  if (!permittedSpeechPhases.includes(room.phase)) {
    res.status(400).json({ error: "You cannot speak during this phase." });
    return;
  }

  // Enforce faction chat constraints
  if (isFactionOnly) {
    if (!room.phase.includes("Night") && room.phase !== "NightCoordination") {
      res.status(400).json({ error: "Faction chat is only available at night." });
      return;
    }
    const def = roleRegistry[player.role];
    if (!def?.hasFactionChat) {
      res.status(403).json({ error: "Your role does not have access to faction chat." });
      return;
    }
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

  room.lastActivity = Date.now();
  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * POST /api/social-deduction/vote
 * Human player submits their vote
 */
gameRouter.post("/vote", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, targetSeat } = req.body;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
    validateRequestFields({
      targetSeat: { type: "number", value: targetSeat, required: true }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.phase !== "Voting") {
    res.status(400).json({ error: "Voting is not currently active." });
    return;
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive) {
    res.status(403).json({ error: "Only active players can vote." });
    return;
  }

  // Validate target seat boundaries
  const target = room.players.find((p) => p.seat === targetSeat);
  if (!target || !target.isAlive || target.seat === player.seat) {
    res.status(400).json({ error: "Invalid target player seat selection." });
    return;
  }

  player.voteTarget = targetSeat;
  logGameEvent(room, `${player.name} voted for Seat ${targetSeat}`);

  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * POST /api/social-deduction/verdict
 * Human player submits guilty/innocent trial verdict
 */
gameRouter.post("/verdict", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, verdict } = req.body;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
    validateRequestFields({
      verdict: { type: "string", value: verdict, required: true }
    });
    if (!["Guilty", "Innocent", "Abstain"].includes(verdict)) {
      throw new Error("Verdict must be either Guilty, Innocent, or Abstain.");
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.phase !== "TrialVote") {
    res.status(400).json({ error: "Trial verdict voting is not active." });
    return;
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive || player.seat === room.defendantSeat) {
    res.status(403).json({ error: "Only active jury players can vote trial verdict." });
    return;
  }

  player.defenseVotes = verdict;
  room.trialVoters[player.seat] = verdict;
  logGameEvent(room, `${player.name} voted verdict: ${verdict}`);

  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * POST /api/social-deduction/action
 * Human player submits night actions
 */
gameRouter.post("/action", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, targetSeat, secondaryTarget, ability } = req.body;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
    validateRequestFields({
      targetSeat: { type: "number", value: targetSeat, required: true },
      secondaryTarget: { type: "number", value: secondaryTarget },
      ability: { type: "string", value: ability, required: true }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.phase !== "NightAction") {
    res.status(400).json({ error: "Night abilities are not active during the day." });
    return;
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player || !player.isAlive) {
    res.status(403).json({ error: "Only active players can take night actions." });
    return;
  }

  // Validate the ability matches roleRegistry[player.role]?.nightAbility
  const expectedAbility = roleRegistry[player.role]?.nightAbility;
  if (!ability || ability !== expectedAbility) {
    res.status(400).json({ error: `Invalid action ability. Expected: ${expectedAbility || "visit"}` });
    return;
  }

  // Validate target seat boundaries
  const target = room.players.find((p) => p.seat === targetSeat);
  if (!target || !target.isAlive) {
    res.status(400).json({ error: "Invalid target player seat selection." });
    return;
  }

  const def = roleRegistry[player.role];
  const canSelfTarget = def?.mechanics?.canSelfTarget;

  if (target.seat === player.seat && !canSelfTarget) {
    res.status(400).json({ error: "Your role does not support self-targeting." });
    return;
  }

  player.nightActionTarget = targetSeat;
  player.nightActionAbility = ability;
  if (secondaryTarget) {
    player.secondaryTarget = secondaryTarget;
  }
  logGameEvent(room, `${player.name} queued night target on Seat ${targetSeat}`);

  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * POST /api/social-deduction/will
 * Human player updates their last will
 */
gameRouter.post("/will", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId, will } = req.body;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
    validateRequestFields({
      will: { type: "string", value: will, required: true }
    });
    if (will.length > 2000) {
      throw new Error("Last will content exceeds character limit.");
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const player = room.players.find((p) => p.authUserId === user.id);
  if (!player) {
    res.status(403).json({ error: "You must be a member of the lobby to update your last will." });
    return;
  }

  player.will = will;
  room.lastWills[player.seat] = will;

  res.json({ room: redactRoomState(room, user.id) });
});

/**
 * POST /api/social-deduction/advance
 * Manually advance phase (for humans playing, triggering AI speech and state transition)
 * Note: Long-running AI turns are enqueued asynchronously to return 202 immediately.
 */
gameRouter.post("/advance", authenticateUser, (req, res) => {
  const user = (req as any).user;
  const { roomId } = req.body;
  const token = (req as any).token;

  let normRoomId = "";
  try {
    normRoomId = normalizeRoomId(roomId);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  const room = activeRooms.get(normRoomId);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  // Authorize caller: must be a member of the target room
  const isMember = room.players.some((p) => p.authUserId === user.id);
  if (!isMember) {
    res.status(403).json({ error: "You must be a member of the lobby to advance phase." });
    return;
  }

  if (room.isAiRunning) {
    res.status(409).json({ error: "AI is already running" });
    return;
  }

  // Trigger phase advance asynchronously and return 202 accepted immediately
  advanceGamePhase(room, token).catch((err) => {
    console.error("Asynchronous phase advance failure:", err);
  });

  res.status(202).json({ message: "Phase advancement enqueued successfully.", room: redactRoomState(room, user.id) });
});
export default gameRouter;
