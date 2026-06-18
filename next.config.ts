import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions default to a 1MB request-body limit, which rejects larger
    // photo uploads (e.g. iPhone camera images) BEFORE the action runs — that
    // surfaced as a "Server Components render" crash on the sponsors/avatar
    // upload. Raise it so multi-MB photos are accepted (we still validate
    // size/type inside the action and compress client-side).
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    remotePatterns: [
      // Country flags. We use `unoptimized` on the <Image>, but allowlist anyway.
      { protocol: "https", hostname: "flagcdn.com" },
      // Supabase Storage public objects (user avatars).
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
