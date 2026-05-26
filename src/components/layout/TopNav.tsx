"use client";

import { Search, Bell } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

export type ViewType = 'home' | 'courses' | 'studio' | 'quiz';

function getViewFromPathname(pathname: string): ViewType {
  if (pathname === '/' || pathname === '/home') return 'home';
  if (pathname === '/library') return 'courses';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname === '/quiz') return 'quiz';
  return 'home';
}

function SearchBarInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set('q', val);
    } else {
      params.delete('q');
    }
    router.replace(`/library?${params.toString()}`);
  };

  return (
    <div className="hidden lg:flex items-center relative group">
      <Search className="absolute left-4 w-3.5 h-3.5 text-zinc-600 group-focus-within:text-brand-400 transition-colors" />
      <input
        type="text"
        placeholder="ACCESS_CORE_DATA..."
        value={query}
        onChange={handleSearchChange}
        className="bg-zinc-900 border border-white/5 hover:border-white/10 focus:border-brand-500/50 outline-none rounded-lg py-2.5 pl-10 pr-6 w-64 text-[9px] font-mono font-bold tracking-[0.2em] text-white placeholder:text-zinc-700 transition-all shadow-inner"
      />
    </div>
  );
}

function SearchBar() {
  return (
    <Suspense fallback={
      <div className="hidden lg:flex items-center relative group">
        <Search className="absolute left-4 w-3.5 h-3.5 text-zinc-700" />
        <div className="bg-zinc-900 border border-white/5 rounded-lg py-2.5 pl-10 pr-6 w-64 h-9 animate-pulse" />
      </div>
    }>
      <SearchBarInput />
    </Suspense>
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const activeView = getViewFromPathname(pathname);

  const titles: Record<ViewType, string> = {
    home: 'Dashboard',
    courses: 'My Courses',
    studio: 'Manimate Studio',
    quiz: 'Knowledge Check'
  };

  return (
    <header className="h-16 border-b border-white/5 bg-black/60 backdrop-blur-2xl flex items-center justify-between px-8 z-10 relative">
      <div className="absolute inset-0 bg-blocks opacity-[0.03] pointer-events-none" />
      
      <div className="flex items-center gap-6 relative z-10">
        <h2 className="text-lg font-display font-black text-white uppercase tracking-tighter">
          {titles[activeView]}
        </h2>
        {activeView === 'studio' && (
          <div className="flex items-center gap-4 pl-6 border-l border-white/5">
             <div className="flex flex-col">
                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest leading-none">Active Construct</span>
                <span className="text-[10px] text-brand-400 font-bold uppercase tracking-tight mt-0.5">System: Neural_Physics_Core</span>
             </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 relative z-10">
        {/* Search Bar */}
        <SearchBar />

        <div className="flex items-center gap-3 relative z-10">
          <button className="p-2.5 rounded-lg bg-zinc-900 border border-white/5 hover:border-brand-500/30 text-zinc-500 hover:text-white transition-all relative group">
            <Bell className="w-4 h-4 group-hover:animate-shake" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-brand-500 rounded-full border border-black" />
          </button>
          
          <div className="w-px h-6 bg-white/5 mx-1" />
        </div>
      </div>
    </header>
  );
}
