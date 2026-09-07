/**
 * Downloads the Kokoro ONNX weights at image-build time.
 *
 * Without this the first render pays a ~300MB HuggingFace download inside the
 * request path, and fails outright on a host with no egress to huggingface.co.
 */
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

try {
  const { KokoroTTS } = await import('kokoro-js');
  console.log(`[prewarm] fetching ${MODEL} ...`);
  await KokoroTTS.from_pretrained(MODEL, {
    dtype: process.env.KOKORO_DTYPE || 'q8',
    device: process.env.KOKORO_DEVICE || 'cpu',
  });
  console.log('[prewarm] Kokoro weights cached.');
} catch (error) {
  // Don't fail the image build over this — the model will download lazily on
  // first use instead.
  console.warn('[prewarm] skipped:', error?.message ?? error);
}
