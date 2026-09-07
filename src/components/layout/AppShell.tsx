"use client";

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import Footer from './Footer';
import PageTransition from './PageTransition';

/** Routes that render bare, without the sidebar/topnav chrome. */
const BARE_ROUTES = ['/login'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return <div className="relative z-10 min-h-screen">{children}</div>;
  }

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden font-sans relative">
      {/* Immersive Background Effects */}
      <div className="fixed inset-0 bg-grid opacity-[0.2] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-tr from-black via-black to-brand-950/20 pointer-events-none" />

      {/* Dynamic Glows */}
      <div className="fixed -top-[10%] -right-[10%] w-[60%] h-[60%] bg-brand-600/10 blur-[150px] rounded-full pointer-events-none animate-pulse" />
      <div className="fixed -bottom-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />

      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        <TopNav />

        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col custom-scrollbar">
          <div className="flex-1 p-6 md:p-10">
            <PageTransition>{children}</PageTransition>
          </div>
          <Footer />
        </div>
      </main>
    </div>
  );
}
