import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export function BattlegroundsGameApp() {
  const { session } = useAuth();
  const [gameState, setGameState] = useState<'lobby' | 'playing'>('lobby');
  const [roomId, setRoomId] = useState('lobby');
  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedChar, setSelectedChar] = useState<any>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const fetchChars = async () => {
      const defaultChar = {
        id: 'default-fighter',
        name: 'Default Fighter',
        spritesheet_url: null,
        moveset_json: {}
      };
      
      const { data, error } = await supabase
        .from('battlegrounds_characters')
        .select('*')
        .eq('is_public', true)
        .limit(20);
        
      if (data && data.length > 0) {
        setCharacters([defaultChar, ...data]);
      } else {
        setCharacters([defaultChar]);
      }
    };
    fetchChars();
  }, []);

  // Keyboard state
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const joinGame = () => {
    if (!selectedChar) {
      toast.error('Please select a character');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = process.env.NODE_ENV === 'development' 
      ? `ws://localhost:3000/ws/battlegrounds` 
      : `${protocol}//${window.location.host}/ws/battlegrounds`;
      
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        roomId: roomId || 'lobby',
        characterData: selectedChar
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'joined') {
        setPlayerId(data.playerId);
        setGameState('playing');
        startGameLoop();
      } else if (data.type === 'error') {
        toast.error(data.message);
        ws.close();
      } else if (data.type === 'state' && canvasRef.current) {
        renderGame(data.players, canvasRef.current);
      }
    };

    ws.onerror = (err) => {
      console.error('WS Error', err);
      toast.error('Failed to connect to game server');
    };
    
    ws.onclose = () => {
       setGameState('lobby');
    }
  };

  const leaveGame = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setGameState('lobby');
  };

  const startGameLoop = () => {
    const loop = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        clearInterval(loop);
        return;
      }
      
      const input = {
        left: keys.current['ArrowLeft'] || keys.current['KeyA'] || false,
        right: keys.current['ArrowRight'] || keys.current['KeyD'] || false,
        up: keys.current['ArrowUp'] || keys.current['KeyW'] || false,
        down: keys.current['ArrowDown'] || keys.current['KeyS'] || false,
        attack: false,
      };
      
      wsRef.current.send(JSON.stringify({ type: 'input', input }));
      
      // Separate event for attack to avoid spamming
      if (keys.current['Space'] || keys.current['KeyJ']) {
          wsRef.current.send(JSON.stringify({ type: 'action', action: 'attack' }));
          keys.current['Space'] = false; // pseudo-debounce
          keys.current['KeyJ'] = false;
      }

    }, 1000 / 30); // send inputs at 30fps
  };

  const renderGame = (players: any[], canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Floor
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 500 + 100, canvas.width, canvas.height - 600);
    
    players.forEach(p => {
        // Draw character box (placeholder for sprite)
        ctx.fillStyle = p.id === playerId ? '#06b6d4' : '#ef4444';
        if (p.actionState === 'hurt') ctx.fillStyle = '#facc15';
        if (p.actionState === 'dead') ctx.fillStyle = '#475569';
        
        ctx.fillRect(p.x, p.y, p.width, p.height);
        
        // Draw HP bar
        const hpPercent = p.hp / p.maxHp;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(p.x, p.y - 15, p.width, 5);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(p.x, p.y - 15, p.width * hpPercent, 5);
        
        // Draw name
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        const name = p.characterData?.name || 'Player';
        ctx.fillText(name, p.x + p.width / 2, p.y - 25);
        
        // Attack visualizer (placeholder hitbox)
        if (p.actionState === 'attack' && p.actionFrame < 10) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            const hx = p.facingRight ? p.x + p.width : p.x - 40;
            ctx.fillRect(hx, p.y + 20, 40, 40);
            
            // Client-side hit detection (simplified logic: check if local player's attack hits others)
            if (p.id === playerId && wsRef.current) {
                const attackRect = { x: hx, y: p.y + 20, w: 40, h: 40 };
                players.forEach(target => {
                    if (target.id !== playerId && target.hp > 0 && target.actionState !== 'hurt') {
                        const targetRect = { x: target.x, y: target.y, w: target.width, h: target.height };
                        if (attackRect.x < targetRect.x + targetRect.w &&
                            attackRect.x + attackRect.w > targetRect.x &&
                            attackRect.y < targetRect.y + targetRect.h &&
                            attackRect.y + attackRect.h > targetRect.y) {
                                // Hit!
                                wsRef.current.send(JSON.stringify({
                                    type: 'hit',
                                    targetId: target.id,
                                    damage: 15,
                                    knockbackX: 10,
                                    knockbackY: -8,
                                    facingRight: p.facingRight
                                }));
                        }
                    }
                });
            }
        }
    });
  };

  if (gameState === 'lobby') {
    return (
      <div className="container mx-auto p-4 max-w-4xl h-full flex flex-col items-center justify-center text-white">
        <h1 className="text-4xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-blue-600">BATTLEGROUNDS</h1>
        
        <Card className="w-full max-w-2xl bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle>Join Arena (Free For All - Max 10)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-sm text-slate-400 mb-2">Room Name (leave default for lobby)</p>
              <input 
                type="text" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full p-2 bg-slate-800 border border-slate-700 rounded text-white"
              />
            </div>
            
            <div>
              <p className="text-sm text-slate-400 mb-2">Select Character</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto p-2">
                {characters.map(char => (
                  <div 
                    key={char.id}
                    onClick={() => setSelectedChar(char)}
                    className={`cursor-pointer border-2 rounded-lg p-2 text-center transition-all ${selectedChar?.id === char.id ? 'border-cyan-500 bg-cyan-900/30' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
                  >
                    <div className="w-full aspect-square bg-slate-900 mb-2 flex items-center justify-center overflow-hidden rounded">
                        {char.spritesheet_url ? (
                            <img src={char.spritesheet_url} alt={char.name} className="max-w-full max-h-full object-cover" />
                        ) : (
                            <span className="text-xs text-slate-600">No Sprite</span>
                        )}
                    </div>
                    <p className="text-xs font-bold truncate">{char.name}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <Button 
                onClick={joinGame} 
                disabled={!selectedChar} 
                className="w-full h-12 text-lg font-bold bg-cyan-600 hover:bg-cyan-500"
            >
              FIGHT
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black relative">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
         <Button onClick={leaveGame} variant="destructive" size="sm">Leave Game</Button>
         <div className="px-3 py-1 bg-slate-900/80 rounded border border-slate-700 text-xs font-mono">
             Room: {roomId || 'lobby'}
         </div>
      </div>
      
      <div className="absolute bottom-4 left-4 z-10 text-xs text-white/50 font-mono">
         Controls: WASD/Arrows to move, Space/J to Attack
      </div>
      
      {/* 1200x600 logical resolution, scaled down via CSS */}
      <canvas 
        ref={canvasRef} 
        width={1200} 
        height={600} 
        className="max-w-full max-h-full bg-slate-950 border-4 border-slate-800 rounded-xl shadow-2xl pixelated"
        style={{ aspectRatio: '2/1' }}
      />
    </div>
  );
}
