import fs from 'fs/promises';
import path from 'path';

let ttsPromise: Promise<any> | null = null;

function sanitizeBase(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `tts_${Date.now()}`;
}

async function getTts() {
  if (!ttsPromise) {
    const runtimeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    ttsPromise = runtimeImport('kokoro-js').then(({ KokoroTTS }) => KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: (process.env.KOKORO_DTYPE as any) || 'q8',
      device: (process.env.KOKORO_DEVICE as any) || 'cpu',
    }));
  }
  return ttsPromise;
}

export async function generateTtsAudio(
  text: string,
  options: { voice?: string; fileBase?: string; outputDir?: string } = {},
) {
  if (!text.trim()) throw new Error('text is required');
  const tts = await getTts();
  const outputDir = options.outputDir || path.join(process.cwd(), 'generations', 'tts');
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${sanitizeBase(options.fileBase || 'voiceover')}.wav`);
  const audio = await tts.generate(text, {
    voice: (options.voice || process.env.KOKORO_VOICE || 'af_heart') as any,
  });
  audio.save(filePath);
  return { file_path: filePath, sample_rate: 24000, mime_type: 'audio/wav' };
}
