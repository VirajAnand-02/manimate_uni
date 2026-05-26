import fs from 'fs/promises';
import path from 'path';
import { runCommand } from './process';

function ffmpeg() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function ffprobe() {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

async function getMediaDuration(jobId: string, file: string): Promise<number | null> {
  try {
    const { stdout } = await runCommand(jobId, ffprobe(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      file,
    ]);
    const data = JSON.parse(stdout);
    const duration = Number(data?.format?.duration);
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

async function concat(jobId: string, inputs: string[], output: string) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const listPath = path.join(path.dirname(output), `${path.basename(output)}.txt`);
  const body = inputs.map((file) => `file '${file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listPath, body, 'utf-8');
  await runCommand(jobId, ffmpeg(), ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output]);
  return output;
}

export async function muxVoiceover(jobId: string, video: string, audio: string, output: string) {
  await fs.mkdir(path.dirname(output), { recursive: true });

  const videoDuration = await getMediaDuration(jobId, video);
  const audioDuration = await getMediaDuration(jobId, audio);

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
    ]);
    return output;
  }

  const args = ['-y', '-i', video, '-i', audio];

  if (audioDuration > videoDuration) {
    // Extend video by freezing last frame to match audio length
    const padDuration = audioDuration - videoDuration;
    args.push('-vf', `tpad=stop_mode=clone:stop_duration=${padDuration}`);
    args.push('-c:v', 'libx264', '-c:a', 'aac');
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
  await runCommand(jobId, ffmpeg(), args);
  return output;
}

export async function stitchFinal(jobId: string, moduleVideos: Map<number, string[]>, baseDir: string) {
  const stitched: string[] = [];
  for (const [moduleIndex, videos] of [...moduleVideos.entries()].sort((a, b) => a[0] - b[0])) {
    if (!videos.length) continue;
    const moduleOut = path.join(baseDir, `module_${moduleIndex}_full.mp4`);
    stitched.push(await concat(jobId, videos, moduleOut));
  }
  if (!stitched.length) throw new Error('No rendered videos to stitch.');
  return concat(jobId, stitched, path.join(baseDir, 'video.mp4'));
}
