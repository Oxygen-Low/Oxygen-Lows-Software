import { describe, it, expect, beforeEach } from "vitest";
import { startGame, checkWinConditions, resolveNightActions, GameRoom } from "./gameEngine";

describe("TOS LLMs Game Engine and State Machine", () => {
  let room: GameRoom;

  beforeEach(() => {
    room = {
      roomId: "TEST60",
      creatorId: "user-1",
      players: [],
      phase: "Lobby",
      day: 1,
      logs: [],
      messages: [],
      defendantSeat: null,
      trialVoters: {},
      lastWills: {},
      aiModel: "Smart",
      isAiRunning: false,
      lastActivity: Date.now()
    };

    // Add 5 basic seats
    for (let i = 1; i <= 5; i++) {
      room.players.push({
        seat: i,
        name: `Player${i}`,
        isAi: i > 1,
        role: "",
        faction: "Town",
        subalignment: "Support",
        isAlive: true,
        will: ""
      });
    }
  });

  it("should initialize game and assign correct alignments and roles in startGame", () => {
    startGame(room);

    expect(room.phase).toBe("DayTalk1");
    expect(room.day).toBe(1);

    room.players.forEach((p) => {
      expect(p.role).not.toBe("");
      expect(["Town", "Mafia", "Coven", "Neutral"]).toContain(p.faction);
    });
  });

  it("should evaluate win conditions correctly", () => {
    startGame(room);

    // Assign predictable factions & roles to verify winner evaluations
    room.players[0].faction = "Mafia";
    room.players[0].role = "Mafioso";
    room.players[0].isAlive = true;

    // Remaining are dead
    for (let i = 1; i < room.players.length; i++) {
      room.players[i].isAlive = false;
    }

    const isGameOver = checkWinConditions(room);
    expect(isGameOver).toBe(true);
    expect(room.phase).toBe("GameOver");
    expect(room.winner).toBe("Mafia");
  });

  it("should process deterministic night actions with proper roleblocks and damage resolutions", () => {
    room.players[0].role = "Escort";
    room.players[0].faction = "Town";
    room.players[0].isAlive = true;

    room.players[1].role = "Mafioso";
    room.players[1].faction = "Mafia";
    room.players[1].isAlive = true;

    room.players[2].role = "Doctor";
    room.players[2].faction = "Town";
    room.players[2].isAlive = true;

    // SCENARIO A: Mafioso is roleblocked by Escort, Doctor survives
    room.players[0].nightActionTarget = 2; // Escort targets Mafioso (Seat 2)
    room.players[1].nightActionTarget = 3; // Mafioso targets Doctor (Seat 3)

    resolveNightActions(room);

    expect(room.players[2].isAlive).toBe(true);

    // SCENARIO B: Control scenario where Mafioso is NOT roleblocked, Doctor dies
    room.players[0].nightActionTarget = undefined; // Escort stands down
    room.players[1].isAlive = true;
    room.players[1].nightActionTarget = 3; // Mafioso targets Doctor (Seat 3)

    resolveNightActions(room);

    expect(room.players[2].isAlive).toBe(false);
  });
});
