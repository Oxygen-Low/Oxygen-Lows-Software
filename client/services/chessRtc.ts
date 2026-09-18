/**
 * WebRTC P2P DataChannel and Signaling Client for Multiplayer Chess.
 */

export interface ChessRtcMessage {
  type:
    | "move"
    | "chat"
    | "draw_offer"
    | "draw_response"
    | "resign"
    | "takeback_offer"
    | "takeback_response"
    | "rematch_offer"
    | "rematch_response"
    | "sync_state";
  [key: string]: any;
}

export interface ChessRtcCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onReconnecting: (secondsRemaining: number) => void;
  onMessage: (msg: ChessRtcMessage) => void;
  onError: (err: string) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export class ChessRtcManager {
  private roomId: string = "";
  private peerId: string = "";
  private isHost: boolean = false;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private eventSource: EventSource | null = null;
  private callbacks: ChessRtcCallbacks;
  private isConnected: boolean = false;
  private disconnectTimer: any = null;
  private graceSecondsLeft = 60;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(callbacks: ChessRtcCallbacks) {
    this.callbacks = callbacks;
    this.peerId = `peer_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getRoomId(): string {
    return this.roomId;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Create a new multiplayer room on the server
   */
  async createRoom(
    colorPreference: "w" | "b" | "random",
    timeLimit: number
  ): Promise<{ roomId: string; yourColor: "w" | "b"; timeLimit: number }> {
    this.cleanup();
    this.isHost = true;

    const res = await fetch("/api/chess/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peerId: this.peerId,
        colorPreference,
        timeLimit,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create room");
    }

    const data = await res.json();
    this.roomId = data.roomId;
    this.startSignaling(this.roomId);

    return {
      roomId: data.roomId,
      yourColor: data.hostColor,
      timeLimit: data.timeLimit,
    };
  }

  /**
   * Join an existing multiplayer room
   */
  async joinRoom(
    roomId: string
  ): Promise<{ roomId: string; yourColor: "w" | "b"; opponentColor: "w" | "b"; timeLimit: number }> {
    this.cleanup();
    this.isHost = false;
    const cleanRoomId = roomId.trim().toUpperCase();

    const res = await fetch("/api/chess/room/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: cleanRoomId,
        peerId: this.peerId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to join room");
    }

    const data = await res.json();
    this.roomId = cleanRoomId;
    this.startSignaling(this.roomId);

    return {
      roomId: this.roomId,
      yourColor: data.yourColor,
      opponentColor: data.opponentColor,
      timeLimit: data.timeLimit,
    };
  }

  /**
   * Subscribe to SSE signaling events
   */
  private startSignaling(roomId: string) {
    if (typeof EventSource === "undefined") {
      // Fallback for SSR or environments without EventSource
      return;
    }

    this.eventSource = new EventSource(
      `/api/chess/room/${encodeURIComponent(roomId)}/events?peerId=${encodeURIComponent(this.peerId)}`
    );

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleSignalingMessage(data);
      } catch (e) {
        console.error("Signaling parse error", e);
      }
    };

    this.eventSource.onerror = () => {
      // EventSource auto-reconnects
    };
  }

  /**
   * Handle incoming signaling messages
   */
  private async handleSignalingMessage(data: any) {
    if (!data) return;

    if (data.type === "peer_joined" || data.type === "peer_connected") {
      // Other peer joined!
      this.cancelGracePeriod();
      if (this.isHost) {
        // Host initiates WebRTC connection
        await this.initiatePeerConnection();
      }
      return;
    }

    if (data.type === "peer_disconnected") {
      this.handlePeerDisconnect();
      return;
    }

    if (data.type === "offer") {
      await this.handleOffer(data.payload);
      return;
    }

    if (data.type === "answer") {
      await this.handleAnswer(data.payload);
      return;
    }

    if (data.type === "candidate") {
      await this.handleCandidate(data.payload);
      return;
    }

    if (data.type === "game_fallback_event") {
      // Direct relay fallback if DataChannel is not open
      if (!this.isConnected && data.payload) {
        this.callbacks.onMessage(data.payload);
      }
      return;
    }
  }

  /**
   * Post signaling payload to server
   */
  private async sendSignal(type: string, payload: any) {
    if (!this.roomId) return;
    try {
      await fetch(`/api/chess/room/${encodeURIComponent(this.roomId)}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: this.peerId,
          type,
          payload,
        }),
      });
    } catch (e) {
      console.error("Failed to send signaling message", e);
    }
  }

  /**
   * Initiates RTCPeerConnection (Host side)
   */
  private async initiatePeerConnection() {
    if (typeof RTCPeerConnection === "undefined") return;

    this.setupPeerConnection();

    if (!this.peerConnection) return;

    try {
      this.dataChannel = this.peerConnection.createDataChannel("chess", {
        ordered: true,
      });
      this.setupDataChannel(this.dataChannel);

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      await this.sendSignal("offer", offer);
    } catch (err: any) {
      console.error("Error creating WebRTC offer:", err);
      this.callbacks.onError("WebRTC initialization error");
    }
  }

  /**
   * Handles incoming offer (Guest side)
   */
  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (typeof RTCPeerConnection === "undefined") return;

    this.setupPeerConnection();
    if (!this.peerConnection) return;

    try {
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel(this.dataChannel);
      };

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Process any queued candidates
      while (this.pendingCandidates.length > 0) {
        const c = this.pendingCandidates.shift();
        if (c) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
        }
      }

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      await this.sendSignal("answer", answer);
    } catch (err: any) {
      console.error("Error answering WebRTC offer:", err);
    }
  }

  /**
   * Handles incoming answer (Host side)
   */
  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      while (this.pendingCandidates.length > 0) {
        const c = this.pendingCandidates.shift();
        if (c) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
        }
      }
    } catch (err: any) {
      console.error("Error setting remote description:", err);
    }
  }

  /**
   * Handles ICE candidates
   */
  private async handleCandidate(candidate: RTCIceCandidateInit) {
    if (!candidate) return;
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ice candidate:", err);
      }
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  /**
   * Sets up RTCPeerConnection with STUN servers
   */
  private setupPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal("candidate", event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        this.cancelGracePeriod();
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        this.handlePeerDisconnect();
      }
    };

    this.peerConnection = pc;
  }

  /**
   * Sets up DataChannel event listeners
   */
  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      this.isConnected = true;
      this.cancelGracePeriod();
      this.callbacks.onConnected();
    };

    channel.onclose = () => {
      this.isConnected = false;
      this.handlePeerDisconnect();
    };

    channel.onerror = (err) => {
      console.warn("DataChannel error", err);
    };

    channel.onmessage = (event) => {
      try {
        const msg: ChessRtcMessage = JSON.parse(event.data);
        this.callbacks.onMessage(msg);
      } catch (err) {
        console.error("Failed to parse DataChannel message", err);
      }
    };
  }

  /**
   * Send a game message (via DataChannel if open, with HTTP signaling fallback)
   */
  public sendMessage(msg: ChessRtcMessage): boolean {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(JSON.stringify(msg));
      return true;
    }

    // Fallback relay via signaling server if DataChannel not ready
    this.sendSignal("game_fallback_event", msg);
    return true;
  }

  /**
   * Grace period countdown for peer disconnection
   */
  private handlePeerDisconnect() {
    if (this.disconnectTimer) return; // already counting down

    this.isConnected = false;
    this.graceSecondsLeft = 60;
    this.callbacks.onReconnecting(this.graceSecondsLeft);

    this.disconnectTimer = setInterval(() => {
      this.graceSecondsLeft -= 1;
      if (this.graceSecondsLeft <= 0) {
        this.cancelGracePeriod();
        this.callbacks.onDisconnected();
      } else {
        this.callbacks.onReconnecting(this.graceSecondsLeft);
      }
    }, 1000);
  }

  private cancelGracePeriod() {
    if (this.disconnectTimer) {
      clearInterval(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  /**
   * Teardown and clean up all connections
   */
  public cleanup() {
    this.cancelGracePeriod();
    this.isConnected = false;

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }

    this.pendingCandidates = [];
  }
}
