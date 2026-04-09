import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse out of the Turbopack/webpack bundle so it runs as native CJS
  serverExternalPackages: ["pdf-parse"],
  turbopack: {},
};

export default nextConfig;
