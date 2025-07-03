import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone', // Add this for optimized Docker builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA || 'development',
    NEXT_PUBLIC_GIT_COMMIT_DATE: process.env.GIT_COMMIT_DATE || new Date().toISOString(),
  },
};

export default nextConfig;
