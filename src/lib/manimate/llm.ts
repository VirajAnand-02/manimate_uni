import { generateText, Output } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { CORRECTION_PROMPT, MANIM_PROMPT, PLANNER_PROMPT, QUIZ_PROMPT } from './prompts';

type ChatMessage = { role: 'system' | 'user'; content: string };

const keyIndices: Record<string, number> = {};

function getKeysForProvider(provider: string): string[] {
  let envKeys = '';
  let envKey = '';
  const p = provider.toLowerCase();
  
  if (p === 'mistral' || p === 'mistralai') {
    envKeys = process.env.MISTRAL_API_KEYS || '';
    envKey = process.env.MISTRAL_API_KEY || '';
  } else if (p === 'openai') {
    envKeys = process.env.OPENAI_API_KEYS || '';
    envKey = process.env.OPENAI_API_KEY || '';
  } else if (p === 'anthropic') {
    envKeys = process.env.ANTHROPIC_API_KEYS || '';
    envKey = process.env.ANTHROPIC_API_KEY || '';
  } else if (p === 'google') {
    envKeys = process.env.GOOGLE_API_KEYS || '';
    envKey = process.env.GOOGLE_API_KEY || '';
  }
  
  const raw = [envKeys, envKey].join(',');
  return [...new Set(raw.split(',').map((key) => key.trim()).filter(Boolean))];
}

function nextKeyForProvider(provider: string): string {
  const all = getKeysForProvider(provider);
  if (!all.length) {
    throw new Error(`No API key configured for provider "${provider}". Please set ${provider.toUpperCase()}_API_KEY or ${provider.toUpperCase()}_API_KEYS in your environment.`);
  }
  const indexKey = provider.toLowerCase();
  const currentIndex = keyIndices[indexKey] || 0;
  const key = all[currentIndex % all.length];
  keyIndices[indexKey] = currentIndex + 1;
  return key;
}

export function resolveProviderAndModel(requestProvider?: string, requestModel?: string) {
  let provider = (requestProvider || process.env.MANIMATE_MODEL_PROVIDER || 'mistralai').trim().toLowerCase();
  let model = (requestModel || process.env.MANIMATE_MODEL || 'mistral-large-2512').trim();

  if (model.includes('/')) {
    const parts = model.split('/');
    provider = parts[0].trim().toLowerCase();
    model = parts.slice(1).join('/').trim();
  }

  if (provider === 'mistralai') provider = 'mistral';
  
  return { provider, model };
}

function getAIModel(provider: string, modelName: string) {
  const apiKey = nextKeyForProvider(provider);
  
  switch (provider) {
    case 'mistral':
      return createMistral({ apiKey })(modelName);
    case 'openai':
      return createOpenAI({ apiKey })(modelName);
    case 'anthropic':
      return createAnthropic({ apiKey })(modelName);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelName);
    default:
      throw new Error(`Unsupported LLM provider: "${provider}". Supported providers are: mistral, openai, anthropic, google.`);
  }
}

function extractJson(text: string) {
  const stripped = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

export async function aiSdkChat(
  provider: string,
  modelName: string,
  messages: ChatMessage[],
  options: { json?: boolean; timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const maxRetries = Math.max(1, Number(process.env.LLM_MAX_RETRIES || 4));
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? Number(process.env.LLM_TIMEOUT_SECONDS || 180) * 1000);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    
    try {
      const modelInstance = getAIModel(provider, modelName);
      
      const res = await generateText({
        model: modelInstance,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.2,
        output: options.json ? Output.json() : undefined,
        abortSignal: controller.signal,
      });

      const content = res.text;
      if (typeof content !== 'string' || !content.trim()) throw new Error('AI SDK returned an empty response.');
      return content;
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw new Error('Job cancelled');
      if (attempt === maxRetries - 1) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000 * (attempt + 1), 8000)));
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI SDK request failed.');
}

export async function generateLecturePlan(
  topic: string,
  depth: string,
  webContext: string | null,
  llmOptions: { provider: string; model: string },
  signal?: AbortSignal,
) {
  const content = await aiSdkChat(
    llmOptions.provider,
    llmOptions.model,
    [
      { role: 'system', content: PLANNER_PROMPT },
      { role: 'user', content: `Topic: ${topic}\nDepth Setting: ${depth}\n\n${webContext ? `WEB RESEARCH CONTEXT:\n${webContext}` : 'No web research context available.'}` },
    ],
    { json: true, signal }
  );
  return JSON.parse(extractJson(content));
}

export async function generateManimForModule(
  lecturePlan: unknown,
  moduleIndex: number,
  module: unknown,
  llmOptions: { provider: string; model: string },
  signal?: AbortSignal,
) {
  const mod = module as any;
  const mustUseIds = (mod?.scenes || []).map((s: any) => s.id);
  const content = await aiSdkChat(
    llmOptions.provider,
    llmOptions.model,
    [
      { role: 'system', content: MANIM_PROMPT },
      { role: 'user', content: JSON.stringify({
        lectureTitle: (lecturePlan as any).title,
        moduleIndex,
        MUST_USE_THESE_SCENE_IDS: mustUseIds,
        moduleDescription: mod?.description || '',
        scenes: mod?.scenes || [],
      }) },
    ],
    { json: true, signal }
  );
  return JSON.parse(extractJson(content));
}

export async function correctManimCode(
  payload: unknown,
  llmOptions: { provider: string; model: string },
  signal?: AbortSignal,
) {
  return aiSdkChat(
    llmOptions.provider,
    llmOptions.model,
    [
      { role: 'system', content: CORRECTION_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    { json: false, signal }
  );
}

export async function generateQuizQuestions(
  lecturePlan: unknown,
  difficulty: number,
  count: number,
  llmOptions: { provider: string; model: string },
  signal?: AbortSignal,
) {
  const systemPrompt = QUIZ_PROMPT
    .replace('${difficulty}', String(difficulty))
    .replace('${count}', String(count));

  const voiceovers: string[] = [];
  const plan = lecturePlan as any;
  for (const module of plan.modules || []) {
    for (const scene of module.scenes || []) {
      if (scene.voiceover) {
        voiceovers.push(`[${module.title} - ${scene.sceneTitle || scene.title || 'Scene'}]: "${scene.voiceover}"`);
      }
    }
  }

  const userMessage = `Lecture Title: ${plan.title || 'Untitled'}
Lecture Summary: ${plan.summary || ''}
Voiceover Scripts:
${voiceovers.join('\n')}`;

  const content = await aiSdkChat(
    llmOptions.provider,
    llmOptions.model,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    { json: true, signal }
  );

  return JSON.parse(extractJson(content));
}
