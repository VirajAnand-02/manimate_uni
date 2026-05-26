export default function Footer() {
  return (
    <footer className="mt-auto py-12 px-8 border-t border-white/5 bg-black/40 backdrop-blur-xl relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.02] pointer-events-none" />
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_10px_rgba(59,92,255,1)]" />
             <span className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Manimate_Terminal_v4</span>
          </div>
          <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em] hidden sm:block">© 2024 Neural Architecture Labs</span>
        </div>
        
        <div className="flex items-center gap-10 text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">
          <a href="#" className="hover:text-brand-400 transition-all hover:tracking-[0.4em]">Privacy</a>
          <a href="#" className="hover:text-brand-400 transition-all hover:tracking-[0.4em]">Terms</a>
          <a href="#" className="hover:text-brand-400 transition-all hover:tracking-[0.4em]">Contact</a>
        </div>
      </div>
    </footer>
  );
}
