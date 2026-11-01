import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The end-to-end tests run a production build over plain http://localhost, where the browser would
// upgrade every asset request to https and break the page. NEXT_PUBLIC_E2E=1 drops that one
// directive for such a build; a Vercel production deploy ignores the flag.
const e2e = process.env.NEXT_PUBLIC_E2E === "1" && process.env.VERCEL_ENV !== "production";

const policy = ({ img, connect }: { img: string; connect: string }) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img}`,
    "font-src 'self'",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev || e2e ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

// No third-party origins anywhere: fonts are self-hosted by next/font, the demo's QR codes are
// inline SVG, and Redis is only called from the server.
const csp = policy({ img: "'self' blob: data:", connect: "'self'" });

// The teacher app's own policy, stricter than the rest. Its pictures (FR-LES-19) are served by the API in live mode, whose origin is the
// only one added, to `img-src` for the pictures and to `connect-src` for the calls (spec 11.4). In mock mode the demo keeps a picture in the
// browser and serves it as a `data:` address, so that alone is allowed, and nothing else: no `blob:`, and none of it in a live build.
const live = process.env.NEXT_PUBLIC_API_MODE === "live";
const apiOrigin = live && process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : null;
const teacherCsp = policy({
  img: ["'self'", live ? apiOrigin : "data:"].filter(Boolean).join(" "),
  connect: ["'self'", apiOrigin].filter(Boolean).join(" "),
});

const nextConfig: NextConfig = {
  env: {
    // The teacher app's data source: "mock" (the default, a demo school in the browser) or "live" (the API). Stating the
    // default here lets a build inline it, so the adapter that is not used is left out of the bundle.
    NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock",
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
        // Where Sign out landed before there was a sign-in screen; old links and bookmarks still arrive.
        source: "/teacher/signed-out",
        destination: "/teacher/sign-in?reason=signed_out",
        permanent: false,
      },
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
        // The teacher app: pictures from the API's origin (live) or from the demo (mock), and no others.
        source: "/teacher/:path*",
        headers: [{ key: "Content-Security-Policy", value: teacherCsp }],
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
