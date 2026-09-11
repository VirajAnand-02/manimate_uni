"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ChevronDown, Loader2, Settings2, WifiOff, Wand2 } from 'lucide-react';
import Button from '../ui/Button';
import { useRouter } from 'next/navigation';
import { redirectToLogin } from '@/src/lib/authRedirect';

interface HealthInfo {
  status: string;
  running_jobs: number;
  queued_jobs: number;
  worker_slots: number;
  available_slots: number;
}

const SUGGESTIONS = [
  'The Fourier transform, visually',
  'Why eigenvectors matter',
  'Bayes’ theorem from scratch',
  'Gradient descent, step by step',
];

const fieldClass =
  'w-full rounded-lg border border-ink-700 bg-ink-900/80 px-3 py-2.5 text-sm text-chalk-200 outline-none transition-colors placeholder:text-chalk-500 hover:border-ink-600 focus:border-amber-400/50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label block">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start gap-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3 text-left transition-colors hover:border-ink-600"
    >
      <span
        className={`mt-0.5 flex h-[18px] w-[30px] shrink-0 items-center rounded-full border px-[2px] transition-colors ${
          checked ? 'border-amber-400/50 bg-amber-400/25' : 'border-ink-600 bg-ink-800'
        }`}
      >
        <motion.span
          animate={{ x: checked ? 12 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={`h-3 w-3 rounded-full ${checked ? 'bg-amber-400' : 'bg-chalk-500'}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-chalk-200">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-chalk-500">{hint}</span>
      </span>
    </button>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Advanced options state
  const [modelProvider, setModelProvider] = useState('');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');

  const modelsByProvider: Record<string, { value: string; label: string }[]> = {
    mistral: [
      { value: 'mistral-large-2512', label: 'Mistral Large' },
      { value: 'codestral-latest', label: 'Codestral Latest' },
    ],
    openai: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'o1-mini', label: 'o1 Mini' },
    ],
    anthropic: [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ],
    google: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
    groq: [
      { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
      { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
      { value: 'qwen/qwen3.8-27b', label: 'Qwen3.8 27B' },
      { value: 'qwen/qwen3.6-27b', label: 'Qwen3.6 27B' },
      { value: 'groq/compound', label: 'Groq Compound' },
    ],
    // OpenRouter carries 400+ models; these are a starting shortlist. Anything
    // from openrouter.ai/models works via the custom "provider/model" field.
    openrouter: [
      { value: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
      { value: 'anthropic/claude-opus-5', label: 'Claude Opus 5' },
      { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
      { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    ],
    // NVIDIA NIM. Ids are "vendor/model" here too. Point NVIDIA_NIM_BASE_URL at
    // your own container to use a self-hosted NIM instead of the hosted catalogue.
    // NIM gates models per account, so availability varies — these were each
    // verified against a live key. Anything else from the catalogue works via
    // the custom "provider/model" field.
    nvidia: [
      { value: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B' },
      { value: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B' },
      { value: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning 30B' },
      { value: 'deepseek-ai/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro' },
      { value: 'moonshotai/kimi-k3', label: 'Kimi K3' },
      { value: 'google/gemma-4-31b-it', label: 'Gemma 4 31B' },
      { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
    ],
  };
  const [topicDepth, setTopicDepth] = useState<'brief' | 'normal' | 'deep'>('normal');
  const [skipVoiceovers, setSkipVoiceovers] = useState(false);
  const [skipWebsearch, setSkipWebsearch] = useState(false);
  const [ttsVoice, setTtsVoice] = useState('');
  const [maxCorrections, setMaxCorrections] = useState(3);

  // Fetch backend health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
          setBackendOnline(data.status === 'ok');
        } else {
          setBackendOnline(false);
        }
      } catch {
        setBackendOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleExecute = async () => {
    const cleanTopic = topic.trim();
    if (!cleanTopic || isExecuting) return;

    setIsExecuting(true);
    try {
      const payload: Record<string, unknown> = { topic: cleanTopic };

      // Pack LLM provider and model settings
      if (modelProvider === 'custom') {
        const cleanCustom = customModel.trim();
        if (cleanCustom) {
          payload.model = cleanCustom;
        }
      } else {
        if (modelProvider) payload.model_provider = modelProvider;
        if (model) payload.model = model;
      }
      if (skipVoiceovers) payload.skip_voiceovers = true;
      if (skipWebsearch) payload.skip_websearch = true;
      if (ttsVoice) payload.tts_voice = ttsVoice;
      if (maxCorrections !== 3) payload.max_correction_attempts = maxCorrections;
      if (topicDepth) payload.topic_depth = topicDepth;

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) return redirectToLogin();
      if (res.ok) {
        const data = await res.json();
        router.push(`/studio/${data.jobId}`);
      } else {
        console.error('Failed to create generation job');
      }
    } catch (e) {
      console.error('Error executing job:', e);
    } finally {
      setIsExecuting(false);
    }
  };

  const busy = health ? health.available_slots === 0 : false;

  return (
    <div className="mx-auto w-full max-w-3xl pb-10">
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="pt-6 text-center md:pt-12"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/70 px-3 py-1 text-[11px] text-chalk-400">
          <Wand2 className="h-3 w-3 text-amber-400" />
          Research · script · render · narrate
        </span>

        <h1 className="mt-6 text-balance font-display text-[42px] leading-[1.08] text-chalk-100 md:text-[58px]">
          What should we
          <span className="relative mx-2 inline-block text-amber-400">
            explain
            {/* Hand-drawn underline, traced on entry */}
            <svg
              viewBox="0 0 200 12"
              className="absolute -bottom-1 left-0 w-full text-amber-400/60"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 8 C 40 2, 70 10, 100 6 C 135 1.5, 165 9, 198 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-trace"
                style={{ ['--trace-length' as string]: '210' }}
              />
            </svg>
          </span>
          today?
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-balance text-[15px] leading-relaxed text-chalk-400">
          Name any topic. Manimate researches it, plans a lecture, writes the Manim
          scenes, renders them, and narrates the result.
        </p>
      </motion.div>

      {/* ─── Composer ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="mt-10"
      >
        <div className="panel-raised edge-light rounded-[18px] p-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleExecute(); }}
              placeholder="e.g. How does a Fourier transform actually work?"
              className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[15px] text-chalk-100 outline-none placeholder:text-chalk-500"
            />
            <Button
              size="lg"
              onClick={handleExecute}
              disabled={!topic.trim() || isExecuting}
              icon={isExecuting ? Loader2 : undefined}
              iconRight={isExecuting ? undefined : ArrowRight}
              className={isExecuting ? '[&>svg]:animate-spin' : ''}
            >
              {isExecuting ? 'Starting' : 'Generate'}
            </Button>
          </div>
        </div>

        {/* Suggestions */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s, i) => (
            <motion.button
              key={s}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.06 }}
              onClick={() => setTopic(s)}
              className="rounded-full border border-ink-700 bg-ink-900/50 px-3 py-1.5 text-[13px] text-chalk-400 transition-colors hover:border-amber-400/40 hover:text-chalk-100"
            >
              {s}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ─── Status + advanced toggle ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3"
      >
        <span className="inline-flex items-center gap-2 text-[13px]">
          {backendOnline === null ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-chalk-500" />
              <span className="text-chalk-500">Checking renderer…</span>
            </>
          ) : backendOnline ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-400" />
              </span>
              <span className="text-chalk-400">
                {busy ? 'Renderer busy' : 'Renderer ready'}
                {health && (health.running_jobs > 0 || health.queued_jobs > 0) && (
                  <span className="numeric ml-1.5 text-chalk-500">
                    · {health.running_jobs} running · {health.queued_jobs} queued
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-alert-400" />
              <span className="text-alert-400">Renderer unreachable</span>
            </>
          )}
        </span>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="inline-flex items-center gap-1.5 text-[13px] text-chalk-400 transition-colors hover:text-chalk-100"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Options
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>
      </motion.div>

      {/* ─── Advanced options ─────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="panel mt-6 rounded-[var(--radius-card)] p-5 md:p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Provider">
                  <select
                    value={modelProvider}
                    onChange={(e) => { setModelProvider(e.target.value); setModel(''); }}
                    className={fieldClass}
                  >
                    <option value="">Server default</option>
                    <option value="mistral">Mistral AI</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google Gemini</option>
                    <option value="groq">Groq</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="nvidia">NVIDIA NIM</option>
                    <option value="custom">Custom…</option>
                  </select>
                </Field>

                {modelProvider === 'custom' ? (
                  <Field label="Model (provider/model)">
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="groq/openai/gpt-oss-120b"
                      className={fieldClass}
                    />
                  </Field>
                ) : (
                  <Field label="Model">
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={!modelProvider}
                      className={`${fieldClass} disabled:opacity-40`}
                    >
                      <option value="">{modelProvider ? 'Select a model…' : 'Server default'}</option>
                      {modelProvider && modelsByProvider[modelProvider]?.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </Field>
                )}

                <Field label="Depth">
                  <div className="flex gap-1.5 rounded-lg border border-ink-700 bg-ink-900/80 p-1">
                    {(['brief', 'normal', 'deep'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setTopicDepth(d)}
                        className={`relative flex-1 rounded-md px-2 py-1.5 text-[13px] capitalize transition-colors ${
                          topicDepth === d ? 'text-ink-950' : 'text-chalk-400 hover:text-chalk-200'
                        }`}
                      >
                        {topicDepth === d && (
                          <motion.span
                            layoutId="depth-pill"
                            className="absolute inset-0 rounded-md bg-amber-400"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        )}
                        <span className="relative z-10 font-medium">{d}</span>
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label={`Correction retries — ${maxCorrections}`}>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={maxCorrections}
                    onChange={(e) => setMaxCorrections(Number(e.target.value))}
                    className="mt-3 w-full accent-[var(--color-amber-400)]"
                  />
                </Field>

                <Field label="Voice">
                  <input
                    type="text"
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                    placeholder="af_heart"
                    className={fieldClass}
                  />
                </Field>

                <div className="space-y-2.5 md:pt-6">
                  <Toggle
                    checked={skipWebsearch}
                    onChange={setSkipWebsearch}
                    label="Skip web research"
                    hint="Faster, but the plan relies only on the model’s own knowledge."
                  />
                  <Toggle
                    checked={skipVoiceovers}
                    onChange={setSkipVoiceovers}
                    label="Skip narration"
                    hint="Renders silent video. Much faster end to end."
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
