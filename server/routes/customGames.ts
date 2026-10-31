import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../lib/dataStore.ts";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  CustomGameRecord,
  CustomGameAchievement,
  CustomGameDimension,
  UserUnlockedAchievement,
} from "../../shared/customGames.ts";

export const customGamesRouter = new Hono();

const CUSTOM_GAMES_DIR = path.join(DATA_DIR, "custom_games");
const GAMES_FILE = path.join(CUSTOM_GAMES_DIR, "games.json");
const ACHIEVEMENTS_FILE = path.join(CUSTOM_GAMES_DIR, "achievements.json");

function ensureCustomGamesDir() {
  if (!fs.existsSync(CUSTOM_GAMES_DIR)) {
    fs.mkdirSync(CUSTOM_GAMES_DIR, { recursive: true });
  }
}

export function loadCustomGames(): CustomGameRecord[] {
  ensureCustomGamesDir();
  if (!fs.existsSync(GAMES_FILE)) {
    fs.writeFileSync(
      GAMES_FILE,
      JSON.stringify([], null, 2),
      "utf-8",
    );
    return [];
  }
  try {
    const raw = fs.readFileSync(GAMES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fallback if corrupted
  }
  return [];
}

export function saveCustomGames(games: CustomGameRecord[]) {
  ensureCustomGamesDir();
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), "utf-8");
}

export function loadUnlockedAchievements(): UserUnlockedAchievement[] {
  ensureCustomGamesDir();
  if (!fs.existsSync(ACHIEVEMENTS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(ACHIEVEMENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUnlockedAchievements(list: UserUnlockedAchievement[]) {
  ensureCustomGamesDir();
  fs.writeFileSync(ACHIEVEMENTS_FILE, JSON.stringify(list, null, 2), "utf-8");
}

async function getOptionalUser(c: any) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : c.req.query("token") || null;
  if (!token) return null;
  try {
    return await resolveUserFromToken(token);
  } catch {
    return null;
  }
}

// GET /api/custom-games - List all custom games (supports ?search= & ?genre= & ?dimension=)
customGamesRouter.get("/", async (c) => {
  const search = (c.req.query("search") || "").trim().toLowerCase();
  const genre = (c.req.query("genre") || "").trim().toLowerCase();
  const dimension = (c.req.query("dimension") || "").trim().toLowerCase();

  let games = loadCustomGames();
  if (search) {
    games = games.filter(
      (g) =>
        g.title.toLowerCase().includes(search) ||
        g.description.toLowerCase().includes(search) ||
        g.creatorUsername.toLowerCase().includes(search) ||
        g.genre.toLowerCase().includes(search) ||
        (Array.isArray(g.tags) &&
          g.tags.some((t) => t.toLowerCase().includes(search))),
    );
  }
  if (genre && genre !== "all") {
    games = games.filter((g) => g.genre.toLowerCase() === genre);
  }
  if (dimension === "2d" || dimension === "3d") {
    games = games.filter((g) => g.dimension === dimension);
  }

  return c.json({ games });
});

// GET /api/custom-games/user/achievements - List unlocked achievements for authenticated user
customGamesRouter.get("/user/achievements", async (c) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return c.json({ unlocked: [] });
  }
  const all = loadUnlockedAchievements();
  const unlocked = all.filter((a) => String(a.userId) === String(user.id));
  return c.json({ unlocked });
});

// GET /api/custom-games/:id - Get a single custom game
customGamesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const games = loadCustomGames();
  const game = games.find((g) => g.id === id);
  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }
  return c.json({ game });
});

// POST /api/custom-games - Publish a new custom game
customGamesRouter.post("/", async (c) => {
  try {
    const user = await getOptionalUser(c);
    const body = await c.req.json();

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const code = typeof body.code === "string" ? body.code : "";
    const genre =
      typeof body.genre === "string" && body.genre.trim()
        ? body.genre.trim()
        : "Arcade";
    const dimension: CustomGameDimension =
      body.dimension === "3d" ? "3d" : "2d";
    const coverUrl =
      typeof body.coverUrl === "string" ? body.coverUrl.trim() : "";

    if (!title) {
      return c.json({ error: "Game title is required" }, 400);
    }
    if (!code || !code.trim()) {
      return c.json({ error: "Game code is required" }, 400);
    }

    const rawAchievements = Array.isArray(body.achievements)
      ? body.achievements
      : [];
    const achievements: CustomGameAchievement[] = rawAchievements
      .filter((a: any) => a && typeof a.title === "string" && a.title.trim())
      .map((a: any, idx: number) => ({
        id:
          typeof a.id === "string" && a.id.trim()
            ? a.id.trim()
            : `ach_${idx + 1}`,
        title: a.title.trim().slice(0, 80),
        description:
          typeof a.description === "string"
            ? a.description.trim().slice(0, 200)
            : "",
        icon: typeof a.icon === "string" ? a.icon.trim() : undefined,
        points: typeof a.points === "number" ? a.points : 10,
      }));

    const tags = Array.isArray(body.tags)
      ? body.tags
          .filter((t: any) => typeof t === "string" && t.trim())
          .map((t: string) => t.trim().toLowerCase())
          .slice(0, 10)
      : [genre.toLowerCase(), dimension];

    const now = new Date().toISOString();
    const games = loadCustomGames();

    const newGame: CustomGameRecord = {
      id: `game_${crypto.randomBytes(6).toString("hex")}`,
      title: title.slice(0, 100),
      description: description.slice(0, 600),
      genre,
      dimension,
      coverUrl,
      code,
      achievements,
      creatorId: user ? String(user.id) : "guest",
      creatorUsername:
        user?.username ||
        (typeof body.creatorUsername === "string" && body.creatorUsername.trim()
          ? body.creatorUsername.trim()
          : "Director"),
      plays: 0,
      likes: 0,
      highScore: 0,
      tags,
      createdAt: now,
      updatedAt: now,
    };

    games.unshift(newGame);
    saveCustomGames(games);

    return c.json({ game: newGame }, 201);
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to publish game" }, 500);
  }
});

// PUT /api/custom-games/:id - Update an existing custom game
customGamesRouter.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const user = await getOptionalUser(c);
    const body = await c.req.json();
    const games = loadCustomGames();
    const idx = games.findIndex((g) => g.id === id);

    if (idx === -1) {
      return c.json({ error: "Game not found" }, 404);
    }

    const existing = games[idx];
    if (
      existing.creatorId !== "guest" &&
      user &&
      String(user.id) !== String(existing.creatorId) &&
      user.role !== "admin"
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const updated: CustomGameRecord = {
      ...existing,
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 100)
          : existing.title,
      description:
        typeof body.description === "string"
          ? body.description.trim().slice(0, 600)
          : existing.description,
      genre:
        typeof body.genre === "string" && body.genre.trim()
          ? body.genre.trim()
          : existing.genre,
      dimension:
        body.dimension === "3d"
          ? "3d"
          : body.dimension === "2d"
            ? "2d"
            : existing.dimension,
      coverUrl:
        typeof body.coverUrl === "string"
          ? body.coverUrl.trim()
          : existing.coverUrl,
      code:
        typeof body.code === "string" && body.code.trim()
          ? body.code
          : existing.code,
      achievements: Array.isArray(body.achievements)
        ? body.achievements
        : existing.achievements,
      tags: Array.isArray(body.tags) ? body.tags : existing.tags,
      updatedAt: new Date().toISOString(),
    };

    games[idx] = updated;
    saveCustomGames(games);
    return c.json({ game: updated });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to update game" }, 500);
  }
});

// POST /api/custom-games/:id/play - Increment play count and optionally submit score
customGamesRouter.post("/:id/play", async (c) => {
  const id = c.req.param("id");
  const user = await getOptionalUser(c);
  const games = loadCustomGames();
  const idx = games.findIndex((g) => g.id === id);

  if (idx === -1) {
    return c.json({ error: "Game not found" }, 404);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // Empty body is fine
  }

  const game = games[idx];
  if (!body.scoreOnly) {
    game.plays = (game.plays || 0) + 1;
  }

  if (typeof body.score === "number" && body.score > (game.highScore || 0)) {
    game.highScore = body.score;
    game.highScoreHolder = user?.username || body.username || "Player";
  }

  saveCustomGames(games);
  return c.json({ game });
});

// POST /api/custom-games/:id/achievement - Unlock an achievement
customGamesRouter.post("/:id/achievement", async (c) => {
  try {
    const id = c.req.param("id");
    const user = await getOptionalUser(c);
    const body = await c.req.json();
    const achievementId =
      typeof body.achievementId === "string" ? body.achievementId.trim() : "";

    if (!achievementId) {
      return c.json({ error: "achievementId is required" }, 400);
    }

    const games = loadCustomGames();
    const game = games.find((g) => g.id === id);
    if (!game) {
      return c.json({ error: "Game not found" }, 404);
    }

    const ach = game.achievements.find((a) => a.id === achievementId);
    const userId = user ? String(user.id) : "guest";
    const allUnlocked = loadUnlockedAchievements();
    const alreadyUnlocked = allUnlocked.some(
      (u) =>
        u.userId === userId &&
        u.gameId === id &&
        u.achievementId === achievementId,
    );

    if (!alreadyUnlocked) {
      allUnlocked.push({
        userId,
        gameId: id,
        achievementId,
        unlockedAt: new Date().toISOString(),
      });
      saveUnlockedAchievements(allUnlocked);
    }

    return c.json({
      unlocked: true,
      isNew: !alreadyUnlocked,
      achievement: ach || {
        id: achievementId,
        title: achievementId,
        description: "Achievement unlocked!",
      },
    });
  } catch (err: any) {
    return c.json(
      { error: err?.message || "Failed to unlock achievement" },
      500,
    );
  }
});
