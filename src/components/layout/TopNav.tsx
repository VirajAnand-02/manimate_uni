"use client";

import { Search, LogOut, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import BrandMark from './BrandMark';

export type ViewType = 'home' | 'courses' | 'studio' | 'quiz';

function getViewFromPathname(pathname: string): ViewType {
  if (pathname === '/' || pathname === '/home') return 'home';
  if (pathname === '/library') return 'courses';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname === '/quiz') return 'quiz';
  return 'home';
}

const TITLES: Record<ViewType, { title: string; sub: string }> = {
  home: { title: 'Overview', sub: 'Compose a new lecture' },
  courses: { title: 'Library', sub: 'Everything you have generated' },
  studio: { title: 'Studio', sub: 'Pipeline and playback' },
  quiz: { title: 'Assessment', sub: 'Check what stuck' },
};

function SearchBarInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const setQuery = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val) params.set('q', val);
    else params.delete('q');
    router.replace(`/library?${params.toString()}`);
  };

  return (
    <div className="group relative hidden items-center lg:flex">
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-chalk-500 transition-colors group-focus-within:text-amber-400" />
      <input
        type="text"
        placeholder="Search lectures"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9 w-64 rounded-lg border border-ink-700 bg-ink-900/70 pl-9 pr-8 text-sm text-chalk-200 outline-none transition-colors placeholder:text-chalk-500 hover:border-ink-600 focus:border-amber-400/50"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute right-2.5 text-chalk-500 transition-colors hover:text-chalk-200"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SearchBar() {
  return (
    <Suspense
      fallback={<div className="hidden h-9 w-64 rounded-lg border border-ink-700 bg-ink-900/70 lg:block" />}
    >
      <SearchBarInput />
    </Suspense>
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const view = getViewFromPathname(pathname);
  const { title, sub } = TITLES[view];

  return (
    <header className="relative z-10 flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-ink-800 bg-ink-950/60 px-5 backdrop-blur-xl md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {/* Brand shows here only on small screens, where the sidebar is hidden. */}
        <Link href="/" className="text-amber-400 md:hidden">
          <BrandMark className="h-7 w-7" />
        </Link>
        <div className="min-w-0">
          <h2 className="truncate font-display text-[26px] leading-none text-chalk-100">{title}</h2>
          <p className="mt-1 truncate text-[13px] text-chalk-400">{sub}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SearchBar />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-700 bg-ink-900/70 text-chalk-400 transition-colors hover:border-ink-600 hover:text-chalk-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
