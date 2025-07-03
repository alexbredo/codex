import type {NextConfig} from 'next';
import { execSync } from 'child_process';

let commitSha = 'development';
let commitDate = new Date().toISOString();

try {
  // Use git to get the latest commit hash and date
  commitSha = execSync('git rev-parse --short HEAD').toString().trim();
  // Using %cI for ISO 8601 format, which is safe for new Date()
  commitDate = execSync('git log -1 --format=%cI').toString().trim();
} catch (e) {
  console.log('Could not get git info, using defaults');
}


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
    NEXT_PUBLIC_GIT_COMMIT_SHA: commitSha,
    NEXT_PUBLIC_GIT_COMMIT_DATE: commitDate,
  },
};

export default nextConfig;
