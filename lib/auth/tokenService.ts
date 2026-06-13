/**
 * Token Service (Server-Only)
 *
 * Provides MSAL-based token acquisition via ConfidentialClientApplication
 * (client-credentials flow). Falls back to dev-only env tokens when the
 * service principal is not configured.
 *
 * Per-audience in-memory cache with expiry + 401-retry-once at call sites.
 *
 * @server
 */

import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';
import { getSecret } from '@/lib/config/secrets';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  expiresAt: number;
}

const _cache = new Map<string, CachedToken>();
const BUFFER_MS = 5 * 60 * 1000; // retire 5 min before actual expiry

// ---------------------------------------------------------------------------
// MSAL app (lazy, singleton)
// ---------------------------------------------------------------------------

let _msalApp: ConfidentialClientApplication | null = null;

async function getMsalApp(): Promise<ConfidentialClientApplication | null> {
  if (_msalApp) return _msalApp;

  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  if (!clientId || !tenantId) return null;

  const clientSecret = await getSecret('AZURE-CLIENT-SECRET');
  if (!clientSecret) return null;

  const config: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  };

  _msalApp = new ConfidentialClientApplication(config);
  return _msalApp;
}

// ---------------------------------------------------------------------------
// Core acquire (SP flow)
// ---------------------------------------------------------------------------

async function acquireViaSp(audience: string): Promise<string | null> {
  const app = await getMsalApp();
  if (!app) return null;

  const response = await app.acquireTokenByClientCredential({ scopes: [audience] });
  return response?.accessToken ?? null;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Get a token for the specified audience.
 * Tries SP client-credentials first; falls back to the named dev env var.
 * Returns null (never throws) so callers can emit honest "not_connected" state.
 */
export async function getToken(
  audience: string,
  devFallbackEnv?: string,
): Promise<string | null> {
  const cached = _cache.get(audience);
  if (cached && cached.expiresAt > Date.now() + BUFFER_MS) {
    return cached.token;
  }

  // SP flow
  try {
    const spToken = await acquireViaSp(audience);
    if (spToken) {
      // MSAL returns expiresOn; default 60 min if absent
      _cache.set(audience, { token: spToken, expiresAt: Date.now() + 60 * 60 * 1000 });
      return spToken;
    }
  } catch {
    // SP flow failed - try dev fallback below
  }

  // Dev-only fallback
  if (devFallbackEnv) {
    const devToken = process.env[devFallbackEnv];
    if (devToken) return devToken;
  }

  return null;
}

/**
 * Convenience: ARM token for Azure Resource Graph / management plane.
 * SP if AZURE_CLIENT_ID is configured, else MVP_ARM_TOKEN (dev-only).
 */
export async function getArmToken(): Promise<string | null> {
  return getToken('https://management.azure.com/.default', 'MVP_ARM_TOKEN');
}

/**
 * Convenience: Microsoft Graph token.
 * SP if AZURE_CLIENT_ID is configured, else MVP_GRAPH_TOKEN (dev-only).
 */
export async function getGraphToken(): Promise<string | null> {
  return getToken('https://graph.microsoft.com/.default', 'MVP_GRAPH_TOKEN');
}

/**
 * Dataverse token for a specific org URL.
 * Derives audience as `{orgUrl}/.default` and always uses the SP flow
 * (no dev token for Dataverse - requires real creds).
 */
export async function getDataverseToken(orgUrl: string): Promise<string | null> {
  const normalized = orgUrl.endsWith('/') ? orgUrl.slice(0, -1) : orgUrl;
  const audience = `${normalized}/.default`;
  return getToken(audience);
}

/**
 * Clear the in-memory token cache.
 */
export function clearTokenCache(): void {
  _cache.clear();
  _msalApp = null;
}
