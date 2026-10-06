import type { NextConfig } from "next";

/**
 * Baseline hardening applied to every response.
 *
 * `X-Robots-Tag: noindex` is deliberately NOT global. The public reader pages
 * must remain indexable, so the noindex header is scoped to the non-public
 * surfaces only. See the seo skill and AGENTS.md section 16.
 */
/**
 * Content Security Policy.
 *
 * This is the XSS backstop: even if stored rich text, a query parameter or a
 * future dependency let a payload through the sanitizer and React's escaping,
 * the browser has no execution primitive to hand it.
 *
 * `'unsafe-inline'` in `script-src` is required by Next.js, which inlines its
 * bootstrap and the RSC flight payload into the initial HTML. It is scoped to
 * the document, is not a grant to remote origins (`default-src 'self'`), and
 * cannot be reached by injected markup from the database. `script-src-elem`
 * drops `strict-dynamic` so this policy is not bypassable by a script URL an
 * attacker could guess.
 *
 * `'unsafe-eval'` is granted only when Next is running in development mode.
 * React's development runtime calls `eval()` to rebuild call stacks and the
 * dev overlay needs it too; React states it never uses `eval()` in production,
 * so the production policy keeps exactly the directives above and never gains
 * an execution primitive. Verified both ways: `next dev` sends the eval grant,
 * `next start` does not.
 *
 * AGENTS.md section 10, "sanitize on render again as defence in depth".
 */
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  process.env.NODE_ENV === "development" ? "'unsafe-eval'" : null,
]
  .filter(Boolean)
  .join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  // `blob:` is required by the image optimizer for the object URL it hands back.
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  scriptSrc,
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const globalSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // `frame-ancestors` supersedes X-Frame-Options for CSP-aware browsers and is
  // the only one of the two that also covers nested frames. Both are set.
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Cross-origin isolation of the browsing context. The app embeds no
  // cross-origin frames and loads no third-party scripts, so denying them is
  // free: `null` is the default, stated explicitly because it is load-bearing.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Deny powerful legacy features. Without these a future dependency that
  // reaches for them would find them available.
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/**
 * HSTS.
 *
 * Emitted over plain HTTP during development it is ignored by browsers, so it
 * is safe to send unconditionally; that keeps the header set identical between
 * environments and means a production build cannot silently lose it. It must
 * not be sent with `preload`, because that commitment is not reversible by
 * editing this file once a browser has cached it.
 */
const hsts = { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" };

/** Non-public surfaces must never be indexed. */
const nonPublicHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Native/server-only packages are resolved at runtime in server code and must
  // not be bundled: Argon2 for password hashing, sharp for image re-encoding.
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...globalSecurityHeaders, hsts],
      },
      {
        source: "/admin/:path*",
        headers: nonPublicHeaders,
      },
    ];
  },
};

export default nextConfig;
