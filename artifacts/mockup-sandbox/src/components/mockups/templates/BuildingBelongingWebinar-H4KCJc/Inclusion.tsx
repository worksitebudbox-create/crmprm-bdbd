import './fonts.css';
import React from 'react';

export default function Inclusion() {
  return (
    <div className="relative w-full h-full bg-[#FAF9F6] overflow-hidden flex flex-col font-['Outfit']">
      {/* Background Aurora */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[10%] w-[600px] h-[600px] bg-[#E2C2FF] rounded-full mix-blend-multiply filter blur-[120px] opacity-60 animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute top-[20%] right-[-5%] w-[500px] h-[500px] bg-[#FFD1B3] rounded-full mix-blend-multiply filter blur-[140px] opacity-70 animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-20%] left-[10%] w-[700px] h-[700px] bg-[#B5EAD7] rounded-full mix-blend-multiply filter blur-[150px] opacity-60 animate-pulse" style={{ animationDuration: '12s' }}></div>
        
        {/* Grain overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-16 py-10">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 bg-zinc-900 rounded-sm rotate-45 flex items-center justify-center">
             <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
          </div>
          <span className="font-semibold tracking-tight text-xl text-zinc-900">InclusionWorks</span>
        </div>
        <div className="flex items-center gap-12 font-medium text-sm text-zinc-600">
          <a href="#" className="hover:text-zinc-900 transition-colors">Programs</a>
          <a href="#" className="hover:text-zinc-900 transition-colors">Speakers</a>
          <a href="#" className="hover:text-zinc-900 transition-colors">Resources</a>
          <a href="#" className="hover:text-zinc-900 transition-colors">About</a>
        </div>
        <button className="px-6 py-3 bg-white/60 backdrop-blur-md border border-white/40 shadow-sm rounded-full text-sm font-semibold text-zinc-900 hover:bg-white/80 transition-all">
          Sign In
        </button>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-16 text-center mt-[-40px]">
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/40 backdrop-blur-sm border border-white/50 mb-10 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"></span>
          <span className="font-['Space_Mono'] text-[11px] font-bold uppercase tracking-widest text-zinc-600">Live Webinar · Oct 24</span>
        </div>
        
        <h1 className="text-[96px] leading-[1.05] tracking-tight font-medium text-zinc-900 max-w-[1000px] mb-8">
          Building belonging <br/> in remote teams.
        </h1>
        
        <p className="text-2xl text-zinc-600 max-w-[600px] mb-12 font-light leading-relaxed">
          Join our masterclass on fostering psychological safety and authentic connection across distributed workplaces.
        </p>

        <div className="flex items-center gap-6">
          <button className="px-8 py-4 bg-zinc-900 text-white rounded-full font-medium text-lg hover:bg-zinc-800 transition-colors shadow-xl shadow-zinc-900/20">
            Reserve your seat
          </button>
          <button className="px-8 py-4 bg-white/50 backdrop-blur-md border border-white/50 text-zinc-900 rounded-full font-medium text-lg hover:bg-white/70 transition-colors">
            View details
          </button>
        </div>
      </main>

      {/* Host/Speaker Line */}
      <footer className="relative z-10 flex items-center justify-between px-16 pb-12 mt-auto">
        <div className="flex items-center gap-4 bg-white/50 backdrop-blur-md border border-white/50 py-3 px-5 rounded-2xl shadow-sm">
          <div className="flex -space-x-3">
            <div className="w-12 h-12 rounded-full border-2 border-[#FAF9F6] bg-zinc-200 overflow-hidden shadow-sm">
               <svg className="w-full h-full text-zinc-400 bg-zinc-100" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <div className="w-12 h-12 rounded-full border-2 border-[#FAF9F6] bg-zinc-300 overflow-hidden shadow-sm">
               <svg className="w-full h-full text-zinc-500 bg-zinc-200" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-zinc-900">Hosted by Dr. Sarah Chen</span>
            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">Head of People, Acme Corp</span>
          </div>
        </div>

        <div className="flex gap-16 font-['Space_Mono'] text-[11px] uppercase tracking-widest text-zinc-400 bg-white/30 backdrop-blur-md border border-white/40 py-4 px-8 rounded-2xl">
          <div className="flex flex-col gap-1.5">
            <span className="text-zinc-900 font-bold text-sm">10:00 AM</span>
            <span>Pacific Time</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-zinc-900 font-bold text-sm">60 Mins</span>
            <span>Duration</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-zinc-900 font-bold text-sm">Free</span>
            <span>Registration</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
