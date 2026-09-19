import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ChatCrypto, KeyPairData } from "@/services/crypto";
import { WebRTCManager, PeerStreamInfo, SignalingMessage } from "@/services/webrtc";
import { ringingService } from "@/services/ringing";
import { supabase } from "@/lib/db";
import { toast } from "sonner";

export interface ChatServer {
  id: string;
  name: string;
  icon?: string;
  owner_id: string;
  members: string[];
  created_at: string;
}

export interface ChatChannel {
  id: string;
  server_id: string;
  name: string;
  type: "text" | "voice";
  created_at: string;
}

export interface ChatDM {
  id: string;
  participants: string[];
  recipient_names: Record<string, string>;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  target_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_encrypted?: boolean;
  encrypted_payload?: any;
  attachments?: string[];
  reactions?: Record<string, string[]>;
  created_at: string;
}

export interface ActiveCallState {
  roomId: string;
  roomName: string;
  isVideo: boolean;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  peers: PeerStreamInfo[];
  localStream: MediaStream | null;
}

export interface IncomingCallState {
  roomId: string;
  callerName: string;
  callerId: string;
  isVideo: boolean;
}

interface ChatContextType {
  servers: ChatServer[];
  channels: ChatChannel[];
  dms: ChatDM[];
  activeServerId: string | "dms";
  activeChannelId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  activeCall: ActiveCallState | null;
  incomingCall: IncomingCallState | null;
  keyPair: KeyPairData | null;
  setActiveServerId: (id: string | "dms") => void;
  setActiveChannelId: (id: string | null) => void;
  createServer: (name: string, icon?: string) => Promise<ChatServer | null>;
  createChannel: (serverId: string, name: string, type: "text" | "voice") => Promise<ChatChannel | null>;
  startDm: (recipientId: string, recipientName: string) => Promise<ChatDM | null>;
  sendMessage: (content: string, attachments?: string[]) => Promise<void>;
  startCall: (targetId: string, targetName: string, isVideo: boolean) => Promise<void>;
  joinVoiceChannel: (channel: ChatChannel) => Promise<void>;
  acceptIncomingCall: (withVideo?: boolean) => Promise<void>;
  declineIncomingCall: () => void;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => Promise<void>;
  toggleDeafen: () => void;
  toggleScreenShare: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ? String(session.user.id) : null;
  const username = session?.user?.user_metadata?.username || session?.user?.email?.split("@")[0] || "User";

  const [servers, setServers] = useState<ChatServer[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [dms, setDms] = useState<ChatDM[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | "dms">("dms");
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  const [keyPair, setKeyPair] = useState<KeyPairData | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);

  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  // Initialize E2EE Keys
  useEffect(() => {
    if (!userId) return;
    ChatCrypto.getOrCreateLocalKeyPair().then((kp) => {
      setKeyPair(kp);
      // Publish public key to server
      fetch("/api/chat/users/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ publicKey: kp.publicKey }),
      }).catch(console.error);
    });
  }, [userId, session?.access_token]);

  // Load chat state
  const loadState = useCallback(async () => {
    if (!session?.access_token) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/chat/state", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers || []);
        setChannels(data.channels || []);
        setDms(data.dms || []);

        if (!activeChannelIdRef.current) {
          if (data.dms?.length > 0) {
            setActiveChannelId(data.dms[0].id);
            setActiveServerId("dms");
          } else if (data.channels?.length > 0) {
            setActiveServerId(data.servers[0]?.id || "dms");
            setActiveChannelId(data.channels[0].id);
          }
        } else if (activeChannelIdRef.current?.startsWith("dm_")) {
          if (!data.dms?.some((d: any) => d.id === activeChannelIdRef.current)) {
            setActiveChannelId(data.dms?.[0]?.id || null);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load chat state", err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    const handleFocus = () => {
      loadState();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadState]);

  // Load messages when active channel/DM changes
  useEffect(() => {
    if (!activeChannelId || !session?.access_token) return;
    let isCancelled = false;

    fetch(`/api/chat/messages?targetId=${encodeURIComponent(activeChannelId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (isCancelled) return;
        const fetchedMessages: ChatMessage[] = data.messages || [];

        // Decrypt any encrypted messages if we have keys
        if (keyPair) {
          const decrypted = await Promise.all(
            fetchedMessages.map(async (msg) => {
              if (msg.is_encrypted && msg.encrypted_payload) {
                try {
                  // In DM, decrypt using shared key with other participant
                  const dm = dms.find((d) => d.id === msg.target_id);
                  const otherUserId = dm?.participants?.find((p) => String(p) !== String(userId));
                  if (otherUserId) {
                    const pubKeyRes = await fetch(`/api/chat/users/keys/${otherUserId}`, {
                      headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    if (pubKeyRes.ok) {
                      const { publicKey } = await pubKeyRes.json();
                      const sharedKey = await ChatCrypto.deriveSharedKey(keyPair.privateKey, publicKey);
                      const plain = await ChatCrypto.decryptMessage(msg.encrypted_payload, sharedKey);
                      return { ...msg, content: plain };
                    }
                  }
                } catch {
                  // Fallback if decryption fails
                }
              }
              return msg;
            })
          );
          setMessages(decrypted);
        } else {
          setMessages(fetchedMessages);
        }
      })
      .catch(console.error);

    return () => {
      isCancelled = true;
    };
  }, [activeChannelId, session?.access_token, keyPair, dms, userId]);

  // Signaling sender helper
  const sendSignaling = useCallback(
    (msg: SignalingMessage) => {
      if (!session?.access_token) return;
      fetch("/api/chat/calls/signal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: msg.type,
          targetUserId: msg.targetId,
          roomId: msg.roomId,
          data: msg.data,
        }),
      }).catch(console.error);
    },
    [session?.access_token]
  );

  // Initialize WebRTC Manager
  useEffect(() => {
    if (!userId) return;
    const rtc = new WebRTCManager(userId, username, sendSignaling);
    rtc.setCallbacks(
      (peers) => {
        setActiveCall((prev) => (prev ? { ...prev, peers } : null));
      },
      (localStream) => {
        setActiveCall((prev) => (prev ? { ...prev, localStream } : null));
      }
    );
    webrtcManagerRef.current = rtc;

    return () => {
      rtc.leaveRoom();
    };
  }, [userId, username, sendSignaling]);

  // Real-time listener via Supabase SSE channel
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("chat-realtime");

    channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "chat_messages" },
      async (payload: any) => {
        const newMsg = payload.new;
        if (!newMsg) return;

        if (newMsg.target_id === activeChannelId) {
          // Decrypt if encrypted
          if (newMsg.is_encrypted && newMsg.encrypted_payload && keyPair) {
            try {
              const dm = dms.find((d) => d.id === newMsg.target_id);
              const otherUserId = dm?.participants?.find((p) => String(p) !== String(userId));
              if (otherUserId) {
                const pubKeyRes = await fetch(`/api/chat/users/keys/${otherUserId}`, {
                  headers: { Authorization: `Bearer ${session?.access_token}` },
                });
                if (pubKeyRes.ok) {
                  const { publicKey } = await pubKeyRes.json();
                  const sharedKey = await ChatCrypto.deriveSharedKey(keyPair.privateKey, publicKey);
                  const plain = await ChatCrypto.decryptMessage(newMsg.encrypted_payload, sharedKey);
                  newMsg.content = plain;
                }
              }
            } catch {}
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      }
    );

    channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "chat_signaling" },
      async (payload: any) => {
        const data = payload.new;
        if (!data || data.senderId === userId) return;

        if (data.type === "call_invite") {
          // Trigger ringing
          ringingService.startRinging(data.senderName || "Friend", data.isVideo);
          setIncomingCall({
            roomId: data.roomId,
            callerName: data.senderName || "Friend",
            callerId: data.senderId,
            isVideo: !!data.isVideo,
          });
        } else if (data.type === "call_reject" || data.type === "call_end") {
          ringingService.stopRinging();
          setIncomingCall(null);
          if (activeCall?.roomId === data.roomId) {
            leaveCall();
            toast.info("Call ended");
          }
        } else if (webrtcManagerRef.current) {
          // Pass offer/answer/ice to WebRTC manager
          webrtcManagerRef.current.handleSignalingMessage({
            type: data.type,
            senderId: data.senderId,
            targetId: data.targetUserId,
            roomId: data.roomId,
            data: data.data,
          });
        }
      }
    );

    channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "chat_dms" },
      (payload: any) => {
        const evt = payload.eventType || payload.event;
        if (evt === "INSERT" && payload.new) {
          const newDm = payload.new;
          if (newDm.participants && newDm.participants.some((p: any) => String(p) === String(userId))) {
            setDms((prev) => {
              if (prev.some((d) => d.id === newDm.id)) return prev;
              return [...prev, newDm];
            });
          }
        } else if (evt === "DELETE" && payload.old) {
          const deletedId = payload.old.id;
          if (deletedId) {
            setDms((prev) => prev.filter((d) => d.id !== deletedId));
            setActiveChannelId((cur) => (cur === deletedId ? null : cur));
          }
        } else {
          loadState();
        }
      }
    );

    channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "friendships" },
      () => {
        loadState();
      }
    );

    channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "blocks" },
      () => {
        loadState();
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, activeChannelId, keyPair, dms, session?.access_token, activeCall?.roomId]);

  const createServer = async (name: string, icon?: string): Promise<ChatServer | null> => {
    if (!session?.access_token) return null;
    try {
      const res = await fetch("/api/chat/servers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name, icon }),
      });
      if (res.ok) {
        const data = await res.json();
        setServers((prev) => [...prev, data.server]);
        setChannels((prev) => [...prev, ...data.channels]);
        setActiveServerId(data.server.id);
        setActiveChannelId(data.channels[0]?.id || null);
        toast.success(`Server "${name}" created!`);
        return data.server;
      }
    } catch (err) {
      toast.error("Failed to create server");
    }
    return null;
  };

  const createChannel = async (serverId: string, name: string, type: "text" | "voice"): Promise<ChatChannel | null> => {
    if (!session?.access_token) return null;
    try {
      const res = await fetch(`/api/chat/servers/${serverId}/channels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name, type }),
      });
      if (res.ok) {
        const data = await res.json();
        setChannels((prev) => [...prev, data.channel]);
        setActiveChannelId(data.channel.id);
        toast.success(`Channel #${name} created!`);
        return data.channel;
      }
    } catch (err) {
      toast.error("Failed to create channel");
    }
    return null;
  };

  const startDm = async (recipientId: string, recipientName: string): Promise<ChatDM | null> => {
    if (!session?.access_token) return null;
    try {
      const res = await fetch("/api/chat/dms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ recipientId, recipientName }),
      });
      if (res.ok) {
        const data = await res.json();
        const existing = dms.find((d) => d.id === data.dm.id);
        if (!existing) {
          setDms((prev) => [...prev, data.dm]);
        }
        setActiveServerId("dms");
        setActiveChannelId(data.dm.id);
        return data.dm;
      }
    } catch (err) {
      toast.error("Failed to start DM");
    }
    return null;
  };

  const sendMessage = async (content: string, attachments: string[] = []) => {
    if (!activeChannelId || !session?.access_token) return;

    let isEncrypted = false;
    let encryptedPayload: any = null;

    // If active channel is a DM, encrypt using recipient's public key
    const currentDm = dms.find((d) => d.id === activeChannelId);
    let targetUserId: string | undefined;

    if (currentDm) {
      const otherUserId = currentDm.participants.find((p) => String(p) !== String(userId));
      if (otherUserId) {
        targetUserId = String(otherUserId);
        if (keyPair) {
          try {
            const pubKeyRes = await fetch(`/api/chat/users/keys/${otherUserId}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (pubKeyRes.ok) {
              const { publicKey } = await pubKeyRes.json();
              const sharedKey = await ChatCrypto.deriveSharedKey(keyPair.privateKey, publicKey);
              encryptedPayload = await ChatCrypto.encryptMessage(content, sharedKey);
              isEncrypted = true;
            }
          } catch (err) {
            console.warn("E2EE key exchange unavailable for peer, falling back to transport encryption", err);
          }
        }
      }
    }

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          targetId: activeChannelId,
          targetUserId,
          content,
          isEncrypted,
          encryptedPayload,
          attachments,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const msg = data.message;
        if (isEncrypted) {
          msg.content = content; // render locally decrypted
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    } catch (err) {
      toast.error("Failed to send message");
    }
  };

  const startCall = async (targetId: string, targetName: string, isVideo: boolean) => {
    if (!session?.access_token || !webrtcManagerRef.current) return;
    const roomId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const stream = await webrtcManagerRef.current.startLocalMedia(isVideo);
      webrtcManagerRef.current.joinRoom(roomId);

      setActiveCall({
        roomId,
        roomName: targetName,
        isVideo,
        isAudioMuted: false,
        isVideoMuted: !isVideo,
        isDeafened: false,
        isScreenSharing: false,
        peers: [],
        localStream: stream,
      });

      // Send call invitation signaling to target recipient
      const currentDm = dms.find((d) => d.id === targetId);
      const otherUserId = currentDm?.participants.find((p) => String(p) !== String(userId)) || targetId;

      await fetch("/api/chat/calls/signal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "call_invite",
          targetUserId: otherUserId,
          roomId,
          isVideo,
        }),
      });

      toast.info(`Calling ${targetName}...`);
    } catch (err) {
      toast.error("Could not access camera/microphone");
    }
  };

  const joinVoiceChannel = async (channel: ChatChannel) => {
    if (!webrtcManagerRef.current) return;
    try {
      const stream = await webrtcManagerRef.current.startLocalMedia(false);
      webrtcManagerRef.current.joinRoom(channel.id);

      setActiveCall({
        roomId: channel.id,
        roomName: `#${channel.name}`,
        isVideo: false,
        isAudioMuted: false,
        isVideoMuted: true,
        isDeafened: false,
        isScreenSharing: false,
        peers: [],
        localStream: stream,
      });
      toast.success(`Connected to voice channel #${channel.name}`);
    } catch (err) {
      toast.error("Could not access microphone");
    }
  };

  const acceptIncomingCall = async (withVideo = false) => {
    if (!incomingCall || !webrtcManagerRef.current) return;
    ringingService.stopRinging();

    const currentIncoming = incomingCall;
    setIncomingCall(null);

    try {
      const stream = await webrtcManagerRef.current.startLocalMedia(withVideo || currentIncoming.isVideo);
      webrtcManagerRef.current.joinRoom(currentIncoming.roomId, [currentIncoming.callerId]);

      setActiveCall({
        roomId: currentIncoming.roomId,
        roomName: currentIncoming.callerName,
        isVideo: withVideo || currentIncoming.isVideo,
        isAudioMuted: false,
        isVideoMuted: !(withVideo || currentIncoming.isVideo),
        isDeafened: false,
        isScreenSharing: false,
        peers: [],
        localStream: stream,
      });
    } catch (err) {
      toast.error("Could not access media devices");
    }
  };

  const declineIncomingCall = () => {
    if (!incomingCall) return;
    ringingService.stopRinging();

    if (session?.access_token) {
      fetch("/api/chat/calls/signal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: "call_reject",
          targetUserId: incomingCall.callerId,
          roomId: incomingCall.roomId,
        }),
      }).catch(console.error);
    }
    setIncomingCall(null);
  };

  const leaveCall = () => {
    ringingService.stopRinging();
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.leaveRoom();
    }
    setActiveCall(null);
  };

  const toggleMute = () => {
    if (webrtcManagerRef.current && activeCall) {
      const isMuted = webrtcManagerRef.current.toggleAudioMute();
      setActiveCall((prev) => (prev ? { ...prev, isAudioMuted: isMuted } : null));
    }
  };

  const toggleVideo = async () => {
    if (webrtcManagerRef.current && activeCall) {
      const isVideoActive = await webrtcManagerRef.current.toggleVideo();
      setActiveCall((prev) => (prev ? { ...prev, isVideoMuted: !isVideoActive } : null));
    }
  };

  const toggleDeafen = () => {
    if (webrtcManagerRef.current && activeCall) {
      const isDeafened = webrtcManagerRef.current.toggleDeafen();
      setActiveCall((prev) => (prev ? { ...prev, isDeafened } : null));
    }
  };

  const toggleScreenShare = async () => {
    if (webrtcManagerRef.current && activeCall) {
      const isSharing = await webrtcManagerRef.current.toggleScreenShare();
      setActiveCall((prev) => (prev ? { ...prev, isScreenSharing: isSharing } : null));
    }
  };

  return (
    <ChatContext.Provider
      value={{
        servers,
        channels,
        dms,
        activeServerId,
        activeChannelId,
        messages,
        isLoading,
        activeCall,
        incomingCall,
        keyPair,
        setActiveServerId,
        setActiveChannelId,
        createServer,
        createChannel,
        startDm,
        sendMessage,
        startCall,
        joinVoiceChannel,
        acceptIncomingCall,
        declineIncomingCall,
        leaveCall,
        toggleMute,
        toggleVideo,
        toggleDeafen,
        toggleScreenShare,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
