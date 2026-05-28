/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",   value: "on" },
  { key: "X-Frame-Options",          value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options",   value: "nosniff" },
  { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",       value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://media.api-sports.io https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.api-sports.io" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks",
      },
    ];
  },
  async headers() {
    return [
      // Service worker — must be served fresh and with correct scope
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type",          value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control",         value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Security headers for all routes
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
