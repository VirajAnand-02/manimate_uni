import 'dotenv/config';
import { appendFileSync } from 'node:fs';
import { generateLecturePlan } from './src/lib/manimate/llm.ts';

const OUT = '__bench_results.txt';
const log = (s: string) => { console.log(s); appendFileSync(OUT, s + '\n'); };

const CANDIDATES: [string, string][] = [
  ['mistral',    'ministral-14b-latest'],
  ['mistral',    'mistral-large-2512'],
  ['groq',       'openai/gpt-oss-120b'],
  ['groq',       'openai/gpt-oss-20b'],
  ['groq',       'groq/compound'],
  ['nvidia',     'nvidia/nemotron-3-super-120b-a12b'],
  ['nvidia',     'nvidia/nemotron-3.5-lightning-30b-a3b'],
  ['nvidia',     'deepseek-ai/deepseek-v4-pro-0813'],
  ['nvidia',     'moonshotai/kimi-k3'],
  ['nvidia',     'google/gemma-4-31b-it'],
  ['nvidia',     'openai/gpt-oss-20b'],
];

log('provider  model                                    time  mod scenes  s/scene  specs  note');
log('-'.repeat(100));

for (const [provider, model] of CANDIDATES) {
  const t0 = Date.now();
  try {
    const plan: any = await generateLecturePlan('The Fourier transform', 'normal', null, { provider, model });
    const ms = Date.now() - t0;
    let scenes = 0, spec = 0;
    for (const m of plan.modules || []) for (const s of m.scenes || []) {
      scenes++;
      if ((s.visualElements?.length || 0) && (s.animationSequence?.length || 0) && (s.voiceover || '').trim()) spec++;
    }
    log(
      `${provider.padEnd(9)} ${model.slice(0, 40).padEnd(40)} ${String(Math.round(ms / 1000) + 's').padStart(5)}` +
      `  ${String(plan.modules.length).padStart(3)} ${String(scenes).padStart(6)}` +
      `  ${(ms / Math.max(scenes, 1) / 1000).toFixed(1).padStart(7)}  ${String(spec + '/' + scenes).padStart(5)}  ok`
    );
  } catch (e: any) {
    const ms = Date.now() - t0;
    const msg = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 46);
    log(`${provider.padEnd(9)} ${model.slice(0, 40).padEnd(40)} ${String(Math.round(ms / 1000) + 's').padStart(5)}  ${'—'.padStart(3)} ${'—'.padStart(6)}  ${'—'.padStart(7)}  ${'—'.padStart(5)}  FAIL: ${msg}`);
  }
}
log('\ndone');
