import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Channel, MusicProject, PlayMode, StudioView } from "./types";
import { TopTransportBar } from "./TopTransportBar";
import { ChannelRack } from "./ChannelRack";
import { PianoRoll } from "./PianoRoll";
import { PlaylistArranger } from "./PlaylistArranger";
import { MixerConsole } from "./MixerConsole";
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
  }, [handleTogglePlay, handleUndo, handleRedo, project.channels, activePianoChannelId]);

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
        onViewChange={setView}
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

      {/* Main Workspace Area (View Switcher) */}
      <div className="flex-1 p-2 sm:p-3 overflow-hidden">
        {view === "rack" && activePattern && (
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
              setView("piano");
            }}
            onAddChannel={(presetId) => {
              const { project: next, id } = addChannel(project, presetId);
              updateProjectWithHistory(next);
              setActivePianoChannelId(id);
            }}
          />
        )}

        {view === "piano" && activePattern && (
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
        )}

        {view === "playlist" && (
          <PlaylistArranger
            t={t}
            project={project}
            activePatternId={activePattern?.id || ""}
            playStep={playStep}
            onUpdateProject={updateProjectWithHistory}
            onSelectPattern={setActivePatternId}
          />
        )}

        {view === "mixer" && (
          <MixerConsole
            t={t}
            project={project}
            onUpdateProject={updateProjectWithHistory}
          />
        )}
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
