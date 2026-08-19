import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';

// Types
type PlayerInput = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  attack: boolean;
  special: boolean;
  block: boolean;
};

type PlayerState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  facingRight: boolean;
  actionState: 'idle' | 'walk' | 'jump' | 'fall' | 'attack' | 'special' | 'hurt' | 'dead';
  actionFrame: number;
  characterData: any; // User's custom character moveset data
  input: PlayerInput;
  lastUpdate: number;
  room: string;
};

type Room = {
  id: string;
  players: Map<string, PlayerState>;
  lastTick: number;
};

const rooms = new Map<string, Room>();
const clients = new Map<WebSocket, string>(); // ws -> playerId

const GRAVITY = 0.5;
const MAX_FALL_SPEED = 12;
const MOVE_SPEED = 5;
const JUMP_FORCE = -12;
const FLOOR_Y = 500;
const TICK_RATE = 1000 / 60; // 60fps

export function setupBattlegroundsWS(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    let playerId = crypto.randomUUID();
    let currentRoomId: string | null = null;
    clients.set(ws, playerId);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'join') {
          currentRoomId = data.roomId || 'lobby';
          let room = rooms.get(currentRoomId);
          if (!room) {
            room = { id: currentRoomId, players: new Map(), lastTick: Date.now() };
            rooms.set(currentRoomId, room);
          }
          
          if (room.players.size >= 10) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 10)' }));
            return;
          }

          room.players.set(playerId, {
            id: playerId,
            x: Math.random() * 600 + 100,
            y: FLOOR_Y,
            vx: 0,
            vy: 0,
            width: 50,
            height: 100,
            hp: 100,
            maxHp: 100,
            facingRight: true,
            actionState: 'idle',
            actionFrame: 0,
            characterData: data.characterData || null,
            input: { left: false, right: false, up: false, down: false, attack: false, special: false, block: false },
            lastUpdate: Date.now(),
            room: currentRoomId
          });
          
          ws.send(JSON.stringify({ type: 'joined', playerId, roomId: currentRoomId }));
          broadcastRoom(currentRoomId, { type: 'player_joined', playerId });
        }
        else if (data.type === 'input') {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;
          const player = room.players.get(playerId);
          if (player && player.hp > 0) {
            player.input = { ...player.input, ...data.input };
          }
        }
        else if (data.type === 'action') {
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            const player = room.players.get(playerId);
            if (player && player.hp > 0 && player.actionState !== 'hurt') {
                if (data.action === 'attack') {
                    player.actionState = 'attack';
                    player.actionFrame = 0;
                } else if (data.action === 'special') {
                    player.actionState = 'special';
                    player.actionFrame = 0;
                }
            }
        }
        else if (data.type === 'hit') {
            // Client reports it hit someone (trust client for now for rapid prototyping)
            if (!currentRoomId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            const target = room.players.get(data.targetId);
            if (target && target.hp > 0) {
                target.hp = Math.max(0, target.hp - (data.damage || 10));
                target.actionState = target.hp === 0 ? 'dead' : 'hurt';
                target.actionFrame = 0;
                // apply knockback
                target.vx = (data.knockbackX || 5) * (data.facingRight ? 1 : -1);
                target.vy = data.knockbackY || -5;
                
                broadcastRoom(currentRoomId, { 
                    type: 'player_hit', 
                    targetId: data.targetId,
                    attackerId: playerId,
                    damage: data.damage,
                    hp: target.hp
                });
            }
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      if (currentRoomId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.players.delete(playerId);
          broadcastRoom(currentRoomId, { type: 'player_left', playerId });
          if (room.players.size === 0) {
            rooms.delete(currentRoomId);
          }
        }
      }
    });
  });

  // Game Loop
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      let stateChanged = false;

      for (const [playerId, player] of room.players.entries()) {
        if (player.hp <= 0) {
            player.actionState = 'dead';
            continue;
        }

        // Apply physics
        player.vy += GRAVITY;
        if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

        // Input handling if not in a locking action
        const isLocked = ['attack', 'special', 'hurt'].includes(player.actionState);
        
        if (!isLocked) {
            player.vx = 0;
            if (player.input.left) {
                player.vx = -MOVE_SPEED;
                player.facingRight = false;
            }
            if (player.input.right) {
                player.vx = MOVE_SPEED;
                player.facingRight = true;
            }
            
            if (player.input.up && player.y >= FLOOR_Y) {
                player.vy = JUMP_FORCE;
                player.actionState = 'jump';
            }
        }

        // Apply velocity
        player.x += player.vx;
        player.y += player.vy;

        // Floor collision
        if (player.y >= FLOOR_Y) {
            player.y = FLOOR_Y;
            if (player.vy > 0) player.vy = 0;
            if (player.actionState === 'jump' || player.actionState === 'fall') {
                player.actionState = player.vx !== 0 ? 'walk' : 'idle';
            }
        } else {
            if (!isLocked && player.vy > 0) {
                player.actionState = 'fall';
            }
        }
        
        // Wall boundaries (assume 1200x600 arena)
        if (player.x < 0) { player.x = 0; player.vx = 0; }
        if (player.x > 1200 - player.width) { player.x = 1200 - player.width; player.vx = 0; }

        // State machine transitions (very basic)
        if (!isLocked && player.y === FLOOR_Y) {
             if (player.vx !== 0) player.actionState = 'walk';
             else player.actionState = 'idle';
        }

        // Advance action frames
        player.actionFrame++;
        
        // Auto-recover from states (e.g., attack lasts 20 frames)
        if (isLocked && player.actionFrame > 20) {
            player.actionState = 'idle';
            player.actionFrame = 0;
        }

        player.lastUpdate = now;
        stateChanged = true;
      }

      if (stateChanged) {
        broadcastRoom(roomId, {
          type: 'state',
          players: Array.from(room.players.values())
        });
      }
    }
  }, TICK_RATE);

  function broadcastRoom(roomId: string, data: any) {
    const message = JSON.stringify(data);
    for (const client of Array.from(wss.clients)) {
      const pid = clients.get(client);
      if (pid) {
        const room = rooms.get(roomId);
        if (room && room.players.has(pid) && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    }
  }
}
