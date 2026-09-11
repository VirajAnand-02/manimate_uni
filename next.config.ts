import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Packages kept out of the server bundle: native binaries and dynamic requires
 * that webpack cannot follow. They must exist in node_modules at runtime.
 */
const EXTERNAL_PACKAGES = [
  'kokoro-js',
  '@huggingface/transformers',
  'onnxruntime-node',
  'phonemizer',
  'tus-js-client',
];

/**
 * Every package those depend on, transitively.
 *
 * outputFileTracingIncludes copies the files a glob matches — it does *not* go
 * on to trace that package's own dependencies. Listing only the roots produced a
 * standalone bundle that booted cleanly and then failed at the first voiceover
 * with "Cannot find package 'onnxruntime-common'". The real closure is ~39
 * packages (onnxruntime-common, onnxruntime-web, sharp, protobufjs, flatbuffers,
 * tar, global-agent …), so it is computed here rather than hand-maintained.
 *
 * Resolved against the node_modules of whichever machine is building, so the
 * Linux container contributes its own platform-specific binaries.
 */
function dependencyClosure(roots: string[]): string[] {
  const found = new Set<string>();

  const visit = (name: string) => {
    if (found.has(name)) return;
    let pkg: { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    try {
      pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'node_modules', name, 'package.json'), 'utf8'),
      );
    } catch {
      return; // Optional or platform-specific, and not installed here.
    }
    found.add(name);
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep);
    // sharp and onnxruntime ship native binaries as optional, per-platform
    // packages — exactly the ones that must not be dropped.
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) visit(dep);
  };

  roots.forEach(visit);
  return [...found];
}

const tracedRuntimeDeps = dependencyClosure(EXTERNAL_PACKAGES).map(
  (name) => `./node_modules/${name}/**`,
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone with only the traced dependencies, so the runtime
  // image carries a fraction of node_modules and starts faster.
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: EXTERNAL_PACKAGES,
  // (There is no matching outputFileTracingExcludes: it does not govern what
  // gets copied here — see the prune step in scripts/next-build-no-worker.mjs.)
  outputFileTracingIncludes: {
    '/api/**': tracedRuntimeDeps,
  },
};

export default nextConfig;
