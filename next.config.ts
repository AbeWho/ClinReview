import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly + data files; let Node load it directly instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Make sure SQL migrations are deployed alongside server code (read at runtime).
  outputFileTracingIncludes: { "/**": ["./supabase/migrations/**/*"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
