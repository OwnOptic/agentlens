/**
 * Configuration, read from the environment.
 *
 * Nothing tenant-specific is ever committed. See .env.example. In Azure the
 * Container App injects these, with the client secret as a Key Vault reference.
 */

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

function list(name: string): string[] {
  return (optional(name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  /** Transport: 'http' for Copilot (production), 'stdio' for local testing. */
  transport: (process.env.MCP_TRANSPORT ?? 'http') as 'http' | 'stdio',
  port: Number(process.env.PORT ?? 3000),

  /**
   * INBOUND auth (AgentLens-MCP). Validates the token Copilot presents.
   * With MCP_AUDIENCE unset the server is UNAUTHENTICATED - local development
   * only. See src/lib/auth.ts.
   */
  auth: {
    tenantId: optional('MCP_TENANT_ID'),
    /** Expected audience: api://<mcp-app-id> or the SSO Application ID URI. */
    audience: optional('MCP_AUDIENCE'),
    /**
     * Microsoft Enterprise token store - the only client Copilot presents.
     * https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso
     */
    allowedClientId: process.env.MCP_ALLOWED_CLIENT_ID ?? 'ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b',
  },

  /** OUTBOUND identity (AgentLens-Reader). Read-only against every source. */
  reader: {
    tenantId: optional('AZURE_TENANT_ID'),
    clientId: optional('AZURE_CLIENT_ID'),
    clientSecret: optional('AZURE_CLIENT_SECRET'),
    keyVaultUri: optional('KEY_VAULT_URI'),
    subscriptionId: optional('AZURE_SUBSCRIPTION_ID'),
    costScope: optional('AZURE_COST_SCOPE'),
  },

  /** Dataverse org URLs for aggregate usage. Comma separated. */
  dataverseOrgUrls: list('DATAVERSE_ORG_URLS'),

  /**
   * Pay-as-you-go billing policy, for per-agent message consumption.
   * Without it there is no per-agent cost - the endpoint is addressed by
   * billing policy, and prepaid capacity tenants have none.
   */
  ppacBillingPolicyId: optional('PPAC_BILLING_POLICY_ID'),

  /** True when message rates were supplied rather than defaulted to list price. */
  ratesConfigured: Boolean(optional('COPILOT_RATE_STANDARD') || optional('COPILOT_RATE_PREMIUM')),

  /** Optional Azure AI Foundry project, for the Foundry store in the sweep. */
  foundryProjectEndpoint: optional('FOUNDRY_PROJECT_ENDPOINT'),
} as const;

/**
 * True when the reader service principal is configured.
 * The secret may come from Key Vault instead of the environment, so a
 * configured vault counts.
 */
export function readerConfigured(): boolean {
  return Boolean(
    config.reader.tenantId &&
      config.reader.clientId &&
      (config.reader.clientSecret || config.reader.keyVaultUri),
  );
}

/** True when inbound token validation is enabled. */
export function authEnabled(): boolean {
  return Boolean(config.auth.audience && config.auth.tenantId);
}
