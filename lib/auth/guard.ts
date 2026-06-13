/**
 * guard.ts - API route auth guard + per-user rate limiter + error sanitizer
 * (SERVER ONLY)
 *
 * Auth behaviour:
 *   - Auth-optional mode: if AZURE_AD_CLIENT_ID is not configured the app runs
 *     without authentication (dev / pre-setup). Returns a synthetic dev user.
 *   - Auth-enabled mode: validates the next-auth JWT. Returns 401 when absent
 *     or invalid.
 *
 * Additional exports:
 *   rateLimit(key, max, windowMs)  - per-key in-memory sliding-window limiter
 *   safeError(e)                   - strips tokens/headers from error messages
 *
 * Usage in a route handler:
 *   const guard = await requireSession(req);
 *   if (!guard.ok) return guard.response;
 *   const { user } = guard;
 *
 * @server
 */

import { getSecret } from '@/lib/config/secrets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  name?: string;
  email?: string;
  roles: string[];
}

export type GuardResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: Response };

// ---------------------------------------------------------------------------
// isAuthEnabled
// ---------------------------------------------------------------------------

/**
 * Returns true when the app has a full auth configuration:
 *   - AZURE_AD_CLIENT_ID (the entra app registration for SSO)
 *   - AND either AUTH_SECRET (local JWT signing) or KEY_VAULT_URI (prod KV)
 */
export function isAuthEnabled(): boolean {
  const hasClientId = Boolean(process.env.AZURE_AD_CLIENT_ID);
  const hasSecret =
    Boolean(process.env.AUTH_SECRET) || Boolean(process.env.KEY_VAULT_URI);
  return hasClientId && hasSecret;
}

// ---------------------------------------------------------------------------
// requireSession
// ---------------------------------------------------------------------------

export async function requireSession(req: Request): Promise<GuardResult> {
  // Auth-optional mode: return a synthetic dev admin so the app runs pre-setup
  if (!isAuthEnabled()) {
    return {
      ok: true,
      user: { name: 'dev', roles: ['admin'] },
    };
  }

  // Auth-enabled mode: validate the next-auth JWT
  try {
    const { getToken } = await import('next-auth/jwt');

    const secret = await getSecret('AUTH-SECRET');
    if (!secret) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: 'Auth secret not configured' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }

    // next-auth/jwt expects a Next.js-compatible request object.
    // Cast to unknown first to bridge the Request -> NextRequest gap without
    // importing next/server here (keeps this file framework-portable).
    const token = await getToken({
      req: req as unknown as Parameters<typeof getToken>[0]['req'],
      secret,
    });

    if (!token) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }

    const user: AuthUser = {
      name:  typeof token.name  === 'string' ? token.name  : undefined,
      email: typeof token.email === 'string' ? token.email : undefined,
      roles: Array.isArray(token.roles)
        ? (token.roles as string[])
        : ['viewer'],
    };

    return { ok: true, user };
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Auth validation failed' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// rateLimit - per-key in-memory sliding-window rate limiter
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

const _rateBuckets = new Map<string, RateLimitBucket>();

/**
 * In-memory per-key rate limiter (sliding window, resets each windowMs).
 *
 * Returns { allowed: true } when under the limit, or { allowed: false,
 * retryAfterMs } when the key has exceeded `max` calls within `windowMs`.
 *
 * The store is module-level (survives across requests in the same Node.js
 * process / Vercel function instance). It resets on cold start, which is
 * intentional for a lightweight guard - use Redis/Upstash for distributed
 * production rate-limiting.
 *
 * @param key       Scoping key, typically user email or IP
 * @param max       Maximum calls allowed per window
 * @param windowMs  Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const bucket = _rateBuckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    // New window
    _rateBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count < max) {
    bucket.count += 1;
    return { allowed: true };
  }

  const retryAfterMs = windowMs - (now - bucket.windowStart);
  return { allowed: false, retryAfterMs };
}

// ---------------------------------------------------------------------------
// safeError - strip tokens and auth headers from error messages
// ---------------------------------------------------------------------------

/** Patterns that should never appear in a sanitized error string */
const SENSITIVE_PATTERNS: RegExp[] = [
  // Bearer tokens / Authorization headers
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // JWT-shaped strings (three base64url segments)
  /ey[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g,
  // Authorization header key-value pairs
  /authorization\s*[:=]\s*\S+/gi,
  // Azure SAS tokens & storage keys
  /sig=[A-Za-z0-9%+/]+=*/gi,
  // Generic secret= patterns
  /secret\s*[:=]\s*\S+/gi,
  // API keys that look like 32+ hex chars
  /[0-9a-f]{32,}/gi,
];

const REDACTED = '[redacted]';

/**
 * Convert any thrown value to a plain string, stripping auth tokens,
 * secrets, and sensitive header values that must never reach the client.
 *
 * @param e  Any caught value (Error, string, unknown)
 * @returns  Sanitized error string safe to include in API responses
 */
export function safeError(e: unknown): string {
  let raw: string;
  if (e instanceof Error) {
    raw = e.message;
  } else if (typeof e === 'string') {
    raw = e;
  } else {
    raw = String(e);
  }

  let sanitized = raw;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED);
  }

  return sanitized;
}
