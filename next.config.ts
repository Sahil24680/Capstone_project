import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Skip ESLint during `next build` (Vercel uses this)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
