"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Download, Monitor, CheckCircle2, Loader2, Sparkles, ChevronRight, ChevronDown, FileVideo, Video, Brain, AlertTriangle, XCircle, Clock, Search, BookOpen, Code2, Film, Mic, Scissors, SkipForward } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useRouter } from 'next/navigation';

interface StudioProps {
  jobId?: string;
}

interface PlanScene {
  module_index: number;
  scene_id: string;
  has_voiceover: boolean;
  voiceover_len: number;
  title: string;
}

interface StageDetail {
  // web_research
  found?: boolean;
  chars?: number;
  // lecture_planning
  modules?: number;
  scenes?: number;
  total_minutes?: number;
  module_titles?: string[];
  plan_scenes?: PlanScene[];
  // code_generation
  scenes_generated?: number;
  pct?: number;
  // rendering
  total?: number;
  rendered?: number;
  failed?: number;
  corrections?: number;
  failed_scenes?: { module_index: number; scene_id: string; error: string }[];
  // voiceover
  ok?: number;
  skipped?: number;
  // stitching
  modules_stitched?: number;
  final_video?: string;
}

interface LocalStageProgress {
  status: string;
  message: string;
  pct: number;
  started_at?: number | null;
  finished_at?: number | null;
  elapsed_seconds?: number | null;
  detail?: StageDetail;
}

interface StudioJob {
  jobId: string;
  backendJobId?: string | null;
  topic: string;
  status: string;
  overall_progress: number;
  current_stage: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  elapsed_seconds?: number | null;
  error?: string | null;
  final_video?: string | null;
  stages: Record<string, LocalStageProgress>;
}

const STAGE_ICONS: Record<string, React.ElementType> = {
  web_research: Search,
  lecture_planning: BookOpen,
  code_generation: Code2,
  rendering: Film,
  voiceover: Mic,
  stitching: Scissors,
};

function formatElapsed(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export default function Studio({ jobId }: StudioProps) {
  const router = useRouter();
  const [jobData, setJobData] = useState<StudioJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => jobId !== undefined && jobId !== 'default');
  const [cancelling, setCancelling] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!jobId || jobId === 'default') {
      return;
    }

    let pollInterval: NodeJS.Timeout | undefined = undefined;

    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/generate/${jobId}`);
        if (!res.ok) {
          setError("Generation job details not found.");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as StudioJob;
        setJobData(data);
        setLoading(false);

        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Fetch job error:", err);
        setError("Error communicating with pipeline server.");
        setLoading(false);
      }
    };

    fetchJob();
    pollInterval = setInterval(fetchJob, 2000);

    return () => clearInterval(pollInterval);
  }, [jobId]);

  const handleCancel = useCallback(async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await fetch(`/api/generate/${jobId}`, { method: 'DELETE' });
      // Re-fetch to get updated status
      const res = await fetch(`/api/generate/${jobId}`);
      if (res.ok) {
        setJobData(await res.json());
      }
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setCancelling(false);
    }
  }, [jobId, cancelling]);

  const handleDiscard = useCallback(async () => {
    if (!jobId || discarding) return;
    const confirm = window.confirm(
      "Are you sure you want to discard this build? This will permanently delete the video and all related data and files."
    );
    if (!confirm) return;

    setDiscarding(true);
    try {
      const res = await fetch(`/api/generate/${jobId}?discard=true`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        router.push('/');
      } else {
        alert("Failed to discard the build.");
      }
    } catch (err) {
      console.error('Discard error:', err);
      alert("Error occurred while discarding the build.");
    } finally {
      setDiscarding(false);
    }
  }, [jobId, discarding, router]);


  const displayTitle = jobData?.topic || (jobId && jobId !== 'default'
    ? jobId
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : "Neural Video Construct");

  const defaultStages: Record<string, LocalStageProgress> = {
    web_research: { status: 'pending', message: 'Queueing Tavily factual research...', pct: 0 },
    lecture_planning: { status: 'pending', message: 'Waiting to plan course syllabus...', pct: 0 },
    code_generation: { status: 'pending', message: 'Waiting for scene code generator...', pct: 0 },
    rendering: { status: 'pending', message: 'Waiting for manim render engine...', pct: 0 },
    voiceover: { status: 'pending', message: 'Waiting for TTS audio compiler...', pct: 0 },
    stitching: { status: 'pending', message: 'Waiting for ffmpeg video stitcher...', pct: 0 }
  };

  const currentStages = jobData?.stages || defaultStages;

  const stepsList = [
    { id: 'web_research', name: 'Web Fact Research', ...currentStages.web_research },
    { id: 'lecture_planning', name: 'Lecture Course Planning', ...currentStages.lecture_planning },
    { id: 'code_generation', name: 'Manim Script Coding', ...currentStages.code_generation },
    { id: 'rendering', name: 'Mathematical Rendering', ...currentStages.rendering },
    { id: 'voiceover', name: 'Voice Narration Compile', ...currentStages.voiceover },
    { id: 'stitching', name: 'Timeline Assembly', ...currentStages.stitching }
  ];

  const overallProgress = jobData?.overall_progress || 0;
  const status = jobData?.status || 'pending';
  const activeStageKey = jobData?.current_stage || 'web_research';
  const activeStage = currentStages[activeStageKey] || { message: 'Initializing...', pct: 0 };
  const isRunning = status === 'running' || status === 'pending' || status === 'queued';

  /** Render rich detail info for a stage */
  function renderStageDetail(stageId: string, detail?: StageDetail) {
    if (!detail || Object.keys(detail).length === 0) return null;

    switch (stageId) {
      case 'web_research':
        if (detail.chars != null) {
          return (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="text-[8px] font-mono text-zinc-600">
                {detail.found ? `📄 ${detail.chars.toLocaleString()} chars collected` : '⏳ Searching...'}
              </div>
            </div>
          );
        }
        return null;

      case 'lecture_planning':
        if (detail.modules != null) {
          return (
            <div className="mt-1.5 space-y-1">
              <div className="text-[8px] font-mono text-zinc-600">
                📐 {detail.modules} modules · {detail.scenes} scenes · ~{detail.total_minutes}min
              </div>
              {detail.module_titles && detail.module_titles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {detail.module_titles.map((title, i) => (
                    <span key={i} className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/5 text-zinc-500">
                      {title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return null;

      case 'code_generation':
        if (detail.scenes_generated != null) {
          return (
            <div className="text-[8px] font-mono text-zinc-600 mt-1.5">
              ⚡ {detail.scenes_generated} scenes generated
            </div>
          );
        }
        return null;

      case 'rendering':
        if (detail.total != null) {
          return (
            <div className="mt-1.5 space-y-1">
              <div className="text-[8px] font-mono text-zinc-600">
                🎬 {detail.rendered ?? 0}/{detail.total} rendered
                {(detail.failed ?? 0) > 0 && <span className="text-red-400"> · {detail.failed} failed</span>}
                {(detail.corrections ?? 0) > 0 && <span className="text-amber-400"> · {detail.corrections} corrections</span>}
              </div>
              {detail.failed_scenes && detail.failed_scenes.length > 0 && (
                <div className="space-y-0.5">
                  {detail.failed_scenes.map((fs, i) => (
                    <div key={i} className="text-[7px] font-mono text-red-400/70 pl-2 border-l border-red-500/20 truncate max-w-[200px]">
                      {fs.scene_id}: {fs.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return null;

      case 'voiceover':
        if (detail.total != null) {
          return (
            <div className="text-[8px] font-mono text-zinc-600 mt-1.5">
              🎙️ {detail.ok ?? 0}/{detail.total} synthesized
              {(detail.failed ?? 0) > 0 && <span className="text-red-400"> · {detail.failed} failed</span>}
              {(detail.skipped ?? 0) > 0 && <span className="text-zinc-500"> · {detail.skipped} skipped</span>}
            </div>
          );
        }
        return null;

      case 'stitching':
        if (detail.modules_stitched != null) {
          return (
            <div className="text-[8px] font-mono text-zinc-600 mt-1.5">
              🎞️ {detail.modules_stitched} modules stitched
            </div>
          );
        }
        return null;

      default:
        return null;
    }
  }

  return (
    <div className="space-y-10 pb-16">
       <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-white/5 relative">
          <div className="absolute inset-0 bg-blocks opacity-[0.05] pointer-events-none" />
          <div className="relative z-10">
             <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center">
                   <Monitor className="w-4 h-4 text-brand-400" />
                </div>
                <h2 className="text-2xl font-display font-black text-white uppercase tracking-tighter">Neural Studio</h2>
             </div>
             <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] max-w-xl">
                Synthesizing architectural knowledge into high-fidelity visual streams.
             </p>
          </div>
          <div className="flex items-center gap-3 relative z-10">
             {isRunning && (
               <Button
                 variant="outline"
                 size="sm"
                 className="border-red-500/20 text-red-400 hover:bg-red-500/10 uppercase font-black tracking-widest text-[10px] px-6 py-3"
                 onClick={handleCancel}
                 disabled={cancelling}
               >
                 <XCircle className="w-3.5 h-3.5 mr-1.5" />
                 {cancelling ? 'Cancelling...' : 'Cancel Job'}
               </Button>
             )}
              <Button
                variant="outline"
                size="sm"
                className="border-white/5 text-zinc-500 uppercase font-black tracking-widest text-[10px] px-6 py-3"
                onClick={handleDiscard}
                disabled={discarding}
              >
                {discarding ? 'Discarding...' : 'Discard Build'}
              </Button>
              <Button variant="primary" size="sm" icon={CheckCircle2} className="px-6 py-3 text-[10px] font-black uppercase tracking-widest" onClick={() => router.push('/library')} disabled={status !== 'completed'}>Finalize Stream</Button>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Monitor Area */}
          <div className="lg:col-span-2 space-y-8">
             <Card variant="solid" className="p-0 overflow-hidden border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] bg-black" glow="none">
                <div className="aspect-video relative group flex items-center justify-center bg-zinc-950">
                   <div className="absolute inset-0 bg-grid opacity-[0.1]" />
                   
                   {loading ? (
                      <div className="text-center space-y-4 relative z-10">
                         <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto" />
                         <p className="font-mono text-xs text-zinc-500 tracking-wider">LOADING ARCHITECT...</p>
                      </div>
                   ) : error ? (
                      <div className="text-center space-y-4 p-8 relative z-10">
                         <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
                         <h4 className="font-display font-black text-white text-lg uppercase tracking-tight">PIPELINE ERROR</h4>
                         <p className="font-mono text-xs text-zinc-500 max-w-md mx-auto">{error}</p>
                         <Button size="sm" variant="outline" className="mt-4 border-white/10" onClick={() => router.push('/')}>Return Home</Button>
                      </div>
                   ) : status === 'failed' ? (
                      <div className="text-center space-y-4 p-8 relative z-10">
                         <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
                         <h4 className="font-display font-black text-white text-lg uppercase tracking-tight">CONSTRUCT FAILED</h4>
                         <p className="font-mono text-xs text-zinc-500 max-w-md mx-auto">{jobData?.error || 'Unknown rendering error occurred.'}</p>
                         <Button size="sm" variant="outline" className="mt-4 border-white/10" onClick={() => router.push('/')}>Return to Center</Button>
                      </div>
                   ) : status === 'completed' ? (
                      <video 
                        src={`/api/generate/${jobId}/video`}
                        controls 
                        autoPlay
                        className="w-full h-full object-contain relative z-10"
                      />
                   ) : (
                      // Running or Pending State Hud
                      <div className="text-center space-y-6 relative z-10 w-full p-8 max-w-lg">
                         <Loader2 className="w-14 h-14 text-brand-500 animate-spin mx-auto mb-2" />
                         <div className="space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-mono text-brand-400 font-bold uppercase tracking-wider px-1">
                               <span>Synthesizing Construct...</span>
                               <span>{overallProgress}%</span>
                            </div>
                            <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                               <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${overallProgress}%` }}
                                 className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 shadow-[0_0_15px_rgba(12,142,233,0.5)]"
                               />
                            </div>
                         </div>
                         <div className="bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-xs text-zinc-400 text-left min-h-[70px] backdrop-blur-md">
                            <div className="text-brand-500 text-[9px] uppercase font-black tracking-widest mb-1.5 flex items-center gap-1.5">
                               <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-ping" />
                               Stage: {activeStageKey.toUpperCase()}
                            </div>
                            <p className="leading-relaxed line-clamp-2">{activeStage.message}</p>
                         </div>
                         {/* Elapsed time display */}
                         {jobData?.elapsed_seconds != null && (
                           <div className="flex items-center justify-center gap-1.5 text-[9px] font-mono text-zinc-600">
                             <Clock className="w-3 h-3" />
                             <span>Elapsed: {formatElapsed(jobData.elapsed_seconds)}</span>
                           </div>
                         )}
                      </div>
                   )}

                   {/* HUD Elements */}
                   <div className="absolute top-6 left-6 flex items-center gap-3 text-white/40 z-20">
                      <div className="px-2.5 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-[8px] font-mono font-bold uppercase tracking-[0.2em]">
                        720P_NEURAL_STREAM
                      </div>
                      <div className="px-2.5 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-[8px] font-mono font-bold uppercase tracking-[0.2em] flex items-center gap-1.5">
                         <div className={`w-1.5 h-1.5 rounded-full ${status === 'completed' ? 'bg-emerald-500' : status === 'failed' ? 'bg-red-500' : 'bg-brand-500 animate-pulse'}`} />
                         {status.toUpperCase()}
                      </div>
                   </div>
                </div>
                
                <div className="p-8 border-t border-white/5 flex items-center justify-between bg-zinc-950/50">
                   <div className="space-y-2 max-w-xl">
                      <div className="flex items-center gap-2">
                         <span className="text-[8px] font-bold text-brand-500 uppercase tracking-[0.3em]">Job Construct Node</span>
                         <h3 className="text-xl font-display font-black text-white uppercase tracking-tighter">{displayTitle}</h3>
                      </div>
                      <p className="text-zinc-500 text-[13px] leading-relaxed font-medium">
                         Exploring the dynamic synthesis of mathematical representation. Structured, compiled and stitched automatically.
                      </p>
                   </div>
                   <div className="flex items-center gap-2">
                      {status === 'completed' && (
                         <a 
                           href={`/api/generate/${jobId}/video`} 
                           download={`manimate_${jobId?.slice(0, 8)}.mp4`}
                           className="p-3.5 rounded-xl bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                         >
                            <Download className="w-4 h-4" />
                            Download
                         </a>
                      )}
                   </div>
                </div>
             </Card>

             <div className="grid grid-cols-1 gap-6">
                <Card variant="solid" className="p-8 border-white/5 hover:border-brand-500/20 transition-all bg-[#09090b] shadow-xl">
                   <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
                            <FileVideo className="w-5 h-5 text-indigo-400" />
                          </div>
                          <h4 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Neural Script Construct</h4>
                      </div>
                      <div className="flex items-center gap-2">
                         {currentStages.lecture_planning?.status === 'running' ? (
                           <Loader2 className="w-3 h-3 text-brand-500 animate-spin" />
                         ) : (
                           <div className={`w-1.5 h-1.5 rounded-full ${currentStages.lecture_planning?.status === 'done' || status === 'completed' ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                         )}
                         <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                            {currentStages.lecture_planning?.status === 'running'
                              ? 'Generating...'
                              : currentStages.lecture_planning?.status === 'done' || status === 'completed'
                                ? 'Lattice Stabilized'
                                : 'Awaiting...'}
                         </span>
                      </div>
                   </div>
                   
                   <div className="space-y-3">
                      {/* Loading skeleton while lecture plan is generating */}
                      {(!currentStages.lecture_planning?.detail?.module_titles || currentStages.lecture_planning.detail.module_titles.length === 0) ? (
                        <div className="space-y-3 font-mono text-[11px]">
                          {currentStages.lecture_planning?.status === 'running' ? (
                            /* Animated loading skeleton */
                            [1, 2, 3].map((i) => (
                              <div key={i} className="p-4 rounded-lg bg-white/[0.02] border border-white/5 animate-pulse">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-4 rounded bg-brand-500/20" />
                                  <div className="flex-1">
                                    <div className="h-3 rounded bg-white/[0.06]" style={{ width: `${50 + i * 15}%` }} />
                                  </div>
                                  <div className="w-3 h-3 rounded bg-white/[0.04]" />
                                </div>
                                <div className="mt-3 space-y-2">
                                  <div className="h-2 rounded bg-white/[0.03]" style={{ width: `${70 + i * 8}%` }} />
                                  <div className="h-2 rounded bg-white/[0.03]" style={{ width: `${40 + i * 12}%` }} />
                                </div>
                              </div>
                            ))
                          ) : (
                            /* Idle placeholder before generation starts */
                            <div className="flex items-center justify-center py-8 text-zinc-600">
                              <div className="text-center space-y-2">
                                <BookOpen className="w-8 h-8 mx-auto text-zinc-700" />
                                <p className="text-[10px] font-mono uppercase tracking-widest">Script construct will appear here</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Module accordion list */
                        <div className="space-y-2 font-mono text-[11px] leading-relaxed">
                          {currentStages.lecture_planning.detail.module_titles.map((title: string, i: number) => {
                            const isExpanded = expandedModules.has(i);
                            const moduleScenes = (currentStages.lecture_planning?.detail as StageDetail)?.plan_scenes?.filter(
                              (s: PlanScene) => s.module_index === i + 1
                            ) || [];

                            return (
                              <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden transition-all hover:border-white/10">
                                <button
                                  onClick={() => {
                                    setExpandedModules(prev => {
                                      const next = new Set(prev);
                                      if (next.has(i)) next.delete(i);
                                      else next.add(i);
                                      return next;
                                    });
                                  }}
                                  className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer group"
                                >
                                  <span className="text-brand-500 font-black text-xs flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                  <span className="flex-1 text-zinc-300 group-hover:text-white transition-colors">{title}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {moduleScenes.length > 0 && (
                                      <span className="text-[8px] text-zinc-600 font-bold px-1.5 py-0.5 rounded bg-white/[0.03]">
                                        {moduleScenes.length} {moduleScenes.length === 1 ? 'scene' : 'scenes'}
                                      </span>
                                    )}
                                    <motion.div
                                      animate={{ rotate: isExpanded ? 180 : 0 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <ChevronDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                    </motion.div>
                                  </div>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isExpanded && moduleScenes.length > 0 && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                                      className="overflow-hidden"
                                    >
                                      <div className="px-3.5 pb-3.5 pt-1 space-y-1.5 border-t border-white/5">
                                        {moduleScenes.map((scene: PlanScene, j: number) => (
                                          <div key={scene.scene_id} className="flex items-center gap-2.5 py-2 px-3 rounded-md bg-white/[0.015] hover:bg-white/[0.04] transition-colors">
                                            <div className="w-5 h-5 rounded flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 flex-shrink-0">
                                              <span className="text-[7px] font-black text-indigo-400">{String(j + 1).padStart(2, '0')}</span>
                                            </div>
                                            <span className="flex-1 text-zinc-500 text-[10px]">
                                              {scene.title || scene.scene_id}
                                            </span>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                              {scene.has_voiceover && (
                                                <Mic className="w-2.5 h-2.5 text-emerald-600" />
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}

                          {/* Summary bar */}
                          {currentStages.lecture_planning.detail.modules != null && (
                            <div className="flex items-center gap-3 pt-2 mt-1 border-t border-white/5 text-[9px] text-zinc-600 font-mono">
                              <span>📐 {currentStages.lecture_planning.detail.modules} modules</span>
                              <span className="text-zinc-800">·</span>
                              <span>{currentStages.lecture_planning.detail.scenes} scenes</span>
                              <span className="text-zinc-800">·</span>
                              <span>~{currentStages.lecture_planning.detail.total_minutes} min</span>
                            </div>
                          )}
                        </div>
                      )}
                   </div>
                </Card>
             </div>
          </div>

          {/* Construct Sidebar */}
          <div className="space-y-8">
             <Card variant="glass" className="p-6 border-white/5 bg-black/40" glow="none">
                <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                   <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white">
                      {status === 'completed' ? (
                         <CheckCircle2 className="w-4 h-4 text-white" />
                      ) : (
                         <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                   </div>
                   <div>
                     <h4 className="text-[11px] font-bold text-white uppercase tracking-[0.2em]">Build Pipeline</h4>
                     {jobData?.elapsed_seconds != null && status !== 'pending' && (
                       <div className="text-[8px] font-mono text-zinc-600 flex items-center gap-1 mt-0.5">
                         <Clock className="w-2.5 h-2.5" />
                         {formatElapsed(jobData.elapsed_seconds)}
                       </div>
                     )}
                   </div>
                </div>
                
                <div className="space-y-8">
                   {stepsList.map((step, idx) => {
                      const isStepDone = step.status === 'done' || (status === 'completed' && step.status !== 'skipped');
                      const isStepActive = step.status === 'running' && status !== 'completed';
                      const isStepFailed = step.status === 'failed';
                      const isStepSkipped = step.status === 'skipped';
                      const StageIcon = STAGE_ICONS[step.id] || Play;

                      return (
                         <div key={idx} className="relative pl-8">
                            {idx !== stepsList.length - 1 && (
                               <div className="absolute left-3 top-8 w-px h-8 bg-white/5" />
                            )}
                            <div className={`absolute left-0 top-1 w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold border transition-all duration-500 ${
                               isStepDone 
                                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                                  : isStepActive
                                     ? 'bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-500/40'
                                     : isStepFailed
                                        ? 'bg-red-500/10 border-red-500/50 text-red-500'
                                        : isStepSkipped
                                           ? 'bg-zinc-800/50 border-zinc-700/50 text-zinc-600'
                                           : 'bg-zinc-900 border-white/5 text-zinc-600'
                            }`}>
                               {isStepDone ? <CheckCircle2 className="w-3 h-3" /> 
                                : isStepSkipped ? <SkipForward className="w-3 h-3" /> 
                                : <StageIcon className="w-3 h-3" />}
                            </div>
                            <div className="flex justify-between items-start mb-1 pl-2">
                               <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${
                                  isStepDone ? 'text-zinc-500' : isStepActive ? 'text-white' : isStepSkipped ? 'text-zinc-700 line-through' : 'text-zinc-700'
                               }`}>
                                  {step.name}
                                </span>
                               <span className="text-[9px] font-mono font-bold text-brand-500">{step.pct || 0}%</span>
                            </div>
                            <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden ml-2 mb-1.5">
                               <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${step.pct || 0}%` }}
                                  className={`h-full ${
                                     isStepDone ? 'bg-zinc-700' : isStepFailed ? 'bg-red-500' : isStepSkipped ? 'bg-zinc-800' : 'bg-brand-500'
                                  }`}
                               />
                            </div>
                            {step.message && (
                               <p className="font-mono text-[9px] text-zinc-500 leading-normal pl-2 max-w-xs">{step.message}</p>
                            )}
                            {/* Rich stage detail */}
                            <div className="pl-2">
                              {renderStageDetail(step.id, step.detail)}
                            </div>
                            {/* Stage elapsed time */}
                            {step.elapsed_seconds != null && step.elapsed_seconds > 0 && (
                              <div className="pl-2 mt-1 text-[7px] font-mono text-zinc-700 flex items-center gap-1">
                                <Clock className="w-2 h-2" /> {formatElapsed(step.elapsed_seconds)}
                              </div>
                            )}
                         </div>
                      );
                   })}
                </div>

                <div className="mt-10 space-y-3">
                   <div className="pt-3 border-t border-white/5">
                      <Button variant="primary" fullWidth size="lg" className="h-16 text-lg font-black uppercase tracking-[0.2em] shadow-2xl shadow-brand-500/20" icon={Brain} onClick={() => router.push(`/studio/${jobId}/quiz`)} disabled={status !== 'completed'}>
                         Take Mastery Quiz
                      </Button>
                   </div>
                </div>
             </Card>

             <Card variant="solid" className="p-6 border-brand-500/10 bg-brand-950/10 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
                   <Sparkles className="w-16 h-16 text-brand-500" />
                </div>
                <h5 className="text-[9px] font-bold text-brand-500 uppercase tracking-[0.4em] mb-4">Neural Insight</h5>
                <p className="text-zinc-400 text-[13px] italic leading-relaxed font-medium relative z-10">
                   {status === 'completed' 
                      ? "\"Calculations finished. All physical rendering lattices have stabilized successfully.\"" 
                      : status === 'failed'
                        ? "\"Pipeline anomaly detected. Neural construct was unable to stabilize the rendering lattice.\""
                        : "\"Building visual lattices for black holes requires high-density compute. Optimized rendering pipeline active.\""}
                </p>
             </Card>
          </div>
       </div>
    </div>
  );
}
