"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Clock, ChevronDown, ChevronUp, Wifi, WifiOff, Settings2, Zap } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useRouter } from 'next/navigation';

interface HealthInfo {
  status: string;
  running_jobs: number;
  queued_jobs: number;
  worker_slots: number;
  available_slots: number;
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
        body: JSON.stringify(payload)
      });
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

  return (
    <div className="h-full flex items-center justify-center pb-12">
      {/* Powerful Hero Section - Now Centered and Fixed */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
        className="w-full"
      >
        <Card variant="gradient" className="relative group overflow-hidden p-0 border-white/10 bg-zinc-950 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)]">
          {/* Blocks background */}
          <div className="absolute inset-0 bg-blocks opacity-[0.1] pointer-events-none" />
          
          <div className="absolute inset-0 bg-gradient-to-r from-brand-950/20 to-transparent mix-blend-overlay" />
          
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] pointer-events-none overflow-hidden opacity-40">
             <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-brand-500/20 blur-[120px] rounded-full animate-pulse" />
          </div>

          <div className="relative p-12 md:p-16 max-w-5xl mx-auto text-center md:text-left">
            <div className="inline-flex items-center gap-3 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 mb-8 backdrop-blur-md">
               <div className={`w-1.5 h-1.5 rounded-full ${
                 backendOnline === true
                   ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                   : backendOnline === false
                     ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]'
                     : 'bg-brand-400 shadow-[0_0_10px_rgba(54,169,247,0.8)]'
               }`} />
               <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.3em]">
                 {backendOnline === true ? 'Neural Engine Online' : backendOnline === false ? 'Neural Engine Offline' : 'Checking Status...'}
               </span>
            </div>
            
            <h2 className="text-5xl md:text-7xl font-display font-black text-white mb-8 leading-[0.9] tracking-tighter">
              GENERATE <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-white to-zinc-500">MASTERCLASS</span>.
            </h2>
            <p className="text-lg text-zinc-400 mb-12 leading-relaxed max-w-3xl font-medium">
              Transform raw topics into structured architectural knowledge. High-fidelity video, scripts, and interactive assessments in real-time.
            </p>

            <div className="flex flex-col md:flex-row gap-4 max-w-4xl pt-4">
              <div className="flex-1 relative group/input">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500 to-indigo-500 rounded-xl blur opacity-20 group-focus-within/input:opacity-50 transition-opacity duration-500" />
                <div className="relative flex items-center">
                   <Sparkles className="absolute left-6 w-5 h-5 text-brand-500" />
                   <input
                     type="text"
                     placeholder="Command neural architect: e.g. Quantum Entropy"
                     value={topic}
                     onChange={(e) => setTopic(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
                     className="w-full bg-black/80 backdrop-blur-md border border-white/10 py-5 pl-14 pr-6 rounded-xl text-lg text-white placeholder:text-zinc-700 focus:outline-none focus:border-brand-500/50 transition-all font-mono tracking-tight"
                     disabled={isExecuting}
                   />
                </div>
              </div>
              <Button
                size="lg"
                className="px-12 h-16 !text-lg font-black uppercase tracking-[0.2em] bg-gradient-to-r from-white via-zinc-100 to-white !text-black shadow-[0_12px_30px_-10px_rgba(255,255,255,0.7)] ring-2 ring-white/70 hover:brightness-110 hover:ring-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/90"
                onClick={handleExecute}
                disabled={isExecuting}
              >
                {isExecuting ? 'Synthesizing...' : 'Execute'}
              </Button>
            </div>

            {/* Advanced Options Toggle */}
            <div className="max-w-4xl mt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-[10px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-[0.2em] transition-colors py-2 group/adv"
              >
                <Settings2 className="w-3.5 h-3.5 group-hover/adv:rotate-90 transition-transform duration-300" />
                <span>Advanced Pipeline Configuration</span>
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 pb-2">
                      {/* LLM Provider Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">LLM Provider</label>
                        <select
                          value={modelProvider}
                          onChange={(e) => {
                            const val = e.target.value;
                            setModelProvider(val);
                            setModel('');
                          }}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-brand-500/50 transition-colors appearance-none cursor-pointer"
                        >
                          <option value="">Default (server config)</option>
                          <option value="mistral">Mistral AI</option>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="google">Google Gemini</option>
                          <option value="custom">Custom (provider/model)</option>
                        </select>
                      </div>

                      {/* LLM Model Selector or Custom Input */}
                      {modelProvider === 'custom' ? (
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Custom Model (provider/model)</label>
                          <input
                            type="text"
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                            placeholder="e.g. openai/gpt-4o-mini"
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-brand-500/50 transition-colors"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">LLM Model</label>
                          <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            disabled={!modelProvider}
                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-brand-500/50 transition-colors appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="">{modelProvider ? 'Select a model...' : 'Default (server config)'}</option>
                            {modelProvider && modelsByProvider[modelProvider]?.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Topic Depth */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Topic Depth</label>
                        <select
                          value={topicDepth}
                          onChange={(e) => setTopicDepth(e.target.value as any)}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-brand-500/50 transition-colors appearance-none cursor-pointer"
                        >
                          <option value="brief">Brief (shorter, simple concepts)</option>
                          <option value="normal">Normal (balanced explainer)</option>
                          <option value="deep">Deep (longer, detailed, advanced concepts)</option>
                        </select>
                      </div>

                      {/* TTS Voice */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">TTS Voice</label>
                        <input
                          type="text"
                          value={ttsVoice}
                          onChange={(e) => setTtsVoice(e.target.value)}
                          placeholder="af_heart"
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-brand-500/50 transition-colors"
                        />
                      </div>

                      {/* Max corrections */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">
                          Correction Retries ({maxCorrections})
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={maxCorrections}
                          onChange={(e) => setMaxCorrections(Number(e.target.value))}
                          className="w-full accent-brand-500"
                        />
                      </div>

                      {/* Toggle: Skip voiceover */}
                      <label className="flex items-center gap-3 cursor-pointer group/toggle py-2">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={skipVoiceovers}
                            onChange={(e) => setSkipVoiceovers(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-800 border border-white/10 rounded-full peer-checked:bg-brand-500/30 peer-checked:border-brand-500/50 transition-all" />
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-zinc-500 rounded-full peer-checked:translate-x-4 peer-checked:bg-brand-400 transition-all shadow-sm" />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] group-hover/toggle:text-zinc-300 transition-colors">
                          Skip Voiceover
                        </span>
                      </label>

                      {/* Toggle: Skip web research */}
                      <label className="flex items-center gap-3 cursor-pointer group/toggle py-2">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={skipWebsearch}
                            onChange={(e) => setSkipWebsearch(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-800 border border-white/10 rounded-full peer-checked:bg-brand-500/30 peer-checked:border-brand-500/50 transition-all" />
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-zinc-500 rounded-full peer-checked:translate-x-4 peer-checked:bg-brand-400 transition-all shadow-sm" />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] group-hover/toggle:text-zinc-300 transition-colors">
                          Skip Web Research
                        </span>
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="mt-16 flex flex-wrap items-center justify-center md:justify-start gap-10 border-t border-white/5 pt-10">
               <div className="flex -space-x-4">
                 {[1,2,3,4,5].map(i => (
                   <div key={i} className="w-10 h-10 rounded-full border-2 border-black bg-zinc-900 overflow-hidden hover:scale-110 transition-transform cursor-pointer ring-2 ring-white/5">
                     <img src={`https://i.pravatar.cc/100?img=${i+20}`} alt="User" className="grayscale" />
                   </div>
                 ))}
               </div>
               <div className="space-y-1 border-l border-white/10 pl-10">
                  <div className="text-xs text-white font-black uppercase tracking-widest leading-none">Architect Cohort</div>
                  <div className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-[0.3em] leading-none mt-1">4.8k Active Neural Sessions</div>
               </div>
               
               {/* Backend status indicator */}
               <div className="ml-auto hidden xl:flex items-center gap-4 text-zinc-600 font-mono text-[10px] uppercase tracking-widest">
                  {backendOnline !== null && (
                    <div className="flex items-center gap-2">
                      {backendOnline ? (
                        <>
                          <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500/70">Backend Online</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-amber-500/70">Backend Offline</span>
                        </>
                      )}
                    </div>
                  )}
                  {health && backendOnline && (
                    <>
                      <div className="w-px h-4 bg-white/5" />
                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5" />
                        <span>{health.running_jobs} running · {health.queued_jobs} queued</span>
                      </div>
                    </>
                  )}
                  <div className="w-px h-4 bg-white/5" />
                  <div className="flex items-center gap-2">
                     <Clock className="w-3.5 h-3.5" />
                     <span>Uptime: 99.98%</span>
                  </div>
                  <div className="w-px h-4 bg-white/5" />
                  <span>v4.0.0_STABLE</span>
               </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
