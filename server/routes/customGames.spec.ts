import { describe, it, expect } from "vitest";
import app from "../index.ts";

describe("Custom Games API (/api/custom-games)", () => {
  it("lists default custom games including Ember Ring, Neon Asteroid Blaster, and Cyber Runner 3D", async () => {
    const res = await app.request("/api/custom-games");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.games)).toBe(true);
    expect(data.games.length).toBeGreaterThanOrEqual(3);
    const titles = data.games.map((g: any) => g.title);
    expect(titles).toContain("Ember Ring");
    expect(titles).toContain("Neon Asteroid Blaster");
    expect(titles).toContain("Cyber Runner 3D");
  });

  it("filters games by search query and dimension", async () => {
    const res = await app.request("/api/custom-games?search=ember&dimension=2d");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.games.some((g: any) => g.id === "ember-ring")).toBe(true);
  });

  it("publishes a new game, increments play count, and unlocks an achievement", async () => {
    const createRes = await app.request("/api/custom-games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Starfighter",
        description: "A test 2D shooter built in Game Studio.",
        genre: "Action",
        dimension: "2d",
        code: "<!DOCTYPE html><html><body><canvas></canvas></body></html>",
        achievements: [
          {
            id: "star_1",
            title: "First Launch",
            description: "Start the mission.",
            points: 15,
          },
        ],
      }),
    });

    expect(createRes.status).toBe(201);
    const { game } = await createRes.json();
    expect(game.id).toMatch(/^game_/);
    expect(game.title).toBe("Test Starfighter");

    // Increment play count & submit high score
    const playRes = await app.request(`/api/custom-games/${game.id}/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: 500 }),
    });
    expect(playRes.status).toBe(200);
    const playData = await playRes.json();
    expect(playData.game.plays).toBe(1);
    expect(playData.game.highScore).toBe(500);

    // Unlock achievement
    const achRes = await app.request(
      `/api/custom-games/${game.id}/achievement`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achievementId: "star_1" }),
      },
    );
    expect(achRes.status).toBe(200);
    const achData = await achRes.json();
    expect(achData.unlocked).toBe(true);
    expect(achData.achievement.title).toBe("First Launch");
  });
});
