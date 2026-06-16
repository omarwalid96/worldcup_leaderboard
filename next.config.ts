import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Country flags. We use `unoptimized` on the <Image>, but allowlist anyway.
      { protocol: "https", hostname: "flagcdn.com" },
    ],
  },
};

export default nextConfig;
