import type { NextConfig } from "next";

// The Express API (server/). Pages call it server-side; the browser reaches it through the
// /api rewrite below, so any client-side calls stay on this site's origin.
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  experimental: {
    // Photo uploads (several at up to 8 MB each) and guest spreadsheets go through Server Actions.
    serverActions: { bodySizeLimit: "40mb" },
  },
  async headers() {
    return [
      {
        // The browser must always check for a new service worker.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
