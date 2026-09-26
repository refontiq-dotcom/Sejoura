import type { NextConfig } from "next";

// Autorise next/image à optimiser les médias servis depuis le domaine public
// du bucket Cloudflare R2 (dérivé de l'URL publique, aucune donnée secrète).
const r2PublicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "").trim();
const r2ImagePatterns: Array<{ protocol: "https"; hostname: string; pathname: string }> = [];
try {
  if (r2PublicBaseUrl) {
    const url = new URL(r2PublicBaseUrl);
    if (url.protocol === "https:") {
      r2ImagePatterns.push({ protocol: "https", hostname: url.hostname, pathname: "/**" });
    }
  }
} catch {
  // URL publique invalide : next/image restera limité aux patterns ci-dessous.
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.monkeycode-ai.live"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/**",
      },
      ...r2ImagePatterns,
    ],
    // TTL minimal des versions optimisées en cache (les objets média R2 sont
    // immuables : clé UUID ; le logo reste court côté objet lui-même).
    minimumCacheTTL: 86400,
  },
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in",
              "frame-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;