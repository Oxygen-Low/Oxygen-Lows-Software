import React from 'react';
import ShaderBackground from '@/components/game-syncer/ShaderBackground';
import { Link } from 'react-router-dom';

const GameLibrary: React.FC = () => {
  return (
    <div className="bg-background text-on-surface font-body-md text-body-md h-screen overflow-hidden flex selection:bg-primary/30 selection:text-primary relative dark">
      <style dangerouslySetInnerHTML={{__html: `
        .glass-panel { background: rgba(30, 41, 59, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .inner-glow-primary { box-shadow: inset 0 0 12px rgba(208, 188, 255, 0.2); }
        .pulse-primary { animation: pulse-border 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse-border { 0%, 100% { border-color: rgba(208, 188, 255, 0.2); } 50% { border-color: rgba(208, 188, 255, 1); box-shadow: 0 0 8px rgba(208, 188, 255, 0.5); } }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        
        @keyframes rainbow-border { 0% { border-color: #ff0000; } 17% { border-color: #ff8800; } 33% { border-color: #ffff00; } 50% { border-color: #00ff00; } 67% { border-color: #0000ff; } 83% { border-color: #8800ff; } 100% { border-color: #ff0000; } }
      `}} />

      <ShaderBackground />

      <nav className="bg-surface/80 dark:bg-surface/80 backdrop-blur-xl font-body-md text-body-md flex justify-between items-center w-full px-lg h-16 fixed top-0 z-50 md:hidden border-b border-white/10">
        <div className="flex items-center gap-sm">
          <button className="hover:text-primary transition-colors duration-200 active:scale-95 transition-transform"><span className="material-symbols-outlined">sync</span></button>
          <button className="hover:text-primary transition-colors duration-200 active:scale-95 transition-transform"><span className="material-symbols-outlined">notifications</span></button>
          <img alt="User profile" className="w-8 h-8 rounded-full border border-white/20 object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCgZ1N4byc2kg8Mp2ReQ0BQBEBrdQwn3272ucqsb8QdpPj5jwvrci8O61dWaLx9oixcgb3McMpJkVnyunfdP2GU4AtiMjiTNjnC__BA3wsA8VQV9nCYPs96mkrdDKOJHnnZezGtJwkIsTcoYXbVVO4cMS4i1Z-5fR3roDiD8MdQCFF1FQ2rVVq525oEO60uIqKaPMyPnmViMmtG0SCdX-eJpXin0J2UUf6fc7I7fttraPB4mOmH96WB" />
        </div>
      </nav>

      <main className="flex-1 ml-0 pt-16 md:pt-0 h-full overflow-y-auto bg-transparent relative w-full">
        <div className="absolute top-0 right-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none"></div>
        <div className="p-margin-mobile md:p-margin-desktop max-w-[1600px] mx-auto relative z-10 space-y-xl">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mt-6">
            <div>
              <h2 className="font-display-lg text-display-lg text-on-surface">Game Library</h2>
            </div>
            <div className="flex gap-md">
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
                <input className="bg-black/20 border-b border-white/10 border-t-0 border-l-0 border-r-0 focus:border-secondary focus:ring-0 text-on-surface pl-10 pr-4 py-sm rounded-t font-body-md w-full md:w-64 transition-all outline-none" placeholder="Search games..." type="text" />
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-lg">
            <Link to="/game-syncer/rimworld">
              <article className="glass-panel rounded-lg flex flex-col group overflow-hidden border border-white/10 hover:border-primary/50 transition-colors duration-300 relative" style={{ borderWidth: '2px', animation: '3s linear 0s infinite normal none running rainbow-border', borderStyle: 'solid' }}>
                <div className="h-[140px] w-full relative overflow-hidden bg-surface-container-highest">
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-surface-container-highest"></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#171f33] to-transparent"></div>
                </div>
                <div className="p-md flex flex-col gap-sm relative -mt-lg">
                  <div className="flex justify-between items-start">
                    <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface leading-tight">RimWorld</h3>
                  </div>
                  <div className="bg-primary/10 border border-primary/50 text-primary font-label-sm text-[10px] px-sm py-xs rounded inline-flex items-center gap-xs w-max pulse-primary">
                    <span className="material-symbols-outlined text-[12px] animate-spin">sync</span> Syncing (45%)
                  </div>
                  <div className="text-on-surface-variant font-label-sm mt-xs">
                    Local changes detected 2 mins ago
                  </div>
                  <div className="h-1 w-full bg-black/40 rounded overflow-hidden mt-sm">
                    <div className="h-full bg-primary w-[45%] shadow-[0_0_8px_rgba(208,188,255,0.8)]"></div>
                  </div>
                </div>
              </article>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GameLibrary;
