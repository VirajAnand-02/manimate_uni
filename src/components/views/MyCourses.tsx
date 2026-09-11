"use client";

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle, ArrowRight, CheckCircle2, FileQuestion, Loader2, Play, Plus, Search,
} from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useRouter, useSearchParams } from 'next/navigation';
import { redirectToLogin } from '@/src/lib/authRedirect';

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

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatusBadge({ status, progress }: { status: string; progress: number }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-500/30 bg-signal-500/10 px-2.5 py-1 text-[11px] font-medium text-signal-300">
        <CheckCircle2 className="h-3 w-3" />
        Ready
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-alert-500/30 bg-alert-500/10 px-2.5 py-1 text-[11px] font-medium text-alert-300">
        <AlertCircle className="h-3 w-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="numeric">{progress || 0}%</span>
    </span>
  );
}

/** Progress rendered as a traced arc — the same visual language as the backdrop. */
function ProgressRing({ value, state }: { value: number; state: 'done' | 'failed' | 'running' }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = state === 'done' ? 100 : Math.max(0, Math.min(100, value));
  const color =
    state === 'done' ? 'text-signal-400' : state === 'failed' ? 'text-alert-400' : 'text-amber-400';

  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-700" />
        <circle
          cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className={`${color} transition-[stroke-dashoffset] duration-700 ease-out`}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center ${color}`}>
        {state === 'done' ? (
          <Play className="h-4 w-4 fill-current" />
        ) : state === 'failed' ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <span className="numeric text-[10px] font-medium">{pct}</span>
        )}
      </span>
    </div>
  );
}

function EmptyState({
  icon: Icon, title, body, action,
}: { icon: typeof Search; title: string; body: string; action?: React.ReactNode }) {
  return (
    <Card className="px-8 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-ink-700 bg-ink-800">
        <Icon className="h-5 w-5 text-chalk-400" />
      </div>
      <h3 className="mt-5 font-display text-2xl text-chalk-100">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-balance text-sm leading-relaxed text-chalk-400">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Card>
  );
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
        if (res.status === 401) return redirectToLogin();
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

  const filtered = generations.filter((gen) =>
    gen.topic.toLowerCase().includes(query.toLowerCase()),
  );

  const done = generations.filter((g) => g.status === 'completed').length;
  const running = generations.filter((g) => g.status === 'running' || g.status === 'pending').length;

  return (
    <div className="space-y-8 pb-8">
      {/* Stats strip */}
      {!loading && generations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-ink-800 pb-5"
        >
          {[
            { n: generations.length, label: 'lectures' },
            { n: done, label: 'ready' },
            { n: running, label: 'in progress' },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <span className="numeric font-display text-[28px] leading-none text-chalk-100">{s.n}</span>
              <span className="text-[13px] text-chalk-400">{s.label}</span>
            </div>
          ))}
          <div className="ml-auto">
            <Button size="sm" variant="outline" icon={Plus} onClick={() => router.push('/')}>
              New lecture
            </Button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[92px] animate-pulse rounded-[var(--radius-card)] border border-ink-800 bg-ink-900/40"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      ) : generations.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nothing here yet"
          body="Generate your first lecture and it will show up here, along with its video, scenes and quiz."
          action={
            <Button icon={ArrowRight} onClick={() => router.push('/')}>
              Compose a lecture
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          body={`Nothing in your library matches “${query}”. Try a different search.`}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((gen, i) => {
            const isCompleted = gen.status === 'completed';
            const isFailed = gen.status === 'failed';
            const isRunning = !isCompleted && !isFailed;
            const state = isCompleted ? 'done' : isFailed ? 'failed' : 'running';

            return (
              <Card
                key={gen.jobId}
                delay={i * 0.05}
                onClick={() => router.push(`/studio/${gen.jobId}`)}
                className={`group relative overflow-hidden p-4 md:p-5 ${isRunning ? 'sweep-host sweep-always' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <ProgressRing value={gen.overall_progress} state={state} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h3 className="truncate font-display text-[21px] leading-tight text-chalk-100 transition-colors group-hover:text-amber-300">
                        {gen.topic}
                      </h3>
                      <StatusBadge status={gen.status} progress={gen.overall_progress} />
                    </div>
                    <p className="mt-1 truncate text-[13px] text-chalk-400">
                      {isCompleted
                        ? 'Video, scenes and quiz ready'
                        : isFailed
                          ? gen.error || 'Pipeline failed'
                          : `${(gen.current_stage || 'starting').replace(/_/g, ' ')}…`}
                      <span className="text-chalk-500"> · {relativeTime(gen.created_at)}</span>
                    </p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    {isCompleted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={FileQuestion}
                        onClick={() => router.push(`/studio/${gen.jobId}/quiz`)}
                      >
                        Quiz
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isCompleted ? 'primary' : 'secondary'}
                      icon={isRunning ? Loader2 : Play}
                      className={isRunning ? '[&>svg]:animate-spin' : ''}
                      onClick={() => router.push(`/studio/${gen.jobId}`)}
                    >
                      {isRunning ? 'Monitor' : isFailed ? 'Details' : 'Watch'}
                    </Button>
                  </div>
                </div>

                {/* Hairline progress along the bottom edge for live jobs */}
                {isRunning && (
                  <div className="absolute inset-x-0 bottom-0 h-[2px] bg-ink-800">
                    <motion.div
                      className="h-full bg-amber-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${gen.overall_progress || 0}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
