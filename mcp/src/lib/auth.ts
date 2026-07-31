/**
 * Inbound token validation (Microsoft Entra SSO).
 *
 * Microsoft's flow, Step 4: "Update your MCP server or API to allow the new
 * identifier URI as the token audience. If your MCP server or API validates the
 * client application ID, make sure that the Microsoft Enterprise token store's
 * client ID (ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b) is added as an allowed
 * client application."
 * https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso
 *
 * STATUS: implemented for the standard case. Review before production.
 *
 * If the server later uses the on-behalf-of flow to reach another API that needs
 * user consent, return 401 so the agent prompts the user to sign in.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config, authEnabled } from './config.js';

export interface CallerIdentity {
  /** Object ID of the signed-in user, when the token carries one. */
  oid?: string;
  /** UPN or preferred_username, for audit logging. Never used for data scoping. */
  upn?: string;
  /** azp / appid - the calling client. Expected to be the Enterprise token store. */
  clientId?: string;
  tenantId?: string;
  raw: JWTPayload;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
  if (!jwks) {
    const tenantId = config.auth.tenantId;
    if (!tenantId) throw new Error('MCP_TENANT_ID is required to validate tokens');
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
  }
  return jwks;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Validate an inbound bearer token.
 *
 * Returns null when auth is disabled (local development). In that mode the
 * server is UNAUTHENTICATED - never expose it publicly.
 */
export async function validateBearer(authorizationHeader: string | undefined): Promise<CallerIdentity | null> {
  if (!authEnabled()) {
    // Development mode. The agent package ships auth: { type: "None" } to match.
    return null;
  }

  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing bearer token');
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();

  const audience = config.auth.audience!;
  const tenantId = config.auth.tenantId!;

  const { payload } = await jwtVerify(token, getJwks(), {
    audience,
    issuer: [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`,
    ],
  }).catch((err) => {
    throw new AuthError(`Token validation failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  // Verify the calling client is the Microsoft Enterprise token store.
  const clientId = (payload.azp ?? (payload as Record<string, unknown>).appid) as string | undefined;
  const allowed = config.auth.allowedClientId;
  if (allowed && clientId && clientId !== allowed) {
    throw new AuthError(`Unexpected calling client ${clientId}; expected ${allowed}`);
  }

  return {
    oid: payload.oid as string | undefined,
    upn: (payload.preferred_username ?? payload.upn) as string | undefined,
    clientId,
    tenantId: payload.tid as string | undefined,
    raw: payload,
  };
}
