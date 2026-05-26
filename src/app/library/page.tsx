import { Suspense } from 'react';
import MyCourses from '../../components/views/MyCourses';

export default function LibraryPage() {
  return (
    <Suspense fallback={
      <div className="space-y-12 pb-16">
        <h2 className="text-3xl font-display font-black text-white tracking-tighter uppercase">Neural_Library</h2>
        <div className="w-full h-40 bg-zinc-950/40 rounded-xl animate-pulse border border-white/5" />
      </div>
    }>
      <MyCourses />
    </Suspense>
  );
}
