import type { Metadata } from 'next';
import '../index.css';
import Sidebar from '../components/layout/Sidebar';
import TopNav from '../components/layout/TopNav';
import Footer from '../components/layout/Footer';
import PageTransition from '../components/layout/PageTransition';

export const metadata: Metadata = {
  title: 'MANIMATE — Neural Architect',
  description: 'Transform raw topics into structured architectural knowledge. High-fidelity video, scripts, and interactive assessments in real-time.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-zinc-300 antialiased font-sans">
        <div className="flex h-screen bg-black text-zinc-300 overflow-hidden font-sans relative">
          {/* Immersive Background Effects */}
          <div className="fixed inset-0 bg-grid opacity-[0.2] pointer-events-none" />
          <div className="fixed inset-0 bg-gradient-to-tr from-black via-black to-brand-950/20 pointer-events-none" />
          
          {/* Dynamic Glows */}
          <div className="fixed -top-[10%] -right-[10%] w-[60%] h-[60%] bg-brand-600/10 blur-[150px] rounded-full pointer-events-none animate-pulse" />
          <div className="fixed -bottom-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none" />

          {/* Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
            <TopNav />
            
            <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col custom-scrollbar">
              <div className="flex-1 p-6 md:p-10">
                <PageTransition>
                  {children}
                </PageTransition>
              </div>
              <Footer />
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
