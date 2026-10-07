/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveVoice } from "./useLiveVoice";

describe("useLiveVoice hook", () => {
  let activeRecognitionInstance: any = null;
  let mockUtteranceInstance: any = null;

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
    activeRecognitionInstance = null;
    mockUtteranceInstance = null;

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
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

  it("identifies browser support correctly", () => {
    const onSendSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveVoice({
        languageCode: "en",
        onSendSpeech,
      }),
    );

    expect(result.current.isSupported).toBe(true);
    expect(result.current.voiceState).toBe("idle");
  });

  it("starts session and transitions to listening state", async () => {
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

    expect(result.current.voiceState).toBe("listening");
    expect(activeRecognitionInstance.start).toHaveBeenCalled();
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

  it("speaks text and returns to listening when finished", async () => {
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
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    expect(mockUtteranceInstance.text).toBe("Hello from Oxygen Low's Software!");

    act(() => {
      if (mockUtteranceInstance.onend) {
        mockUtteranceInstance.onend();
      }
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

    expect(onSendSpeech).toHaveBeenCalledWith("Tell me a joke");
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

    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
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

  it("chunks multi-sentence responses and speaks each chunk", async () => {
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
      result.current.speakText("First sentence. Second sentence! Third sentence?");
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.voiceState).toBe("speaking");
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it("ignores microphone input while AI is speaking to prevent self-interruption and echo loop", async () => {
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
      result.current.speakText("The assistant is speaking now.");
    });
    expect(result.current.voiceState).toBe("speaking");

    // Microphone picks up speaker audio while speaking
    act(() => {
      activeRecognitionInstance.onresult({
        resultIndex: 0,
        results: [[{ transcript: "The assistant is speaking now." }]],
      });
    });

    // It should stay speaking and not get interrupted or send echo
    expect(result.current.voiceState).toBe("speaking");
    expect(onSendSpeech).not.toHaveBeenCalled();
  });
});
