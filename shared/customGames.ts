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

export const EMBER_RING_CODE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Ember Ring</title>
<style>
  * { box-sizing: border-box; user-select: none; -webkit-user-select: none; }
  body {
    margin: 0; padding: 0; background: #16100c; color: #f6e3ba;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden;
  }
  #ui-top {
    display: flex; gap: 18px; align-items: center; justify-content: center;
    margin-bottom: 8px; z-index: 2; flex-wrap: wrap;
  }
  .stat-pill {
    background: rgba(42, 28, 19, 0.9); border: 2px solid #b87d3b;
    padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  canvas {
    border-radius: 20px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.75), 0 0 30px rgba(255, 140, 40, 0.15);
    background: radial-gradient(circle, #2e1d12 0%, #140d08 100%);
    max-width: 95vw; max-height: 70vh;
  }
  #controls {
    display: flex; gap: 12px; margin-top: 12px; z-index: 2;
  }
  button {
    background: linear-gradient(180deg, #d9822b 0%, #9e5214 100%);
    color: #fff8eb; border: 2px solid #f7c97e; border-radius: 12px;
    padding: 10px 20px; font-size: 15px; font-weight: 700; cursor: pointer;
    box-shadow: 0 4px 10px rgba(0,0,0,0.4); transition: transform 0.1s, filter 0.15s;
  }
  button:hover { filter: brightness(1.12); }
  button:active { transform: translateY(2px); }
  button.secondary {
    background: #2f2118; border-color: #8c6239; color: #e0c399;
  }
</style>
</head>
<body>
  <div id="ui-top">
    <div class="stat-pill">Level: <span id="lvl">1</span>/5</div>
    <div class="stat-pill">Flame: <span id="flame">8</span> 🔥</div>
    <div class="stat-pill">Vents Lit: <span id="vents">0/4</span></div>
    <div class="stat-pill">Score: <span id="score">0</span></div>
  </div>
  <canvas id="game" width="520" height="520"></canvas>
  <div id="controls">
    <button id="btn-ccw">⟲ Slide Left (A / ←)</button>
    <button id="btn-cw">Slide Right (D / →) ⟳</button>
    <button id="btn-undo" class="secondary">Undo (Z)</button>
    <button id="btn-reset" class="secondary">Reset (R)</button>
  </div>
<script>
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const lvlEl = document.getElementById('lvl');
  const flameEl = document.getElementById('flame');
  const ventsEl = document.getElementById('vents');
  const scoreEl = document.getElementById('score');

  const LEVELS = [
    { size: 8, flame: 7, vents: [1, 3, 5, 7], coals: [0, 2, 4, 6], blocks: [] },
    { size: 10, flame: 8, vents: [0, 3, 6, 8], coals: [1, 2, 5, 7], blocks: [4] },
    { size: 12, flame: 9, vents: [2, 5, 8, 11], coals: [0, 3, 7, 9], blocks: [6] },
    { size: 12, flame: 10, vents: [1, 4, 7, 10], coals: [0, 2, 6, 8], blocks: [3, 9] },
    { size: 14, flame: 11, vents: [0, 4, 8, 12], coals: [1, 5, 7, 11], blocks: [2, 10] }
  ];

  let currentLevel = 0;
  let score = 0;
  let state = null;
  let history = [];
  let message = "";
  let messageTimer = 0;
  let tick = 0;

  function initLevel(idx) {
    const def = LEVELS[idx % LEVELS.length];
    state = {
      size: def.size,
      flame: def.flame,
      vents: def.vents.slice(),
      litVents: [],
      coals: def.coals.slice(),
      blocks: def.blocks.slice(),
      gameOver: false,
      won: false
    };
    history = [];
    updateUI();
  }

  function cloneState(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function showMsg(txt) {
    message = txt;
    messageTimer = 95;
  }

  function slide(dir) {
    if (state.gameOver || state.won) return;
    history.push(cloneState(state));
    state.flame -= 1;

    const N = state.size;
    const occupied = new Set([...state.litVents, ...state.blocks]);
    const newCoals = [];
    let pinnedAny = false;

    for (let c of state.coals) {
      let next = (c + dir + N) % N;
      if (occupied.has(next)) {
        newCoals.push(c);
      } else {
        newCoals.push(next);
      }
    }

    const remainingCoals = [];
    for (let c of newCoals) {
      if (state.vents.includes(c) && !state.litVents.includes(c)) {
        state.litVents.push(c);
        state.flame += 2;
        score += 25;
        pinnedAny = true;
      } else {
        remainingCoals.push(c);
      }
    }
    state.coals = remainingCoals;

    if (pinnedAny) {
      window.OxyGame?.playSound('coin');
      window.OxyGame?.unlockAchievement('first_vent');
      window.OxyGame?.submitScore(score);
    } else {
      window.OxyGame?.playSound('slide');
    }

    if (state.litVents.length === state.vents.length) {
      state.won = true;
      score += state.flame * 15;
      window.OxyGame?.playSound('win');
      window.OxyGame?.submitScore(score);
      if (currentLevel + 1 >= 3) window.OxyGame?.unlockAchievement('level_3');
      if (currentLevel === LEVELS.length - 1) {
        window.OxyGame?.unlockAchievement('master_keeper');
        showMsg("Hearth Mastered! All Rings Lit!");
      } else {
        showMsg("Ring Ignited! Advancing...");
        setTimeout(() => {
          currentLevel++;
          initLevel(currentLevel);
        }, 1200);
      }
    } else if (state.flame <= 0) {
      state.gameOver = true;
      window.OxyGame?.playSound('lose');
      showMsg("The Flame Died! Press Undo or Reset.");
    }
    updateUI();
  }

  function updateUI() {
    lvlEl.textContent = (currentLevel + 1);
    flameEl.textContent = state.flame;
    ventsEl.textContent = state.litVents.length + "/" + state.vents.length;
    scoreEl.textContent = score;
  }

  document.getElementById('btn-ccw').onclick = () => slide(-1);
  document.getElementById('btn-cw').onclick = () => slide(1);
  document.getElementById('btn-undo').onclick = () => {
    if (history.length > 0) {
      state = history.pop();
      window.OxyGame?.playSound('click');
      updateUI();
    }
  };
  document.getElementById('btn-reset').onclick = () => {
    window.OxyGame?.playSound('click');
    initLevel(currentLevel);
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') slide(-1);
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') slide(1);
    if (e.key === 'z' || e.key === 'Z') document.getElementById('btn-undo').click();
    if (e.key === 'r' || e.key === 'R') document.getElementById('btn-reset').click();
  });

  function draw() {
    tick++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 175;

    // Brass hearth ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#6e4726';
    ctx.lineWidth = 36;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#b87d3b';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Central Candle
    const glowRadius = Math.max(20, state.flame * 9 + Math.sin(tick * 0.1) * 5);
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowRadius);
    grad.addColorStop(0, 'rgba(255, 220, 110, 0.9)');
    grad.addColorStop(0.5, 'rgba(255, 120, 30, 0.35)');
    grad.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Candle body
    ctx.fillStyle = '#e8d0a7';
    ctx.fillRect(cx - 12, cy - 10, 24, 38);
    if (state.flame > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy - 18 + Math.sin(tick * 0.2) * 2, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffae2b';
      ctx.fill();
    }

    // Ring cells
    const N = state.size;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      const isVent = state.vents.includes(i);
      const isLit = state.litVents.includes(i);
      const isCoal = state.coals.includes(i);
      const isBlock = state.blocks.includes(i);

      // Cell socket
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fillStyle = isLit ? '#ff7b1c' : isVent ? '#3a281c' : '#24170f';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = isVent ? '#f5b041' : '#5c3c24';
      ctx.stroke();

      if (isBlock) {
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#52525b';
        ctx.fill();
      } else if (isLit) {
        ctx.beginPath();
        ctx.arc(x, y, 14 + Math.sin(tick * 0.15 + i) * 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff099';
        ctx.fill();
      } else if (isCoal) {
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4d1c';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - 3, y - 3, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd166';
        ctx.fill();
      }
    }

    if (messageTimer > 0) {
      messageTimer--;
      ctx.fillStyle = 'rgba(20, 12, 8, 0.85)';
      ctx.fillRect(40, cy - 30, canvas.width - 80, 60);
      ctx.strokeStyle = '#f5b041';
      ctx.strokeRect(40, cy - 30, canvas.width - 80, 60);
      ctx.fillStyle = '#fff3d1';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(message, cx, cy + 6);
    }

    requestAnimationFrame(draw);
  }

  initLevel(0);
  draw();
})();
</script>
</body>
</html>`;

export const NEON_SPACE_SHOOTER_CODE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Neon Asteroid Blaster</title>
<style>
  * { box-sizing: border-box; user-select: none; }
  body {
    margin: 0; background: #050814; color: #38bdf8;
    font-family: 'Segoe UI', system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden;
  }
  #hud {
    display: flex; gap: 20px; margin-bottom: 8px; font-weight: 700; font-size: 15px;
  }
  .hud-box {
    background: rgba(15, 23, 42, 0.85); border: 1px solid #0284c7;
    padding: 6px 16px; border-radius: 8px; box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
  }
  canvas {
    background: #030712; border: 2px solid #0ea5e9; border-radius: 12px;
    box-shadow: 0 0 30px rgba(14, 165, 233, 0.3); max-width: 95vw; max-height: 78vh;
  }
</style>
</head>
<body>
  <div id="hud">
    <div class="hud-box">SCORE: <span id="score">0</span></div>
    <div class="hud-box">COMBO: x<span id="combo">1</span></div>
    <div class="hud-box">SHIELDS: <span id="lives">3</span> ⚡</div>
  </div>
  <canvas id="c" width="640" height="460"></canvas>
<script>
(function() {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const comboEl = document.getElementById('combo');
  const livesEl = document.getElementById('lives');

  let score = 0, combo = 1, lives = 3, gameOver = false;
  const player = { x: 320, y: 400, vx: 0, cooldown: 0 };
  const keys = {};
  const bullets = [];
  const enemies = [];
  const particles = [];
  let spawnTimer = 0;

  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (gameOver && e.code === 'Space') resetGame();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  function resetGame() {
    score = 0; combo = 1; lives = 3; gameOver = false;
    bullets.length = 0; enemies.length = 0; particles.length = 0;
    player.x = 320;
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = score;
    comboEl.textContent = combo;
    livesEl.textContent = Math.max(0, lives);
  }

  function addParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 4;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 25, color });
    }
  }

  function loop() {
    ctx.fillStyle = 'rgba(3, 7, 18, 0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameOver) {
      if (keys['ArrowLeft'] || keys['KeyA']) player.x -= 5.5;
      if (keys['ArrowRight'] || keys['KeyD']) player.x += 5.5;
      player.x = Math.max(24, Math.min(canvas.width - 24, player.x));

      if (player.cooldown > 0) player.cooldown--;
      if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW']) && player.cooldown === 0) {
        bullets.push({ x: player.x, y: player.y - 16 });
        player.cooldown = 10;
        window.OxyGame?.playSound('laser');
      }

      spawnTimer++;
      if (spawnTimer > 38) {
        spawnTimer = 0;
        enemies.push({
          x: 30 + Math.random() * (canvas.width - 60),
          y: -20,
          r: 14 + Math.random() * 12,
          vy: 1.8 + Math.random() * 2.2,
          rot: 0
        });
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= 8;
        if (bullets[i].y < -10) bullets.splice(i, 1);
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.y += e.vy;
        e.rot += 0.04;

        // Check bullet collision
        let hit = false;
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + 6) {
            bullets.splice(j, 1);
            hit = true;
            break;
          }
        }

        if (hit) {
          addParticles(e.x, e.y, '#f43f5e');
          enemies.splice(i, 1);
          score += 10 * combo;
          combo = Math.min(10, combo + 1);
          window.OxyGame?.playSound('explosion');
          window.OxyGame?.unlockAchievement('first_blood');
          if (combo >= 10) window.OxyGame?.unlockAchievement('combo_10x');
          if (score >= 1000) window.OxyGame?.unlockAchievement('survivor_1000');
          window.OxyGame?.submitScore(score);
          updateHud();
          continue;
        }

        if (Math.hypot(e.x - player.x, e.y - player.y) < e.r + 14) {
          addParticles(player.x, player.y, '#38bdf8');
          enemies.splice(i, 1);
          lives--;
          combo = 1;
          window.OxyGame?.playSound('hit');
          updateHud();
          if (lives <= 0) {
            gameOver = true;
            window.OxyGame?.playSound('lose');
          }
          continue;
        }

        if (e.y > canvas.height + 30) {
          enemies.splice(i, 1);
          combo = 1;
          updateHud();
        }
      }
    }

    // Draw player ship
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(15, 14);
    ctx.lineTo(0, 8);
    ctx.lineTo(-15, 14);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Draw bullets
    ctx.fillStyle = '#fde047';
    for (const b of bullets) {
      ctx.fillRect(b.x - 2, b.y - 8, 4, 14);
    }

    // Draw enemies
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        const px = Math.cos(ang) * e.r;
        const py = Math.sin(ang) * e.r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (gameOver) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.fillRect(120, 170, 400, 120);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(120, 170, 400, 120);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 26px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 320, 220);
      ctx.font = '16px system-ui';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('Press SPACE to Launch Again', 320, 260);
    }

    requestAnimationFrame(loop);
  }
  loop();
})();
</script>
</body>
</html>`;

export const CYBER_RUNNER_3D_CODE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cyber Runner 3D</title>
<style>
  * { box-sizing: border-box; user-select: none; }
  body {
    margin: 0; background: #090414; color: #e879f9;
    font-family: system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden;
  }
  #hud {
    position: fixed; top: 16px; display: flex; gap: 20px; z-index: 10;
  }
  .badge {
    background: rgba(24, 10, 46, 0.85); border: 1px solid #d946ef;
    padding: 6px 16px; border-radius: 999px; font-weight: 700; color: #f5d0fe;
  }
  canvas {
    border-radius: 14px; border: 2px solid #a855f7;
    box-shadow: 0 0 35px rgba(168, 85, 247, 0.35);
    max-width: 95vw; max-height: 82vh;
  }
</style>
</head>
<body>
  <div id="hud">
    <div class="badge">DISTANCE: <span id="dist">0</span>m</div>
    <div class="badge">ORBS: <span id="orbs">0</span> 💎</div>
  </div>
  <canvas id="v" width="640" height="460"></canvas>
<script>
(function() {
  const canvas = document.getElementById('v');
  const ctx = canvas.getContext('2d');
  const distEl = document.getElementById('dist');
  const orbsEl = document.getElementById('orbs');

  let lane = 0; // -1, 0, 1
  let playerX = 0;
  let playerY = 0;
  let vy = 0;
  let dist = 0;
  let orbs = 0;
  let speed = 0.035;
  let gameOver = false;
  const items = [];

  window.addEventListener('keydown', (e) => {
    if (gameOver && e.code === 'Space') {
      lane = 0; dist = 0; orbs = 0; speed = 0.035; items.length = 0; gameOver = false;
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      lane = Math.max(-1, lane - 1);
      window.OxyGame?.playSound('click');
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      lane = Math.min(1, lane + 1);
      window.OxyGame?.playSound('click');
    }
    if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && playerY === 0) {
      vy = 11;
      window.OxyGame?.playSound('jump');
    }
  });

  function project(x, y, z) {
    const fov = 260 / Math.max(0.1, z);
    return {
      sx: canvas.width / 2 + x * fov,
      sy: 200 + (85 - y) * fov,
      scale: fov
    };
  }

  function render() {
    ctx.fillStyle = '#090414';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Synthwave Sun
    const sunGrad = ctx.createLinearGradient(0, 60, 0, 200);
    sunGrad.addColorStop(0, '#f43f5e');
    sunGrad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 135, 65, 0, Math.PI * 2);
    ctx.fill();

    // Horizon Floor
    ctx.fillStyle = '#140826';
    ctx.fillRect(0, 200, canvas.width, 260);

    // 3D Perspective Grid
    ctx.strokeStyle = 'rgba(217, 70, 239, 0.35)';
    ctx.lineWidth = 1.5;
    for (let l = -3; l <= 3; l++) {
      const p1 = project(l * 60, 0, 0.5);
      const p2 = project(l * 60, 0, 6);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }

    if (!gameOver) {
      dist += 1;
      speed = Math.min(0.075, 0.035 + dist * 0.000015);
      playerX += (lane * 75 - playerX) * 0.22;
      playerY += vy;
      if (playerY > 0) vy -= 0.7;
      else { playerY = 0; vy = 0; }

      if (Math.random() < 0.045) {
        items.push({
          lane: Math.floor(Math.random() * 3) - 1,
          z: 6.0,
          type: Math.random() < 0.35 ? 'orb' : 'barrier'
        });
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.z -= speed;
        if (it.z < 0.95 && it.z > 0.65 && it.lane === lane) {
          if (it.type === 'orb') {
            orbs++;
            items.splice(i, 1);
            window.OxyGame?.playSound('coin');
            if (orbs >= 5) window.OxyGame?.unlockAchievement('orb_collector');
            window.OxyGame?.submitScore(dist + orbs * 50);
            continue;
          } else if (playerY < 28) {
            gameOver = true;
            window.OxyGame?.playSound('lose');
            window.OxyGame?.submitScore(dist + orbs * 50);
          }
        }
        if (it.z <= 0.2) items.splice(i, 1);
      }

      if (dist >= 500) window.OxyGame?.unlockAchievement('speed_demon');
      if (dist >= 1500) window.OxyGame?.unlockAchievement('cyber_legend');
      distEl.textContent = dist;
      orbsEl.textContent = orbs;
    }

    // Draw 3D items back-to-front
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      const p = project(it.lane * 75, 0, it.z);
      const w = 14 * p.scale;
      if (it.type === 'orb') {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy - w, w * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
      } else {
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(p.sx - w, p.sy - w * 1.4, w * 2, w * 1.4);
        ctx.strokeStyle = '#fda4af';
        ctx.strokeRect(p.sx - w, p.sy - w * 1.4, w * 2, w * 1.4);
      }
    }

    // Draw 3D Low-Poly Player Cube
    const pp = project(playerX, playerY, 0.8);
    const pw = 15 * pp.scale;
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(pp.sx - pw, pp.sy - pw * 1.3, pw * 2, pw * 1.3);
    ctx.strokeStyle = '#f0abfc';
    ctx.lineWidth = 2;
    ctx.strokeRect(pp.sx - pw, pp.sy - pw * 1.3, pw * 2, pw * 1.3);

    if (gameOver) {
      ctx.fillStyle = 'rgba(9, 4, 20, 0.88)';
      ctx.fillRect(120, 165, 400, 125);
      ctx.strokeStyle = '#d946ef';
      ctx.strokeRect(120, 165, 400, 125);
      ctx.fillStyle = '#fdf4ff';
      ctx.font = 'bold 26px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('SYSTEM CRASHED', 320, 215);
      ctx.font = '16px system-ui';
      ctx.fillStyle = '#e879f9';
      ctx.fillText('Press SPACE to Reboot Run', 320, 255);
    }

    requestAnimationFrame(render);
  }
  render();
})();
</script>
</body>
</html>`;

export const DEFAULT_CUSTOM_GAMES: CustomGameRecord[] = [
  {
    id: "ember-ring",
    title: "Ember Ring",
    description:
      "Slide every coal around the brass hearth ring at once and ignite all four vents before the central candle flame dies out.",
    genre: "Puzzle",
    dimension: "2d",
    coverUrl: "",
    code: EMBER_RING_CODE,
    achievements: [
      {
        id: "first_vent",
        title: "Spark of Warmth",
        description: "Pin a glowing coal into an air vent for the first time.",
        points: 10,
      },
      {
        id: "level_3",
        title: "Hearth Tender",
        description: "Reach and complete Ring Level 3.",
        points: 25,
      },
      {
        id: "master_keeper",
        title: "Keeper of the Flame",
        description: "Ignite all 5 hearth rings without letting the candle die.",
        points: 50,
      },
    ],
    creatorId: "1",
    creatorUsername: "oxygenlow",
    plays: 142,
    likes: 38,
    highScore: 640,
    highScoreHolder: "oxygenlow",
    tags: ["puzzle", "hearth", "strategy", "2d"],
    createdAt: "2026-10-28T12:00:00.000Z",
    updatedAt: "2026-10-28T12:00:00.000Z",
  },
  {
    id: "neon-space-shooter",
    title: "Neon Asteroid Blaster",
    description:
      "Retro sci-fi vector arcade shooter with combo multipliers, particle explosions, and synth laser blasts.",
    genre: "Action",
    dimension: "2d",
    coverUrl: "",
    code: NEON_SPACE_SHOOTER_CODE,
    achievements: [
      {
        id: "first_blood",
        title: "First Vaporization",
        description: "Destroy your first neon asteroid.",
        points: 10,
      },
      {
        id: "combo_10x",
        title: "Maximum Overdrive",
        description: "Reach a 10x combo multiplier.",
        points: 30,
      },
      {
        id: "survivor_1000",
        title: "Galactic Ace",
        description: "Score over 1,000 points in a single flight.",
        points: 50,
      },
    ],
    creatorId: "1",
    creatorUsername: "oxygenlow",
    plays: 215,
    likes: 64,
    highScore: 2450,
    highScoreHolder: "oxygenlow",
    tags: ["arcade", "space", "shooter", "2d"],
    createdAt: "2026-10-28T12:05:00.000Z",
    updatedAt: "2026-10-28T12:05:00.000Z",
  },
  {
    id: "cyber-runner-3d",
    title: "Cyber Runner 3D",
    description:
      "High-speed 3D synthwave horizon runner. Dodge crimson barriers, jump gaps, and collect data orbs across three neon lanes.",
    genre: "Arcade",
    dimension: "3d",
    coverUrl: "",
    code: CYBER_RUNNER_3D_CODE,
    achievements: [
      {
        id: "orb_collector",
        title: "Data Harvester",
        description: "Collect 5 glowing data orbs in a single run.",
        points: 15,
      },
      {
        id: "speed_demon",
        title: "Hypervelocity",
        description: "Survive past 500m on the cyber grid.",
        points: 25,
      },
      {
        id: "cyber_legend",
        title: "Outrun the Horizon",
        description: "Reach 1,500m in a single run.",
        points: 50,
      },
    ],
    creatorId: "1",
    creatorUsername: "oxygenlow",
    plays: 189,
    likes: 51,
    highScore: 1820,
    highScoreHolder: "oxygenlow",
    tags: ["3d", "runner", "synthwave", "arcade"],
    createdAt: "2026-10-28T12:10:00.000Z",
    updatedAt: "2026-10-28T12:10:00.000Z",
  },
];
