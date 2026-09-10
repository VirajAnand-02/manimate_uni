/**
 * Run the standalone server produced by `next build`.
 *
 * `next start` does not support output: 'standalone', and the standalone server
 * resolves static assets relative to its own directory — so `.next/static` has
 * to be staged inside the bundle first. The Docker image does this with COPY
 * layers; this script is the local equivalent.
 */
import { cp, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const server = path.join(standalone, 'server.js');

const exists = async (p) => access(p).then(() => true, () => false);

if (!(await exists(server))) {
  console.error('No standalone build found. Run `npm run build` first.');
  process.exit(1);
}

await cp(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
if (await exists(path.join(root, 'public'))) {
  await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
}

spawn(process.execPath, [server], { stdio: 'inherit', cwd: standalone })
  .on('exit', (code) => process.exit(code ?? 0));
