import type { NextConfig } from 'next';

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
  // onnxruntime-node loads its native runtime with a computed path, which file
  // tracing cannot follow — without this the standalone build starts fine and
  // then fails at the first voiceover.
  //
  // (There is no matching outputFileTracingExcludes: it does not govern what
  // gets copied here — see the prune step in scripts/next-build-no-worker.mjs.)
  outputFileTracingIncludes: {
    '/api/**': [
      './node_modules/onnxruntime-node/bin/**',
      './node_modules/@huggingface/transformers/**',
      './node_modules/kokoro-js/**',
      './node_modules/phonemizer/**',
    ],
  },
  serverExternalPackages: [
    'kokoro-js',
    '@huggingface/transformers',
    'onnxruntime-node',
    'phonemizer',
    'tus-js-client',
  ],
};

export default nextConfig;
