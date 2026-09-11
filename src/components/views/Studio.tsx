"use client";

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle, BookOpen, Brain, CheckCircle2, ChevronDown, Code2, Download, Film,
  Loader2, Mic, Scissors, Search, SkipForward, Trash2, XCircle,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useRouter } from 'next/navigation';
import { redirectToLogin } from '@/src/lib/authRedirect';

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
  found?: boolean;
  chars?: number;
  modules?: number;
  scenes?: number;
  total_minutes?: number;
  module_titles?: string[];
  plan_scenes?: PlanScene[];
  scenes_generated?: number;
  modules_generated?: number;
  modules_total?: number;
  pct?: number;
  total?: number;
  settled?: number;
  rendered?: number;
  failed?: number;
  corrections?: number;
  failed_scenes?: { module_index: number; scene_id: string; error: string }[];
  ok?: number;
  skipped?: number;
  modules_stitched?: number;
  size_mb?: number;
  final_video?: string;
  log?: string[];
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

const STAGES = [
  { id: 'web_research', name: 'Research', icon: Search },
  { id: 'lecture_planning', name: 'Lecture plan', icon: BookOpen },
  { id: 'code_generation', name: 'Scene code', icon: Code2 },
  { id: 'rendering', name: 'Rendering', icon: Film },
  { id: 'voiceover', name: 'Narration', icon: Mic },
  { id: 'stitching', name: 'Assembly', icon: Scissors },
] as const;

function formatElapsed(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

/** One-line summary of a stage's detail payload. */
function stageSummary(stageId: string, d?: StageDetail): string | null {
  if (!d) return null;
  switch (stageId) {
    case 'web_research':
      return d.chars != null ? `${d.chars.toLocaleString()} characters of context` : null;
    case 'lecture_planning':
      return d.modules != null ? `${d.modules} modules · ${d.scenes} scenes · ~${d.total_minutes} min` : null;
    case 'code_generation':
      if (d.scenes_generated != null) return `${d.scenes_generated} scenes written`;
      if (d.modules_generated != null) return `${d.modules_generated}/${d.modules_total} modules`;
      return null;
    case 'rendering': {
      if (d.total == null) return null;
      const parts = [`${d.rendered ?? d.settled ?? 0}/${d.total} scenes`];
      if (d.failed) parts.push(`${d.failed} failed`);
      if (d.corrections) parts.push(`${d.corrections} corrections`);
      return parts.join(' · ');
    }
    case 'voiceover': {
      if (d.total == null) return null;
      const parts = [`${d.ok ?? 0}/${d.total} voiced`];
      if (d.skipped) parts.push(`${d.skipped} silent`);
      if (d.failed) parts.push(`${d.failed} failed`);
      return parts.join(' · ');
    }
    case 'stitching':
      if (d.size_mb) return `${d.size_mb} MB final cut`;
      if (d.modules_stitched) return `${d.modules_stitched} modules joined`;
      return null;
    default:
      return null;
  }
}

function StageRow({
  stage, data, index,
}: {
  stage: (typeof STAGES)[number];
  data: LocalStageProgress;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const status = data?.status ?? 'pending';
  const done = status === 'done';
  const failed = status === 'failed';
  const skipped = status === 'skipped';
  const running = status === 'running';
  const summary = stageSummary(stage.id, data?.detail);
  const hasLog = Boolean(data?.detail?.log?.length || data?.detail?.failed_scenes?.length);

  const tone = failed
    ? 'text-alert-400 border-alert-500/40 bg-alert-500/10'
    : done
      ? 'text-signal-400 border-signal-500/40 bg-signal-500/10'
      : running
        ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
        : skipped
          ? 'text-chalk-500 border-ink-700 bg-ink-800'
          : 'text-chalk-500 border-ink-700 bg-ink-900';

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="relative pl-11"
    >
      {/* Rail */}
      {index < STAGES.length - 1 && (
        <span
          className={`absolute left-[15px] top-9 h-[calc(100%-10px)] w-px ${
            done ? 'bg-signal-500/30' : 'bg-ink-700'
          }`}
        />
      )}

      <span className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border ${tone}`}>
        {failed ? <XCircle className="h-4 w-4" />
          : done ? <CheckCircle2 className="h-4 w-4" />
          : skipped ? <SkipForward className="h-3.5 w-3.5" />
          : running ? <Loader2 className="h-4 w-4 animate-spin" />
          : <stage.icon className="h-3.5 w-3.5" />}
      </span>

      <div className="pb-6">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h4 className={`font-sans text-sm font-semibold ${done || running || failed ? 'text-chalk-100' : 'text-chalk-400'}`}>
            {stage.name}
          </h4>
          {data?.elapsed_seconds != null && (
            <span className="numeric text-[11px] text-chalk-500">{formatElapsed(data.elapsed_seconds)}</span>
          )}
          {hasLog && (
            <button
              onClick={() => setOpen(!open)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-chalk-500 transition-colors hover:text-chalk-200"
            >
              {open ? 'Hide' : 'Details'}
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        <p className="mt-0.5 text-[13px] leading-relaxed text-chalk-400">{data?.message}</p>
        {summary && <p className="numeric mt-1 text-[11px] text-chalk-500">{summary}</p>}

        {running && (
          <div className="mt-2 h-[3px] w-full max-w-xs overflow-hidden rounded-full bg-ink-800">
            <motion.div
              className="h-full rounded-full bg-amber-400"
              initial={{ width: 0 }}
              animate={{ width: `${data.pct || 0}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        )}

        <AnimatePresence initial={false}>
          {open && hasLog && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="custom-scrollbar mt-3 max-h-56 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950/70 p-3">
                {data.detail?.failed_scenes?.map((f, i) => (
                  <p key={`f${i}`} className="mb-2 font-mono text-[11px] leading-relaxed text-alert-300">
                    module_{f.module_index}/{f.scene_id}: {f.error.slice(0, 300)}
                  </p>
                ))}
                {data.detail?.log?.map((line, i) => (
                  <p key={`l${i}`} className="font-mono text-[11px] leading-relaxed text-chalk-400">
                    {line}
                  </p>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

/** Stand-in for the player while the video does not exist yet. */
function RenderStage({ progress, failed }: { progress: number; failed: boolean }) {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-ink-700 bg-ink-950">
      <div className="absolute inset-0 bg-ruled opacity-60" />
      {/* A construction being struck, mirroring what Manim is doing off-screen */}
      <svg viewBox="0 0 480 270" className="absolute inset-0 h-full w-full text-amber-400/20" fill="none" aria-hidden="true">
        <circle
          cx="240" cy="135" r="80" stroke="currentColor" strokeWidth="1.25"
          className="animate-trace" style={{ ['--trace-length' as string]: '520' }}
        />
        <path
          d="M 240 55 L 309 175 L 171 175 Z" stroke="currentColor" strokeWidth="1.25"
          className="animate-trace" style={{ ['--trace-length' as string]: '420', animationDelay: '0.5s' }}
        />
        <line x1="120" y1="135" x2="360" y2="135" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
        <line x1="240" y1="35" x2="240" y2="235" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
        <circle cx="240" cy="135" r="3" fill="currentColor" />
      </svg>

      <div className="relative z-10 text-center">
        {failed ? (
          <>
            <AlertTriangle className="mx-auto h-7 w-7 text-alert-400" />
            <p className="mt-3 text-sm text-chalk-300">Render did not complete</p>
          </>
        ) : (
          <>
            <div className="numeric font-display text-[52px] leading-none text-chalk-100">{progress}%</div>
            <p className="mt-2 text-[13px] text-chalk-400">Drawing your lecture…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function Studio({ jobId }: StudioProps) {
  const router = useRouter();
  const [jobData, setJobData] = useState<StudioJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => jobId !== undefined && jobId !== 'default');
  const [cancelling, setCancelling] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (!jobId || jobId === 'default') {
      return;
    }

    // Adaptive polling. A fixed 2s tick meant a ten-minute render issued ~300
    // requests per viewer, most of them returning byte-identical progress. The
    // interval widens while nothing changes and snaps back the moment it does,
    // so a busy stage still feels live.
    const MIN_DELAY = 2000;
    const MAX_DELAY = 15000;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = MIN_DELAY;
    let lastSignature = '';

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };

    const fetchJob = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/generate/${jobId}`);
        if (stopped) return;
        if (res.status === 401) {
          stop();
          return redirectToLogin();
        }
        if (!res.ok) {
          setError('Generation job details not found.');
          setLoading(false);
          return;
        }
        const data = (await res.json()) as StudioJob;
        if (stopped) return;
        setJobData(data);
        setLoading(false);

        if (data.status === 'completed' || data.status === 'failed') {
          stop();
          return;
        }

        const signature = `${data.status}|${data.current_stage}|${data.overall_progress}`;
        if (signature === lastSignature) {
          delay = Math.min(MAX_DELAY, Math.round(delay * 1.5));
        } else {
          lastSignature = signature;
          delay = MIN_DELAY;
        }
      } catch (err) {
        console.error('Fetch job error:', err);
        setError('Error communicating with pipeline server.');
        setLoading(false);
        delay = Math.min(MAX_DELAY, Math.round(delay * 1.5));
      } finally {
        if (!stopped) timer = setTimeout(fetchJob, delay);
      }
    };

    fetchJob();

    return stop;
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
    const confirmed = window.confirm(
      'Discard this lecture? This permanently deletes the video and all related data.',
    );
    if (!confirmed) return;

    setDiscarding(true);
    try {
      const res = await fetch(`/api/generate/${jobId}?discard=true`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        router.push('/library');
      } else {
        alert('Failed to discard the lecture.');
      }
    } catch (err) {
      console.error('Discard error:', err);
      alert('Error occurred while discarding.');
    } finally {
      setDiscarding(false);
    }
  }, [jobId, discarding, router]);

  const defaultStages: Record<string, LocalStageProgress> = {
    web_research: { status: 'pending', message: 'Waiting for factual research…', pct: 0 },
    lecture_planning: { status: 'pending', message: 'Waiting to plan the lecture…', pct: 0 },
    code_generation: { status: 'pending', message: 'Waiting for the scene writer…', pct: 0 },
    rendering: { status: 'pending', message: 'Waiting for the Manim renderer…', pct: 0 },
    voiceover: { status: 'pending', message: 'Waiting for narration…', pct: 0 },
    stitching: { status: 'pending', message: 'Waiting for final assembly…', pct: 0 },
  };

  const stages = jobData?.stages || defaultStages;
  const status = jobData?.status || 'pending';
  const progress = jobData?.overall_progress || 0;
  const activeStageKey = jobData?.current_stage || 'web_research';
  const isRunning = status === 'running' || status === 'pending' || status === 'queued';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
        <p className="text-sm text-chalk-400">Loading lecture…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="px-8 py-16 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-alert-400" />
        <h3 className="mt-4 font-display text-2xl text-chalk-100">Something went wrong</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-chalk-400">{error}</p>
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => router.push('/library')}>Back to library</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ─── Header ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-800 pb-5"
      >
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-tight text-chalk-100 md:text-[36px]">
            {jobData?.topic || 'Lecture'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            {isCompleted && (
              <span className="inline-flex items-center gap-1.5 text-signal-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1.5 text-alert-300">
                <XCircle className="h-3.5 w-3.5" /> Failed
              </span>
            )}
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 capitalize text-amber-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {String(activeStageKey).replace(/_/g, ' ')}
              </span>
            )}
            <span className="numeric text-chalk-500">
              {formatElapsed(jobData?.elapsed_seconds)} elapsed
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isRunning && (
            <Button size="sm" variant="danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </Button>
          )}
          {isCompleted && (
            <a href={`/api/generate/${jobId}/video?download=1`}>
              <Button size="sm" variant="secondary" icon={Download}>Download</Button>
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={handleDiscard}
            disabled={discarding}
            title="Discard this lecture"
          >
            {discarding ? 'Discarding…' : ''}
          </Button>
        </div>
      </motion.div>

      {/* Overall progress */}
      {isRunning && (
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-ink-800">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      )}

      {isFailed && jobData?.error && (
        <Card variant="quiet" className="border-alert-500/30 bg-alert-500/[0.06] p-4">
          <p className="font-mono text-[12px] leading-relaxed text-alert-300">{jobData.error}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* ─── Player ─────────────────────────────────────────── */}
        <div className="space-y-4">
          {isCompleted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden rounded-[var(--radius-card)] border border-ink-700 bg-ink-950"
            >
              <video
                src={`/api/generate/${jobId}/video`}
                controls
                playsInline
                className="aspect-video w-full bg-black"
              />
            </motion.div>
          ) : (
            <RenderStage progress={progress} failed={isFailed} />
          )}

          {isCompleted && (
            <Card variant="accent" className="flex flex-wrap items-center gap-4 p-4">
              <Brain className="h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-chalk-100">Check what stuck</p>
                <p className="mt-0.5 text-[13px] text-chalk-400">
                  Five questions generated from this lecture, with explanations.
                </p>
              </div>
              <Button size="sm" onClick={() => router.push(`/studio/${jobId}/quiz`)}>
                Take quiz
              </Button>
            </Card>
          )}
        </div>

        {/* ─── Pipeline ───────────────────────────────────────── */}
        <Card className="p-5 md:p-6">
          <div className="mb-5 flex items-baseline justify-between">
            <h3 className="font-display text-[22px] text-chalk-100">Pipeline</h3>
            <span className="numeric text-[13px] text-chalk-400">{progress}%</span>
          </div>

          <ol className="relative">
            {STAGES.map((stage, i) => (
              <StageRow
                key={stage.id}
                stage={stage}
                data={stages[stage.id] ?? defaultStages[stage.id]}
                index={i}
              />
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
