import type { Metadata } from 'next';
import '../index.css';
import AppShell from '../components/layout/AppShell';

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
