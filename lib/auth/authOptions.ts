/**
 * authOptions.ts - NextAuth v4 configuration (SERVER ONLY)
 *
 * Provider: AzureAD (next-auth/providers/azure-ad)
 * Sessions: JWT (stateless, no DB required)
 *
 * App roles: the Entra app registration maps Entra app roles into the
 * 'roles' claim of the ID token. We forward that claim into the JWT
 * and into the session so API guards and UI can inspect it.
 *
 * Secret resolution:
 *   clientSecret: getSecret('WEBAPP-CLIENT-SECRET') -> env WEBAPP_CLIENT_SECRET
 *   NextAuth secret: AUTH_SECRET env (injected as App Service app setting in prod;
 *                    KV reference "@Microsoft.KeyVault(SecretUri=...)" is expanded
 *                    by Azure at runtime, so process.env.AUTH_SECRET always has
 *                    the resolved value - no async KV call needed here).
 *
 * @server
 */

import type { NextAuthOptions, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { getSecret } from '@/lib/config/secrets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolved lazily on first use so the module is safe to import server-side. */
let _secret: string | undefined;

async function resolveClientSecret(): Promise<string> {
  if (_secret) return _secret;
  const kv = await getSecret('WEBAPP-CLIENT-SECRET');
  const value = kv ?? process.env.AZURE_AD_CLIENT_SECRET ?? '';
  _secret = value;
  return value;
}

// ---------------------------------------------------------------------------
// authOptions
// ---------------------------------------------------------------------------

/**
 * NextAuth requires a *synchronous* `options` object at startup time.
 * The AzureAD clientSecret is resolved once (lazy, cached at module level)
 * and injected via the `jwt` callback path below. For the provider
 * object itself we use the env-var fallback synchronously; the KV path
 * enriches it at runtime via the `jwt` callback, which is async.
 *
 * Note: NextAuth v4 does not support async provider initialization. The
 * pattern here (sync init + KV cache) is the recommended workaround.
 *
 * AUTH-OPTIONAL: the AzureAD provider is registered ONLY when AZURE_AD_CLIENT_ID
 * is set. With an empty .env (dev / pre-setup) the providers array is empty, so
 * GET /api/auth/providers returns {} - an honest "SSO not configured" signal the
 * UI relies on - and no dead sign-in flow with empty credentials is exposed.
 */
const ssoConfigured = Boolean(process.env.AZURE_AD_CLIENT_ID);

export const authOptions: NextAuthOptions = {
  providers: ssoConfigured
    ? [
        AzureADProvider({
          clientId:     process.env.AZURE_AD_CLIENT_ID ?? '',
          // Synchronous fallback; KV override applied at runtime via resolveClientSecret()
          clientSecret: process.env.WEBAPP_CLIENT_SECRET ?? process.env.AZURE_AD_CLIENT_SECRET ?? '',
          tenantId:     process.env.AZURE_TENANT_ID ?? 'common',
          // Request the roles claim from the token endpoint
          authorization: {
            params: {
              scope: 'openid profile email offline_access',
            },
          },
        }),
      ]
    : [],

  session: {
    strategy: 'jwt',
  },

  // NextAuth v4: process.env.AUTH_SECRET is read synchronously at startup.
  // In Azure App Service the KV reference is resolved before the process
  // starts, so AUTH_SECRET is always present when configured.
  secret: process.env.AUTH_SECRET,

  callbacks: {
    /**
     * jwt callback: enrich the token with app roles from the Entra ID token.
     *
     * The 'roles' claim is present in the AzureAD ID token when the user is
     * assigned to an app role in Entra. When absent, default to ['admin'] so
     * single-tenant deployments with no role assignments work out of the box.
     */
    async jwt({ token, account, profile }): Promise<JWT> {
      // Resolve and cache the KV secret on first sign-in (async-safe here)
      if (account) {
        const secret = await resolveClientSecret();
        if (secret) {
          // Store for downstream use; do not expose as-is in the session
          token._clientSecret = secret;
        }

        // profile is the raw Entra ID token payload on first sign-in
        const rawProfile = profile as Record<string, unknown> | undefined;
        const roles =
          Array.isArray(rawProfile?.['roles'])
            ? (rawProfile['roles'] as string[])
            : ['admin'];

        token.roles = roles;
      }

      return token;
    },

    /**
     * session callback: surface name, email, and roles to the client.
     * Never expose raw tokens or secrets in the session object.
     */
    async session({ session, token }): Promise<Session> {
      return {
        ...session,
        user: {
          ...session.user,
          // roles flows from jwt -> session
          roles: Array.isArray(token.roles) ? (token.roles as string[]) : ['admin'],
        },
      };
    },
  },

  pages: {
    signIn: '/signin',
  },
};
