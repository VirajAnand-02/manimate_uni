import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { getActiveJob } from './activeJobs';

export async function runCommand(
  jobId: string,
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
) {
  const active = getActiveJob(jobId);
  if (active?.controller.signal.aborted) throw new Error('Job cancelled');

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true }) as ChildProcessWithoutNullStreams;
    active?.children.add(child);
    let stdout = '';
    let stderr = '';
    const timeout = options.timeoutMs ? setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}`));
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
