// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { MusicStudioApp } from "./MusicStudio";
import * as authHook from "@/hooks/useAuth";
import { BrowserRouter } from "react-router-dom";
import { PRESETS } from "./MusicStudio/audio/presetLibrary";
import { createDemoProject, createEmptyProject, normalizeProject } from "./MusicStudio/audio/demoProjects";
import {
  addChannel,
  addPattern,
  cloneChannel,
  clonePattern,
  fillSteps,
  removeChannel,
  removePattern,
  setNotes,
  toggleStep,
  updateChannel,
} from "./MusicStudio/projectOps";
import { encodeWav } from "./MusicStudio/audio/audioExporter";

// Mock useAuth
vi.mock("@/hooks/useAuth");

// Mock storage
vi.mock("@/lib/storage", () => ({
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test-path" }, error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      download: vi.fn().mockResolvedValue({
        data: { text: vi.fn().mockResolvedValue(JSON.stringify({ version: 1, name: "Test", bpm: 120, channels: [], patterns: [{ id: "p1" }] })) },
        error: null,
      }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

// Mock Web Audio API for jsdom
class MockAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class MockAudioNode {
  connect = vi.fn().mockReturnValue({ connect: vi.fn() });
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
}

class MockStereoPannerNode extends MockAudioNode {
  pan = new MockAudioParam();
}

class MockBiquadFilterNode extends MockAudioNode {
  frequency = new MockAudioParam();
  Q = new MockAudioParam();
  gain = new MockAudioParam();
  type = "lowpass";
}

class MockOscillatorNode extends MockAudioNode {
  frequency = new MockAudioParam();
  detune = new MockAudioParam();
  type = "sine";
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
}

class MockDelayNode extends MockAudioNode {
  delayTime = new MockAudioParam();
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam();
  ratio = new MockAudioParam();
  knee = new MockAudioParam();
  attack = new MockAudioParam();
  release = new MockAudioParam();
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 2048;
  frequencyBinCount = 1024;
  getByteFrequencyData = vi.fn();
  getFloatTimeDomainData = vi.fn();
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: any = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();
}

class MockBaseAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = "running";
  destination = new MockAudioNode();
  createGain = vi.fn(() => new MockGainNode());
  createStereoPanner = vi.fn(() => new MockStereoPannerNode());
  createBiquadFilter = vi.fn(() => new MockBiquadFilterNode());
  createOscillator = vi.fn(() => new MockOscillatorNode());
  createDelay = vi.fn(() => new MockDelayNode());
  createWaveShaper = vi.fn(() => ({
    ...new MockAudioNode(),
    curve: null,
    oversample: "none",
  }));
  createConvolver = vi.fn(() => ({
    ...new MockAudioNode(),
    buffer: null,
  }));
  createDynamicsCompressor = vi.fn(() => new MockDynamicsCompressorNode());
  createAnalyser = vi.fn(() => new MockAnalyserNode());
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
  createBuffer = vi.fn((channels: number, length: number, rate: number) => ({
    numberOfChannels: channels,
    length,
    sampleRate: rate,
    getChannelData: vi.fn(() => new Float32Array(length)),
  }));
  resume = vi.fn().mockResolvedValue(undefined);
  suspend = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

class MockAudioContext extends MockBaseAudioContext {}
class MockOfflineAudioContext extends MockBaseAudioContext {
  startRendering = vi.fn().mockResolvedValue({
    numberOfChannels: 2,
    length: 44100,
    sampleRate: 44100,
    getChannelData: () => new Float32Array(44100),
  });
}

(global as any).AudioContext = MockAudioContext;
(global as any).OfflineAudioContext = MockOfflineAudioContext;

// Mock Canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  fillStyle: "#000",
} as any);

describe("Music Studio Unit & Integration Tests", () => {
  beforeEach(() => {
    vi.mocked(authHook.useAuth).mockReturnValue({
      session: { user: { id: "test-user-123" } } as any,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  describe("Preset Library & Synthesis Sound Architecture", () => {
    it("provides 25+ curated instrument presets with zero attribution required", () => {
      expect(PRESETS.length).toBeGreaterThanOrEqual(25);
      const categories = new Set(PRESETS.map((p) => p.category));
      expect(categories.has("drums")).toBe(true);
      expect(categories.has("bass")).toBe(true);
      expect(categories.has("leads")).toBe(true);
      expect(categories.has("keys")).toBe(true);
      expect(categories.has("pads")).toBe(true);
      expect(categories.has("fx")).toBe(true);
    });

    it("ensures each preset has valid parameters without external audio sample files", () => {
      for (const preset of PRESETS) {
        expect(preset.id).toBeTruthy();
        expect(preset.params.attack).toBeGreaterThanOrEqual(0);
        expect(preset.params.decay).toBeGreaterThanOrEqual(0);
        expect(preset.params.gain).toBeGreaterThan(0);
        expect(["sine", "square", "sawtooth", "triangle", "noise"]).toContain(
          preset.params.waveform
        );
      }
    });
  });

  describe("Project Operations & State Mutation", () => {
    it("creates an empty project and adds/clones/removes channels", () => {
      let p = createEmptyProject("Test Beat");
      expect(p.channels.length).toBe(6);

      const { project: p2, id: newId } = addChannel(p, "kickPunch");
      expect(p2.channels.length).toBe(7);
      expect(p2.channels.some((c) => c.id === newId)).toBe(true);

      const p3 = cloneChannel(p2, newId);
      expect(p3.channels.length).toBe(8);

      const p4 = removeChannel(p3, newId);
      expect(p4.channels.length).toBe(7);
    });

    it("modifies step sequencer triggers and notes", () => {
      let p = createEmptyProject("Step Test");
      const chId = p.channels[0].id;
      const patId = p.patterns[0].id;

      p = toggleStep(p, patId, chId, 0);
      expect(p.patterns[0].steps[chId][0].on).toBe(true);

      p = fillSteps(p, patId, chId, 4);
      expect(p.patterns[0].steps[chId][0].on).toBe(true);
      expect(p.patterns[0].steps[chId][4].on).toBe(true);

      p = setNotes(p, patId, chId, [
        { id: "n1", pitch: 60, start: 0, length: 4, velocity: 0.8 },
      ]);
      expect(p.patterns[0].notes[chId].length).toBe(1);
    });

    it("manages patterns (add, clone, remove)", () => {
      let p = createEmptyProject("Pattern Test");
      expect(p.patterns.length).toBe(1);

      const { project: p2, id: pat2Id } = addPattern(p);
      expect(p2.patterns.length).toBe(2);

      const { project: p3 } = clonePattern(p2, pat2Id);
      expect(p3.patterns.length).toBe(3);

      const p4 = removePattern(p3, pat2Id);
      expect(p4.patterns.length).toBe(2);
    });

    it("normalizes and sanitizes loaded project data", () => {
      const valid = normalizeProject({
        name: "Imported Song",
        bpm: 140,
        channels: [{ id: "c1", presetId: "kick808" }],
        patterns: [{ id: "p1", length: 16 }],
      });
      expect(valid).not.toBeNull();
      expect(valid?.bpm).toBe(140);
      expect(valid?.channels.length).toBe(1);

      const invalid = normalizeProject("not a project");
      expect(invalid).toBeNull();
    });
  });

  describe("WAV Audio Encoding", () => {
    it("encodes an audio buffer into valid RIFF WAV bytes", () => {
      const sampleRate = 44100;
      const channels = 2;
      const length = 1000;
      const mockBuffer: any = {
        sampleRate,
        numberOfChannels: channels,
        length,
        getChannelData: () => new Float32Array(length),
      };

      const blob = encodeWav(mockBuffer);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("audio/wav");
      expect(blob.size).toBe(44 + length * channels * 2);
    });
  });

  describe("Music Studio UI Component", () => {
    it("renders Music Studio with transport bar and views", () => {
      render(
        <BrowserRouter>
          <MusicStudioApp />
        </BrowserRouter>
      );

      // Verify header and transport elements exist
      expect(screen.getByRole("tab", { name: /channel rack/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /piano roll/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /playlist/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /mixer/i })).toBeDefined();

      // Play & Stop buttons
      expect(screen.getByRole("button", { name: /^play$/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /^stop$/i })).toBeDefined();

      // Projects & Export buttons
      expect(screen.getByRole("button", { name: /projects/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /export wav/i })).toBeDefined();
    });

    it("switches views between Channel Rack, Piano Roll, Playlist, and Mixer", () => {
      render(
        <BrowserRouter>
          <MusicStudioApp />
        </BrowserRouter>
      );

      // Switch to Piano Roll
      const pianoTab = screen.getByRole("tab", { name: /piano roll/i });
      fireEvent.click(pianoTab);
      expect(screen.getByText(/chord stamp/i)).toBeDefined();

      // Switch to Playlist Arranger
      const playlistTab = screen.getByRole("tab", { name: /playlist/i });
      fireEvent.click(playlistTab);
      expect(screen.getByText(/playlist arranger/i)).toBeDefined();

      // Switch to Mixer
      const mixerTab = screen.getByRole("tab", { name: /mixer/i });
      fireEvent.click(mixerTab);
      expect(screen.getByText(/mixer console/i)).toBeDefined();

      // Switch back to Channel Rack
      const rackTab = screen.getByRole("tab", { name: /channel rack/i });
      fireEvent.click(rackTab);
      expect(screen.getByText(/add instrument/i)).toBeDefined();
    });

    it("toggles transport play state", () => {
      render(
        <BrowserRouter>
          <MusicStudioApp />
        </BrowserRouter>
      );

      const playBtn = screen.getByRole("button", { name: /^play$/i });
      fireEvent.click(playBtn);
      // After play is clicked, pause is displayed
      expect(screen.getByRole("button", { name: /^pause$/i })).toBeDefined();
    });

    it("opens and closes Projects and Export dialogs", () => {
      render(
        <BrowserRouter>
          <MusicStudioApp />
        </BrowserRouter>
      );

      // Open projects
      const projectsBtn = screen.getByRole("button", { name: /projects/i });
      fireEvent.click(projectsBtn);
      expect(screen.getByText(/starter templates/i)).toBeDefined();

      // Close modal
      const closeBtns = screen.getAllByRole("button", { name: /close/i });
      fireEvent.click(closeBtns[0]);

      // Open export
      const exportBtn = screen.getByRole("button", { name: /export wav/i });
      fireEvent.click(exportBtn);
      expect(screen.getByText(/render target/i)).toBeDefined();
    });
  });
});
