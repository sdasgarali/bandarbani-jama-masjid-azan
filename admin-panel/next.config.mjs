/** @type {import('next').NextConfig} */

// The backend runs on the Hostinger VPS over plain HTTP. Because the admin panel is
// served from Vercel over HTTPS, the browser must not call http:// directly (mixed content).
// Instead we proxy same-origin /api/v1/* requests through Vercel to the VPS backend.
// Set BACKEND_ORIGIN as a Vercel env var to change the target without code changes.
const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN || "http://187.124.74.175:4100";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
