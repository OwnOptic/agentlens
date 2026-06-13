/**
 * middleware.ts - Next.js edge middleware for auth-gated routes
 *
 * Behaviour:
 *   - AUTH-OPTIONAL: when AZURE_AD_CLIENT_ID is not set (pre-setup / dev),
 *     all requests pass through unchanged. The app must run without auth.
 *   - AUTH-ENABLED: checks for a valid next-auth session token. If absent,
 *     redirects the visitor to /signin.
 *
 * The token check uses getToken() from 'next-auth/jwt' with the same secret
 * as authOptions so forged or missing cookies are rejected at the edge.
 *
 * Excluded from matching (no auth check):
 *   /signin          - the sign-in page itself
 *   /api/auth/**     - NextAuth's own API routes (callback, session, csrf...)
 *   /_next/**        - Next.js internal assets
 *   /favicon.ico
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ---------------------------------------------------------------------------
// isAuthEnabled - edge-safe (reads env vars synchronously)
// ---------------------------------------------------------------------------

function isAuthEnabled(): boolean {
  const hasClientId = Boolean(process.env.AZURE_AD_CLIENT_ID);
  const hasSecret =
    Boolean(process.env.AUTH_SECRET) || Boolean(process.env.KEY_VAULT_URI);
  return hasClientId && hasSecret;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // AUTH-OPTIONAL: pass through everything when auth is not configured
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  // Resolve the signing secret (env var only - KV resolution is not available
  // at the edge; Azure App Service expands KV references into the env before
  // the process starts, so AUTH_SECRET is always a plain string in prod).
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Misconfigured: AZURE_AD_CLIENT_ID set but AUTH_SECRET missing.
    // Redirect to /signin so the user sees a clear state rather than a crash.
    return NextResponse.redirect(new URL('/signin', req.url));
  }

  const token = await getToken({ req, secret });

  if (!token) {
    const signinUrl = new URL('/signin', req.url);
    // Preserve the originally requested path so the sign-in page can redirect
    // back after authentication (callbackUrl query param is standard NextAuth).
    signinUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signinUrl);
  }

  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     *   /signin         - sign-in page
     *   /api/auth/**    - NextAuth API routes
     *   /_next/**       - Next.js static assets / RSC payloads
     *   /favicon.ico
     */
    '/((?!signin|api/auth|_next|favicon\\.ico).*)',
  ],
};
