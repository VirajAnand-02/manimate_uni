"use client";

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import Footer from './Footer';
import PageTransition from './PageTransition';
import Backdrop from '../visuals/Backdrop';

/** Routes that render bare, without the sidebar/topnav chrome. */
const BARE_ROUTES = ['/login'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return (
      <div className="relative min-h-screen">
        <Backdrop variant="focus" />
        <div className="relative z-10 min-h-screen">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-ink-950 text-chalk-300">
      <Backdrop />
      <Sidebar />
      <main className="relative z-10 flex h-full min-w-0 flex-1 flex-col">
        <TopNav />
        <div className="custom-scrollbar flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <div className="flex-1 px-5 py-8 md:px-10 md:py-10">
            <PageTransition>{children}</PageTransition>
          </div>
          <Footer />
        </div>
      </main>
    </div>
  );
}
