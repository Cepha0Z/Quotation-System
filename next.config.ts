import type { NextConfig } from 'next';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

const nextConfig: NextConfig = {
  // Keep the hosted Sites build server-rendered. Capacitor gets a separate
  // static export that can be copied into the native application.
  output: isCapacitorBuild ? 'export' : undefined,
};

export default nextConfig;
