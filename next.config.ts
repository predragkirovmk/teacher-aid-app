import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The end-to-end tests run a production build over plain http://localhost, where the browser would
// upgrade every asset request to https and break the page. NEXT_PUBLIC_E2E=1 drops that one
// directive for such a build; a Vercel production deploy ignores the flag.
const e2e = process.env.NEXT_PUBLIC_E2E === "1" && process.env.VERCEL_ENV !== "production";

// The student app's API, when it runs in live mode (NEXT_PUBLIC_API_MODE=live): its origin may be
// fetched from and may serve profile photos. Empty in mock mode, which needs no server.
const apiOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : "";
  } catch {
    return "";
  }
})();

// No third-party origins anywhere: fonts are self-hosted by next/font, the demo's QR codes are
// inline SVG, and Redis is only called from the server. The one exception is the API above.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${apiOrigin ? ` ${apiOrigin}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev || e2e ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // The live-mode smoke test builds beside the mock build, which would otherwise share .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    // Which build this is. The student app compares it with /app/build to notice a new deploy.
    NEXT_PUBLIC_APP_BUILD: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`,
  },
  experimental: {
    globalNotFound: true,
    // Phosphor ships thousands of icons from one entry; only the ones imported are compiled.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.teacheraid.education" }],
        destination: "https://teacheraid.education/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // The student app scans class QR codes, so it alone may use the camera.
        source: "/app/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
      {
        // The student app's offline worker: a new one must reach phones on their next visit.
        source: "/app-sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
