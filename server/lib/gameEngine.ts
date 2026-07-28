import { Faction, Subalignment, roleRegistry, RoleDef } from "../../shared/roleRegistry";
import axios from "axios";

export interface Player {
  seat: number; // 1-indexed
  name: string;
  isAi: boolean;
  role: string;
  faction: Faction;
  subalignment: Subalignment;
  isAlive: boolean;
  will: string;
  deathReason?: string;
  aiModel?: string; // model to use if AI
  authUserId?: string; // bound to a registered user if human
  canConvert?: boolean;
  // Night actions / choices
  nightActionTarget?: number; // seat index
  nightActionAbility?: string; // action name
  voteTarget?: number | null; // seat index voted for trial or guilty/innocent/abstain
  defenseVotes?: "Guilty" | "Innocent" | "Abstain" | null;
}

export interface GameLog {
  day: number;
  phase: string;
  message: string;
  timestamp: number;
}

export type GamePhase =
  | "Lobby"
  | "DayTalk1" // First talk round (Seat 1 to N speaks)
  | "DayTalk2" // Second talk round (Seat 1 to N speaks, can trigger day abilities)
  | "Voting" // Vote someone to trial
  | "TrialDefense" // Defendant speaks twice in a row
  | "TrialTalk" // Everyone talks twice in a row before trial voting
  | "TrialVote" // Deciding Guilty, Abstain, or Innocent
  | "TrialExecution" // Results of trial and execution processing
  | "NightCoordination" // Faction chat coord or simple prep
  | "NightAction" // Trigger night actions
  | "GameOver";

export interface GameRoom {
  roomId: string;
  creatorId: string;
  players: Player[];
  phase: GamePhase;
  day: number;
  logs: GameLog[];
  messages: {
    senderSeat: number; // 1-indexed
    senderName: string;
    text: string;
    isFactionOnly: boolean; // only visible to same faction at night
    round: number; // 1 or 2
    phase: GamePhase;
    day: number;
  }[];
  defendantSeat: number | null; // seat currently on trial
  trialVoters: { [voterSeat: number]: "Guilty" | "Innocent" | "Abstain" };
  lastWills: { [seat: number]: string };
  aiModel: string; // fallback model
  isAiRunning: boolean; // lock to prevent overlapping runs
  winner?: string; // Faction name or player name
}

// Global active games database stored in memory
export const activeRooms: Map<string, GameRoom> = new Map();

/**
 * Creates a unique room code
 */
export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Log an event to the game
 */
export function logGameEvent(room: GameRoom, message: string) {
  room.logs.push({
    day: room.day,
    phase: room.phase,
    message,
    timestamp: Date.now()
  });
}

/**
 * Shuffle helper
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Initialize / Start the game room
 */
export function startGame(room: GameRoom) {
  if (room.players.length < 5) {
    throw new Error("Lobby needs at least 5 players to start.");
  }

  // Get active roles in ToS2 registry
  const availableRoles = Object.keys(roleRegistry);
  const shuffledRoles = shuffleArray(availableRoles);

  // Assign roles
  room.players.forEach((player, idx) => {
    const assignedRoleName = shuffledRoles[idx % shuffledRoles.length];
    const roleDef = roleRegistry[assignedRoleName];

    player.role = roleDef.name;
    player.faction = roleDef.faction;
    player.subalignment = roleDef.subalignment;
    player.isAlive = true;
    player.will = "";
  });

  room.day = 1;
  room.phase = "DayTalk1";
  room.defendantSeat = null;
  room.trialVoters = {};
  room.messages = [];

  logGameEvent(room, "The game of TOS LLMs has officially started!");
  room.players.forEach((p) => {
    logGameEvent(room, `Seat ${p.seat}: ${p.name} joined as ${p.role} (${p.faction})`);
  });
}

/**
 * Evaluates win condition after deaths or trials
 */
export function checkWinConditions(room: GameRoom): boolean {
  const alivePlayers = room.players.filter((p) => p.isAlive);
  const townCount = alivePlayers.filter((p) => p.faction === "Town").length;
  const mafiaCount = alivePlayers.filter((p) => p.faction === "Mafia").length;
  const covenCount = alivePlayers.filter((p) => p.faction === "Coven").length;
  const neutralCount = alivePlayers.filter((p) => p.faction === "Neutral").length;

  // 1. Town Wins
  if (mafiaCount === 0 && covenCount === 0 && alivePlayers.every(p => p.faction === "Town" || p.role === "Survivor" || p.role === "Guardian Angel")) {
    room.phase = "GameOver";
    room.winner = "Town";
    logGameEvent(room, "Game Over! The Town has successfully eliminated all threats!");
    return true;
  }

  // 2. Mafia Wins
  if (townCount === 0 && covenCount === 0 && mafiaCount > 0) {
    room.phase = "GameOver";
    room.winner = "Mafia";
    logGameEvent(room, "Game Over! The Mafia reigns supreme!");
    return true;
  }

  // 3. Coven Wins
  if (townCount === 0 && mafiaCount === 0 && covenCount > 0) {
    room.phase = "GameOver";
    room.winner = "Coven";
    logGameEvent(room, "Game Over! The Coven has completed their absolute conquest!");
    return true;
  }

  // 4. Solo Neutral Wins (e.g. Serial Killer, Arsonist, Juggernaut)
  if (alivePlayers.length === 1) {
    const solo = alivePlayers[0];
    if (solo.faction === "Neutral" || solo.faction === "Mafia" || solo.faction === "Coven") {
      room.phase = "GameOver";
      room.winner = solo.name + ` (${solo.role})`;
      logGameEvent(room, `Game Over! ${solo.name} wins as the victorious ${solo.role}!`);
      return true;
    }
  }

  // 5. Stalemate fallback
  if (alivePlayers.length === 0) {
    room.phase = "GameOver";
    room.winner = "Stalemate";
    logGameEvent(room, "Game Over! Draw/Stalemate. No survivors left standing.");
    return true;
  }

  return false;
}

/**
 * Private helper to issue LLM speech or decision requests
 */
export async function runLlmTurn(
  room: GameRoom,
  player: Player,
  promptText: string,
  token: string
): Promise<string> {
  const modelToUse = player.aiModel || room.aiModel || "Smart";
  const provider = modelToUse.includes("/") ? "openrouter" : "horde";

  try {
    const response = await axios.post(
      "http://127.0.0.1:3000/api/ai/proxy",
      {
        provider,
        model: modelToUse,
        messages: [
          {
            role: "system",
            content: `You are playing "TOS LLMs", an advanced Town of Salem 2 multiplayer social deduction game.
Your Seat: ${player.seat}
Your Name: ${player.name}
Your Role: ${player.role}
Your Faction: ${player.faction} (${player.subalignment})
Your Win Condition: ${roleRegistry[player.role]?.winCondition || "Survive and win"}
Game Details: There are other players in the lobby (some human, some LLM AI). You must bluff, gather evidence, lie, claim roles, keep a last will, and play optimally to win. Protect secrets of your faction at all costs. Be concise in your responses. Output only your in-character game speech (do not prefix with your seat number or name).`
          },
          {
            role: "user",
            content: promptText
          }
        ],
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    let output = response.data?.choices?.[0]?.message?.content || "";
    // Clean up LLM naming prefixes
    output = output.replace(/^Seat \d+:\s*/gi, "").replace(new RegExp(`^${player.name}:\\s*`, "gi"), "");
    return output.trim();
  } catch (error: any) {
    console.error(`LLM fail for ${player.name}:`, error.message);
    return `Let's work together to figure out who is evil. I suspect something fishy is going on!`;
  }
}

/**
 * Evaluates the full set of submitted night actions deterministically
 */
export function resolveNightActions(room: GameRoom) {
  logGameEvent(room, `--- Night ${room.day} is coming to a close. Resolving night actions! ---`);

  const activePlayers = room.players.filter((p) => p.isAlive);
  const actionMap = new Map<number, { target: number; ability?: string }>();

  // Gather actions
  activePlayers.forEach((p) => {
    if (p.nightActionTarget) {
      actionMap.set(p.seat, { target: p.nightActionTarget, ability: p.nightActionAbility });
    }
  });

  const roleblocked = new Set<number>();
  const redirected = new Map<number, number>();
  const protectedPlayers = new Set<number>();
  const deadTonight = new Map<number, string>(); // Seat -> Reason

  // 1. Roleblocks (Escort, Tavern Keeper, Consort, Bootlegger)
  activePlayers.forEach((p) => {
    const def = roleRegistry[p.role];
    if (
      p.nightActionTarget &&
      (p.role === "Escort" || p.role === "Tavern Keeper" || p.role === "Consort" || p.role === "Bootlegger")
    ) {
      const targetSeat = p.nightActionTarget;
      const targetPlayer = room.players.find((pl) => pl.seat === targetSeat);
      if (targetPlayer && targetPlayer.isAlive) {
        const targetDef = roleRegistry[targetPlayer.role];
        if (!targetDef?.mechanics?.roleblockImmune) {
          roleblocked.add(targetSeat);
          logGameEvent(room, `Seat ${targetSeat} (${targetPlayer.name}) was roleblocked tonight!`);
        }
      }
    }
  });

  // 2. Redirects (Witch, Coven Leader)
  activePlayers.forEach((p) => {
    if (
      p.nightActionTarget &&
      !roleblocked.has(p.seat) &&
      (p.role === "Witch" || p.role === "Coven Leader")
    ) {
      const targetSeat = p.nightActionTarget;
      const targetPlayer = room.players.find((pl) => pl.seat === targetSeat);
      if (targetPlayer && targetPlayer.isAlive) {
        // Find a secondary target to redirect to
        const secondarySeat = Math.max(1, (targetSeat + 2) % room.players.length + 1);
        redirected.set(targetSeat, secondarySeat);
        logGameEvent(room, `Seat ${targetSeat} (${targetPlayer.name}) was controlled to visit Seat ${secondarySeat}!`);
      }
    }
  });

  // 3. Protection / Healing (Doctor, Bodyguard, Crusader, Guardian Angel)
  activePlayers.forEach((p) => {
    if (p.nightActionTarget && !roleblocked.has(p.seat)) {
      const targetSeat = redirected.get(p.seat) || p.nightActionTarget;
      if (p.role === "Doctor" || p.role === "Bodyguard" || p.role === "Crusader" || p.role === "Guardian Angel") {
        protectedPlayers.add(targetSeat);
        logGameEvent(room, `Seat ${targetSeat} is guarded/healed tonight!`);
      }
    }
  });

  // 4. Attacks / Killing (Godfather, Mafioso, Serial Killer, Vigilante, Coven Leader, Werewolf, Arsonist, etc.)
  activePlayers.forEach((p) => {
    if (p.nightActionTarget && !roleblocked.has(p.seat)) {
      const targetSeat = redirected.get(p.seat) || p.nightActionTarget;
      const def = roleRegistry[p.role];

      const isAttacker =
        p.role === "Godfather" ||
        p.role === "Mafioso" ||
        p.role === "Serial Killer" ||
        p.role === "Vigilante" ||
        p.role === "Juggernaut" ||
        p.faction === "Coven" ||
        p.role === "Arsonist";

      if (isAttacker) {
        const targetPlayer = room.players.find((pl) => pl.seat === targetSeat);
        if (targetPlayer && targetPlayer.isAlive) {
          const targetDef = roleRegistry[targetPlayer.role];

          // Check protection / defense
          if (protectedPlayers.has(targetSeat)) {
            logGameEvent(room, `Seat ${targetSeat} (${targetPlayer.name}) was attacked but survived due to protection!`);
          } else if (targetDef?.defense !== "None" && p.role !== "Arsonist") {
            logGameEvent(room, `Seat ${targetSeat} (${targetPlayer.name}) was attacked but their defense was too strong!`);
          } else {
            deadTonight.set(targetSeat, `Killed by an evil force (${p.role})`);
          }
        }
      }
    }
  });

  // 5. Conversions / Transformations (Vampire, Plaguebearer, Amnesiac)
  activePlayers.forEach((p) => {
    if (p.nightActionTarget && !roleblocked.has(p.seat)) {
      const targetSeat = redirected.get(p.seat) || p.nightActionTarget;
      const targetPlayer = room.players.find((pl) => pl.seat === targetSeat);

      if (p.role === "Vampire" && targetPlayer && targetPlayer.isAlive) {
        const targetDef = roleRegistry[targetPlayer.role];
        if (targetDef?.defense === "None" && !targetPlayer.canConvert && targetPlayer.faction === "Town") {
          targetPlayer.role = "Vampire";
          targetPlayer.faction = "Neutral";
          targetPlayer.subalignment = "Chaos";
          logGameEvent(room, `Seat ${targetSeat} (${targetPlayer.name}) was bitten and converted into a Vampire!`);
        }
      }

      if (p.role === "Plaguebearer" && targetPlayer && targetPlayer.isAlive) {
        logGameEvent(room, `Seat ${targetSeat} (${targetPlayer.name}) has been infected with the Plague!`);
      }
    }
  });

  // Apply deaths
  deadTonight.forEach((reason, seat) => {
    const deadPlayer = room.players.find((pl) => pl.seat === seat);
    if (deadPlayer) {
      deadPlayer.isAlive = false;
      deadPlayer.deathReason = reason;
      logGameEvent(room, `💔 Seat ${seat}: ${deadPlayer.name} has died! They were a ${deadPlayer.role}.`);
    }
  });

  // Reset actions
  room.players.forEach((p) => {
    p.nightActionTarget = undefined;
    p.nightActionAbility = undefined;
    p.voteTarget = undefined;
    p.defenseVotes = null;
  });

  room.defendantSeat = null;
  room.trialVoters = {};
}

/**
 * Run standard background state transitions & AI dialogue generations automatically
 */
export async function advanceGamePhase(room: GameRoom, token: string) {
  if (room.isAiRunning) return;
  room.isAiRunning = true;

  try {
    if (checkWinConditions(room)) {
      room.isAiRunning = false;
      return;
    }

    const alivePlayers = room.players.filter((p) => p.isAlive);

    switch (room.phase) {
      case "DayTalk1": {
        // AI speaks for Round 1
        logGameEvent(room, `--- Day ${room.day}: Talk Round 1 ---`);
        for (const player of room.players) {
          if (!player.isAlive) continue;
          if (player.isAi) {
            const prompt = `It is Day ${room.day}, Talk Round 1. Give your brief thoughts on who you suspect, or state your innocence. Keep your comment under 2 sentences. Do not use JSON or codes.`;
            const speech = await runLlmTurn(room, player, prompt, token);
            room.messages.push({
              senderSeat: player.seat,
              senderName: player.name,
              text: speech,
              isFactionOnly: false,
              round: 1,
              phase: "DayTalk1",
              day: room.day
            });
          }
        }
        room.phase = "DayTalk2";
        logGameEvent(room, `Day ${room.day} transitions to Talk Round 2.`);
        break;
      }

      case "DayTalk2": {
        // AI speaks for Round 2 and selects day abilities if applicable
        logGameEvent(room, `--- Day ${room.day}: Talk Round 2 & Day Abilities ---`);
        for (const player of room.players) {
          if (!player.isAlive) continue;
          if (player.isAi) {
            const prompt = `It is Day ${room.day}, Talk Round 2. Respond to the previous statements or state any roles you claim. If you have a day ability (like Mayor reveal, Deputy shoot, Conjuror meteor, Monarch knight), output "[ABILITY: Mayor]" or "[ABILITY: shoot Seat 2]" or simply make your comment. Keep under 2 sentences.`;
            const speech = await runLlmTurn(room, player, prompt, token);

            // Mock check for day ability usage in the speech
            if (speech.includes("[ABILITY:")) {
              logGameEvent(room, `🔥 Seat ${player.seat} (${player.name}) triggered a day ability: ${speech}`);
            }

            room.messages.push({
              senderSeat: player.seat,
              senderName: player.name,
              text: speech,
              isFactionOnly: false,
              round: 2,
              phase: "DayTalk2",
              day: room.day
            });
          }
        }
        room.phase = "Voting";
        logGameEvent(room, "The Town is now ready to vote someone up to the trial stand!");
        break;
      }

      case "Voting": {
        // Gather AI and Human voting targets
        logGameEvent(room, `--- Day ${room.day}: Voting Phase ---`);
        const votes: Record<number, number> = {}; // seat -> voteCount

        for (const player of room.players) {
          if (!player.isAlive) continue;
          if (player.isAi) {
            // Pick a suspicious seat
            const otherAlives = alivePlayers.filter((p) => p.seat !== player.seat);
            if (otherAlives.length > 0) {
              const pick = otherAlives[Math.floor(Math.random() * otherAlives.length)];
              player.voteTarget = pick.seat;
              votes[pick.seat] = (votes[pick.seat] || 0) + 1;
              logGameEvent(room, `🗳️ Seat ${player.seat} (${player.name}) voted to stand Seat ${pick.seat} (${pick.name}).`);
            }
          } else {
            // Human player
            if (player.voteTarget) {
              votes[player.voteTarget] = (votes[player.voteTarget] || 0) + 1;
            }
          }
        }

        // Find majority candidate
        const majorityNeeded = Math.floor(alivePlayers.length / 2) + 1;
        let candidate: number | null = null;
        for (const [seatStr, count] of Object.entries(votes)) {
          if (count >= majorityNeeded) {
            candidate = parseInt(seatStr);
            break;
          }
        }

        if (candidate !== null) {
          room.defendantSeat = candidate;
          room.phase = "TrialDefense";
          const defendant = room.players.find((p) => p.seat === candidate);
          logGameEvent(room, `⚖️ Seat ${candidate} (${defendant?.name}) has been put on trial!`);
        } else {
          logGameEvent(room, "No player received a majority of votes. Skipping straight to the night phase!");
          room.phase = "NightCoordination";
        }
        break;
      }

      case "TrialDefense": {
        // Defendant sends two messages in a row defending themselves
        const defSeat = room.defendantSeat;
        if (defSeat !== null) {
          const defendant = room.players.find((p) => p.seat === defSeat);
          if (defendant) {
            logGameEvent(room, `--- Trial Stand: Defense of Seat ${defSeat} (${defendant.name}) ---`);
            if (defendant.isAi) {
              const promptDef1 = "You are on the trial stand! Give your first defense speech. Claim a role and prove you are innocent. Keep it to 1 sentence.";
              const speech1 = await runLlmTurn(room, defendant, promptDef1, token);
              room.messages.push({
                senderSeat: defendant.seat,
                senderName: defendant.name,
                text: `[Defense Round 1] ${speech1}`,
                isFactionOnly: false,
                round: 1,
                phase: "TrialDefense",
                day: room.day
              });

              const promptDef2 = "Give your second consecutive defense statement. Make sure the Town believes you. Keep to 1 sentence.";
              const speech2 = await runLlmTurn(room, defendant, promptDef2, token);
              room.messages.push({
                senderSeat: defendant.seat,
                senderName: defendant.name,
                text: `[Defense Round 2] ${speech2}`,
                isFactionOnly: false,
                round: 2,
                phase: "TrialDefense",
                day: room.day
              });
            }
          }
        }
        room.phase = "TrialTalk";
        break;
      }

      case "TrialTalk": {
        // Everyone else talks 2 times before deciding guilty/innocent/abstain
        logGameEvent(room, `--- Trial: Discussion Round (2 talking turns each) ---`);
        for (let round = 1; round <= 2; round++) {
          for (const player of room.players) {
            if (!player.isAlive || player.seat === room.defendantSeat) continue;
            if (player.isAi) {
              const defPlayer = room.players.find((p) => p.seat === room.defendantSeat);
              const prompt = `The player on trial is Seat ${room.defendantSeat} (${defPlayer?.name}). It is Trial Talk Round ${round}. State whether you believe them or think they are guilty. Keep it to 1 sentence.`;
              const speech = await runLlmTurn(room, player, prompt, token);
              room.messages.push({
                senderSeat: player.seat,
                senderName: player.name,
                text: `[Trial Talk Round ${round}] ${speech}`,
                isFactionOnly: false,
                round,
                phase: "TrialTalk",
                day: room.day
              });
            }
          }
        }
        room.phase = "TrialVote";
        break;
      }

      case "TrialVote": {
        // Decide Guilty, Abstain, or Innocent
        logGameEvent(room, `--- Trial stand: Voting Verdict ---`);
        let guiltyCount = 0;
        let innocentCount = 0;

        for (const player of room.players) {
          if (!player.isAlive || player.seat === room.defendantSeat) continue;
          if (player.isAi) {
            // Pick randomly or heuristically
            const verdict = Math.random() > 0.45 ? "Guilty" : "Innocent";
            player.defenseVotes = verdict;
            room.trialVoters[player.seat] = verdict;
            if (verdict === "Guilty") guiltyCount++;
            else innocentCount++;
            logGameEvent(room, `⚖️ Seat ${player.seat} (${player.name}) voted: ${verdict}`);
          } else {
            // Human player
            const hVote = player.defenseVotes || "Abstain";
            room.trialVoters[player.seat] = hVote;
            if (hVote === "Guilty") guiltyCount++;
            if (hVote === "Innocent") innocentCount++;
          }
        }

        logGameEvent(room, `Verdicts: ${guiltyCount} Guilty vs ${innocentCount} Innocent.`);

        if (guiltyCount > innocentCount && room.defendantSeat !== null) {
          const defendant = room.players.find((p) => p.seat === room.defendantSeat);
          if (defendant) {
            defendant.isAlive = false;
            defendant.deathReason = "Executed on trial by the Town";
            logGameEvent(room, `💀 Seat ${defendant.seat} (${defendant.name}) was hanged! They were a ${defendant.role}.`);
          }
        } else {
          logGameEvent(room, "The defendant was pardoned!");
        }

        room.phase = "TrialExecution";
        break;
      }

      case "TrialExecution": {
        // Processing aftermath of a trial and transitioning to Night Coordination
        room.defendantSeat = null;
        room.trialVoters = {};
        room.phase = "NightCoordination";
        logGameEvent(room, "Night is falling over the Town. Evils can coordinate inside faction chats.");
        break;
      }

      case "NightCoordination": {
        // Evil faction chats (Mafia & Coven) coordinate
        logGameEvent(room, `--- Night ${room.day}: Evil Faction Coordination ---`);
        for (const faction of ["Mafia", "Coven"]) {
          const members = room.players.filter((p) => p.isAlive && p.faction === faction);
          if (members.length > 1) {
            for (const member of members) {
              if (member.isAi) {
                const prompt = `This is your private ${faction} Faction Chat at Night. Coordinate with other members of your team. Suggest who to kill or visit tonight. Output exactly 1 sentence.`;
                const speech = await runLlmTurn(room, member, prompt, token);
                room.messages.push({
                  senderSeat: member.seat,
                  senderName: member.name,
                  text: speech,
                  isFactionOnly: true,
                  round: 1,
                  phase: "NightCoordination",
                  day: room.day
                });
              }
            }
          }
        }
        room.phase = "NightAction";
        break;
      }

      case "NightAction": {
        // AI selects their abilities & actions for the night
        logGameEvent(room, `--- Night ${room.day}: Action Phase ---`);
        for (const player of room.players) {
          if (!player.isAlive) continue;
          if (player.isAi) {
            const possibleTargets = room.players.filter((p) => p.isAlive && p.seat !== player.seat);
            if (possibleTargets.length > 0) {
              const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
              player.nightActionTarget = target.seat;
              player.nightActionAbility = roleRegistry[player.role]?.nightAbility || "visit";
              logGameEvent(room, `🔒 Seat ${player.seat} decided to target Seat ${target.seat} tonight.`);
            }
          }
        }

        // Evaluate night action results
        resolveNightActions(room);

        // Day starts
        room.day += 1;
        room.phase = "DayTalk1";
        logGameEvent(room, `🌅 Day ${room.day} breaks! The Town awakens.`);
        break;
      }

      case "GameOver":
        break;
    }

    checkWinConditions(room);
  } catch (error) {
    console.error("Advance Game phase error:", error);
  } finally {
    room.isAiRunning = false;
  }
}
