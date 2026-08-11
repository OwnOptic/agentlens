/**
 * OUTBOUND identity - the AgentLens-Reader service principal.
 *
 * MSAL client-credentials flow, one token per audience, cached until five
 * minutes before the real expiry. Every acquisition returns null instead of
 * throwing so a connector can report "not connected" with a reason.
 *
 * This is the ONLY place credentials are handled. No tool reads them directly.
 */

import { ConfidentialClientApplication, type Configuration } from '@azure/msal-node';
import { getSecret } from './secrets.js';

interface CachedToken {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, CachedToken>();
const BUFFER_MS = 5 * 60 * 1000;

let msalAppPromise: Promise<ConfidentialClientApplication | null> | null = null;

async function buildMsalApp(): Promise<ConfidentialClientApplication | null> {
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  if (!clientId || !tenantId) return null;

  const clientSecret = await getSecret('AZURE-CLIENT-SECRET');
  if (!clientSecret) return null;

  const configuration: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  };

  return new ConfidentialClientApplication(configuration);
}

function getMsalApp(): Promise<ConfidentialClientApplication | null> {
  // Promise-locked singleton: concurrent cold starts hit Entra once, not N times.
  if (!msalAppPromise) msalAppPromise = buildMsalApp();
  return msalAppPromise;
}

/**
 * Acquire a token for one audience.
 * Returns null when the service principal is not configured or Entra refuses.
 */
export async function getToken(audience: string): Promise<string | null> {
  const cached = cache.get(audience);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  try {
    const app = await getMsalApp();
    if (!app) return null;

    const response = await app.acquireTokenByClientCredential({ scopes: [audience] });
    if (!response?.accessToken) return null;

    const expiresAt = response.expiresOn
      ? response.expiresOn.getTime() - BUFFER_MS
      : Date.now() + 60 * 60 * 1000 - BUFFER_MS;

    cache.set(audience, { token: response.accessToken, expiresAt });
    return response.accessToken;
  } catch {
    return null;
  }
}

/** Drop one cached audience, e.g. after a 401, without resetting the MSAL app. */
export function clearAudienceCache(audience: string): void {
  cache.delete(audience);
}

/** Azure Resource Manager: Resource Graph, Cost Management, BAP governance. */
export const ARM_SCOPE = 'https://management.azure.com/.default';
/** Microsoft Graph. */
export const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
/** Power Platform BAP admin API (environment list). */
export const POWERAPPS_SCOPE = 'https://service.powerapps.com/.default';
/** Microsoft Fabric / Power BI admin API. */
export const FABRIC_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';

export const getArmToken = () => getToken(ARM_SCOPE);
export const getGraphToken = () => getToken(GRAPH_SCOPE);

/** Dataverse tokens are per organisation: the audience is the org URL itself. */
export function getDataverseToken(orgUrl: string): Promise<string | null> {
  const normalized = orgUrl.endsWith('/') ? orgUrl.slice(0, -1) : orgUrl;
  return getToken(`${normalized}/.default`);
}

/** Testing / credential rotation only. */
export function clearTokenCache(): void {
  cache.clear();
  msalAppPromise = null;
}
