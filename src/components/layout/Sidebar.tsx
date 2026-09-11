"use client";

import { motion } from 'motion/react';
import { LayoutGrid, Library, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandMark from './BrandMark';

export type ViewType = 'home' | 'courses' | 'studio' | 'quiz';

function getViewFromPathname(pathname: string): ViewType {
  if (pathname === '/' || pathname === '/home') return 'home';
  if (pathname === '/library') return 'courses';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname === '/quiz') return 'quiz';
  return 'home';
}

const MENU = [
  { id: 'home', label: 'Overview', icon: LayoutGrid, path: '/' },
  { id: 'courses', label: 'Library', icon: Library, path: '/library' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const activeView = getViewFromPathname(pathname);

  return (
    <aside className="relative z-20 hidden md:flex h-full w-[240px] shrink-0 flex-col border-r border-ink-800 bg-ink-950/70 backdrop-blur-xl">
      <div className="px-5 pt-6 pb-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="text-amber-400 transition-transform duration-500 group-hover:rotate-[24deg]">
            <BrandMark className="h-9 w-9" />
          </span>
          <span className="leading-none">
            <span className="block font-display text-[22px] text-chalk-100">Manimate</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-chalk-500">
              Lecture engine
            </span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {MENU.map((item) => {
          const active = activeView === item.id;
          return (
            <Link
              key={item.id}
              href={item.path}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active ? 'text-chalk-100' : 'text-chalk-400 hover:text-chalk-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg border border-ink-700 bg-ink-800/70"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-amber-400" />
              )}
              <item.icon
                className={`relative z-10 h-[17px] w-[17px] transition-colors ${
                  active ? 'text-amber-400' : 'text-chalk-500 group-hover:text-chalk-300'
                }`}
              />
              <span className="relative z-10 font-medium">{item.label}</span>
            </Link>
          );
        })}

        <div className="pt-4">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-lg border border-dashed border-ink-700 px-3 py-2.5 text-sm text-chalk-400 transition-colors hover:border-amber-400/40 hover:text-chalk-200"
          >
            <Plus className="h-[17px] w-[17px] text-chalk-500 transition-colors group-hover:text-amber-400" />
            <span className="font-medium">New lecture</span>
          </Link>
        </div>
      </nav>

      <div className="border-t border-ink-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-400" />
          </span>
          <span className="label">Renderer online</span>
        </div>
      </div>
    </aside>
  );
}
