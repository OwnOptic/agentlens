const isDev = process.env.NODE_ENV !== 'production';

// Next.js dev-mode (React Fast Refresh / HMR) evaluates strings as JavaScript,
// which requires 'unsafe-eval'. We allow it ONLY in development so the client's
// `npm run dev` quick-start works; production keeps the strict policy below.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output for Azure App Service deployment
  // Produces .next/standalone with a self-contained Node.js server.
  // Copy .next/static and public into the standalone folder before deploying.
  output: 'standalone',
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  experimental: {
    typedRoutes: true,
  },
  // Security headers applied to all responses
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Content Security Policy
          // - 'self': all same-origin resources
          // - 'unsafe-inline': required for Tailwind CSS style attributes
          // - data: for inline SVG/images used by Recharts and UI components
          // - blob: for chart canvas exports
          // - *.azurewebsites.net: Azure App Service self-referencing calls
          // - fonts.googleapis.com / fonts.gstatic.com: if Google Fonts added later
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.azurewebsites.net https://*.azure.com https://*.microsoft.com",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
          // Prevent this app from being embedded in iframes (clickjacking)
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME-type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer policy: send origin only for same-origin requests; omit for cross-origin
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Disable browser features not needed by this app
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Force HTTPS for future visits (1 year, include subdomains)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
