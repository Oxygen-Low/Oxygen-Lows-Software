import React from 'react';
import ShaderBackground from '@/components/game-syncer/ShaderBackground';
import { Link } from 'react-router-dom';

const GameDetail: React.FC = () => {
  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen custom-scrollbar relative dark">
      <style dangerouslySetInnerHTML={{__html: `
        .glass-panel {
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .glow-effect:hover {
            box-shadow: inset 0 0 15px rgba(208, 188, 255, 0.2);
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        .progress-pulse {
            animation: pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-glow {
            0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(68, 226, 205, 0.5); }
            50% { opacity: .5; box-shadow: 0 0 5px rgba(68, 226, 205, 0.2); }
        }
      `}} />
      
      <ShaderBackground />

      <main className="md:pt-16 md:pl-0 min-h-screen flex flex-col md:flex-row relative w-full">
        <div className="flex-1 max-w-[1440px] mx-auto w-full flex flex-col p-margin-mobile md:p-margin-desktop gap-xl md:mt-0">
          <div className="mb-lg mt-6">
            <Link to="/game-syncer" className="inline-flex items-center gap-xs text-on-surface-variant hover:text-on-surface transition-colors mb-md group">
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              <span className="font-label-sm uppercase tracking-widest">Back to Library</span>
            </Link>
            <div>
              <div className="inline-flex items-center gap-2 bg-surface-container/80 backdrop-blur px-sm py-xs rounded border border-white/10 mb-sm">
                <span className="w-2 h-2 rounded-full bg-secondary progress-pulse"></span>
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest">In Sync</span>
              </div>
              <h1 className="font-display-lg text-headline-lg-mobile md:text-display-lg text-on-surface mb-xs">RimWorld</h1>
              <p className="font-body-md text-on-surface-variant max-w-2xl">Sci-Fi Colony Sim • Last synced 2 hours ago</p>
            </div>
          </div>
          
          <section className="flex flex-col gap-lg">
            <div className="flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">sync_saved_locally</span>
              <h2 className="text-headline-lg-mobile font-display-lg text-on-surface">Sync Settings</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div className="bg-surface-container p-md rounded-xl border border-white/10 flex flex-col gap-sm">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-xs">
                    <span className="font-label-sm text-on-surface">Sync Mods</span>
                    <p className="text-label-sm text-on-surface-variant">Sync installed mods.</p>
                  </div>
                  <button className="w-10 h-6 bg-surface-container-highest rounded-full relative transition-colors"><span className="absolute left-1 top-1 w-4 h-4 bg-outline rounded-full"></span></button>
                </div>
                <div className="p-sm bg-error-container/20 border border-error/20 rounded text-label-sm text-error flex gap-xs items-start">
                  <span className="material-symbols-outlined text-[16px]">warning</span>
                  <span>Warning: Steam Workshop usually handles this; some mods can consume significant storage space.</span>
                </div>
              </div>
              <div className="bg-surface-container p-md rounded-xl border border-white/10 flex justify-between items-center">
                <div className="flex flex-col gap-xs">
                  <span className="font-label-sm text-on-surface">Local Mods</span>
                  <p className="text-label-sm text-on-surface-variant">Sync local non-workshop mods.</p>
                </div>
                <button className="w-10 h-6 bg-surface-container-highest rounded-full relative transition-colors"><span className="absolute left-1 top-1 w-4 h-4 bg-outline rounded-full"></span></button>
              </div>
              <div className="bg-surface-container p-md rounded-xl border border-white/10 flex justify-between items-center">
                <div className="flex flex-col gap-xs">
                  <span className="font-label-sm text-on-surface">Sync Config</span>
                  <p className="text-label-sm text-on-surface-variant">Sync game config, active mods, and mod config.</p>
                </div>
                <button className="w-10 h-6 bg-primary rounded-full relative transition-colors"><span className="absolute right-1 top-1 w-4 h-4 bg-on-primary rounded-full"></span></button>
              </div>
              <div className="bg-surface-container p-md rounded-xl border border-white/10 flex justify-between items-center">
                <div className="flex flex-col gap-xs">
                  <span className="font-label-sm text-on-surface">Saves</span>
                  <p className="text-label-sm text-on-surface-variant">Sync save files.</p>
                </div>
                <button className="w-10 h-6 bg-primary rounded-full relative transition-colors"><span className="absolute right-1 top-1 w-4 h-4 bg-on-primary rounded-full"></span></button>
              </div>
              <div className="bg-surface-container p-md rounded-xl border border-white/10 flex justify-between items-center">
                <div className="flex flex-col gap-xs">
                  <div className="flex items-center gap-xs">
                    <span className="font-label-sm text-on-surface">Xenotypes</span>
                    <span className="px-xs py-[2px] bg-tertiary-container text-on-tertiary-container text-[10px] rounded uppercase font-bold">Biotech DLC Required</span>
                  </div>
                  <p className="text-label-sm text-on-surface-variant">Sync custom Xenotypes.</p>
                </div>
                <button className="w-10 h-6 bg-primary rounded-full relative transition-colors"><span className="absolute right-1 top-1 w-4 h-4 bg-on-primary rounded-full"></span></button>
              </div>
              <div className="bg-surface-container p-md rounded-xl border border-white/10 flex justify-between items-center">
                <div className="flex flex-col gap-xs">
                  <div className="flex items-center gap-xs">
                    <span className="font-label-sm text-on-surface">Ideologies</span>
                    <span className="px-xs py-[2px] bg-tertiary-container text-on-tertiary-container text-[10px] rounded uppercase font-bold">Ideology DLC Required</span>
                  </div>
                  <p className="text-label-sm text-on-surface-variant">Sync custom Ideologies.</p>
                </div>
                <button className="w-10 h-6 bg-primary rounded-full relative transition-colors"><span className="absolute right-1 top-1 w-4 h-4 bg-on-primary rounded-full"></span></button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default GameDetail;
