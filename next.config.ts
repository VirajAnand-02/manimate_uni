import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    'kokoro-js',
    '@huggingface/transformers',
    'onnxruntime-node',
    'phonemizer',
  ],
};

export default nextConfig;
