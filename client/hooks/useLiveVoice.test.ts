/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveVoice, OPENAI_TTS_VOICES } from "./useLiveVoice";

describe("useLiveVoice hook", () => {
  let mockUtteranceInstance: any = null;
  let mockAudioInstance: any = null;
  let mockMediaRecorderInstance: any = null;

  class MockAudio {
    src = "";
    playbackRate = 1;
    onended: (() => void) | null = null;
    onerror: ((e: any) => void) | null = null;

    constructor(src?: string) {
      this.src = src || "";
      mockAudioInstance = this;
    }

    play = vi.fn().mockImplementation(() => {
      setTimeout(() => {
        if (this.onended) this.onended();
      }, 10);
      return Promise.resolve();
    });
    pause = vi.fn();
  }

  class MockMediaRecorder {
    static isTypeSupported = vi.fn(() => true);
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: any) => void) | null = null;
    onstart: (() => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((e: any) => void) | null = null;

    constructor() {
      mockMediaRecorderInstance = this;
    }

    start = vi.fn(() => {
      this.state = "recording";
      if (this.onstart) this.onstart();
    });

    stop = vi.fn(() => {
      this.state = "inactive";
      if (this.ondataavailable) {
        this.ondataavailable({
          data: new Blob([new Uint8Array(1000)], { type: "audio/webm" }),
        });
      }
      if (this.onstop) this.onstop();
    });
  }

  class MockAudioContext {
    state = "running";
    createAnalyser() {
      return {
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
      };
    }
    createMediaStreamSource() {
      return {
        connect: vi.fn(),
      };
    }
    close() {
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    mockUtteranceInstance = null;
    mockAudioInstance = null;
    mockMediaRecorderInstance = null;

    (globalThis as any).Audio = MockAudio;
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    (window as any).Audio = MockAudio;
    (window as any).MediaRecorder = MockMediaRecorder;
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;

    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      lang = "en-US";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
        mockUtteranceInstance = this;
      }
    };

    (window as any).speechSynthesis = {
      speak: vi.fn((utterance: any) => {
        mockUtteranceInstance = utterance;
        setTimeout(() => {
          if (utterance.onend) utterance.onend();
        }, 10);
      }),
      cancel: vi.fn(),
    };

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });

    // Mock global fetch for transcribe and tts
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/ai/transcribe")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ text: "Hello from speech to text" }),
          text: async () => JSON.stringify({ text: "Hello from speech to text" }),
        } as any);
      }
      if (url.includes("/api/ai/tts")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: async () => new Blob(["audio-bytes"], { type: "audio/mpeg" }),
        } as any);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as any);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("identifies browser support correctly and lists available TTS voices", () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    expect(result.current.isSupported).toBe(true);
    expect(result.current.voiceState).toBe("idle");
    expect(result.current.availableVoices.some((v) => v.voiceURI === "alloy")).toBe(true);
    expect(result.current.availableVoices.some((v) => v.voiceURI === "echo")).toBe(true);
  });

  it("starts recording and transitions to listening state", async () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        apiKey: "pk_test_123",
        onSendSpeech,
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.voiceState).toBe("listening");
    expect(mockMediaRecorderInstance).toBeTruthy();
    expect(mockMediaRecorderInstance.start).toHaveBeenCalled();
  });

  it("stops recording and transcribes audio with openai/whisper-large-v3", async () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        apiKey: "pk_test_123",
        onSendSpeech,
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.voiceState).toBe("idle");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/ai/transcribe",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(onSendSpeech).toHaveBeenCalledWith("Hello from speech to text");
  });

  it("speaks assistant text using openai/tts-1", async () => {
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        apiKey: "pk_test_123",
      }),
    );

    await act(async () => {
      result.current.speakText("Hello world response");
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/ai/tts",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("openai/tts-1"),
      }),
    );
  });

  it("stops speaking when stopSpeaking is called", async () => {
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
      }),
    );

    await act(async () => {
      result.current.speakText("Testing cancellation");
    });

    act(() => {
      result.current.stopSpeaking();
    });

    expect(result.current.isSpeaking).toBe(false);
  });

  it("handles microphone permission rejection gracefully", async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(
      new Error("Permission denied"),
    );

    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.voiceState).toBe("error");
    expect(result.current.errorMessage).toContain("Microphone access denied");
  });
});
