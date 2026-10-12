import React, { useState } from "react";
import { Download, Loader2, Music, Check } from "lucide-react";
import type { MusicProject, PlayMode } from "./types";
import { Modal } from "./controls";
import {
  downloadBlob,
  encodeWav,
  isOfflineRenderSupported,
  renderProject,
} from "./audio/audioExporter";
import { toast } from "sonner";
import type { MusicT } from "./useMusicT";

interface ExportDialogProps {
  t: MusicT;
  open: boolean;
  onClose: () => void;
  project: MusicProject;
  activePatternId: string;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  t,
  open,
  onClose,
  project,
  activePatternId,
}) => {
  const [renderMode, setRenderMode] = useState<PlayMode>("song");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleExportWav = async () => {
    if (!isOfflineRenderSupported()) {
      toast.error(t("offlineAudioNotSupported"));
      return;
    }

    setRendering(true);
    setProgress(15);
    try {
      setProgress(40);
      const audioBuffer = await renderProject(project, renderMode, activePatternId, {
        sampleRate: 44100,
        tail: 2.0,
      });

      setProgress(80);
      const wavBlob = encodeWav(audioBuffer);

      const clean =
        project.name.replace(/[^a-zA-Z0-9_\-]/g, "_").trim() || "untitled";
      const filename = `${clean}_${renderMode}.wav`;

      downloadBlob(wavBlob, filename);
      setProgress(100);
      toast.success(t("exportWavSuccess"));
      onClose();
    } catch (e) {
      console.error("Export WAV error:", e);
      toast.error(t("exportWavFailed"));
    } finally {
      setRendering(false);
      setProgress(0);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("exportAudioTitle")}
      closeLabel={t("close")}
    >
      <div className="flex flex-col gap-4 text-xs">
        <p className="text-slate-400">
          {t("exportAudioDesc")}
        </p>

        {/* Mode selector */}
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            {t("exportTarget")}:
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRenderMode("song")}
              className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition ${
                renderMode === "song"
                  ? "bg-cyan-950/60 border-cyan-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="font-bold">{t("fullSongArrangement")}</span>
              <span className="text-[10px] text-slate-500">
                {t("fullSongArrangementDesc")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setRenderMode("pattern")}
              className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition ${
                renderMode === "pattern"
                  ? "bg-cyan-950/60 border-cyan-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="font-bold">{t("currentPatternOnly")}</span>
              <span className="text-[10px] text-slate-500">
                {t("currentPatternOnlyDesc")}
              </span>
            </button>
          </div>
        </div>

        {/* Audio Specs Info */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-1 font-mono text-[11px] text-slate-400">
          <div className="flex justify-between">
            <span>{t("format")}:</span>
            <span className="text-slate-200 font-bold">WAV (16-bit PCM)</span>
          </div>
          <div className="flex justify-between">
            <span>{t("sampleRate")}:</span>
            <span className="text-slate-200 font-bold">44,100 Hz</span>
          </div>
          <div className="flex justify-between">
            <span>{t("channels")}:</span>
            <span className="text-slate-200 font-bold">2 (Stereo)</span>
          </div>
          <div className="flex justify-between">
            <span>{t("attribution")}:</span>
            <span className="text-green-400 font-bold">{t("zeroAttributionRequired")}</span>
          </div>
        </div>

        {/* Progress bar if rendering */}
        {rendering && (
          <div className="flex flex-col gap-1.5 pt-2">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-cyan-500 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-center text-[10px] text-slate-400 font-mono">
              {t("renderingAudioProgress")}
            </span>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={rendering}
            onClick={handleExportWav}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold text-xs transition disabled:opacity-50"
          >
            {rendering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{rendering ? t("rendering") : t("renderAndDownloadWav")}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
