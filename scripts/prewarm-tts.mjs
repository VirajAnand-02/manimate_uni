/**
 * Downloads the Kokoro ONNX weights at image-build time.
 *
 * Without this the first render pays a ~300MB HuggingFace download inside the
 * request path, and fails outright on a host with no egress to huggingface.co.
 *
 * The cache directory is set explicitly because @huggingface/transformers v3
 * ignores HF_HOME and defaults to a .cache folder inside its own node_modules
 * directory — which the runtime image neither copies nor makes writable. This
 * must resolve to the same path as modelCacheDir() in src/lib/manimate/tts.ts.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

const cacheDir =
  process.env.MANIMATE_MODEL_CACHE?.trim() ||
  process.env.HF_HOME?.trim() ||
  path.join(process.env.MANIMATE_WORK_DIR?.trim() || path.join(os.tmpdir(), 'manimate'), 'model-cache');

try {
  await fs.mkdir(cacheDir, { recursive: true });

  const { env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;

  const { KokoroTTS } = await import('kokoro-js');
  console.log(`[prewarm] fetching ${MODEL} into ${cacheDir} ...`);
  await KokoroTTS.from_pretrained(MODEL, {
    dtype: process.env.KOKORO_DTYPE || 'q8',
    device: process.env.KOKORO_DEVICE || 'cpu',
  });

  const entries = await fs.readdir(cacheDir).catch(() => []);
  if (!entries.length) throw new Error(`nothing was written to ${cacheDir}`);
  console.log(`[prewarm] Kokoro weights cached (${entries.length} entries).`);
} catch (error) {
  // Don't fail the image build over this — the model will download lazily on
  // first use instead.
  console.warn('[prewarm] skipped:', error?.message ?? error);
}
