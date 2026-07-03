import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  /**
   * Security headers (item 26). Applied to every response Next.js serves.
   * - X-Content-Type-Options: nosniff — blocks MIME-sniffing.
   * - X-Frame-Options: DENY — blocks clickjacking (no iframing).
   * - Referrer-Policy: strict-origin-when-cross-origin — referrer is sent
   *   only on same-origin requests; cross-origin requests get the origin
   *   only (no path/query).
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
