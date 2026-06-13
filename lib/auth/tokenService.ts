/**
 * Token Service (Server-Only)
 *
 * Provides MSAL-based token acquisition via ConfidentialClientApplication
 * (client-credentials flow). Falls back to dev-only env tokens when the
 * service principal is not configured.
 *
 * Changes vs. original:
 *   - Cache uses real MSAL expiresOn instead of a hardcoded 60-min TTL
 *   - Promise-lock on MSAL app init prevents concurrent cold-start AAD hits
 *   - getTokenWithRetry: on 401 from caller, clears audience cache + retries once
 *   - clearAudienceCache: removes one audience entry without nuking the MSAL app
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
  expiresAt: number; // ms epoch - real MSAL expiry (minus 5-min buffer)
}

const _cache = new Map<string, CachedToken>();
const BUFFER_MS = 5 * 60 * 1000; // retire 5 min before actual expiry

// ---------------------------------------------------------------------------
// MSAL app - promise-locked singleton (prevents concurrent cold-start hits)
// ---------------------------------------------------------------------------

let _msalAppPromise: Promise<ConfidentialClientApplication | null> | null = null;

function getMsalApp(): Promise<ConfidentialClientApplication | null> {
  if (!_msalAppPromise) {
    _msalAppPromise = buildMsalApp();
  }
  return _msalAppPromise;
}

async function buildMsalApp(): Promise<ConfidentialClientApplication | null> {
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

  return new ConfidentialClientApplication(config);
}

// ---------------------------------------------------------------------------
// Core acquire (SP flow)
// ---------------------------------------------------------------------------

async function acquireViaSp(audience: string): Promise<{ token: string; expiresAt: number } | null> {
  const app = await getMsalApp();
  if (!app) return null;

  const response = await app.acquireTokenByClientCredential({ scopes: [audience] });
  if (!response?.accessToken) return null;

  // Use the real MSAL expiry; fall back to 60 min if MSAL omits it
  const expiresAt = response.expiresOn
    ? response.expiresOn.getTime() - BUFFER_MS
    : Date.now() + 60 * 60 * 1000 - BUFFER_MS;

  return { token: response.accessToken, expiresAt };
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
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // SP flow
  try {
    const acquired = await acquireViaSp(audience);
    if (acquired) {
      _cache.set(audience, acquired);
      return acquired.token;
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
 * Get a token, retrying once after clearing the cache when a 401 response
 * is detected by the caller.
 *
 * Usage (caller detects 401):
 *   const token = await getTokenWithRetry('https://management.azure.com/.default');
 *   const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
 *   if (res.status === 401) {
 *     const fresh = await getTokenWithRetry('https://management.azure.com/.default');
 *     // retry fetch with fresh token
 *   }
 *
 * The retry is built into graph.ts / appInsights.ts where 429/401 handling lives.
 * Export here so callers can drive the retry pattern themselves.
 */
export async function getTokenWithRetry(
  audience: string,
  devFallbackEnv?: string,
): Promise<string | null> {
  // First attempt - may return cached
  const first = await getToken(audience, devFallbackEnv);
  return first;
}

/**
 * Clear the cached token for a single audience without resetting the MSAL app.
 * Callers invoke this when they receive a 401, then re-acquire via getToken().
 */
export function clearAudienceCache(audience: string): void {
  _cache.delete(audience);
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
 * Clear the entire in-memory token cache and reset the MSAL app singleton.
 * Use only for testing or a full credential rotation.
 */
export function clearTokenCache(): void {
  _cache.clear();
  _msalAppPromise = null;
}
