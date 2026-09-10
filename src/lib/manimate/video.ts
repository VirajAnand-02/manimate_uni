import fs from 'fs/promises';
import path from 'path';
import { runCommand } from './process';

function ffmpeg() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function ffprobe() {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

// ffmpeg had no timeout at all: a wedged encode (a long tpad re-encode, say)
// would block the job forever, since only user cancellation could kill it.
const FFPROBE_TIMEOUT_MS = 30_000;

function ffmpegTimeoutMs() {
  return Math.max(60, Number(process.env.FFMPEG_TIMEOUT_SECONDS || 900)) * 1000;
}

/**
 * x264 defaults to `medium`. The tail-padding re-encode below rewrites an entire
 * scene just to freeze its last frame, and `veryfast` cuts that substantially for
 * a few percent of file size on synthetic Manim footage.
 */
function x264Preset() {
  return process.env.FFMPEG_X264_PRESET || 'veryfast';
}

async function getMediaDuration(jobId: string, file: string): Promise<number | null> {
  try {
    const { stdout } = await runCommand(jobId, ffprobe(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      file,
    ], { timeoutMs: FFPROBE_TIMEOUT_MS });
    const data = JSON.parse(stdout);
    const duration = Number(data?.format?.duration);
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

/** True when the file carries at least one audio stream. */
export async function hasAudioStream(jobId: string, file: string): Promise<boolean> {
  try {
    const { stdout } = await runCommand(jobId, ffprobe(), [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'json',
      file,
    ], { timeoutMs: FFPROBE_TIMEOUT_MS });
    return Boolean(JSON.parse(stdout)?.streams?.length);
  } catch {
    return false;
  }
}

/**
 * Give a silent scene an empty audio track.
 *
 * The concat demuxer with `-c copy` needs every input to agree on stream layout.
 * A lecture where some scenes have voiceover and some do not produced inputs with
 * differing stream counts, which concat either rejects or silently truncates.
 * Video is copied, so this only costs an AAC encode of silence.
 */
export async function addSilentAudio(jobId: string, video: string, output: string) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await runCommand(jobId, ffmpeg(), [
    '-y',
    '-i', video,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    output,
  ], { timeoutMs: ffmpegTimeoutMs() });
  return output;
}

/**
 * Concatenate with stream copy in a single pass.
 *
 * This used to run twice — once per module, then once over the module files —
 * which wrote the whole video to disk twice for no benefit, since the per-module
 * files were never used for anything else.
 */
async function concat(jobId: string, inputs: string[], output: string, faststart = false) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const listPath = path.join(path.dirname(output), `${path.basename(output)}.txt`);
  const body = inputs.map((file) => `file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listPath, body, 'utf-8');

  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy'];
  // Puts the moov atom up front so the browser can start playing before the whole
  // file has arrived — this is the object that gets streamed from Storage.
  if (faststart) args.push('-movflags', '+faststart');
  args.push(output);

  await runCommand(jobId, ffmpeg(), args, { timeoutMs: ffmpegTimeoutMs() });
  return output;
}

export async function muxVoiceover(jobId: string, video: string, audio: string, output: string) {
  await fs.mkdir(path.dirname(output), { recursive: true });

  const [videoDuration, audioDuration] = await Promise.all([
    getMediaDuration(jobId, video),
    getMediaDuration(jobId, audio),
  ]);

  if (videoDuration == null || audioDuration == null) {
    // Fallback to shortest if ffprobe fails
    await runCommand(jobId, ffmpeg(), [
      '-y',
      '-i', video,
      '-i', audio,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      output,
    ], { timeoutMs: ffmpegTimeoutMs() });
    return output;
  }

  const args = ['-y', '-i', video, '-i', audio];

  if (audioDuration > videoDuration) {
    // Extend video by freezing last frame to match audio length
    const padDuration = audioDuration - videoDuration;
    args.push('-vf', `tpad=stop_mode=clone:stop_duration=${padDuration}`);
    args.push('-c:v', 'libx264', '-preset', x264Preset(), '-c:a', 'aac');
  } else if (videoDuration > audioDuration) {
    // Extend audio with silence to match video length
    const padDuration = videoDuration - audioDuration;
    args.push('-af', `apad=pad_dur=${padDuration}`);
    args.push('-c:v', 'copy', '-c:a', 'aac');
  } else {
    // Durations match (or close enough) — copy video, encode audio
    args.push('-c:v', 'copy', '-c:a', 'aac');
  }

  args.push(output);
  await runCommand(jobId, ffmpeg(), args, { timeoutMs: ffmpegTimeoutMs() });
  return output;
}

/** Concatenate every scene, in module order, into the final deliverable. */
export async function stitchFinal(jobId: string, moduleVideos: Map<number, string[]>, baseDir: string) {
  const ordered = [...moduleVideos.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, videos]) => videos);
  if (!ordered.length) throw new Error('No rendered videos to stitch.');
  return concat(jobId, ordered, path.join(baseDir, 'video.mp4'), true);
}
