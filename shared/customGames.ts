export type CustomGameDimension = "2d" | "3d";

export interface CustomGameAchievement {
  id: string;
  title: string;
  description: string;
  icon?: string;
  points?: number;
}

export interface CustomGameRecord {
  id: string;
  title: string;
  description: string;
  genre: string;
  dimension: CustomGameDimension;
  coverUrl?: string;
  code: string;
  achievements: CustomGameAchievement[];
  creatorId: string;
  creatorUsername: string;
  plays: number;
  likes: number;
  highScore?: number;
  highScoreHolder?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserUnlockedAchievement {
  userId: string;
  gameId: string;
  achievementId: string;
  unlockedAt: string;
}

export const BLANK_GAME_CODE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>New Game</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #020617;
    color: #94a3b8;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  canvas {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  }
</style>
</head>
<body>
<canvas id="gameCanvas" width="640" height="400"></canvas>
<script>
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 20px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Ready to Build', 320, 190);
  ctx.fillStyle = '#64748b';
  ctx.font = '14px system-ui';
  ctx.fillText('Describe your game to the AI Game Director to begin', 320, 220);
</script>
</body>
</html>`;

export const DEFAULT_CUSTOM_GAMES: CustomGameRecord[] = [];
