import { describe, it, expect, beforeEach, vi } from "vitest";
import { activeRooms, startGame, checkWinConditions, resolveNightActions, GameRoom } from "../lib/gameEngine";

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
      isAiRunning: false
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

  it("should initialize game and assign correct alignments and roles", () => {
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

    // Force everyone except 1 town to die
    room.players.forEach((p) => {
      if (p.seat > 1) p.isAlive = false;
    });

    const isGameOver = checkWinConditions(room);
    expect(isGameOver).toBe(true);
    expect(room.phase).toBe("GameOver");
  });

  it("should process deterministic night actions successfully", () => {
    // Manually assign specific roles to test resolution
    room.players[0].role = "Escort";
    room.players[0].faction = "Town";

    room.players[1].role = "Mafioso";
    room.players[1].faction = "Mafia";

    room.players[2].role = "Doctor";
    room.players[2].faction = "Town";

    room.players[3].role = "Vigilante";
    room.players[3].faction = "Town";

    room.players[4].role = "Sheriff";
    room.players[4].faction = "Town";

    // Let Escort roleblock Mafioso
    room.players[0].nightActionTarget = 2; // Target Player2 (Mafioso)

    // Let Mafioso attack Doctor
    room.players[1].nightActionTarget = 3;

    resolveNightActions(room);

    // Doctor should remain alive because Mafioso was roleblocked!
    expect(room.players[2].isAlive).toBe(true);
  });
});
