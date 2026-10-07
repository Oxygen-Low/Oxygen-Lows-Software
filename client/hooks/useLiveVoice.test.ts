/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveVoice, OPENAI_REALTIME_VOICES } from "./useLiveVoice";

describe("useLiveVoice hook", () => {
  let activeRecognitionInstance: any = null;
  let mockUtteranceInstance: any = null;
  let mockAudioInstance: any = null;
  let mockWebSocketInstance: any = null;

  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    url: string;
    onopen: (() => void) | null = null;
    onmessage: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    onclose: (() => void) | null = null;

    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose();
    });

    constructor(url: string) {
      this.url = url;
      mockWebSocketInstance = this;
      setTimeout(() => {
        if (this.onopen) this.onopen();
      }, 0);
    }
  }

  class MockSpeechRecognition {
    continuous = false;
    interimResults = false;
    lang = "";
    maxAlternatives = 1;
    onstart: (() => void) | null = null;
    onresult: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    onend: (() => void) | null = null;

    constructor() {
      activeRecognitionInstance = this;
    }

    start = vi.fn(() => {
      if (this.onstart) this.onstart();
    });

    stop = vi.fn(() => {
      if (this.onend) this.onend();
    });

    abort = vi.fn();
  }

  class MockAudio {
    src = "";
    playbackRate = 1;
    onended: (() => void) | null = null;
    onerror: ((e: any) => void) | null = null;

    constructor(src?: string) {
      this.src = src || "";
      mockAudioInstance = this;
    }

    play = vi.fn().mockImplementation(() => Promise.resolve());
    pause = vi.fn();
  }

  class MockAudioContext {
    state = "running";
    currentTime = 0;
    sampleRate = 24000;
    destination = {};

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
    createScriptProcessor() {
      return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      };
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
      const channelData = new Float32Array(length);
      return {
        duration: length / sampleRate,
        getChannelData: () => channelData,
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    activeRecognitionInstance = null;
    mockUtteranceInstance = null;
    mockAudioInstance = null;
    mockWebSocketInstance = null;

    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).Audio = MockAudio;
    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
    (window as any).Audio = MockAudio;
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = MockAudioContext;

    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      pitch = 1;
      lang = "en-US";
      voice = null;
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
      }),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => [
        {
          name: "Google US English",
          lang: "en-US",
          voiceURI: "Google US English",
          default: true,
        },
      ]),
      onvoiceschanged: null,
    };

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("identifies browser support correctly without relying on browser speech APIs", () => {
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

  it("is supported even when SpeechRecognition and speechSynthesis are absent", () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    delete (window as any).speechSynthesis;
    delete (window as any).SpeechSynthesisUtterance;

    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    expect(result.current.isSupported).toBe(true);
  });

  it("starts session, connects Realtime WebSocket, and transitions to listening state", async () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        apiKey: "pk_test_123",
        onSendSpeech,
      }),
    );

    await act(async () => {
      await result.current.startSession();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.voiceState).toBe("listening");
    expect(mockWebSocketInstance).toBeTruthy();
    expect(mockWebSocketInstance.url).toContain("openai/gpt-realtime-2.1-mini");
    expect(mockWebSocketInstance.url).toContain("key=pk_test_123");
    expect(mockWebSocketInstance.send).toHaveBeenCalled();
  });

  it("toggles mute state properly", async () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    await act(async () => {
      await result.current.startSession();
    });

    act(() => {
      result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(true);
    expect(result.current.voiceState).toBe("muted");

    act(() => {
      result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(false);
    expect(result.current.voiceState).toBe("listening");
  });

  it("speaks text with neural audio and returns to listening when finished", async () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    await act(async () => {
      await result.current.startSession();
    });

    await act(async () => {
      result.current.speakText("Hello from Oxygen Low's Software!");
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.voiceState).toBe("speaking");

    await act(async () => {
      if (mockAudioInstance && mockAudioInstance.onended) {
        mockAudioInstance.onended();
      } else if (mockUtteranceInstance && mockUtteranceInstance.onend) {
        mockUtteranceInstance.onend();
      }
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(result.current.voiceState).toBe("listening");
  });

  it("handles push-to-talk start and end with speech result", async () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    await act(async () => {
      await result.current.startSession();
    });

    act(() => {
      result.current.toggleHandsFree();
    });
    expect(result.current.isHandsFree).toBe(false);

    act(() => {
      result.current.handlePushToTalkStart();
    });
    expect(result.current.isPushToTalkActive).toBe(true);

    act(() => {
      activeRecognitionInstance.onresult({
        resultIndex: 0,
        results: [[{ transcript: "Tell me a joke" }]],
      });
    });

    expect(result.current.interimTranscript).toContain("Tell me a joke");

    act(() => {
      result.current.handlePushToTalkEnd();
    });

    expect(result.current.voiceState).toBe("thinking");
  });

  it("handles speech interruption and stops audio playback", async () => {
    const onSendSpeech = vi.fn();
    const onInterrupt = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
        onInterrupt,
      }),
    );

    await act(async () => {
      await result.current.startSession();
    });

    await act(async () => {
      result.current.speakText("Long response is being spoken...");
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.voiceState).toBe("speaking");

    act(() => {
      result.current.interrupt();
    });

    expect(onInterrupt).toHaveBeenCalled();
    expect(result.current.voiceState).toBe("listening");
  });

  it("updates speech rate and pitch preferences", () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    act(() => {
      result.current.updateSpeechRate(1.5);
      result.current.updateSpeechPitch(1.2);
    });

    expect(result.current.speechRate).toBe(1.5);
    expect(result.current.speechPitch).toBe(1.2);
  });

  it("processes realtime streaming delta events from WebSocket", async () => {
    const onSendSpeech = vi.fn();
    const onAssistantResponse = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        apiKey: "pk_test_key",
        onSendSpeech,
        onAssistantResponse,
      }),
    );

    await act(async () => {
      await result.current.startSession();
      await new Promise((r) => setTimeout(r, 10));
    });

    // Simulate speech started event from server VAD
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      });
    });
    expect(result.current.voiceState).toBe("listening");

    // Simulate speech stopped event
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }),
      });
    });
    expect(result.current.voiceState).toBe("thinking");

    // Simulate input transcription completed
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "How's the weather today?",
        }),
      });
    });
    expect(result.current.finalTranscript).toBe("How's the weather today?");

    // Simulate response transcript delta
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: "response.audio_transcript.delta",
          delta: "It is sunny and 72 degrees.",
        }),
      });
    });
    expect(result.current.lastAssistantText).toBe("It is sunny and 72 degrees.");
    expect(result.current.voiceState).toBe("speaking");

    // Simulate response done
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: "response.done",
        }),
      });
    });
    expect(onAssistantResponse).toHaveBeenCalledWith(
      "How's the weather today?",
      "It is sunny and 72 degrees.",
    );
    expect(onSendSpeech).toHaveBeenCalledWith("How's the weather today?");
  });

  it("handles realtime WebSocket error and sets error state", async () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    await act(async () => {
      await result.current.startSession();
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: "error",
          error: { message: "Invalid API key provided (401)" },
        }),
      });
    });

    expect(result.current.voiceState).toBe("error");
    expect(result.current.errorMessage).toContain("Pollinations API key required");
  });
});
