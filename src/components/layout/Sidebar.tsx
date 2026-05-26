"use client";

import { motion } from 'motion/react';
import { Home, BookOpen, Plus, HelpCircle, LogOut, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type ViewType = 'home' | 'courses' | 'studio' | 'quiz';

function getViewFromPathname(pathname: string): ViewType {
  if (pathname === '/' || pathname === '/home') return 'home';
  if (pathname === '/library') return 'courses';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname === '/quiz') return 'quiz';
  return 'home';
}

export default function Sidebar() {
  const pathname = usePathname();
  const activeView = getViewFromPathname(pathname);

  const menuItems = [
    { id: 'home', label: 'Command Center', icon: Home, path: '/' },
    { id: 'courses', label: 'Neural Library', icon: BookOpen, path: '/library' },
  ];

  return (
    <aside className="w-64 border-r border-white/5 bg-black flex flex-col h-full z-20 relative overflow-hidden">
      {/* Background blocks overlay */}
      <div className="absolute inset-0 bg-blocks opacity-[0.05] pointer-events-none" />
      
      {/* Brand */}
      <div className="p-6 pb-10 flex items-center gap-3 relative z-10">
        <Link href="/" className="flex items-center gap-3 relative group">
          <div className="relative group">
             <div className="absolute inset-0 bg-brand-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
             <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center relative z-10 shadow-xl shadow-brand-500/20">
               <GraduationCap className="text-white w-6 h-6" />
             </div>
          </div>
          <div>
            <h1 className="text-xl font-display font-extrabold text-white tracking-tighter leading-none">MANIMATE</h1>
            <div className="flex items-center gap-1 mt-1">
               <div className="w-1 h-1 rounded-full bg-brand-500" />
               <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.2em] leading-none">Neural Architect</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 mt-2 relative z-10">
        {menuItems.map((item) => (
          <Link
            key={item.id}
            href={item.path}
            className={`w-full flex items-center gap-4 px-5 py-3 rounded-xl transition-all relative group overflow-hidden ${
              activeView === item.id 
                ? 'text-white' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {activeView === item.id && (
              <>
                <motion.div 
                  layoutId="active-pill"
                  className="absolute inset-0 bg-white/[0.03] border border-white/5 shadow-inner"
                  transition={{ type: 'spring', bounce: 0.1, duration: 0.5 }}
                />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-500 rounded-r-full shadow-[0_0_10px_rgba(12,142,233,0.5)]" />
              </>
            )}
            <item.icon className={`w-4 h-4 transition-transform duration-300 relative z-10 ${activeView === item.id ? 'text-brand-400' : 'group-hover:scale-110'}`} />
            <span className="font-bold text-xs uppercase tracking-widest relative z-10">{item.label}</span>
          </Link>
        ))}
      </nav>
      
      {/* Version Info */}
      <div className="p-6 pt-2 relative z-10">
        <div className="flex items-center gap-2.5 text-[8px] text-zinc-600 font-bold uppercase tracking-[0.3em]">
          <span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
          <span>MANIMATE CORE V4.0.0</span>
        </div>
      </div>
    </aside>
  );
}
