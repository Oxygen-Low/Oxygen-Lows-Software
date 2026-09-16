/**
 * Cross-platform Ringing and Notification Service for Incoming Calls.
 * Handles Android RingtoneManager bridge, Desktop WebView2 bridge, and Web Audio API synthesizer.
 */

class RingingService {
  private audioCtx: AudioContext | null = null;
  private ringInterval: number | null = null;
  private isRinging = false;

  /**
   * Request system notification permissions if needed.
   */
  async requestPermissions(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if ("Notification" in window && Notification.permission === "default") {
      try {
        const res = await Notification.requestPermission();
        return res === "granted";
      } catch {
        return false;
      }
    }
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  }

  /**
   * Starts ringing for an incoming call across Web, Desktop, and Android.
   */
  startRinging(callerName: string, isVideo = false) {
    if (this.isRinging) return;
    this.isRinging = true;

    // 1. Android Bridge: Tell native Android app to play default phone ringtone
    try {
      if ((window as any).AndroidApp && typeof (window as any).AndroidApp.postMessage === "function") {
        (window as any).AndroidApp.postMessage(
          JSON.stringify({
            command: "play_ringtone",
            callerName,
            isVideo,
          })
        );
      }
    } catch (e) {
      console.error("Failed to post message to AndroidApp", e);
    }

    // 2. Desktop WebView2 Bridge: Windows Toast / chime
    try {
      if ((window as any).chrome?.webview?.postMessage) {
        (window as any).chrome.webview.postMessage({
          command: "show_call_notification",
          callerName,
          isVideo,
        });
      }
    } catch (e) {
      console.error("Failed to post message to Desktop WebView", e);
    }

    // 3. Web Notification (if permission granted)
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Incoming Call - Oxygen Low's Software", {
          body: `${callerName} is calling you (${isVideo ? "Video" : "Voice"})...`,
          icon: "/favicon.ico",
          tag: "incoming-call",
          requireInteraction: true,
        });
      }
    } catch {
      // Ignore notification creation errors
    }

    // 4. Web Audio Synthesizer Chime
    this.startWebAudioRingtone();
  }

  /**
   * Stops ringing across all platforms.
   */
  stopRinging() {
    this.isRinging = false;

    // Android stop
    try {
      if ((window as any).AndroidApp && typeof (window as any).AndroidApp.postMessage === "function") {
        (window as any).AndroidApp.postMessage(
          JSON.stringify({
            command: "stop_ringtone",
          })
        );
      }
    } catch (e) {
      console.error("Failed to stop Android ringtone", e);
    }

    // Desktop stop
    try {
      if ((window as any).chrome?.webview?.postMessage) {
        (window as any).chrome.webview.postMessage({
          command: "stop_call_ringtone",
        });
      }
    } catch (e) {
      console.error("Failed to stop Desktop ringtone", e);
    }

    // Web Audio stop
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }

  private startWebAudioRingtone() {
    if (typeof window === "undefined") return;

    const playTone = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        if (!this.audioCtx || this.audioCtx.state === "closed") {
          this.audioCtx = new AudioContextClass();
        }

        const ctx = this.audioCtx;
        if (ctx.state === "suspended") {
          ctx.resume();
        }

        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Standard ringing chord (440Hz A + 480Hz B)
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(440, now);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(480, now);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.18, now + 0.05);
        gainNode.gain.setValueAtTime(0.18, now + 1.2);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.5);
        osc2.stop(now + 1.5);
      } catch (err) {
        console.warn("Web Audio chime error:", err);
      }
    };

    playTone();
    this.ringInterval = window.setInterval(() => {
      if (this.isRinging) {
        playTone();
      }
    }, 2800);
  }
}

export const ringingService = new RingingService();
