/**
 * WebRTC P2P Mesh Manager.
 * Handles audio, video, and screen sharing direct peer-to-peer streams.
 */

export interface PeerStreamInfo {
  peerId: string;
  peerName?: string;
  stream: MediaStream;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
}

export interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate" | "leave" | "state";
  senderId: string;
  targetId?: string;
  roomId: string;
  data?: any;
}

export type SignalingSendFn = (msg: SignalingMessage) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private peerStreams = new Map<string, PeerStreamInfo>();
  private signalingSender: SignalingSendFn | null = null;
  private localUserId: string = "";
  private localUserName: string = "";
  private currentRoomId: string = "";

  private onPeersUpdateCallback: ((peers: PeerStreamInfo[]) => void) | null = null;
  private onLocalStreamUpdateCallback: ((stream: MediaStream | null) => void) | null = null;
  private isAudioMuted = false;
  private isVideoMuted = false;
  private isDeafened = false;

  private audioCtx: AudioContext | null = null;
  private analyserMap = new Map<string, AnalyserNode>();
  private speakingInterval: number | null = null;

  constructor(localUserId: string, localUserName: string, signalingSender: SignalingSendFn) {
    this.localUserId = localUserId;
    this.localUserName = localUserName;
    this.signalingSender = signalingSender;
  }

  setCallbacks(
    onPeersUpdate: (peers: PeerStreamInfo[]) => void,
    onLocalStreamUpdate: (stream: MediaStream | null) => void
  ) {
    this.onPeersUpdateCallback = onPeersUpdate;
    this.onLocalStreamUpdateCallback = onLocalStreamUpdate;
  }

  /**
   * Initializes local audio/video media stream.
   */
  async startLocalMedia(video = false): Promise<MediaStream> {
    if (this.localStream) {
      this.stopLocalMedia();
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
            }
          : false,
      });

      this.isVideoMuted = !video;
      this.isAudioMuted = false;
      this.setupSpeakingDetection("local", this.localStream);
      this.onLocalStreamUpdateCallback?.(this.localStream);
      return this.localStream;
    } catch (err) {
      console.warn("Could not get media stream:", err);
      // Fallback to audio only if video failed
      if (video) {
        return this.startLocalMedia(false);
      }
      throw err;
    }
  }

  /**
   * Stops local media and screen share tracks.
   */
  stopLocalMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    this.analyserMap.clear();
    this.onLocalStreamUpdateCallback?.(null);
  }

  /**
   * Toggles screen sharing.
   */
  async toggleScreenShare(): Promise<boolean> {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;

      // Replace screen video track back with local camera video track (or remove)
      const videoTrack = this.localStream?.getVideoTracks()[0] || null;
      this.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          if (videoTrack) {
            sender.replaceTrack(videoTrack);
          } else {
            pc.removeTrack(sender);
          }
        }
      });
      this.notifyPeersUpdate();
      return false;
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as any,
        audio: true,
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];
      screenTrack.onended = () => {
        this.toggleScreenShare();
      };

      this.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, this.screenStream!);
        }
      });

      this.notifyPeersUpdate();
      return true;
    } catch (err) {
      console.warn("Screen share cancelled or error:", err);
      return false;
    }
  }

  /**
   * Toggles local microphone mute.
   */
  toggleAudioMute(): boolean {
    if (!this.localStream) return false;
    this.isAudioMuted = !this.isAudioMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isAudioMuted;
    });
    this.broadcastState();
    return this.isAudioMuted;
  }

  /**
   * Toggles local camera.
   */
  async toggleVideo(): Promise<boolean> {
    if (!this.localStream) return false;
    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    if (currentVideoTrack) {
      currentVideoTrack.enabled = !currentVideoTrack.enabled;
      this.isVideoMuted = !currentVideoTrack.enabled;
    } else {
      // Need to add video track
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = tempStream.getVideoTracks()[0];
        this.localStream.addTrack(newTrack);
        this.isVideoMuted = false;
        this.peerConnections.forEach((pc) => {
          pc.addTrack(newTrack, this.localStream!);
        });
      } catch (err) {
        console.warn("Cannot enable camera:", err);
        return false;
      }
    }
    this.notifyPeersUpdate();
    this.broadcastState();
    return !this.isVideoMuted;
  }

  /**
   * Toggles deafen (mute all remote peer audio elements).
   */
  toggleDeafen(): boolean {
    this.isDeafened = !this.isDeafened;
    this.peerStreams.forEach((p) => {
      p.stream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isDeafened;
      });
    });
    return this.isDeafened;
  }

  /**
   * Joins a room and initiates connections to known peers.
   */
  joinRoom(roomId: string, existingPeerIds: string[] = []) {
    this.currentRoomId = roomId;
    existingPeerIds.forEach((peerId) => {
      if (peerId !== this.localUserId) {
        this.createPeerConnection(peerId, true);
      }
    });
  }

  /**
   * Leaves current room and closes all peer connections.
   */
  leaveRoom() {
    if (this.currentRoomId) {
      this.signalingSender?.({
        type: "leave",
        senderId: this.localUserId,
        roomId: this.currentRoomId,
      });
    }

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.peerStreams.clear();
    this.stopLocalMedia();
    this.currentRoomId = "";
    this.notifyPeersUpdate();
  }

  /**
   * Handles incoming signaling messages.
   */
  async handleSignalingMessage(msg: SignalingMessage) {
    if (msg.roomId !== this.currentRoomId || msg.senderId === this.localUserId) return;

    if (msg.targetId && msg.targetId !== this.localUserId) return;

    switch (msg.type) {
      case "offer": {
        const pc = this.createPeerConnection(msg.senderId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.signalingSender?.({
          type: "answer",
          senderId: this.localUserId,
          targetId: msg.senderId,
          roomId: this.currentRoomId,
          data: { sdp: answer, userName: this.localUserName },
        });
        break;
      }

      case "answer": {
        const pc = this.peerConnections.get(msg.senderId);
        if (pc && pc.signalingState !== "stable") {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data.sdp));
        }
        break;
      }

      case "ice-candidate": {
        const pc = this.peerConnections.get(msg.senderId);
        if (pc && msg.data?.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.data.candidate));
          } catch (err) {
            console.warn("Failed to add ice candidate:", err);
          }
        }
        break;
      }

      case "state": {
        const peer = this.peerStreams.get(msg.senderId);
        if (peer && msg.data) {
          peer.isAudioMuted = !!msg.data.isAudioMuted;
          peer.isVideoMuted = !!msg.data.isVideoMuted;
          peer.isScreenSharing = !!msg.data.isScreenSharing;
          this.notifyPeersUpdate();
        }
        break;
      }

      case "leave": {
        const pc = this.peerConnections.get(msg.senderId);
        if (pc) {
          pc.close();
          this.peerConnections.delete(msg.senderId);
        }
        this.peerStreams.delete(msg.senderId);
        this.notifyPeersUpdate();
        break;
      }
    }
  }

  private createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId)!;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(peerId, pc);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }
    if (this.screenStream) {
      this.screenStream.getVideoTracks().forEach((track) => {
        pc.addTrack(track, this.screenStream!);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signalingSender?.({
          type: "ice-candidate",
          senderId: this.localUserId,
          targetId: peerId,
          roomId: this.currentRoomId,
          data: { candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      let peerInfo = this.peerStreams.get(peerId);
      if (!peerInfo) {
        peerInfo = {
          peerId,
          stream,
          isAudioMuted: false,
          isVideoMuted: false,
          isScreenSharing: false,
          isSpeaking: false,
        };
        this.peerStreams.set(peerId, peerInfo);
        this.setupSpeakingDetection(peerId, stream);
      } else {
        peerInfo.stream = stream;
      }
      this.notifyPeersUpdate();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.peerConnections.delete(peerId);
        this.peerStreams.delete(peerId);
        this.notifyPeersUpdate();
      }
    };

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.signalingSender?.({
            type: "offer",
            senderId: this.localUserId,
            targetId: peerId,
            roomId: this.currentRoomId,
            data: { sdp: offer, userName: this.localUserName },
          });
        } catch (err) {
          console.error("Negotiation error:", err);
        }
      };
    }

    return pc;
  }

  private broadcastState() {
    this.signalingSender?.({
      type: "state",
      senderId: this.localUserId,
      roomId: this.currentRoomId,
      data: {
        isAudioMuted: this.isAudioMuted,
        isVideoMuted: this.isVideoMuted,
        isScreenSharing: !!this.screenStream,
      },
    });
  }

  private setupSpeakingDetection(id: string, stream: MediaStream) {
    if (typeof window === "undefined" || stream.getAudioTracks().length === 0) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      this.analyserMap.set(id, analyser);

      if (!this.speakingInterval) {
        const dataArray = new Uint8Array(256);
        this.speakingInterval = window.setInterval(() => {
          this.analyserMap.forEach((an, targetId) => {
            an.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const isSpeaking = avg > 20;

            if (targetId !== "local") {
              const peer = this.peerStreams.get(targetId);
              if (peer && peer.isSpeaking !== isSpeaking) {
                peer.isSpeaking = isSpeaking;
                this.notifyPeersUpdate();
              }
            }
          });
        }, 150);
      }
    } catch (err) {
      console.warn("Speaking detection init failed:", err);
    }
  }

  private notifyPeersUpdate() {
    this.onPeersUpdateCallback?.(Array.from(this.peerStreams.values()));
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  getPeers(): PeerStreamInfo[] {
    return Array.from(this.peerStreams.values());
  }
}
