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

/**
 * Keeps the head and tail of a stream and drops the middle.
 *
 * A Manim traceback puts the useful context at both ends: the invocation banner
 * at the top, the actual exception at the bottom. An unbounded string here was
 * both a memory risk and a token cost — this text is fed to the corrector LLM.
 */
const HEAD_BYTES = 4000;
const TAIL_BYTES = 8000;

class CappedBuffer {
  private head = '';
  private tail = '';
  private dropped = 0;

  push(chunk: string) {
    if (this.head.length < HEAD_BYTES) {
      const room = HEAD_BYTES - this.head.length;
      this.head += chunk.slice(0, room);
      chunk = chunk.slice(room);
      if (!chunk) return;
    }
    this.tail += chunk;
    if (this.tail.length > TAIL_BYTES) {
      const excess = this.tail.length - TAIL_BYTES;
      this.tail = this.tail.slice(excess);
      this.dropped += excess;
    }
  }

  text() {
    if (!this.dropped) return this.head + this.tail;
    return this.head + '\n... [' + this.dropped + ' bytes omitted] ...\n' + this.tail;
  }
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
    // Bounded: generated Python can print in a loop, and a failing render's
    // stderr is forwarded verbatim to the corrector LLM as input tokens.
    const stdoutBuf = new CappedBuffer();
    const stderrBuf = new CappedBuffer();
    const timeout = options.timeoutMs ? setTimeout(() => {
      child.kill('SIGTERM');
      // Escalate if it ignores SIGTERM, otherwise a wedged render holds the slot.
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000).unref();
      reject(new Error(`Command timed out after ${Math.round(options.timeoutMs! / 1000)}s: ${command} ${args.join(' ')}`));
    }, options.timeoutMs) : null;

    child.stdout.on('data', (chunk) => stdoutBuf.push(chunk.toString()));
    child.stderr.on('data', (chunk) => stderrBuf.push(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      active?.children.delete(child);
      const stdout = stdoutBuf.text();
      const stderr = stderrBuf.text();
      if (active?.controller.signal.aborted) reject(new Error('Job cancelled'));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command failed (${code}): ${command} ${args.join(' ')}\n${stderr || stdout}`));
    });
  });
}
