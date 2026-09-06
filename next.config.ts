import type { NextConfig } from "next";

const turnstileEnabled = Boolean(
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim(),
);
const turnstileSource = turnstileEnabled
  ? " https://challenges.cloudflare.com"
  : "";
const legacyAndroidLocalOrigin =
  " https://life-space-canary.yoyomibaobao.workers.dev";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${turnstileSource}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${turnstileSource}`,
  // The signed RC-to-production Android upgrade loads one APK-bundled iframe
  // under the previous WebView origin to copy local-only IndexedDB records.
  `frame-src 'self'${turnstileSource}${legacyAndroidLocalOrigin}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const searchIndexingEnabled = process.env.SEARCH_INDEXING_ENABLED === "true";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), geolocation=(), microphone=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: contentSecurityPolicy });
    }

    if (!searchIndexingEnabled) {
      headers.push({
        key: "X-Robots-Tag",
        value: "noindex, nofollow, noarchive",
      });
    }

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
