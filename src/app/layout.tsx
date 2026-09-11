import type { Metadata } from 'next';
import '../index.css';
import AppShell from '../components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Manimate — Lecture Engine',
  description:
    'Turn any topic into a narrated, animated mathematical lecture: researched, planned, rendered with Manim, and voiced — end to end.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink-950 font-sans text-chalk-300 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
