import 'dotenv/config';
import { generateText } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';

const mistralKey = (process.env.MISTRAL_API_KEYS || '').split(',')[1];
const groqKey = process.env.GROQ_API_KEY || '';
const nvKey = process.env.NVIDIA_API_KEY || '';

const targets: [string, string, any][] = [
  ['mistral', 'ministral-14b-latest', createMistral({ apiKey: mistralKey })('ministral-14b-latest')],
  ['groq', 'gpt-oss-120b', createGroq({ apiKey: groqKey })('openai/gpt-oss-120b')],
  ['groq', 'gpt-oss-20b', createGroq({ apiKey: groqKey })('openai/gpt-oss-20b')],
  ['nvidia', 'nemotron-3-super-120b', createOpenAI({ apiKey: nvKey, baseURL: 'https://integrate.api.nvidia.com/v1' }).chat('nvidia/nemotron-3-super-120b-a12b')],
  ['nvidia', 'gpt-oss-20b', createOpenAI({ apiKey: nvKey, baseURL: 'https://integrate.api.nvidia.com/v1' }).chat('openai/gpt-oss-20b')],
  ['nvidia', 'gemma-4-31b-it', createOpenAI({ apiKey: nvKey, baseURL: 'https://integrate.api.nvidia.com/v1' }).chat('google/gemma-4-31b-it')],
];

console.log('provider  model                    time   out_tok  reason_tok   tok/s');
console.log('-'.repeat(70));
for (const [p, name, model] of targets) {
  const t0 = Date.now();
  try {
    const res = await generateText({
      model,
      messages: [{ role: 'user', content: 'Write exactly 300 words explaining the Fourier transform. Plain prose.' }],
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(120000),
    });
    const ms = Date.now() - t0;
    const u: any = res.usage ?? {};
    const out = u.outputTokens ?? u.completionTokens ?? 0;
    const reason = u.reasoningTokens ?? 0;
    console.log(`${p.padEnd(9)} ${name.padEnd(24)} ${String(Math.round(ms/1000)+'s').padStart(5)} ${String(out).padStart(9)} ${String(reason).padStart(11)} ${String(Math.round(out/(ms/1000))).padStart(7)}`);
  } catch (e: any) {
    console.log(`${p.padEnd(9)} ${name.padEnd(24)} ${String(Math.round((Date.now()-t0)/1000)+'s').padStart(5)}   FAILED: ${String(e.message).slice(0,40)}`);
  }
}
