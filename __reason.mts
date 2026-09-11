import 'dotenv/config';
import { generateText, Output } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { OUTLINE_PROMPT } from './src/lib/manimate/prompts.ts';

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY || '' });

for (const model of ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']) {
  for (const effort of ['default', 'low', 'medium']) {
    const t0 = Date.now();
    try {
      const res = await generateText({
        model: groq(model),
        messages: [
          { role: 'system', content: OUTLINE_PROMPT },
          { role: 'user', content: 'Topic: The Fourier transform\nDepth Setting: normal\n\nNo web research context available.' },
        ],
        temperature: 0.2,
        output: Output.json(),
        ...(effort === 'default' ? {} : { providerOptions: { groq: { reasoningEffort: effort } } }),
        abortSignal: AbortSignal.timeout(120000),
      });
      const ms = Date.now() - t0;
      const u: any = res.usage ?? {};
      const out = u.outputTokens ?? 0;
      const reason = u.reasoningTokens ?? 0;
      let mods = 0;
      try { mods = (JSON.parse(res.text).modules || []).length; } catch {}
      console.log(`${model.padEnd(20)} effort=${effort.padEnd(8)} ${String(Math.round(ms/1000)+'s').padStart(4)}  out:${String(out).padStart(5)}  reasoning:${String(reason).padStart(5)}  modules:${mods}`);
    } catch (e: any) {
      console.log(`${model.padEnd(20)} effort=${effort.padEnd(8)} FAILED: ${String(e.message).slice(0, 60)}`);
    }
  }
}
