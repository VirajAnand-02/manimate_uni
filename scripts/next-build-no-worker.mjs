import { spawn } from 'child_process';
import { rm, access } from 'fs/promises';
import path from 'path';

/**
 * Directories that must never end up inside .next/standalone.
 *
 * `output: 'standalone'` traces the Manim virtualenv into the bundle — it sits
 * in the project root and ships JupyterLab, whose package.json files the tracer
 * follows, dragging in ~5.7GB across 64k files. outputFileTracingExcludes does
 * not stop it (those keys are matched against routes, and this trace happens
 * outside a route context), so the bundle is pruned after the fact instead.
 *
 * Nothing here belongs in the runtime image regardless: the container builds its
 * own venv at /opt/manim-env, and Docker never even sees this one because
 * .dockerignore keeps it out of the build context.
 */
const PRUNE_FROM_STANDALONE = ['manim-env', 'generations', 'docs', 'supabase'];

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PRIVATE_BUILD_WORKER: '0',
  },
  windowsHide: true,
});

child.on('exit', async (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if (code === 0) {
    const standalone = path.join(process.cwd(), '.next', 'standalone');
    const present = await access(standalone).then(() => true, () => false);
    if (present) {
      for (const dir of PRUNE_FROM_STANDALONE) {
        const target = path.join(standalone, dir);
        if (await access(target).then(() => true, () => false)) {
          await rm(target, { recursive: true, force: true });
          console.log(`[build] pruned ${dir}/ from .next/standalone`);
        }
      }
    }
  }

  process.exit(code ?? 1);
});
