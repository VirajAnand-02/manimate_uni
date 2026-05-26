"use client";

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Play, Share2, Rocket, Globe, Cpu, Clock, BarChart3, ChevronRight, Brain, RotateCcw, FileQuestion, Loader2, AlertCircle, FileVideo } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useRouter, useSearchParams } from 'next/navigation';

interface GenerationJob {
  jobId: string;
  topic: string;
  status: string;
  overall_progress: number;
  current_stage: string;
  created_at: string;
  updated_at: string;
  error?: string | null;
  final_video?: string | null;
  stages: Record<string, { status: string; message: string; pct: number }>;
}

export default function MyCourses() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const [generations, setGenerations] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGenerations = async () => {
      try {
        const res = await fetch('/api/generate');
        if (res.ok) {
          const data = await res.json();
          setGenerations(data);
        }
      } catch (err) {
        console.error('Error fetching generations:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchGenerations();
  }, []);

  const filteredGenerations = generations.filter((gen) =>
    gen.topic.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-12 pb-16">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-display font-black text-white tracking-tighter uppercase">Neural_Library</h2>
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
           <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.3em]">Archives Synchronized_V4</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-10">
          
          {loading ? (
            <Card className="flex items-center justify-center p-20 bg-zinc-950/40 border-white/5" variant="solid">
               <div className="text-center space-y-4">
                  <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
                  <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Accessing core registers...</p>
               </div>
            </Card>
          ) : generations.length === 0 ? (
            <Card className="p-12 text-center bg-zinc-950/40 border-white/5 space-y-6" variant="solid">
               <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto border border-white/10">
                  <Sparkles className="w-8 h-8 text-zinc-500" />
               </div>
               <div className="space-y-2 max-w-sm mx-auto">
                  <h3 className="text-xl font-display font-black text-white uppercase tracking-tight">No Neural Streams</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                     You have not generated any mathematical lectures yet. Direct your command center to build a masterclass.
                  </p>
               </div>
               <Button variant="primary" size="sm" className="px-6 py-3 text-[10px] font-black uppercase tracking-widest mx-auto" onClick={() => router.push('/')}>
                  Open Command Center
               </Button>
            </Card>
          ) : filteredGenerations.length === 0 ? (
            <Card className="p-12 text-center bg-zinc-950/40 border-white/5 space-y-6" variant="solid">
               <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto border border-white/10">
                  <Sparkles className="w-8 h-8 text-zinc-500" />
               </div>
               <div className="space-y-2 max-w-sm mx-auto">
                  <h3 className="text-xl font-display font-black text-white uppercase tracking-tight">No Results Found</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                     No neural streams match the query: &quot;{query}&quot;. Try searching another topic.
                  </p>
               </div>
            </Card>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-4 border-b border-white/5 relative">
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-brand-500 to-transparent opacity-30" />
                <div className="flex items-center gap-4">
                  <div className="px-3 py-1 bg-brand-500/10 border border-brand-500/30 text-brand-400 text-[8px] font-black uppercase tracking-[0.3em] rounded-md">ACTIVE CORE</div>
                  <h3 className="text-xl font-display font-black text-white tracking-tighter uppercase">Generated Lattices</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {filteredGenerations.map((gen) => {
                  const isCompleted = gen.status === 'completed';
                  const isFailed = gen.status === 'failed';
                  const isRunning = gen.status === 'running' || gen.status === 'pending';

                  return (
                    <Card key={gen.jobId} className="group p-0 overflow-hidden flex flex-col md:flex-row h-auto md:h-48 bg-black border-white/5 hover:border-brand-500/30 transition-all shadow-[0_0_50px_-20px_rgba(0,0,0,1)]" variant="solid">
                      <div className="md:w-60 h-36 md:h-full relative overflow-hidden bg-zinc-900">
                        <div className="absolute inset-0 bg-grid opacity-[0.1] z-10" />
                        
                        <div className="w-full h-full flex items-center justify-center bg-zinc-950">
                           {isCompleted ? (
                              <FileVideo className="w-12 h-12 text-brand-500/50" />
                           ) : isFailed ? (
                              <AlertCircle className="w-12 h-12 text-red-500/50" />
                           ) : (
                              <Loader2 className="w-12 h-12 text-brand-500/50 animate-spin" />
                           )}
                        </div>

                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent group-hover:from-brand-900/60 transition-colors duration-500 z-10" />
                        <div className="absolute bottom-4 left-4 z-20">
                           <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white/70 text-[9px] font-black uppercase tracking-[0.2em] border border-white/10">
                              <Clock className="w-3.5 h-3.5 text-brand-500" />
                              <span>{isCompleted ? '15 mins' : isFailed ? 'Aborted' : `${gen.overall_progress || 0}%`}</span>
                           </div>
                        </div>
                      </div>
                      <div className="flex-1 p-6 flex flex-col justify-center relative">
                         <span className="text-[8px] text-brand-500 font-black uppercase tracking-[0.4em] mb-2 block">
                            NODE_{gen.jobId.slice(0, 8).toUpperCase()}
                         </span>
                         <h4 className="text-xl font-display font-black text-white mb-2 group-hover:text-brand-400 transition-colors uppercase tracking-tighter leading-none">
                            {gen.topic}
                         </h4>
                         <p className="text-[13px] text-zinc-500 line-clamp-2 max-w-xl leading-relaxed font-medium">
                            {isCompleted 
                              ? 'Dynamic video render pipeline executed successfully. Visual representations generated.'
                              : isFailed
                              ? `Pipeline execution failed: ${gen.error || 'Unknown compiler error'}`
                              : `Currently processing stage: ${gen.current_stage || 'initializing'}. Monitoring node link active.`
                            }
                         </p>
                      </div>
                      <div className="p-6 flex flex-col items-center justify-center gap-2 md:border-l border-white/5 bg-zinc-950/30 min-w-[160px]">
                         <Button 
                           variant="primary" 
                           size="sm" 
                           icon={isRunning ? Loader2 : Play} 
                           fullWidth 
                           className="h-10 text-[9px] font-black uppercase tracking-widest px-4" 
                           onClick={() => router.push(`/studio/${gen.jobId}`)}
                         >
                            {isRunning ? 'Monitor' : 'Stream'}
                         </Button>
                         <Button 
                           variant="outline" 
                           size="sm" 
                           icon={FileQuestion} 
                           fullWidth 
                           className="h-10 text-[9px] font-black uppercase tracking-widest px-4 border-white/10 text-zinc-600 hover:text-white" 
                           onClick={() => router.push('/quiz')}
                           disabled={!isCompleted}
                         >
                            Quiz
                         </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-10">
           {/* Productivity Card - High Density */}
           <Card variant="solid" className="py-8 px-8 border-white/10 bg-zinc-950 shadow-2xl relative overflow-hidden" glow="none">
              <div className="absolute inset-0 bg-blocks opacity-[0.03] pointer-events-none" />
              <div className="flex items-center justify-between mb-8">
                 <div className="flex items-center gap-2">
                    <BarChart3 className="text-brand-500 w-4 h-4 shadow-[0_0_10px_rgba(12,142,233,0.5)]" />
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.3em]">Core_Analytics</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Live</span>
                 </div>
              </div>
              
              <div className="flex items-baseline justify-center gap-1.5 mb-1.5">
                 <span className="text-4xl font-display font-black text-white uppercase tracking-tighter">
                    {generations.filter(g => g.status === 'completed').length}
                 </span>
                 <span className="text-zinc-600 text-base font-bold uppercase italic tracking-widest">NOD</span>
              </div>
              <p className="text-[9px] text-zinc-600 mb-8 font-bold uppercase tracking-[0.2em] text-center">Stable Constructs In Library</p>
              
              <div className="grid grid-cols-2 gap-3">
                 <div className="p-4 rounded-xl bg-black border border-white/5 text-center">
                    <div className="text-xl font-display font-black text-white uppercase tracking-tighter">
                       {generations.length}
                    </div>
                    <div className="text-[8px] text-zinc-600 font-black uppercase mt-1.5 tracking-widest">Total Jobs</div>
                 </div>
                 <div className="p-4 rounded-xl bg-black border border-white/5 text-center">
                    <div className="text-xl font-display font-black text-brand-400 uppercase tracking-tighter">
                       {generations.length > 0 
                         ? `${Math.round((generations.filter(g => g.status === 'completed').length / generations.length) * 100)}%`
                         : '0%'
                       }
                    </div>
                    <div className="text-[8px] text-zinc-600 font-black uppercase mt-1.5 tracking-widest">Yield Sync</div>
                 </div>
              </div>
           </Card>

           <Card variant="glass" className="bg-brand-500/5 border-brand-500/10 p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform duration-700">
                 <Brain className="w-16 h-16 text-white" />
              </div>
              <div className="flex items-center gap-3 mb-6">
                 <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center border border-brand-500/30">
                    <Sparkles className="w-4 h-4 text-brand-400" />
                 </div>
                 <h5 className="text-[9px] font-black text-brand-400 uppercase tracking-[0.4em]">Architect_Log</h5>
              </div>
               <p className="text-zinc-400 text-[13px] leading-relaxed italic font-medium">
                 {"\"Neural registers initialized. Dynamic file polling is fully active for all local workspace directories.\""}
               </p>
           </Card>
        </div>
      </div>
    </div>
  );
}
