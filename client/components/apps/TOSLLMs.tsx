import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { roleRegistry, Faction, Subalignment, RoleDef } from "../../../shared/roleRegistry";
import {
  Users,
  MessageSquare,
  ShieldAlert,
  Moon,
  Sun,
  Hammer,
  Play,
  RotateCcw,
  CheckCircle,
  HelpCircle,
  Award,
  BookOpen
} from "lucide-react";

export interface Player {
  seat: number;
  name: string;
  isAi: boolean;
  role: string;
  faction: Faction;
  subalignment: Subalignment;
  isAlive: boolean;
  will: string;
  deathReason?: string;
  authUserId?: string;
}

export interface GameMessage {
  senderSeat: number;
  senderName: string;
  text: string;
  isFactionOnly: boolean;
  round: number;
  phase: string;
  day: number;
}

export interface GameLog {
  day: number;
  phase: string;
  message: string;
  timestamp: number;
}

export interface GameRoomState {
  roomId: string;
  creatorId: string;
  players: Player[];
  phase: string;
  day: number;
  logs: GameLog[];
  messages: GameMessage[];
  defendantSeat: number | null;
  trialVoters: { [voterSeat: number]: "Guilty" | "Innocent" | "Abstain" };
  lastWills: { [seat: number]: string };
  aiModel: string;
  isAiRunning: boolean;
  winner?: string;
}

export function TOSLLMsApp() {
  const { session } = useAuth();
  const { toast } = useToast();

  const [roomId, setRoomId] = useState("");
  const [inRoomId, setInRoomId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<GameRoomState | null>(null);
  const [selectedModel, setSelectedModel] = useState("Smart");
  const [numPlayers, setNumPlayers] = useState(10);

  // Form controls
  const [chatMessage, setChatMessage] = useState("");
  const [lastWill, setLastWill] = useState("");
  const [isFactionOnly, setIsFactionOnly] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);

  // Use refs for the latest token, isSyncing, and myPlayer to prevent recreating polling effect
  const latestToken = useRef<string | undefined>(undefined);
  const latestIsSyncing = useRef<boolean>(false);
  const activeRoomId = useRef<string | null>(null);
  const syncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep a stable ref for the current player's state
  const myPlayerRef = useRef<Player | null>(null);

  useEffect(() => {
    latestToken.current = session?.access_token;
  }, [session?.access_token]);

  // Retrieve current user details from lobby
  const myPlayer = useMemo<Player | null>(() => {
    if (!roomState || !session?.user) return null;
    const player = roomState.players.find((p) => p.authUserId === session.user.id) || null;
    myPlayerRef.current = player;
    return player;
  }, [roomState, session]);

  // Sync state with server using abort controller to prevent race conditions or cross-room pollution
  const syncRoom = async (targetId: string, abortSignal?: AbortSignal) => {
    const token = latestToken.current;
    if (!token || latestIsSyncing.current) return;
    latestIsSyncing.current = true;
    setIsSyncingState(true);

    try {
      const res = await fetch(`/api/social-deduction/sync?roomId=${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortSignal
      });
      if (res.ok) {
        const data = await res.json();
        // Check that targetId still matches the active roomId to reject stale room responses
        if (activeRoomId.current === targetId) {
          setRoomState(data.room);
          const activePlayer = myPlayerRef.current;
          if (data.room?.lastWills && activePlayer) {
            setLastWill(data.room.lastWills[activePlayer.seat] || "");
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Sync error:", err);
      }
    } finally {
      latestIsSyncing.current = false;
      setIsSyncingState(false);
    }
  };

  // Start polling effect using stable state pattern and abort controller cleanup
  useEffect(() => {
    activeRoomId.current = inRoomId;
    if (inRoomId) {
      const controller = new AbortController();
      syncRoom(inRoomId, controller.signal);

      syncInterval.current = setInterval(() => {
        syncRoom(inRoomId, controller.signal);
      }, 3000);

      return () => {
        controller.abort();
        if (syncInterval.current) {
          clearInterval(syncInterval.current);
          syncInterval.current = null;
        }
      };
    } else {
      setRoomState(null);
    }
  }, [inRoomId]);

  const handleCreate = async () => {
    const token = latestToken.current;
    if (!token) return;
    try {
      const res = await fetch("/api/social-deduction/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ aiModel: selectedModel })
      });
      const data = await res.json();
      if (data.roomId) {
        setInRoomId(data.roomId);
        setRoomState(data.room);
        toast({ title: "Lobby Created", description: `Room Code: ${data.roomId}` });
      } else {
        toast({ title: "Error", description: data.error || "Failed to create" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleJoin = async () => {
    const token = latestToken.current;
    if (!token || !roomId) return;
    try {
      const res = await fetch("/api/social-deduction/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId })
      });
      const data = await res.json();
      if (res.ok) {
        setInRoomId(roomId.toUpperCase());
        setRoomState(data.room);
        toast({ title: "Lobby Joined", description: `Joined room: ${roomId.toUpperCase()}` });
      } else {
        toast({ title: "Error", description: data.error || "Failed to join" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleStartGame = async () => {
    const token = latestToken.current;
    if (!token || !inRoomId) return;
    try {
      const res = await fetch("/api/social-deduction/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId: inRoomId, numPlayers })
      });
      const data = await res.json();
      if (res.ok) {
        setRoomState(data.room);
        toast({ title: "Game Started!", description: "Roles have been distributed." });
      } else {
        toast({ title: "Error", description: data.error || "Failed to start" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleSendSpeech = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = latestToken.current;
    if (!token || !inRoomId || !chatMessage.trim()) return;
    try {
      const res = await fetch("/api/social-deduction/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId: inRoomId, text: chatMessage, isFactionOnly })
      });
      const data = await res.json();
      if (res.ok) {
        setRoomState(data.room);
        setChatMessage("");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleSaveWill = async () => {
    const token = latestToken.current;
    if (!token || !inRoomId) return;
    try {
      const res = await fetch("/api/social-deduction/will", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId: inRoomId, will: lastWill })
      });
      if (res.ok) {
        toast({ title: "Saved Will", description: "Your last will has been updated." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleVoteTrial = async (targetSeat: number) => {
    const token = latestToken.current;
    if (!token || !inRoomId) return;
    try {
      const res = await fetch("/api/social-deduction/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId: inRoomId, targetSeat })
      });
      const data = await res.json();
      if (res.ok) {
        setRoomState(data.room);
        toast({ title: "Vote Cast", description: `You voted to stand Seat ${targetSeat}.` });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleVerdict = async (verdict: "Guilty" | "Innocent" | "Abstain") => {
    const token = latestToken.current;
    if (!token || !inRoomId) return;
    try {
      const res = await fetch("/api/social-deduction/verdict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId: inRoomId, verdict })
      });
      const data = await res.json();
      if (res.ok) {
        setRoomState(data.room);
        toast({ title: "Verdict Saved", description: `Verdict: ${verdict}` });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleNightAction = async (targetSeat: number) => {
    const token = latestToken.current;
    if (!token || !inRoomId || !myPlayer) return;
    const ability = roleRegistry[myPlayer.role]?.nightAbility || "visit";
    try {
      const res = await fetch("/api/social-deduction/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId: inRoomId, targetSeat, ability })
      });
      const data = await res.json();
      if (res.ok) {
        setRoomState(data.room);
        toast({ title: "Action Selected", description: `Target: Seat ${targetSeat}` });
      } else {
        toast({ title: "Action Blocked", description: data.error || "Cannot select action" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  const handleAdvancePhase = async () => {
    const token = latestToken.current;
    if (!token || !inRoomId) return;
    toast({ title: "Advancing Phase...", description: "Executing state machine transitions and generating LLM statements..." });
    try {
      const res = await fetch("/api/social-deduction/advance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId: inRoomId })
      });
      const data = await res.json();
      if (res.ok) {
        setRoomState(data.room);
      } else {
        toast({ title: "Error", description: data.error || "Cannot advance game" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message });
    }
  };

  // Render Setup / Lobby joining screen
  if (!inRoomId) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto py-8">
        <Card className="bg-slate-900 border-slate-800 text-white">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Users className="text-cyan-500" /> Host a New Lobby
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Default AI Model / Provider</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                <option value="Smart">Smart (Default Stable Horde)</option>
                <option value="Balanced">Balanced (Stable Horde)</option>
                <option value="Fast">Fast (Stable Horde)</option>
                <option value="Write">Write (Stable Horde)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Lobby Seat Limit (5 - 15)</label>
              <input
                type="number"
                min={5}
                max={15}
                value={numPlayers}
                onChange={(e) => setNumPlayers(parseInt(e.target.value) || 10)}
                className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>

            <Button onClick={handleCreate} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold">
              Create Game
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 text-white">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="text-cyan-500" /> Join an Active Lobby
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Enter 6-Letter Room Code</label>
              <Input
                placeholder="e.g. AB12XY"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <Button onClick={handleJoin} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold">
              Join Game
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!roomState) {
    return <div className="text-center text-white py-12">Loading room data...</div>;
  }

  const isLobby = roomState.phase === "Lobby";
  const isCreator = roomState.creatorId === session?.user?.id;

  return (
    <div className="space-y-8 text-white max-w-6xl mx-auto py-4">
      {/* HEADER HERO BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-6 rounded-xl border border-slate-800 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-cyan-400 font-zilla">TOS LLMs</h2>
          <p className="text-sm text-slate-400">
            Room Code: <span className="font-mono text-cyan-300 font-bold">{roomState.roomId}</span> | Day: <span className="text-white font-semibold">{roomState.day}</span> | Phase: <span className="text-yellow-400 font-bold">{roomState.phase}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {isLobby && isCreator && (
            <Button onClick={handleStartGame} className="bg-emerald-600 hover:bg-emerald-500 font-bold">
              <Play className="w-4 h-4 mr-1" /> Start & Populate AI
            </Button>
          )}

          {!isLobby && (
            <Button onClick={handleAdvancePhase} disabled={roomState.isAiRunning} className="bg-yellow-600 hover:bg-yellow-500 font-bold text-slate-950">
              <RotateCcw className="w-4 h-4 mr-1" /> {roomState.isAiRunning ? "AI Thinking..." : "Advance Game Phase"}
            </Button>
          )}

          <Button onClick={() => setInRoomId(null)} variant="destructive">
            Leave Game
          </Button>
        </div>
      </div>

      {/* DETAILED LAYOUT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: ACTIVE SEATS AND PLAYER STATISTICS */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-slate-900 border-slate-800 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-500" /> Player Seats ({roomState.players.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-slate-800 space-y-2 max-h-[500px] overflow-y-auto">
              {roomState.players.map((p) => {
                const isMe = p.authUserId === session?.user?.id;
                const canSelfTarget = roleRegistry[myPlayer?.role || ""]?.mechanics?.canSelfTarget;

                return (
                  <div key={`player-seat-${p.seat}-${p.name}`} className={`py-3 flex flex-col gap-1 ${p.isAlive ? "text-slate-100" : "opacity-40 text-slate-500"}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm flex items-center gap-2">
                        <span className="bg-slate-800 text-slate-300 rounded px-1.5 py-0.5 text-xs font-mono">{p.seat}</span>
                        {p.name} {p.isAi ? "(AI)" : ""} {isMe ? <span className="text-cyan-400 font-bold">(You)</span> : ""}
                      </span>

                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${p.isAlive ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>
                        {p.isAlive ? "Alive" : "Dead"}
                      </span>
                    </div>

                    {!isLobby && (isMe || !p.isAlive) && p.role && (
                      <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-2">
                        <span>Role: <strong className="text-cyan-300">{p.role}</strong></span>
                        <span>Faction: <strong className={p.faction === "Town" ? "text-emerald-400" : "text-red-400"}>{p.faction}</strong></span>
                      </div>
                    )}

                    {/* VOTE TRIGGER BUTTONS FOR ACTIVE GAME PHASES */}
                    {p.isAlive && !isLobby && myPlayer?.isAlive && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {roomState.phase === "Voting" && !isMe && (
                          <Button size="sm" onClick={() => handleVoteTrial(p.seat)} className="bg-yellow-600 hover:bg-yellow-500 text-xs px-2.5 py-1 text-slate-950">
                            Vote up to stand
                          </Button>
                        )}

                        {roomState.phase === "NightAction" && (!isMe || canSelfTarget) && (
                          <Button size="sm" onClick={() => handleNightAction(p.seat)} className="bg-indigo-600 hover:bg-indigo-500 text-xs px-2.5 py-1">
                            Target tonight
                          </Button>
                        )}
                      </div>
                    )}

                    {!p.isAlive && p.deathReason && (
                      <div className="text-xs italic text-red-500 mt-1">
                        Reason: {p.deathReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* MY PERSONAL PLAYER SUMMARY */}
          {myPlayer && !isLobby && (
            <Card className="bg-slate-900 border-slate-800 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-yellow-500" /> Your Secret Identity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-slate-500 block text-xs">Assigned Role</span>
                    <strong className="text-cyan-400 text-base">{myPlayer.role}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs">Alignment</span>
                    <strong className="text-white text-base">{myPlayer.faction}</strong>
                  </div>
                </div>

                <div className="text-xs text-slate-400 space-y-2">
                  <p><strong>Win Condition:</strong> {roleRegistry[myPlayer.role]?.winCondition}</p>
                  <p><strong>Description:</strong> {roleRegistry[myPlayer.role]?.description}</p>
                </div>

                {/* Trial Verdict Actions */}
                {roomState.phase === "TrialVote" && roomState.defendantSeat !== myPlayer.seat && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <span className="text-xs font-semibold block text-slate-400">Vote Verdict on Seat {roomState.defendantSeat}</span>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleVerdict("Guilty")} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold">Guilty</Button>
                      <Button size="sm" onClick={() => handleVerdict("Innocent")} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold">Innocent</Button>
                      <Button size="sm" onClick={() => handleVerdict("Abstain")} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white">Abstain</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN: CHAT INTERFACE, GAME EVENTS, AND LAST WILL */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="bg-slate-900 border-slate-800 text-white flex flex-col h-[500px]">
            <CardHeader className="py-3 border-b border-slate-800 flex flex-row justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2 font-zilla">
                <MessageSquare className="w-5 h-5 text-cyan-500" /> Live Chat & Dialogue Log
              </CardTitle>
              {roomState.phase.includes("Night") && (
                <div className="flex items-center gap-2">
                  <label htmlFor="faction-chat-checkbox" className="text-xs text-slate-400 cursor-pointer select-none">
                    Faction Chat Only
                  </label>
                  <input
                    id="faction-chat-checkbox"
                    type="checkbox"
                    checked={isFactionOnly}
                    onChange={(e) => setIsFactionOnly(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-800"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {roomState.messages.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-12">No chat statements yet.</div>
              ) : (
                roomState.messages.map((m) => {
                  const messageId = `msg-${m.day}-${m.phase}-${m.senderSeat}-${m.round}-${m.text.substring(0, 15)}`;
                  return (
                    <div key={messageId} className="bg-slate-950 p-3 rounded-lg border border-slate-850">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span className="font-bold text-cyan-400 font-mono">
                          Seat {m.senderSeat}: {m.senderName}
                        </span>
                        <span>
                          Day {m.day} ({m.phase}) {m.isFactionOnly ? <span className="text-indigo-400 font-semibold">[Faction Chat]</span> : ""}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200">{m.text}</p>
                    </div>
                  );
                })
              )}
            </CardContent>

            {myPlayer?.isAlive && (
              <form onSubmit={handleSendSpeech} className="p-3 border-t border-slate-800 bg-slate-950 flex gap-2">
                <Input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type your speech statement or claims here..."
                  className="bg-slate-900 border-slate-800 text-white text-sm"
                />
                <Button type="submit" className="bg-cyan-600 hover:bg-cyan-500">
                  Send
                </Button>
              </form>
            )}
          </Card>

          {/* HISTORICAL GAME RESOLUTION LOGS */}
          <Card className="bg-slate-900 border-slate-800 text-white">
            <CardHeader className="py-3 border-b border-slate-800">
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-cyan-500" /> Official Game Resolution Log
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[220px] overflow-y-auto space-y-2 py-3 text-sm font-mono text-slate-300">
              {roomState.logs.length === 0 ? (
                <div className="text-slate-500 italic">No events logged yet.</div>
              ) : (
                roomState.logs.map((log) => {
                  const logId = `log-${log.day}-${log.phase}-${log.timestamp}-${log.message.substring(0, 15)}`;
                  return (
                    <div key={logId} className="border-b border-slate-850 pb-1 flex gap-2">
                      <span className="text-cyan-500">[{log.phase} D{log.day}]</span>
                      <span>{log.message}</span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* LAST WILL WRITING BLOCK */}
          {myPlayer && (
            <Card className="bg-slate-900 border-slate-800 text-white">
              <CardHeader className="py-3 border-b border-slate-800 flex flex-row justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-500" /> Write Your Last Will
                </CardTitle>
                <Button size="sm" onClick={handleSaveWill} className="bg-emerald-600 hover:bg-emerald-500 text-xs">
                  Save Will
                </Button>
              </CardHeader>
              <CardContent className="py-3">
                <Textarea
                  value={lastWill}
                  onChange={(e) => setLastWill(e.target.value)}
                  placeholder="Write your claims, findings, bug checks, or final thoughts here. This will be revealed to the Town upon your death."
                  className="bg-slate-950 border-slate-800 text-white text-sm font-mono h-24"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
export default TOSLLMsApp;
