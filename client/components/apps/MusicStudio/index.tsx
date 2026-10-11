import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Channel, MusicProject, PlayMode, StudioView } from "./types";
import { TopTransportBar } from "./TopTransportBar";
import { ChannelRack } from "./ChannelRack";
import { PianoRoll } from "./PianoRoll";
import { PlaylistArranger } from "./PlaylistArranger";
import { MixerConsole } from "./MixerConsole";
import { WindowFrame } from "./WindowFrame";
import { InstrumentEditorModal } from "./InstrumentEditorModal";
import { ProjectsDialog } from "./ProjectsDialog";
import { ExportDialog } from "./ExportDialog";
import { StudioEngine } from "./audio/audioScheduler";
import { createDemoProject } from "./audio/demoProjects";
import {
  addChannel,
  addPattern,
  clonePattern,
  removePattern,
  renamePattern,
  setPatternLength,
  updateChannel,
} from "./projectOps";
import { useMusicT } from "./useMusicT";
import { KEYBOARD_MAP } from "./constants";

export const MusicStudioApp: React.FC = () => {
  const t = useMusicT();

  // Project state with history for undo/redo
  const [project, setProject] = useState<MusicProject>(() =>
    createDemoProject("cyberpunk", t("demos.cyberpunk"))
  );
  const [history, setHistory] = useState<MusicProject[]>([]);
  const [future, setFuture] = useState<MusicProject[]>([]);

  // Studio interface mode states
  const [mode, setMode] = useState<PlayMode>("pattern");
  const [view, setView] = useState<StudioView>("rack");
  // Multi-window DAW desktop state
  const [windows, setWindows] = useState<Record<WindowId, WindowState>>({
    rack: {
      id: "rack",
      title: t("channelRack"),
      isOpen: true,
      isMinimized: false,
      x: 16,
      y: 16,
      width: 700,
      height: 400,
      zIndex: 10,
    },
    piano: {
      id: "piano",
      title: t("pianoRoll"),
      isOpen: false,
      isMinimized: false,
      x: 140,
      y: 80,
      width: 780,
      height: 440,
      zIndex: 11,
    },
    playlist: {
      id: "playlist",
      title: t("playlist"),
      isOpen: false,
      isMinimized: false,
      x: 60,
      y: 60,
      width: 820,
      height: 420,
      zIndex: 9,
    },
    mixer: {
      id: "mixer",
      title: t("mixer"),
      isOpen: false,
      isMinimized: false,
      x: 100,
      y: 120,
      width: 860,
      height: 450,
      zIndex: 8,
    },
    browser: {
      id: "browser",
      title: "Browser",
      isOpen: false,
      isMinimized: false,
      x: 20,
      y: 20,
      width: 320,
      height: 400,
      zIndex: 7,
    },
  });

  const [topZ, setTopZ] = useState<number>(20);

  const focusWindow = useCallback((id: WindowId) => {
    setTopZ((prev) => {
      const next = prev + 1;
      setWindows((w) => ({
        ...w,
        [id]: { ...w[id], isOpen: true, isMinimized: false, zIndex: next },
      }));
      return next;
    });
    setView(id);
  }, []);

  const toggleWindow = useCallback((id: WindowId) => {
    setWindows((w) => {
      const current = w[id];
      const willOpen = !current.isOpen || current.isMinimized;
      return {
        ...w,
        [id]: {
          ...current,
          isOpen: willOpen,
          isMinimized: false,
          zIndex: willOpen ? topZ + 1 : current.zIndex,
        },
      };
    });
    setTopZ((prev) => prev + 1);
    setView(id);
  }, [topZ]);

  const updateWindowState = useCallback((id: WindowId, partial: Partial<WindowState>) => {
    setWindows((w) => ({
      ...w,
      [id]: { ...w[id], ...partial },
    }));
  }, []);
  const [activePatternId, setActivePatternId] = useState<string>(() => project.patterns[0]?.id || "");
  const [activePianoChannelId, setActivePianoChannelId] = useState<string>(() => project.channels[0]?.id || "");
  const [metronome, setMetronome] = useState<boolean>(false);
  const [recording, setRecording] = useState<boolean>(false);
  const [playing, setPlaying] = useState<boolean>(false);
  const [playStep, setPlayStep] = useState<number>(-1);

  // Modals state
  const [synthModalChannel, setSynthModalChannel] = useState<Channel | null>(null);
  const [projectsDialogOpen, setProjectsDialogOpen] = useState<boolean>(false);
  const [exportDialogOpen, setExportDialogOpen] = useState<boolean>(false);

  // Audio Engine reference
  const engineRef = useRef<StudioEngine | null>(null);

  // Keep a ref of latest state for engine lookahead getter
  const stateRef = useRef({ project, mode, activePatternId, metronome });
  useEffect(() => {
    stateRef.current = { project, mode, activePatternId, metronome };
    if (engineRef.current) {
      engineRef.current.update(project);
    }
  }, [project, mode, activePatternId, metronome]);

  // Init Engine
  useEffect(() => {
    const engine = StudioEngine.create(() => ({
      project: stateRef.current.project,
      mode: stateRef.current.mode,
      patternId: stateRef.current.activePatternId,
      metronome: stateRef.current.metronome,
    }));
    engineRef.current = engine;
    if (engine) {
      engine.update(project);
    }

    return () => {
      engine?.dispose();
    };
  }, []);

  // Playhead position sync timer
  useEffect(() => {
    let anim = 0;
    const sync = () => {
      if (engineRef.current && playing) {
        setPlayStep(engineRef.current.currentStep());
      }
      anim = requestAnimationFrame(sync);
    };
    anim = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(anim);
  }, [playing]);

  // Project state updater with undo tracking
  const updateProjectWithHistory = useCallback((nextProject: MusicProject) => {
    setHistory((prev) => [...prev.slice(-25), project]);
    setFuture([]);
    setProject(nextProject);
  }, [project]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setFuture((prev) => [project, ...prev]);
    setProject(previous);
  }, [history, project]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setHistory((prev) => [...prev, project]);
    setProject(next);
  }, [future, project]);

  // Play / Stop Controls
  const handleTogglePlay = useCallback(() => {
    if (!engineRef.current) return;
    if (playing) {
      engineRef.current.stop();
      setPlaying(false);
      setPlayStep(-1);
    } else {
      engineRef.current.start(0);
      setPlaying(true);
    }
  }, [playing]);

  const handleStop = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.stop();
    setPlaying(false);
    setPlayStep(-1);
  }, []);

  // Keyboard shortcut listener (Space = play/pause, Ctrl+Z = undo, Ctrl+Y = redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === "F5") {
        e.preventDefault();
        toggleWindow("playlist");
      } else if (e.code === "F6") {
        e.preventDefault();
        toggleWindow("rack");
      } else if (e.code === "F7") {
        e.preventDefault();
        toggleWindow("piano");
      } else if (e.code === "F9") {
        e.preventDefault();
        toggleWindow("mixer");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (KEYBOARD_MAP[e.key.toLowerCase()] !== undefined && engineRef.current) {
        // Live computer keyboard playback on active channel
        const offset = KEYBOARD_MAP[e.key.toLowerCase()];
        const channel = project.channels.find((c) => c.id === activePianoChannelId) || project.channels[0];
        if (channel) {
          engineRef.current.preview(channel, 60 + offset);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTogglePlay, handleUndo, handleRedo, toggleWindow, project.channels, activePianoChannelId]);

  // Active Pattern safety
  const activePattern =
    project.patterns.find((p) => p.id === activePatternId) || project.patterns[0];

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Top Transport & Status Bar */}
      <TopTransportBar
        t={t}
        project={project}
        playing={playing}
        playStep={playStep}
        mode={mode}
        view={view}
        metronome={metronome}
        recording={recording}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        activePatternId={activePattern?.id || ""}
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onModeChange={setMode}
        onViewChange={(v) => {
          setView(v);
          focusWindow(v);
        }}
        onBpmChange={(bpm) => updateProjectWithHistory({ ...project, bpm })}
        onSwingChange={(swing) => updateProjectWithHistory({ ...project, swing })}
        onMasterChange={(masterVolume) => updateProjectWithHistory({ ...project, masterVolume })}
        onMetronomeChange={setMetronome}
        onRecordingChange={setRecording}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenProjects={() => setProjectsDialogOpen(true)}
        onOpenExport={() => setExportDialogOpen(true)}
        onRename={(name) => updateProjectWithHistory({ ...project, name })}
        onPatternSelect={setActivePatternId}
        onPatternAdd={() => {
          const { project: next, id } = addPattern(project);
          updateProjectWithHistory(next);
          setActivePatternId(id);
        }}
        onPatternClone={() => {
          if (activePattern) {
            const { project: next, id } = clonePattern(project, activePattern.id);
            updateProjectWithHistory(next);
            setActivePatternId(id);
          }
        }}
        onPatternDelete={() => {
          if (activePattern && project.patterns.length > 1) {
            const next = removePattern(project, activePattern.id);
            updateProjectWithHistory(next);
            setActivePatternId(next.patterns[0].id);
          }
        }}
        onPatternRename={(name) => {
          if (activePattern) {
            updateProjectWithHistory(renamePattern(project, activePattern.id, name));
          }
        }}
        onPatternLength={(length) => {
          if (activePattern) {
            updateProjectWithHistory(setPatternLength(project, activePattern.id, length));
          }
        }}
        getAnalyser={() => engineRef.current?.graph.masterAnalyser || null}
      />

      {/* Main Multi-Window DAW Desktop Canvas */}
      <div className="relative flex-1 overflow-hidden bg-slate-950 p-2 sm:p-3">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

        {/* Channel Rack Window */}
        {activePattern && (
          <WindowFrame
            id="rack"
            title={`${t("channelRack")} (F6)`}
            isOpen={windows.rack.isOpen}
            isMinimized={windows.rack.isMinimized}
            x={windows.rack.x}
            y={windows.rack.y}
            width={windows.rack.width}
            height={windows.rack.height}
            zIndex={windows.rack.zIndex}
            onFocus={() => focusWindow("rack")}
            onClose={() => updateWindowState("rack", { isOpen: false })}
            onMinimize={() => updateWindowState("rack", { isMinimized: !windows.rack.isMinimized })}
            onMove={(x, y) => updateWindowState("rack", { x, y })}
            onResize={(width, height) => updateWindowState("rack", { width, height })}
          >
            <ChannelRack
              t={t}
              project={project}
              activePattern={activePattern}
              playStep={playStep}
              onUpdateProject={updateProjectWithHistory}
              onPreviewChannel={(ch) => engineRef.current?.preview(ch, ch.stepNote)}
              onOpenSynth={(ch) => setSynthModalChannel(ch)}
              onOpenPianoRoll={(chId) => {
                setActivePianoChannelId(chId);
                focusWindow("piano");
              }}
              onAddChannel={(presetId) => {
                const { project: next, id } = addChannel(project, presetId);
                updateProjectWithHistory(next);
                setActivePianoChannelId(id);
              }}
            />
          </WindowFrame>
        )}

        {/* Piano Roll Window */}
        {activePattern && (
          <WindowFrame
            id="piano"
            title={`${t("pianoRoll")} (F7)`}
            isOpen={windows.piano.isOpen}
            isMinimized={windows.piano.isMinimized}
            x={windows.piano.x}
            y={windows.piano.y}
            width={windows.piano.width}
            height={windows.piano.height}
            zIndex={windows.piano.zIndex}
            onFocus={() => focusWindow("piano")}
            onClose={() => updateWindowState("piano", { isOpen: false })}
            onMinimize={() => updateWindowState("piano", { isMinimized: !windows.piano.isMinimized })}
            onMove={(x, y) => updateWindowState("piano", { x, y })}
            onResize={(width, height) => updateWindowState("piano", { width, height })}
          >
            <PianoRoll
              t={t}
              project={project}
              activePattern={activePattern}
              activeChannelId={activePianoChannelId}
              playStep={playStep}
              onSelectChannel={setActivePianoChannelId}
              onUpdateProject={updateProjectWithHistory}
              onPreviewNote={(ch, midi) => engineRef.current?.preview(ch, midi)}
            />
          </WindowFrame>
        )}

        {/* Playlist Arranger Window */}
        <WindowFrame
          id="playlist"
          title={`${t("playlist")} (F5)`}
          isOpen={windows.playlist.isOpen}
          isMinimized={windows.playlist.isMinimized}
          x={windows.playlist.x}
          y={windows.playlist.y}
          width={windows.playlist.width}
          height={windows.playlist.height}
          zIndex={windows.playlist.zIndex}
          onFocus={() => focusWindow("playlist")}
          onClose={() => updateWindowState("playlist", { isOpen: false })}
          onMinimize={() => updateWindowState("playlist", { isMinimized: !windows.playlist.isMinimized })}
          onMove={(x, y) => updateWindowState("playlist", { x, y })}
          onResize={(width, height) => updateWindowState("playlist", { width, height })}
        >
          <PlaylistArranger
            t={t}
            project={project}
            activePatternId={activePattern?.id || ""}
            playStep={playStep}
            onUpdateProject={updateProjectWithHistory}
            onSelectPattern={setActivePatternId}
          />
        </WindowFrame>

        {/* Mixer Console Window */}
        <WindowFrame
          id="mixer"
          title={`${t("mixer")} (F9)`}
          isOpen={windows.mixer.isOpen}
          isMinimized={windows.mixer.isMinimized}
          x={windows.mixer.x}
          y={windows.mixer.y}
          width={windows.mixer.width}
          height={windows.mixer.height}
          zIndex={windows.mixer.zIndex}
          onFocus={() => focusWindow("mixer")}
          onClose={() => updateWindowState("mixer", { isOpen: false })}
          onMinimize={() => updateWindowState("mixer", { isMinimized: !windows.mixer.isMinimized })}
          onMove={(x, y) => updateWindowState("mixer", { x, y })}
          onResize={(width, height) => updateWindowState("mixer", { width, height })}
        >
          <MixerConsole
            t={t}
            project={project}
            onUpdateProject={updateProjectWithHistory}
          />
        </WindowFrame>
      </div>

      {/* Synth Sound Designer Modal */}
      {synthModalChannel && (
        <InstrumentEditorModal
          t={t}
          channel={synthModalChannel}
          onClose={() => setSynthModalChannel(null)}
          onChangeParams={(params) => {
            const next = updateChannel(project, synthModalChannel.id, { params });
            updateProjectWithHistory(next);
            setSynthModalChannel({ ...synthModalChannel, params });
          }}
          onPreview={(midi) => engineRef.current?.preview(synthModalChannel, midi)}
        />
      )}

      {/* Projects Save / Load / Cloud Dialog */}
      <ProjectsDialog
        t={t}
        open={projectsDialogOpen}
        onClose={() => setProjectsDialogOpen(false)}
        project={project}
        onLoadProject={(loaded) => {
          setProject(loaded);
          setActivePatternId(loaded.patterns[0]?.id || "");
          setActivePianoChannelId(loaded.channels[0]?.id || "");
          setHistory([]);
          setFuture([]);
        }}
      />

      {/* Audio WAV Export Dialog */}
      <ExportDialog
        t={t}
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        project={project}
        activePatternId={activePattern?.id || ""}
      />
    </div>
  );
};
