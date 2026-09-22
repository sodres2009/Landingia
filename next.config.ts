import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Build autónomo (server.js + node_modules mínimos) — é o formato que o
  // runtime Node da Gaudencio-Cloud corre sem precisar de npm install.
  output: 'standalone',
};

export default nextConfig;
