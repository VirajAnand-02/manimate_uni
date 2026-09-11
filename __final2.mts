import 'dotenv/config';
import { generateLecturePlan } from './src/lib/manimate/llm.ts';

const RUNS: [string, string, string][] = [
  ['mistral', 'ministral-14b-latest', ''],
  ['groq',    'openai/gpt-oss-120b',  ''],
  ['groq',    'openai/gpt-oss-120b',  'low'],
  ['groq',    'openai/gpt-oss-20b',   'low'],
];

console.log('provider  model                 effort   time  mod scenes  s/scene  specs');
console.log('-'.repeat(76));
for (const [provider, model, effort] of RUNS) {
  if (effort) process.env.LLM_REASONING_EFFORT = effort; else delete process.env.LLM_REASONING_EFFORT;
  const t0 = Date.now();
  try {
    const plan: any = await generateLecturePlan('The Fourier transform', 'normal', null, { provider, model });
    const ms = Date.now() - t0;
    let scenes = 0, spec = 0;
    for (const m of plan.modules || []) for (const s of m.scenes || []) {
      scenes++;
      if ((s.visualElements?.length || 0) && (s.animationSequence?.length || 0) && (s.voiceover || '').trim()) spec++;
    }
    console.log(
      `${provider.padEnd(9)} ${model.slice(0,20).padEnd(21)} ${(effort||'default').padEnd(8)}` +
      `${String(Math.round(ms/1000)+'s').padStart(5)}  ${String(plan.modules.length).padStart(3)} ${String(scenes).padStart(6)}` +
      `  ${(ms/Math.max(scenes,1)/1000).toFixed(1).padStart(7)}  ${spec}/${scenes}`
    );
  } catch (e: any) {
    console.log(`${provider.padEnd(9)} ${model.slice(0,20).padEnd(21)} ${(effort||'default').padEnd(8)} FAILED: ${String(e.message).slice(0,40)}`);
  }
}
