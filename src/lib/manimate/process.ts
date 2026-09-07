import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { getActiveJob } from './activeJobs';

/**
 * Environment handed to child processes.
 *
 * Manim runs LLM-generated Python, so the child must not inherit the server's
 * environment — that would hand every LLM provider key and the Supabase service
 * role key to unreviewed generated code. Only what the toolchain needs is passed.
 */
function childEnv(): Record<string, string> {
  const passthrough = [
    'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'COMSPEC',
    'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
    'HF_HOME', 'XDG_CACHE_HOME',
  ];
  const env: Record<string, string> = {};
  for (const key of passthrough) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // Manim's own settings are safe to forward.
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith('MANIM_') || key.startsWith('FFMPEG_') || key.startsWith('FFPROBE_')) {
      env[key] = value;
    }
  }
  return env;
}

export async function runCommand(
  jobId: string,
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
) {
  const active = getActiveJob(jobId);
  if (active?.controller.signal.aborted) throw new Error('Job cancelled');

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      env: childEnv() as NodeJS.ProcessEnv,
    }) as ChildProcessWithoutNullStreams;
    active?.children.add(child);
    let stdout = '';
    let stderr = '';
    const timeout = options.timeoutMs ? setTimeout(() => {
      child.kill('SIGTERM');
      // Escalate if it ignores SIGTERM, otherwise a wedged render holds the slot.
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000).unref();
      reject(new Error(`Command timed out after ${Math.round(options.timeoutMs! / 1000)}s: ${command} ${args.join(' ')}`));
    }, options.timeoutMs) : null;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      active?.children.delete(child);
      if (active?.controller.signal.aborted) reject(new Error('Job cancelled'));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed (${code}): ${command} ${args.join(' ')}\n${stderr || stdout}`));
    });
  });
}
